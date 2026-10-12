/**
 * Run one slice of PCM through the installed Whisper model.
 *
 * Whisper lives in a renderer worker, so anything in the main process that wants
 * a transcript has to ask the renderer for it. Two callers now do: the Chrome
 * extension bridge, and the transcription queue. Extracted here so both take the
 * same path — model tier, device preference and language resolution included.
 */

import { isStudyLang, type StudyLang } from '../shared/studyLang';
import { WHISPER_MULTILINGUAL_REQUIRED } from '../shared/whisperModels';

export interface PcmTranscription {
  ok: boolean;
  text?: string;
  cues?: Array<{ start: number; end: number; text: string }>;
  error?: string;
  /**
   * Set when the worker ran a DIFFERENT model than the tier asked for — see
   * `TranscriptionChunkResult.modelSubstitution`, whose shape this is, because
   * App.tsx forwards this object to the main process with `{ id, ...result }`.
   */
  modelSubstitution?: { requested: string; used: string };
}

/** Decodes the base64 the main process sends over the bridge. */
export function decodePcmBase64(pcmBase64: string): Float32Array {
  const raw = atob(pcmBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export interface TranscribePcmOptions {
  /** Aborting terminates the worker at once and resolves `{ ok: false, error: 'cancelled' }`. */
  signal?: AbortSignal;
  /** The model is being fetched or loaded; `percent` is null when sizes are unknown. */
  onModelLoading?: (percent: number | null) => void;
  /** The model is loaded; transcription starts now. */
  onModelReady?: () => void;
}

/**
 * Aggregates Transformers.js `progress_callback` events (one per model file)
 * into one percent: bytes loaded over bytes known. Null until a size is known.
 */
export function createModelProgressTracker(): (message: { file?: unknown; loaded?: unknown; total?: unknown; status?: unknown }) => number | null {
  const files = new Map<string, { loaded: number; total: number }>();
  return (message) => {
    const file = typeof message.file === 'string' ? message.file : '';
    const total = Number(message.total);
    const loaded = Number(message.loaded);
    if (file && Number.isFinite(total) && total > 0) {
      files.set(file, { total, loaded: Number.isFinite(loaded) ? Math.min(total, Math.max(0, loaded)) : 0 });
    } else if (file && message.status === 'done' && files.has(file)) {
      const entry = files.get(file)!;
      files.set(file, { total: entry.total, loaded: entry.total });
    }
    let sumTotal = 0;
    let sumLoaded = 0;
    for (const entry of files.values()) {
      sumTotal += entry.total;
      sumLoaded += entry.loaded;
    }
    return sumTotal > 0 ? Math.round((sumLoaded / sumTotal) * 100) : null;
  };
}

/**
 * Transcribes 16 kHz mono float32 PCM.
 *
 * A fresh worker per call: model load is cached by the browser, and a persistent
 * worker would hold the model in memory for the whole session even when nobody is
 * transcribing.
 */
export async function transcribePcm(
  audio: Float32Array,
  lang?: string,
  options: TranscribePcmOptions = {},
): Promise<PcmTranscription> {
  if (!audio.length) return { ok: false, error: 'Empty audio PCM' };
  if (options.signal?.aborted) return { ok: false, error: 'cancelled' };

  const { loadWhisperDevice, whisperTierPlan, whisperHfId } = await import('./whisperSettings');
  const { isDownloadedIn, loadDownloaded } = await import('./whisperModelCache');
  const { getStudyLang } = await import('./studyEnvironment');
  // Model tiers exist only for the study languages; anything else falls back
  // to the study language rather than asking for a tier that has no model behind it.
  const resolved: StudyLang = isStudyLang(lang) ? lang : getStudyLang();
  const device = loadWhisperDevice();
  const downloaded = loadDownloaded();
  const plan = whisperTierPlan(resolved, (tier) => isDownloadedIn(downloaded, tier, device));
  // The picked model cannot transcribe this language (kotoba-whisper is
  // Japanese-only). A multilingual one stands in when it is installed; when none
  // is, say so rather than download one inside a chunk or feed Chinese audio to
  // a Japanese model.
  const languageSwap = plan.tier !== plan.picked;
  if (languageSwap && !isDownloadedIn(downloaded, plan.tier, device)) {
    return { ok: false, error: WHISPER_MULTILINGUAL_REQUIRED };
  }

  return new Promise<PcmTranscription>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : 'Whisper worker failed to start' });
      return;
    }

    const chunks: string[] = [];
    const cues: Array<{ start: number; end: number; text: string }> = [];
    let settled = false;
    // Set only by the worker's own `model-fallback` status. Carried onto BOTH
    // endings: a substituted model that then errors is exactly the case where
    // knowing which graph ran matters most.
    // A language swap is a substitution too: the track must name the model that ran.
    let modelSubstitution: PcmTranscription['modelSubstitution'] = languageSwap
      ? { requested: whisperHfId(plan.picked), used: whisperHfId(plan.tier) }
      : undefined;
    const onAbort = (): void => finish({ ok: false, error: 'cancelled' });
    const finish = (result: PcmTranscription): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      resolve(modelSubstitution ? { ...result, modelSubstitution } : result);
    };
    // Cancel really stops the work: the worker (and the model inside it) goes.
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const modelProgress = createModelProgressTracker();
    let modelReady = false;

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        status?: string;
        model?: string;
        requestedModel?: string;
        cues?: Array<{ start?: number; end?: number; text?: string }>;
        message?: string;
        file?: string;
        loaded?: number;
        total?: number;
      };
      if (message.type === 'progress') {
        if (!modelReady) options.onModelLoading?.(modelProgress(message));
        return;
      }
      if (message.type === 'status' && message.status === 'transcribing') {
        if (!modelReady) {
          modelReady = true;
          options.onModelReady?.();
        }
        return;
      }
      if (
        message.type === 'status'
        && message.status === 'model-fallback'
        && typeof message.requestedModel === 'string'
        && typeof message.model === 'string'
      ) {
        modelSubstitution = { requested: modelSubstitution?.requested ?? message.requestedModel, used: message.model };
        return;
      }
      if (message.type === 'partial' && Array.isArray(message.cues)) {
        for (const cue of message.cues) {
          const text = cue?.text?.trim();
          if (!text) continue;
          chunks.push(text);
          if (
            typeof cue.start === 'number'
            && Number.isFinite(cue.start)
            && typeof cue.end === 'number'
            && Number.isFinite(cue.end)
            && cue.end > cue.start
          ) {
            cues.push({ start: cue.start, end: cue.end, text });
          }
        }
      } else if (message.type === 'done') {
        finish({ ok: true, text: chunks.join(' ').trim(), cues });
      } else if (message.type === 'error') {
        finish({ ok: false, error: message.message || 'Whisper error' });
      }
    };
    worker.onerror = (error) => finish({ ok: false, error: error.message || 'Whisper worker failed' });

    worker.postMessage(
      {
        audio,
        model: whisperHfId(plan.tier),
        prefer: device,
        lang: resolved,
      },
      // Transferred, not copied — a 30-second slice is ~2 MB.
      [audio.buffer],
    );
  });
}
