/**
 * `ingestMediaPaths` — the one door every automatic source walks through.
 *
 * A finished torrent, a file settling in a watched folder, a manual "Add to
 * library" on a transfer: each becomes library items the same way.
 *
 * 1. `addOrGetItem` for every file, so the release identity (series key,
 *    season, episode, category) is read out of the name exactly as a manual
 *    import reads it — nothing lands in the inbox as a bare title.
 * 2. The Scraper's hint, when there is one, outranks the name: catalogue ids,
 *    catalogue title, category, and on a one-video download the episode.
 * 3. A new episode of a show already on the shelf copies that show's matched
 *    metadata (poster, titles, ids) and joins its group at once.
 * 4. Everything that landed within a short window is announced as ONE
 *    `media:ingested` event per source, and the metadata pass is scheduled
 *    once: an exact-id lookup first for hinted titles, then the library's own
 *    sweep, which runs subtitle discovery after it.
 *
 * No Electron here: the library store, the clock and the metadata job are all
 * injected, so the suite drives it with an in-memory library.
 */

import {
  findSeriesSibling,
  hintPatchForItem,
  ingestPathKey,
  isIngestCandidateName,
  isIngestSizePlausible,
  metadataOverrideFor,
  seriesPatchFromSibling,
  summarizeIngested,
  type MediaIngestHint,
  type MediaIngestSource,
  type MediaIngestedEvent,
} from '../shared/mediaIngest';
import type { MediaItem } from '../shared/types';

/** Injected by `media.ts`, which owns the JSON store and the change broadcast. */
export interface MediaIngestHost {
  /** Adds (or finds) the item for a file, running release identity. Never touches play state. */
  addOrGetItem: (absPath: string) => MediaItem;
  listItems: () => MediaItem[];
  /** A different patch per id, one write, one broadcast. */
  patchEachItem: (entries: ReadonlyArray<readonly [string, Partial<MediaItem>]>) => void;
  /** Re-sends the library to every window. */
  broadcast: () => void;
  /** The library's debounced metadata sweep, which runs subtitle discovery after it. */
  scheduleMetadataSweep: () => void;
  /** The single `watchFolder` the library used to keep — read once, for the migration. */
  legacyWatchFolder: () => string | undefined;
}

export type MetadataOverride = { provider: 'anilist' | 'jikan'; id: number };

export interface MediaIngestCoreDeps {
  now: () => number;
  schedule: (fn: () => void, ms: number) => { cancel: () => void };
  stat: (filePath: string) => { isFile: boolean; isDirectory: boolean; size: number } | null;
  /** Candidate media files under a directory, with the skip rules applied. */
  walk: (dir: string) => string[];
  emit: (event: MediaIngestedEvent) => void;
  /** A metadata sweep is running; a second one would be refused, not queued. */
  metadataBusy: () => boolean;
  runMetadataOverride: (mediaIds: string[], override: MetadataOverride) => Promise<void>;
  /** Poster for a hint with a URL but no catalogue id. Returns a userData-relative path. */
  downloadPoster?: (url: string, seriesKey: string) => Promise<string | null>;
  /** Every file an ingest looked at, new or not — the watch folders' "seen" memory. */
  onFilesHandled?: (paths: string[]) => void;
  keyOf?: (value: string) => string;
}

export interface MediaIngestOptions {
  /** An automatic source: also applies the size floor that rejects junk files. */
  auto?: boolean;
}

export interface MediaIngestResult {
  /** Media files considered. */
  found: number;
  /** Items created by this call. */
  added: MediaItem[];
  /** Every item the files map to, new or existing, after the hint was applied. */
  items: MediaItem[];
}

export interface MediaIngestCore {
  ingestMediaPaths: (
    paths: readonly string[],
    hint?: MediaIngestHint,
    source?: MediaIngestSource,
    options?: MediaIngestOptions,
  ) => Promise<MediaIngestResult>;
  /** Announce items another path already added (a yt-dlp download). */
  announce: (items: readonly MediaItem[], source: MediaIngestSource) => void;
  /** Test seam: run the pending announcement and metadata work now. */
  flush: () => Promise<void>;
}

/** How long arrivals are gathered into one announcement and one metadata pass. */
export const INGEST_COALESCE_MS = 1_500;
/** How long an exact lookup waits for a sweep that is already running. */
export const METADATA_WAIT_LIMIT_MS = 10 * 60_000;
const METADATA_WAIT_STEP_MS = 3_000;

export function createMediaIngestCore(host: MediaIngestHost, deps: MediaIngestCoreDeps): MediaIngestCore {
  const keyOf = deps.keyOf ?? ((value: string) => ingestPathKey(value));
  /** Item ids waiting to be announced, per source, in arrival order. */
  const pendingEvents = new Map<MediaIngestSource, string[]>();
  const pendingOverrides = new Map<string, { override: MetadataOverride; ids: Set<string> }>();
  let sweepWanted = false;
  let timer: { cancel: () => void } | null = null;
  let draining: Promise<void> | null = null;

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
    deps.schedule(resolve, ms);
  });

  function expand(paths: readonly string[], auto: boolean): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (filePath: string, size?: number): void => {
      const key = keyOf(filePath);
      if (seen.has(key) || !isIngestCandidateName(filePath)) return;
      if (auto) {
        const bytes = size ?? deps.stat(filePath)?.size ?? 0;
        if (!isIngestSizePlausible(filePath, bytes)) return;
      }
      seen.add(key);
      out.push(filePath);
    };
    for (const value of paths) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const stat = deps.stat(value);
      if (!stat) continue;
      if (stat.isDirectory) {
        for (const filePath of deps.walk(value)) push(filePath);
      } else if (stat.isFile) {
        push(value, stat.size);
      }
    }
    return out;
  }

  function arm(): void {
    if (timer) return;
    timer = deps.schedule(() => {
      timer = null;
      void flushNow();
    }, INGEST_COALESCE_MS);
  }

  function announceNow(): void {
    if (!pendingEvents.size) return;
    const byId = new Map(host.listItems().map((item) => [item.id, item]));
    for (const [source, ids] of [...pendingEvents]) {
      const items = [...new Set(ids)].map((id) => byId.get(id)).filter((item): item is MediaItem => Boolean(item));
      if (items.length) deps.emit(summarizeIngested(items, source, deps.now()));
    }
    pendingEvents.clear();
  }

  async function drainMetadata(): Promise<void> {
    while (pendingOverrides.size || sweepWanted) {
      const jobs = [...pendingOverrides.values()];
      pendingOverrides.clear();
      const wantSweep = sweepWanted;
      sweepWanted = false;
      for (const job of jobs) {
        // A sweep already running would refuse this one outright, so it waits.
        const deadline = deps.now() + METADATA_WAIT_LIMIT_MS;
        while (deps.metadataBusy() && deps.now() < deadline) await sleep(METADATA_WAIT_STEP_MS);
        const live = new Set(host.listItems().map((item) => item.id));
        const ids = [...job.ids].filter((id) => live.has(id));
        if (!ids.length) continue;
        try {
          await deps.runMetadataOverride(ids, job.override);
        } catch {
          // The general sweep below still gets a chance at it by title.
        }
      }
      // After the exact lookups, so the fuzzy sweep finds those titles already
      // fetched and skips them — and so subtitle discovery, which the sweep
      // runs next, sees the AniList id the lookup just stored.
      if (wantSweep || jobs.length) host.scheduleMetadataSweep();
    }
  }

  async function flushNow(): Promise<void> {
    timer?.cancel();
    timer = null;
    announceNow();
    if (!draining) {
      draining = drainMetadata().finally(() => {
        draining = null;
      });
    }
    await draining;
  }

  async function ingestMediaPaths(
    paths: readonly string[],
    hint?: MediaIngestHint,
    source: MediaIngestSource = 'acquired',
    options: MediaIngestOptions = {},
  ): Promise<MediaIngestResult> {
    const files = expand(paths, Boolean(options.auto));
    if (!files.length) return { found: 0, added: [], items: [] };

    const before = new Set(host.listItems().map((item) => keyOf(item.path)));
    const items: MediaItem[] = [];
    const added: MediaItem[] = [];
    for (const filePath of files) {
      try {
        const item = host.addOrGetItem(filePath);
        items.push(item);
        if (!before.has(keyOf(filePath))) added.push(item);
      } catch {
        // An unreadable file is skipped, and not counted as added.
      }
    }
    deps.onFilesHandled?.(files);
    if (!items.length) return { found: files.length, added: [], items: [] };

    const addedIds = new Set(added.map((item) => item.id));
    const videoCount = items.filter((item) => !item.kind || item.kind === 'video').length;
    const library = host.listItems();
    const override = metadataOverrideFor(hint);
    const patches: Array<readonly [string, Partial<MediaItem>]> = [];
    const needLookup: string[] = [];
    const needPoster: MediaItem[] = [];

    for (const item of items) {
      const isNew = addedIds.has(item.id);
      let patch = hintPatchForItem(item, hint, { isNew, videoCount });
      if (isNew || !item.metadataSource) {
        const merged: MediaItem = { ...item, ...patch };
        const found = findSeriesSibling(library, merged, hint);
        if (found) {
          patch = { ...patch, ...seriesPatchFromSibling(found.sibling, merged, found.byId) };
        } else if (override && !item.metadataSource) {
          needLookup.push(item.id);
        } else if (hint?.posterUrl && !item.posterPath) {
          needPoster.push(merged);
        }
      }
      if (Object.keys(patch).length) patches.push([item.id, patch] as const);
    }

    if (patches.length) host.patchEachItem(patches);
    else if (added.length) host.broadcast();

    if (needPoster.length && hint?.posterUrl && deps.downloadPoster) {
      const seriesKey = needPoster[0].seriesKey || keyOf(hint.title ?? needPoster[0].title);
      void deps.downloadPoster(hint.posterUrl, seriesKey).then((posterPath) => {
        if (!posterPath) return;
        const current = new Map(host.listItems().map((item) => [item.id, item]));
        host.patchEachItem(needPoster
          .filter((item) => current.get(item.id) && !current.get(item.id)?.posterPath)
          .map((item) => [item.id, { posterPath }] as const));
      }).catch(() => undefined);
    }

    if (added.length) {
      const list = pendingEvents.get(source) ?? [];
      list.push(...added.map((item) => item.id));
      pendingEvents.set(source, list);
    }
    if (override && needLookup.length) {
      const key = `${override.provider}:${override.id}`;
      const job = pendingOverrides.get(key) ?? { override, ids: new Set<string>() };
      for (const id of needLookup) job.ids.add(id);
      pendingOverrides.set(key, job);
    }
    if (added.length || patches.length) sweepWanted = true;
    if (added.length || needLookup.length || sweepWanted) arm();

    const byId = new Map(host.listItems().map((item) => [item.id, item]));
    return {
      found: files.length,
      added: added.map((item) => byId.get(item.id) ?? item),
      items: items.map((item) => byId.get(item.id) ?? item),
    };
  }

  return {
    ingestMediaPaths,
    announce(items, source) {
      if (!items.length) return;
      const list = pendingEvents.get(source) ?? [];
      list.push(...items.map((item) => item.id));
      pendingEvents.set(source, list);
      arm();
    },
    flush: flushNow,
  };
}
