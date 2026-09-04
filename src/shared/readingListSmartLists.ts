/**
 * Reading Lists P5, §7 — smart list queries.
 *
 * §7 is *"saved queries that populate themselves"*: a list whose membership is
 * derived on read rather than stored. `ReadingListKind` already carries `'smart'`
 * (`readingLists.ts:28`) and §1 reserves `query?: SmartListQuery` for it, so this
 * file is the type that slot was waiting for plus the evaluator that turns one
 * into rows.
 *
 * Pure, like `readingListViews` and `readingListExport`. It takes the document,
 * a query, and a snapshot of item facts; it reads no store, no DOM and no clock.
 * `now` is an argument because "untouched 30 days" is otherwise untestable.
 *
 * ── Three decisions the plan deliberately parked here ─────────────────────────
 *
 * **1. Where `difficultyMax` gets its number.** Nothing on `ReadingWorkRef` or
 * `LibraryItem` is called "difficulty", and the plan's own trap note (plan line
 * ~1088) says to settle it against the tree rather than invent a field. The tree
 * already has exactly one persisted per-item reading level: the **L1–L7
 * `LevelTier`** returned by `effectiveLevelEstimate()` (`libraryLevel.ts:13`),
 * banded from measured known-word ratio in `inboxMeta.ts:58` and surfaced to the
 * user as `LIBRARY_LEVEL_CHIPS`. `ReadingWorkspaceEntry.level`
 * (`readingWorkspace.ts:146`) is the same number on the card contract. So
 * `difficultyMax` IS a `LevelTier` cap, 7 = hardest, and needs no new field and
 * no new scale.
 *
 * Rejected: `lexiconDifficulty.ts`'s frequency profile (passage-scoped, never
 * persisted per item — it would have to re-parse every book to answer one
 * filter), `jiten.ts`'s `difficultyMax` (a remote query param on a foreign 0–5
 * scale), and `novels.ts`'s `Difficulty` strings (hand-authored, catalogue-only,
 * absent from anything a user imported).
 *
 * **2. What an unleveled work does.** `levelSortKey` returns **99** for a missing
 * level so unleveled items sink when sorting — and a naive `level <= max` reusing
 * that sentinel would silently drop every book the enricher has not reached yet.
 * That is the wrong default here: "Ready to read" is meant to surface owned books,
 * and a fresh import has no level for minutes to hours. So `difficultyMax`
 * excludes a work only when its level is KNOWN and above the cap; unknown passes.
 * `SmartListRow.level` is `null` in that case, so a surface can say how many rows
 * are unrated instead of pretending they were measured. A caller wanting the
 * strict reading sets `requireKnownDifficulty`.
 *
 * **3. Two fields beyond §7's literal shape, both forced by §7's own presets.**
 * §7 lists `startedBefore` with the comment *"'abandoned': started, not finished,
 * stale"* and then defines the Abandoned preset as *"started, <90 %, untouched 30
 * days"* — three facts, of which `startedBefore` is one. Started-at and
 * touched-at are genuinely different (a book begun a year ago and read this
 * morning is not abandoned), and 90 % is a progress ceiling nothing else carries.
 * Collapsing them would make the shipped preset a lie, so `untouchedSince` and
 * `progressBelow` are added, additively and optionally. Everything §7 names is
 * present and keeps its name.
 */

import type { LevelTier } from './levelScale';
import { effectiveLevelEstimate } from './libraryLevel';
import type { LibraryItem } from './types';
import type {
  ReadingEntryState,
  ReadingListsDocument,
  ReadingWorkRef,
} from './readingLists';
import { normalizeMediaTitleKey } from './mediaIdentity';
import { sortReadingListEntries } from './readingListViews';

/**
 * §7's `format`. `book` and `manga` are `LibraryKind` verbatim (`types.ts:3`);
 * `vn` is NOT a library kind — visual novels are not importable as library items
 * — so it is derived from `externalIds.vndb`, which is the only vn identity this
 * model holds. A work with a vndb id is a vn whatever file happens to back it.
 */
export type ReadingWorkFormat = 'book' | 'manga' | 'vn';

export interface SmartListQuery {
  format?: readonly ReadingWorkFormat[];
  state?: readonly ReadingEntryState[];
  /** L1–L7 cap. Unknown-level works pass unless `requireKnownDifficulty`. */
  difficultyMax?: number;
  /** Treat an unmeasured level as failing `difficultyMax` rather than passing. */
  requireKnownDifficulty?: boolean;
  /** Entry `startedAt` strictly before this epoch ms. */
  startedBefore?: number;
  /** Bound item's `lastReadAt` at or before this epoch ms (see decision 3). */
  untouchedSince?: number;
  /** Bound item's progress strictly below this 0..1 fraction (see decision 3). */
  progressBelow?: number;
  /** Drop works that appear on any of these list ids. */
  notOnList?: readonly string[];
  authorIs?: string;
  /** Only works with at least one bound library item. */
  ownedOnly?: boolean;
}

/**
 * The per-item facts a query needs, projected off `LibraryItem` so the evaluator
 * never imports the library store and a test can state a library in six lines.
 */
export interface SmartListItemFacts {
  id: string;
  format: 'book' | 'manga';
  level: LevelTier | null;
  /** Epoch ms of the last read, or null when never opened. */
  lastReadAt: number | null;
  /** 0..1. */
  percent: number;
}

export function smartListFactsFromItem(item: LibraryItem): SmartListItemFacts {
  return {
    id: item.id,
    format: item.kind,
    level: effectiveLevelEstimate(item),
    lastReadAt: typeof item.lastReadAt === 'number' ? item.lastReadAt : null,
    percent: clamp01(item.progress?.percent),
  };
}

/** One derived member of a smart list. Per WORK, never per entry — see below. */
export interface SmartListRow {
  workId: string;
  title: string;
  author: string | undefined;
  /** The state the work is at, resolved across every list it sits on. */
  state: ReadingEntryState;
  format: ReadingWorkFormat | null;
  /** L1–L7, or null when nothing has measured this work yet. */
  level: LevelTier | null;
  /** The library item the row opens, or null — a destination either way (§11.1). */
  itemId: string | null;
  lastReadAt: number | null;
  percent: number | null;
  /** Where this work is already filed. Provenance, so a row is never orphaned. */
  onListIds: string[];
  /** The entry a surface scrolls to when the user follows the row. */
  entryId: string;
  listId: string;
}

export interface SmartListContext {
  items: readonly SmartListItemFacts[];
  /** Epoch ms. Explicit so "untouched 30 days" is a testable fact, not a clock read. */
  now: number;
}

/**
 * How advanced a state is, when one work sits on several lists.
 *
 * §4's fan-out ticks every list a finished work is on, so disagreement should be
 * rare — but it is reachable (a bind that raced an unbind, a merge, a hand edit),
 * and a smart list that reported the same book as both `wanted` and `finished`
 * would show it twice. Taking the maximum can only over-report progress, which
 * is the safe direction: the failure mode is a finished book missing from
 * "Ready to read", not an unread book hidden from it.
 */
const STATE_RANK: Record<ReadingEntryState, number> = {
  wanted: 0,
  owned: 1,
  reading: 2,
  skipped: 3,
  abandoned: 4,
  finished: 5,
};

interface WorkAggregate {
  work: ReadingWorkRef;
  state: ReadingEntryState;
  entryId: string;
  listId: string;
  onListIds: string[];
  startedAt: number | null;
  title: string;
}

/**
 * Collapse the document to one record per work.
 *
 * Deliberately per-work rather than per-entry: §7's `notOnList` and "every owned
 * work by the author" are both statements about works, and `recentReadingFinishes`
 * already established that a fan-out finish rendered once per entry reads as three
 * books. Archived lists still contribute membership — a work "not on list X" is
 * still on X when X is merely archived, and dropping them would make `notOnList`
 * quietly wrong after a tidy-up.
 */
function aggregateWorks(document: ReadingListsDocument): Map<string, WorkAggregate> {
  const byId = new Map(document.works.map((work) => [work.id, work]));
  const out = new Map<string, WorkAggregate>();
  for (const list of document.lists) {
    for (const entry of sortReadingListEntries(list)) {
      const work = byId.get(entry.workId);
      if (!work) continue;
      const title = work.titleRaw.trim() || entry.sourceRef?.rawLine.trim() || '';
      if (!title) continue;
      const startedAt = typeof entry.startedAt === 'number' ? entry.startedAt : null;
      const existing = out.get(work.id);
      if (!existing) {
        out.set(work.id, {
          work,
          state: entry.state,
          entryId: entry.id,
          listId: list.id,
          onListIds: [list.id],
          startedAt,
          title,
        });
        continue;
      }
      if (!existing.onListIds.includes(list.id)) existing.onListIds.push(list.id);
      // The EARLIEST start is the real start: re-adding a book to a second list
      // in March does not mean it was begun in March.
      if (startedAt != null && (existing.startedAt == null || startedAt < existing.startedAt)) {
        existing.startedAt = startedAt;
      }
      if (STATE_RANK[entry.state] > STATE_RANK[existing.state]) {
        existing.state = entry.state;
        // The provenance follows the state it describes, so a surface that opens
        // the row lands on the entry the chip is talking about.
        existing.entryId = entry.id;
        existing.listId = list.id;
      }
    }
  }
  return out;
}

function formatOf(
  work: ReadingWorkRef,
  facts: SmartListItemFacts | undefined,
): ReadingWorkFormat | null {
  // vndb wins over the bound file: a vn with a text dump imported as a "book" is
  // still a vn, and this is the only identity that says so.
  if (work.externalIds?.vndb) return 'vn';
  return facts?.format ?? null;
}

/** The bound item a row speaks for: the first bound id the library actually has. */
function boundFacts(
  work: ReadingWorkRef,
  items: Map<string, SmartListItemFacts>,
): SmartListItemFacts | undefined {
  for (const id of work.boundItemIds) {
    const found = items.get(id);
    if (found) return found;
  }
  return undefined;
}

export function evaluateSmartList(
  document: ReadingListsDocument,
  query: SmartListQuery,
  context: SmartListContext,
): SmartListRow[] {
  const items = new Map(context.items.map((facts) => [facts.id, facts]));
  const excludedLists = new Set(query.notOnList ?? []);
  const wantedStates = query.state?.length ? new Set(query.state) : null;
  const wantedFormats = query.format?.length ? new Set(query.format) : null;
  const authorKey = query.authorIs ? normalizeMediaTitleKey(query.authorIs) : '';
  const rows: SmartListRow[] = [];

  for (const aggregate of aggregateWorks(document).values()) {
    const { work } = aggregate;
    if (excludedLists.size && aggregate.onListIds.some((id) => excludedLists.has(id))) continue;
    if (wantedStates && !wantedStates.has(aggregate.state)) continue;

    const facts = boundFacts(work, items);
    // `ownedOnly` asks whether the user HOLDS the book, so it is answered by a
    // bound item the library still has — not by `boundItemIds` being non-empty,
    // which stays populated after the file is deleted.
    if (query.ownedOnly && !facts) continue;

    const format = formatOf(work, facts);
    if (wantedFormats && (format == null || !wantedFormats.has(format))) continue;

    const level = facts?.level ?? null;
    if (query.difficultyMax != null) {
      if (level == null) {
        if (query.requireKnownDifficulty) continue;
      } else if (level > query.difficultyMax) continue;
    }

    if (query.startedBefore != null) {
      if (aggregate.startedAt == null || aggregate.startedAt >= query.startedBefore) continue;
    }

    if (query.untouchedSince != null) {
      // Never opened counts as untouched. A book started on another device and
      // never read here has no `lastReadAt`, and calling that "recently touched"
      // would hide exactly the entry Abandoned exists to surface.
      const touched = facts?.lastReadAt ?? null;
      if (touched != null && touched > query.untouchedSince) continue;
    }

    if (query.progressBelow != null) {
      if ((facts?.percent ?? 0) >= query.progressBelow) continue;
    }

    if (authorKey) {
      const author = work.authorRaw?.trim() ?? '';
      if (!author || normalizeMediaTitleKey(author) !== authorKey) continue;
    }

    rows.push({
      workId: work.id,
      title: aggregate.title,
      author: work.authorRaw?.trim() || undefined,
      state: aggregate.state,
      format,
      level,
      itemId: facts?.id ?? null,
      lastReadAt: facts?.lastReadAt ?? null,
      percent: facts ? facts.percent : null,
      onListIds: [...aggregate.onListIds],
      entryId: aggregate.entryId,
      listId: aggregate.listId,
    });
  }

  // Easiest first, then title. §5.5 asks for "sort easiest first" and this is the
  // only place a derived list gets to choose its own order; unleveled works sort
  // last rather than first, so an unmeasured book never displaces a measured one
  // at the top of a "Ready to read" queue.
  rows.sort((a, b) => {
    const la = a.level ?? 99;
    const lb = b.level ?? 99;
    if (la !== lb) return la - lb;
    return a.title.localeCompare(b.title);
  });
  return rows;
}

export type SmartListPresetId = 'abandoned' | 'ready-to-read' | 'author-sweep';

export const SMART_LIST_PRESET_IDS: readonly SmartListPresetId[] = [
  'abandoned',
  'ready-to-read',
  'author-sweep',
] as const;

/** §7's "untouched 30 days". One constant, so the preset and its test agree. */
export const ABANDONED_STALE_MS = 30 * 24 * 60 * 60 * 1000;
/** §7's "<90 %". Deliberately NOT §4's 0.98 finish line — this is "not near done". */
export const ABANDONED_PROGRESS_CEILING = 0.9;
/** "Within difficulty band" for Ready to read, when the caller names no cap. */
export const READY_TO_READ_DEFAULT_LEVEL: LevelTier = 4;

/**
 * Build a preset's query against the document as it stands.
 *
 * Returns `null` when the preset cannot be answered — which today is exactly
 * Author sweep with nothing finished yet. A preset that silently degrades to
 * "every work" would be worse than absent: the user would read the result as an
 * answer to a question it never asked. §11.4 wants a real empty state, and a
 * null here is what lets the surface show one.
 */
export function buildSmartListPresetQuery(
  preset: SmartListPresetId,
  document: ReadingListsDocument,
  context: SmartListContext,
  options: { difficultyMax?: number } = {},
): SmartListQuery | null {
  if (preset === 'abandoned') {
    return {
      state: ['reading'],
      startedBefore: context.now - ABANDONED_STALE_MS,
      untouchedSince: context.now - ABANDONED_STALE_MS,
      progressBelow: ABANDONED_PROGRESS_CEILING,
    };
  }
  if (preset === 'ready-to-read') {
    return {
      state: ['owned'],
      ownedOnly: true,
      difficultyMax: options.difficultyMax ?? READY_TO_READ_DEFAULT_LEVEL,
      // Unstarted, which is a stronger claim than state alone: an `owned` entry
      // whose file has been opened is not waiting to be read.
      progressBelow: 0.01,
    };
  }
  const author = lastFinishedAuthor(document);
  if (!author) return null;
  return {
    authorIs: author,
    ownedOnly: true,
    // The sweep is about what is left, so what is already done is out of it.
    state: ['wanted', 'owned', 'reading'],
  };
}

/** The author of the most recently finished work, or `''` when there is none. */
export function lastFinishedAuthor(document: ReadingListsDocument): string {
  const byId = new Map(document.works.map((work) => [work.id, work]));
  let bestAt = -1;
  let bestAuthor = '';
  for (const list of document.lists) {
    for (const entry of list.entries) {
      if (entry.state !== 'finished') continue;
      const at = typeof entry.finishedAt === 'number' ? entry.finishedAt : -1;
      if (at <= bestAt) continue;
      const author = byId.get(entry.workId)?.authorRaw?.trim();
      // An unattributed finish is not a tie-break winner — it simply cannot
      // answer "that author's other books", so the search continues past it.
      if (!author) continue;
      bestAt = at;
      bestAuthor = author;
    }
  }
  return bestAuthor;
}

export function evaluateSmartListPreset(
  preset: SmartListPresetId,
  document: ReadingListsDocument,
  context: SmartListContext,
  options: { difficultyMax?: number } = {},
): SmartListRow[] | null {
  const query = buildSmartListPresetQuery(preset, document, context, options);
  if (!query) return null;
  return evaluateSmartList(document, query, context);
}

function clamp01(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return value >= 1 ? 1 : value;
}
