/**
 * §2.5 — "Paste never writes straight to a list."
 *
 * The preview's whole model, with no DOM in it. The dialog
 * (`renderer/components/reading/ReadingListPastePreview.tsx`) renders these rows
 * and calls these functions; every decision about what gets imported is settled
 * here, so it can be tested without mounting anything.
 *
 * Three things are deliberate and each is a defect if changed:
 *
 *   · **`lineIndex` is the row identity, not the array position.** Dropping a row
 *     keeps it in `rows` with `included: false` rather than splicing it out, so
 *     the triage strip can still count it, the user can put it back, and the
 *     index that `applyReadingListImport` excludes by never shifts underneath a
 *     pending edit.
 *   · **A triage row is INCLUDED.** §2.5 says low-confidence entries are
 *     "pre-selected for attention rather than silently included" — flagged and
 *     jumped to, not quietly dropped. Dropping them would lose books; the point
 *     of the flag is that the user sees them, not that the parser decides.
 *   · **A no-op returns the same draft reference**, matching
 *     `readingListMutations.ts`. React re-renders on identity, so an edit that
 *     types the same character twice must not look like a change, and the undo
 *     stack must not grow a frame for it.
 *
 * `parsed` is kept verbatim beside the rows. It is what `revertPreviewRow` reads
 * to put one hand edit back, what `undoPreviewEdits` resets the whole sheet to,
 * and — because §2.4 needs the paste re-parseable forever — it is never mutated.
 */

import {
  parseReadingList,
  type ParsedReadingEntry,
  type ParsedReadingList,
  type ReadingListTriageReason,
} from './readingListParser';
import type { ReadingVolumeRange } from './readingLists';

/** How many undo frames a preview keeps. Beyond this the oldest is forgotten. */
export const READING_PREVIEW_UNDO_DEPTH = 50;

export interface ReadingPreviewRow {
  /** Identity. Stable across every edit, and what the import excludes by. */
  lineIndex: number;
  /** Provenance — the line exactly as the message had it. Never editable. */
  rawLine: string;
  title: string;
  titleJa?: string;
  titleEn?: string;
  author?: string;
  volume?: ReadingVolumeRange;
  url?: string;
  needsTriage?: ReadingListTriageReason;
  /** Unticked rows stay here so they can be put back; they are not imported. */
  included: boolean;
  /** True once any field differs from the parse. Drives the "edited" affordance. */
  edited: boolean;
}

export interface ReadingPreviewDraft {
  /** Exactly what was pasted. §2.4 stores this beside the entries. */
  rawText: string;
  /** The parse, untouched. The baseline every revert and undo reads. */
  parsed: ParsedReadingList;
  rows: ReadingPreviewRow[];
  /** Undo frames, oldest first. Ctrl+Z pops the newest. */
  history: readonly ReadingPreviewRow[][];
}

/** What the confirm button must refuse on, and why, in the user's terms. */
export type ReadingPreviewBlocker = 'nothing-selected' | 'blank-title';

export interface ReadingPreviewSummary {
  /** Rows the parser produced, dropped ones included. */
  parsed: number;
  included: number;
  dropped: number;
  edited: number;
  /** Included rows the parser flagged. §2.5's "pre-selected for attention". */
  triage: number;
  /** Included rows whose title was edited down to nothing. */
  blankTitles: number;
  /** Lines the parser threw away as chatter, so the sheet can disclose them. */
  droppedLines: number;
  blockers: ReadingPreviewBlocker[];
}

function rowFromParsed(entry: ParsedReadingEntry): ReadingPreviewRow {
  const row: ReadingPreviewRow = {
    lineIndex: entry.lineIndex,
    rawLine: entry.rawLine,
    title: entry.title,
    included: true,
    edited: false,
  };
  if (entry.titleJa) row.titleJa = entry.titleJa;
  if (entry.titleEn) row.titleEn = entry.titleEn;
  if (entry.author) row.author = entry.author;
  if (entry.volume) row.volume = entry.volume;
  if (entry.url) row.url = entry.url;
  if (entry.needsTriage) row.needsTriage = entry.needsTriage;
  return row;
}

/** Parses a paste and opens a preview over it. The only way to make a draft. */
export function beginReadingListPreview(rawText: string): ReadingPreviewDraft {
  const parsed = parseReadingList(rawText);
  return {
    rawText,
    parsed,
    rows: parsed.entries.map(rowFromParsed),
    history: [],
  };
}

function pushHistory(
  draft: ReadingPreviewDraft,
  rows: ReadingPreviewRow[],
): ReadingPreviewDraft {
  const history = [...draft.history, draft.rows];
  return {
    ...draft,
    rows,
    history:
      history.length > READING_PREVIEW_UNDO_DEPTH
        ? history.slice(history.length - READING_PREVIEW_UNDO_DEPTH)
        : history,
  };
}

/** Fields a row's editor can change. Anything absent is left as it was. */
export interface ReadingPreviewRowPatch {
  title?: string;
  titleJa?: string;
  titleEn?: string;
  author?: string;
}

const PATCH_FIELDS = ['title', 'titleJa', 'titleEn', 'author'] as const;

function baselineFor(
  draft: ReadingPreviewDraft,
  lineIndex: number,
): ParsedReadingEntry | undefined {
  return draft.parsed.entries.find((entry) => entry.lineIndex === lineIndex);
}

/**
 * Applies a field edit. `title` is trimmed on read rather than here — a user
 * mid-word has a trailing space and retyping it must not be a no-op.
 */
export function editPreviewRow(
  draft: ReadingPreviewDraft,
  lineIndex: number,
  patch: ReadingPreviewRowPatch,
): ReadingPreviewDraft {
  const index = draft.rows.findIndex((row) => row.lineIndex === lineIndex);
  if (index < 0) return draft;

  const current = draft.rows[index];
  const next: ReadingPreviewRow = { ...current };
  let touched = false;
  for (const field of PATCH_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    const existing = current[field] ?? '';
    if (value === existing) continue;
    touched = true;
    // An emptied optional field is absent, not an empty string — the work model
    // treats `titleJa: ''` as a real alternate title and would render a blank.
    if (value === '' && field !== 'title') delete next[field];
    else next[field] = value;
  }
  if (!touched) return draft;

  const baseline = baselineFor(draft, lineIndex);
  next.edited = baseline
    ? PATCH_FIELDS.some((field) => (next[field] ?? '') !== (baseline[field] ?? ''))
    : true;

  const rows = [...draft.rows];
  rows[index] = next;
  return pushHistory(draft, rows);
}

/** Ticks or unticks a row. An unticked row is kept, so it can be put back. */
export function setPreviewRowIncluded(
  draft: ReadingPreviewDraft,
  lineIndex: number,
  included: boolean,
): ReadingPreviewDraft {
  const index = draft.rows.findIndex((row) => row.lineIndex === lineIndex);
  if (index < 0 || draft.rows[index].included === included) return draft;
  const rows = [...draft.rows];
  rows[index] = { ...rows[index], included };
  return pushHistory(draft, rows);
}

/** Puts one row back to exactly what the parser said. */
export function revertPreviewRow(
  draft: ReadingPreviewDraft,
  lineIndex: number,
): ReadingPreviewDraft {
  const index = draft.rows.findIndex((row) => row.lineIndex === lineIndex);
  const baseline = baselineFor(draft, lineIndex);
  if (index < 0 || !baseline) return draft;
  const current = draft.rows[index];
  const restored = rowFromParsed(baseline);
  // Reverting the TEXT does not re-tick a dropped row: those are two decisions
  // and collapsing them makes the revert button quietly undrop things.
  restored.included = current.included;
  if (!current.edited && current.included === restored.included) return draft;
  const rows = [...draft.rows];
  rows[index] = restored;
  return pushHistory(draft, rows);
}

/** Ctrl+Z. One frame at a time; with no frames left the draft is unchanged. */
export function undoPreviewEdits(draft: ReadingPreviewDraft): ReadingPreviewDraft {
  if (!draft.history.length) return draft;
  const history = draft.history.slice(0, -1);
  return { ...draft, rows: [...draft.history[draft.history.length - 1]], history };
}

/** Throws every edit away and shows the parse again. */
export function resetPreviewToParse(draft: ReadingPreviewDraft): ReadingPreviewDraft {
  const rows = draft.parsed.entries.map(rowFromParsed);
  const same =
    rows.length === draft.rows.length &&
    rows.every((row, i) => {
      const current = draft.rows[i];
      return (
        current.lineIndex === row.lineIndex &&
        !current.edited &&
        current.included === row.included
      );
    });
  if (same) return draft;
  return pushHistory(draft, rows);
}

export function summarizeReadingPreview(draft: ReadingPreviewDraft): ReadingPreviewSummary {
  let included = 0;
  let edited = 0;
  let triage = 0;
  let blankTitles = 0;
  for (const row of draft.rows) {
    if (row.edited) edited += 1;
    if (!row.included) continue;
    included += 1;
    if (row.needsTriage) triage += 1;
    if (!row.title.trim()) blankTitles += 1;
  }
  const blockers: ReadingPreviewBlocker[] = [];
  if (included === 0) blockers.push('nothing-selected');
  if (blankTitles > 0) blockers.push('blank-title');
  return {
    parsed: draft.rows.length,
    included,
    dropped: draft.rows.length - included,
    edited,
    triage,
    blankTitles,
    droppedLines: draft.parsed.dropped.length,
    blockers,
  };
}

export interface ReadingPreviewImport {
  /**
   * The parse as the user left it: hand edits folded into the entries, raw lines
   * and line indexes untouched so `sourceRef` still points at the message.
   */
  parsed: ParsedReadingList;
  excludeLineIndexes: number[];
  rawText: string;
}

/**
 * What `applyReadingListImport` is called with.
 *
 * Blank-title rows are excluded here as well as blocked in the UI. The blocker
 * is what the user sees; this is what stops a caller that ignores it from
 * minting a nameless work — a validation that only exists in a button's
 * `disabled` attribute is not a validation.
 */
export function readingPreviewImport(draft: ReadingPreviewDraft): ReadingPreviewImport {
  const entries: ParsedReadingEntry[] = [];
  const excludeLineIndexes: number[] = [];
  for (const row of draft.rows) {
    const title = row.title.trim();
    if (!row.included || !title) {
      excludeLineIndexes.push(row.lineIndex);
    }
    const entry: ParsedReadingEntry = {
      rawLine: row.rawLine,
      lineIndex: row.lineIndex,
      title,
    };
    if (row.titleJa) entry.titleJa = row.titleJa;
    if (row.titleEn) entry.titleEn = row.titleEn;
    if (row.author) entry.author = row.author;
    if (row.volume) entry.volume = row.volume;
    if (row.url) entry.url = row.url;
    if (row.needsTriage) entry.needsTriage = row.needsTriage;
    entries.push(entry);
  }
  return {
    parsed: { ...draft.parsed, entries },
    excludeLineIndexes,
    rawText: draft.rawText,
  };
}
