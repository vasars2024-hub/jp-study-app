/**
 * The learner's own voice, for the speaking features (docs/AI_AUDIT.md N18, N20):
 * a short microphone recording, decoded to 16 kHz mono PCM and transcribed by
 * the LOCAL Whisper pipeline (`whisperTranscribePcm.ts`). Nothing here sends
 * audio anywhere.
 *
 * Whisper is never downloaded from here. `whisperReadiness` says whether the
 * model the study language needs (the multilingual one for Chinese, since
 * kotoba-whisper is Japanese-only) is already on this computer; when it is not,
 * the surface shows `WhisperInstallPrompt`, whose button is the only thing that
 * starts a download.
 *
 * Loaded only by lazy panels.
 */
import type { StudyLang } from '../shared/studyLang';
import { speechSpanSeconds } from '../shared/shadowingScore';
import type { WhisperModelTier } from '../shared/whisperModels';

export const SPEECH_SAMPLE_RATE = 16_000;
/** The longest recording the speaking features take. */
export const SPEECH_MAX_MS = 60_000;

export interface WhisperReadiness {
  ready: boolean;
  /** The tier a transcript in this language would run (and the one to install). */
  tier: WhisperModelTier;
  sizeBytes: number;
}

/** Whether the Whisper model for `lang` is installed. Reads the local record only. */
export async function whisperReadiness(lang: StudyLang): Promise<WhisperReadiness> {
  const [{ loadWhisperDevice, whisperTierPlan }, { isDownloadedIn, loadDownloaded }, { whisperSpec }] = await Promise.all([
    import('./whisperSettings'),
    import('./whisperModelCache'),
    import('../shared/whisperModels'),
  ]);
  const device = loadWhisperDevice();
  const downloaded = loadDownloaded();
  const plan = whisperTierPlan(lang, (tier) => isDownloadedIn(downloaded, tier, device));
  return { ready: isDownloadedIn(downloaded, plan.tier, device), tier: plan.tier, sizeBytes: whisperSpec(plan.tier).sizeBytes };
}

export interface DecodedSpeech {
  pcm: Float32Array;
  /** The whole recording, seconds. */
  durationSec: number;
  /** From the first to the last stretch of voice, seconds (null when silent). */
  spokenSec: number | null;
}

type AudioContextCtor = new () => { decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>; close(): Promise<void> };
type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

/** A MediaRecorder blob (webm/ogg) as 16 kHz mono PCM. */
export async function decodeRecording(blob: Blob): Promise<DecodedSpeech> {
  const Ctx = (window as unknown as { AudioContext?: AudioContextCtor }).AudioContext;
  const Offline = (window as unknown as { OfflineAudioContext?: OfflineCtor }).OfflineAudioContext;
  if (!Ctx || !Offline) throw new Error('audio-decode-unavailable');
  const context = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void context.close().catch(() => undefined);
  }
  const length = Math.max(1, Math.ceil(decoded.duration * SPEECH_SAMPLE_RATE));
  const offline = new Offline(1, length, SPEECH_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const pcm = new Float32Array(rendered.getChannelData(0));
  return { pcm, durationSec: decoded.duration, spokenSec: speechSpanSeconds(pcm, SPEECH_SAMPLE_RATE) };
}

export type SpeechTranscript =
  | {
    ok: true;
    text: string;
    durationSec: number;
    spokenSec: number | null;
    /** The decoded take (16 kHz mono), for the on-device pitch and rhythm check. Never sent anywhere. */
    pcm?: Float32Array;
    sampleRate?: number;
  }
  | { ok: false; reason: 'not-installed' | 'cancelled' | 'decode-failed' | 'failed' | 'empty' };

/**
 * Transcribes a recording with the installed Whisper model. Refuses (rather than
 * downloading) when the model is not installed.
 */
export async function transcribeRecording(blob: Blob, lang: StudyLang, signal?: AbortSignal): Promise<SpeechTranscript> {
  const readiness = await whisperReadiness(lang);
  if (!readiness.ready) return { ok: false, reason: 'not-installed' };
  if (signal?.aborted) return { ok: false, reason: 'cancelled' };
  let speech: DecodedSpeech;
  try {
    speech = await decodeRecording(blob);
  } catch {
    return { ok: false, reason: 'decode-failed' };
  }
  if (signal?.aborted) return { ok: false, reason: 'cancelled' };
  const { transcribePcm } = await import('./whisperTranscribePcm');
  const result = await transcribePcm(speech.pcm, lang, signal ? { signal } : {});
  if (!result.ok) return { ok: false, reason: result.error === 'cancelled' ? 'cancelled' : 'failed' };
  const text = (result.text ?? '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  return { ok: true, text, durationSec: speech.durationSec, spokenSec: speech.spokenSec, pcm: speech.pcm, sampleRate: SPEECH_SAMPLE_RATE };
}

export interface MicRecording {
  /** Stops and resolves with the recording (null when nothing was captured). */
  stop(): Promise<Blob | null>;
  /** Stops and throws the recording away. */
  cancel(): void;
}

/**
 * Starts a microphone recording (echo cancellation and noise suppression on),
 * stopped automatically after `maxMs`. Throws `mic-unsupported` where there is
 * no MediaRecorder; the browser's own permission decides the rest.
 */
export async function startMicRecording(maxMs = SPEECH_MAX_MS, onAutoStop?: (blob: Blob | null) => void): Promise<MicRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('mic-unsupported');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    // The microphone is already open: never leave it (and the OS mic indicator) on.
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
  const chunks: Blob[] = [];
  let discard = false;
  let resolveStop: ((blob: Blob | null) => void) | null = null;
  const stopped = new Promise<Blob | null>((resolve) => {
    resolveStop = resolve;
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    window.clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    const blob = !discard && chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null;
    resolveStop?.(blob);
  };
  try {
    recorder.start(250);
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
  const timer = window.setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
      void stopped.then((blob) => onAutoStop?.(blob));
    }
  }, maxMs);
  return {
    stop() {
      if (recorder.state === 'recording') recorder.stop();
      return stopped;
    },
    cancel() {
      discard = true;
      if (recorder.state === 'recording') recorder.stop();
      else for (const track of stream.getTracks()) track.stop();
    },
  };
}
