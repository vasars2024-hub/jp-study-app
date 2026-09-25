/**
 * What a watched folder does with a file that finished arriving.
 *
 * Watching used to stop at noticing (audit r2 #3): the Files list refreshed
 * and said what landed, and nothing was imported until the user ran a scan
 * by hand. This is the missing half, and it is deliberately NOT a new policy:
 * each arrival goes through the same `dispositionFor` the scan-and-review
 * sheet uses, so only what the user's settings already call the "auto" pile
 * is imported, and everything the review queue would ask about is left for
 * the review queue.
 *
 * One exception, decided here so it cannot drift: a media file inside a
 * folder the media-ingest watcher also covers is that watcher's to import. It
 * imports media on its own, from app start, with its own identification;
 * importing the same arrival from here too would add every episode twice.
 */
import { dispositionFor, type IngestSettings } from './ingest';
import type { ImportLedger } from './importLedger';
import type { FilesScanEntry } from './scan';

export const FILES_WATCH_IMPORT_CHANNEL = 'filesapp:watch-import';
export const FILES_WATCH_STORE_FILE = 'files-watch.json';

/** Main's persisted copy of the watched set, so watching survives a restart. */
export interface FilesWatchPersisted {
  version: 1;
  roots: string[];
  stabilityMs?: number;
}

export function normalizeFilesWatchPersisted(raw: unknown): FilesWatchPersisted {
  const value = raw && typeof raw === 'object' ? (raw as Partial<FilesWatchPersisted>) : {};
  const roots = Array.isArray(value.roots)
    ? [...new Set(value.roots.filter((r): r is string => typeof r === 'string' && r.trim().length > 0))].slice(0, 8)
    : [];
  const stabilityMs =
    typeof value.stabilityMs === 'number' && Number.isFinite(value.stabilityMs) ? value.stabilityMs : undefined;
  return { version: 1, roots, ...(stabilityMs === undefined ? {} : { stabilityMs }) };
}

/** An arrival as main hands it to the importer. */
export interface FilesWatchImportArrival {
  entry: FilesScanEntry;
  root: string;
  /** Main's answer: the media-ingest watcher already imports this file. */
  coveredByMediaIngest?: boolean;
}

export interface FilesWatchImportPlan {
  /** Import now, through the same importer a drop uses. */
  auto: FilesScanEntry[];
  /** Left for the review queue — the settings say to ask first. */
  review: FilesScanEntry[];
  /** Media the media-ingest watcher imports itself. */
  coveredByMedia: number;
  /** Already imported once (the ledger), or nothing can open it. */
  skipped: number;
}

export function planWatchImports(
  arrivals: readonly FilesWatchImportArrival[],
  settings: IngestSettings,
  ledger?: ImportLedger,
): FilesWatchImportPlan {
  const plan: FilesWatchImportPlan = { auto: [], review: [], coveredByMedia: 0, skipped: 0 };
  const seen = new Set<string>();
  for (const arrival of arrivals) {
    const entry = arrival?.entry;
    if (!entry || typeof entry.path !== 'string' || seen.has(entry.path)) continue;
    seen.add(entry.path);
    if (arrival.coveredByMediaIngest) {
      plan.coveredByMedia += 1;
      continue;
    }
    const decision = dispositionFor(entry, settings, ledger);
    if (decision.disposition === 'auto') plan.auto.push(entry);
    else if (decision.disposition === 'review') plan.review.push(entry);
    else plan.skipped += 1;
  }
  return plan;
}
