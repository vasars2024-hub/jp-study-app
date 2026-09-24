/**
 * Moves the old renderer-side lists into the watch library — the one store.
 *
 * `jp-media-tracking-v1` (the §7 tracking records) and the anime half of
 * `jp-discovery-shortlist-v1` are read, resolved to readable titles, and sent
 * to `watch:importLegacy`. Nothing is deleted: the old keys stay readable, and
 * `jp-watch-legacy-migrated-v1` records how far each has been folded in (the
 * newest `updatedAt` / `addedAt` sent). A later write to the old tracking store
 * — the AI agent's `anime.track` still writes there — is picked up by the next
 * run, and a run with nothing new costs no IPC at all.
 */

import { loadMediaTrackingDocument } from './mediaTrackingStore';
import { loadMediaShortlist } from './discoveryShortlistStore';
import { loadMediaProvidersDocument } from './mediaProviderStore';
import { mergeStoredMediaResults } from '../shared/mediaResultPresentation';
import {
  mediaTrackingRecordToLegacyRow,
  shortlistCandidateToLegacyRow,
  type LegacyIdentityInfo,
  type WatchLegacyRow,
} from '../shared/watchLibraryLegacy';

export const WATCH_LEGACY_MIGRATION_KEY = 'jp-watch-legacy-migrated-v1';

export interface WatchLegacyMark {
  /** Newest tracking `updatedAt` (epoch ms) already folded in. */
  tracking: number;
  /** Newest shortlist `addedAt` already folded in. */
  shortlist: number;
  /** When the last run sent anything. */
  at: number;
}

export function readWatchLegacyMark(): WatchLegacyMark {
  try {
    const raw = JSON.parse(localStorage.getItem(WATCH_LEGACY_MIGRATION_KEY) ?? 'null') as Partial<WatchLegacyMark> | null;
    return {
      tracking: typeof raw?.tracking === 'number' ? raw.tracking : 0,
      shortlist: typeof raw?.shortlist === 'number' ? raw.shortlist : 0,
      at: typeof raw?.at === 'number' ? raw.at : 0,
    };
  } catch {
    return { tracking: 0, shortlist: 0, at: 0 };
  }
}

function writeMark(mark: WatchLegacyMark): void {
  try {
    localStorage.setItem(WATCH_LEGACY_MIGRATION_KEY, JSON.stringify(mark));
  } catch {
    /* the next run simply sends the same rows again, which is a fixed point */
  }
}

function identityInfo(): Map<string, LegacyIdentityInfo> {
  const out = new Map<string, LegacyIdentityInfo>();
  try {
    for (const result of mergeStoredMediaResults(loadMediaProvidersDocument())) {
      out.set(result.identityId, {
        title: result.title,
        originalTitle: result.japaneseTitle ?? result.originalTitle,
        altTitles: [result.romajiTitle, result.originalTitle, ...result.alternativeTitles].filter((v): v is string => !!v),
        year: result.year,
        episodeCount: result.episodeCount,
        identifiers: result.identifiers,
      });
    }
  } catch {
    /* no stored provider results: tracking rows stay unresolved and wait */
  }
  return out;
}

export interface WatchLegacyPlan {
  rows: WatchLegacyRow[];
  next: WatchLegacyMark;
  /** Tracking records that could not be named yet (left in the old store). */
  unresolved: number;
}

/** What a run would send, and the mark it would leave. Pure over its inputs' reads. */
export function planWatchLegacyMigration(mark: WatchLegacyMark = readWatchLegacyMark()): WatchLegacyPlan {
  const rows: WatchLegacyRow[] = [];
  let unresolved = 0;
  let tracking = mark.tracking;
  let shortlist = mark.shortlist;

  const records = loadMediaTrackingDocument().records;
  const fresh = records.filter((record) => {
    const at = Date.parse(record.updatedAt ?? record.addedAt ?? '') || 0;
    return at > mark.tracking || (at === 0 && mark.tracking === 0);
  });
  if (fresh.length) {
    const info = identityInfo();
    let newestResolved = 0;
    let oldestUnresolved = Infinity;
    for (const record of fresh) {
      const at = Date.parse(record.updatedAt ?? record.addedAt ?? '') || 0;
      const row = mediaTrackingRecordToLegacyRow(record, info.get(record.identityId));
      if (!row) {
        unresolved += 1;
        oldestUnresolved = Math.min(oldestUnresolved, at);
        continue;
      }
      rows.push(row);
      newestResolved = Math.max(newestResolved, at);
    }
    // An unresolved record holds the mark just below itself, so it is tried
    // again once the provider catalogue can name it.
    tracking = Math.max(mark.tracking, Math.min(newestResolved, oldestUnresolved - 1));
  }

  for (const entry of loadMediaShortlist()) {
    if (entry.addedAt <= mark.shortlist && mark.shortlist > 0) continue;
    const row = shortlistCandidateToLegacyRow(entry.candidate, entry.addedAt || Date.now());
    if (row) rows.push(row);
    shortlist = Math.max(shortlist, entry.addedAt || 1);
  }
  return { rows, next: { tracking, shortlist, at: mark.at }, unresolved };
}

let running: Promise<number> | null = null;

/**
 * Runs the migration once per call site burst. Resolves to the number of rows
 * sent (0 when there was nothing new or the bridge is missing).
 */
export function migrateLegacyWatchStores(now: () => number = Date.now): Promise<number> {
  if (running) return running;
  running = (async () => {
    const api = typeof window !== 'undefined' ? window.api : undefined;
    if (!api?.watchImportLegacy) return 0;
    const mark = readWatchLegacyMark();
    const plan = planWatchLegacyMigration(mark);
    if (!plan.rows.length) {
      if (plan.next.tracking !== mark.tracking || plan.next.shortlist !== mark.shortlist) writeMark(plan.next);
      return 0;
    }
    await api.watchImportLegacy(plan.rows);
    writeMark({ ...plan.next, at: now() });
    return plan.rows.length;
  })()
    .catch(() => 0)
    .finally(() => {
      running = null;
    });
  return running;
}
