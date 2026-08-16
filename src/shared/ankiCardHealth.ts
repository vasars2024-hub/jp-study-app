// Cards that render into nothing worth reviewing — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 7, recipe 15 ("identify empty backs, identical front/back renders, and
// broken templates").
//
// `renderAnkiCard` already reports `empty-question`, `empty-answer` and the
// template faults. What it cannot report — and what this module exists for — is
// the **identical render**, because the answer format embeds the question:
// `ankiTemplateRender.ts:531` substitutes `{{FrontSide}}` with the rendered
// question before rendering the answer. So the classic broken card, an
// `{{FrontSide}}<hr id=answer>{{Back}}` answer over an empty `Back`, renders a
// perfectly non-empty answer holding the question and nothing else. Every
// existing check passes it. The user reviews a card that shows them the front,
// then shows them the front again.
//
// The verdicts, healthiest first:
//
//   ok             the answer renders and adds something the question did not show
//   not-generated  a conditional suppressed this card — Anki generates none here
//   same           the answer renders, and strips to exactly the question
//   empty-back     the answer side renders empty
//   empty-front    the question renders empty and no conditional explains it
//   broken         the template cannot render: an unresolved field, a filter the
//                  renderer does not implement, an unbalanced conditional, a
//                  malformed cloze, or a cloze note carrying no cloze marker
//
// **`not-generated` is not a defect and is not `ok` either.** It is
// `conditional-card-not-generated`, which `ADVISORY_RENDER_PROBLEMS` already
// forbids anything from treating as evidence a card is broken. An optional
// reverse card that the note did not opt into must not appear in a review queue
// of broken cards, and must not inflate the healthy count either.
//
// **Why `same` compares rendered text and not fields.** Front and Back can hold
// different text and still render identically — a template that shows `{{Front}}`
// on both sides, a `{{#Back}}` conditional that closes over nothing. And the
// reverse: two fields with the same text render differently the moment one side
// wraps it in a filter. The card is what the user sees, so the render is what
// gets compared.
//
// **Media counts as content.** `contentText` keeps the file name of anything
// carrying a `src`, so an answer whose only addition is an image is `ok` rather
// than `same`. Stripping the tag outright would put every image-back card in a
// deck into the defect queue — the same false failure `fieldIsEmpty` documents.

import type { AnkiDraft, AnkiDraftNote } from './ankiDraft';
import {
  contentText,
  renderNoteCards,
  type AnkiRenderProblemCode,
  type RenderedAnkiCard,
} from './ankiTemplateRender';

export type CardHealth =
  | 'ok'
  | 'not-generated'
  | 'same'
  | 'empty-back'
  | 'empty-front'
  | 'broken';

/** The verdicts, healthiest first — the order a surface should list them in. */
export const CARD_HEALTHS: readonly CardHealth[] = [
  'ok',
  'not-generated',
  'same',
  'empty-back',
  'empty-front',
  'broken',
];

export function parseCardHealth(value: string): CardHealth | null {
  const key = value.trim().toLowerCase();
  return (CARD_HEALTHS as readonly string[]).includes(key) ? (key as CardHealth) : null;
}

/**
 * Render problems that mean the *template* is at fault rather than this note's
 * content. `missing-media` is deliberately absent: a missing media file is
 * recipe 11's subject and a note-level defect, not a template that cannot
 * render. `media-not-rendered` is advisory and never a defect at all.
 */
const BROKEN_TEMPLATE_PROBLEMS: ReadonlySet<AnkiRenderProblemCode> = new Set([
  'unresolved-field',
  'unknown-filter',
  'unbalanced-conditional',
  'malformed-cloze',
  'cloze-without-markers',
  'cloze-filter-outside-cloze-note',
]);

/**
 * What the answer shows that the question did not, as text.
 *
 * The answer normally *starts* with the question, because `{{FrontSide}}` was
 * substituted into it. An answer that does not embed the question at all is
 * wholly its own content and is returned unchanged — its text is by definition
 * something the question did not show.
 */
export function answerExtra(questionHtml: string, answerHtml: string): string {
  const question = contentText(questionHtml);
  const answer = contentText(answerHtml);
  if (answer === question) return '';
  if (question.length > 0 && answer.startsWith(question)) {
    const rest = answer.slice(question.length).trim();
    // `{{FrontSide}}<hr id=answer>{{Front}}` — a mis-authored template whose
    // back repeats the front verbatim. The remainder is non-empty but it is the
    // question again, so the card still shows the user nothing new.
    return rest === question ? '' : rest;
  }
  return answer;
}

/** One rendered card's verdict. Pure — it reads the render, nothing else. */
export function cardHealth(card: RenderedAnkiCard): CardHealth {
  const codes = new Set(card.problems.map((p) => p.code));
  for (const code of codes) {
    if (BROKEN_TEMPLATE_PROBLEMS.has(code)) return 'broken';
  }
  if (codes.has('empty-question')) return 'empty-front';
  // Checked before `empty-back`: a card Anki never generates has no answer for
  // a blank to be a defect in, which is why `renderAnkiCard` suppresses
  // `empty-answer` for it too.
  if (codes.has('conditional-card-not-generated')) return 'not-generated';
  if (codes.has('empty-answer')) return 'empty-back';
  return answerExtra(card.questionHtml, card.answerHtml).length === 0 ? 'same' : 'ok';
}

const SEVERITY = new Map<CardHealth, number>(CARD_HEALTHS.map((h, i) => [h, i]));

/**
 * The worst verdict across a note's sibling cards.
 *
 * Cards Anki does not generate are dropped rather than ranked, so a note with a
 * healthy forward card and an opted-out reverse reads `ok` and not
 * `not-generated`. A note whose cards are *all* ungenerated has no card to
 * judge, and says so.
 *
 * No cards at all is `broken`, not `not-generated`: `cardOrdsOfNote` falls back
 * to a single ord for every note type it can resolve, so an empty list means a
 * standard note type that declares no templates. That generates nothing for a
 * reason no conditional explains, which is the definition of a broken template.
 */
export function worstCardHealth(healths: readonly CardHealth[]): CardHealth {
  const judged = healths.filter((h) => h !== 'not-generated');
  if (judged.length === 0) return healths.length === 0 ? 'broken' : 'not-generated';
  let worst: CardHealth = 'ok';
  for (const health of judged) {
    if ((SEVERITY.get(health) ?? 0) > (SEVERITY.get(worst) ?? 0)) worst = health;
  }
  return worst;
}

/** A note's verdict, rendering its sibling cards to get there. */
export function noteCardHealth(draft: AnkiDraft, note: AnkiDraftNote): CardHealth {
  return worstCardHealth(renderNoteCards(draft, note).map(cardHealth));
}

/**
 * Per-note verdicts for a whole draft, for the Browser's `render:` predicate.
 *
 * Precomputed for the same reason `VocabContext` is: the filter runs per row on
 * every keystroke, and rendering a note's cards inside it would re-render the
 * deck each time.
 */
export type CardHealthContext = ReadonlyMap<string, CardHealth>;

export function buildCardHealthContext(draft: AnkiDraft): CardHealthContext {
  const byNote = new Map<string, CardHealth>();
  for (const note of draft.notes) byNote.set(note.id, noteCardHealth(draft, note));
  return byNote;
}

export interface CardHealthTally {
  ok: number;
  'not-generated': number;
  same: number;
  'empty-back': number;
  'empty-front': number;
  broken: number;
}

export function emptyCardHealthTally(): CardHealthTally {
  return { ok: 0, 'not-generated': 0, same: 0, 'empty-back': 0, 'empty-front': 0, broken: 0 };
}

export function tallyCardHealth(healths: Iterable<CardHealth>): CardHealthTally {
  const tally = emptyCardHealthTally();
  for (const health of healths) tally[health] += 1;
  return tally;
}
