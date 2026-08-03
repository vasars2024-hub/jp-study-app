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
}

export interface TranscriptionJob {
  mediaId: string;
  title: string;
  /** Language to transcribe in; Whisper is told this rather than guessing. */
  lang: string;
  queuedAt: number;
  /** Attempts so far, so a permanently failing file is not retried forever. */
  attempts: number;
}

export interface TranscriptionRequest {
  mediaId: string;
  lang?: string;
}

export interface TranscriptionResult {
  ok: boolean;
  mediaId?: string;
  /** Cue lines produced. */
  lines?: number;
  error?: string;
}

/** A job is abandoned after this many failed attempts. */
export const MAX_TRANSCRIPTION_ATTEMPTS = 3;

/** Phases that mean the job is over. */
export const TERMINAL_TRANSCRIPTION_PHASES: TranscriptionPhase[] = ['done', 'cancelled', 'error'];

export function isTerminalTranscriptionPhase(phase: TranscriptionPhase): boolean {
  return TERMINAL_TRANSCRIPTION_PHASES.includes(phase);
}

export { MIN_SAMPLES_FOR_ETA, estimateEtaMs } from './jobEta';
