import { evaluateJapaneseDictation } from '../shared/listeningTraining';
import { getTokenizer, tokenizeSync } from './tokenizer';

function toReading(text: string): string {
  return tokenizeSync([...text].slice(0, 500).join(''))
    .map((token) => token.reading && token.reading !== '*' ? token.reading : token.surface)
    .join('');
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
    const spoken = evaluateJapaneseDictation(toReading(answer), reading);
    const phonetic = spoken.score > kana.score ? spoken : kana;
    return phonetic.score > literal.score
      ? { ...literal, exact: phonetic.exact, score: phonetic.score }
      : literal;
  } catch {
    // Dictionary assets can be unavailable; literal checking still works.
    return literal;
  }
}
