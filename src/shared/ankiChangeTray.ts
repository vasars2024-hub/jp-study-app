// The ordered change tray — ANKI_DECK_WORKBENCH_PLAN.md Phase 3
// ("the ordered change tray, deterministic dry runs, validation, diff previews").
//
// Phase 2 gave the workbench single-note edits with a journal. A tray is the same
// thing at selection scale: an ordered list of actions, each applied to the output
// of the one before it, over the notes the Browser selected.
//
// Four properties this module exists to guarantee, all of which the plan's "safe
// batch workflow" turns on:
//
//  1. **The dry run is the apply.** `planChangeTray` computes the resulting draft
//     and returns it; "Apply" adopts that draft rather than re-running anything.
//     Two code paths — one to preview, one to mutate — is how a preview starts
//     lying, and there is no way to test that drift away once it exists.
//  2. **Order is semantic.** Action 2 sees action 1's output. A find/replace that
//     creates the text a later rule tags must actually see it, so actions are not
//     commutative and reordering is a real edit, not a cosmetic one.
//  3. **One tray application is one undo.** Every note-level op the tray produces
//     carries the same `group`, and `undoLastEdit` takes back a whole group. A
//     batch over 3,000 notes that needed 3,000 undos would not be reversible in
//     any sense a user recognises.
//  4. **A blocking problem changes nothing.** An unparseable regex or an empty
//     parameter fails the whole plan rather than silently skipping one action —
//     a tray that half-ran is the ambiguous partial result the plan forbids.
//
// Fields are addressed by **name**, never by ord. A selection routinely spans
// note types, and `Back` is ord 1 in one and ord 3 in another; targeting an ord
// would write into whichever field happened to sit there.

import type { AnkiDraft, AnkiDraftNote } from './ankiDraft';
import {
  createEditJournal,
  draftFieldNormalizer,
  normalizeTags,
  setNoteField,
  setNoteTags,
  type AnkiDraftEditJournal,
  type AnkiDraftEditOp,
} from './ankiDraftEdit';

export type TrayActionKind = 'add-tags' | 'remove-tags' | 'find-replace';

interface TrayActionBase {
  id: string;
  /** A disabled action stays in the order but neither runs nor reports counts. */
  enabled: boolean;
}

export type TrayAction =
  | (TrayActionBase & { kind: 'add-tags'; tags: string[] })
  | (TrayActionBase & { kind: 'remove-tags'; tags: string[] })
  | (TrayActionBase & {
      kind: 'find-replace';
      /** `null` means every field of every selected note's note type. */
      fieldName: string | null;
      find: string;
      replace: string;
      regex: boolean;
      matchCase: boolean;
    });

// ----- the ordered list --------------------------------------------------------

export function addTrayAction(actions: readonly TrayAction[], action: TrayAction): TrayAction[] {
  return [...actions, action];
}

export function removeTrayAction(actions: readonly TrayAction[], id: string): TrayAction[] {
  return actions.filter((a) => a.id !== id);
}

/** Move one action by `delta` places, clamped. Out-of-range is a no-op, not a throw. */
export function moveTrayAction(
  actions: readonly TrayAction[],
  id: string,
  delta: number,
): TrayAction[] {
  const from = actions.findIndex((a) => a.id === id);
  if (from < 0) return [...actions];
  const to = Math.min(actions.length - 1, Math.max(0, from + delta));
  if (to === from) return [...actions];
  const next = [...actions];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function toggleTrayAction(actions: readonly TrayAction[], id: string): TrayAction[] {
  return actions.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
}

// ----- the plan ----------------------------------------------------------------

export type TrayProblemCode =
  | 'empty-selection'
  | 'no-actions'
  | 'invalid-regex'
  | 'empty-parameter'
  | 'field-absent'
  | 'cloze-cards-change'
  | 'media-missing'
  | 'media-dropped';

export interface TrayProblem {
  code: TrayProblemCode;
  /** `blocking` refuses the whole plan; `warning` and `info` are consequences to show. */
  severity: 'blocking' | 'warning' | 'info';
  /** The action responsible, when one is. */
  actionId?: string;
  /** Notes (or, for `invalid-regex`, occurrences) the problem covers. */
  count: number;
  /** A regex message, a field name, a file name — never a translated string. */
  detail?: string;
}

export interface TrayFieldChange {
  ord: number;
  name: string;
  before: string;
  after: string;
}

export interface TrayNoteChange {
  noteId: string;
  fields: TrayFieldChange[];
  tags?: { before: string[]; after: string[] };
  clozeAdded: number[];
  clozeRemoved: number[];
  mediaMissing: string[];
  mediaDropped: string[];
}

export interface TrayActionOutcome {
  actionId: string;
  kind: TrayActionKind;
  /** Selected notes the action was offered. */
  matched: number;
  /** Notes it actually altered. */
  changed: number;
  /** Notes it was offered and left alone, including "the field does not exist here". */
  skipped: number;
}

export interface TrayPlan {
  /** The draft as it would be after the whole tray. `apply` means adopting this. */
  draft: AnkiDraft;
  /** The journal with this tray's ops appended under one `groupId`. */
  journal: AnkiDraftEditJournal;
  groupId: string;
  outcomes: TrayActionOutcome[];
  changes: TrayNoteChange[];
  changedNotes: number;
  problems: TrayProblem[];
  /** True when a blocking problem stopped the plan; `draft` is then the input. */
  blocked: boolean;
}

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `null` when the pattern will not compile. The caller turns that into a blocking
 * problem — a tray with one bad rule must not run its other rules and leave the
 * user guessing which half happened.
 */
function compilePattern(action: Extract<TrayAction, { kind: 'find-replace' }>): RegExp | string {
  const flags = `g${action.matchCase ? '' : 'i'}`;
  try {
    return new RegExp(action.regex ? action.find : escapeLiteral(action.find), flags);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function noteTypeOf(draft: AnkiDraft, note: AnkiDraftNote) {
  return draft.noteTypes.find((nt) => nt.id === note.noteTypeId);
}

/** Ords a find/replace action should visit in this note, in field order. */
function targetOrds(draft: AnkiDraft, note: AnkiDraftNote, fieldName: string | null): number[] {
  if (fieldName === null) return note.fields.map((f) => f.ord).sort((a, b) => a - b);
  const def = noteTypeOf(draft, note)?.fields.find((f) => f.name === fieldName);
  // The note type is authoritative, but a source that could not read one still
  // gives each value a name, so fall back to the value rather than skipping.
  const ord = def?.ord ?? note.fields.find((f) => f.name === fieldName)?.ord;
  return ord === undefined ? [] : [ord];
}

function blockingProblems(actions: readonly TrayAction[], noteIds: readonly string[]): TrayProblem[] {
  const problems: TrayProblem[] = [];
  const enabled = actions.filter((a) => a.enabled);
  if (noteIds.length === 0) problems.push({ code: 'empty-selection', severity: 'blocking', count: 0 });
  if (enabled.length === 0) problems.push({ code: 'no-actions', severity: 'blocking', count: 0 });
  for (const action of enabled) {
    if (action.kind === 'find-replace') {
      if (action.find === '') {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
        continue;
      }
      const compiled = compilePattern(action);
      if (typeof compiled === 'string') {
        problems.push({
          code: 'invalid-regex',
          severity: 'blocking',
          actionId: action.id,
          count: 1,
          detail: compiled,
        });
      }
    } else if (normalizeTags(action.tags).length === 0) {
      problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
    }
  }
  return problems;
}

function mergeFieldChange(change: TrayNoteChange, field: TrayFieldChange): void {
  const existing = change.fields.find((f) => f.ord === field.ord);
  // Two actions touching one field must read as one net change: the first
  // action's `before` and the last action's `after`. Anything else shows the
  // user an intermediate string that never existed on disk and never will.
  if (existing) existing.after = field.after;
  else change.fields.push(field);
}

function pushUnique(into: number[] | string[], from: readonly (number | string)[]): void {
  for (const v of from) if (!(into as (number | string)[]).includes(v)) (into as (number | string)[]).push(v);
}

/**
 * Run the tray over `noteIds` and return everything a preview and an apply both
 * need. Pure: the input draft and journal are untouched.
 *
 * `groupId` defaults to a value derived from the journal's length, which is
 * unique against every group that could still be undone — a group only matters
 * while it is the trailing run, and reaching the trailing position again means
 * the journal is shorter than it was when the colliding id was minted.
 */
export function planChangeTray(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  noteIds: readonly string[],
  actions: readonly TrayAction[],
  opts?: { groupId?: string },
): TrayPlan {
  const groupId = opts?.groupId ?? `tray-${journal.done.length + 1}`;
  const problems = blockingProblems(actions, noteIds);
  if (problems.length > 0) {
    return {
      draft,
      journal,
      groupId,
      outcomes: [],
      changes: [],
      changedNotes: 0,
      problems,
      blocked: true,
    };
  }

  const normalize = draftFieldNormalizer(draft.source);
  const changesById = new Map<string, TrayNoteChange>();
  const outcomes: TrayActionOutcome[] = [];
  // A scratch journal keeps `setNoteField`'s ops separable from the caller's
  // history; they are stamped with the group and appended once, at the end.
  let working = draft;
  let scratch = createEditJournal();

  const changeFor = (noteId: string): TrayNoteChange => {
    let change = changesById.get(noteId);
    if (!change) {
      change = {
        noteId,
        fields: [],
        clozeAdded: [],
        clozeRemoved: [],
        mediaMissing: [],
        mediaDropped: [],
      };
      changesById.set(noteId, change);
    }
    return change;
  };

  for (const action of actions) {
    if (!action.enabled) continue;
    let matched = 0;
    let changed = 0;

    for (const noteId of noteIds) {
      const note = working.notes.find((n) => n.id === noteId);
      if (!note) continue;
      matched += 1;
      let touched = false;

      if (action.kind === 'find-replace') {
        const pattern = compilePattern(action);
        if (typeof pattern === 'string') continue;
        const ords = targetOrds(working, note, action.fieldName);
        if (ords.length === 0) {
          problems.push({
            code: 'field-absent',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail: action.fieldName ?? '',
          });
        }
        for (const ord of ords) {
          const current = working.notes.find((n) => n.id === noteId);
          const value = current?.fields.find((f) => f.ord === ord);
          if (!current || !value) continue;
          // `lastIndex` survives on a `g` regex between calls, so a fresh one per
          // field is not an optimisation to remove: reusing it silently skips
          // matches at the start of every second field.
          const fresh = compilePattern(action) as RegExp;
          const next = value.raw.replace(fresh, action.replace);
          if (next === value.raw) continue;
          const res = setNoteField(working, scratch, noteId, ord, next, normalize);
          if (!res.changed) continue;
          working = res.draft;
          scratch = res.journal;
          touched = true;
          const change = changeFor(noteId);
          mergeFieldChange(change, { ord, name: value.name, before: value.raw, after: next });
          pushUnique(change.clozeAdded, res.clozeOrdinalsAdded ?? []);
          pushUnique(change.clozeRemoved, res.clozeOrdinalsRemoved ?? []);
          pushUnique(change.mediaMissing, res.mediaMissing ?? []);
          pushUnique(change.mediaDropped, res.mediaDropped ?? []);
        }
      } else {
        const wanted = normalizeTags(action.tags);
        const before = note.tags;
        const after =
          action.kind === 'add-tags'
            ? normalizeTags([...before, ...wanted])
            : before.filter((tag) => !wanted.includes(tag));
        const res = setNoteTags(working, scratch, noteId, after);
        if (res.changed) {
          working = res.draft;
          scratch = res.journal;
          touched = true;
          const change = changeFor(noteId);
          // The net tag change, same rule as fields: keep the earliest `before`.
          change.tags = { before: change.tags?.before ?? before, after };
        }
      }

      if (touched) changed += 1;
    }

    outcomes.push({
      actionId: action.id,
      kind: action.kind,
      matched,
      changed,
      skipped: matched - changed,
    });
  }

  const changes = [...changesById.values()];
  for (const change of changes) {
    if (change.clozeAdded.length > 0 || change.clozeRemoved.length > 0) {
      problems.push({
        code: 'cloze-cards-change',
        severity: 'warning',
        count: 1,
        detail: change.noteId,
      });
    }
    for (const name of change.mediaMissing) {
      problems.push({ code: 'media-missing', severity: 'warning', count: 1, detail: name });
    }
    for (const name of change.mediaDropped) {
      problems.push({ code: 'media-dropped', severity: 'info', count: 1, detail: name });
    }
  }

  const grouped: AnkiDraftEditOp[] = scratch.done.map((op) => ({ ...op, group: groupId }));
  return {
    draft: working,
    journal: { done: [...journal.done, ...grouped], undone: grouped.length > 0 ? [] : journal.undone },
    groupId,
    outcomes,
    changes,
    changedNotes: changes.length,
    problems,
    blocked: false,
  };
}

/** Collapse the problem list to one line per code, for a compact summary. */
export function summarizeTrayProblems(problems: readonly TrayProblem[]): TrayProblem[] {
  const out: TrayProblem[] = [];
  for (const problem of problems) {
    const existing = out.find((p) => p.code === problem.code && p.actionId === problem.actionId);
    if (existing) existing.count += problem.count;
    else out.push({ ...problem });
  }
  return out;
}
