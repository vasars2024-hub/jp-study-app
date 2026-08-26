/**
 * Rubric category 4 — the Reading Finder has to reflow to its own PANE, not to the window.
 *
 * Measured live 2026-08-26 through the category-4 harness. At the Reading Finder's shipped
 * 820x580, `nav.reading-workspace-nav` reported `scrollWidth` 784 against `clientWidth` 782: eight
 * tabs at `flex: 0 0 auto` measured two pixels wider than their own box, so the whole strip grew a
 * horizontal scrollbar at the window's DEFAULT size, and a tab was pushed out of reach with no
 * affordance saying it was there. At the compact leg the same strip read 784 against 222.
 *
 * The narrow rules that would have prevented it existed the whole time, in a
 * `@media (max-width: 680px)`. That instrument asks the DESKTOP: this workspace renders inside a
 * floating window, so at an 820px pane inside a 1264px viewport the query never fired, and at a
 * 260px pane it still did not. Exactly the defect `visualNovelPaneReflow.test.ts` was written for,
 * in a second sheet, which is why the guard is on the general FORM rather than on the two
 * selectors that happened to carry it here.
 *
 * jsdom does not lay out and knows nothing of container queries, so the numbers that scored this
 * are the live ones in `L1_USE_OF_SPACE.md`. What is guarded here is the instrument.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(__dirname, '../views/readingWorkspace.css'), 'utf8');
/** Comments carry the prose that explains the defect; they must never satisfy a selector match. */
const BARE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Body of the at-rule starting at `from`, brace-matched rather than regex-spanned. */
function atRuleBody(css: string, from: number): string {
  let depth = 0;
  for (let i = css.indexOf('{', from); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(from, i + 1);
    }
  }
  return css.slice(from);
}

function bodiesOf(css: string, re: RegExp): string[] {
  const out: string[] = [];
  const scan = new RegExp(re.source, 'g');
  let m = scan.exec(css);
  while (m) {
    out.push(atRuleBody(css, m.index));
    m = scan.exec(css);
  }
  return out;
}

describe('the Reading Finder reflows to its own pane', () => {
  it('declares itself a query container so the narrow rules can ask the pane', () => {
    const root = /\.reading-workspace\s*\{[^}]*\}/.exec(BARE);
    expect(root, '.reading-workspace rule set not found').not.toBeNull();
    expect(root![0]).toMatch(/container-type:\s*inline-size/);
    expect(root![0]).toMatch(/container-name:\s*rfwork/);
  });

  it('keeps the block axis free, because the tab strip wraps and must be able to grow', () => {
    const root = /\.reading-workspace\s*\{[^}]*\}/.exec(BARE)![0];
    expect(root).not.toMatch(/container-type:\s*size\s*;/);
  });

  it('reflows no reading-workspace selector on a viewport width', () => {
    const offenders = bodiesOf(BARE, /@media[^{]*\(\s*(?:max|min)-(?:width|inline-size)/)
      .filter((body) => /\.reading-workspace/.test(body));
    expect(
      offenders,
      'a viewport @media describes the desktop, not this pane; use @container rfwork',
    ).toEqual([]);
  });

  it('has at least one container query that actually names this container', () => {
    const bodies = bodiesOf(BARE, /@container\s+rfwork[^{]*\{/);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.join('\n')).toMatch(/\.reading-workspace-nav/);
  });

  it('lets the tabs shrink instead of forcing the strip to scroll', () => {
    const tab = /\.reading-workspace-tab\s*\{[^}]*\}/.exec(BARE);
    expect(tab, '.reading-workspace-tab rule set not found').not.toBeNull();
    // `0 0 auto` is what measured 784 in a 782 box.
    expect(tab![0]).not.toMatch(/flex:\s*0\s+0\s+auto/);
    expect(tab![0]).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(tab![0]).toMatch(/min-width:\s*0/);
  });

  it('truncates the label rather than the tab, so the accessible name survives', () => {
    const label = /\.reading-workspace-tab\s*>\s*span\s*\{[^}]*\}/.exec(BARE);
    expect(label, '.reading-workspace-tab > span rule set not found').not.toBeNull();
    expect(label![0]).toMatch(/text-overflow:\s*ellipsis/);
    expect(label![0]).toMatch(/white-space:\s*nowrap/);
  });

  it('wraps the strip at a narrow pane rather than scrolling a tab out of reach', () => {
    const narrow = bodiesOf(BARE, /@container\s+rfwork[^{]*\(\s*max-width/).join('\n');
    expect(narrow).toMatch(/flex-wrap:\s*wrap/);
  });
});
