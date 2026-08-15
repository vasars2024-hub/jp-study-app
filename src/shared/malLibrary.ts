/**
 * The anime/manga library the MAL sync writes into — the pure half.
 *
 * `MAL_ANIME_PIPELINE_PLAN.md` defect 1: `malFetchList` had exactly one caller,
 * the settings panel, which did `setListCount(data.entries.length)` and dropped
 * 1,426 real titles on the floor. Nothing in the app could then answer "which
 * shows do I own the vocabulary of", which is the entry point P4's subtitle
 * harvest and P5's mining both need. This module is that store's merge logic:
 * total functions over their arguments, no I/O and no clock, so the identity and
 * dedupe rules are testable without a token. The file lives in
 * `main/malLibrary.ts`.
 *
 * ## Identity is `media:malId`, and that is the whole dedupe rule
 *
 * Gate 11 ("a second sync produces no duplicates") is not a diffing problem — it
 * is an identity problem, and MAL already hands us a stable primary key. The
 * media kind is part of the key because MAL numbers anime and manga in separate
 * spaces: anime 5081 is Bakemonogatari and manga 5081 is something else
 * entirely, so a bare id would collide the day the manga list is synced.
 *
 * ## A list row outranks a derivative, and never the other way round
 *
 * The same title can arrive twice: once because the user has it on their list,
 * once because it is the sequel of something else they finished. The list row
 * carries the user's own status, score and progress; the derivative row carries
 * only how it was reached. So a derivative merged over an existing list row
 * keeps the list fields and merely records the relation — while a list row
 * merged over an existing derivative promotes it. Getting this backwards silently
 * blanks a user's watch progress on re-sync, which is exactly the class of
 * damage `addedAt` and this ordering exist to prevent.
 */

import type { MalDerivative, MalListEntry, MalListStatus, MalRelationType } from './malSync';

/** Bumped when a stored document needs migrating rather than merely re-reading. */
export const MAL_LIBRARY_SCHEMA_VERSION = 1;

/** MAL numbers anime and manga separately, so the kind is part of the key. */
export type MalLibraryMedia = 'anime' | 'manga';

/** How a row got here. See the header: `list` outranks `derivative`. */
export type MalLibraryOrigin = 'list' | 'derivative';

export interface MalLibraryEntry {
  malId: number;
  media: MalLibraryMedia;
  title: string;
  posterUrl?: string;
  /** What MAL says the series has; 0 for a still-airing show, absent for a derivative. */
  totalEpisodes?: number;
  status?: MalListStatus;
  episodesWatched: number;
  /** MAL's 0–10; 0 means "not rated". */
  score: number;
  rewatching: boolean;
  /** MAL's own `updated_at` for the list row, verbatim — never re-formatted. */
  malUpdatedAt?: string;
  origin: MalLibraryOrigin;
  /** Set only on a row reached through `related_anime`. */
  relation?: MalRelationType;
  /** MAL's own `relation_type_formatted` ("Side Story"), kept verbatim. */
  relationLabel?: string;
  /** The library title whose `related_anime` named this one. */
  fromMalId?: number;
  /** 1 for a direct relation of a seed, 2 for a relation of that. */
  depth?: number;
  /** First sync that saw this row. Never overwritten — it is the "new to me" signal. */
  addedAt: number;
  /** The sync that last touched it, changed or not. */
  syncedAt: number;
}

export interface MalLibraryDocument {
  version: number;
  entries: MalLibraryEntry[];
  /** ms epoch of the last completed sync, or null when none has run. */
  lastSyncAt: number | null;
}

export interface MalLibraryMergeResult {
  document: MalLibraryDocument;
  /** Rows the library had never seen under this key. */
  added: number;
  /** Rows whose stored fields actually changed — gate 12's number. */
  updated: number;
  /** Rows re-seen identical. `added + updated + unchanged` is the incoming count. */
  unchanged: number;
}

export function emptyMalLibrary(): MalLibraryDocument {
  return { version: MAL_LIBRARY_SCHEMA_VERSION, entries: [], lastSyncAt: null };
}

export function malLibraryKey(media: MalLibraryMedia, malId: number): string {
  return `${media}:${malId}`;
}

function isLibraryMedia(value: unknown): value is MalLibraryMedia {
  return value === 'anime' || value === 'manga';
}

/**
 * Everything a re-sync may legitimately overwrite.
 *
 * `addedAt` is absent on purpose, and so is `syncedAt`: one is the row's birth
 * date and the other moves on every sync, so including either would make the
 * "unchanged" count below always read zero.
 */
const MERGEABLE_FIELDS = [
  'title',
  'posterUrl',
  'totalEpisodes',
  'status',
  'episodesWatched',
  'score',
  'rewatching',
  'malUpdatedAt',
  'origin',
  'relation',
  'relationLabel',
  'fromMalId',
  'depth',
] as const satisfies readonly (keyof MalLibraryEntry)[];

function sameStoredFields(a: MalLibraryEntry, b: MalLibraryEntry): boolean {
  return MERGEABLE_FIELDS.every((field) => a[field] === b[field]);
}

/** Drops `undefined` keys so a round-trip through JSON compares equal. */
function compact(entry: MalLibraryEntry): MalLibraryEntry {
  const out = { ...entry };
  for (const key of Object.keys(out) as (keyof MalLibraryEntry)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

function mergeInto(
  document: MalLibraryDocument,
  incoming: MalLibraryEntry[],
  now: number,
  /** Applies the incoming row onto the stored one, respecting origin precedence. */
  combine: (stored: MalLibraryEntry, next: MalLibraryEntry) => MalLibraryEntry,
): MalLibraryMergeResult {
  const byKey = new Map<string, MalLibraryEntry>();
  for (const entry of document.entries) byKey.set(malLibraryKey(entry.media, entry.malId), entry);

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of incoming) {
    const key = malLibraryKey(row.media, row.malId);
    const stored = byKey.get(key);
    if (!stored) {
      byKey.set(key, compact({ ...row, addedAt: now, syncedAt: now }));
      added += 1;
      continue;
    }
    const next = compact({ ...combine(stored, row), addedAt: stored.addedAt, syncedAt: now });
    if (sameStoredFields(stored, next)) unchanged += 1;
    else updated += 1;
    byKey.set(key, next);
  }

  return {
    document: {
      version: MAL_LIBRARY_SCHEMA_VERSION,
      entries: [...byKey.values()],
      lastSyncAt: now,
    },
    added,
    updated,
    unchanged,
  };
}

/**
 * Projects one list row onto a library row.
 *
 * `totalEpisodes: 0` is kept rather than dropped — MAL means "still airing" by
 * it, and an absent field would read as "unknown", which is a different fact.
 */
function fromListEntry(entry: MalListEntry, media: MalLibraryMedia): MalLibraryEntry {
  return {
    malId: entry.animeId,
    media,
    title: entry.title,
    posterUrl: entry.posterUrl,
    totalEpisodes: entry.totalEpisodes,
    status: entry.status,
    episodesWatched: entry.episodesWatched,
    score: entry.score,
    rewatching: entry.rewatching,
    malUpdatedAt: entry.updatedAt,
    origin: 'list',
    addedAt: 0,
    syncedAt: 0,
  };
}

/**
 * Merges a fetched list into the library.
 *
 * This is the write half of gates 10–12: after one sync the real titles are
 * here, a second sync adds nothing, and an entry the user changed on MAL comes
 * back changed. A row already present as a derivative is *promoted* — it keeps
 * how it was reached and gains the user's own status.
 */
export function mergeMalListEntries(
  document: MalLibraryDocument,
  entries: readonly MalListEntry[],
  now: number,
  media: MalLibraryMedia = 'anime',
): MalLibraryMergeResult {
  return mergeInto(
    document,
    entries.map((entry) => fromListEntry(entry, media)),
    now,
    (stored, next) => ({
      ...next,
      // Kept from the derivative row it is being promoted over: how the user
      // could have reached it is still true, and nothing else records it.
      relation: stored.relation,
      relationLabel: stored.relationLabel,
      fromMalId: stored.fromMalId,
      depth: stored.depth,
    }),
  );
}

function fromDerivative(derivative: MalDerivative, media: MalLibraryMedia): MalLibraryEntry {
  return {
    malId: derivative.animeId,
    media,
    title: derivative.title,
    posterUrl: derivative.posterUrl,
    episodesWatched: 0,
    score: 0,
    rewatching: false,
    origin: 'derivative',
    relation: derivative.relation,
    relationLabel: derivative.relationLabel,
    fromMalId: derivative.fromAnimeId,
    depth: derivative.depth,
    addedAt: 0,
    syncedAt: 0,
  };
}

/**
 * Merges a `related_anime` walk into the library.
 *
 * A derivative that is already on the user's list must not overwrite it: it
 * carries `episodesWatched: 0` and no status, so applying it wholesale would
 * blank real progress. Only the relation fields are written onto such a row.
 */
export function mergeMalDerivatives(
  document: MalLibraryDocument,
  derivatives: readonly MalDerivative[],
  now: number,
  media: MalLibraryMedia = 'anime',
): MalLibraryMergeResult {
  return mergeInto(
    document,
    derivatives.map((derivative) => fromDerivative(derivative, media)),
    now,
    (stored, next) => ({
      ...stored,
      relation: next.relation,
      relationLabel: next.relationLabel,
      fromMalId: next.fromMalId,
      depth: next.depth,
      // A title the user has on their list stays a list row even when a walk
      // reaches it — see the header.
      origin: stored.origin,
    }),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads a stored document back, tolerantly.
 *
 * A row that has lost its id or its media kind is dropped rather than thrown
 * over: a truncated write should cost the user that row and a re-sync, not the
 * whole library. A document from a future schema version is *not* silently
 * accepted — the caller decides, because reading v2 rows as v1 is how a
 * migration quietly deletes fields.
 */
export function parseMalLibraryDocument(value: unknown): MalLibraryDocument {
  const root = asRecord(value);
  const rows = Array.isArray(root.entries) ? root.entries : [];
  const entries: MalLibraryEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const record = asRecord(row);
    const malId = optionalNumber(record.malId);
    if (malId === undefined) continue;
    if (!isLibraryMedia(record.media)) continue;
    const key = malLibraryKey(record.media, malId);
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push(compact({
      malId: Math.trunc(malId),
      media: record.media,
      title: typeof record.title === 'string' ? record.title : '',
      posterUrl: optionalString(record.posterUrl),
      totalEpisodes: optionalNumber(record.totalEpisodes),
      status: optionalString(record.status) as MalListStatus | undefined,
      episodesWatched: optionalNumber(record.episodesWatched) ?? 0,
      score: optionalNumber(record.score) ?? 0,
      rewatching: record.rewatching === true,
      malUpdatedAt: optionalString(record.malUpdatedAt),
      origin: record.origin === 'derivative' ? 'derivative' : 'list',
      relation: optionalString(record.relation) as MalRelationType | undefined,
      relationLabel: optionalString(record.relationLabel),
      fromMalId: optionalNumber(record.fromMalId),
      depth: optionalNumber(record.depth),
      addedAt: optionalNumber(record.addedAt) ?? 0,
      syncedAt: optionalNumber(record.syncedAt) ?? 0,
    }));
  }

  return {
    version: optionalNumber(root.version) ?? MAL_LIBRARY_SCHEMA_VERSION,
    entries,
    lastSyncAt: optionalNumber(root.lastSyncAt) ?? null,
  };
}

/** What the panel shows without shipping 1,400 rows into the renderer at once. */
export interface MalLibrarySummary {
  total: number;
  /** Rows by list status; a derivative that is not on the list has none. */
  byStatus: Record<string, number>;
  derivatives: number;
  lastSyncAt: number | null;
}

export function summarizeMalLibrary(document: MalLibraryDocument): MalLibrarySummary {
  const byStatus: Record<string, number> = {};
  let derivatives = 0;
  for (const entry of document.entries) {
    if (entry.origin === 'derivative') derivatives += 1;
    if (entry.status) byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  }
  return {
    total: document.entries.length,
    byStatus,
    derivatives,
    lastSyncAt: document.lastSyncAt,
  };
}
