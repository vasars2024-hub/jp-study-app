/**
 * The Agent surface's 32px POINTER floor and its accent-as-text ground.
 *
 * Rubric category 1, driven live through the debug bridge against the real
 * `.agent-root` at 782x513, Full mode, on a two-message conversation:
 *
 *   belowFloorByHit   15 -> 3 -> 1 -> 0     stolen  0 -> 3 -> 1 -> 0
 *   contrast minRatio 4.15 (FAIL) -> 5.35   failing 1 -> 0
 *
 * `agentCompactKeyboardMotion.test.ts` already pins the WCAG 2.5.8 floor of
 * 24px, and that bar still passed on every run above. This file pins the higher
 * pointer floor the Liquid rubric scores, which is a different number reached a
 * different way, so the two contracts are asserted separately rather than one
 * being widened into the other.
 *
 * Four of the five rules are here because a shared expander could NOT be used,
 * and each names its own obstacle in the sheet. That distinction is the whole
 * content of the category: `liquid-controls.css` says the floor is a transparent
 * pointer region and NOT visual growth, so a rule that grows a control has to
 * have earned it against a measured neighbour or a replaced element.
 *
 * Source-level assertions for the same reason `agentCompactKeyboardMotion` gives:
 * a CSS geometry contract is not observable in jsdom. The two helpers are that
 * file's, deliberately unchanged.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
const AGENT_CSS = resolve(SRC, 'renderer/components/agent/agent.css');
const SHELL = resolve(SRC, 'renderer/components/agent/AgentWorkspaceShell.tsx');
const SUGGESTIONS = resolve(SRC, 'renderer/components/agent/AgentContextSuggestions.tsx');
const SUGGESTION_SETTINGS = resolve(
  SRC,
  'renderer/components/agent/AgentContextSuggestionSettings.tsx',
);

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
const suggestions = code(readFileSync(SUGGESTIONS, 'utf8'));
const suggestionSettings = code(readFileSync(SUGGESTION_SETTINGS, 'utf8'));

describe('the conversation header contains its own controls', () => {
  /**
   * The defect the rest of this file kept running into. `.agent-conversation`
   * is a column flex box, so the header is a flex ITEM with the default
   * `flex-shrink: 1`. The moment the transcript is taller than the canvas — the
   * ordinary case — the header is compressed while its children keep their
   * heights: measured 9px tall around a 38px control row, with the Delete
   * button and the view toggle painting 17px down over the first message.
   *
   * Every pointer measurement below is downstream of this. Two separate repairs
   * were attempted against the symptom first and both only moved the theft to a
   * different pair of controls.
   */
  it('refuses to shrink', () => {
    expect(block(css, '.agent-conversation-head')).toMatch(/flex:\s*0\s+0\s+auto;/);
  });
});

describe('the 32px pointer floor, by the route each control can actually take', () => {
  /**
   * Nine identical pin buttons, one container. The scope is the family answer
   * and it is what `liquid-controls.css` was written for.
   */
  it('scopes the rail list rather than tagging nine call sites', () => {
    expect(shell).toContain('<ul className="agent-rail-list lq-hit-scope"');
    expect(shell).toContain('<ul className="agent-rail-list agent-search-results lq-hit-scope"');
  });

  /**
   * A scope on a scrolling list is not enough on its own: the classic scrollbar
   * takes 10px off the right edge and the rows ended flush against it, so
   * `elementFromPoint` returned `.agent-rail-list` — the scrollbar — for every
   * column past the row's edge and all nine buttons read 30.49 of 32. Two
   * pixels of end padding is what lets the expander land, and no control
   * changes size.
   */
  it('leaves the rail list two pixels of gutter for the expander to land in', () => {
    const rail = block(css, '.agent-rail-list');
    expect(rail).toMatch(/overflow-y:\s*auto;/);
    expect(rail).toMatch(/padding:\s*0\s+2px\s+0\s+0;/);
  });

  /** The remaining scopes, each over a family in a container with no clipper. */
  it('scopes the card list and the two context regions', () => {
    expect(shell).toContain('<ul className="agent-cards lq-hit-scope"');
    expect(shell).toContain('<div className="agent-context-item-head lq-hit-scope"');
    expect(suggestions).toContain('<ul className="agent-context-suggestion-list lq-hit-scope"');
  });

  /**
   * `::after` generates no box on a replaced element, so a scope over a
   * `<select>` reads as landed and moves nothing. `.lq-check` on the `<label>`
   * that WRAPS it is the documented construction: label activation forwards the
   * click, so the expander is a real hit area without the select growing.
   */
  it('uses the label-wrapping form on both selects, never a scope', () => {
    expect(shell).toContain('<label className="agent-mode-picker lq-check"');
    // The second select left the strip when the explanation language became a
    // stored preference: the strip now PRINTS the language and the choice lives
    // in the settings panel. The construction has to follow it, or the control
    // simply loses its floor in its new home.
    expect(suggestions).not.toContain('<select');
    expect(suggestionSettings)
      .toContain('<label className="agent-context-suggestion-language-field lq-check"');
    expect(suggestionSettings).toContain('<select');
  });

  /**
   * The two controls that could not take an expander, and the reason is a
   * measured neighbour rather than a preference. Scoping `.agent-message-head`
   * took `stolen` from 0 to 3 with `worstShrunkBy: 7`, and scoping
   * `.agent-view-toggle` took the chip below it to 28.43 of 32. Both had to
   * take the floor on their own box, which grows the flow instead of overlaying
   * it — so neither may quietly go back to a scope.
   */
  it('floors the two neighbour-blocked controls on their own box', () => {
    expect(block(css, '.agent-message-branch')).toMatch(/min-height:\s*var\(--lq-hit-target\);/);
    expect(block(css, '.agent-view-toggle-button')).toMatch(/min-height:\s*var\(--lq-hit-target\);/);
    expect(shell).toContain('<div className="agent-view-toggle" role="group"');
    expect(shell).toContain('<div className="agent-message-head">');
  });
});

describe('the accent as TEXT is a different colour from the accent', () => {
  /**
   * Measured on the branch chip at 11px: the raw accent `#ff2e4d` on this
   * shell's own `--agent-surface-2` `#272433` is 4.19:1 against a 4.5 bar, and
   * category 1's contrast leg failed on exactly that node. Through the token it
   * reads 5.60.
   */
  it('states the text accent once, on the shell', () => {
    expect(block(css, '.agent-shell')).toMatch(
      /--agent-accent-text:\s*var\(--accent-text,\s*var\(--accent-2\)\);/,
    );
  });

  /**
   * The PREDICATE, not the three call sites — this is the half that survives.
   * On the Scraper surface the same defect had eleven more instances on pages
   * that the scored page never rendered, so a per-site assertion would have
   * banked a surface-wide failure as fixed. A fourth text rule added later
   * fails here rather than on one user's palette.
   *
   * `border-color` and `accent-color` are deliberately outside the predicate:
   * their bar is 3:1, which 4.19 already clears, so tinting them would be
   * damage rather than repair.
   */
  it('leaves no text rule painting the raw accent', () => {
    const lines = css.split('\n');
    const owners: string[] = [];
    let selector = '';
    for (const raw of lines) {
      const line = raw.trim();
      if (line.endsWith('{')) selector = line.slice(0, -1).trim();
      if (/^color:\s*var\(--agent-accent[,)]/.test(line)) owners.push(selector);
    }
    // The one exemption, named rather than regexed away. This button has no text
    // node — its content is an icon inheriting `currentColor` — so its bar is
    // 1.4.11's 3:1, which the raw accent clears at 4.19 on this ground. Tinting
    // it would weaken the only signal that a conversation is pinned. If this
    // rule ever gains a label, it belongs on the token and this list shrinks.
    expect(owners).toEqual(['.agent-icon-button.is-active']);
  });

  it('routes the three known text nodes through the token', () => {
    expect(block(css, '.agent-message-branch')).toMatch(/color:\s*var\(--agent-accent-text/);
    expect(block(css, '.agent-message-error')).toMatch(/color:\s*var\(--agent-accent-text/);
    expect(block(css, '.agent-card-action-error')).toMatch(/color:\s*var\(--agent-accent-text/);
  });
});
