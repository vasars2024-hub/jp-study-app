import { evaluateJapaneseDictation } from '../shared/listeningTraining';
import { getTokenizer, tokenizeSync } from './tokenizer';

function toReading(text: string): string {
  return tokenizeSync([...text].slice(0, 500).join(''))
    .map((token) => token.reading && token.reading !== '*' ? token.reading : token.surface)
    .join('');
}

const KANJI = /[\p{Script=Han}々]/gu;

/**
 * Whether every kanji the learner typed is one the line actually uses. Reading the
 * answer aloud is only fair then: 機械がある and 機会がある are both きかいがある, and
 * a wrong kanji must not score as an exact match.
 */
function kanjiAllFromExpected(answer: string, expected: string): boolean {
  const allowed = new Set(expected.match(KANJI) ?? []);
  return (answer.match(KANJI) ?? []).every((ch) => allowed.has(ch));
}

/** Accept kana transcriptions without requiring the learner to spell kanji. */
export async function evaluateDictation(answer: string, expected: string) {
  const literal = evaluateJapaneseDictation(answer, expected);
  if (literal.exact || !answer.trim()) return literal;
  try {
    await getTokenizer();
    const reading = toReading(expected);
    if (!reading) return literal;
    // An IME converts some words and not others (今日はいいてんき), so the
    // answer is read aloud too: neither script alone matches a mixed answer.
    const kana = evaluateJapaneseDictation(answer, reading);
    const spoken = kanjiAllFromExpected(answer, expected)
      ? evaluateJapaneseDictation(toReading(answer), reading)
      : kana;
    const phonetic = spoken.score > kana.score ? spoken : kana;
    return phonetic.score > literal.score
      ? {
        ...literal, exact: phonetic.exact, score: phonetic.score,
        comparison: { answer: phonetic.answer, expected: phonetic.expected },
      }
      : literal;
  } catch {
    // Dictionary assets can be unavailable; literal checking still works.
    return literal;
  }
}
