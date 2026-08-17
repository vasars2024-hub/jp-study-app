/**
 * Reverse and optional-reverse card designs — the second half of acceptance
 * gate 13 in `ANKI_DECK_WORKBENCH_PLAN.md` ("customize Browser columns
 * separately from note fields, **create a reverse/optional-reverse card
 * design**, and prove that the representative preview catches … sibling …
 * rendering failures before Apply").
 *
 * A card design is not a note edit, which is why it does not live in the change
 * tray: the tray's ops are `field` and `tags` keyed by note, while this adds a
 * *template* to a note type and thereby brings whole cards into existence for
 * every note of that type at once. The two are applied and undone separately on
 * purpose — a user who reverts a batch of tag edits must not lose a card design
 * they made afterwards.
 *
 * Anki's two shapes, reproduced exactly:
 *
 * - **reverse** — `Basic (and reversed card)`. A second template whose question
 *   is the answer field. Every note of the type generates the extra card.
 * - **optional-reverse** — `Basic (optional reversed card)`. The same template
 *   wrapped in `{{#Flag}}…{{/Flag}}`, so the card exists only for notes whose
 *   flag field carries a value. Anki generates no card when a question renders
 *   empty, which is what makes the conditional a switch rather than decoration.
 *
 * Counting is a **field test, not a render**: a card generates iff its question
 * field (and, for an optional design, its flag field) is non-empty. That is what
 * Anki does for these two templates, and it is O(1) per note, so the count over
 * the 100,000-note fixture stays honest without the whole-deck HTML render that
 * gate 9 forbids on the event loop. The full render still runs for the handful
 * of sample cards the preview shows.
 */
import type {
  AnkiDraft,
  AnkiDraftCard,
  AnkiDraftFieldDef,
  AnkiDraftNote,
  AnkiDraftNoteType,
  AnkiDraftTemplate,
} from './ankiDraft';
import type { AnkiDraftEditOp } from './ankiDraftEdit';
import { fieldIsEmpty } from './ankiTemplateRender';

export type CardDesignKind = 'reverse' | 'optional-reverse';

/** The field Anki's own optional-reverse note type ships with. */
export const DEFAULT_REVERSE_FLAG_FIELD = 'Add Reverse';

/** How many generating notes the plan renders for the preview. */
export const CARD_DESIGN_SAMPLE_NOTES = 3;

export interface CardDesignRequest {
  noteTypeId: string;
  kind: CardDesignKind;
  /** Field ord the new card asks with — the *back* of the original direction. */
  questionFieldOrd: number;
  /** Field ord the new card answers with. */
  answerFieldOrd: number;
  /** Template name. Defaults to `Card N` for the next free ordinal. */
  templateName?: string;
  /**
   * `optional-reverse` only: the field whose non-empty value switches the card
   * on. Defaults to `Add Reverse`, added to the note type when it is absent.
   */
  flagFieldName?: string;
}

export type CardDesignProblemCode =
  /** Cloze note types generate cards from `{{c1::…}}` markers; a template cannot add one. */
  | 'cloze-note-type'
  /** The request names a note type the draft does not hold. */
  | 'unknown-note-type'
  /** `questionFieldOrd` or `answerFieldOrd` is not a field of this note type. */
  | 'unknown-field'
  /** The card would ask with the field it answers with. */
  | 'same-field-both-sides'
  /** A template with this name already exists on the note type. */
  | 'duplicate-template-name'
  /** A template already asks this question; the design would duplicate every card. */
  | 'design-already-present'
  /** The flag field would be added, so no note carries it yet. */
  | 'flag-field-added'
  /** Optional design where no note has the flag set: it generates zero cards. */
  | 'no-notes-flagged'
  /** Notes skipped because the question field is empty — Anki generates no card. */
  | 'empty-question-field';

export interface CardDesignProblem {
  code: CardDesignProblemCode;
  /** The offending name — a field, a template. Absent when not applicable. */
  detail?: string;
  /** How many notes this problem describes, when it is a count. */
  count?: number;
}

/** Problems that block Apply. Everything else is a consequence worth stating. */
export const BLOCKING_CARD_DESIGN_PROBLEMS: ReadonlySet<CardDesignProblemCode> = new Set([
  'cloze-note-type',
  'unknown-note-type',
  'unknown-field',
  'same-field-both-sides',
  'duplicate-template-name',
  'design-already-present',
  'no-notes-flagged',
]);

export interface CardDesignPlan {
  status: 'ok' | 'blocked';
  request: CardDesignRequest;
  problems: CardDesignProblem[];
  /** The template that would be added. `null` when the plan is blocked. */
  template: AnkiDraftTemplate | null;
  /** The flag field this design would add to the note type, when it adds one. */
  addedField: AnkiDraftFieldDef | null;
  /** Notes of this note type, in the whole draft. */
  notesOfType: number;
  /** Cards this design generates right now. */
  cardsAdded: number;
  /** Notes that generate no card because the flag field is empty. */
  notesWithoutFlag: number;
  /** Notes that generate no card because the question field is empty. */
  notesWithEmptyQuestion: number;
  /** Ids of the notes that generate a card, capped at `CARD_DESIGN_SAMPLE_NOTES`. */
  sampleNoteIds: string[];
}

// ----- planning ----------------------------------------------------------------

function fieldByOrd(noteType: AnkiDraftNoteType, ord: number): AnkiDraftFieldDef | undefined {
  return noteType.fields.find((f) => f.ord === ord);
}

function nextTemplateOrd(noteType: AnkiDraftNoteType): number {
  return noteType.templates.reduce((max, tpl) => Math.max(max, tpl.ord), -1) + 1;
}

/** The raw value of a note's field by name, or `''` when the note lacks it. */
function noteFieldValue(note: AnkiDraftNote, name: string): string {
  return note.fields.find((f) => f.name === name)?.raw ?? '';
}

/**
 * The formats Anki writes for these two designs, kept byte-comparable to its own
 * so a package this workbench exports reimports as the note type the user asked
 * for rather than a lookalike.
 */
export function cardDesignFormats(
  kind: CardDesignKind,
  questionField: string,
  answerField: string,
  flagField: string,
): { qfmt: string; afmt: string } {
  const core = `{{${questionField}}}`;
  const qfmt =
    kind === 'optional-reverse' ? `{{#${flagField}}}${core}{{/${flagField}}}` : core;
  return { qfmt, afmt: `{{FrontSide}}\n\n<hr id=answer>\n\n{{${answerField}}}` };
}

function blocked(
  request: CardDesignRequest,
  problems: CardDesignProblem[],
): CardDesignPlan {
  return {
    status: 'blocked',
    request,
    problems,
    template: null,
    addedField: null,
    notesOfType: 0,
    cardsAdded: 0,
    notesWithoutFlag: 0,
    notesWithEmptyQuestion: 0,
    sampleNoteIds: [],
  };
}

export function planCardDesign(draft: AnkiDraft, request: CardDesignRequest): CardDesignPlan {
  const noteType = draft.noteTypes.find((nt) => nt.id === request.noteTypeId);
  if (!noteType) return blocked(request, [{ code: 'unknown-note-type', detail: request.noteTypeId }]);
  if (noteType.kind === 'cloze') {
    return blocked(request, [{ code: 'cloze-note-type', detail: noteType.name }]);
  }

  const problems: CardDesignProblem[] = [];
  const questionField = fieldByOrd(noteType, request.questionFieldOrd);
  const answerField = fieldByOrd(noteType, request.answerFieldOrd);
  if (!questionField) problems.push({ code: 'unknown-field', detail: String(request.questionFieldOrd) });
  if (!answerField) problems.push({ code: 'unknown-field', detail: String(request.answerFieldOrd) });
  if (!questionField || !answerField) return blocked(request, problems);
  if (questionField.ord === answerField.ord) {
    return blocked(request, [{ code: 'same-field-both-sides', detail: questionField.name }]);
  }

  const ord = nextTemplateOrd(noteType);
  const name = request.templateName?.trim() || `Card ${ord + 1}`;
  // Case-insensitively, because Anki stores template names under its own
  // `unicase` collation with a UNIQUE index over them: `card 2` and `Card 2` are
  // the same name to Anki, and letting the plan through means the user hears
  // about it from the exporter (`template-name-taken`) rather than before Apply.
  if (noteType.templates.some((tpl) => tpl.name.toLowerCase() === name.toLowerCase())) {
    return blocked(request, [{ code: 'duplicate-template-name', detail: name }]);
  }

  const flagFieldName =
    request.kind === 'optional-reverse'
      ? request.flagFieldName?.trim() || DEFAULT_REVERSE_FLAG_FIELD
      : '';
  const existingFlagField =
    flagFieldName === '' ? undefined : noteType.fields.find((f) => f.name === flagFieldName);
  const addedField: AnkiDraftFieldDef | null =
    request.kind === 'optional-reverse' && !existingFlagField
      ? {
          ord: noteType.fields.reduce((max, f) => Math.max(max, f.ord), -1) + 1,
          name: flagFieldName,
          sticky: false,
          rtl: false,
        }
      : null;

  const { qfmt, afmt } = cardDesignFormats(
    request.kind,
    questionField.name,
    answerField.name,
    flagFieldName,
  );
  if (noteType.templates.some((tpl) => tpl.qfmt.trim() === qfmt.trim())) {
    return blocked(request, [{ code: 'design-already-present', detail: qfmt }]);
  }

  const notes = draft.notes.filter((n) => n.noteTypeId === noteType.id);
  let cardsAdded = 0;
  let notesWithoutFlag = 0;
  let notesWithEmptyQuestion = 0;
  const sampleNoteIds: string[] = [];
  for (const note of notes) {
    // A field test, not a render — see the module header. The order matters:
    // an unflagged note is *not* a note with an empty question, and counting it
    // as one would tell the user their deck is broken when it is not.
    if (request.kind === 'optional-reverse' && fieldIsEmpty(noteFieldValue(note, flagFieldName))) {
      notesWithoutFlag += 1;
      continue;
    }
    if (fieldIsEmpty(noteFieldValue(note, questionField.name))) {
      notesWithEmptyQuestion += 1;
      continue;
    }
    cardsAdded += 1;
    if (sampleNoteIds.length < CARD_DESIGN_SAMPLE_NOTES) sampleNoteIds.push(note.id);
  }

  if (addedField) {
    problems.push({ code: 'flag-field-added', detail: flagFieldName, count: notes.length });
  }
  // A design that *adds* the flag field generates nothing yet by definition, and
  // that is the normal way to set one up — the cards appear as the user fills the
  // field. But a flag field that already exists and that no note carries is a
  // design the user believes is working and that will never produce a card, so
  // only that case blocks.
  if (request.kind === 'optional-reverse' && cardsAdded === 0 && !addedField) {
    problems.push({ code: 'no-notes-flagged', detail: flagFieldName, count: notesWithoutFlag });
  }
  if (notesWithEmptyQuestion > 0) {
    problems.push({
      code: 'empty-question-field',
      detail: questionField.name,
      count: notesWithEmptyQuestion,
    });
  }

  const status = problems.some((p) => BLOCKING_CARD_DESIGN_PROBLEMS.has(p.code))
    ? 'blocked'
    : 'ok';

  return {
    status,
    request,
    problems,
    template: { ord, name, qfmt, afmt, bqfmt: '', bafmt: '' },
    addedField,
    notesOfType: notes.length,
    cardsAdded,
    notesWithoutFlag,
    notesWithEmptyQuestion,
    sampleNoteIds,
  };
}

// ----- applying and reversing ---------------------------------------------------

/**
 * What one applied design changed, kept so the reverse transition removes
 * exactly what was added and nothing a later edit introduced. Recomputing the
 * inverse would read the draft *after* the writes it must undo.
 */
export interface AppliedCardDesign {
  noteTypeId: string;
  templateOrd: number;
  templateName: string;
  /** Field name added to the note type, when the design added one. */
  addedFieldName: string | null;
  /** Ids of the cards this design created, in creation order. */
  cardIds: string[];
}

/** The `template-add` member of the op union, named so callers need not narrow. */
export type CardDesignOp = Extract<AnkiDraftEditOp, { kind: 'template-add' }>;

export interface CardDesignApplyResult {
  draft: AnkiDraft;
  applied: AppliedCardDesign;
  /**
   * The journal op this design *is*. Returned rather than appended here, because
   * this module owns no journal — the workbench does — but without it the design
   * reaches no destination at all: `buildApkgExportChanges` folds `journal.done`
   * and nothing else, so before this existed a designed reverse card was a
   * preview that could never be exported (gate 14's finding, 3,180 unexportable
   * cards on a real deck).
   */
  op: CardDesignOp;
}

/** A card id no other card in the draft holds. */
function freeCardId(taken: Set<string>, noteId: string, ord: number): string {
  const base = `${noteId}-design${ord}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function applyCardDesign(draft: AnkiDraft, plan: CardDesignPlan): CardDesignApplyResult {
  if (plan.status !== 'ok' || !plan.template) {
    throw new Error(`applyCardDesign: refusing a ${plan.status} plan`);
  }
  const template = plan.template;
  const noteTypes = draft.noteTypes.map((nt) =>
    nt.id === plan.request.noteTypeId
      ? {
          ...nt,
          fields: plan.addedField ? [...nt.fields, plan.addedField] : nt.fields,
          templates: [...nt.templates, template],
        }
      : nt,
  );

  // A note that gained a field gains an empty value for it, or every later read
  // of that note is one field short of its own note type.
  const addedField = plan.addedField;
  const taken = new Set(draft.cards.map((c) => c.id));
  const newCards: AnkiDraftCard[] = [];
  const cardIds: string[] = [];
  const noteCardIds = new Map<string, string>();

  const questionFieldName =
    noteTypes
      .find((nt) => nt.id === plan.request.noteTypeId)
      ?.fields.find((f) => f.ord === plan.request.questionFieldOrd)?.name ?? '';
  const flagFieldName = addedField?.name ?? plan.request.flagFieldName?.trim() ?? DEFAULT_REVERSE_FLAG_FIELD;

  const notes = draft.notes.map((note) => {
    if (note.noteTypeId !== plan.request.noteTypeId) return note;
    const fields = addedField
      ? [...note.fields, { ord: addedField.ord, name: addedField.name, raw: '', normalized: '' }]
      : note.fields;
    const flagged =
      plan.request.kind !== 'optional-reverse' ||
      !fieldIsEmpty(noteFieldValue(note, flagFieldName));
    const hasQuestion = !fieldIsEmpty(noteFieldValue(note, questionFieldName));
    if (!flagged || !hasQuestion) return { ...note, fields };

    const id = freeCardId(taken, note.id, template.ord);
    taken.add(id);
    cardIds.push(id);
    noteCardIds.set(note.id, id);
    const sibling = draft.cards.find((c) => c.noteId === note.id);
    newCards.push({
      id,
      noteId: note.id,
      // The new card lands in the deck the note's existing cards are in; a
      // design must not scatter a deck's siblings across two decks.
      deckId: template.deckOverrideId ?? sibling?.deckId ?? note.targetDeckId ?? '',
      ord: template.ord,
      type: 'new',
      queue: 'new',
      due: 0,
      interval: 0,
      easeFactor: 0,
      reps: 0,
      lapses: 0,
      left: 0,
      modifiedAtSec: note.modifiedAtSec,
      flag: 'none',
    });
    return { ...note, fields, cardIds: [...note.cardIds, id] };
  });

  return {
    draft: {
      ...draft,
      noteTypes,
      notes,
      cards: [...draft.cards, ...newCards],
      counts: { ...draft.counts, cards: draft.counts.cards + newCards.length },
    },
    applied: {
      noteTypeId: plan.request.noteTypeId,
      templateOrd: template.ord,
      templateName: template.name,
      addedFieldName: addedField?.name ?? null,
      cardIds,
    },
    op: {
      kind: 'template-add',
      noteTypeId: plan.request.noteTypeId,
      template,
      addedField: addedField ?? null,
      // The rows verbatim, exactly as `template-remove` carries the rows it
      // deleted: the inverse must take back what THIS design made and not what
      // a later edit added at the same ord.
      cards: newCards,
    },
  };
}

/**
 * The reverse transition. It removes the template, the cards the design created
 * and the field it added — by the ids recorded at apply time, so a card the user
 * later moved or a field a later design added survives.
 */
export function removeCardDesign(draft: AnkiDraft, applied: AppliedCardDesign): AnkiDraft {
  const removedCards = new Set(applied.cardIds);
  const noteTypes = draft.noteTypes.map((nt) => {
    if (nt.id !== applied.noteTypeId) return nt;
    return {
      ...nt,
      fields: applied.addedFieldName
        ? nt.fields.filter((f) => f.name !== applied.addedFieldName)
        : nt.fields,
      templates: nt.templates.filter((tpl) => tpl.ord !== applied.templateOrd),
    };
  });
  const notes = draft.notes.map((note) => {
    if (note.noteTypeId !== applied.noteTypeId) return note;
    const cardIds = note.cardIds.filter((id) => !removedCards.has(id));
    const fields = applied.addedFieldName
      ? note.fields.filter((f) => f.name !== applied.addedFieldName)
      : note.fields;
    if (cardIds.length === note.cardIds.length && fields.length === note.fields.length) return note;
    return { ...note, cardIds, fields };
  });
  const cards = draft.cards.filter((c) => !removedCards.has(c.id));
  return {
    ...draft,
    noteTypes,
    notes,
    cards,
    counts: { ...draft.counts, cards: draft.counts.cards - (draft.cards.length - cards.length) },
  };
}
