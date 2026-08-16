// Cloze candidates from sentence fields — ANKI_DECK_WORKBENCH_PLAN.md Phase 7,
// recipe 19 ("generate cloze candidates from selected sentence fields with a
// review step").
//
// The recipe turns a sentence card into a cloze card: find the note's own word
// inside its own sentence and wrap that span in `{{cN::…}}`. Everything hard
// about it is in the word "find", and everything dangerous about it is in what
// happens when a marker is written somewhere it does not work.
//
// **The load-bearing refusal is `not-cloze`, and it is why this module exists
// as a model rather than as a find-replace.** `{{c1::…}}` generates cards on a
// *cloze* note type and renders as literal braces on a standard one. There is no
// error, no empty card and no warning: the user's card simply reads
// `{{c1::食べ}}ました` forever. A batch that wrote markers into a standard note
// type would report every note changed and would be a silent corruption of the
// only copy of the field. So the note type's `kind` is checked per note and a
// standard type is refused **by name, before any candidate is proposed**.
//
// **Where the span is located, and why that is two different texts.** The cover
// question is answered on `normalized`, which is what recipe 16 uses, so the two
// recipes cannot disagree about whether a sentence contains its word. The write
// happens on `raw`, which is what the note actually stores. When `normalized`
// says the word is there and `raw` holds no such span, the field interleaves
// markup across the match (`食<b>べ</b>る`) and no wrapper can be placed without
// rewriting the user's HTML — that is `html-split`, a distinct refusal rather
// than a `not-found`, because reporting "the sentence lacks its word" about a
// sentence that visibly contains it is a false claim.
//
// **A `stem` match wraps the stem and nothing more, on purpose.** 食べる in
// 昨日ケーキを食べました locates 食べ, and the fluent cloze would cover
// 食べました. Extending across the trailing kana run is derivable but wrong often
// enough to matter: 食べましたが swallows the particle, and the result reads as
// fluent Japanese while testing the wrong span. An under-covering candidate is
// visible to the reviewer, who can extend it; an over-covering one is invisible.
// This is recipe 16's own rule — a false `stem` hides the defect, a false
// `unknown` merely leaves it undecided — applied to the write side. The match
// mode travels with every candidate so the review step can rank `stem` below
// `exact` rather than having to re-derive why.
//
// **Ordinals are allocated note-wide, not field-wide.** Anki numbers cloze
// deletions across the whole note, so `{{c1::…}}` in `Sentence` and `{{c1::…}}`
// in `Notes` are one card, not two. The next free number is therefore the max
// over every field of the note.
//
// This module proposes and never writes. `already` exists so a second run over
// the same selection is a no-op that says so, rather than nesting a marker
// inside a marker — which parses, generates nothing, and is unpickable apart by
// eye.

import type { AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import { clozeOrdinals } from './ankiDraftEdit';
import {
  inflectionStem,
  resolveReadingField,
  resolveSentenceField,
  sentenceCover,
} from './ankiSentenceCover';
import { resolveVocabField } from './ankiVocabContext';

/** How the sentence held the word — the confidence the review step ranks by. */
export type ClozeMatchMode = 'exact' | 'reading' | 'stem';

export type ClozeCandidateOutcome =
  /** A span was located and a marker can be written. */
  | 'ready'
  /** The span is already inside a cloze marker — a re-run is a no-op. */
  | 'already'
  /** Standard note type: a marker would render as literal braces. */
  | 'not-cloze'
  /** The note type declares no sentence field, or the note's is empty. */
  | 'no-sentence'
  /** The note type declares no word field, or the note's is empty. */
  | 'no-term'
  /** `normalized` holds the word but `raw` splits it across markup. */
  | 'html-split'
  /** The sentence genuinely does not contain the word in any locatable form. */
  | 'not-found'
  /** No stem could be computed, so containment was never answerable. */
  | 'unknown';

/** The outcomes, most-actionable first — the order a surface should list them. */
export const CLOZE_CANDIDATE_OUTCOMES: readonly ClozeCandidateOutcome[] = [
  'ready',
  'already',
  'not-cloze',
  'no-sentence',
  'no-term',
  'html-split',
  'not-found',
  'unknown',
];

export interface ClozeCandidate {
  noteId: string;
  /** Field ord the marker would be written into. */
  fieldOrd: number;
  fieldName: string;
  outcome: ClozeCandidateOutcome;
  /** Present only on `ready` and `already`. */
  matchedBy?: ClozeMatchMode;
  /** The text the marker covers. Present only on `ready` and `already`. */
  span?: string;
  /** The cloze number the marker would use. Present only on `ready`. */
  ordinal?: number;
  /** The whole field after the write. Present only on `ready`. */
  raw?: string;
  /** The field before the write, always — the review step diffs against it. */
  before: string;
}

export interface ClozeCandidateOptions {
  /**
   * Match modes the run accepts, most-covered first. There is deliberately no
   * default: `stem` proposes a partial span and whether that is wanted is the
   * user's call, not this module's. An empty set proposes nothing.
   */
  modes: readonly ClozeMatchMode[];
}

const MARKER_RE = /\{\{c(\d+)::/g;

/**
 * Character ranges of `raw` that lie inside an existing cloze marker, marker
 * braces included. Scanned rather than regex-matched whole because a marker may
 * carry a `::hint` and may legitimately contain nested braces from a template
 * the user pasted; the close is found by walking to the matching `}}`.
 */
function markerRegions(raw: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of raw.matchAll(MARKER_RE)) {
    const start = m.index ?? 0;
    const close = raw.indexOf('}}', start + m[0].length);
    out.push({ start, end: close === -1 ? raw.length : close + 2 });
  }
  return out;
}

function insideMarker(
  regions: ReadonlyArray<{ start: number; end: number }>,
  start: number,
  end: number,
): boolean {
  return regions.some((r) => start >= r.start && end <= r.end);
}

/** The next free cloze number across every field of the note. */
export function nextClozeOrdinal(note: AnkiDraftNote): number {
  let max = 0;
  for (const field of note.fields) {
    for (const n of clozeOrdinals(field.raw)) if (n > max) max = n;
  }
  return max + 1;
}

/**
 * The span a match of this mode covers. Called only with the mode
 * `sentenceCover` actually returned, so each arm reports what that mode matched
 * on — `inflectionStem` for `stem`, so the wrapped span and the span the cover
 * was decided by cannot drift apart.
 */
function spanForMode(mode: ClozeMatchMode, term: string, reading: string): string | null {
  if (mode === 'exact') return term;
  if (mode === 'reading') return reading;
  return inflectionStem(term);
}

function fieldValue(
  note: AnkiDraftNote,
  name: string | null,
): { ord: number; name: string; raw: string; normalized: string } | null {
  if (!name) return null;
  const hit = note.fields.find((f) => f.name === name);
  return hit ? { ord: hit.ord, name: hit.name, raw: hit.raw, normalized: hit.normalized } : null;
}

/**
 * One note's candidate. `noteType` is passed rather than looked up so a batch
 * resolves the type once per type instead of once per note.
 */
export function clozeCandidate(
  note: AnkiDraftNote,
  noteType: AnkiDraftNoteType,
  options: ClozeCandidateOptions,
): ClozeCandidate {
  const names = noteType.fields.map((f) => f.name);
  const sentenceField = fieldValue(note, resolveSentenceField(names));
  const base = {
    noteId: note.id,
    fieldOrd: sentenceField?.ord ?? -1,
    fieldName: sentenceField?.name ?? '',
    before: sentenceField?.raw ?? '',
  };

  // Checked before anything else: on a standard note type there is no candidate
  // to review, only a field that would be quietly filled with literal braces.
  if (noteType.kind !== 'cloze') return { ...base, outcome: 'not-cloze' };
  if (!sentenceField || !sentenceField.normalized.trim()) {
    return { ...base, outcome: 'no-sentence' };
  }

  const termField = fieldValue(note, resolveVocabField(names));
  const term = (termField?.normalized ?? '').trim();
  if (!term) return { ...base, outcome: 'no-term' };

  const readingField = fieldValue(note, resolveReadingField(names));
  const reading = (readingField?.normalized ?? '').trim();

  const cover = sentenceCover({ sentence: sentenceField.normalized, term, reading });
  if (cover === 'unknown') return { ...base, outcome: 'unknown' };
  if (cover === 'none') return { ...base, outcome: 'not-found' };

  const span = options.modes.includes(cover as ClozeMatchMode)
    ? spanForMode(cover as ClozeMatchMode, term, reading)
    : null;
  // The cover is a mode the run did not ask for. That is not a defect in the
  // note, so it reports as the thing that is true of it: nothing was located
  // under the requested modes.
  if (!span) return { ...base, outcome: 'not-found' };

  const at = sentenceField.raw.indexOf(span);
  // `normalized` found it and `raw` did not: markup runs through the match.
  if (at === -1) return { ...base, outcome: 'html-split' };

  const regions = markerRegions(sentenceField.raw);
  if (insideMarker(regions, at, at + span.length)) {
    return { ...base, outcome: 'already', matchedBy: cover as ClozeMatchMode, span };
  }

  const ordinal = nextClozeOrdinal(note);
  const raw =
    sentenceField.raw.slice(0, at) + `{{c${ordinal}::${span}}}` + sentenceField.raw.slice(at + span.length);
  return {
    ...base,
    outcome: 'ready',
    matchedBy: cover as ClozeMatchMode,
    span,
    ordinal,
    raw,
  };
}

export type ClozeCandidateTally = Record<ClozeCandidateOutcome, number>;

export function emptyClozeCandidateTally(): ClozeCandidateTally {
  return {
    ready: 0,
    already: 0,
    'not-cloze': 0,
    'no-sentence': 0,
    'no-term': 0,
    'html-split': 0,
    'not-found': 0,
    unknown: 0,
  };
}

export interface ClozeCandidateReport {
  candidates: ClozeCandidate[];
  tally: ClozeCandidateTally;
  /** Every note considered — `candidates.length`, restated so a surface cannot
   *  report a percentage against the wrong denominator. */
  notesScanned: number;
}

/**
 * Every selected note's candidate, in the order given. The tally partitions the
 * scan exactly: the outcome counts sum to `notesScanned`, which is what makes
 * "3,079 ready" a number a reader can check rather than a headline.
 */
export function clozeCandidates(
  notes: readonly AnkiDraftNote[],
  noteTypes: readonly AnkiDraftNoteType[],
  options: ClozeCandidateOptions,
): ClozeCandidateReport {
  const byId = new Map(noteTypes.map((nt) => [nt.id, nt]));
  const tally = emptyClozeCandidateTally();
  const candidates: ClozeCandidate[] = [];
  for (const note of notes) {
    const noteType = byId.get(note.noteTypeId);
    // A note whose type is not in the draft cannot be judged cloze or standard,
    // and guessing `cloze` is the one guess that writes.
    if (!noteType) {
      const row: ClozeCandidate = {
        noteId: note.id,
        fieldOrd: -1,
        fieldName: '',
        outcome: 'not-cloze',
        before: '',
      };
      candidates.push(row);
      tally['not-cloze'] += 1;
      continue;
    }
    const row = clozeCandidate(note, noteType, options);
    candidates.push(row);
    tally[row.outcome] += 1;
  }
  return { candidates, tally, notesScanned: candidates.length };
}
