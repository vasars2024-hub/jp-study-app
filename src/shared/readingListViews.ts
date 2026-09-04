/**
 * Reading Lists P4 — what §6's two surfaces need to draw, as pure functions.
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §6 asks for a grid of list cards ("mosaic
 * cover, N/M finished") and a detail view of rows with state chips and a triage
 * strip. Both are derivations over `ReadingListsDocument`, and both are needed by
 * more than one caller — the view, the widgets in §11.2, and P5's smart lists —
 * so they live here rather than inside a component, in the shape P1b established
 * for the mutation layer.
 *
 * Nothing here reads the DOM, the store, or `Date.now`. A summary is a function
 * of the document and nothing else, which is what makes the counts testable and
 * what keeps two surfaces from disagreeing about what "finished" means.
 */

import type {
  ReadingEntryState,
  ReadingList,
  ReadingListEntry,
  ReadingListKind,
  ReadingListsDocument,
  ReadingListTarget,
  ReadingWorkRef,
  SmartListQuery,
} from './readingLists';
// The SAME normaliser `readingListMatching` compares authors with. Two author
// normalisers is two answers to "is this the same person", and the surface and
// the matcher would disagree in exactly the cases this link exists for.
import { normalizeMediaTitleKey } from './mediaIdentity';

/** Every state, in the order a surface should show them. Chips read left to right. */
export const READING_ENTRY_STATES: readonly ReadingEntryState[] = [
  'reading',
  'wanted',
  'owned',
  'finished',
  'abandoned',
  'skipped',
] as const;

/**
 * States that count toward "done" and states that count at all.
 *
 * `skipped` and `abandoned` are deliberately OUT of the denominator: §5.9 makes
 * abandoned first-class precisely so a book put down on purpose stays out of the
 * pace maths, and a progress bar that a deliberate abandonment drags down is the
 * shame column that clause exists to remove. A list of ten where two were
 * abandoned and eight finished reads 8/8, not 8/10.
 */
const DONE_STATES: ReadonlySet<ReadingEntryState> = new Set<ReadingEntryState>(['finished']);
const EXCLUDED_FROM_PROGRESS: ReadonlySet<ReadingEntryState> = new Set<ReadingEntryState>([
  'abandoned',
  'skipped',
]);

export type ReadingStateCounts = Record<ReadingEntryState, number>;

export interface ReadingListSummary {
  listId: string;
  name: string;
  kind: ReadingListKind;
  archived: boolean;
  /** Every entry, including the ones outside the progress denominator. */
  total: number;
  finished: number;
  /** `total` minus abandoned and skipped. The denominator `progress` uses. */
  counted: number;
  byState: ReadingStateCounts;
  /** 0..1. Exactly 0 for an empty list — never NaN, which renders as "NaN%". */
  progress: number;
  /**
   * Library item ids for §5.10's 2×2 mosaic, in list order, at most four.
   *
   * Item ids rather than cover paths: the cover a library item shows is the
   * library's business and changes when a better one is found, so resolving it
   * here would freeze one answer into two surfaces.
   */
  coverItemIds: string[];
  /** Works offering a binding the user has not answered — §6's triage strip. */
  triage: number;
  updatedAt: number;
}

function emptyCounts(): ReadingStateCounts {
  return {
    wanted: 0,
    owned: 0,
    reading: 0,
    finished: 0,
    abandoned: 0,
    skipped: 0,
  };
}

/** A suggestion is live only while nothing is bound and the user has not said no. */
export function hasLiveSuggestion(work: ReadingWorkRef | undefined): boolean {
  if (!work?.suggestion) return false;
  if (work.suggestion.dismissedAt !== undefined) return false;
  return work.boundItemIds.length === 0;
}

export function summarizeReadingList(
  list: ReadingList,
  works: readonly ReadingWorkRef[],
): ReadingListSummary {
  const byId = new Map(works.map((work) => [work.id, work]));
  const byState = emptyCounts();
  const coverItemIds: string[] = [];
  // Counted once per WORK, not per entry: a work is what carries the suggestion,
  // and a book listed twice must not make the triage strip claim two decisions.
  const triaged = new Set<string>();

  const ordered = sortReadingListEntries(list);
  for (const entry of ordered) {
    // A state outside the union can only arrive from a hand-edited file; it is
    // still an entry and still belongs in `total`, so it is counted there and
    // simply has no chip.
    if (entry.state in byState) byState[entry.state] += 1;
    const work = byId.get(entry.workId);
    if (!work) continue;
    if (hasLiveSuggestion(work)) triaged.add(work.id);
    if (coverItemIds.length < 4) {
      const itemId = work.boundItemIds[0];
      if (itemId && !coverItemIds.includes(itemId)) coverItemIds.push(itemId);
    }
  }

  const total = list.entries.length;
  let counted = 0;
  let finished = 0;
  for (const state of READING_ENTRY_STATES) {
    if (EXCLUDED_FROM_PROGRESS.has(state)) continue;
    counted += byState[state];
    if (DONE_STATES.has(state)) finished += byState[state];
  }

  return {
    listId: list.id,
    name: list.name,
    kind: list.kind,
    archived: list.archivedAt !== undefined,
    total,
    finished,
    counted,
    byState,
    progress: counted > 0 ? finished / counted : 0,
    coverItemIds,
    triage: triaged.size,
    updatedAt: list.updatedAt,
  };
}

/**
 * Entries in the order the detail view draws them.
 *
 * `order` is the user's own arrangement (§11.4's drag-to-reorder writes it), so
 * it wins outright. `addedAt` then `id` break ties, because two entries that
 * share an order — which an import racing a reorder can produce — must still
 * come out in a STABLE sequence: a list that reshuffles itself between renders
 * is indistinguishable from data loss to the person watching it.
 */
export function sortReadingListEntries(list: ReadingList): ReadingListEntry[] {
  return [...list.entries].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** One drawn row: the entry, the work behind it, and what the row can do. */
export interface ReadingListRow {
  entry: ReadingListEntry;
  work: ReadingWorkRef | undefined;
  /** What the row shows as its name. Never blank — falls back to the raw line. */
  title: string;
  /**
   * The library item this row opens, when there is one.
   *
   * §11.1: every row goes somewhere real. A row with no bound item is NOT dead —
   * it routes to the acquisition path instead — so this being `null` is a
   * destination, not a missing one.
   */
  itemId: string | null;
  suggestion: boolean;
}

export function readingListRows(
  list: ReadingList,
  works: readonly ReadingWorkRef[],
): ReadingListRow[] {
  const byId = new Map(works.map((work) => [work.id, work]));
  return sortReadingListEntries(list).map((entry) => {
    const work = byId.get(entry.workId);
    const title = work?.titleRaw.trim() || entry.sourceRef?.rawLine.trim() || '';
    return {
      entry,
      work,
      title,
      itemId: work?.boundItemIds[0] ?? null,
      suggestion: hasLiveSuggestion(work),
    };
  });
}

/** One line of §11.1's "that author's other works, owned and wanted". */
export interface ReadingAuthorRow {
  entryId: string;
  workId: string;
  title: string;
  /** `null` is the acquisition destination, exactly as on `ReadingListRow`. */
  itemId: string | null;
  state: ReadingEntryState;
  listId: string;
  listName: string;
  listArchived: boolean;
}

/**
 * §11.1: *"an author name → that author's other works, owned and wanted"*.
 *
 * Across EVERY list, not just the one open, because "other works" is a question
 * about the author and not about the list the user happens to be looking at —
 * a version scoped to the current list would answer "none" for the common case
 * of one book per list and read as the link being broken.
 *
 * A work on two lists yields TWO rows, each naming its list. Collapsing them
 * would throw away the only fact that tells the user where to go next, and the
 * caller can still count distinct `workId`s.
 *
 * Matching is on `normalizeMediaTitleKey`, the same normaliser
 * `readingListMatching` uses for authors, so "Sayaka Murata" and "murata,
 * sayaka" do not silently become two authors. A blank author matches NOTHING:
 * `authorRaw` is optional and most works never carry one, so a key-less match
 * would return every authorless work in the document.
 */
export function readingWorksByAuthor(
  document: ReadingListsDocument,
  authorRaw: string,
): ReadingAuthorRow[] {
  const key = normalizeMediaTitleKey(authorRaw);
  if (!key) return [];
  const works = new Map(
    document.works
      .filter((work) => normalizeMediaTitleKey(work.authorRaw ?? '') === key)
      .map((work) => [work.id, work]),
  );
  if (works.size === 0) return [];
  const out: ReadingAuthorRow[] = [];
  for (const list of document.lists) {
    for (const entry of sortReadingListEntries(list)) {
      const work = works.get(entry.workId);
      if (!work) continue;
      out.push({
        entryId: entry.id,
        workId: work.id,
        title: work.titleRaw.trim() || entry.sourceRef?.rawLine.trim() || '',
        itemId: work.boundItemIds[0] ?? null,
        state: entry.state,
        listId: list.id,
        listName: list.name,
        listArchived: Boolean(list.archivedAt),
      });
    }
  }
  return out;
}

/** One line of §11.1's *"the 'on 2 lists' line in the reader"*. */
export interface ReadingListMembershipRow {
  listId: string;
  listName: string;
  listArchived: boolean;
  /** What the route scrolls to. §11.1 row 8 lands on the ENTRY, not the list top. */
  entryId: string;
  workId: string;
  title: string;
  state: ReadingEntryState;
}

/**
 * §11.1 row 8: *"the 'on 2 lists' line in the reader → the list detail, scrolled
 * to this entry"*.
 *
 * Pure, and living here rather than in a reader, because §10.2 forbids list
 * logic inside `NovelReader.tsx` (130 KB) and `MangaReader.tsx` (87 KB). The
 * readers get a component fed by this; they never learn what a list is.
 *
 * Scans EVERY work that binds the item, not `workForItem`'s first match. Two
 * works claiming one item is a repairable state rather than an impossible one
 * (a merge, or a bind that raced an unbind), and in that state the first match
 * shows FEWER lists than the user is really on — a line reading "on 1 list"
 * over two lists is worse than no line at all. Counting all of them can only
 * over-report a real membership, never invent one.
 *
 * Archived lists are RETURNED, flagged, not dropped: this function cannot know
 * whether its caller is the reader strip (which hides them) or a diagnostic
 * (which must not).
 *
 * The blank guard is NOT decoration. `normalizeWork` strips `''` out of
 * `boundItemIds` (`readingLists.ts:317`), so a document that came through the
 * store can never match one — but this takes a `ReadingListsDocument`, and a
 * caller holding an unnormalized one (a preview, a fixture, a migration in
 * flight) would otherwise have every blank-bound work answer to an item that
 * has not loaded yet. `readingListViews.test.ts` falsifies it against exactly
 * that document rather than against a normalized one, where it cannot fail.
 */
export function readingListsForItem(
  document: ReadingListsDocument,
  itemId: string,
): ReadingListMembershipRow[] {
  if (!itemId) return [];
  const works = new Map(
    document.works
      .filter((work) => work.boundItemIds.includes(itemId))
      .map((work) => [work.id, work]),
  );
  if (works.size === 0) return [];
  const out: ReadingListMembershipRow[] = [];
  for (const list of document.lists) {
    for (const entry of sortReadingListEntries(list)) {
      const work = works.get(entry.workId);
      if (!work) continue;
      out.push({
        listId: list.id,
        listName: list.name,
        listArchived: Boolean(list.archivedAt),
        entryId: entry.id,
        workId: work.id,
        title: work.titleRaw.trim() || entry.sourceRef?.rawLine.trim() || '',
        state: entry.state,
      });
    }
  }
  return out;
}

/**
 * The row §11.2's "Next up" widget offers, and the one the list detail
 * highlights.
 *
 * Priority is `reading`, then `owned`, then `wanted` — a book already open
 * outranks one merely on the shelf, and a book on the shelf outranks one that
 * has to be acquired first. Within a band the list's own order decides, so the
 * user's arrangement is what picks the book rather than a hidden heuristic.
 * `finished`, `abandoned` and `skipped` are never next up.
 */
const NEXT_UP_PRIORITY: readonly ReadingEntryState[] = ['reading', 'owned', 'wanted'];

export function nextUpReadingRow(
  list: ReadingList,
  works: readonly ReadingWorkRef[],
): ReadingListRow | null {
  const rows = readingListRows(list, works);
  for (const state of NEXT_UP_PRIORITY) {
    const found = rows.find((row) => row.entry.state === state);
    if (found) return found;
  }
  return null;
}

export interface ReadingFinishRecord {
  entryId: string;
  listId: string;
  listName: string;
  title: string;
  itemId: string | null;
  finishedAt: number;
}

/**
 * The most recent finishes across every list, newest first.
 *
 * Read off the entries rather than the event log: the log is capped and
 * compacted, so a year-in-review built on it silently loses the start of the
 * year. `finishedAt` is on the entry and survives everything.
 *
 * De-duplicated per WORK: §4's fan-out ticks the same book on every list it is
 * on, and a widget that shows one finish three times reads as three books.
 */
export function recentReadingFinishes(
  document: ReadingListsDocument,
  limit = 5,
): ReadingFinishRecord[] {
  const byId = new Map(document.works.map((work) => [work.id, work]));
  const seen = new Set<string>();
  const found: ReadingFinishRecord[] = [];
  for (const list of document.lists) {
    for (const entry of list.entries) {
      if (entry.state !== 'finished' || entry.finishedAt === undefined) continue;
      const work = byId.get(entry.workId);
      found.push({
        entryId: entry.id,
        listId: list.id,
        listName: list.name,
        title: work?.titleRaw.trim() || entry.sourceRef?.rawLine.trim() || '',
        itemId: work?.boundItemIds[0] ?? null,
        finishedAt: entry.finishedAt,
      });
    }
  }
  found.sort((a, b) => b.finishedAt - a.finishedAt || a.entryId.localeCompare(b.entryId));
  const deduped: ReadingFinishRecord[] = [];
  for (const record of found) {
    const key = `${record.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
    if (deduped.length >= Math.max(0, limit)) break;
  }
  return deduped;
}

export interface ReadingChallengePace {
  remaining: number;
  /** Whole days to the target date. Negative once it has passed. */
  daysLeft: number;
  /** Books per day the remainder now needs. `null` when the date has passed. */
  requiredPerDay: number | null;
  /**
   * Books ahead of (positive) or behind (negative) an even pace.
   *
   * Both directions are reported plainly. §11.2 is explicit that "behind" is
   * not an alarm: a pace line that shouts is a pace line the user turns off.
   */
  aheadBy: number;
}

const DAY_MS = 86_400_000;

/**
 * The one honest sentence §11.2's challenge widget prints, as numbers.
 *
 * Returns `null` when the list carries no target date — a pace computed against
 * a date nobody set is a number invented by the widget.
 */
export function readingChallengePace(
  summary: ReadingListSummary,
  target: ReadingListTarget | undefined,
  now: number,
  createdAt: number,
): ReadingChallengePace | null {
  if (!target?.by) return null;
  const goal = Math.max(target.count ?? summary.counted, summary.finished);
  const remaining = Math.max(0, goal - summary.finished);
  const daysLeft = Math.ceil((target.by - now) / DAY_MS);
  const span = Math.max(1, target.by - createdAt);
  // Elapsed is clamped into the window: before the start and after the end an
  // even pace is meaningless, and an unclamped ratio produces an "ahead by" of
  // several books on a challenge that has not begun.
  const elapsed = Math.min(Math.max(0, now - createdAt), span);
  const expected = goal * (elapsed / span);
  return {
    remaining,
    daysLeft,
    requiredPerDay: daysLeft > 0 ? remaining / daysLeft : null,
    aheadBy: Math.round((summary.finished - expected) * 10) / 10,
  };
}

export type ReadingListSort = 'recent' | 'name' | 'progress';

/**
 * Card order for the grid.
 *
 * Archived lists sink to the bottom under every sort rather than disappearing:
 * §11.4 requires undo on every destructive action, and a list you cannot see is
 * a list you cannot restore.
 */
export function sortReadingListSummaries(
  summaries: readonly ReadingListSummary[],
  sort: ReadingListSort,
): ReadingListSummary[] {
  const compare = (a: ReadingListSummary, b: ReadingListSummary): number => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name) || a.listId.localeCompare(b.listId);
      case 'progress':
        return b.progress - a.progress || a.name.localeCompare(b.name);
      default:
        return b.updatedAt - a.updatedAt || a.name.localeCompare(b.name);
    }
  };
  return [...summaries].sort(compare);
}

/**
 * Every list a card can honestly be drawn for.
 *
 * `smart` lists are EXCLUDED, and that is the point of the filter rather than an
 * oversight. P5 §7 stores a smart list as a saved query with no entries — that
 * is its normal shape, not a damaged one — so a summary of it reads "0 of 0
 * finished" over an empty progress bar and its detail opens on nothing. Every
 * caller here draws entry counts, so every caller would draw that same lie.
 * `ReadingSmartLists` renders saved queries instead, with their live counts.
 *
 * Safe to narrow rather than a behaviour change: nothing has ever produced a
 * `smart` list until `saveSmartReadingList`, so no stored document has one.
 */
export function summarizeReadingLists(document: ReadingListsDocument): ReadingListSummary[] {
  return document.lists
    .filter((list) => list.kind !== 'smart')
    .map((list) => summarizeReadingList(list, document.works));
}

/** The saved queries §7's panel offers beside its three presets. */
export interface SavedSmartList {
  listId: string;
  name: string;
  query: SmartListQuery;
}

/**
 * A `smart` list without a `query` is unanswerable and is left out.
 *
 * It should be unreachable — `saveSmartReadingList` refuses an empty query and
 * `normalizeReadingList` drops one it cannot repair — but a hand-edited file can
 * still hold `{"kind":"smart"}`, and a chip that derives nothing looks exactly
 * like a query that matches nothing.
 */
export function savedSmartLists(document: ReadingListsDocument): SavedSmartList[] {
  const out: SavedSmartList[] = [];
  for (const list of document.lists) {
    if (list.kind !== 'smart' || !list.query || list.archivedAt !== undefined) continue;
    out.push({ listId: list.id, name: list.name, query: list.query });
  }
  return out;
}

/**
 * The one number the desktop badge and §11.2's widgets both want: how many
 * decisions are waiting for the user across every list.
 */
export function totalReadingTriage(document: ReadingListsDocument): number {
  const triaged = new Set<string>();
  for (const list of document.lists) {
    if (list.archivedAt !== undefined) continue;
    for (const entry of list.entries) {
      const work = document.works.find((candidate) => candidate.id === entry.workId);
      if (hasLiveSuggestion(work)) triaged.add(entry.workId);
    }
  }
  return triaged.size;
}

/**
 * §11.4's reorder, as a pure move over an id order.
 *
 * `moved` is placed immediately BEFORE `target` when it is travelling up the
 * list, and immediately AFTER it when travelling down. That is what every list
 * UI does and it is the only rule that makes a drop onto the row you came from
 * a no-op instead of an off-by-one.
 *
 * The array handed in is the WHOLE list order, never the filtered view. Dropping
 * A onto C while B is hidden by a filter is otherwise ambiguous — "before C" and
 * "after B" are different positions and the user can see only one of them. Given
 * the full order the move is well defined: A lands next to C, and B keeps its own
 * place relative to C. `readingListsView.test.tsx` drives exactly that case.
 *
 * Returns the input array unchanged (by value) when the move is a no-op, so a
 * caller can compare and skip the write.
 */
export function reorderEntryIds(
  order: readonly string[],
  movedId: string,
  targetId: string,
): string[] {
  const from = order.indexOf(movedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [...order];
  const rest = order.filter((id) => id !== movedId);
  const at = rest.indexOf(targetId);
  rest.splice(from > to ? at : at + 1, 0, movedId);
  return rest;
}
