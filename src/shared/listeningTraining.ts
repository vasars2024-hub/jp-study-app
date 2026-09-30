export interface DictationEvaluation {
  exact: boolean;
  score: number;
  answer: string;
  expected: string;
}

export function normalizeJapaneseDictation(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    // Keep ー: vowel length changes the word (ビル versus ビール).
    .replace(/[\s、。！？!?・「」『』“”‘’〝〞〟（）()[\]【】〈〉《》…‥.,'":;：；]/gu, '');
}

// Comparison-only fold: an answer typed in hiragana matches a katakana subtitle
// (びーる vs ビール) while the displayed answer keeps the learner's own script.
function foldKana(chars: string[]): string[] {
  return chars.map((ch) => (/[ァ-ヶ]/u.test(ch) ? String.fromCharCode(ch.charCodeAt(0) - 0x60) : ch));
}

function editDistance(left: string[], right: string[]): number {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 0; row < left.length; row += 1) {
    const current = [row + 1];
    for (let column = 0; column < right.length; column += 1) {
      current[column + 1] = Math.min(
        current[column] + 1,
        previous[column + 1] + 1,
        previous[column] + (left[row] === right[column] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function evaluateJapaneseDictation(
  answerValue: string,
  expectedValue: string,
): DictationEvaluation {
  // Use the same character units for the limit, distance, and score: kanji
  // such as 𠮷 occupy two UTF-16 code units but count as one answer character.
  const answerChars = [...normalizeJapaneseDictation(answerValue)].slice(0, 500);
  const expectedChars = [...normalizeJapaneseDictation(expectedValue)].slice(0, 500);
  const answer = answerChars.join('');
  const expected = expectedChars.join('');
  const longest = Math.max(answerChars.length, expectedChars.length);
  const foldedAnswer = foldKana(answerChars);
  const foldedExpected = foldKana(expectedChars);
  const distance = editDistance(foldedAnswer, foldedExpected);
  return {
    exact: !!expected && foldedAnswer.join('') === foldedExpected.join(''),
    score: longest ? Math.max(0, Math.round((1 - distance / longest) * 100)) : 0,
    answer,
    expected,
  };
}

export interface DictationMark {
  text: string;
  /** True when the answer has no matching character for this run of the expected line. */
  missed: boolean;
}

/** Aligns the answer to the expected line and returns the expected line in runs, marking what was not heard. */
export function markMissedDictation(answerValue: string, expectedValue: string): DictationMark[] {
  const answer = foldKana([...normalizeJapaneseDictation(answerValue)].slice(0, 500));
  const expectedChars = [...normalizeJapaneseDictation(expectedValue)].slice(0, 500);
  const expected = foldKana(expectedChars);
  // Longest common subsequence; expected characters outside it are the missed ones.
  const width = expected.length + 1;
  const table = new Uint16Array((answer.length + 1) * width);
  for (let row = answer.length - 1; row >= 0; row -= 1) {
    for (let column = expected.length - 1; column >= 0; column -= 1) {
      table[row * width + column] = answer[row] === expected[column]
        ? table[(row + 1) * width + column + 1] + 1
        : Math.max(table[(row + 1) * width + column], table[row * width + column + 1]);
    }
  }
  const marks: DictationMark[] = [];
  const push = (text: string, missed: boolean): void => {
    const last = marks[marks.length - 1];
    if (last && last.missed === missed) last.text += text;
    else marks.push({ text, missed });
  };
  let row = 0;
  let column = 0;
  while (column < expected.length) {
    if (row < answer.length && answer[row] === expected[column]) {
      push(expectedChars[column], false);
      row += 1;
      column += 1;
    } else if (row < answer.length && table[(row + 1) * width + column] >= table[row * width + column + 1]) {
      row += 1;
    } else {
      push(expectedChars[column], true);
      column += 1;
    }
  }
  return marks;
}
