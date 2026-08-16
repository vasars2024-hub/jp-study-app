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

import type { AnkiDraft, AnkiDraftDeck, AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import {
  MARKED_TAG,
  createDraftEditIndex,
  draftFieldNormalizer,
  relinkDeckParents,
  normalizeTags,
  writeNoteField,
  type AnkiDraftEditJournal,
  type AnkiDraftEditOp,
} from './ankiDraftEdit';
import {
  approvedAiAdditions,
  summarizeAiReview,
  wrapAiProvenance,
  type AiBatch,
} from './ankiAiAdditions';
import {
  resolveEnrichValue,
  wrapEnrichProvenance,
  type EnrichAspect,
  type EnrichLookup,
  type EnrichProvenanceMode,
  type EnrichSenseRule,
} from './ankiEnrich';
import {
  proposeReading,
  readingMeetsThreshold,
  type ReadingFillForm,
  type ReadingFillThreshold,
} from './ankiReadingFill';
import { normalizeFieldText, type TextNormalizeOp } from './ankiTextNormalize';
import {
  planTagNormalize,
  type TagNormalizeOp,
  type TagNormalizePlan,
} from './ankiTagNormalize';
import {
  planDeckNormalize,
  type DeckNormalizeOp,
  type DeckNormalizePlan,
} from './ankiDeckNormalize';
import {
  deckSplitParameterProblem,
  planDeckSplit,
  type DeckSplitAxis,
  type DeckSplitPlan,
  type DeckSplitRefusalCode,
  type DeckSplitUnmatched,
} from './ankiDeckSplit';
import {
  planPrioritizeNew,
  type PrioritizePlan,
  type PrioritizeRefusal,
} from './ankiPrioritize';
import {
  planLeechRescue,
  type LeechRescueMeasure,
  type LeechRescuePlan,
  type LeechRescueRefusal,
} from './ankiLeechRescue';
import {
  isMasteryLevel,
  planMasteryMapping,
  type MasteryLevel,
  type MasteryPlan,
} from './ankiMastery';
import type { VocabContext } from './ankiVocabContext';

export type TrayActionKind =
  | 'add-tags'
  | 'remove-tags'
  | 'find-replace'
  | 'swap-fields'
  | 'copy-field'
  | 'normalize-text'
  | 'enrich-dictionary'
  | 'fill-reading'
  | 'apply-ai-additions'
  | 'prioritize-new'
  | 'rescue-leeches'
  | 'set-mastery'
  | 'normalize-tags'
  | 'normalize-decks'
  | 'split-deck';

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
    })
  | (TrayActionBase & {
      kind: 'fill-reading';
      /** Plain kana or bracket ruby. No default: they are different fields. */
      form: ReadingFillForm;
      /** Where the reading goes. The word itself is found by `ankiVocabContext`. */
      toField: string;
      /**
       * The lowest confidence written without a human. There is deliberately no
       * `onConflict` alongside it: recipe 7 fills *missing* readings, so a
       * destination that already holds text is skipped and counted, never
       * overwritten. A hand-checked reading is exactly the value a dictionary
       * batch must not be able to replace.
       */
      threshold: ReadingFillThreshold;
      /** Whether the field records which dictionary produced it. No default. */
      provenance: EnrichProvenanceMode;
    })
  | (TrayActionBase & {
      kind: 'apply-ai-additions';
      /**
       * The reviewed batch this action writes. The batch itself arrives through
       * `planChangeTray`'s options — it holds the user's whole review and is far
       * too large to sit on a serializable action — so this is the id that
       * proves the two agree. A tray built for one generation run must not
       * write a different run's sentences into the deck.
       */
      batchId: string;
      /** Where the approved text goes. */
      toField: string;
      /** Same three answers a copy has, for the same reason. No default. */
      onConflict: FieldCopyConflict;
      /** Only read for `append`; `DEFAULT_COPY_SEPARATOR` when omitted. */
      separator?: string;
    })
  | (TrayActionBase & {
      /**
       * Recipe 6. Renumbers the *new*-queue positions of the selection's
       * unknown, ranked words so the most frequent come first, and refuses every
       * known or already-started card by name. See `ankiPrioritize.ts` for why
       * this is the only honest reading of "prioritize".
       */
      kind: 'prioritize-new';
      /**
       * The first position handed out. No default here on purpose: `0` puts the
       * batch ahead of the whole existing new queue and a large number puts it
       * behind, and which of those the user meant is not this module's guess.
       */
      startPosition: number;
    })
  | (TrayActionBase & {
      /**
       * Recipe 10. Finds the selection's leeches by lapse count and Anki's own
       * `leech` tag, then applies the measures the journal can undo. See
       * `ankiLeechRescue.ts` for why `reschedule` is refused rather than faked.
       */
      kind: 'rescue-leeches';
      /**
       * Lapses at or above which a card is a leech. No default here: Anki's 8 is
       * a *deck option*, and a user whose deck runs at 4 would silently rescue
       * nothing if this module assumed the shipped value.
       */
      threshold: number;
      /** Whether Anki's `leech` tag qualifies a note below the threshold. */
      includeTagged: boolean;
      /** Which measures to apply. Empty is refused as an empty parameter. */
      measures: LeechRescueMeasure[];
      /** The tag the `tag` measure writes. Only read when `tag` is selected. */
      rescueTag: string;
      /** The field a hint is derived from. Only read when `hint` is selected. */
      hintFromField: string;
      /** The field a hint is written into. Only read when `hint` is selected. */
      hintToField: string;
      /** Characters revealed; `DEFAULT_LEECH_HINT_REVEAL` when omitted. */
      hintReveal?: number;
    })
  | (TrayActionBase & {
      /**
       * Recipe 12, tag half. Repairs `::` paths and unifies case-variant tags
       * against the spelling the draft already uses most. See
       * `ankiTagNormalize.ts` for why the casing is not this module's choice.
       */
      kind: 'normalize-tags';
      /** Order here is ignored; they always run in `TAG_NORMALIZE_ORDER`. */
      ops: TagNormalizeOp[];
    })
  | (TrayActionBase & {
      /**
       * Recipe 12, deck half. The only action whose unit is the DECK and not the
       * note: it runs over the whole draft's deck list regardless of what is
       * selected, because a deck is not part of a selection and renaming only
       * the decks a filter happened to reach would leave the tree half-tidied.
       */
      kind: 'normalize-decks';
      /** Order here is ignored; they always run in `DECK_NORMALIZE_ORDER`. */
      ops: DeckNormalizeOp[];
    })
  | (TrayActionBase & {
      /**
       * Recipe 13. The only action that moves a card between decks, and the
       * only one whose scope is a named deck rather than the selection: see
       * `ankiDeckSplit.ts` for why a selection that reached outside the parent
       * refuses those cards instead of restructuring the whole collection.
       */
      kind: 'split-deck';
      axis: DeckSplitAxis;
      /** The deck being split. Its subtree is the scope. */
      parentDeckId: string;
      /** What happens to notes with no value on the axis. No default. */
      unmatched: DeckSplitUnmatched;
      /** Name of the deck `collect` gathers them into. Read only for `collect`. */
      unmatchedSegment?: string;
      /** Ascending band edges. Required for `frequency`, ignored elsewhere. */
      bands?: number[];
    })
  | (TrayActionBase & {
      kind: 'set-mastery';
      /**
       * The rung to move the selection's words to. No default: the whole point
       * of gate 3 is that the user names the level and is shown its effect, and
       * a default would be this module choosing a judgement on their behalf.
       */
      level: MasteryLevel;
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
  | 'enrich-sources-merged'
  /** This note declares no word field, so there is no reading to look up. */
  | 'reading-no-word'
  /** No installed dictionary answered with a reading for this note's word. */
  | 'reading-no-entry'
  /**
   * Readings came back but none was kana — on this machine that is a Chinese
   * entry answering a kanji with pinyin. Nothing is written.
   */
  | 'reading-not-kana'
  /** Several distinct readings. Review only — never written at any threshold. */
  | 'reading-ambiguous'
  /** One reading, but less certain than the threshold allows. Left for review. */
  | 'reading-below-threshold'
  /** The destination already holds text, so the reading is not missing. */
  | 'reading-occupied'
  /** Furigana was asked for on a word with no kanji: nothing to annotate. */
  | 'reading-no-kanji'
  /** An AI addition was queued with no generation batch to read. Blocking. */
  | 'no-ai-review'
  /** The queued action names a different batch than the one supplied. Blocking. */
  | 'ai-batch-mismatch'
  /**
   * Variants came back that the user has neither approved nor rejected.
   * Blocking: applying them would be generation without a reviewed diff.
   */
  | 'ai-not-reviewed'
  /** The provider failed for these notes. Retryable — see `aiRetryTargets`. */
  | 'ai-generation-failed'
  /** The batch was cancelled before these notes were generated. */
  | 'ai-cancelled'
  /** The user rejected every variant for these notes, so nothing is written. */
  | 'ai-all-rejected'
  /** A mastery mapping or a reposition was queued with no vocabulary context. Blocking. */
  | 'no-vocab-context'
  /** Left alone because the user already knows the word — recipe 6's guarantee. */
  | 'prioritize-known'
  /** No installed corpus ranks this word, so there is no frequency to order by. */
  | 'prioritize-no-rank'
  /** This note declares no word, so it has no frequency either. */
  | 'prioritize-no-word'
  /** The note's cards have all left the new queue; a position would not apply. */
  | 'prioritize-not-new'
  /** The note generates no card in this draft, so there is nothing to position. */
  | 'prioritize-no-cards'
  /** Selected, but neither over the leech threshold nor carrying Anki's tag. */
  | 'leech-not-leech'
  /** The note generates no card in this draft, so it has no lapse count. */
  | 'leech-no-cards'
  /** The rescue tag is already on this note. */
  | 'leech-already-tagged'
  /** This note type has no field by one of the two hint names. */
  | 'leech-hint-field-absent'
  /** The hint source field is empty on this note. */
  | 'leech-hint-source-empty'
  /** The source is no longer than the reveal, so a hint would be the answer. */
  | 'leech-hint-source-too-short'
  /** The hint field already holds text; recipe 10 never overwrites one. */
  | 'leech-hint-occupied'
  /**
   * A slower scheduling preset was asked for and the workbench cannot write
   * one. Blocking when it is the only measure — an Apply that ran and changed
   * nothing would read as the reschedule having happened.
   */
  | 'leech-reschedule-unsupported'
  /** These notes declare no word, so there is nothing whose mastery could move. */
  | 'mastery-no-word'
  /** These notes' word field holds a phrase, which is not a lemma to store. */
  | 'mastery-phrase'
  /**
   * The consequence gate 3 forbids leaving implied: this writes local knowledge
   * and reschedules nothing in Anki. Always reported when the action runs.
   */
  | 'mastery-local-only'
  /** Tags that changed spelling. `detail` is `from -> to` for the first few. */
  | 'tag-normalize-renamed'
  /**
   * Tags a note lost: a redundant parent, a separator-only tag, or a variant
   * that collapsed onto a spelling the note already carried. Never a concept the
   * note was the only holder of — but it is a removal, so it is a warning.
   */
  | 'tag-normalize-removed'
  /**
   * The action ran and moved nothing. Reported rather than left silent, because
   * "already consistent" and "the ops you chose do not apply here" look
   * identical from an outcome row of `changed: 0`.
   */
  | 'tag-normalize-clean'
  /** Decks that changed name. `detail` is `from -> to` for the first few. */
  | 'deck-normalize-renamed'
  /**
   * A rename refused because another deck already holds the name. Merging two
   * decks moves cards, which is not what a rename says it does, so the other
   * renames run and this one is named. A warning, not blocking: the run did
   * what it could and the user has to know what it did not do.
   */
  | 'deck-normalize-merge-refused'
  /** Filtered decks left alone: their cards are on loan and Anki rebuilds them. */
  | 'deck-normalize-filtered'
  /** The action ran and renamed nothing. Same reason `tag-normalize-clean` exists. */
  | 'deck-normalize-clean'
  /**
   * Recipe 13's split could not run at all: no such parent, a filtered parent,
   * bands that are not ascending positive integers, or `collect` with no name.
   * Blocking — `detail` carries the `DeckSplitProblem`, so one code covers every
   * impossible input without four near-identical rows.
   */
  | 'split-refused'
  /** Cards this split moves. `detail` names the first target deck. */
  | 'split-moved'
  /** Notes carrying no value on the axis. Info under `leave`, since nothing moved. */
  | 'split-unmatched'
  /** A selected card outside the deck being split. Warning: it was left alone. */
  | 'split-outside-parent'
  /** A card on loan to a filtered deck. Moving it would strand it on rebuild. */
  | 'split-filtered-card'
  /** Tags name two JLPT levels, so the split refuses to pick one. */
  | 'split-ambiguous'
  /** A selected note that generates no card, so there is nothing to file. */
  | 'split-no-cards'
  /** The split ran and moved nothing. Same reason `deck-normalize-clean` exists. */
  | 'split-clean';

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
  /**
   * What a `set-mastery` action would write, when the tray holds one. It is not
   * folded into `draft`: local knowledge is keyed by lemma and lives outside the
   * deck, so a mastery-only tray returns the *identical* draft object and
   * `changedNotes: 0` while still having real work to do. A caller that adopts
   * only `draft` on Apply silently drops it.
   */
  mastery?: MasteryPlan;
  /**
   * What a `prioritize-new` action moved. Unlike `mastery` this **is** folded
   * into `draft` (a queue position is deck data), so the field is reporting
   * rather than a second thing to adopt — it exists so the surface can name the
   * words and positions instead of showing a bare count.
   */
  prioritize?: PrioritizePlan;
  /**
   * What a `rescue-leeches` action found and wrote. Folded into `draft` like
   * `prioritize`; it is here so the surface can show which notes were leeches
   * and how many qualified only through Anki's tag, instead of a bare count.
   */
  leechRescue?: LeechRescuePlan;
  /**
   * What a `normalize-tags` action did. Folded into `draft` like `prioritize`;
   * it is here so the surface can show the distinct-tag count before and after,
   * which is the number that says whether the sidebar actually got shorter.
   */
  tagNormalize?: TagNormalizePlan;
  /**
   * What a `normalize-decks` action did. Folded into `draft` like `tagNormalize`,
   * and here for a reason the others do not have: a deck-only tray leaves
   * `changedNotes` at 0, so this is the only place its work is visible at all.
   */
  deckNormalize?: DeckNormalizePlan;
  /**
   * What a `split-deck` action would do. Folded into `draft` — both the card
   * moves and the decks it creates — and here so the surface can show the
   * per-bucket counts and the refusals by name rather than one moved total.
   */
  deckSplit?: DeckSplitPlan;
  /**
   * Cards whose `due` this tray moved. Separate from `changedNotes` because a
   * reposition-only tray changes zero notes and is not therefore a no-op; a
   * caller that gated Apply on `changedNotes` alone would disable it.
   */
  changedCards: number;
}

/**
 * Recipe 13's refusals mapped to the codes the surface renders. A table for the
 * reason the recipe-6 one below gives — a chain of ternaries mapping a refusal
 * to the wrong user-facing code is a bug no test can enumerate.
 */
export const SPLIT_REFUSAL_PROBLEMS: Readonly<Record<DeckSplitRefusalCode, TrayProblemCode>> = {
  'outside-parent': 'split-outside-parent',
  'filtered-card': 'split-filtered-card',
  'ambiguous-jlpt': 'split-ambiguous',
  'note-without-cards': 'split-no-cards',
};

/**
 * Recipe 6's refusals, in the order the surface should list them. A table
 * rather than a ternary chain: the boss audit of 2026-08-16 found exactly that
 * shape in `fill-reading` mapping a refusal to the wrong user-facing code with
 * no test able to see it, and a table is enumerable by a test.
 */
export const PRIORITIZE_PROBLEM_CODES: ReadonlyArray<[PrioritizeRefusal, TrayProblemCode]> = [
  ['known', 'prioritize-known'],
  ['no-rank', 'prioritize-no-rank'],
  ['no-word', 'prioritize-no-word'],
  ['not-new', 'prioritize-not-new'],
  ['no-cards', 'prioritize-no-cards'],
];

/** Recipe 10's refusals, in the order the surface should list them. Same reason. */
export const LEECH_RESCUE_PROBLEM_CODES:
ReadonlyArray<[LeechRescueRefusal, TrayProblemCode]> = [
  ['not-leech', 'leech-not-leech'],
  ['no-cards', 'leech-no-cards'],
  ['already-tagged', 'leech-already-tagged'],
  ['hint-field-absent', 'leech-hint-field-absent'],
  ['hint-source-empty', 'leech-hint-source-empty'],
  ['hint-source-too-short', 'leech-hint-source-too-short'],
  ['hint-occupied', 'leech-hint-occupied'],
];

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
  aiBatch: AiBatch | undefined,
  hasMasteryContext: boolean,
  hasPrioritizeContext: boolean,
  decks: readonly AnkiDraftDeck[],
  hasSplitContext: boolean,
): TrayProblem[] {
  const problems: TrayProblem[] = [];
  const enabled = actions.filter((a) => a.enabled);
  // `normalize-decks` is the one kind whose unit is not the note, so a tray
  // holding only that needs no selection. Demanding one would be the surface
  // lying about what the action reads: it renames the draft's decks either way.
  if (noteIds.length === 0 && enabled.some((a) => a.kind !== 'normalize-decks')) {
    problems.push({ code: 'empty-selection', severity: 'blocking', count: 0 });
  }
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
    } else if (action.kind === 'fill-reading') {
      // Same two refusals `enrich-dictionary` has, and for the same reasons: the
      // lookup arrives asynchronously from outside this module, and planning
      // without it would report every note as "no dictionary knows this word".
      if (action.toField === '') {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (!hasEnrichData) {
        problems.push({ code: 'no-enrich-data', severity: 'blocking', actionId: action.id, count: 1 });
      }
    } else if (action.kind === 'apply-ai-additions') {
      if (action.toField === '') {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (!aiBatch) {
        problems.push({ code: 'no-ai-review', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (aiBatch.id !== action.batchId) {
        // Regenerating replaces the batch. A tray still holding the previous
        // one would write sentences the user reviewed for different notes.
        problems.push({
          code: 'ai-batch-mismatch',
          severity: 'blocking',
          actionId: action.id,
          count: 1,
          detail: action.batchId,
        });
      } else {
        // The rule the whole module exists for: an alternative nobody accepted
        // or refused is not a value to write. Refuse the plan rather than
        // silently skipping those notes, so the user sees what is still theirs
        // to decide instead of an apply that quietly did less than it said.
        const summary = summarizeAiReview(aiBatch);
        if (summary.undecided > 0) {
          problems.push({
            code: 'ai-not-reviewed',
            severity: 'blocking',
            actionId: action.id,
            count: summary.undecided,
          });
        }
        if (summary.pending > 0) {
          problems.push({
            code: 'ai-not-reviewed',
            severity: 'blocking',
            actionId: action.id,
            count: summary.pending,
          });
        }
      }
    } else if (action.kind === 'set-mastery') {
      // Same refusal as `no-enrich-data`, and for the same reason: the term for
      // each note comes from a context built outside this module. Planning
      // without it would resolve every note to "no word" and report a selection
      // of vocabulary notes as unmappable, which is not true.
      if (!hasMasteryContext) {
        problems.push({ code: 'no-vocab-context', severity: 'blocking', actionId: action.id, count: 1 });
      }
    } else if (action.kind === 'prioritize-new') {
      // Same refusal for the same reason: without the context every note is
      // "no word" and the recipe would report a whole vocabulary deck as
      // unrankable. Refusing also protects guarantee 1 — a missing context
      // makes every note look unknown, which is precisely when a reposition
      // would trample the cards the user already knows.
      if (!hasPrioritizeContext) {
        problems.push({ code: 'no-vocab-context', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (!Number.isFinite(action.startPosition) || action.startPosition < 0) {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      }
    } else if (action.kind === 'split-deck') {
      // Checked here rather than from the returned plan, because a split that
      // cannot run has to stop the *tray* — guarantee 4. `deckSplitParameterProblem`
      // is the same function `planDeckSplit` calls, so the two cannot drift.
      const problem = deckSplitParameterProblem(decks, action);
      if (problem) {
        problems.push({
          code: 'split-refused',
          severity: 'blocking',
          actionId: action.id,
          count: 1,
          detail: problem,
        });
      } else if ((action.axis === 'frequency' || action.axis === 'mastery') && !hasSplitContext) {
        // Same refusal as `set-mastery`: without the context every note ranks
        // `null` and the split would file a whole deck under "no value on this
        // axis" while reporting that as the data's fault.
        problems.push({ code: 'no-vocab-context', severity: 'blocking', actionId: action.id, count: 1 });
      }
    } else if (action.kind === 'rescue-leeches') {
      const measures = new Set(action.measures);
      const writes = measures.has('tag') || measures.has('hint');
      if (measures.size === 0 || !Number.isFinite(action.threshold) || action.threshold < 1) {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (measures.has('tag') && action.rescueTag.trim() === '') {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (measures.has('hint') && (action.hintFromField === '' || action.hintToField === '')) {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
      } else if (measures.has('hint') && action.hintFromField === action.hintToField) {
        // A hint derived from the field it is written into is the field
        // truncating itself, which destroys the value it was drawn from.
        problems.push({
          code: 'same-field',
          severity: 'blocking',
          actionId: action.id,
          count: 1,
          detail: action.hintToField,
        });
      }
      // Refused here rather than at run time so the *only* measure being an
      // unsupported one disables Apply instead of applying nothing silently.
      if (measures.has('reschedule') && !writes) {
        problems.push({
          code: 'leech-reschedule-unsupported',
          severity: 'blocking',
          actionId: action.id,
          count: 1,
        });
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
    } else if (action.kind === 'normalize-tags' || action.kind === 'normalize-decks') {
      // Same rule `normalize-text` states: no op chosen is a mis-set form, not
      // "normalise with defaults". There is no default set of ops.
      if (action.ops.length === 0) {
        problems.push({ code: 'empty-parameter', severity: 'blocking', actionId: action.id, count: 1 });
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
    /**
     * The reviewed generation an `apply-ai-additions` action writes. Outside for
     * the same reason `enrich` is: it arrives asynchronously from a provider and
     * carries the user's whole review, neither of which belongs on an action.
     */
    ai?: AiBatch;
    /**
     * The words a `set-mastery` action maps and their currently stored levels.
     * Outside for the same reason `enrich` is: the terms come from the Browser's
     * `VocabContext` and the levels from the renderer's knowledge store, and
     * neither belongs on a serializable action.
     */
    mastery?: { vocab: VocabContext; levels: ReadonlyMap<string, number> };
    /**
     * The ranks and known-verdicts a `prioritize-new` action orders by. Outside
     * for the same reason `enrich` is: they come from the Browser's
     * `VocabContext`, which resolves a corpus lookup and the local knowledge
     * store, neither of which belongs on a serializable action.
     */
    prioritize?: { vocab: VocabContext };
    /**
     * What a `split-deck` action reads for its `frequency` and `mastery` axes.
     * Its own channel rather than a reuse of `mastery`/`prioritize`: a split
     * writes no knowledge and moves no queue position, and a tray holding a
     * split plus one of those would otherwise have to supply the wrong one.
     * `masterySegments` are deck names, so they are literals in the user's
     * language rather than translation keys — see `DEFAULT_MASTERY_SEGMENTS`.
     */
    split?: {
      vocab: VocabContext;
      levels?: ReadonlyMap<string, number>;
      masterySegments?: Readonly<Record<MasteryLevel, string>>;
    };
  },
): TrayPlan {
  const groupId = opts?.groupId ?? `tray-${journal.done.length + 1}`;
  const problems = blockingProblems(
    actions,
    noteIds,
    opts?.enrich !== undefined,
    opts?.ai,
    opts?.mastery !== undefined,
    opts?.prioritize !== undefined,
    draft.decks,
    opts?.split !== undefined,
  );
  if (problems.length > 0) {
    return {
      draft,
      journal,
      groupId,
      outcomes: [],
      changes: [],
      changedNotes: 0,
      changedCards: 0,
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
  const cards = [...draft.cards];
  let decks = [...draft.decks];
  const index = createDraftEditIndex(draft);
  const noteTypes = new Map(draft.noteTypes.map((nt) => [nt.id, nt]));
  const ops: AnkiDraftEditOp[] = [];
  let masteryPlan: MasteryPlan | undefined;
  let prioritizePlan: PrioritizePlan | undefined;
  let leechRescuePlan: LeechRescuePlan | undefined;
  let tagNormalizePlan: TagNormalizePlan | undefined;
  let deckNormalizePlan: DeckNormalizePlan | undefined;
  let deckSplitPlan: DeckSplitPlan | undefined;
  let changedCards = 0;

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

    if (action.kind === 'prioritize-new') {
      // Whole-selection like `set-mastery`, and for a stronger reason: the
      // positions are handed out in one global frequency order, so computing
      // them note by note would be arithmetic on a partial ordering.
      const ctx = opts?.prioritize;
      if (!ctx) continue; // unreachable — `blockingProblems` already refused.
      const selected: AnkiDraftNote[] = [];
      for (const noteId of noteIds) {
        const at = index.position.get(noteId);
        const note = at === undefined ? undefined : notes[at];
        if (note) selected.push(note);
      }
      const plan = planPrioritizeNew({
        notes: selected,
        cards,
        vocab: ctx.vocab,
        startPosition: action.startPosition,
      });
      // Later actions replace an earlier plan for the same reason mastery does:
      // two repositions in one tray are the user changing their mind, and only
      // the ops are cumulative.
      prioritizePlan = plan;
      const movedNotes = new Set<string>();
      for (const move of plan.moves) {
        if (move.after === move.before) continue;
        const cardAt = index.cardPosition.get(move.cardId);
        if (cardAt === undefined) continue;
        cards[cardAt] = { ...cards[cardAt], due: move.after };
        ops.push({
          kind: 'card-due',
          noteId: move.noteId,
          cardId: move.cardId,
          before: move.before,
          after: move.after,
          group: groupId,
        });
        movedNotes.add(move.noteId);
        changedCards += 1;
      }
      for (const [refusal, code] of PRIORITIZE_PROBLEM_CODES) {
        for (const skip of plan.skips) {
          if (skip.refusal !== refusal) continue;
          problems.push({
            code,
            // "You already know it" is the recipe working, not a warning.
            severity: refusal === 'known' ? 'info' : 'warning',
            actionId: action.id,
            count: 1,
            detail: skip.term ?? skip.noteId,
          });
        }
      }
      outcomes.push({
        actionId: action.id,
        kind: action.kind,
        matched: noteIds.length,
        changed: movedNotes.size,
        skipped: noteIds.length - movedNotes.size,
      });
      continue;
    }

    if (action.kind === 'rescue-leeches') {
      // Whole-selection so the counts ("14 leeches, 9 rescued") come from one
      // pass. Per-note it could still be computed, but the leech/tagged-only
      // totals a surface reports would then have to be summed by the caller.
      const selected: AnkiDraftNote[] = [];
      for (const noteId of noteIds) {
        const at = index.position.get(noteId);
        const note = at === undefined ? undefined : notes[at];
        if (note) selected.push(note);
      }
      const plan = planLeechRescue({
        notes: selected,
        cards,
        noteTypes: draft.noteTypes,
        measures: action.measures,
        threshold: action.threshold,
        includeTagged: action.includeTagged,
        rescueTag: action.rescueTag,
        hintFromField: action.hintFromField,
        hintToField: action.hintToField,
        ...(action.hintReveal === undefined ? {} : { hintReveal: action.hintReveal }),
      });
      leechRescuePlan = plan;
      const rescued = new Set<string>();
      for (const target of plan.targets) {
        const at = index.position.get(target.noteId);
        if (at === undefined) continue;
        if (target.hint && applyWrite(at, target.noteId, target.hint.toOrd, target.hint.after)) {
          rescued.add(target.noteId);
        }
        if (!target.tag) continue;
        // Re-read after the write: `applyWrite` replaced the array slot, and
        // tagging the pre-write object would drop the hint that just landed.
        const current = notes[at];
        const before = current.tags;
        const after = normalizeTags([...before, target.tag]);
        if (after.length === before.length) continue;
        notes[at] = { ...current, tags: after, marked: after.includes(MARKED_TAG) };
        ops.push({ kind: 'tags', noteId: target.noteId, before, after, group: groupId });
        const change = changeFor(target.noteId);
        change.tags = { before: change.tags?.before ?? before, after };
        rescued.add(target.noteId);
      }
      for (const [refusal, code] of LEECH_RESCUE_PROBLEM_CODES) {
        for (const skip of plan.skips) {
          if (skip.refusal !== refusal) continue;
          problems.push({
            code,
            // "Not a leech" is the filter working, not a fault in the note.
            severity: refusal === 'not-leech' ? 'info' : 'warning',
            actionId: action.id,
            count: 1,
            detail: skip.label,
          });
        }
      }
      if (plan.rescheduleRefused) {
        // Not blocking here: `blockingProblems` already refused a reschedule-only
        // run, so reaching this line means real measures ran alongside it and the
        // user must still be told the scheduling half did not happen.
        problems.push({
          code: 'leech-reschedule-unsupported',
          severity: 'warning',
          actionId: action.id,
          count: 1,
        });
      }
      outcomes.push({
        actionId: action.id,
        kind: action.kind,
        matched: noteIds.length,
        changed: rescued.size,
        skipped: noteIds.length - rescued.size,
      });
      continue;
    }

    if (action.kind === 'normalize-tags') {
      // Whole-selection so the case census is built once, and — the point of
      // rule 2 in `ankiTagNormalize.ts` — built over the *whole draft* while the
      // write stays inside the selection. Per-note it would be rebuilt 3,000
      // times and would still have to read every note anyway.
      const selected: Array<{ id: string; tags: readonly string[] }> = [];
      for (const noteId of noteIds) {
        const at = index.position.get(noteId);
        const note = at === undefined ? undefined : notes[at];
        if (note) selected.push({ id: note.id, tags: note.tags });
      }
      const plan = planTagNormalize({
        notes: selected,
        // `notes` and not `draft.notes`: earlier actions in the same tray may
        // already have rewritten tags, and censusing the input draft would
        // canonicalise against spellings that no longer exist.
        censusTags: notes.map((n) => n.tags),
        ops: action.ops,
      });
      tagNormalizePlan = plan;
      let written = 0;
      for (const change of plan.changes) {
        const at = index.position.get(change.noteId);
        if (at === undefined) continue;
        const current = notes[at];
        const before = current.tags;
        // `marked` is a tag in the data and a flag in the model — same rule the
        // add/remove branch enforces, and it matters here because `unify-case`
        // can rewrite the casing of `marked` itself.
        notes[at] = { ...current, tags: change.after, marked: change.after.includes(MARKED_TAG) };
        ops.push({ kind: 'tags', noteId: change.noteId, before, after: change.after, group: groupId });
        const noteChange = changeFor(change.noteId);
        noteChange.tags = { before: noteChange.tags?.before ?? before, after: change.after };
        written += 1;
      }
      if (plan.renamedTags > 0) {
        problems.push({
          code: 'tag-normalize-renamed',
          severity: 'info',
          actionId: action.id,
          count: plan.renamedTags,
          // The first rename, so the user can see the shape of the change
          // without the surface having to render every pair.
          detail: `${plan.changes[0]?.renamed[0]?.from ?? ''} -> ${plan.changes[0]?.renamed[0]?.to ?? ''}`,
        });
      }
      if (plan.removedTags > 0) {
        problems.push({
          code: 'tag-normalize-removed',
          severity: 'warning',
          actionId: action.id,
          count: plan.removedTags,
        });
      }
      if (written === 0) {
        problems.push({
          code: 'tag-normalize-clean',
          severity: 'info',
          actionId: action.id,
          count: plan.unchanged,
        });
      }
      outcomes.push({
        actionId: action.id,
        kind: action.kind,
        matched: noteIds.length,
        changed: written,
        skipped: noteIds.length - written,
      });
      continue;
    }

    if (action.kind === 'normalize-decks') {
      // Whole-draft, not selection-scoped: see the action's own comment. Nothing
      // here reads `noteIds`, and the outcome counts decks for the same reason.
      const plan = planDeckNormalize({ decks, ops: action.ops });
      deckNormalizePlan = plan;
      const renamedIds = new Set<string>();
      for (const rename of plan.renames) {
        const at = decks.findIndex((d) => d.id === rename.deckId);
        if (at === -1) continue;
        decks[at] = { ...decks[at], name: rename.to };
        renamedIds.add(rename.deckId);
        ops.push({
          kind: 'deck-name',
          deckId: rename.deckId,
          before: rename.from,
          after: rename.to,
          group: groupId,
        });
      }
      // Once for the batch, not per rename: one rename can change another deck's
      // parentage, so a per-rename relink would be both quadratic and wrong.
      if (renamedIds.size > 0) decks = relinkDeckParents(decks);
      if (plan.renames.length > 0) {
        problems.push({
          code: 'deck-normalize-renamed',
          severity: 'info',
          actionId: action.id,
          count: plan.renames.length,
          detail: `${plan.renames[0].from} -> ${plan.renames[0].to}`,
        });
      }
      for (const collision of plan.collisions) {
        problems.push({
          code: 'deck-normalize-merge-refused',
          severity: 'warning',
          actionId: action.id,
          count: 1,
          detail: `${collision.from} -> ${collision.to}`,
        });
      }
      if (plan.filteredSkipped > 0) {
        problems.push({
          code: 'deck-normalize-filtered',
          severity: 'info',
          actionId: action.id,
          count: plan.filteredSkipped,
        });
      }
      if (plan.renames.length === 0 && plan.collisions.length === 0) {
        problems.push({
          code: 'deck-normalize-clean',
          severity: 'info',
          actionId: action.id,
          count: plan.considered,
        });
      }
      outcomes.push({
        actionId: action.id,
        kind: action.kind,
        matched: plan.considered,
        changed: plan.renames.length,
        skipped: plan.considered - plan.renames.length,
      });
      continue;
    }

    if (action.kind === 'split-deck') {
      // Reads the *working* notes and decks, not the draft's: an earlier
      // `add-tags` action that wrote `JLPT::N5` has to be visible to the split,
      // which is guarantee 2 and the only reason order is worth having.
      const ctx = opts?.split;
      const rankByNote = new Map<string, number | null>();
      const masteryByNote = new Map<string, MasteryLevel | null>();
      for (const noteId of noteIds) {
        const facts = ctx?.vocab.byNote.get(noteId);
        rankByNote.set(noteId, facts?.rank ?? null);
        const stored = facts?.term ? ctx?.levels?.get(facts.term) : undefined;
        masteryByNote.set(noteId, isMasteryLevel(stored) ? stored : null);
      }
      const plan = planDeckSplit({
        noteIds,
        notes,
        cards,
        decks,
        noteTypes: draft.noteTypes,
        axis: action.axis,
        parentDeckId: action.parentDeckId,
        unmatched: action.unmatched,
        unmatchedSegment: action.unmatchedSegment,
        bands: action.bands,
        rankByNote,
        masteryByNote,
        masterySegments: ctx?.masterySegments,
      });
      deckSplitPlan = plan;
      if (plan.problem) continue; // unreachable — `blockingProblems` already refused.

      const created = plan.targets.filter((t) => t.created);
      if (created.length > 0) {
        for (const target of created) {
          decks.push({
            id: target.deckId,
            name: target.name,
            path: [],
            filtered: false,
            // The parent's options preset, so a new subdeck studies the way the
            // deck it came out of does. Anki's own "create subdeck" inherits
            // nothing, but a split that silently reset every new card limit to
            // the default preset would change how much the user sees per day.
            configId: decks.find((d) => d.id === plan.parentDeckId)?.configId,
          });
        }
        // Once for the batch: `path` and `parentId` above are placeholders, and
        // relinking is what actually nests the new decks under the parent.
        decks = relinkDeckParents(decks);
      }
      for (const move of plan.moves) {
        const at = index.cardPosition.get(move.cardId);
        if (at === undefined) continue;
        const card = cards[at];
        if (!card) continue;
        cards[at] = { ...card, deckId: move.toDeckId };
        ops.push({
          kind: 'card-deck',
          noteId: move.noteId,
          cardId: move.cardId,
          before: move.fromDeckId,
          after: move.toDeckId,
          group: groupId,
        });
      }
      changedCards += plan.moves.length;

      if (plan.moves.length > 0) {
        problems.push({
          code: 'split-moved',
          severity: 'info',
          actionId: action.id,
          count: plan.moves.length,
          detail: plan.targets[0]?.name,
        });
      } else {
        problems.push({
          code: 'split-clean',
          severity: 'info',
          actionId: action.id,
          count: plan.considered,
        });
      }
      if (plan.unmatchedNoteIds.length > 0) {
        problems.push({
          code: 'split-unmatched',
          severity: plan.unmatched === 'leave' ? 'info' : 'warning',
          actionId: action.id,
          count: plan.unmatchedNoteIds.length,
        });
      }
      for (const refusal of plan.refusals) {
        problems.push({
          code: SPLIT_REFUSAL_PROBLEMS[refusal.code],
          severity: 'warning',
          actionId: action.id,
          count: refusal.cardIds.length || refusal.noteIds.length,
        });
      }
      outcomes.push({
        actionId: action.id,
        kind: action.kind,
        matched: plan.considered,
        // Notes, not cards: every other outcome row counts notes, and a split
        // that reported 1,200 next to a 600-note selection would read as a bug.
        changed: plan.targets.reduce((sum, t) => sum + t.noteIds.length, 0),
        skipped:
          plan.considered - plan.targets.reduce((sum, t) => sum + t.noteIds.length, 0),
      });
      continue;
    }

    if (action.kind === 'set-mastery') {
      // Whole-selection, not per-note: the unit is the word, and the same lemma
      // on four notes is one entry. Running this inside the per-note loop would
      // count it four times and write it four times.
      const ctx = opts?.mastery;
      if (!ctx) continue; // unreachable — `blockingProblems` already refused.
      const termByNote = new Map<string, string | null>();
      for (const noteId of noteIds) termByNote.set(noteId, ctx.vocab.byNote.get(noteId)?.term ?? null);
      const plan = planMasteryMapping({
        noteIds,
        termByNote,
        levels: ctx.levels,
        target: action.level,
      });
      // Later actions in the same tray overwrite an earlier mapping's plan
      // rather than merging: two mastery actions in one tray are the user
      // changing their mind, and the last one is what Apply must write.
      masteryPlan = plan;
      if (plan.notesWithoutWord.length > 0) {
        problems.push({
          code: 'mastery-no-word',
          severity: 'warning',
          actionId: action.id,
          count: plan.notesWithoutWord.length,
        });
      }
      if (plan.notesWithPhrase.length > 0) {
        problems.push({
          code: 'mastery-phrase',
          severity: 'warning',
          actionId: action.id,
          count: plan.notesWithPhrase.length,
        });
      }
      // Reported whenever the action runs, including when it moves nothing, so
      // the scheduling consequence is never a thing the user has to infer from
      // its absence. The detail is the numeric rung, never a translated label.
      problems.push({
        code: 'mastery-local-only',
        severity: 'info',
        actionId: action.id,
        count: plan.changes.length,
        detail: String(plan.target),
      });
      outcomes.push({
        actionId: action.id,
        kind: action.kind,
        matched: noteIds.length,
        changed: plan.notesCovered,
        skipped: noteIds.length - plan.notesCovered,
      });
      continue;
    }

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
      } else if (action.kind === 'fill-reading') {
        const enrich = opts?.enrich;
        // Unreachable: `blockingProblems` already refused. Kept for the same
        // reason the enrichment branch keeps its guard.
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
            code: 'reading-no-word',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail: noteId,
          });
          continue;
        }
        // "Missing" is tested before the lookup is consulted: a note that already
        // has a reading is not a candidate at all, and reporting it as one would
        // bury the notes the user can actually act on.
        const toRaw = start.fields.find((f) => f.ord === toOrd)?.raw ?? '';
        if (toRaw.trim() !== '') {
          problems.push({
            code: 'reading-occupied',
            severity: 'info',
            actionId: action.id,
            count: 1,
            detail: action.toField,
          });
          continue;
        }
        const proposal = proposeReading(term, enrich.lookup.get(term), action.form);
        if ('refused' in proposal) {
          const code =
            proposal.refused === 'no-kanji'
              ? 'reading-no-kanji'
              : proposal.refused === 'no-kana-reading'
                ? 'reading-not-kana'
                : 'reading-no-entry';
          problems.push({
            code,
            severity: code === 'reading-no-kanji' ? 'info' : 'warning',
            actionId: action.id,
            count: 1,
            detail: term,
          });
          continue;
        }
        if (!readingMeetsThreshold(proposal.confidence, action.threshold)) {
          // Ambiguity is its own code, not a threshold miss: no setting admits
          // it, and telling the user to lower the threshold would be a lie.
          problems.push({
            code: proposal.confidence === 'ambiguous' ? 'reading-ambiguous' : 'reading-below-threshold',
            severity: 'warning',
            actionId: action.id,
            count: 1,
            detail:
              proposal.confidence === 'ambiguous'
                ? `${term}: ${proposal.candidates.map((c) => c.reading).join(' / ')}`
                : term,
          });
          continue;
        }
        const written = wrapEnrichProvenance(
          proposal.value,
          proposal.candidates[0].sources,
          action.provenance,
        );
        if (applyWrite(at, noteId, toOrd, written)) touched = true;
      } else if (action.kind === 'apply-ai-additions') {
        const batch = opts?.ai;
        // Unreachable: `blockingProblems` refused a missing or mismatched batch.
        if (!batch) continue;
        const approved = approvedAiAdditions(batch).find((a) => a.noteId === noteId);
        // Not every selected note is in the batch, and a note whose variants
        // were all rejected writes nothing. Both are silent here on purpose —
        // they are counted once for the whole action below, not per note.
        if (!approved) continue;
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
        // Unconditional, unlike dictionary provenance: see `wrapAiProvenance`.
        const written = wrapAiProvenance(approved.text, batch.provider, batch.model);
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

    if (action.kind === 'apply-ai-additions' && opts?.ai) {
      // Once per action, not per note: these are properties of the generation
      // run, and the counts are the honest account of what the batch did *not*
      // produce. Reported even though the plan proceeds — an apply that wrote
      // 40 of 50 notes must say so rather than look complete.
      const summary = summarizeAiReview(opts.ai);
      if (summary.failed > 0) {
        problems.push({
          code: 'ai-generation-failed',
          severity: 'warning',
          actionId: action.id,
          count: summary.failed,
        });
      }
      if (summary.cancelled > 0) {
        problems.push({
          code: 'ai-cancelled',
          severity: 'warning',
          actionId: action.id,
          count: summary.cancelled,
        });
      }
      if (summary.allRejected > 0) {
        problems.push({
          code: 'ai-all-rejected',
          severity: 'info',
          actionId: action.id,
          count: summary.allRejected,
        });
      }
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
    draft: ops.length > 0 ? { ...draft, notes, cards, decks } : draft,
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
    changedCards,
    problems,
    blocked: false,
    mastery: masteryPlan,
    prioritize: prioritizePlan,
    leechRescue: leechRescuePlan,
    tagNormalize: tagNormalizePlan,
    deckNormalize: deckNormalizePlan,
    deckSplit: deckSplitPlan,
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
