/**
 * The anime/manga library the MAL sync writes into — the file half.
 *
 * `<userData>/mal-library.json`, one JSON document, read and written whole. The
 * user's own list is ~1,400 rows at roughly 200 bytes each, so the file is under
 * a megabyte and a database would be ceremony; if it ever stops being, the merge
 * logic is already isolated in `shared/malLibrary.ts` and only these ten lines
 * change.
 *
 * ## Why the entries arrive from the renderer rather than being fetched here
 *
 * `mal:librarySync` takes the rows the caller already fetched through
 * `mal:fetchList` / `mal:fetchDerivatives` instead of calling MAL itself. Two
 * reasons, both load-bearing:
 *
 *   - Every network call to MAL stays on the one audited path in `malSync.ts`,
 *     which owns the token, the refresh policy and the `paging.next` host guard.
 *     A second client here would be a second place a bearer token can leak.
 *   - Gate 13 ("nothing auto-syncs on a timer") stays true by construction: this
 *     module has no client to call, so it *cannot* sync on its own. The write is
 *     a separate explicit step after a fetch the user asked for.
 *
 * The cost is one extra IPC hop for rows that already crossed once. Measured on
 * the real list that is ~1,400 small objects — the same payload `mal:fetchList`
 * already returns, so the ceiling is unchanged.
 *
 * Nothing here writes to MyAnimeList. Every function is local disk only.
 */

import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  emptyMalLibrary,
  mergeMalDerivatives,
  mergeMalListEntries,
  parseMalLibraryDocument,
  summarizeMalLibrary,
  MAL_LIBRARY_SCHEMA_VERSION,
  type MalLibraryDocument,
  type MalLibraryMedia,
  type MalLibraryMergeResult,
  type MalLibrarySummary,
} from '../shared/malLibrary';
import { isMalListStatus, isMalRelationType, type MalDerivative, type MalListEntry } from '../shared/malSync';

function defaultLibraryPath(): string {
  return path.join(app.getPath('userData'), 'mal-library.json');
}

/** Overridable for tests; production always uses `<userData>/mal-library.json`. */
let libraryPath: () => string = defaultLibraryPath;

export function __setMalLibraryPathForTests(next: (() => string) | null): void {
  libraryPath = next ?? defaultLibraryPath;
}

export function readMalLibrary(): MalLibraryDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(libraryPath(), 'utf-8'));
  } catch {
    // Absent or unreadable are the same answer to the caller: an empty library.
    // A corrupt file is deliberately not deleted here — the next successful sync
    // overwrites it, and until then it is evidence rather than garbage.
    return emptyMalLibrary();
  }
  const document = parseMalLibraryDocument(raw);
  if (document.version > MAL_LIBRARY_SCHEMA_VERSION) {
    // Reading a newer document with older rules would drop the fields this
    // version does not know about and write the loss back on the next sync.
    return emptyMalLibrary();
  }
  return document;
}

/**
 * Writes the document, atomically enough that a crash cannot leave a half file.
 *
 * Rename-over on the same directory is atomic on NTFS and on POSIX, which is the
 * property that matters: the previous library survives an interrupted write.
 */
export function writeMalLibrary(document: MalLibraryDocument): void {
  const target = libraryPath();
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(document, null, 2), 'utf-8');
  fs.renameSync(temp, target);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Re-validates rows crossing the bridge.
 *
 * The renderer is ours, but "ours" is not a type check: these objects have been
 * through `structuredClone` and a `JSON.parse` at the far end, and a row with a
 * string id would land in the file and break every later key comparison silently.
 */
function sanitizeListEntries(value: unknown): MalListEntry[] {
  if (!Array.isArray(value)) return [];
  const out: MalListEntry[] = [];
  for (const row of value) {
    const record = asRecord(row);
    const animeId = record.animeId;
    if (typeof animeId !== 'number' || !Number.isFinite(animeId)) continue;
    // Every field is copied by name, so a field added upstream and *not* added
    // here is dropped in silence. Measured 2026-08-17: `malFetchList` carried
    // aliases for 1,373 of 1,426 rows and the library stored 0, with every unit
    // test green — they call `mergeMalListEntries` directly and never cross this
    // seam. If you add a field to `MalListEntry`, add it here too.
    const altTitles = Array.isArray(record.altTitles)
      ? record.altTitles.filter((name): name is string => typeof name === 'string' && !!name)
      : [];
    out.push({
      animeId: Math.trunc(animeId),
      title: typeof record.title === 'string' ? record.title : '',
      ...(altTitles.length ? { altTitles } : {}),
      posterUrl: typeof record.posterUrl === 'string' ? record.posterUrl : undefined,
      totalEpisodes: typeof record.totalEpisodes === 'number' ? record.totalEpisodes : undefined,
      status: isMalListStatus(record.status) ? record.status : undefined,
      episodesWatched: asNumber(record.episodesWatched, 0),
      score: asNumber(record.score, 0),
      rewatching: record.rewatching === true,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
    });
  }
  return out;
}

function sanitizeDerivatives(value: unknown): MalDerivative[] {
  if (!Array.isArray(value)) return [];
  const out: MalDerivative[] = [];
  for (const row of value) {
    const record = asRecord(row);
    const animeId = record.animeId;
    if (typeof animeId !== 'number' || !Number.isFinite(animeId)) continue;
    if (!isMalRelationType(record.relation)) continue;
    out.push({
      animeId: Math.trunc(animeId),
      title: typeof record.title === 'string' ? record.title : '',
      posterUrl: typeof record.posterUrl === 'string' ? record.posterUrl : undefined,
      relation: record.relation,
      relationLabel: typeof record.relationLabel === 'string' && record.relationLabel
        ? record.relationLabel
        : record.relation,
      fromAnimeId: asNumber(record.fromAnimeId, 0),
      depth: asNumber(record.depth, 1),
    });
  }
  return out;
}

/**
 * What a caller hands to `mal:librarySync`.
 *
 * Both halves are optional so the panel can store a list without a walk, or a
 * walk without re-fetching the list. Everything is re-validated on arrival —
 * this type documents the intent, it does not enforce it.
 */
export interface MalLibrarySyncRequest {
  media?: MalLibraryMedia;
  entries?: MalListEntry[];
  derivatives?: MalDerivative[];
}

export interface MalLibrarySyncReport {
  added: number;
  updated: number;
  unchanged: number;
  /** Rows handed in that were dropped as malformed — a finding, not a rounding. */
  rejected: number;
  summary: MalLibrarySummary;
}

/**
 * Merges one fetch into the stored library and persists it.
 *
 * Exported so a test can drive it without Electron's IPC. `now` is a parameter
 * for the same reason it is in `shared/malLibrary.ts`: an `addedAt` that depends
 * on the wall clock is not assertable.
 */
export function applyMalLibrarySync(
  payload: unknown,
  now: number = Date.now(),
): MalLibrarySyncReport {
  const record = asRecord(payload);
  const media: MalLibraryMedia = record.media === 'manga' ? 'manga' : 'anime';
  const listEntries = sanitizeListEntries(record.entries);
  const derivatives = sanitizeDerivatives(record.derivatives);
  const handedIn =
    (Array.isArray(record.entries) ? record.entries.length : 0)
    + (Array.isArray(record.derivatives) ? record.derivatives.length : 0);

  let document = readMalLibrary();
  const totals = { added: 0, updated: 0, unchanged: 0 };
  const accumulate = (result: MalLibraryMergeResult): void => {
    document = result.document;
    totals.added += result.added;
    totals.updated += result.updated;
    totals.unchanged += result.unchanged;
  };

  // List first, so a title arriving in both halves is stored as the user's own
  // row and then merely annotated with how a walk would have reached it.
  accumulate(mergeMalListEntries(document, listEntries, now, media));
  accumulate(mergeMalDerivatives(document, derivatives, now, media));

  writeMalLibrary(document);
  return {
    ...totals,
    rejected: handedIn - listEntries.length - derivatives.length,
    summary: summarizeMalLibrary(document),
  };
}

/**
 * Registers the two library channels.
 *
 * Both are local: `mal:librarySync` writes what it is given, `mal:libraryList`
 * reads what is stored. Neither can reach MyAnimeList, which is what makes "no
 * background sync" a property of the code rather than a promise in a comment.
 */
export function registerMalLibraryIpc(): void {
  ipcMain.handle('mal:librarySync', async (_event, payload: unknown) =>
    applyMalLibrarySync(payload));

  ipcMain.handle('mal:libraryList', async () => {
    const document = readMalLibrary();
    return { entries: document.entries, summary: summarizeMalLibrary(document) };
  });
}
