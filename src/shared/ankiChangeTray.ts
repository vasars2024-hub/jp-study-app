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

import type { AnkiDraft, AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import {
  MARKED_TAG,
  createDraftEditIndex,
  draftFieldNormalizer,
  normalizeTags,
  writeNoteField,
  type AnkiDraftEditJournal,
  type AnkiDraftEditOp,
} from './ankiDraftEdit';
import {
  resolveEnrichValue,
  wrapEnrichProvenance,
  type EnrichAspect,
  type EnrichLookup,
  type EnrichProvenanceMode,
  type EnrichSenseRule,
} from './ankiEnrich';
import { normalizeFieldText, type TextNormalizeOp } from './ankiTextNormalize';
import type { VocabContext } from './ankiVocabContext';

export type TrayActionKind =
  | 'add-tags'
  | 'remove-tags'
  | 'find-replace'
  | 'swap-fields'
  | 'copy-field'
  | 'normalize-text'
  | 'enrich-dictionary';

/**
 * What a copy does when the destination already holds text — Phase 4's "require
 * explicit overwrite choices". There is deliberately no default: a `copy-field`
 * action that silently meant `overwrite` is how a batch destroys the only copy
 * of a field, and the type makes the caller say which it meant.
 */
export type FieldCopyConflict = 'overwrite' | 'keep' | 'append';

/** What `append` puts between the old value and the copied one when unset. */
export const DEFAULT_COPY_SEPARATOR = '<br>';

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
    })
  | (TrayActionBase & { kind: 'swap-fields'; fieldA: string; fieldB: string })
  | (TrayActionBase & {
      kind: 'copy-field';
      fromField: string;
      toField: string;
      onConflict: FieldCopyConflict;
      /** Only read for `append`; `DEFAULT_COPY_SEPARATOR` when omitted. */
      separator?: string;
    })
  | (TrayActionBase & {
      kind: 'normalize-text';
      /** `null` means every field, same as find/replace. */
      fieldName: string | null;
      /** Order here is ignored; they always run in `TEXT_NORMALIZE_ORDER`. */
      ops: TextNormalizeOp[];
    })
  | (TrayActionBase & {
      kind: 'enrich-dictionary';
      /** Which dictionary fact to write. */
      aspect: EnrichAspect;
      /** Where to write it. The word itself is found by `ankiVocabContext`. */
      toField: string;
      /** Same three answers a copy has, for the same reason. No default. */
      onConflict: FieldCopyConflict;
      /** Only read for `append`; `DEFAULT_COPY_SEPARATOR` when omitted. */
      separator?: string;
      /** What a disagreement between installed dictionaries means. No default. */
      senseRule: EnrichSenseRule;
      /** Whether the field records which dictionary produced it. No default. */
      provenance: EnrichProvenanceMode;
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
  | 'same-field'
  | 'overwrite-nonempty'
  | 'cloze-cards-change'
  | 'media-missing'
  | 'media-dropped'
  /** An enrichment was queued with no dictionary data to read. Blocking. */
  | 'no-enrich-data'
  /** No installed dictionary answered for this note's word. */
  | 'enrich-no-entry'
  /** This note declares no word field, so there is nothing to look up. */
  | 'enrich-no-word'
  /** Installed dictionaries disagreed and the rule is `refuse`. */
  | 'enrich-sense-conflict'
  /** Dictionaries disagreed and `all-sources` wrote the merge. */
  | 'enrich-sources-merged';

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

/** Ords a find/replace action should visit in this note, in field order. */
function targetOrds(
  noteTypes: Map<string, AnkiDraftNoteType>,
  note: AnkiDraftNote,
  fieldName: string | null,
): number[] {
  if (fieldName === null) return note.fields.map((f) => f.ord).sort((a, b) => a - b);
  const def = noteTypes.get(note.noteTypeId)?.fields.find((f) => f.name === fieldName);
  // The note type is authoritative, but a source that could not read one still
  // gives each value a name, so fall back to the value rather than skipping.
  const ord = def?.ord ?? note.fields.find((f) => f.name === fieldName)?.ord;
  return ord === undefined ? [] : [ord];
}

function blockingProblems(
  actions: readonly TrayAction[],
  noteIds: readonly string[],
  hasEnrichData: boolean,
): TrayProblem[] {
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
    } else if (action.kind === 'normalize-text') {
      // No op chosen is not "normalise with defaults": there is no default, and
      // an action that provably cannot change anything is a mis-set form.
      if (action.ops.length === 0) {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      }
    } else if (action.kind === 'enrich-dictionary') {
      if (action.toField === '') {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (!hasEnrichData) {
        // The lookup is asynchronous and lives outside this module, so a tray
        // planned before it resolved would enrich nothing and report every note
        // as "no entry" — which reads as "your dictionaries are empty" and is
        // not true. Refuse the plan instead, exactly as the `freq:` predicates
        // refuse a query with no vocabulary context.
        problems.push({ code: 'no-enrich-data', severity: 'blocking', actionId: action.id, count: 1 });
      }
    } else if (action.kind === 'swap-fields' || action.kind === 'copy-field') {
      const [a, b] =
        action.kind === 'swap-fields'
          ? [action.fieldA, action.fieldB]
          : [action.fromField, action.toField];
      if (a === '' || b === '') {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (a === b) {
        // A swap with itself is a no-op and a copy onto itself is either a no-op
        // or, with `append`, a silent doubling. Both read as a mis-set form, so
        // refuse rather than run something the user cannot have meant.
        problems.push({
          code: 'same-field',
          severity: 'blocking',
          actionId: action.id,
          count: 1,
          detail: a,
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
  opts?: {
    groupId?: string;
    /**
     * The dictionary hits an `enrich-dictionary` action reads, and the words to
     * read them for. Both come from outside — one from IPC, one from the
     * Browser's `VocabContext` — so neither can live on a serializable action.
     */
    enrich?: { lookup: EnrichLookup; vocab: VocabContext };
  },
): TrayPlan {
  const groupId = opts?.groupId ?? `tray-${journal.done.length + 1}`;
  const problems = blockingProblems(actions, noteIds, opts?.enrich !== undefined);
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
  // One working copy and one set of lookups for the whole tray. Rebuilding the
  // notes array per edited note, or scanning it to find each note, is quadratic
  // and this preview is recomputed on every render — see `ankiChangeTrayScale`.
  const notes = [...draft.notes];
  const index = createDraftEditIndex(draft);
  const noteTypes = new Map(draft.noteTypes.map((nt) => [nt.id, nt]));
  const ops: AnkiDraftEditOp[] = [];

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

  /**
   * Write one field and record every consequence of it. Returns false when the
   * value is already what was asked for, so a caller can count "changed" without
   * knowing anything about media, cloze or the journal.
   *
   * `next` is computed by the caller *before* calling, which is what makes a
   * swap correct: both values are read while both are still the originals.
   */
  const applyWrite = (at: number, noteId: string, ord: number, next: string): boolean => {
    const current = notes[at];
    const value = current?.fields.find((f) => f.ord === ord);
    if (!current || !value || value.raw === next) return false;
    const isCloze = index.clozeTypeIds.has(current.noteTypeId);
    const out = writeNoteField(current, ord, next, normalize, isCloze, index.present);
    notes[at] = out.note;
    ops.push({ kind: 'field', noteId, fieldOrd: ord, before: value.raw, after: next, group: groupId });
    const change = changeFor(noteId);
    mergeFieldChange(change, { ord, name: value.name, before: value.raw, after: next });
    pushUnique(change.clozeAdded, out.clozeOrdinalsAdded);
    pushUnique(change.clozeRemoved, out.clozeOrdinalsRemoved);
    pushUnique(change.mediaMissing, out.mediaMissing);
    pushUnique(change.mediaDropped, out.mediaDropped);
    return true;
  };

  /**
   * The single ord a field name resolves to on this note, or `undefined`. A note
   * type that lacks one half of a swap or copy makes the whole note skip: writing
   * only the half that exists is the ambiguous partial result the tray forbids,
   * and for a swap it would destroy the surviving value outright.
   */
  const soleOrd = (note: AnkiDraftNote, fieldName: string): number | undefined =>
    targetOrds(noteTypes, note, fieldName)[0];

  for (const action of actions) {
    if (!action.enabled) continue;
    let matched = 0;
    let changed = 0;

    for (const noteId of noteIds) {
      const at = index.position.get(noteId);
      const start = at === undefined ? undefined : notes[at];
      if (at === undefined || !start) continue;
      matched += 1;
      let touched = false;

      if (action.kind === 'find-replace') {
        const pattern = compilePattern(action);
        if (typeof pattern === 'string') continue;
        const ords = targetOrds(noteTypes, start, action.fieldName);
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
          // Re-read every time: a previous ord's write replaced the note object.
          const value = (notes[at] ?? start).fields.find((f) => f.ord === ord);
          if (!value) continue;
          // `lastIndex` survives on a `g` regex between calls, so a fresh one per
          // field is not an optimisation to remove: reusing it silently skips
          // matches at the start of every second field.
          const fresh = compilePattern(action) as RegExp;
          if (applyWrite(at, noteId, ord, value.raw.replace(fresh, action.replace))) touched = true;
        }
      } else if (action.kind === 'normalize-text') {
        const ords = targetOrds(noteTypes, start, action.fieldName);
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
          const value = (notes[at] ?? start).fields.find((f) => f.ord === ord);
          if (!value) continue;
          if (applyWrite(at, noteId, ord, normalizeFieldText(value.raw, action.ops))) touched = true;
        }
      } else if (action.kind === 'swap-fields') {
        const ordA = soleOrd(start, action.fieldA);
        const ordB = soleOrd(start, action.fieldB);
        if (ordA === undefined || ordB === undefined) {
          problems.push({
            code: 'field-absent',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail: ordA === undefined ? action.fieldA : action.fieldB,
          });
          continue;
        }
        // Both reads happen here, against the same note object, so the second
        // write cannot see the first one's output and copy a value onto itself.
        const rawA = start.fields.find((f) => f.ord === ordA)?.raw ?? '';
        const rawB = start.fields.find((f) => f.ord === ordB)?.raw ?? '';
        if (applyWrite(at, noteId, ordA, rawB)) touched = true;
        if (applyWrite(at, noteId, ordB, rawA)) touched = true;
      } else if (action.kind === 'enrich-dictionary') {
        const enrich = opts?.enrich;
        // Unreachable: `blockingProblems` already refused. Kept because the type
        // is optional and a future caller must not get a silent no-op.
        if (!enrich) continue;
        const toOrd = soleOrd(start, action.toField);
        if (toOrd === undefined) {
          problems.push({
            code: 'field-absent',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail: action.toField,
          });
          continue;
        }
        const term = enrich.vocab.byNote.get(noteId)?.term ?? null;
        if (!term) {
          problems.push({
            code: 'enrich-no-word',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail: noteId,
          });
          continue;
        }
        const resolved = resolveEnrichValue(enrich.lookup.get(term), action.aspect, action.senseRule);
        if ('refused' in resolved) {
          problems.push({
            code: resolved.refused === 'sense-conflict' ? 'enrich-sense-conflict' : 'enrich-no-entry',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail: term,
          });
          continue;
        }
        if (resolved.merged) {
          problems.push({
            code: 'enrich-sources-merged',
            severity: 'info',
            actionId: action.id,
            count: 1,
            detail: term,
          });
        }
        const written = wrapEnrichProvenance(resolved.value, resolved.sources, action.provenance);
        const toRaw = start.fields.find((f) => f.ord === toOrd)?.raw ?? '';
        const occupied = toRaw.trim() !== '';
        let next: string | null;
        if (!occupied) next = written;
        else if (action.onConflict === 'overwrite') next = written;
        else if (action.onConflict === 'append')
          next = `${toRaw}${action.separator ?? DEFAULT_COPY_SEPARATOR}${written}`;
        else next = null;
        if (next !== null && applyWrite(at, noteId, toOrd, next)) {
          touched = true;
          if (occupied && action.onConflict === 'overwrite') {
            problems.push({
              code: 'overwrite-nonempty',
              severity: 'warning',
              actionId: action.id,
              count: 1,
              detail: action.toField,
            });
          }
        }
      } else if (action.kind === 'copy-field') {
        const fromOrd = soleOrd(start, action.fromField);
        const toOrd = soleOrd(start, action.toField);
        if (fromOrd === undefined || toOrd === undefined) {
          problems.push({
            code: 'field-absent',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail: fromOrd === undefined ? action.fromField : action.toField,
          });
          continue;
        }
        const fromRaw = start.fields.find((f) => f.ord === fromOrd)?.raw ?? '';
        const toRaw = start.fields.find((f) => f.ord === toOrd)?.raw ?? '';
        const occupied = toRaw.trim() !== '';
        let next: string | null;
        if (!occupied) next = fromRaw;
        else if (action.onConflict === 'overwrite') next = fromRaw;
        else if (action.onConflict === 'append')
          next = `${toRaw}${action.separator ?? DEFAULT_COPY_SEPARATOR}${fromRaw}`;
        else next = null; // `keep`: an occupied destination is left exactly alone.
        if (next !== null && applyWrite(at, noteId, toOrd, next)) {
          touched = true;
          if (occupied && action.onConflict === 'overwrite') {
            // The destructive case, counted rather than assumed: the user chose
            // it, but they should see how many notes lost text before applying.
            problems.push({
              code: 'overwrite-nonempty',
              severity: 'warning',
              actionId: action.id,
              count: 1,
              detail: action.toField,
            });
          }
        }
      } else {
        const current = start;
        const wanted = normalizeTags(action.tags);
        const before = current.tags;
        const after =
          action.kind === 'add-tags'
            ? normalizeTags([...before, ...wanted])
            : before.filter((tag) => !wanted.includes(tag));
        if (after.length !== before.length || after.some((tag, i) => tag !== before[i])) {
          // `marked` is a tag in the data and a flag in the model; the same rule
          // `setNoteTags` enforces, because letting them disagree makes the
          // Browser's marked column contradict its tag column.
          notes[at] = { ...current, tags: after, marked: after.includes(MARKED_TAG) };
          ops.push({ kind: 'tags', noteId, before, after, group: groupId });
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

  return {
    // A tray that changed nothing returns the input objects, so a caller can
    // compare by identity to see that nothing happened.
    draft: ops.length > 0 ? { ...draft, notes } : draft,
    journal:
      ops.length > 0
        ? // A fresh batch forks the history, same as a single edit: a redo past
          // it would reapply ops computed against a draft that no longer exists.
          { done: [...journal.done, ...ops], undone: [] }
        : journal,
    groupId,
    outcomes,
    changes,
    changedNotes: changes.length,
    problems,
    blocked: false,
  };
}

/** Collapse the problem list to one line per code, for a compact summary. */
/**
 * How many distinct details one summarized problem names before it stops. A
 * whole deck's worth of words in one warning line is unreadable, and the count
 * is already there to say how many there were.
 */
export const MAX_PROBLEM_DETAILS = 5;

export function summarizeTrayProblems(problems: readonly TrayProblem[]): TrayProblem[] {
  const out: TrayProblem[] = [];
  // Details are collected, not overwritten: the per-note problems carry one
  // word, file name or field each, and keeping only the first one's — which is
  // what summing counts alone did — turns "these six words conflicted" into a
  // number the user cannot act on.
  const collected = new Map<TrayProblem, string[]>();
  for (const problem of problems) {
    const existing = out.find((p) => p.code === problem.code && p.actionId === problem.actionId);
    if (!existing) {
      const copy = { ...problem };
      out.push(copy);
      collected.set(copy, problem.detail === undefined ? [] : [problem.detail]);
      continue;
    }
    existing.count += problem.count;
    const seen = collected.get(existing);
    if (!seen || problem.detail === undefined || seen.includes(problem.detail)) continue;
    // One past the cap, so the overflow is detectable without a second counter.
    if (seen.length <= MAX_PROBLEM_DETAILS) seen.push(problem.detail);
  }
  for (const [problem, seen] of collected) {
    if (seen.length === 0) continue;
    problem.detail =
      seen.length > MAX_PROBLEM_DETAILS
        ? `${seen.slice(0, MAX_PROBLEM_DETAILS).join(', ')}…`
        : seen.join(', ');
  }
  return out;
}
