/**
 * Turning one harvested vocabulary row into a flashcard.
 *
 * A harvest row already carries everything a card needs and one thing the
 * dictionary surface cannot supply: the sentence the learner actually met the
 * word in. That context is the whole reason to mine from here rather than
 * re-looking the word up — so the sentence is sliced out of the very passage
 * the harvest was folded from, never fetched again and never invented.
 *
 * The request is a plain `MineNoteRequest` with the same `route` a
 * dictionary mine uses, so mining rules, field mapping and duplicate detection
 * behave identically no matter which surface the user clicked. Pure and
 * unit-testable; the renderer only decides *when* to call it.
 */

import type { MineNoteRequest } from './anki';
import type { LexiconInterlinearResult } from './lexiconInterlinear';
import type { LexiconVocabularyItem } from './lexiconHarvest';
import { detectMineLanguage, type MineLanguage } from './profileRules';
import { sentenceAt } from './sentenceBounds';

export interface HarvestMineOpts {
  /** Study language of the passage, for mining-rule routing. */
  lang: string;
}

/**
 * An ungrounded row has no reading and no gloss this installation can stand
 * behind, so mining it would write a card with a blank back — a card the user
 * has to repair in Anki before it is answerable. The row stays visible (not
 * knowing a word is information) but it is not minable, and the UI says why
 * rather than failing after the click.
 */
export function canMineHarvestItem(item: LexiconVocabularyItem): boolean {
  return item.grounded && item.glosses.length > 0;
}

/** Mining rules key off a language code; anything else falls back to the text heuristic. */
function mineLanguage(lang: string, text: string): MineLanguage {
  const code = lang.trim().toLowerCase();
  if (code === 'ja' || code === 'zh' || code === 'ru') return code;
  return detectMineLanguage(text);
}

/**
 * The context sentence for a row, or nothing.
 *
 * `firstStart` is an offset into `result.text`, the exact normalized passage
 * the parts were segmented from, so the slice is the real sentence rather than
 * a reconstruction. A "sentence" that turns out to be just the word itself is
 * not context and is dropped — a one-word passage should produce the same card
 * a dictionary lookup would.
 */
export function harvestContextSentence(
  item: LexiconVocabularyItem,
  result: LexiconInterlinearResult,
): string | undefined {
  const sentence = sentenceAt(result.text, item.firstStart);
  if (!sentence) return undefined;
  const surface = item.surfaces[0] ?? item.text;
  if (sentence === surface || sentence === item.text) return undefined;
  return sentence;
}

/**
 * Build the mine request for one harvested word.
 *
 * `surface` is the form the passage actually wrote (食べた for the headword
 * 食べる) so cloze splitting can find the word in the sentence; it is omitted
 * when it matches the term, matching what the dictionary surface sends.
 */
export function buildHarvestMineRequest(
  item: LexiconVocabularyItem,
  result: LexiconInterlinearResult,
  opts: HarvestMineOpts,
): MineNoteRequest {
  const surface = item.surfaces[0] ?? item.text;
  const sentence = harvestContextSentence(item, result);
  const req: MineNoteRequest = {
    route: {
      source: 'dictionary',
      cardKind: 'word',
      language: mineLanguage(opts.lang, sentence || item.text),
    },
    term: item.text,
    // Only glosses in the requested target languages ever reach a harvest row,
    // so this is exactly what the panel showed the user.
    meaning: item.glosses.map((gloss) => gloss.text).join('; '),
  };
  if (item.reading && item.reading !== item.text) req.reading = item.reading;
  if (sentence) req.sentence = sentence;
  if (sentence && surface !== item.text) req.surface = surface;
  return req;
}
