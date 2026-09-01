/**
 * Wire types for the Whisper transcription queue.
 *
 * The app already had transcription, but as a single fire-and-await RPC with a
 * 180-second timeout: no queue, no persistence, and no way to see or stop it. A
 * 24-minute episode does not fit in that shape, and a job that dies when you
 * navigate away is not a job. This contract is the persistent version.
 *
 * Phases are named for what the user would say is happening, not for the code
 * path — "extracting audio" rather than "ffmpeg", because the point of showing a
 * phase is that a long silence is explained.
 */

export type TranscriptionPhase =
  | 'queued'
  | 'preparing'
  | 'extracting-audio'
  | 'transcribing'
  | 'aligning'
  | 'done'
  | 'cancelled'
  | 'error';

export interface TranscriptionProgress {
  mediaId: string;
  title: string;
  phase: TranscriptionPhase;
  /** Chunks finished. */
  done: number;
  /** Chunks in total, or 0 before the audio has been measured. */
  total: number;
  /** Epoch ms the job started, so a surface can show elapsed time. */
  startedAt: number;
  etaMs?: number;
  error?: string;
  /** The card work this transcription will perform after the subtitle is written. */
  cardOptions?: TranscriptionCardOptions;
  /**
   * Set from the first chunk onward when the WASM path substituted a model.
   *
   * `whisperTrackLabel` already records it on the finished track, but that
   * artifact only exists once the run ends — minutes later, and only if it ends
   * at all. A user watching a job they started under one model deserves to know
   * a different one is producing it WHILE it produces it, not afterwards, and
   * an errored run never writes a track to read at all.
   */
  modelSubstitution?: { requested: string; used: string };
}

export interface TranscriptionCardOptions {
  /** Create or replace the local Media deck batch after Japanese transcription. */
  createCards: boolean;
  /** Ask the available local translator for English backs. */
  translateToEnglish: boolean;
  /** Extract one managed ffmpeg clip per sentence. */
  includeAudio: boolean;
}

export const DEFAULT_TRANSCRIPTION_CARD_OPTIONS: TranscriptionCardOptions = {
  createCards: true,
  translateToEnglish: true,
  includeAudio: true,
};

export function normalizeTranscriptionCardOptions(
  value?: Partial<TranscriptionCardOptions> | null,
): TranscriptionCardOptions {
  return {
    createCards: value?.createCards !== false,
    translateToEnglish: value?.translateToEnglish !== false,
    includeAudio: value?.includeAudio !== false,
  };
}

/**
 * What a queued job actually does.
 *
 * Absent means `'transcribe'` — the original whole-file Whisper pass — so a queue
 * persisted by an older build restores unchanged. `'fuse-en-ja'` slices the audio
 * on an English track's own cue boundaries instead of a fixed grid; see
 * `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md`.
 */
export type TranscriptionKind = 'transcribe' | 'fuse-en-ja';

export interface TranscriptionJob {
  mediaId: string;
  title: string;
  /** Language to transcribe in; Whisper is told this rather than guessing. */
  lang: string;
  queuedAt: number;
  /** Attempts so far, so a permanently failing file is not retried forever. */
  attempts: number;
  /**
   * Consecutive drains that found no renderer to transcribe in.
   *
   * Counted separately from `attempts` because "no window" is not the file's
   * fault: a queue restored at boot legitimately waits for the renderer, and
   * spending the media's three real attempts on that would break the
   * resume-after-restart promise. Absent means zero, so an older persisted
   * queue restores unchanged.
   */
  noWindowAttempts?: number;
  kind?: TranscriptionKind;
  /** For `fuse-en-ja`: which subtitle record supplies the cue grid. */
  sourceSubtitleId?: string;
  /** Optional for backward-compatible restoration of queues written before cards existed. */
  cardOptions?: Partial<TranscriptionCardOptions>;
}

export interface TranscriptionRequest {
  mediaId: string;
  lang?: string;
  kind?: TranscriptionKind;
  /** For `fuse-en-ja`: pin the source track instead of letting the job pick. */
  sourceSubtitleId?: string;
  cardOptions?: Partial<TranscriptionCardOptions>;
}

/** Word/window-aligned cue returned by the local Whisper worker. */
export interface TranscriptionCue {
  start: number;
  end: number;
  text: string;
}

/**
 * How much the card's timestamps are actually worth.
 *
 * `cue-aligned` — the worker returned real cue windows and the sentence sits
 * inside them. `chunk-estimated` — it returned text only, so the job placed the
 * sentence proportionally inside its fixed `CHUNK_SECONDS` window. The second
 * kind is a usable study clip but it is NOT an alignment, and a surface that
 * prints its seconds as though it were is claiming precision nobody measured.
 */
export type TranscriptCardTiming = 'cue-aligned' | 'chunk-estimated';

/** Local-deck card emitted when a Japanese transcript finishes. */
export interface TranscriptionCardDraft {
  mediaId: string;
  title: string;
  sentence: string;
  translation: string;
  startSec: number;
  endSec: number;
  audioPath?: string;
  timing: TranscriptCardTiming;
}

export interface TranscriptionCardsReady {
  mediaId: string;
  title: string;
  batchId: string;
  cards: TranscriptionCardDraft[];
  /** The batch's worst case — `chunk-estimated` if any card is estimated. */
  timing: TranscriptCardTiming;
  cardOptions: TranscriptionCardOptions;
}

export interface TranscriptionResult {
  ok: boolean;
  mediaId?: string;
  /** Cue lines produced. */
  lines?: number;
  error?: string;
  /** ASR windows a `fuse-en-ja` job planned from the English cue grid. */
  windows?: number;
  /** Which English record supplied that grid. */
  sourceSubtitleId?: string;
  /** Seconds the English cues were shifted by before slicing; 0 when unshifted. */
  offsetSec?: number;
  /** False means the sync estimator declined and the cues were used as authored. */
  offsetConfident?: boolean;
  /** Cues left untranscribed, by reason — songs, signs, and empties. */
  excludedCues?: Record<string, number>;
}

export interface TranscriptionChunkResult {
  ok: boolean;
  text?: string;
  cues?: TranscriptionCue[];
  error?: string;
  /**
   * The model that actually ran, when it is NOT the one that was asked for.
   *
   * `whisperModelForCpu` substitutes `Xenova/whisper-base` for kotoba-whisper
   * and whisper-large-v3-turbo on the WASM path, because their fp32 encoders
   * carry external ONNX data the browser runtime cannot mount. That is the
   * right call — the alternative is a completed download that then fails to
   * transcribe — but it was SILENT: the worker posts a `model-fallback` status
   * and nothing listened to it, so a machine with no usable WebGPU adapter
   * produced whisper-base output while Settings still said kotoba-whisper.
   *
   * Absent means no substitution happened. It is never a guess: only the worker
   * knows which graph it actually loaded.
   */
  modelSubstitution?: { requested: string; used: string };
}

/**
 * The subtitle-track name a Whisper run writes onto the media row.
 *
 * When no substitution happened this is the label it has always been, so
 * existing rows and tests are unaffected. When one did, the name carries the
 * model that ACTUALLY produced the text — a track named only "Whisper (ja)" is
 * indistinguishable between a kotoba-whisper transcript and the markedly worse
 * whisper-base one the WASM path silently falls back to, and the user has no
 * other place to learn which they are reading.
 *
 * The bare HF repo name, not the tier id: the tier is what was *asked for*, and
 * printing it here would restate the lie. Model ids are not translated.
 */
export function whisperTrackLabel(
  lang: string,
  substitution?: { requested: string; used: string },
): string {
  const base = `Whisper (${lang})`;
  if (!substitution || substitution.used === substitution.requested) return base;
  const shortName = substitution.used.split('/').pop() || substitution.used;
  return `${base} · ${shortName}`;
}

/** A job is abandoned after this many failed attempts. */
export const MAX_TRANSCRIPTION_ATTEMPTS = 3;

/**
 * Consecutive no-renderer drains before a job is abandoned.
 *
 * At the drain loop's 15 s retry spacing this is ten minutes of waiting — far
 * longer than a cold boot needs, and short enough that a renderer which keeps
 * dying mid-job cannot pin the queue head for the rest of the session.
 */
export const MAX_NO_WINDOW_ATTEMPTS = 40;

/** Phases that mean the job is over. */
export const TERMINAL_TRANSCRIPTION_PHASES: TranscriptionPhase[] = ['done', 'cancelled', 'error'];

export function isTerminalTranscriptionPhase(phase: TranscriptionPhase): boolean {
  return TERMINAL_TRANSCRIPTION_PHASES.includes(phase);
}

export { MIN_SAMPLES_FOR_ETA, estimateEtaMs } from './jobEta';
