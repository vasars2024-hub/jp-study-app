/**
 * The local i+1 check for generated example sentences (docs/AI_AUDIT.md N2).
 *
 * The model was asked for sentences built from words the learner knows; this
 * checks that it did, with the app's own tokenizer and the learner's own
 * knowledge store, before a sentence is offered for a card. The rule itself is
 * `assessExampleSentence` (shared, pure); this module only supplies the tokens.
 */
import {
  assessExampleSentence,
  MAX_KNOWN_WORD_SAMPLE,
  type ExampleAssessment,
} from '../../../shared/aiExampleSentences';
import type { StudyLang } from '../../../shared/studyLang';
import { EXAMPLE_KNOWN_LEVEL, exampleCoverage } from '../../exampleCoverage';
import { getLevel, listKnownEntries } from '../../knownWords';
import { getTokenizer } from '../../tokenizer';
import { studyTokens } from '../../studyTokens';

export interface CheckedExample extends ExampleAssessment {
  text: string;
  translation: string;
}

/**
 * Up to `limit` words the learner knows (Known first, then Familiar), never the
 * target itself. Sent with the request so the model can stay inside them.
 */
export function knownWordSample(target: string, limit = MAX_KNOWN_WORD_SAMPLE): string[] {
  try {
    const entries = listKnownEntries().filter((entry) => entry.level >= EXAMPLE_KNOWN_LEVEL && entry.word !== target);
    const known = entries.filter((entry) => entry.level >= 3).map((entry) => entry.word);
    const familiar = entries.filter((entry) => entry.level < 3).map((entry) => entry.word);
    return [...known, ...familiar].filter((word) => word.length <= 24).slice(0, limit);
  } catch {
    return [];
  }
}

/** Every form the target may appear under, so it is never counted as "another unknown word". */
function targetForms(word: string, reading: string): Set<string> {
  return new Set([word, reading].map((form) => form.trim()).filter(Boolean));
}

export async function checkExampleSentences(
  sentences: ReadonlyArray<{ text: string; translation: string }>,
  card: { word: string; reading: string },
  lang: StudyLang,
): Promise<CheckedExample[]> {
  let canTokenize = true;
  if (lang === 'ja') {
    try {
      await getTokenizer();
    } catch {
      canTokenize = false;
    }
  }
  const targets = targetForms(card.word, card.reading);
  const targetKnown = getLevel(card.word) >= EXAMPLE_KNOWN_LEVEL;
  return sentences.map((sentence) => {
    let coverage = null;
    if (canTokenize) {
      try {
        coverage = exampleCoverage(studyTokens(sentence.text, lang), targets, getLevel);
      } catch {
        coverage = null;
      }
    }
    return { text: sentence.text, translation: sentence.translation, ...assessExampleSentence(coverage, targetKnown) };
  });
}
