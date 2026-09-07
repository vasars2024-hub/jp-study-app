/**
 * App-wide companion to `desktopChromeButtonNames.test.ts`.
 *
 * That test states the rule and owns the two window-chrome files. This one applies the same
 * rule to **every** `.tsx` under `src/renderer` and `src/media`, because the defect was never
 * confined to chrome: measured 2026-09-07, the tree held **113 glyph-only buttons and 52 with
 * no accessible name** — 45 of them outside the two files any gate was reading.
 *
 * The rule, restated so this file stands alone: `title` does not name a button that has its
 * own text. In the accessible-name computation an element's contents outrank `title`, so
 * `title="Remove"` on a button reading `×` announces as `×` and the word survives only in the
 * tooltip, which a screen-reader user never hears and a keyboard user never opens.
 *
 * Two things make the widening real rather than cosmetic:
 *
 *  - **The population is derived, not listed.** A new glyph button in a file nobody thought of
 *    fails this test on arrival. A hardcoded path list is what let 45 sites accumulate.
 *  - **The parse is a real TSX parse.** The regex this repo used first took the first `>` after
 *    `<button`, which inside `onClick={() => …}` is the arrow's — so it silently skipped every
 *    button carrying a callback, including one in the file it *was* scanning
 *    (`DesktopShell.tsx`'s Remove-from-desktop). Switching parsers is what turned 45 findings
 *    into 52.
 *
 * `__devharness__` is excluded by name: it is developer scaffolding slated for deletion, and
 * `videoStudyHarness.tsx` is the single remaining offender in the tree. That exclusion is a
 * decision, not an oversight — if the harness ever ships, this line is the thing to delete.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const ROOTS = ['src/renderer', 'src/media'];
const SKIP_DIRS = new Set(['__tests__', '__devharness__', 'node_modules']);

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) tsxFiles(join(dir, entry.name), out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function stripComments(source: string): string {
  // Length-preserving, so reported line numbers match the file on disk. The repair's own
  // prose spells out `aria-label`, and a raw-text scan would count that prose as a label.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length));
}

/** Every `<button>` whose entire rendered child is one non-alphanumeric character. */
function unnamedGlyphButtons(file: string): { where: string; glyph: string; title: string }[] {
  const text = stripComments(readFileSync(file, 'utf8'));
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { where: string; glyph: string; title: string }[] = [];
  const rel = relative(REPO, file).split(sep).join('/');

  function visit(node: ts.Node): void {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'button') {
      const attrs = node.openingElement.attributes.getText(tree);
      const children = text.slice(node.openingElement.end, node.closingElement.pos).trim();
      const bare = /^[^\w\s]$/u.test(children);
      const ternary = /^\{[^}]*\?\s*'([^\w\s])'\s*:\s*'([^\w\s])'\s*\}$/u.exec(children);
      if ((bare || ternary) && !/\baria-label=/.test(attrs) && !/\baria-labelledby=/.test(attrs)) {
        const line = tree.getLineAndCharacterOfPosition(node.pos).line + 1;
        const title = /title=/.test(attrs) ? 'has a title, which cannot name it' : 'no words anywhere';
        out.push({ where: `${rel}:${line}`, glyph: bare ? children : `${ternary?.[1]}/${ternary?.[2]}`, title });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return out;
}

describe('every glyph-only button in the app announces itself', () => {
  const files = ROOTS.flatMap((r) => tsxFiles(resolve(REPO, r)));

  it('scans a real population, so the rule below is not vacuous', () => {
    expect(files.length).toBeGreaterThan(200);
    // A file known to render glyph buttons, so a parser regression cannot pass silently.
    expect(files.some((f) => f.endsWith(`widgets${sep}more.tsx`))).toBe(true);
    expect(files.some((f) => f.endsWith(`components${sep}MiniShell.tsx`))).toBe(true);
  });

  it('finds glyph-only buttons at all, so the parser is not returning nothing', () => {
    // Counted from the same parse: if this collapses, the parser broke, not the product.
    const named = files.flatMap((f) => {
      const text = stripComments(readFileSync(f, 'utf8'));
      const tree = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let n = 0;
      const visit = (node: ts.Node): void => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'button') {
          const children = text.slice(node.openingElement.end, node.closingElement.pos).trim();
          if (/^[^\w\s]$/u.test(children)) n++;
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
      return n ? [n] : [];
    });
    expect(named.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(80);
  }, 120_000);

  it('gives every one of them an aria-label, because its text cannot name it', () => {
    const unnamed = files.flatMap(unnamedGlyphButtons);
    expect(unnamed.map((b) => `${b.where}  ${b.glyph}  (${b.title})`)).toEqual([]);
  }, 120_000);
});
