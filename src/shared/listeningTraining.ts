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
    .replace(/[\s、。！？!?・「」『』（）()[\]【】〈〉《》…‥ー.,'":;：；]/gu, '');
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
  const answer = normalizeJapaneseDictation(answerValue).slice(0, 500);
  const expected = normalizeJapaneseDictation(expectedValue).slice(0, 500);
  const longest = Math.max(answer.length, expected.length);
  const distance = editDistance([...answer], [...expected]);
  return {
    exact: !!expected && answer === expected,
    score: longest ? Math.max(0, Math.round((1 - distance / longest) * 100)) : 0,
    answer,
    expected,
  };
}
