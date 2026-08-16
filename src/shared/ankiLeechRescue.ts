// Rescuing leeches — ANKI_DECK_WORKBENCH_PLAN.md Phase 4, recipe 10 ("rescue
// leeches by adding hints, sentences, or a slower scheduling preset").
//
// A leech is a card the user has forgotten so often that re-reviewing it is
// costing more than it returns. Anki's own definition is a lapse count at or
// above the deck's leech threshold, and its default leech action is to tag the
// note `leech` and suspend the card. Both facts are already in the draft, so
// this recipe never guesses which cards are leeches — it reads them.
//
// Three measures are named in the catalogue and this module is honest about
// which of them the workbench can actually make:
//
//  1. **`tag`** — write a rescue tag onto the note. A `tags` op, undoable, and
//     the thing that makes the batch findable again tomorrow.
//  2. **`hint`** — write a *partial reveal* of an existing field into a hint
//     field. The text is derived from the note's own content and nothing is
//     invented: a hint that made up a mnemonic would be a language model's
//     output presented as the user's deck. The reveal is capped short of the
//     whole value — a "hint" that shows the entire answer is the answer.
//  3. **`reschedule`** — a slower scheduling preset. **Not supported**, and
//     refused by name rather than quietly dropped. The edit journal carries
//     `field`, `tags` and `card-due` and nothing else; an ease or interval
//     change would have to reconstruct `left`, `originalDue` and a review
//     history the draft never held, so it could not be undone. The plan's own
//     rule for this case is to explain it and keep Apply disabled.
//
// The hint deliberately never overwrites. A leech is precisely the card a user
// has already hand-annotated, and a batch that could replace that annotation
// with a machine prefix is the one destructive thing this recipe must not do.

import type { AnkiDraftCard, AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import { stripFieldHtml } from './apkgParse';

/** Which rescue measures a run applies. Order here is not the order they run. */
export type LeechRescueMeasure = 'tag' | 'hint' | 'reschedule';

/** Anki's own default leech threshold, and the only defensible starting value. */
export const DEFAULT_LEECH_THRESHOLD = 8;

/** The tag Anki writes itself when a card trips the threshold. */
export const ANKI_LEECH_TAG = 'leech';

/** Characters of the source field a hint reveals before the ellipsis. */
export const DEFAULT_LEECH_HINT_REVEAL = 1;

/** What stands in for the part a hint withholds. */
export const LEECH_HINT_ELLIPSIS = '…';

/** Why a selected note produced no rescue, or produced only part of one. */
export type LeechRescueRefusal =
  /** Below the threshold and carrying no leech tag: nothing here is a leech. */
  | 'not-leech'
  /** The note generates no card in this draft, so it has no lapse count. */
  | 'no-cards'
  /** The rescue tag is already on the note; writing it again is not a change. */
  | 'already-tagged'
  /** The note type has no field by that name, in either direction. */
  | 'hint-field-absent'
  /** The source field is empty, so there is nothing to derive a hint from. */
  | 'hint-source-empty'
  /**
   * The source is no longer than the reveal, so a "hint" would be the whole
   * value. Refused rather than shortened: silently revealing an answer is worse
   * than writing nothing.
   */
  | 'hint-source-too-short'
  /** The hint field already holds text. Never overwritten — see the header. */
  | 'hint-occupied';

export interface LeechRescueHint {
  fromField: string;
  toField: string;
  /** The ord `toField` resolves to on this note's type. */
  toOrd: number;
  /** What the field holds now — always empty, or this would be a refusal. */
  before: string;
  /** The derived text. Never longer than the reveal plus the ellipsis. */
  after: string;
}

export interface LeechRescueTarget {
  noteId: string;
  /** The highest lapse count across the note's cards: what made it a leech. */
  lapses: number;
  /** Anki's own `leech` tag was already on the note. */
  tagged: boolean;
  /** Cards Anki suspended — its default leech action, and the user's evidence. */
  suspendedCards: number;
  /** The tag to add, or `null` when the `tag` measure is off or already applied. */
  tag: string | null;
  /** The hint to write, or `null` when the `hint` measure is off or refused. */
  hint: LeechRescueHint | null;
}

export interface LeechRescueSkip {
  noteId: string;
  refusal: LeechRescueRefusal;
}

export interface LeechRescuePlan {
  /** Notes with at least one measure to apply, in selection order. */
  targets: LeechRescueTarget[];
  /** Every refusal, including partial ones on a note that is still a target. */
  skips: LeechRescueSkip[];
  /** Notes that qualified as leeches, whether or not a measure applied. */
  leechNotes: number;
  /** Notes that qualified only because of the leech tag, below the threshold. */
  taggedOnlyNotes: number;
  /**
   * True when the run asked for `reschedule`. Always a refusal: the caller
   * turns it into the blocking or warning problem, depending on whether any
   * other measure had work to do.
   */
  rescheduleRefused: boolean;
}

export interface LeechRescueInput {
  notes: readonly AnkiDraftNote[];
  cards: readonly AnkiDraftCard[];
  noteTypes: readonly AnkiDraftNoteType[];
  measures: readonly LeechRescueMeasure[];
  /** Lapses at or above which a card is a leech. Anki's default when omitted. */
  threshold?: number;
  /**
   * Whether Anki's own `leech` tag qualifies a note whose lapse count sits
   * below the threshold. True is the useful answer — Anki tagged it when the
   * *deck's* threshold was tripped, which need not be the one asked for here —
   * but it is the caller's to state.
   */
  includeTagged: boolean;
  /** The tag the `tag` measure writes. */
  rescueTag: string;
  /** The field a hint is derived from. */
  hintFromField: string;
  /** The field a hint is written into. */
  hintToField: string;
  /** Characters revealed. `DEFAULT_LEECH_HINT_REVEAL` when omitted. */
  hintReveal?: number;
}

/**
 * The visible prefix of `source`, by code point rather than UTF-16 unit. A
 * surrogate pair split down the middle writes a replacement character into the
 * deck, and emoji and the rarer kanji are both pairs.
 */
export function leechHintText(source: string, reveal: number): string | null {
  const chars = [...source];
  if (chars.length <= reveal) return null;
  return `${chars.slice(0, reveal).join('')}${LEECH_HINT_ELLIPSIS}`;
}

function fieldOrd(
  types: Map<string, AnkiDraftNoteType>,
  note: AnkiDraftNote,
  name: string,
): number | undefined {
  // The note type is authoritative, but a source that could not read one still
  // names every value, so fall back to the value — the same resolution the
  // change tray's own field actions use.
  const def = types.get(note.noteTypeId)?.fields.find((f) => f.name === name);
  return def?.ord ?? note.fields.find((f) => f.name === name)?.ord;
}

/**
 * The rescues recipe 10 would make, and every note it refused with the reason.
 *
 * Pure: it reads a draft and returns a description. Nothing is written here —
 * the change tray turns `targets` into `tags` and `field` ops so the whole run
 * is one undoable step.
 */
export function planLeechRescue(input: LeechRescueInput): LeechRescuePlan {
  const threshold = Number.isFinite(input.threshold)
    ? Math.max(1, Math.trunc(input.threshold as number))
    : DEFAULT_LEECH_THRESHOLD;
  const reveal = Number.isFinite(input.hintReveal)
    ? Math.max(1, Math.trunc(input.hintReveal as number))
    : DEFAULT_LEECH_HINT_REVEAL;
  const measures = new Set(input.measures);
  const rescueTag = input.rescueTag.trim();
  const types = new Map(input.noteTypes.map((nt) => [nt.id, nt]));

  const cardsByNote = new Map<string, AnkiDraftCard[]>();
  for (const card of input.cards) {
    const list = cardsByNote.get(card.noteId);
    if (list) list.push(card);
    else cardsByNote.set(card.noteId, [card]);
  }

  const targets: LeechRescueTarget[] = [];
  const skips: LeechRescueSkip[] = [];
  let leechNotes = 0;
  let taggedOnlyNotes = 0;

  for (const note of input.notes) {
    const own = cardsByNote.get(note.id) ?? [];
    if (own.length === 0) {
      skips.push({ noteId: note.id, refusal: 'no-cards' });
      continue;
    }
    const lapses = own.reduce((most, card) => Math.max(most, card.lapses), 0);
    const tagged = note.tags.includes(ANKI_LEECH_TAG);
    const overThreshold = lapses >= threshold;
    if (!overThreshold && !(tagged && input.includeTagged)) {
      skips.push({ noteId: note.id, refusal: 'not-leech' });
      continue;
    }
    leechNotes += 1;
    if (!overThreshold) taggedOnlyNotes += 1;

    let tag: string | null = null;
    if (measures.has('tag') && rescueTag) {
      if (note.tags.includes(rescueTag)) {
        skips.push({ noteId: note.id, refusal: 'already-tagged' });
      } else {
        tag = rescueTag;
      }
    }

    let hint: LeechRescueHint | null = null;
    if (measures.has('hint')) {
      const fromOrd = fieldOrd(types, note, input.hintFromField);
      const toOrd = fieldOrd(types, note, input.hintToField);
      if (fromOrd === undefined || toOrd === undefined) {
        skips.push({ noteId: note.id, refusal: 'hint-field-absent' });
      } else {
        const before = note.fields.find((f) => f.ord === toOrd)?.raw ?? '';
        const source = stripFieldHtml(note.fields.find((f) => f.ord === fromOrd)?.raw ?? '').trim();
        const text = source === '' ? null : leechHintText(source, reveal);
        if (before.trim() !== '') {
          skips.push({ noteId: note.id, refusal: 'hint-occupied' });
        } else if (source === '') {
          skips.push({ noteId: note.id, refusal: 'hint-source-empty' });
        } else if (text === null) {
          skips.push({ noteId: note.id, refusal: 'hint-source-too-short' });
        } else {
          hint = {
            fromField: input.hintFromField,
            toField: input.hintToField,
            toOrd,
            before,
            after: text,
          };
        }
      }
    }

    if (tag === null && hint === null) continue;
    targets.push({
      noteId: note.id,
      lapses,
      tagged,
      suspendedCards: own.filter((card) => card.queue === 'suspended').length,
      tag,
      hint,
    });
  }

  return {
    targets,
    skips,
    leechNotes,
    taggedOnlyNotes,
    rescheduleRefused: measures.has('reschedule'),
  };
}
