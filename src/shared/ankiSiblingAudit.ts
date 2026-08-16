// Sibling cards that should not exist — ANKI_DECK_WORKBENCH_PLAN.md Phase 7,
// recipe 17 ("audit sibling cards and remove unintended duplicate templates").
//
// The subject here is the *note type*, not the note. Recipe 15 already judges
// what one card renders into; this one judges whether two templates of the same
// note type are asking the user the same thing twice. That is a fault no
// per-card lens can see, because each card on its own renders perfectly.
//
// The verdicts, healthiest first:
//
//   single     the note generates one card — there is no sibling to audit
//   ok         the note's siblings each ask something different
//   duplicate  two templates render the same question AND the same answer
//   ambiguous  two templates render the same question and DIFFERENT answers
//   orphan     the note holds a card whose ord names no template it generates
//
// **`single` is dropped, not ranked** — recipe 11's `none` and recipe 15's
// `not-generated` rule. A one-card note is not a healthy sibling set; it is out
// of scope, and letting it into the `ok` count would make "99% ok" mean nothing
// on a deck where 99% of note types have one template.
//
// **`ambiguous` is worse than `duplicate`, and they are not the same defect.**
// Two templates with the same question and the same answer waste the user's
// time; one of them can be removed and nothing is lost. Two templates with the
// same question and different answers are unanswerable: the user is shown one
// prompt and graded against two different expectations, and removing either one
// silently drops content. Collapsing both into "duplicate" would offer a
// destructive fix for the case where it is wrong.
//
// **Why rendered text and not `qfmt`.** `{{Front}}` and `{{ Front }}` are the
// same template written twice; `{{Front}}` and `{{text:Front}}` are two spellings
// of one render on a plain field and two different renders on a field holding
// markup. The card is what the user sees, so the render is what gets compared —
// the same choice recipe 15 made and for the same reason.
//
// **Why a bounded sample rather than the whole deck.** The comparison is
// T x 2 renders per note, and the plan's performance target is a 100,000-note
// fixture. So it renders an evenly spaced sample and REPORTS ITS SIZE: a group
// says "identical on 50 of 50 sampled notes", never "identical". Evenly spaced
// rather than the first N, because the first N notes of a mined deck all come
// from one source and share whatever conditional shape that source produces.
//
// **A missing sibling is deliberately not a verdict here.** `cardOrdsOfNote`
// lists every template ord regardless of conditionals, so an optional-reverse
// note that correctly generated one card would read as missing its second.
// Recipe 15 already renders each card and reports `not-generated` for exactly
// that case, with the conditional evidence this module does not gather.

import type { AnkiDraft, AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';
import { cardOrdsOfNote, contentText, renderAnkiCard } from './ankiTemplateRender';

export type SiblingVerdict = 'single' | 'ok' | 'duplicate' | 'ambiguous' | 'orphan';

/** The verdicts, healthiest first — the order a surface should list them in. */
export const SIBLING_VERDICTS: readonly SiblingVerdict[] = [
  'single',
  'ok',
  'duplicate',
  'ambiguous',
  'orphan',
];

export function parseSiblingVerdict(value: string): SiblingVerdict | null {
  const key = value.trim().toLowerCase();
  return (SIBLING_VERDICTS as readonly string[]).includes(key)
    ? (key as SiblingVerdict)
    : null;
}

/**
 * How many notes of one note type get rendered to compare its templates.
 *
 * 50 is a sample, not a proof, and every group says so. Raising it multiplies
 * renders by the number of templates; the sizes that matter here are 1 (a
 * single note decides nothing) and "enough that a conditional which fires on
 * some sources shows up", which 50 evenly spaced notes reach on every real deck
 * measured.
 */
export const SIBLING_SAMPLE_NOTES = 50;

export type TemplateGroupVerdict = Extract<SiblingVerdict, 'duplicate' | 'ambiguous'>;

export interface TemplateGroup {
  noteTypeId: string;
  noteTypeName: string;
  verdict: TemplateGroupVerdict;
  /** Template ords that collide, ascending. The first is the one to keep. */
  ords: number[];
  /** Their names, in the same order as `ords`. */
  names: string[];
  /** Notes actually rendered to reach this verdict — never presented as the deck. */
  sampled: number;
  /** Cards the group's non-keeper templates generated across the whole draft. */
  redundantCards: number;
}

/**
 * Evenly spaced notes of one note type, deterministically.
 *
 * `Math.floor(i * total / want)` and not `i * step`: with 7 notes and a want of
 * 3 a fixed step of 2 takes indices 0/2/4 and never looks at the tail, while
 * this takes 0/2/4 of 7 -> 0, 2, 4 and of 300 -> 0, 100, 200. The last index is
 * always < total, so it never has to be clamped.
 */
export function sampleNoteIndices(total: number, want: number): number[] {
  if (total <= 0 || want <= 0) return [];
  if (total <= want) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: want }, (_, i) => Math.floor((i * total) / want));
}

/**
 * Signature separator, written as an escape and never as a raw byte -- a raw
 * NUL makes git treat the whole source file as binary. NUL because rendered
 * card text cannot contain one, where a space would let a template rendering
 * `['ab', '']` and one rendering `['a', 'b']` sign identically and be called
 * duplicates of each other.
 */
const SEP = '\u0000';
interface TemplateRenders {
  ord: number;
  name: string;
  questions: string[];
  answers: string[];
}

/**
 * Compare every template of one note type against the others.
 *
 * Cloze note types are skipped whole: their cards come from `{{c1::…}}` markers
 * in the fields, so two cloze cards are two positions in one text and there is
 * no second template to be redundant with.
 */
export function noteTypeTemplateGroups(
  draft: AnkiDraft,
  noteType: AnkiDraftNoteType,
  sampleSize = SIBLING_SAMPLE_NOTES,
): TemplateGroup[] {
  if (noteType.kind === 'cloze') return [];
  if (noteType.templates.length < 2) return [];

  const notes = draft.notes.filter((n) => n.noteTypeId === noteType.id);
  const sample = sampleNoteIndices(notes.length, sampleSize).map((i) => notes[i]);
  if (sample.length === 0) return [];

  const rendered: TemplateRenders[] = noteType.templates.map((tpl) => ({
    ord: tpl.ord,
    name: tpl.name,
    questions: [],
    answers: [],
  }));
  for (const note of sample) {
    for (const entry of rendered) {
      const card = renderAnkiCard(draft, note, entry.ord);
      entry.questions.push(contentText(card.questionHtml));
      entry.answers.push(contentText(card.answerHtml));
    }
  }

  // Cards each template generated across the WHOLE draft, not the sample: the
  // sample decides whether a template is redundant, the draft decides how much
  // reviewing that costs.
  const cardsByOrd = new Map<number, number>();
  const noteIds = new Set(notes.map((n) => n.id));
  for (const card of draft.cards) {
    if (!noteIds.has(card.noteId)) continue;
    cardsByOrd.set(card.ord, (cardsByOrd.get(card.ord) ?? 0) + 1);
  }

  const byQuestion = new Map<string, TemplateRenders[]>();
  for (const entry of rendered) {
    // Every sampled question empty means this template showed the user nothing
    // on any note looked at — two such templates match each other trivially and
    // that match is an artifact of the sample, not a duplicate.
    if (entry.questions.every((q) => q.length === 0)) continue;
    const key = entry.questions.join(SEP);
    const bucket = byQuestion.get(key);
    if (bucket) bucket.push(entry);
    else byQuestion.set(key, [entry]);
  }

  const groups: TemplateGroup[] = [];
  const build = (
    members: TemplateRenders[],
    verdict: TemplateGroupVerdict,
  ): TemplateGroup => {
    const sorted = [...members].sort((a, b) => a.ord - b.ord);
    return {
      noteTypeId: noteType.id,
      noteTypeName: noteType.name,
      verdict,
      ords: sorted.map((m) => m.ord),
      names: sorted.map((m) => m.name),
      sampled: sample.length,
      redundantCards: sorted
        .slice(1)
        .reduce((sum, m) => sum + (cardsByOrd.get(m.ord) ?? 0), 0),
    };
  };

  for (const members of byQuestion.values()) {
    if (members.length < 2) continue;
    const byAnswer = new Map<string, TemplateRenders[]>();
    for (const entry of members) {
      const key = entry.answers.join(SEP);
      const bucket = byAnswer.get(key);
      if (bucket) bucket.push(entry);
      else byAnswer.set(key, [entry]);
    }
    for (const answerGroup of byAnswer.values()) {
      if (answerGroup.length >= 2) groups.push(build(answerGroup, 'duplicate'));
    }
    // One question, more than one expected answer. Reported over the whole
    // question group even when part of it is also a duplicate pair, because the
    // ambiguity is between the answers and naming only two of three templates
    // would point the user at the wrong pair.
    if (byAnswer.size >= 2) groups.push(build(members, 'ambiguous'));
  }

  return groups.sort(
    (a, b) =>
      (a.verdict === b.verdict ? 0 : a.verdict === 'ambiguous' ? -1 : 1) ||
      a.ords[0] - b.ords[0],
  );
}

export function draftTemplateGroups(
  draft: AnkiDraft,
  sampleSize = SIBLING_SAMPLE_NOTES,
): TemplateGroup[] {
  return draft.noteTypes.flatMap((nt) => noteTypeTemplateGroups(draft, nt, sampleSize));
}

const SEVERITY = new Map<SiblingVerdict, number>(SIBLING_VERDICTS.map((v, i) => [v, i]));

export interface SiblingAudit {
  verdict: SiblingVerdict;
  /** Card ords the note holds that no template of its note type generates. */
  orphanOrds: number[];
  /** Groups whose colliding templates both produced a card on this note. */
  groups: TemplateGroup[];
}

/**
 * One note's verdict, given the note-type groups already computed.
 *
 * `orphan` is checked first and outranks everything: a card whose ord names no
 * template cannot be rendered at all, so the question of what it asks does not
 * arise. Anki's own "Empty cards" tool deletes exactly these; a note type whose
 * template was removed leaves one behind per note.
 */
export function noteSiblingAudit(
  draft: AnkiDraft,
  note: AnkiDraftNote,
  groups: readonly TemplateGroup[],
): SiblingAudit {
  const expected = new Set(cardOrdsOfNote(draft, note));
  const own = draft.cards.filter((c) => c.noteId === note.id);
  const ownOrds = new Set(own.map((c) => c.ord));
  const orphanOrds = [...new Set(own.filter((c) => !expected.has(c.ord)).map((c) => c.ord))].sort(
    (a, b) => a - b,
  );
  if (orphanOrds.length > 0) return { verdict: 'orphan', orphanOrds, groups: [] };

  const hit = groups.filter(
    (g) =>
      g.noteTypeId === note.noteTypeId &&
      g.ords.filter((ord) => ownOrds.has(ord)).length >= 2,
  );
  if (hit.length > 0) {
    let worst: SiblingVerdict = 'duplicate';
    for (const group of hit) {
      if ((SEVERITY.get(group.verdict) ?? 0) > (SEVERITY.get(worst) ?? 0)) worst = group.verdict;
    }
    return { verdict: worst, orphanOrds: [], groups: hit };
  }

  // Counted from the cards the note actually holds, not from the template count:
  // a two-template note type whose optional reverse never generated leaves the
  // user one card to review, and that is the thing with no sibling. Reading the
  // template count instead would call it `ok` — "its siblings each ask something
  // different" — about a note that has none.
  if (own.length <= 1) return { verdict: 'single', orphanOrds: [], groups: [] };
  return { verdict: 'ok', orphanOrds: [], groups: [] };
}

/**
 * Per-note verdicts for a whole draft, for the Browser's `sibling:` predicate.
 *
 * Precomputed like `CardHealthContext`, and for a stronger reason: the template
 * comparison renders a sample of every note type, so recomputing it per row per
 * keystroke would render the deck thousands of times.
 */
export type SiblingAuditContext = ReadonlyMap<string, SiblingVerdict>;

export function buildSiblingAuditContext(
  draft: AnkiDraft,
  sampleSize = SIBLING_SAMPLE_NOTES,
): SiblingAuditContext {
  const groups = draftTemplateGroups(draft, sampleSize);
  const byNote = new Map<string, SiblingVerdict>();
  for (const note of draft.notes) {
    byNote.set(note.id, noteSiblingAudit(draft, note, groups).verdict);
  }
  return byNote;
}

export interface SiblingTally {
  single: number;
  ok: number;
  duplicate: number;
  ambiguous: number;
  orphan: number;
}

export function emptySiblingTally(): SiblingTally {
  return { single: 0, ok: 0, duplicate: 0, ambiguous: 0, orphan: 0 };
}

export function tallySiblingVerdicts(verdicts: Iterable<SiblingVerdict>): SiblingTally {
  const tally = emptySiblingTally();
  for (const verdict of verdicts) tally[verdict] += 1;
  return tally;
}
