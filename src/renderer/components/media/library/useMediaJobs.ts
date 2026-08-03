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

function wire(): void {
  if (wired) return;
  wired = true;

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

/** Test seam: drops all state so one case cannot leak into the next. */
export const __mediaJobsTestables = {
  reset(): void {
    jobs.clear();
    snapshot = EMPTY;
  },
  upsert,
  read,
};
