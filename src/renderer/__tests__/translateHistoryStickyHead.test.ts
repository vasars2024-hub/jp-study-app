/**
 * D12 — Translate ▸ History: the tabs and "Clear history" must stay reachable at the bottom of a
 * long history. The window body is the only scroller, so the fix is two sticky rows; measured live
 * 2026-09-23 on 60 entries: after 7,863px of scrolling both rows sit at the top of the body
 * (head 0–65px, actions 65–106px) and receive clicks. These pin the rules that make that true.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, (c) => `\\${c}`);
  const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  expect(match, `no rule for ${selector}`).toBeTruthy();
  return (match as RegExpExecArray)[1];
}

describe('Translate history keeps its controls reachable (D12)', () => {
  it('pins the tab row to the top of the window body', () => {
    const head = rule('.tr-view > .view-head');
    expect(head).toMatch(/position:\s*sticky/);
    expect(head).toMatch(/top:\s*-16px/);
    expect(head).toMatch(/background:\s*var\(--bg\)/);
  });

  it('pins "Clear history" directly under it', () => {
    const actions = rule('.tr-history > .tr-history-actions');
    expect(actions).toMatch(/position:\s*sticky/);
    expect(actions).toMatch(/top:\s*49px/);
    expect(actions).toMatch(/background:\s*var\(--bg\)/);
  });
});

describe('Resources keeps its filters and search reachable (D15)', () => {
  it('pins the whole command surface to the top of the window body', () => {
    const bar = rule('.res-view > .res-command-surface');
    expect(bar).toMatch(/position:\s*sticky/);
    expect(bar).toMatch(/top:\s*-16px/);
    expect(bar).toMatch(/background:\s*var\(--bg\)/);
  });
});
