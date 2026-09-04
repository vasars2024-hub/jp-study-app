/**
 * Reading Lists — every change a surface can make to the document, as pure
 * functions.
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` P1 is "parser + preview dialog + manual
 * lists". This module is the half between them: the parser produces a
 * `ParsedReadingList`, the store persists a `ReadingListsDocument`, and nothing
 * yet turns one into the other or lets a user rename, reorder, tick or remove
 * anything.
 *
 * Why pure, and why here rather than in a React reducer or in main:
 *
 *   · The write is compare-and-swap (`readingListsBridge.ts`). When main refuses a
 *     write the renderer has to RE-APPLY its intent against the document main just
 *     handed back — which is only possible if the intent is a function of a
 *     document, not a patch computed against a stale one. Every function here has
 *     the shape `(document, …) -> { document, events }`, so a conflict retry is
 *     literally calling it again with the newer document.
 *   · Main runs the completion detector (§4.3) with no renderer involved, and it
 *     needs the same finish semantics the surface uses. Two implementations of
 *     "what finishing means" is exactly how `finishedAt` and `state` drift apart.
 *
 * A no-op returns the SAME document reference and zero events. Callers skip the
 * IPC round trip on identity, so a double-click on "mark finished" costs nothing
 * and does not burn a revision.
 */

import {
  normalizeReadingListsDocument,
  type ReadingEntryState,
  type ReadingFinishSource,
  type ReadingList,
  type ReadingListEntry,
  type ReadingListEvent,
  type ReadingListImport,
  type ReadingListKind,
  type ReadingListTarget,
  type ReadingListsDocument,
  type ReadingWorkRef,
} from './readingLists';
import {
  READING_LIST_PARSER_VERSION,
  type ParsedReadingEntry,
  type ParsedReadingList,
} from './readingListParser';

/** The store mints `revision`, so a caller never supplies one. */
export type PendingReadingListEvent = Omit<ReadingListEvent, 'revision'>;

export interface ReadingListsMutation {
  document: ReadingListsDocument;
  events: PendingReadingListEvent[];
}

/**
 * Time and identity, injected rather than read from the ambient environment, so
 * a test asserts exact ids and timestamps instead of matching shapes.
 */
export interface ReadingListsMutationContext {
  now: number;
  mintId: (prefix: string) => string;
}

export function createReadingListsMutationContext(
  now: number = Date.now(),
): ReadingListsMutationContext {
  let counter = 0;
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? () => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : () => `${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    now,
    mintId: (prefix) => {
      counter += 1;
      return `${prefix}_${random()}${counter.toString(36)}`;
    },
  };
}

function unchanged(document: ReadingListsDocument): ReadingListsMutation {
  return { document, events: [] };
}

function replaceList(
  document: ReadingListsDocument,
  listId: string,
  replace: (list: ReadingList) => ReadingList,
): ReadingListsDocument {
  return {
    ...document,
    lists: document.lists.map((list) => (list.id === listId ? replace(list) : list)),
  };
}

/**
 * A work is kept only while some entry on some list points at it.
 *
 * Without this, deleting a 40-book list leaves 40 works behind forever and the
 * next import cannot tell an orphan from a work that is genuinely shared. The
 * undo payloads below carry the works they dropped, so the collection is
 * reversible rather than destructive.
 */
function collectOrphanWorks(document: ReadingListsDocument): {
  document: ReadingListsDocument;
  dropped: ReadingWorkRef[];
} {
  const referenced = new Set<string>();
  for (const list of document.lists) {
    for (const entry of list.entries) referenced.add(entry.workId);
  }
  const dropped = document.works.filter((work) => !referenced.has(work.id));
  if (!dropped.length) return { document, dropped };
  return {
    document: { ...document, works: document.works.filter((work) => referenced.has(work.id)) },
    dropped,
  };
}

/* ------------------------------------------------------------------ lists -- */

export interface CreateReadingListInput {
  name: string;
  kind?: ReadingListKind;
  description?: string;
  sourceUrl?: string;
  target?: ReadingListTarget;
}

export function createReadingList(
  document: ReadingListsDocument,
  input: CreateReadingListInput,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { listId: string } {
  const id = context.mintId('rl');
  const list: ReadingList = {
    id,
    name: input.name.trim(),
    kind: input.kind ?? 'pool',
    createdAt: context.now,
    updatedAt: context.now,
    entries: [],
    imports: [],
  };
  if (input.description?.trim()) list.description = input.description.trim();
  if (input.sourceUrl?.trim()) list.sourceUrl = input.sourceUrl.trim();
  if (input.target) list.target = input.target;
  return {
    listId: id,
    document: { ...document, lists: [...document.lists, list] },
    events: [
      {
        at: context.now,
        kind: 'list-created',
        listId: id,
        detail: { kind: list.kind },
      },
    ],
  };
}

export interface UpdateReadingListPatch {
  name?: string;
  kind?: ReadingListKind;
  description?: string | null;
  sourceUrl?: string | null;
  target?: ReadingListTarget | null;
  archived?: boolean;
}

export function updateReadingList(
  document: ReadingListsDocument,
  listId: string,
  patch: UpdateReadingListPatch,
  context: ReadingListsMutationContext,
): ReadingListsMutation {
  const current = document.lists.find((list) => list.id === listId);
  if (!current) return unchanged(document);

  const next: ReadingList = { ...current };
  const changed: string[] = [];

  if (patch.name !== undefined && patch.name.trim() !== current.name) {
    next.name = patch.name.trim();
    changed.push('name');
  }
  if (patch.kind !== undefined && patch.kind !== current.kind) {
    next.kind = patch.kind;
    changed.push('kind');
  }
  if (patch.description !== undefined) {
    const value = patch.description?.trim() || undefined;
    if (value !== current.description) {
      if (value) next.description = value;
      else delete next.description;
      changed.push('description');
    }
  }
  if (patch.sourceUrl !== undefined) {
    const value = patch.sourceUrl?.trim() || undefined;
    if (value !== current.sourceUrl) {
      if (value) next.sourceUrl = value;
      else delete next.sourceUrl;
      changed.push('sourceUrl');
    }
  }
  if (patch.target !== undefined) {
    if (patch.target) next.target = patch.target;
    else delete next.target;
    changed.push('target');
  }
  if (patch.archived !== undefined) {
    const isArchived = current.archivedAt !== undefined;
    if (patch.archived !== isArchived) {
      if (patch.archived) next.archivedAt = context.now;
      else delete next.archivedAt;
      changed.push('archived');
    }
  }

  if (!changed.length) return unchanged(document);
  next.updatedAt = context.now;
  return {
    document: replaceList(document, listId, () => next),
    events: [
      {
        at: context.now,
        kind: 'list-updated',
        listId,
        detail: { fields: changed.join(',') },
      },
    ],
  };
}

/** What `deleteReadingList` removed, and everything `restoreReadingList` needs. */
export interface RemovedReadingList {
  list: ReadingList;
  works: ReadingWorkRef[];
}

export function deleteReadingList(
  document: ReadingListsDocument,
  listId: string,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { removed: RemovedReadingList | null } {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list) return { ...unchanged(document), removed: null };
  const withoutList: ReadingListsDocument = {
    ...document,
    lists: document.lists.filter((entry) => entry.id !== listId),
  };
  const { document: collected, dropped } = collectOrphanWorks(withoutList);
  return {
    document: collected,
    removed: { list, works: dropped },
    events: [
      {
        at: context.now,
        kind: 'list-deleted',
        listId,
        detail: { entries: list.entries.length, name: list.name },
      },
    ],
  };
}

/**
 * Undo for `deleteReadingList`, and §11.4's "undo, everywhere" for the most
 * destructive action on the surface. The list goes back where it was rather than
 * to the end: a delete-then-undo that silently reorders the grid reads as a
 * second bug.
 */
export function restoreReadingList(
  document: ReadingListsDocument,
  removed: RemovedReadingList,
  index: number,
  context: ReadingListsMutationContext,
): ReadingListsMutation {
  if (document.lists.some((list) => list.id === removed.list.id)) return unchanged(document);
  const lists = [...document.lists];
  lists.splice(Math.max(0, Math.min(index, lists.length)), 0, removed.list);
  const known = new Set(document.works.map((work) => work.id));
  return {
    document: {
      ...document,
      lists,
      works: [...document.works, ...removed.works.filter((work) => !known.has(work.id))],
    },
    events: [
      {
        at: context.now,
        kind: 'list-created',
        listId: removed.list.id,
        detail: { restored: true, entries: removed.list.entries.length },
      },
    ],
  };
}

/* ----------------------------------------------------------------- works -- */

/**
 * The key an in-list dedupe compares on (§5.7 — "dedupe on work identity, not
 * string equality").
 *
 * Deliberately narrow. It folds case, width and spacing, and it prefers the
 * Japanese title when there is one so `Convenience Store Woman` and
 * `コンビニ人間` from two different messages collapse into one entry. It does NOT
 * transliterate or fuzzy-match: that is the matcher's job in P2, it needs a
 * confidence score, and a silent fuzzy merge inside an import is precisely the
 * "titles are not identity" trap the plan's §10.4 names.
 */
export function readingWorkKey(work: {
  titleRaw: string;
  titleJa?: string;
  volume?: { from: number; to?: number };
}): string {
  // NFKC folds the ideographic space to U+0020 before `\s` ever sees it, so one
  // class covers both. Spelling U+3000 out here instead trips `no-irregular-whitespace`.
  const title = (work.titleJa ?? work.titleRaw)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
  const volume = work.volume ? `#${work.volume.from}-${work.volume.to ?? work.volume.from}` : '';
  return `${title}${volume}`;
}

function workFromParsed(
  parsed: ParsedReadingEntry,
  context: ReadingListsMutationContext,
): ReadingWorkRef {
  const work: ReadingWorkRef = {
    id: context.mintId('rw'),
    titleRaw: parsed.title,
    boundItemIds: [],
    // Nothing has been matched against the library yet, so the binding claim is
    // zero rather than a hopeful default. P2 is what raises this.
    bindConfidence: 0,
  };
  if (parsed.titleJa) work.titleJa = parsed.titleJa;
  if (parsed.titleEn) work.titleEn = parsed.titleEn;
  if (parsed.author) work.authorRaw = parsed.author;
  if (parsed.volume) work.volume = parsed.volume;
  return work;
}

function replaceWork(
  document: ReadingListsDocument,
  workId: string,
  replace: (work: ReadingWorkRef) => ReadingWorkRef,
): ReadingListsDocument {
  return {
    ...document,
    works: document.works.map((work) => (work.id === workId ? replace(work) : work)),
  };
}

/**
 * Entry states a binding may move, and the one direction it may move them.
 *
 * `wanted` is the only state a bind promotes: a work the user is already
 * `reading`, has `finished`, `abandoned` or `skipped` has a state the user
 * earned, and a file arriving on disk is not a reason to overwrite it. The
 * inverse is symmetric — an unbind demotes `owned` and nothing else.
 */
function promoteEntries(
  document: ReadingListsDocument,
  workId: string,
  from: ReadingEntryState,
  to: ReadingEntryState,
): { document: ReadingListsDocument; entryIds: string[] } {
  const entryIds: string[] = [];
  const lists = document.lists.map((list) => {
    let touched = false;
    const entries = list.entries.map((entry) => {
      if (entry.workId !== workId || entry.state !== from) return entry;
      touched = true;
      entryIds.push(entry.id);
      return { ...entry, state: to };
    });
    return touched ? { ...list, entries } : list;
  });
  return { document: entryIds.length ? { ...document, lists } : document, entryIds };
}

export interface ReadingBindResult extends ReadingListsMutation {
  /** False when the work was unknown or the binding was already exactly this. */
  bound: boolean;
  /** Entries this binding moved `wanted` -> `owned`. The undo target. */
  promotedEntryIds: string[];
}

/**
 * Binds a library item to a work — §3(a)'s accept branch, and the only thing
 * that turns a pasted title into a book the user holds.
 *
 * `bindConfidence` is the highest claim ever made for this work rather than the
 * latest: a second, weaker binding (a re-rip, a paper copy) must not downgrade a
 * certainty the first one earned, and §1's comment already reads it as "below
 * `BIND_ACCEPT` this is a suggestion, not a fact".
 */
export function bindReadingWork(
  document: ReadingListsDocument,
  workId: string,
  itemId: string,
  confidence: number,
  context: ReadingListsMutationContext,
): ReadingBindResult {
  const work = document.works.find((entry) => entry.id === workId);
  if (!work || !itemId.trim()) {
    return { ...unchanged(document), bound: false, promotedEntryIds: [] };
  }
  const already = work.boundItemIds.includes(itemId);
  const nextConfidence = Math.min(1, Math.max(work.bindConfidence, confidence));
  if (already && nextConfidence === work.bindConfidence && !work.suggestion) {
    return { ...unchanged(document), bound: false, promotedEntryIds: [] };
  }

  const withWork = replaceWork(document, workId, (current) => {
    const next: ReadingWorkRef = {
      ...current,
      boundItemIds: already ? current.boundItemIds : [...current.boundItemIds, itemId],
      bindConfidence: nextConfidence,
    };
    // A bound work has nothing to ask about. Dropping the suggestion here is what
    // keeps `normalizeReadingWork`'s same rule from having to repair the document.
    delete next.suggestion;
    return next;
  });
  const promoted = promoteEntries(withWork, workId, 'wanted', 'owned');

  return {
    document: promoted.document,
    bound: true,
    promotedEntryIds: promoted.entryIds,
    events: [
      {
        at: context.now,
        kind: 'work-bound',
        workId,
        detail: {
          itemId,
          confidence: Number(nextConfidence.toFixed(4)),
          promoted: promoted.entryIds.length,
        },
      },
    ],
  };
}

/**
 * The reverse of a bind. §11.4 — every destructive action is undoable, and a
 * wrong auto-bind is the most likely destructive action this feature performs.
 *
 * Losing the last binding demotes `owned` back to `wanted` and drops the
 * confidence to zero, because "I own this" was the binding's claim and nothing
 * else was carrying it. States the user set by hand are untouched.
 */
export function unbindReadingWork(
  document: ReadingListsDocument,
  workId: string,
  itemId: string,
  context: ReadingListsMutationContext,
): ReadingBindResult {
  const work = document.works.find((entry) => entry.id === workId);
  if (!work || !work.boundItemIds.includes(itemId)) {
    return { ...unchanged(document), bound: false, promotedEntryIds: [] };
  }
  const remaining = work.boundItemIds.filter((id) => id !== itemId);
  const withWork = replaceWork(document, workId, (current) => ({
    ...current,
    boundItemIds: remaining,
    bindConfidence: remaining.length ? current.bindConfidence : 0,
  }));
  const demoted = remaining.length
    ? { document: withWork, entryIds: [] as string[] }
    : promoteEntries(withWork, workId, 'owned', 'wanted');

  return {
    document: demoted.document,
    bound: false,
    promotedEntryIds: demoted.entryIds,
    events: [
      {
        at: context.now,
        kind: 'work-unbound',
        workId,
        detail: { itemId, remaining: remaining.length, demoted: demoted.entryIds.length },
      },
    ],
  };
}

export interface ReadingSuggestionInput {
  itemId: string;
  confidence: number;
  signals?: Record<string, string | number | boolean>;
}

/**
 * §3(a)'s middle band: shown as "is this it?", never applied.
 *
 * Refuses three ways, all of them silent no-ops rather than errors, because the
 * late binder (§3.1) calls this on every library import and a refusal is the
 * normal case: a work that is already bound has nothing to ask; the same item
 * at the same confidence is the answer already on screen; and an item the user
 * has already said no to is never offered a second time.
 */
export function suggestReadingWorkBinding(
  document: ReadingListsDocument,
  workId: string,
  input: ReadingSuggestionInput,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { suggested: boolean } {
  const work = document.works.find((entry) => entry.id === workId);
  if (!work || work.boundItemIds.length || !input.itemId.trim()) {
    return { ...unchanged(document), suggested: false };
  }
  const current = work.suggestion;
  if (current?.itemId === input.itemId) {
    if (current.dismissedAt !== undefined) return { ...unchanged(document), suggested: false };
    if (current.confidence === input.confidence) {
      return { ...unchanged(document), suggested: false };
    }
  }

  return {
    document: replaceWork(document, workId, (entry) => ({
      ...entry,
      suggestion: {
        itemId: input.itemId,
        confidence: Math.min(1, Math.max(0, input.confidence)),
        ...(input.signals ? { signals: input.signals } : {}),
      },
    })),
    suggested: true,
    events: [
      {
        at: context.now,
        kind: 'work-suggested',
        workId,
        detail: { itemId: input.itemId, confidence: Number(input.confidence.toFixed(4)) },
      },
    ],
  };
}

/**
 * "No, that is not it."
 *
 * The record is kept with a timestamp rather than deleted: deleting it would let
 * the very next library import re-offer the same wrong item, which is the shape
 * of a notification that cannot be turned off.
 */
export function dismissReadingWorkSuggestion(
  document: ReadingListsDocument,
  workId: string,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { dismissed: boolean } {
  const work = document.works.find((entry) => entry.id === workId);
  if (!work?.suggestion || work.suggestion.dismissedAt !== undefined) {
    return { ...unchanged(document), dismissed: false };
  }
  const { itemId } = work.suggestion;
  const dismissed = { ...work.suggestion, dismissedAt: context.now };
  return {
    document: replaceWork(document, workId, (entry) => ({ ...entry, suggestion: dismissed })),
    dismissed: true,
    events: [
      { at: context.now, kind: 'work-suggested', workId, detail: { itemId, dismissed: true } },
    ],
  };
}

/** Undo for the above. Restores the chip exactly as it was, minus the refusal. */
export function restoreReadingWorkSuggestion(
  document: ReadingListsDocument,
  workId: string,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { restored: boolean } {
  const work = document.works.find((entry) => entry.id === workId);
  if (!work?.suggestion || work.suggestion.dismissedAt === undefined) {
    return { ...unchanged(document), restored: false };
  }
  const { itemId } = work.suggestion;
  const restored = { ...work.suggestion };
  delete restored.dismissedAt;
  return {
    document: replaceWork(document, workId, (entry) => ({ ...entry, suggestion: restored })),
    restored: true,
    events: [
      { at: context.now, kind: 'work-suggested', workId, detail: { itemId, restored: true } },
    ],
  };
}

/* --------------------------------------------------------------- entries -- */

export interface ApplyImportOptions {
  /** Exactly what was pasted. Stored unmodified so §2.4's re-parse is possible. */
  rawText: string;
  from?: string;
  /** Entries the preview dropped, by `lineIndex`. §2.5 — paste never writes blind. */
  excludeLineIndexes?: readonly number[];
}

/**
 * Turns a parse into entries on a list, with the paste kept verbatim beside them.
 *
 * The preview (§2.5) is the caller: it hands back the parse it is showing, minus
 * whatever the user unticked. Entries whose work already exists on this list are
 * skipped rather than duplicated, and the skipped count is in the event so
 * "pasted 12, added 9" can be said honestly instead of silently.
 */
export function applyReadingListImport(
  document: ReadingListsDocument,
  listId: string,
  parsed: ParsedReadingList,
  options: ApplyImportOptions,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { importId: string | null; added: number; skipped: number } {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list) return { ...unchanged(document), importId: null, added: 0, skipped: 0 };

  const excluded = new Set(options.excludeLineIndexes ?? []);
  const candidates = parsed.entries.filter((entry) => !excluded.has(entry.lineIndex));

  const worksById = new Map(document.works.map((work) => [work.id, work]));
  const existingKeys = new Set<string>();
  for (const entry of list.entries) {
    const work = worksById.get(entry.workId);
    if (work) existingKeys.add(readingWorkKey(work));
  }

  const importId = context.mintId('ri');
  const newWorks: ReadingWorkRef[] = [];
  const newEntries: ReadingListEntry[] = [];
  let order = list.entries.length;
  let skipped = 0;

  for (const candidate of candidates) {
    const work = workFromParsed(candidate, context);
    const key = readingWorkKey(work);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    newWorks.push(work);
    const entry: ReadingListEntry = {
      id: context.mintId('re'),
      workId: work.id,
      order,
      addedAt: context.now,
      // A pasted title is a book you want, not one you hold. P2's matcher is what
      // promotes it to `owned`; claiming ownership here would make the wanted
      // filter — which is the shopping list (§5.2) — wrong on day one.
      state: 'wanted',
      sourceRef: {
        importId,
        lineIndex: candidate.lineIndex,
        rawLine: candidate.rawLine,
        ...(candidate.url ? { url: candidate.url } : {}),
      },
    };
    newEntries.push(entry);
    order += 1;
  }

  if (!newEntries.length && skipped === 0) {
    return { ...unchanged(document), importId: null, added: 0, skipped: 0 };
  }

  const record: ReadingListImport = {
    id: importId,
    rawText: options.rawText,
    pastedAt: context.now,
    parserVersion: parsed.parserVersion || READING_LIST_PARSER_VERSION,
    entryIds: newEntries.map((entry) => entry.id),
  };
  if (options.from?.trim()) record.from = options.from.trim();

  const next = replaceList(document, listId, (current) => ({
    ...current,
    updatedAt: context.now,
    entries: [...current.entries, ...newEntries],
    imports: [...current.imports, record],
    // A URL that stood alone in the message belongs to the list (§2.1). The first
    // paste sets it; a later one does not overwrite a URL already recorded.
    ...(parsed.sourceUrl && !current.sourceUrl ? { sourceUrl: parsed.sourceUrl } : {}),
  }));

  return {
    document: { ...next, works: [...next.works, ...newWorks] },
    importId,
    added: newEntries.length,
    skipped,
    events: [
      {
        at: context.now,
        kind: 'import-applied',
        listId,
        detail: {
          importId,
          added: newEntries.length,
          skipped,
          segmentation: parsed.segmentation,
          parserVersion: record.parserVersion,
        },
      },
    ],
  };
}

export interface ManualEntryInput {
  title: string;
  titleJa?: string;
  titleEn?: string;
  author?: string;
  volume?: { from: number; to?: number };
  state?: ReadingEntryState;
  note?: string;
}

/** "Add from your library" and the empty-list invitation both land here. */
export function addReadingListEntry(
  document: ReadingListsDocument,
  listId: string,
  input: ManualEntryInput,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { entryId: string | null } {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list || !input.title.trim()) return { ...unchanged(document), entryId: null };

  const work = workFromParsed(
    {
      rawLine: input.title,
      lineIndex: 0,
      title: input.title.trim(),
      ...(input.titleJa ? { titleJa: input.titleJa } : {}),
      ...(input.titleEn ? { titleEn: input.titleEn } : {}),
      ...(input.author ? { author: input.author } : {}),
      ...(input.volume ? { volume: input.volume } : {}),
    },
    context,
  );

  const entry: ReadingListEntry = {
    id: context.mintId('re'),
    workId: work.id,
    order: list.entries.length,
    addedAt: context.now,
    state: input.state ?? 'wanted',
  };
  if (input.note?.trim()) entry.note = input.note.trim();

  const next = replaceList(document, listId, (current) => ({
    ...current,
    updatedAt: context.now,
    entries: [...current.entries, entry],
  }));
  return {
    document: { ...next, works: [...next.works, work] },
    entryId: entry.id,
    events: [
      {
        at: context.now,
        kind: 'entry-added',
        listId,
        entryId: entry.id,
        workId: work.id,
        detail: { manual: true },
      },
    ],
  };
}

export interface RemovedReadingEntry {
  listId: string;
  entry: ReadingListEntry;
  index: number;
  works: ReadingWorkRef[];
}

export function removeReadingListEntry(
  document: ReadingListsDocument,
  listId: string,
  entryId: string,
  context: ReadingListsMutationContext,
): ReadingListsMutation & { removed: RemovedReadingEntry | null } {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list) return { ...unchanged(document), removed: null };
  const index = list.entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) return { ...unchanged(document), removed: null };
  const entry = list.entries[index];

  const withoutEntry = replaceList(document, listId, (current) => ({
    ...current,
    updatedAt: context.now,
    entries: current.entries.filter((item) => item.id !== entryId),
  }));
  const { document: collected, dropped } = collectOrphanWorks(withoutEntry);
  return {
    document: collected,
    removed: { listId, entry, index, works: dropped },
    events: [
      {
        at: context.now,
        kind: 'entry-removed',
        listId,
        entryId,
        workId: entry.workId,
        detail: { state: entry.state },
      },
    ],
  };
}

export function restoreReadingListEntry(
  document: ReadingListsDocument,
  removed: RemovedReadingEntry,
  context: ReadingListsMutationContext,
): ReadingListsMutation {
  const list = document.lists.find((entry) => entry.id === removed.listId);
  if (!list || list.entries.some((entry) => entry.id === removed.entry.id)) {
    return unchanged(document);
  }
  const entries = [...list.entries];
  entries.splice(Math.max(0, Math.min(removed.index, entries.length)), 0, removed.entry);
  const known = new Set(document.works.map((work) => work.id));
  const next = replaceList(document, removed.listId, (current) => ({
    ...current,
    updatedAt: context.now,
    entries,
  }));
  return {
    document: {
      ...next,
      works: [...next.works, ...removed.works.filter((work) => !known.has(work.id))],
    },
    events: [
      {
        at: context.now,
        kind: 'entry-added',
        listId: removed.listId,
        entryId: removed.entry.id,
        workId: removed.entry.workId,
        detail: { restored: true },
      },
    ],
  };
}

/**
 * The one place a state transition is decided, including what finishing means.
 *
 * §4.5: un-finishing is always available and "does not delete the finish from the
 * log" — so the previous `finishedAt`/`finishedBy` travel into the
 * `entry-unfinished` event's detail before the fields are cleared. Keeping them on
 * the entry instead would leave a record that reads as finished to anything
 * checking `finishedBy`, and `normalizeReadingEntry` already repairs a `finished`
 * state with no date, so the two would fight.
 */
export function setReadingEntryState(
  document: ReadingListsDocument,
  listId: string,
  entryId: string,
  state: ReadingEntryState,
  context: ReadingListsMutationContext,
  finishedBy: ReadingFinishSource = 'manual',
): ReadingListsMutation {
  const list = document.lists.find((entry) => entry.id === listId);
  const current = list?.entries.find((entry) => entry.id === entryId);
  if (!list || !current) return unchanged(document);
  if (current.state === state) return unchanged(document);

  const next: ReadingListEntry = { ...current, state };
  const events: PendingReadingListEvent[] = [];

  if (state === 'finished') {
    next.finishedAt = context.now;
    next.finishedBy = finishedBy;
    if (next.startedAt === undefined) next.startedAt = context.now;
    events.push({
      at: context.now,
      kind: 'entry-finished',
      listId,
      entryId,
      workId: current.workId,
      detail: { by: finishedBy, from: current.state },
    });
  } else if (current.state === 'finished') {
    events.push({
      at: context.now,
      kind: 'entry-unfinished',
      listId,
      entryId,
      workId: current.workId,
      detail: {
        to: state,
        finishedAt: current.finishedAt ?? null,
        finishedBy: current.finishedBy ?? null,
      },
    });
    delete next.finishedAt;
    delete next.finishedBy;
  } else {
    if (state === 'reading' && next.startedAt === undefined) next.startedAt = context.now;
    events.push({
      at: context.now,
      kind: 'entry-updated',
      listId,
      entryId,
      workId: current.workId,
      detail: { from: current.state, to: state },
    });
  }

  return {
    document: replaceList(document, listId, (item) => ({
      ...item,
      updatedAt: context.now,
      entries: item.entries.map((entry) => (entry.id === entryId ? next : entry)),
    })),
    events,
  };
}

/**
 * §4.4 fan-out: one finish ticks the work on EVERY list it belongs to, in one
 * mutation. This is the reason the model has a `works` array beside the lists at
 * all — the cross-list finish is only free if there is one identity to tick.
 *
 * Entries already `finished`, `abandoned` or `skipped` are left alone: a book put
 * down on purpose on one list must not be resurrected as finished by a finish on
 * another.
 */
export function finishReadingWorkEverywhere(
  document: ReadingListsDocument,
  workId: string,
  context: ReadingListsMutationContext,
  finishedBy: ReadingFinishSource = 'manual',
): ReadingListsMutation & { ticked: number } {
  let ticked = 0;
  const events: PendingReadingListEvent[] = [];
  const lists = document.lists.map((list) => {
    let touched = false;
    const entries = list.entries.map((entry) => {
      if (entry.workId !== workId) return entry;
      if (entry.state === 'finished' || entry.state === 'abandoned' || entry.state === 'skipped') {
        return entry;
      }
      touched = true;
      ticked += 1;
      events.push({
        at: context.now,
        kind: 'entry-finished',
        listId: list.id,
        entryId: entry.id,
        workId,
        detail: { by: finishedBy, from: entry.state, fanOut: true },
      });
      return {
        ...entry,
        state: 'finished' as const,
        finishedAt: context.now,
        finishedBy,
        startedAt: entry.startedAt ?? context.now,
      };
    });
    return touched ? { ...list, updatedAt: context.now, entries } : list;
  });
  if (!ticked) return { ...unchanged(document), ticked: 0 };
  return { document: { ...document, lists }, events, ticked };
}

/**
 * Drag-to-reorder (§11.4). Ids not named keep their relative order behind the
 * named ones rather than being dropped — a reorder that loses an entry because
 * the surface was filtered is a data-loss bug wearing a UI bug's clothes.
 */
export function reorderReadingListEntries(
  document: ReadingListsDocument,
  listId: string,
  orderedEntryIds: readonly string[],
  context: ReadingListsMutationContext,
): ReadingListsMutation {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list) return unchanged(document);

  const byId = new Map(list.entries.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const ordered: ReadingListEntry[] = [];
  for (const id of orderedEntryIds) {
    const entry = byId.get(id);
    if (!entry || seen.has(id)) continue;
    seen.add(id);
    ordered.push(entry);
  }
  for (const entry of list.entries) {
    if (!seen.has(entry.id)) ordered.push(entry);
  }

  const renumbered = ordered.map((entry, index) => ({ ...entry, order: index }));
  const same = renumbered.every((entry, index) => list.entries[index]?.id === entry.id);
  if (same) return unchanged(document);

  return {
    document: replaceList(document, listId, (current) => ({
      ...current,
      updatedAt: context.now,
      entries: renumbered,
    })),
    events: [
      {
        at: context.now,
        kind: 'list-updated',
        listId,
        detail: { reordered: renumbered.length },
      },
    ],
  };
}

/**
 * The final gate before a document crosses to main.
 *
 * Every function above builds on a document that has already been normalized, but
 * a caller can hand one straight from a `JSON.parse` of something older. Running
 * it through the same total normalizer the store uses means a mutation cannot be
 * the thing that introduces a shape the store would then repair differently.
 */
export function sealReadingListsDocument(
  document: ReadingListsDocument,
): ReadingListsDocument {
  return normalizeReadingListsDocument(document);
}
