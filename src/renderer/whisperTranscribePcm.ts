/**
 * Run one slice of PCM through the installed Whisper model.
 *
 * Whisper lives in a renderer worker, so anything in the main process that wants
 * a transcript has to ask the renderer for it. Two callers now do: the Chrome
 * extension bridge, and the transcription queue. Extracted here so both take the
 * same path — model tier, device preference and language resolution included.
 */

import { isStudyLang, type StudyLang } from '../shared/studyLang';

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

/**
 * Transcribes 16 kHz mono float32 PCM.
 *
 * A fresh worker per call: model load is cached by the browser, and a persistent
 * worker would hold the model in memory for the whole session even when nobody is
 * transcribing.
 */
export async function transcribePcm(audio: Float32Array, lang?: string): Promise<PcmTranscription> {
  if (!audio.length) return { ok: false, error: 'Empty audio PCM' };

  const { loadWhisperDevice, loadWhisperModelTier, whisperHfId } = await import('./whisperSettings');
  const { getStudyLang } = await import('./studyEnvironment');
  // Model tiers exist only for the study languages; anything else falls back
  // to the study language rather than asking for a tier that has no model behind it.
  const resolved: StudyLang = isStudyLang(lang) ? lang : getStudyLang();

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
    let modelSubstitution: PcmTranscription['modelSubstitution'];
    const finish = (result: PcmTranscription): void => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(modelSubstitution ? { ...result, modelSubstitution } : result);
    };

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        status?: string;
        model?: string;
        requestedModel?: string;
        cues?: Array<{ start?: number; end?: number; text?: string }>;
        message?: string;
      };
      if (
        message.type === 'status'
        && message.status === 'model-fallback'
        && typeof message.requestedModel === 'string'
        && typeof message.model === 'string'
      ) {
        modelSubstitution = { requested: message.requestedModel, used: message.model };
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
        model: whisperHfId(loadWhisperModelTier(resolved)),
        prefer: loadWhisperDevice(),
        lang: resolved,
      },
      // Transferred, not copied — a 30-second slice is ~2 MB.
      [audio.buffer],
    );
  });
}
