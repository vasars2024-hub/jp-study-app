/**
 * Live view of the background jobs the media library starts.
 *
 * The metadata sweep, subtitle discovery, the transcription queue and yt-dlp
 * downloads all broadcast progress from the main process. Nothing was listening,
 * so a sweep that ran for a minute after an import was invisible — the "never
 * silently fail" problem. This collapses every channel into one list.
 *
 * The store is **module level, not per hook**. It was per-instance first, and that
 * was wrong in a way that mattered: two components consume this, so they each kept
 * their own job map and their own sweep interval. A drawer opened mid-sweep had
 * missed every earlier event, so it believed no transcription was running and the
 * Analyze Japanese gating went with it. One store, one subscription, one timer.
 *
 * Finished jobs linger briefly rather than vanishing: a row that disappears the
 * instant it completes never gets read, and "done" is information too.
 */

import { useSyncExternalStore } from 'react';
import type { MediaMetadataProgress } from '../../../../shared/mediaMetadataIpc';
import type { SubtitleDiscoveryProgress } from '../../../../shared/subtitleDiscoveryIpc';
import type { TranscriptionProgress } from '../../../../shared/transcriptionIpc';

export type MediaJobKind = 'metadata' | 'subtitles' | 'download' | 'transcription';

export interface MediaJob {
  /** Unique per kind+subject, so repeated progress updates replace rather than pile up. */
  id: string;
  kind: MediaJobKind;
  title: string;
  /** Raw phase from the job, resolved to an i18n key by the consumer. */
  phase: string;
  done: number;
  total: number;
  etaMs?: number;
  error?: string;
  /**
   * Transcription only: the model that is actually running, when it is not the
   * one the settings asked for. Absent means no substitution — never a guess.
   */
  modelSubstitution?: { requested: string; used: string };
  /** True once the job reached a terminal phase. */
  finished: boolean;
  updatedAt: number;
}

export interface MediaJobsSnapshot {
  jobs: MediaJob[];
  active: number;
  /** Media ids with a transcription queued or running. */
  transcribing: Set<string>;
}

/** How long a finished row stays on screen before it is dropped. */
const LINGER_MS = 6_000;

/**
 * yt-dlp reports progress but never reports completion — the stream just stops.
 * A download silent for this long is treated as over, which keeps a stuck row
 * from sitting there forever.
 */
const DOWNLOAD_IDLE_MS = 20_000;

const SWEEP_MS = 1_500;

const TERMINAL = new Set(['done', 'finished', 'cancelled', 'error']);

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const jobs = new Map<string, MediaJob>();
const listeners = new Set<() => void>();

const EMPTY: MediaJobsSnapshot = { jobs: [], active: 0, transcribing: new Set() };

/**
 * Rebuilt only when the map changes. `useSyncExternalStore` compares snapshots by
 * identity, so returning a fresh object per read would loop forever.
 */
let snapshot: MediaJobsSnapshot = EMPTY;

function rebuild(): void {
  const list = [...jobs.values()].sort((a, b) => {
    // Running work first; within a group, most recently touched first.
    if (a.finished !== b.finished) return a.finished ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });
  snapshot = {
    jobs: list,
    active: list.filter((job) => !job.finished).length,
    transcribing: new Set(
      list.filter((job) => job.kind === 'transcription' && !job.finished)
        .map((job) => job.id.slice('transcription:'.length)),
    ),
  };
  for (const listener of listeners) listener();
}

function upsert(job: MediaJob): void {
  jobs.set(job.id, job);
  rebuild();
}

/** Wired once, on the first subscriber, then left running for the session. */
let wired = false;

/**
 * Seed the store from the transcription queue main already holds.
 *
 * Every other channel here is push-only, which is right for work that starts while
 * the window is open. The transcription queue is the exception: it **persists to
 * userData and is restored at boot** (`transcriptionJobs.ts` `loadQueue`), and
 * `scheduleDrain` exists specifically so a restored queue runs even before a
 * renderer is ready. So after a restart there can be real pending work that has
 * broadcast nothing yet — and the panel, built purely from progress events, showed
 * an empty list. `transcriptionQueue()` is the route that answers this and had no
 * caller anywhere in the renderer (D245's class).
 *
 * Only jobs the push channel has not already reported are added, so a progress
 * event that arrives first always wins over this snapshot.
 */
function hydrateTranscriptionQueue(): void {
  const load = window.api?.transcriptionQueue;
  if (typeof load !== 'function') return;
  void load()
    .then((queued) => {
      if (!Array.isArray(queued)) return;
      for (const job of queued) {
        if (!job || typeof job.mediaId !== 'string') continue;
        const id = `transcription:${job.mediaId}`;
        if (jobs.has(id)) continue;
        jobs.set(id, {
          id,
          kind: 'transcription',
          title: job.title,
          phase: 'queued',
          done: 0,
          total: 0,
          finished: false,
          updatedAt: job.queuedAt || Date.now(),
        });
      }
      rebuild();
    })
    .catch(() => {
      /* a queue we cannot read is not worth a broken panel */
    });
}

function wire(): void {
  if (wired) return;
  wired = true;

  hydrateTranscriptionQueue();

  window.api.onMediaMetadataProgress?.((p: MediaMetadataProgress) => {
    upsert({
      id: `metadata:${p.seriesKey}`,
      kind: 'metadata',
      title: p.title,
      phase: p.phase,
      done: p.done,
      total: p.total,
      etaMs: p.etaMs,
      error: p.error,
      finished: TERMINAL.has(p.phase),
      updatedAt: Date.now(),
    });
  });

  window.api.onSubtitleDiscoveryProgress?.((p: SubtitleDiscoveryProgress) => {
    upsert({
      id: `subtitles:${p.mediaId}`,
      kind: 'subtitles',
      title: p.title,
      phase: p.phase,
      done: p.done,
      total: p.total,
      etaMs: p.etaMs,
      error: p.error,
      finished: TERMINAL.has(p.phase),
      updatedAt: Date.now(),
    });
  });

  window.api.onTranscriptionProgress?.((p: TranscriptionProgress) => {
    upsert({
      id: `transcription:${p.mediaId}`,
      kind: 'transcription',
      title: p.title,
      phase: p.phase,
      done: p.done,
      total: p.total,
      etaMs: p.etaMs,
      error: p.error,
      modelSubstitution: p.modelSubstitution,
      finished: TERMINAL.has(p.phase),
      updatedAt: Date.now(),
    });
  });

  window.api.onYtDownloadProgress?.((p) => {
    const stage = String(p.stage ?? 'downloading').toLowerCase();
    const percent = Number.isFinite(p.percent) ? Math.max(0, Math.min(100, p.percent)) : 0;
    upsert({
      id: `download:${p.videoId}`,
      kind: 'download',
      title: p.videoId,
      phase: stage,
      // Downloads report a percentage rather than a count, so the bar is fed a
      // synthetic 0..100 pair to keep one shape across every job kind.
      done: Math.round(percent),
      total: 100,
      finished: TERMINAL.has(stage),
      updatedAt: Date.now(),
    });
  });

  // One interval for the whole app rather than one per mounted consumer, so a
  // 500-file import cannot schedule hundreds of timers.
  window.setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, job] of [...jobs]) {
      const expired = job.finished
        ? job.updatedAt < now - LINGER_MS
        : job.kind === 'download' && job.updatedAt < now - DOWNLOAD_IDLE_MS;
      if (expired) {
        jobs.delete(id);
        changed = true;
      }
    }
    if (changed) rebuild();
  }, SWEEP_MS);
}

function subscribe(listener: () => void): () => void {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = (): MediaJobsSnapshot => snapshot;

export function useMediaJobs(): MediaJobsSnapshot {
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The same `subscribe`/`read` pair the hook hands to `useSyncExternalStore`.
 *
 * Exposed because the interesting behaviour is the STORE's — `wire()` runs on the
 * first subscribe, and D246's queue hydration happens there — and asserting it
 * through a mounted component would be measuring React, not this.
 */
export const useMediaJobsStoreForTest = { subscribe, read };

/** Test seam: drops all state so one case cannot leak into the next. */
export const __mediaJobsTestables = {
  reset(): void {
    jobs.clear();
    snapshot = EMPTY;
  },
  upsert,
  read,
  /**
   * Runs the real `wire()` against whatever `window.api` currently is, so a
   * test can drive the ACTUAL translation from an IPC payload to a `MediaJob`.
   * `upsert` alone cannot see that mapping — which is exactly where a field
   * added to the payload and never carried across goes quietly missing.
   */
  wire(): void {
    wired = false;
    wire();
  },
};
