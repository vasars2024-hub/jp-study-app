/**
 * Turning an AI analysis into a flashcard.
 *
 * Mining from the analysis has to produce a card indistinguishable from a
 * dictionary-mined one — same `route`, same content slots — or the profile's
 * field mapping, mining rules and duplicate detection all behave differently
 * depending on where the user happened to click. So this builds a plain
 * `MineNoteRequest` and lets the existing pipeline do everything else; the only
 * additions are the deck override and the explanation text the analysis knows
 * and the dictionary does not.
 *
 * Pure and unit-testable: the interesting decisions (which text becomes the
 * term, what happens on a sentence card, when the deck override applies) are
 * exactly the ones worth pinning down in tests.
 */

import type { MineNoteRequest } from './anki';
import { primaryTranslation, type SentenceAnalysisResult, type SentenceAnnotation } from './sentenceAnalysisCore';
import type { SentenceAnalysisPrefs } from './sentenceAnalysisPrefs';

export interface AnalysisMineOpts {
  /** Study language of the sentence, for mining-rule routing. */
  lang: string;
  /** UI language, used to pick which translation lands on the card. */
  uiLang: string;
  /** Overrides the preference for this one card (the "make it a sentence card" action). */
  cardKind?: 'word' | 'sentence';
}

/** Mining rules key off a language code, and only these three are modelled. */
function mineLanguage(lang: string): 'ja' | 'zh' | 'ru' | undefined {
  const code = lang.toLowerCase();
  return code === 'ja' || code === 'zh' || code === 'ru' ? code : undefined;
}

/**
 * The card's meaning text.
 *
 * With `includeExplanation` on, the in-depth paragraph joins the one-line gloss
 * — that paragraph is the whole reason to mine from here rather than from the
 * dictionary. With it off the card stays as terse as a dictionary card, which
 * is what a user drilling recognition wants.
 */
function meaningFor(annotation: SentenceAnnotation, prefs: SentenceAnalysisPrefs): string {
  const parts = [annotation.meaning];
  if (prefs.anki.includeExplanation && annotation.explanation) parts.push(annotation.explanation);
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Build the mine request for one annotated span.
 *
 * A sentence card inverts what goes where: the term becomes the whole sentence
 * and the span's explanation becomes the meaning, because the thing being
 * tested is comprehension of the line rather than recall of the word.
 */
export function buildAnalysisMineRequest(
  annotation: SentenceAnnotation,
  result: SentenceAnalysisResult,
  prefs: SentenceAnalysisPrefs,
  opts: AnalysisMineOpts,
): MineNoteRequest {
  const cardKind = opts.cardKind ?? prefs.anki.cardKind;
  const translation = primaryTranslation(result, opts.uiLang, opts.lang);
  const isSentence = cardKind === 'sentence';

  const req: MineNoteRequest = {
    route: {
      source: 'dictionary',
      cardKind,
      language: mineLanguage(opts.lang),
    },
    term: isSentence ? result.sentence : annotation.headword || annotation.text,
    meaning: isSentence ? translation || meaningFor(annotation, prefs) : meaningFor(annotation, prefs),
    sentence: result.sentence,
    // The exact form as written, so cloze splitting can find the word in the
    // sentence even when `term` is the (different) citation form.
    surface: isSentence ? undefined : annotation.text,
    extraTags: prefs.anki.extraTags.length ? [...prefs.anki.extraTags] : undefined,
  };
  if (annotation.reading && !isSentence) req.reading = annotation.reading;
  if (prefs.anki.includeTranslation && translation) req.sentenceTranslation = translation;
  // An empty deck string means "let the profile decide" — sending it through
  // would override the profile with a nonexistent deck.
  if (prefs.anki.deck) req.deckName = prefs.anki.deck;
  return req;
}

/**
 * The card for "save the whole sentence", used by the sentence-level action and
 * by auto-mining. Falls back to the first annotation for the meaning when no
 * translation was requested, so the card is never blank on its back.
 */
export function buildSentenceMineRequest(
  result: SentenceAnalysisResult,
  prefs: SentenceAnalysisPrefs,
  opts: AnalysisMineOpts,
): MineNoteRequest {
  const lead = result.annotations[0];
  const translation = primaryTranslation(result, opts.uiLang, opts.lang);
  const req: MineNoteRequest = {
    route: { source: 'dictionary', cardKind: 'sentence', language: mineLanguage(opts.lang) },
    term: result.sentence,
    meaning: translation || (lead ? meaningFor(lead, prefs) : ''),
    sentence: result.sentence,
    extraTags: prefs.anki.extraTags.length ? [...prefs.anki.extraTags] : undefined,
  };
  if (prefs.anki.includeTranslation && translation) req.sentenceTranslation = translation;
  if (prefs.anki.deck) req.deckName = prefs.anki.deck;
  return req;
}
