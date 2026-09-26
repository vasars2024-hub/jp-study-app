/**
 * The hidden system-audio capture window (`?audioCapture=1`).
 *
 * Main opens this window when the user turns capture on and destroys it when
 * they turn it off (`main/systemAudioCapture.ts`). It asks for a display-media
 * stream — main grants the primary screen with Windows loopback audio — stops
 * the video track on arrival, and keeps only the audio, mixed to mono, in a
 * rolling in-memory ring (`shared/systemAudioRing.ts`). Nothing here writes to
 * disk: a cut goes back to main as WAV bytes, and main keeps it in memory
 * until the user adds the card.
 *
 * The command handling is `CaptureHostCore`, free of media APIs, so the cut /
 * record / transcribe contract with main is tested in jsdom.
 */
import {
  CAPTURE_SAMPLE_RATE,
  PcmRecorder,
  PcmRing,
  bytesToBase64,
  clampCaptureSeconds,
  downmix,
  encodeWav,
  floatToInt16,
  isSilent,
  levelStats,
  resampleLinear,
  type PcmSlice,
} from '../../shared/systemAudioRing';
import { EnergySegmenter } from '../../shared/captionsOverlay';
import { isStudyLang, type StudyLang } from '../../shared/studyLang';

export interface HostCommand {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface HostDeps {
  /** Whisper for one slice (16 kHz float). */
  transcribe: (audio: Float32Array, lang: StudyLang) => Promise<{ ok: boolean; text?: string; error?: string }>;
  /** A Whisper model for `lang` is downloaded for the current device. */
  modelInstalled: (lang: StudyLang) => boolean;
  now?: () => number;
}

/** Cuts kept for a later transcription request; old ones are dropped. */
const SLICE_KEEP = 6;

export class CaptureHostCore {
  ring: PcmRing;
  private recorder: PcmRecorder | null = null;
  private readonly slices = new Map<string, PcmSlice>();
  private seq = 0;

  constructor(
    private readonly deps: HostDeps,
    sampleRate: number = CAPTURE_SAMPLE_RATE,
    seconds = 60,
  ) {
    this.ring = new PcmRing(sampleRate, clampCaptureSeconds(seconds));
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /** One processed audio block, already mono. */
  write(mono: Float32Array | Int16Array, endWallMs: number = this.now()): void {
    this.ring.write(mono, endWallMs);
    // Past the cap the recorder just stops taking audio; main's timer ends it.
    this.recorder?.write(mono, endWallMs);
  }

  get recording(): boolean {
    return this.recorder !== null;
  }

  private keep(slice: PcmSlice): string {
    const id = `s${(this.seq += 1)}`;
    this.slices.set(id, slice);
    while (this.slices.size > SLICE_KEEP) {
      const oldest = this.slices.keys().next().value as string;
      this.slices.delete(oldest);
    }
    return id;
  }

  private describe(slice: PcmSlice | null): Record<string, unknown> {
    if (!slice || !slice.samples.length) return { ok: false, error: 'empty' };
    const stats = levelStats(slice.samples);
    const sliceId = this.keep(slice);
    return {
      ok: true,
      sliceId,
      wavBase64: bytesToBase64(encodeWav(slice.samples, slice.sampleRate)),
      startMs: slice.startMs,
      endMs: slice.endMs,
      durationMs: (slice.samples.length / slice.sampleRate) * 1000,
      rms: stats.rms,
      peak: stats.peak,
      silent: isSilent(stats),
    };
  }

  async handle(command: HostCommand): Promise<Record<string, unknown>> {
    switch (command.type) {
      case 'cut': {
        if (command.mode === 'range') {
          return this.describe(this.ring.sliceWall(Number(command.startMs), Number(command.endMs)));
        }
        return this.describe(this.ring.sliceLast(Number(command.seconds) || 8));
      }
      case 'record-start':
        this.recorder = new PcmRecorder(this.now(), this.ring.sampleRate);
        return { ok: true };
      case 'record-stop': {
        const recorder = this.recorder;
        this.recorder = null;
        if (!recorder) return { ok: false, error: 'not-recording' };
        return this.describe(recorder.finish());
      }
      case 'transcribe': {
        const slice = this.slices.get(String(command.sliceId));
        if (!slice) return { ok: false, error: 'slice-gone' };
        const lang: StudyLang = isStudyLang(command.lang) ? command.lang : 'ja';
        if (!this.deps.modelInstalled(lang)) return { ok: false, modelMissing: true };
        try {
          const result = await this.deps.transcribe(resampleLinear(slice.samples, slice.sampleRate), lang);
          return { ok: result.ok, text: result.text ?? '', error: result.error };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        } finally {
          this.slices.delete(String(command.sliceId));
        }
      }
      case 'configure':
        if (command.seconds !== undefined) this.ring.resize(clampCaptureSeconds(command.seconds));
        return { ok: true };
      default:
        return { ok: false, error: `unknown command ${command.type}` };
    }
  }

  /** Drop every sample held (capture going off). */
  clear(): void {
    this.ring.clear();
    this.recorder = null;
    this.slices.clear();
  }
}

/* ------------------------------------------------------------------ *
 * Gum captions: near-real-time Whisper over the loopback stream.
 * ------------------------------------------------------------------ */

/**
 * One Whisper worker kept for the session (the model loads once), fed one
 * utterance at a time. A backlog is dropped from the front — captions that
 * arrive a minute late are worse than a skipped phrase.
 */
class LiveWhisper {
  private worker: Worker | null = null;
  private busy = false;
  private queue: Array<{ samples: Int16Array; rate: number; startMs: number; endMs: number }> = [];
  private readonly segmenter: EnergySegmenter;

  constructor(
    private readonly rate: number,
    private lang: StudyLang,
    private readonly model: string,
    private readonly prefer: 'auto' | 'cpu',
  ) {
    this.segmenter = new EnergySegmenter({ sampleRate: rate });
  }

  push(mono: Float32Array, endWallMs: number): void {
    for (const u of this.segmenter.push(floatToInt16(mono), endWallMs)) {
      this.queue.push({ samples: u.samples, rate: this.rate, startMs: u.startMs, endMs: u.endMs });
      if (this.queue.length > 3) this.queue.shift();
    }
    void this.pump();
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../whisperWorker.ts', import.meta.url), { type: 'module' });
    }
    return this.worker;
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    try {
      const text = await this.run(resampleLinear(next.samples, next.rate));
      if (text) window.api.captionsHostUtterance({ text, startMs: next.startMs, endMs: next.endMs });
    } catch {
      /* one failed phrase is skipped */
    } finally {
      this.busy = false;
      if (this.queue.length) void this.pump();
    }
  }

  private run(audio: Float32Array): Promise<string> {
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      const parts: string[] = [];
      const onMessage = (event: MessageEvent): void => {
        const m = event.data as { type?: string; cues?: Array<{ text?: string }>; message?: string };
        if (m.type === 'partial' && Array.isArray(m.cues)) {
          for (const cue of m.cues) if (cue?.text?.trim()) parts.push(cue.text.trim());
        } else if (m.type === 'done') {
          worker.removeEventListener('message', onMessage);
          resolve(parts.join(' ').trim());
        } else if (m.type === 'error') {
          worker.removeEventListener('message', onMessage);
          reject(new Error(m.message || 'whisper'));
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ audio, model: this.model, prefer: this.prefer, lang: this.lang }, [audio.buffer]);
    });
  }

  stop(): void {
    this.queue = [];
    this.worker?.terminate();
    this.worker = null;
  }
}

/* ------------------------------------------------------------------ *
 * The window itself.
 * ------------------------------------------------------------------ */

interface StartConfig {
  seconds?: number;
  gum?: boolean;
  lang?: string;
}

declare global {
  interface Window {
    __gumCaptureStart?: (config: StartConfig) => Promise<{ ok: boolean; error?: string }>;
  }
}

async function whisperHelpers(): Promise<{
  modelInstalled: (lang: StudyLang) => boolean;
  modelFor: (lang: StudyLang) => { model: string; prefer: 'auto' | 'cpu' };
}> {
  const [{ isDownloadedIn, loadDownloaded }, { loadWhisperDevice, loadWhisperModelTier, whisperHfId }] = await Promise.all([
    import('../whisperModelCache'),
    import('../whisperSettings'),
  ]);
  return {
    modelInstalled: (lang) => isDownloadedIn(loadDownloaded(), loadWhisperModelTier(lang), loadWhisperDevice()),
    modelFor: (lang) => ({ model: whisperHfId(loadWhisperModelTier(lang)), prefer: loadWhisperDevice() }),
  };
}

export function installSystemAudioCaptureHost(): void {
  let core: CaptureHostCore | null = null;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let live: LiveWhisper | null = null;
  let statusTimer: number | null = null;
  let helpers: Awaited<ReturnType<typeof whisperHelpers>> | null = null;

  let gumKey = '';
  const setGum = (on: boolean, langRaw: unknown): void => {
    const lang: StudyLang = isStudyLang(langRaw) ? langRaw : 'ja';
    const key = on ? lang : '';
    // Unchanged: keep the worker (and its loaded model).
    if (key === gumKey && (live || !on)) return;
    gumKey = key;
    live?.stop();
    live = null;
    if (!on || !core || !helpers) {
      window.api.captionsHostStatus({ gumModelMissing: false });
      return;
    }
    if (!helpers.modelInstalled(lang)) {
      window.api.captionsHostStatus({ gumModelMissing: true });
      return;
    }
    const { model, prefer } = helpers.modelFor(lang);
    live = new LiveWhisper(core.ring.sampleRate, lang, model, prefer);
    window.api.captionsHostStatus({ gumModelMissing: false });
  };

  const stopAll = (): void => {
    live?.stop();
    live = null;
    gumKey = '';
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    void ctx?.close().catch(() => undefined);
    ctx = null;
    core?.clear();
    if (statusTimer !== null) window.clearInterval(statusTimer);
    statusTimer = null;
  };

  window.__gumCaptureStart = async (config: StartConfig) => {
    try {
      helpers = await whisperHelpers();
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      // Only the sound is wanted; the screen picture is dropped at once.
      for (const track of media.getVideoTracks()) {
        track.stop();
        media.removeTrack(track);
      }
      if (!media.getAudioTracks().length) {
        for (const track of media.getTracks()) track.stop();
        return { ok: false, error: 'no-audio-track' };
      }
      stream = media;
      let context: AudioContext;
      try {
        context = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
      } catch {
        context = new AudioContext();
      }
      ctx = context;
      const source = context.createMediaStreamSource(media);
      // ScriptProcessor, not an AudioWorklet: a worklet module would need a
      // script URL the packaged CSP (script-src 'self') does not serve as a blob.
      const processor = context.createScriptProcessor(4096, 2, 1);
      const hostDeps: HostDeps = {
        modelInstalled: (lang) => helpers?.modelInstalled(lang) ?? false,
        transcribe: async (audio, lang) => {
          const { transcribePcm } = await import('../whisperTranscribePcm');
          return transcribePcm(audio, lang);
        },
      };
      core = new CaptureHostCore(hostDeps, context.sampleRate, Number(config.seconds) || 60);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer;
        const channels: Float32Array[] = [];
        for (let c = 0; c < input.numberOfChannels; c += 1) channels.push(input.getChannelData(c));
        const mono = downmix(channels);
        const now = Date.now();
        core?.write(mono, now);
        live?.push(mono, now);
      };
      source.connect(processor);
      // The processor only runs when pulled by the destination; it writes nothing, so nothing is heard.
      processor.connect(context.destination);
      await context.resume();
      statusTimer = window.setInterval(() => {
        if (core) window.api.captionsHostStatus({ bufferedMs: Math.round(core.ring.durationMs) });
      }, 1000);
      setGum(Boolean(config.gum), config.lang);
      media.getAudioTracks()[0]?.addEventListener('ended', () => stopAll());
      return { ok: true };
    } catch (err) {
      stopAll();
      return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
  };

  window.api.onCaptionsHostCommand((command) => {
    void (async () => {
      if (command.type === 'stop') {
        stopAll();
        window.api.captionsHostReply({ id: command.id, ok: true });
        return;
      }
      if (!core) {
        window.api.captionsHostReply({ id: command.id, ok: false, error: 'not-capturing' });
        return;
      }
      const reply = await core.handle(command);
      if (command.type === 'configure') setGum(Boolean(command.gum), command.lang);
      window.api.captionsHostReply({ id: command.id, ...reply });
    })();
  });

  window.addEventListener('beforeunload', stopAll);
}
