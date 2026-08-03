/**
 * The persistent Whisper transcription queue.
 *
 * Three things make this different from the RPC it replaces:
 *
 *  - **It survives.** The queue is written to disk on every change and restored
 *    on boot, so closing the app mid-transcription resumes rather than loses it.
 *  - **It is chunked.** A 24-minute episode is transcribed in slices, which is
 *    what makes progress real instead of a spinner, and what stops the whole
 *    thing dying on one timeout.
 *  - **It is visible and stoppable.** Every phase broadcasts, and cancellation is
 *    checked between chunks.
 *
 * Whisper itself lives in a renderer worker, so the main process has to call
 * *outward*. That inversion uses the same UUID-correlation pattern as
 * `requestWhisperTranscribe` in `extensionServer.ts`.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  MAX_TRANSCRIPTION_ATTEMPTS,
  estimateEtaMs,
  type TranscriptionJob,
  type TranscriptionPhase,
  type TranscriptionProgress,
  type TranscriptionRequest,
  type TranscriptionResult,
} from '../shared/transcriptionIpc';
import type { SubtitleRecord } from '../shared/subtitleRecord';
import type { MediaItem } from '../shared/types';
import { extractAudioPcm } from './media';

export interface TranscriptionHost {
  listItems: () => MediaItem[];
  patchItems: (ids: readonly string[], patch: Partial<MediaItem>) => void;
}

let host: TranscriptionHost | null = null;

/** Seconds of audio per Whisper call. Long enough to keep context, short enough
 *  that one slice cannot exceed the reply timeout, and that progress moves. */
const CHUNK_SECONDS = 30;
const SAMPLE_RATE = 16_000;
/** Generous: a slow CPU model on a 30 s slice is still well inside this. */
const CHUNK_TIMEOUT_MS = 120_000;
/** One at a time — Whisper is already saturating the machine. */
const MAX_CONCURRENT = 1;

let queue: TranscriptionJob[] = [];
const cancelled = new Set<string>();
let active = 0;
let draining = false;
/** Pending re-attempt, so a stalled queue cannot stack timers. */
let retryTimer: NodeJS.Timeout | null = null;
const progressListeners = new Set<(progress: TranscriptionProgress) => void>();

/** How long to wait before looking for a window again. */
const NO_WINDOW_RETRY_MS = 15_000;

/**
 * Queue a drain attempt.
 *
 * Needed because the drain loop gives up when there is no renderer to run Whisper
 * in — and without a re-attempt that was permanent: a queue restored at boot before
 * the window was ready would sit untouched for the entire session, which is exactly
 * the "restore active jobs after restarting" promise not being kept.
 */
function scheduleDrain(delayMs: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drain();
  }, delayMs);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function queuePath(): string {
  return path.join(app.getPath('userData'), 'transcription-jobs.json');
}

function saveQueue(): void {
  try {
    fs.writeFileSync(queuePath(), JSON.stringify(queue), 'utf-8');
  } catch {
    /* a queue that cannot persist still runs for this session */
  }
}

function loadQueue(): TranscriptionJob[] {
  try {
    const raw = JSON.parse(fs.readFileSync(queuePath(), 'utf-8')) as TranscriptionJob[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((job): job is TranscriptionJob =>
      Boolean(job && typeof job.mediaId === 'string' && typeof job.title === 'string'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Renderer RPC
// ---------------------------------------------------------------------------

const pendingReplies = new Map<string, { resolve: (r: { ok: boolean; text?: string; error?: string }) => void; timer: NodeJS.Timeout }>();

/** Called by the renderer when a chunk comes back. */
export function resolveTranscriptionChunk(id: string, payload: { ok: boolean; text?: string; error?: string }): void {
  const pending = pendingReplies.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingReplies.delete(id);
  pending.resolve(payload);
}

function requestChunk(pcm: Float32Array, lang: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (!windows.length) {
    return Promise.resolve({ ok: false, error: 'no-window' });
  }
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingReplies.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, CHUNK_TIMEOUT_MS);
    pendingReplies.set(id, { resolve, timer });
    const buffer = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (const win of windows) {
      win.webContents.send('transcription:chunk-request', {
        id,
        lang,
        pcmBase64: buffer.toString('base64'),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function broadcast(progress: TranscriptionProgress): void {
  for (const listener of progressListeners) {
    try {
      listener(progress);
    } catch {
      // Progress observers are isolated from the transcription job itself.
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('transcription:progress', progress);
  }
}

// ---------------------------------------------------------------------------
// SRT assembly
// ---------------------------------------------------------------------------

function timestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(rest).padStart(3, '0')}`;
}

/**
 * Turns per-chunk text into SRT cues.
 *
 * Timing is chunk-granular rather than word-granular: Whisper is asked for text,
 * not alignment, so each chunk becomes one cue spanning its own window. That is
 * honest about the precision on offer — and why the record is labelled
 * machine-generated and left editable.
 */
export function chunksToSrt(chunks: readonly string[], chunkSeconds = CHUNK_SECONDS): string {
  const cues: string[] = [];
  let index = 1;
  chunks.forEach((text, i) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const start = i * chunkSeconds;
    const end = (i + 1) * chunkSeconds;
    cues.push(`${index}\n${timestamp(start)} --> ${timestamp(end)}\n${trimmed}\n`);
    index += 1;
  });
  return cues.join('\n');
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

async function runJob(job: TranscriptionJob): Promise<TranscriptionResult> {
  if (!host) return { ok: false, error: 'host-not-registered' };
  const item = host.listItems().find((entry) => entry.id === job.mediaId);
  if (!item) return { ok: false, error: 'item-not-found' };

  const startedAt = Date.now();
  let total = 0;
  const emit = (phase: TranscriptionPhase, done: number, extra: Partial<TranscriptionProgress> = {}): void =>
    broadcast({
      mediaId: job.mediaId,
      title: job.title,
      phase,
      done,
      total,
      startedAt,
      etaMs: estimateEtaMs(done, total, Date.now() - startedAt),
      ...extra,
    });

  try {
    emit('preparing', 0);
    if (cancelled.has(job.mediaId)) {
      emit('cancelled', 0);
      return { ok: false, error: 'cancelled' };
    }

    emit('extracting-audio', 0);
    const pcmBuffer = await extractAudioPcm(item.path);
    const samples = new Float32Array(pcmBuffer);
    const perChunk = CHUNK_SECONDS * SAMPLE_RATE;
    total = Math.max(1, Math.ceil(samples.length / perChunk));

    const texts: string[] = [];
    for (let i = 0; i < total; i += 1) {
      if (cancelled.has(job.mediaId)) {
        emit('cancelled', i);
        return { ok: false, error: 'cancelled' };
      }
      emit('transcribing', i);
      const slice = samples.subarray(i * perChunk, Math.min((i + 1) * perChunk, samples.length));
      // A trailing sliver of audio carries no words worth a round trip.
      if (slice.length < SAMPLE_RATE / 2) {
        texts.push('');
        continue;
      }
      const reply = await requestChunk(slice, job.lang);
      if (!reply.ok) {
        // `no-window` is not the file's fault — the job goes back to the queue
        // rather than counting as a failed attempt against this media.
        if (reply.error === 'no-window') throw new Error('no-window');
        texts.push('');
        continue;
      }
      texts.push(reply.text ?? '');
    }

    emit('aligning', total);
    const srt = chunksToSrt(texts);
    if (!srt.trim()) {
      emit('error', total, { error: 'empty' });
      return { ok: false, error: 'empty-transcript' };
    }

    const relativeDir = path.join('subtitles', job.mediaId.replace(/[^a-zA-Z0-9_-]/g, ''));
    const relative = path.join(relativeDir, `generated-${job.lang}.srt`);
    fs.mkdirSync(path.join(app.getPath('userData'), relativeDir), { recursive: true });
    fs.writeFileSync(path.join(app.getPath('userData'), relative), srt, 'utf-8');

    const record: SubtitleRecord = {
      id: crypto.randomUUID(),
      lang: job.lang,
      source: 'generated',
      format: 'srt',
      path: relative,
      label: `Whisper (${job.lang})`,
      machineGenerated: true,
      addedAt: Date.now(),
    };
    // Replaces any previous generated track for this language; keeps every
    // human-sourced one, which always outranks a transcript anyway.
    const kept = (item.subtitles ?? []).filter(
      (entry) => !(entry.source === 'generated' && entry.lang === job.lang),
    );
    host.patchItems([job.mediaId], {
      subtitles: [...kept, record],
      subtitlesCheckedAt: Date.now(),
    });

    emit('done', total);
    return { ok: true, mediaId: job.mediaId, lines: texts.filter((t) => t.trim()).length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'no-window') throw error; // requeue, do not count as a failure
    emit('error', 0, { error: message });
    return { ok: false, error: message };
  }
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0 && active < MAX_CONCURRENT) {
      const job = queue[0];
      if (cancelled.has(job.mediaId)) {
        queue.shift();
        cancelled.delete(job.mediaId);
        saveQueue();
        continue;
      }
      active += 1;
      try {
        const result = await runJob(job);
        queue.shift();
        if (!result.ok && result.error !== 'cancelled') {
          const attempts = job.attempts + 1;
          // A file that fails repeatedly is dropped rather than retried forever.
          if (attempts < MAX_TRANSCRIPTION_ATTEMPTS) queue.push({ ...job, attempts });
        }
      } catch {
        // No window to transcribe in. Keep the job queued and try again shortly:
        // the window usually arrives seconds later, and breaking without a retry
        // stalls the queue until something else happens to enqueue.
        scheduleDrain(NO_WINDOW_RETRY_MS);
        break;
      } finally {
        active -= 1;
        cancelled.delete(job.mediaId);
        saveQueue();
      }
    }
  } finally {
    draining = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function enqueueTranscription(request: TranscriptionRequest): TranscriptionResult {
  if (!host) return { ok: false, error: 'host-not-registered' };
  const item = host.listItems().find((entry) => entry.id === request.mediaId);
  if (!item) return { ok: false, error: 'item-not-found' };
  if (queue.some((job) => job.mediaId === request.mediaId)) {
    // Already queued: not an error, just nothing new to do.
    return { ok: true, mediaId: request.mediaId };
  }

  queue.push({
    mediaId: item.id,
    title: item.title?.trim() || item.fileName,
    lang: request.lang?.trim() || 'ja',
    queuedAt: Date.now(),
    attempts: 0,
  });
  saveQueue();
  broadcast({
    mediaId: item.id,
    title: item.title?.trim() || item.fileName,
    phase: 'queued',
    done: 0,
    total: 0,
    startedAt: Date.now(),
  });
  void drain();
  return { ok: true, mediaId: item.id };
}

export function onMainTranscriptionProgress(
  listener: (progress: TranscriptionProgress) => void,
): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function cancelTranscription(mediaId?: string): void {
  const targets = mediaId ? [mediaId] : queue.map((job) => job.mediaId);
  const queuedBeforeCancellation = [...queue];
  for (const id of targets) cancelled.add(id);

  // A job that has not started yet is simply dropped. The running one (always at
  // the head) is left in place so its loop can notice the flag and unwind
  // cleanly — yanking it here would leak the in-flight chunk request.
  const runningId = active > 0 ? queue[0]?.mediaId : undefined;
  queue = queue.filter((job, index) => {
    if (index === 0 && job.mediaId === runningId) return true;
    return !cancelled.has(job.mediaId);
  });
  const remainingIds = new Set(queue.map((job) => job.mediaId));
  const cancelledAt = Date.now();
  for (const job of queuedBeforeCancellation) {
    if (!targets.includes(job.mediaId) || remainingIds.has(job.mediaId)) continue;
    cancelled.delete(job.mediaId);
    broadcast({
      mediaId: job.mediaId,
      title: job.title,
      phase: 'cancelled',
      done: 0,
      total: 0,
      startedAt: cancelledAt,
    });
  }
  saveQueue();
  // Nothing left to come back for.
  if (queue.length === 0 && retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export function transcriptionQueue(): TranscriptionJob[] {
  return [...queue];
}

export function registerTranscriptionIpc(transcriptionHost: TranscriptionHost): void {
  host = transcriptionHost;
  queue = loadQueue();

  ipcMain.handle('transcription:enqueue', (_e, request: TranscriptionRequest) =>
    enqueueTranscription(request ?? { mediaId: '' }));
  ipcMain.handle('transcription:cancel', (_e, mediaId?: string) => {
    cancelTranscription(typeof mediaId === 'string' ? mediaId : undefined);
  });
  ipcMain.handle('transcription:queue', () => transcriptionQueue());
  ipcMain.on('transcription:chunk-reply', (_e, payload: { id: string; ok: boolean; text?: string; error?: string }) => {
    if (payload && typeof payload.id === 'string') resolveTranscriptionChunk(payload.id, payload);
  });

  // Anything left from a previous run picks up where it stopped. Delayed so the
  // renderer has a window open to transcribe in; if it is not ready yet, the
  // drain loop reschedules itself rather than giving up for the session.
  if (queue.length > 0) scheduleDrain(5_000);
}

export const __transcriptionTestables = {
  chunksToSrt,
  timestamp,
  hasPendingRetry: (): boolean => retryTimer !== null,
};
