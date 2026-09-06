import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `renderBlancTool` grew a third parameter and its only call site did not.
 *
 * `6b488974` (2026-08-31) wired Blanc's master search into the toolbox: it
 * added `grammarRequest` to `renderBlancTool`'s signature and forwarded it to
 * `<BlancGrammarPanel focusRequest={...} />`. The one call site inside
 * `BlancToolsPanel` kept passing two arguments, so `grammarRequest` was
 * `undefined` on every render for six days. `BlancGrammarPanel` only switches
 * to the Points mode and only tells `GrammarExplorer` which point to focus
 * `if (focusRequest)`, so a master-search hit on a grammar point opened the
 * Grammar tool at its default list instead of at the point the user clicked.
 *
 * JavaScript does not complain about a short call, which is why nothing caught
 * it: the argument simply arrives `undefined`. So the invariant is checked
 * here, generically — every call must supply every declared parameter, not
 * just the one that went missing this time. A future parameter added to this
 * function without touching the call sites fails the same assertion.
 *
 * The source is read with comments stripped so this prose cannot satisfy any
 * assertion below.
 */

const SHELL_PATH = resolve(__dirname, '../components/blanc/BlancShell.tsx');

/** Strip block and line comments so documentation can never satisfy a match. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** The names of `renderBlancTool`'s declared parameters, in order. */
function declaredParams(code: string): string[] {
  const match = code.match(/function renderBlancTool\(([\s\S]*?)\): JSX\.Element \{/);
  expect(match, 'renderBlancTool declaration not found').not.toBeNull();
  return (match?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // `onOpenBook: (item: LibraryItem) => void,` — take the name before the colon.
    .map((line) => line.slice(0, line.indexOf(':')).trim())
    .filter((name) => name.length > 0);
}

/** Every argument list `renderBlancTool` is actually called with. */
function callArgumentLists(code: string): string[][] {
  return [...code.matchAll(/renderBlancTool\(([^)]*)\)/g)]
    // The declaration itself opens with a newline; calls are on one line.
    .filter((match) => !match[0].includes('\n'))
    .map((match) =>
      match[1]
        .split(',')
        .map((arg) => arg.trim())
        .filter((arg) => arg.length > 0),
    );
}

describe('renderBlancTool is called with every parameter it declares', () => {
  const code = stripComments(readFileSync(SHELL_PATH, 'utf8'));

  it('declares the three parameters the toolbox threads through', () => {
    expect(declaredParams(code)).toEqual(['tool', 'onOpenBook', 'grammarRequest']);
  });

  it('is called at least once', () => {
    // A zero-length result would make the arity assertion below vacuous, which
    // is the shape that let the drift alarm report "Clean" for twelve days.
    expect(callArgumentLists(code).length).toBeGreaterThan(0);
  });

  it('passes an argument for every declared parameter at every call site', () => {
    const expected = declaredParams(code).length;
    for (const args of callArgumentLists(code)) {
      expect(args.length, `renderBlancTool(${args.join(', ')})`).toBe(expected);
    }
  });

  it('forwards the master-search grammar request, not a placeholder', () => {
    // The value has to be the prop the shell threads in; passing `null` or
    // `undefined` to satisfy the arity check would be the same defect wearing
    // an argument.
    for (const args of callArgumentLists(code)) {
      expect(args[2]).toBe('grammarRequest');
    }
  });
});
