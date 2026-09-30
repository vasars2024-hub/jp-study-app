import { evaluateJapaneseDictation } from '../shared/listeningTraining';
import { getTokenizer, tokenizeSync } from './tokenizer';

/** Accept kana transcriptions without requiring the learner to spell kanji. */
export async function evaluateDictation(answer: string, expected: string) {
  const literal = evaluateJapaneseDictation(answer, expected);
  if (literal.exact || !answer.trim()) return literal;
  try {
    await getTokenizer();
    const reading = tokenizeSync([...expected].slice(0, 500).join(''))
      .map((token) => token.reading && token.reading !== '*' ? token.reading : token.surface)
      .join('');
    if (!reading) return literal;
    const phonetic = evaluateJapaneseDictation(answer, reading);
    return phonetic.score > literal.score
      ? { ...literal, exact: phonetic.exact, score: phonetic.score }
      : literal;
  } catch {
    // Dictionary assets can be unavailable; literal checking still works.
    return literal;
  }
}
