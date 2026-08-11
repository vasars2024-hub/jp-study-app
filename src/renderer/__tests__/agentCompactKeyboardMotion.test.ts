/**
 * The Agent surface's compact-width, keyboard and reduced-motion contract.
 *
 * ## What was measured, and what these rules replaced
 *
 * Driven live through the debug bridge against the real `.agent-root` container
 * (a container query, so the width was driven on the container itself rather
 * than by resizing a window, which would have rewritten `desktop-layout.json`).
 * Widths 1084 -> 320, Full mode, every disclosure expanded:
 *
 *   horizontal overflow      none at any width, before or after
 *   focus-ring coverage      all 57 focusables, via html[data-display-focus]
 *   target size              THREE controls under the 24px floor at every width
 *   focus order              inspector rendered above the conversation at
 *                            <=980, but second in the DOM -> 330 pairs where a
 *                            later-in-DOM control was painted entirely above an
 *                            earlier one
 *
 * The 330 is a positive control, not a description: re-applying the deleted
 * `grid-row` pair as inline style reproduced exactly 330 at both 900px and
 * 500px and removing it returned 0, so the number is the defect's signature.
 * At >=1000 the same metric reports 77-81, and every one of those is a pair
 * split across the two side-by-side columns — restricted to within-column
 * pairs it is 0 there too, which is why the wide layout was left alone.
 *
 * Source-level assertions on purpose: a CSS geometry contract is not observable
 * in jsdom, which is the same reason `videoStudyLayout.test.ts` reads its CSS as
 * text. The helpers below are that file's, deliberately unchanged.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
const AGENT_CSS = resolve(SRC, 'renderer/components/agent/agent.css');
const SHELL = resolve(SRC, 'renderer/components/agent/AgentWorkspaceShell.tsx');
const TERMINAL = resolve(SRC, 'renderer/components/agent/AgentPipelineTerminal.tsx');

/**
 * Comments out before any source sweep.
 *
 * Load-bearing here rather than tidy: every rule this file asserts carries a
 * comment quoting the defect it replaced, and those comments name `grid-row`,
 * `display: flex` and the old pixel sizes. A raw substring search reads each
 * explanation as the thing it warns about.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/** The declarations of one rule, by exact selector. Brace-counted, not regexed. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `no rule for \`${selector}\``).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated rule for \`${selector}\``);
}

const css = code(readFileSync(AGENT_CSS, 'utf8'));
const shell = code(readFileSync(SHELL, 'utf8'));
const terminal = code(readFileSync(TERMINAL, 'utf8'));

const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';
const NARROW = '@container (max-width: 980px)';

describe('target size: nothing on this surface is under the 24px floor', () => {
  it('states the floor once, as a token on the shell', () => {
    expect(block(css, '.agent-shell')).toMatch(/--agent-hit-min:\s*24px;/);
  });

  /**
   * The three that were under it, with the box each one measured before the
   * fix. They are asserted through the token rather than a literal so that
   * moving the floor moves all three.
   */
  const undersized: ReadonlyArray<readonly [string, string]> = [
    ['.agent-mode-select', '94x19'],
    ['.agent-execution-limits summary', '116x20'],
    ['.agent-plan-details summary', '43x18'],
  ];

  for (const [selector, was] of undersized) {
    it(`floors \`${selector}\`, which measured ${was}`, () => {
      expect(block(css, selector)).toMatch(/min-height:\s*var\(--agent-hit-min,\s*24px\);/);
    });
  }

  /**
   * The two summaries carry no chevron of their own, so they render the UA
   * disclosure triangle — which only exists while the element stays a
   * list-item. Blockifying them to centre the label would have taken away the
   * only affordance that the row expands, and it is the obvious way to
   * "improve" these rules later.
   */
  for (const selector of ['.agent-execution-limits summary', '.agent-plan-details summary']) {
    it(`keeps the disclosure marker on \`${selector}\``, () => {
      expect(block(css, selector)).not.toMatch(/display:\s*(flex|block|grid|inline-flex)/);
    });
  }
});

describe('focus order: rendered order follows the DOM at every width', () => {
  /**
   * The whole finding, as one assertion. `.agent-inspector` follows
   * `.agent-conversation-main` in the DOM, so any `grid-row` in the stacking
   * block can only re-order the two against the focus order — there is no
   * third item to shuffle.
   */
  it('never re-orders the stacked workspace with grid-row', () => {
    expect(block(css, NARROW)).not.toMatch(/grid-row/);
  });

  it('still stacks, and still un-sticks the inspector, at that width', () => {
    const narrow = block(css, NARROW);
    expect(narrow).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(narrow).toMatch(/position:\s*static;/);
  });

  it('keeps the inspector after the conversation in the DOM', () => {
    const main = shell.indexOf('className="agent-conversation-main"');
    // Built from a template literal, so match the opening backtick form.
    const inspector = shell.indexOf('className={`agent-inspector$');
    expect(main, 'agent-conversation-main not found').toBeGreaterThan(-1);
    expect(inspector, 'agent-inspector not found').toBeGreaterThan(-1);
    expect(inspector).toBeGreaterThan(main);
  });
});

describe('reduced motion: every transition on the surface collapses', () => {
  /**
   * Not a count — the set. A new animated control added to this stylesheet
   * without a line in the reduced-motion block fails here, which is the only
   * thing that keeps that block from going stale as the surface grows.
   */
  it('covers every selector that declares a transition', () => {
    const reduced = block(css, REDUCED_MOTION);
    const covered = new Set(reduced.match(/\.[a-z0-9-]+/g) ?? []);

    const withoutReduced = css.replace(`${REDUCED_MOTION} {${reduced}}`, '');
    const declaring: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    for (const [, selector, body] of withoutReduced.matchAll(pattern)) {
      if (!/\btransition:/.test(body)) continue;
      declaring.push(selector.trim());
    }

    expect(declaring.length, 'no transitions found — the sweep broke').toBeGreaterThan(0);
    for (const selector of declaring) {
      const classes = selector.match(/\.[a-z0-9-]+/g) ?? [];
      const anyCovered = classes.some((c) => covered.has(c));
      expect(anyCovered, `\`${selector}\` transitions but is not in ${REDUCED_MOTION}`).toBe(true);
    }
  });

  /**
   * The chevron hard-coded `140ms` while the other two read the token, so it
   * was the one thing here that ignored the motion-velocity slider.
   */
  it('times the chevron from the motion token, not a literal', () => {
    const chevron = block(css, '.agent-inspector-chevron');
    expect(chevron).toMatch(/transition:\s*transform\s+var\(--dur-fast,\s*140ms\)/);
    expect(chevron).not.toMatch(/transition:[^;]*\s140ms\s/);
  });

  /** Programmatic scrolling is motion too, and it is invisible to the CSS above. */
  it('never scrolls this surface smoothly', () => {
    for (const [name, source] of [['shell', shell], ['terminal', terminal]] as const) {
      for (const [, options] of source.matchAll(/scrollIntoView\(([^)]*)\)/g)) {
        expect(options, `${name} scrolls smoothly`).not.toMatch(/smooth/);
      }
    }
    expect(shell).toMatch(/scrollIntoView\(/);
    expect(terminal).toMatch(/scrollIntoView\(/);
  });
});
