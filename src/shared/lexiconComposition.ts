import type { LexiconInterlinearResult } from './lexiconInterlinear';

export type LexiconCompositionIssueKind = 'duplicate-function' | 'repeated-punctuation' | 'unclosed-pair' | 'unexpected-close';

export interface LexiconCompositionIssue {
  kind: LexiconCompositionIssueKind;
  start: number;
  end: number;
  text: string;
}

export interface LexiconCompositionCheck {
  analyzed: boolean;
  issues: LexiconCompositionIssue[];
}

const OPEN_TO_CLOSE: Readonly<Record<string, string>> = {
  '「': '」', '『': '』', '（': '）', '(': ')', '［': '］', '[': ']', '【': '】',
};
const CLOSE_TO_OPEN = new Map(Object.entries(OPEN_TO_CLOSE).map(([open, close]) => [close, open]));

/** Find only mechanical composition problems the grounded passage can prove. */
export function checkLexiconComposition(result: LexiconInterlinearResult): LexiconCompositionCheck {
  const issues: LexiconCompositionIssue[] = [];
  const stack: Array<{ char: string; start: number }> = [];

  for (let index = 0; index < result.text.length; index += 1) {
    const char = result.text[index];
    if (OPEN_TO_CLOSE[char]) {
      stack.push({ char, start: index });
      continue;
    }
    const expectedOpen = CLOSE_TO_OPEN.get(char);
    if (expectedOpen) {
      const last = stack.at(-1);
      if (last?.char === expectedOpen) stack.pop();
      else issues.push({ kind: 'unexpected-close', start: index, end: index + 1, text: char });
    }
  }
  for (const open of stack) {
    issues.push({ kind: 'unclosed-pair', start: open.start, end: open.start + 1, text: open.char });
  }

  for (const match of result.text.matchAll(/([。！？!?])\1+/gu)) {
    const start = match.index;
    issues.push({ kind: 'repeated-punctuation', start, end: start + match[0].length, text: match[0] });
  }

  const tokens = result.parts.filter((part) => part.kind === 'token');
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    if (previous.pos?.wordClass === 'function'
      && current.pos?.wordClass === 'function'
      && previous.text === current.text
      && result.text.slice(previous.end, current.start).trim() === '') {
      issues.push({
        kind: 'duplicate-function',
        start: previous.start,
        end: current.end,
        text: result.text.slice(previous.start, current.end),
      });
    }
  }

  issues.sort((a, b) => a.start - b.start || a.end - b.end || a.kind.localeCompare(b.kind));
  return { analyzed: tokens.some((part) => part.pos !== undefined), issues };
}
