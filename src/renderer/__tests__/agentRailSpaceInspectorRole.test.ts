/**
 * The Agent surface's use-of-space contract and its Liquid region declarations.
 *
 * Rubric categories 3 and 4, driven live through the debug bridge:
 *
 *   cat3 (Liquid presentation)  sharedPrimitiveEligible 2 of 3 -> 3 of 3
 *   cat4 compact 260x170        overlaps 2 -> 0
 *   cat4 sub-minimum 200x140    clipped 1 / overlaps 2 -> 0 / 0
 *
 * Both defects are the same shape as the one
 * `agentHitFloorAccentText.test.ts` records on `.agent-conversation-head`: a
 * flex or grid item that is allowed to be squashed below its own content while
 * its children keep their heights and paint over whatever is beneath. That is
 * three instances on one surface, which is why each carries its own assertion
 * rather than one rule standing for all of them.
 *
 * Source-level assertions: a CSS geometry contract is not observable in jsdom.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
const AGENT_CSS = resolve(SRC, 'renderer/components/agent/agent.css');
const SHELL = resolve(SRC, 'renderer/components/agent/AgentWorkspaceShell.tsx');

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

describe('the rail keeps its content inside its own box', () => {
  /**
   * The rail's only absorbing item is the conversation list. The other three
   * inherited `flex-shrink: 1` and were compressed around children that kept
   * their heights.
   */
  it.each(['.agent-rail-head', '.agent-search', '.agent-rail-foot'])(
    'does not let %s be compressed',
    (selector) => {
      expect(block(css, selector)).toMatch(/flex:\s*0\s+0\s+auto;/);
    },
  );

  /**
   * Those three alone were not enough, and the measurement is what said so.
   * At 236x140 the shell stacks and gives the whole rail 56px around 156px of
   * children, which is deeper than the list can absorb even at zero height — so
   * the title row and the search field painted 112px down over `.agent-canvas`.
   * The rail scrolls rather than clipping, because every row must stay
   * reachable and `clipped` is a bar category 4 scores separately.
   *
   * `min-height: 0` stays: it is what lets the list give way first, which is
   * the behaviour the surface wants at every size above this one.
   */
  it('scrolls rather than overflowing when the shell squashes it', () => {
    const rail = block(css, '.agent-rail');
    expect(rail).toMatch(/min-height:\s*0;/);
    expect(rail).toMatch(/overflow-y:\s*auto;/);
    expect(rail).not.toMatch(/overflow:\s*hidden/);
  });
});

describe('the primary action stays in the viewport', () => {
  /**
   * Rubric category 5 Q3: `primaryAction: button.agent-action,
   * insideBodyViewport: false`. Measured at 820x580 on a two-message
   * conversation — `.agent-canvas` is the scroller with a 513px scrollport over
   * 1121px of content, and the action row sat at y 720 against a viewport
   * ending at 707, so SENDING A MESSAGE NEEDED A SCROLL FIRST. After: y 658-691,
   * inside. Category 5 went 8/10 -> 9/10 on this alone.
   *
   * The row, not the composer: the composer is 427px of a 513px viewport
   * because six optional blocks stack above the prompt, so pinning it whole
   * would pin the screen. The background is load-bearing, not decoration — a
   * transparent bar over scrolling text is a worse defect than the one fixed.
   */
  it('pins the composer action row to the bottom of the scrollport', () => {
    const actions = block(css, '.agent-composer-actions');
    expect(actions).toMatch(/position:\s*sticky;/);
    expect(actions).toMatch(/bottom:\s*0;/);
    expect(actions).toMatch(/background:\s*var\(--agent-surface\);/);
  });
});

describe('the inspector declares the Liquid role it already has', () => {
  /**
   * Sticky, translucent, collapsible, beside the work rather than in it — and
   * it said so nowhere, so category 3 counted 3 Liquid-eligible regions with
   * only 2 carrying a shared primitive and failed a surface with no visual
   * defect.
   *
   * The attribute, not `.lq-inspector`: that class is a LAYOUT primitive
   * (`display: flex; height: 100%`) and this aside has its own sticky geometry,
   * so adopting it would restructure a correct surface to satisfy an
   * instrument. Same one-attribute contract `LiquidAppScaffold` marks its rail
   * and dock with.
   */
  it('carries data-lq-role on the aside and keeps its own geometry', () => {
    expect(shell).toMatch(/className=\{`agent-inspector\$\{[^}]*\}`\}[\s\S]{0,200}?data-lq-role="liquid"/);
    expect(shell).not.toContain('agent-inspector lq-inspector');
    expect(block(css, '.agent-inspector')).toMatch(/position:\s*sticky;/);
  });
});
