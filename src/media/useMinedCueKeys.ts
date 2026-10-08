/**
 * Which lines of the current video are already cards — for the transcript's and the
 * subtitle's "mined" markers.
 *
 * Read from the mining history, the log every player mine writes (all outcomes; see
 * `createVideoCoreMiningOutcomeEntry`). Recomputed only when that log changes: every
 * writer goes through `writeVideoCoreMiningHistory`, which announces the change on
 * `window`, and a write from another window arrives as a `storage` event. No polling,
 * and the returned Set keeps its identity until something actually changed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  isMinedHistoryStatus,
  minedCueKey,
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_EVENT,
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningHistoryEntry,
  type VideoCoreMiningSource,
} from '../shared/videoCoreMining';
import { watchLoopSourceKey } from '../shared/seanimeWatchLoop';
import { writeLocalStorageJson } from '../renderer/localStorageWrite';

/** The persisted mining history, normalised; [] when absent or unreadable. */
export function readVideoCoreMiningHistory(): VideoCoreMiningHistoryEntry[] {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
}

/** Persist the mining history and tell this window's readers it changed. */
export function writeVideoCoreMiningHistory(entries: readonly VideoCoreMiningHistoryEntry[]): boolean {
  const ok = writeLocalStorageJson(VIDEO_CORE_MINING_HISTORY_KEY, entries);
  try {
    window.dispatchEvent(new CustomEvent(VIDEO_CORE_MINING_HISTORY_EVENT));
  } catch {
    /* non-browser context */
  }
  return ok;
}

/**
 * Same-source test. A durable key (file path, or media + episode) when there is one;
 * otherwise the playback id, which is only stable within one session but is all a
 * stream without a library entry has.
 */
function sameSource(
  a: VideoCoreMiningSource,
  b: VideoCoreMiningSource,
  durableKey: string,
): boolean {
  if (durableKey) return watchLoopSourceKey(a) === durableKey;
  return a.playbackId === b.playbackId;
}

/** Pure core of the hook, exported for tests. */
export function minedCueKeysFor(
  history: readonly VideoCoreMiningHistoryEntry[],
  source: VideoCoreMiningSource | null,
): Set<string> {
  const keys = new Set<string>();
  if (!source) return keys;
  const durableKey = watchLoopSourceKey(source);
  for (const entry of history) {
    if (!isMinedHistoryStatus(entry.status)) continue;
    if (!sameSource(entry.provenance.source, source, durableKey)) continue;
    keys.add(minedCueKey(entry.provenance.cue));
  }
  return keys;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

export function useMinedCueKeys(source: VideoCoreMiningSource | null): ReadonlySet<string> {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = (): void => setVersion((value) => value + 1);
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === VIDEO_CORE_MINING_HISTORY_KEY) bump();
    };
    window.addEventListener(VIDEO_CORE_MINING_HISTORY_EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(VIDEO_CORE_MINING_HISTORY_EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Keyed on the identity fields, not the object: the overlay rebuilds `source` freely.
  // (`source` itself is deliberately not a memo dependency for the same reason.)
  const identity = source
    ? `${source.playbackId}|${source.localFilePath ?? ''}|${source.streamPath ?? ''}|${source.mediaId ?? ''}|${source.episodeNumber ?? ''}`
    : '';
  // A history change for another video must not hand the overlay a new Set (and a
  // re-render of every row) when this video's marks are the same: keep the last Set
  // while its contents are unchanged.
  const lastRef = useRef<ReadonlySet<string>>(EMPTY);
  return useMemo(() => {
    const next = source ? minedCueKeysFor(readVideoCoreMiningHistory(), source) : EMPTY;
    if (sameKeys(lastRef.current, next)) return lastRef.current;
    lastRef.current = next;
    return next;
    // `source` is read through `identity`; `version` is the history's change counter.
  }, [identity, version]);
}

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}
