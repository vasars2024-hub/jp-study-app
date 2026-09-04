/**
 * Reading Lists — the model, and every rule that decides what a valid document is.
 *
 * Pure on purpose: main owns the file, the renderer owns the surfaces, and both
 * normalize through this module so a document that reached disk before a schema
 * change cannot make either side throw. `docs/ACTIVE/READING_LISTS_PLAN.md` §1 is
 * the design; this file is its executable half.
 *
 * Two decisions here are load-bearing and are the reason the plan rejected the
 * obvious cheaper shapes:
 *
 *   · A list is **not** `collections: string[]` on an item (`shared/types.ts:274`).
 *     A flat string array cannot hold order, a finish date, a per-entry note, or an
 *     entry for a book the user does not own — and "books I want" is most of what a
 *     pasted message contains. So an entry points at a *work*, not at a file.
 *   · The pivot is `ReadingWorkRef`, a book as an idea. One work can be bound to
 *     several library items (epub + a re-rip + a paper copy) and to none at all.
 *     Binding on a title string would make a re-import a different book.
 *
 * Normalization never throws and never drops a record it can repair. It is the
 * only reason a hand-edited or half-written file degrades to "some lists" rather
 * than to zero lists, which §11.4 requires the surface to be able to show.
 */

export const READING_LISTS_SCHEMA_VERSION = 1;

/** How a list is meant to be read. Only `ordered` gives `entry.order` meaning. */
export type ReadingListKind = 'ordered' | 'pool' | 'tiered' | 'challenge' | 'smart';

/**
 * `wanted` is the state a pasted message mostly produces — a title with no file.
 * `abandoned` is first-class rather than a flavour of unfinished, so a book put
 * down on purpose stays out of the pace maths (§5.9).
 */
export type ReadingEntryState =
  | 'wanted'
  | 'owned'
  | 'reading'
  | 'finished'
  | 'abandoned'
  | 'skipped';

/**
 * How a finish was decided. Kept forever, including across an un-finish, because
 * it is the only way to tell which rule misfired when a false positive is
 * reported (§4.3).
 */
export type ReadingFinishSource = 'reader-auto' | 'manual' | 'imported' | 'bulk';

export interface ReadingVolumeRange {
  from: number;
  to?: number;
}

export interface ReadingExternalIds {
  jiten?: string;
  mal?: string;
  vndb?: string;
  isbn?: string;
  asin?: string;
}

/**
 * A binding the matcher scored into the middle band (P2 §3): plausible enough to
 * show, not plausible enough to apply.
 *
 * It lives on the work rather than in a side table because it has exactly the
 * lifetime of the work's `boundItemIds` — a bind clears it, an unbind may
 * repopulate it, and a work deleted with its list takes it along. `signals` is
 * the matcher's own breakdown, kept so the surface can answer "why do you think
 * that" and so a false suggestion can be diagnosed instead of guessed at.
 */
export interface ReadingWorkSuggestion {
  itemId: string;
  /** 0..1, the matcher's score. Between `BIND_SUGGEST` and `BIND_ACCEPT`. */
  confidence: number;
  /** Free-form, small, structural. Never a path or user prose. */
  signals?: Record<string, string | number | boolean>;
  /** Set when the user says no, so the same item is never offered twice. */
  dismissedAt?: number;
}

/** A book as an idea, independent of any file the user happens to hold. */
export interface ReadingWorkRef {
  id: string;
  /** Exactly as it appeared in the source text. Never normalized away. */
  titleRaw: string;
  titleJa?: string;
  titleEn?: string;
  titleRomaji?: string;
  authorRaw?: string;
  /** "vol 1-3" is ONE work with a range, not three entries. */
  volume?: ReadingVolumeRange;
  externalIds?: ReadingExternalIds;
  /** Library items currently believed to BE this work. Many: epub + paper + re-rip. */
  boundItemIds: string[];
  /** 0..1. Below `BIND_ACCEPT` a binding is a suggestion, not a fact. */
  bindConfidence: number;
  /** The "is this it?" chip. Present only while nothing is bound. */
  suggestion?: ReadingWorkSuggestion;
}

/** Which line of which paste produced an entry. Provenance, always. */
export interface ReadingEntrySource {
  importId: string;
  lineIndex: number;
  rawLine: string;
  url?: string;
}

export interface ReadingListEntry {
  id: string;
  workId: string;
  order: number;
  addedAt: number;
  sourceRef?: ReadingEntrySource;
  state: ReadingEntryState;
  startedAt?: number;
  finishedAt?: number;
  finishedBy?: ReadingFinishSource;
  note?: string;
  /** 1..5. */
  rating?: number;
}

/** Every paste that ever fed a list, kept verbatim so a better parser can re-run it. */
export interface ReadingListImport {
  id: string;
  rawText: string;
  pastedAt: number;
  from?: string;
  parserVersion: string;
  entryIds: string[];
}

export interface ReadingListTarget {
  count?: number;
  /** Epoch ms. */
  by?: number;
}

export interface ReadingList {
  id: string;
  name: string;
  kind: ReadingListKind;
  description?: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  /** `challenge` only. */
  target?: ReadingListTarget;
  sourceUrl?: string;
  entries: ReadingListEntry[];
  imports: ReadingListImport[];
}

/**
 * The whole document.
 *
 * Works live beside the lists rather than inside them because one work belongs to
 * many lists and carries one binding — the cross-list finish in §5.1 is only free
 * if there is exactly one record to tick.
 */
export interface ReadingListsDocument {
  schemaVersion: number;
  /** Main owns this. A renderer may return the token it read but cannot choose the next. */
  revision: number;
  lists: ReadingList[];
  works: ReadingWorkRef[];
}

/** Mutations the event log records. One line per applied change. */
export type ReadingListEventKind =
  | 'list-created'
  | 'list-updated'
  | 'list-deleted'
  | 'entry-added'
  | 'entry-updated'
  | 'entry-removed'
  | 'entry-finished'
  | 'entry-unfinished'
  | 'work-bound'
  | 'work-unbound'
  | 'work-suggested'
  | 'import-applied'
  | 'document-recovered';

export interface ReadingListEvent {
  at: number;
  kind: ReadingListEventKind;
  /** The document revision this event produced. */
  revision: number;
  listId?: string;
  entryId?: string;
  workId?: string;
  /** Small, structural, never prose that could name a user-data path. */
  detail?: Record<string, string | number | boolean | null>;
}

const LIST_KINDS = new Set<ReadingListKind>([
  'ordered',
  'pool',
  'tiered',
  'challenge',
  'smart',
]);

const ENTRY_STATES = new Set<ReadingEntryState>([
  'wanted',
  'owned',
  'reading',
  'finished',
  'abandoned',
  'skipped',
]);

const FINISH_SOURCES = new Set<ReadingFinishSource>([
  'reader-auto',
  'manual',
  'imported',
  'bulk',
]);

const EXTERNAL_ID_KEYS: readonly (keyof ReadingExternalIds)[] = [
  'jiten',
  'mal',
  'vndb',
  'isbn',
  'asin',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function emptyReadingListsDocument(): ReadingListsDocument {
  return {
    schemaVersion: READING_LISTS_SCHEMA_VERSION,
    revision: 0,
    lists: [],
    works: [],
  };
}

function normalizeVolume(value: unknown): ReadingVolumeRange | undefined {
  if (!isRecord(value)) return undefined;
  const from = num(value.from);
  if (from === undefined) return undefined;
  const to = num(value.to);
  // A backwards range is repaired rather than dropped: "3-1" is a typo in a text
  // message, and losing the whole work over it is the wrong trade.
  if (to !== undefined && to < from) return { from: to, to: from };
  return to === undefined ? { from } : { from, to };
}

function normalizeExternalIds(value: unknown): ReadingExternalIds | undefined {
  if (!isRecord(value)) return undefined;
  const out: ReadingExternalIds = {};
  let any = false;
  for (const key of EXTERNAL_ID_KEYS) {
    const id = str(value[key]);
    if (id) {
      out[key] = id;
      any = true;
    }
  }
  return any ? out : undefined;
}

function normalizeSuggestion(value: unknown): ReadingWorkSuggestion | undefined {
  if (!isRecord(value)) return undefined;
  const itemId = str(value.itemId);
  // A suggestion with no item points at nothing and would render an empty chip.
  if (!itemId) return undefined;
  const confidence = num(value.confidence);
  const suggestion: ReadingWorkSuggestion = {
    itemId,
    confidence: confidence === undefined ? 0 : Math.min(1, Math.max(0, confidence)),
  };
  if (isRecord(value.signals)) {
    const signals: Record<string, string | number | boolean> = {};
    for (const [key, raw] of Object.entries(value.signals)) {
      if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        signals[key] = raw;
      }
    }
    if (Object.keys(signals).length) suggestion.signals = signals;
  }
  const dismissedAt = num(value.dismissedAt);
  if (dismissedAt !== undefined) suggestion.dismissedAt = dismissedAt;
  return suggestion;
}

export function normalizeReadingWork(value: unknown): ReadingWorkRef | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const titleRaw = str(value.titleRaw);
  // Identity and the source title are the two fields nothing can be reconstructed
  // from, so a record missing either is not repairable and is dropped.
  if (!id || !titleRaw) return null;
  const confidence = num(value.bindConfidence);
  const work: ReadingWorkRef = {
    id,
    titleRaw,
    boundItemIds: arr(value.boundItemIds)
      .map((item) => str(item))
      .filter((item): item is string => !!item),
    bindConfidence:
      confidence === undefined ? 0 : Math.min(1, Math.max(0, confidence)),
  };
  const titleJa = str(value.titleJa);
  if (titleJa) work.titleJa = titleJa;
  const titleEn = str(value.titleEn);
  if (titleEn) work.titleEn = titleEn;
  const titleRomaji = str(value.titleRomaji);
  if (titleRomaji) work.titleRomaji = titleRomaji;
  const authorRaw = str(value.authorRaw);
  if (authorRaw) work.authorRaw = authorRaw;
  const volume = normalizeVolume(value.volume);
  if (volume) work.volume = volume;
  const externalIds = normalizeExternalIds(value.externalIds);
  if (externalIds) work.externalIds = externalIds;
  const suggestion = normalizeSuggestion(value.suggestion);
  // A bound work has nothing left to suggest, and keeping both would let a
  // surface render "owned" and "is this it?" side by side out of one record.
  if (suggestion && !work.boundItemIds.length) work.suggestion = suggestion;
  return work;
}

function normalizeSourceRef(value: unknown): ReadingEntrySource | undefined {
  if (!isRecord(value)) return undefined;
  const importId = str(value.importId);
  if (!importId) return undefined;
  const lineIndex = num(value.lineIndex);
  const source: ReadingEntrySource = {
    importId,
    lineIndex: lineIndex === undefined ? 0 : Math.max(0, Math.trunc(lineIndex)),
    rawLine: typeof value.rawLine === 'string' ? value.rawLine : '',
  };
  const url = str(value.url);
  if (url) source.url = url;
  return source;
}

export function normalizeReadingEntry(value: unknown, index: number): ReadingListEntry | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const workId = str(value.workId);
  if (!id || !workId) return null;
  const order = num(value.order);
  const addedAt = num(value.addedAt);
  const rawState = value.state;
  const entry: ReadingListEntry = {
    id,
    workId,
    order: order === undefined ? index : order,
    addedAt: addedAt === undefined ? 0 : addedAt,
    state:
      typeof rawState === 'string' && ENTRY_STATES.has(rawState as ReadingEntryState)
        ? (rawState as ReadingEntryState)
        : 'wanted',
  };
  const sourceRef = normalizeSourceRef(value.sourceRef);
  if (sourceRef) entry.sourceRef = sourceRef;
  const startedAt = num(value.startedAt);
  if (startedAt !== undefined) entry.startedAt = startedAt;
  const finishedAt = num(value.finishedAt);
  if (finishedAt !== undefined) entry.finishedAt = finishedAt;
  const finishedBy = value.finishedBy;
  if (typeof finishedBy === 'string' && FINISH_SOURCES.has(finishedBy as ReadingFinishSource)) {
    entry.finishedBy = finishedBy as ReadingFinishSource;
  }
  const note = str(value.note);
  if (note) entry.note = note;
  const rating = num(value.rating);
  if (rating !== undefined) entry.rating = Math.min(5, Math.max(1, Math.round(rating)));
  // A `finished` entry with no timestamp is repaired to `owned` rather than kept:
  // it would otherwise count toward "7 of 20 finished" with nothing behind it, and
  // §4.5 needs a date to un-finish back to.
  if (entry.state === 'finished' && entry.finishedAt === undefined) entry.state = 'owned';
  return entry;
}

function normalizeImport(value: unknown): ReadingListImport | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  const pastedAt = num(value.pastedAt);
  const record: ReadingListImport = {
    id,
    rawText: typeof value.rawText === 'string' ? value.rawText : '',
    pastedAt: pastedAt === undefined ? 0 : pastedAt,
    parserVersion: str(value.parserVersion) ?? '0',
    entryIds: arr(value.entryIds)
      .map((item) => str(item))
      .filter((item): item is string => !!item),
  };
  const from = str(value.from);
  if (from) record.from = from;
  return record;
}

function normalizeTarget(value: unknown): ReadingListTarget | undefined {
  if (!isRecord(value)) return undefined;
  const target: ReadingListTarget = {};
  const count = num(value.count);
  if (count !== undefined) target.count = Math.max(0, Math.trunc(count));
  const by = num(value.by);
  if (by !== undefined) target.by = by;
  return target.count === undefined && target.by === undefined ? undefined : target;
}

export function normalizeReadingList(value: unknown): ReadingList | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  const createdAt = num(value.createdAt);
  const updatedAt = num(value.updatedAt);
  const rawKind = value.kind;
  const list: ReadingList = {
    id,
    // An unnamed list is still a list; the surface shows a placeholder rather than
    // losing the entries under it.
    name: str(value.name) ?? '',
    kind:
      typeof rawKind === 'string' && LIST_KINDS.has(rawKind as ReadingListKind)
        ? (rawKind as ReadingListKind)
        : 'pool',
    createdAt: createdAt === undefined ? 0 : createdAt,
    updatedAt: updatedAt === undefined ? (createdAt ?? 0) : updatedAt,
    entries: [],
    imports: [],
  };
  const description = str(value.description);
  if (description) list.description = description;
  const archivedAt = num(value.archivedAt);
  if (archivedAt !== undefined) list.archivedAt = archivedAt;
  const target = normalizeTarget(value.target);
  if (target) list.target = target;
  const sourceUrl = str(value.sourceUrl);
  if (sourceUrl) list.sourceUrl = sourceUrl;

  const seenEntries = new Set<string>();
  list.entries = arr(value.entries)
    .map((entry, index) => normalizeReadingEntry(entry, index))
    .filter((entry): entry is ReadingListEntry => {
      if (!entry || seenEntries.has(entry.id)) return false;
      seenEntries.add(entry.id);
      return true;
    })
    .sort((a, b) => a.order - b.order);

  const seenImports = new Set<string>();
  list.imports = arr(value.imports)
    .map((record) => normalizeImport(record))
    .filter((record): record is ReadingListImport => {
      if (!record || seenImports.has(record.id)) return false;
      seenImports.add(record.id);
      return true;
    });
  return list;
}

/**
 * Re-derives a whole document from whatever was handed over.
 *
 * Deliberately total: any input, including `undefined`, a string, or a file
 * truncated mid-write, yields a usable document. Entries pointing at a work that
 * is not in `works` are KEPT — the plan's late binding (§3.1) means a work record
 * can arrive after the entry that wants it, and dropping the entry would silently
 * delete a book off a user's list because an enrichment step had not run yet.
 */
export function normalizeReadingListsDocument(value: unknown): ReadingListsDocument {
  if (!isRecord(value)) return emptyReadingListsDocument();
  const revision = num(value.revision);
  const schemaVersion = num(value.schemaVersion);
  const seenLists = new Set<string>();
  const seenWorks = new Set<string>();
  return {
    schemaVersion:
      schemaVersion === undefined
        ? READING_LISTS_SCHEMA_VERSION
        : Math.max(1, Math.trunc(schemaVersion)),
    revision: revision === undefined ? 0 : Math.max(0, Math.trunc(revision)),
    lists: arr(value.lists)
      .map((list) => normalizeReadingList(list))
      .filter((list): list is ReadingList => {
        if (!list || seenLists.has(list.id)) return false;
        seenLists.add(list.id);
        return true;
      }),
    works: arr(value.works)
      .map((work) => normalizeReadingWork(work))
      .filter((work): work is ReadingWorkRef => {
        if (!work || seenWorks.has(work.id)) return false;
        seenWorks.add(work.id);
        return true;
      }),
  };
}

/** `N of M finished`, computed once so no two surfaces can disagree about it. */
export function readingListProgress(list: ReadingList): { finished: number; total: number } {
  let finished = 0;
  let total = 0;
  for (const entry of list.entries) {
    // Abandoned and skipped are neither numerator nor denominator: a list of 20
    // with 3 put down on purpose is "7 of 17", not "7 of 20" forever (§5.9).
    if (entry.state === 'abandoned' || entry.state === 'skipped') continue;
    total += 1;
    if (entry.state === 'finished') finished += 1;
  }
  return { finished, total };
}

/** Every list holding an entry for `workId`. The fan-out target of one finish (§4.4). */
export function listsContainingWork(
  document: ReadingListsDocument,
  workId: string,
): ReadingList[] {
  return document.lists.filter((list) =>
    list.entries.some((entry) => entry.workId === workId),
  );
}

/** The work a library item is currently bound to, if any. */
export function workForItem(
  document: ReadingListsDocument,
  itemId: string,
): ReadingWorkRef | null {
  return document.works.find((work) => work.boundItemIds.includes(itemId)) ?? null;
}
