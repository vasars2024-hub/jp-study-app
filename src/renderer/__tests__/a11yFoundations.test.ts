// @vitest-environment jsdom
/**
 * a11y2 — the foundations the surface audits rely on.
 *
 *  1. Windows contrast themes (forced-colors): system colours only, no blanket
 *     border on every button/tab/menu item/option, state shown as Highlight,
 *     and the drawings whose colour is the data opt out with an edge.
 *  2. The ARIA audit helper itself: each rule fires on markup built to break
 *     it, so a green surface audit cannot be a helper that checks nothing.
 *  3. Reduced motion reaches programmatic scrolling.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditAria } from './helpers/ariaAudit';
import { preferredScrollBehavior, prefersReducedScroll, scrollIntoViewReliably } from '../utils/reliableScroll';

const A11Y_CSS = readFileSync(resolve(__dirname, '..', 'theme', 'a11y.css'), 'utf8');

function forcedColorRules(): Rule[] {
  const rules: Rule[] = [];
  postcss.parse(A11Y_CSS).walkAtRules('media', (at: AtRule) => {
    if (!/forced-colors:\s*active/.test(at.params)) return;
    at.walkRules((rule) => {
      rules.push(rule);
    });
  });
  return rules;
}

const SYSTEM_COLORS = new Set([
  'canvas', 'canvastext', 'linktext', 'visitedtext', 'activetext', 'buttonface', 'buttontext',
  'buttonborder', 'field', 'fieldtext', 'highlight', 'highlighttext', 'selecteditem',
  'selecteditemtext', 'mark', 'marktext', 'graytext', 'accentcolor', 'accentcolortext',
]);

describe('forced-colors (Windows contrast themes)', () => {
  const rules = forcedColorRules();

  it('has a forced-colors block to check', () => {
    expect(rules.length).toBeGreaterThan(5);
  });

  it('never borders every button, tab, menu item or option', () => {
    // The old rule: `button, [role='button'], [role='tab'], [role='menuitem'], [role='option'] { border: … }`.
    const blanket = rules.filter((rule) => {
      const hasBorder = rule.nodes.some((n) => n.type === 'decl' && /^border(-width|-style)?$/.test(n.prop) && !/none|0\b/.test(n.value));
      if (!hasBorder) return false;
      return rule.selectors.some((s) => /^(button|\[role='(button|tab|menuitem|option)'\])$/.test(s.trim()));
    });
    expect(blanket.map((r) => r.selector)).toEqual([]);
  });

  it('paints only with system colours (or keeps authored colours where it opts out)', () => {
    const bad: string[] = [];
    for (const rule of rules) {
      rule.walkDecls((decl) => {
        if (!/color|background|border|outline/.test(decl.prop) || /forced-color-adjust/.test(decl.prop)) return;
        for (const word of decl.value.toLowerCase().match(/[a-z]+|#[0-9a-f]+|rgba?\(/g) ?? []) {
          if (word.startsWith('#') || word.startsWith('rgb')) bad.push(`${rule.selector} { ${decl.prop}: ${decl.value} }`);
          else if (/text|canvas|button|highlight|field|gray|link|mark/.test(word) && !SYSTEM_COLORS.has(word)) {
            bad.push(`${rule.selector} { ${decl.prop}: ${decl.value} }`);
          }
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('shows list, menu and tab state as Highlight with HighlightText', () => {
    const state = rules.find((r) => r.selector.includes("[aria-selected='true']") && r.selector.includes("'tab'"));
    expect(state, 'selected-state rule').toBeTruthy();
    const decls = Object.fromEntries((state?.nodes ?? []).filter((n) => n.type === 'decl').map((n) => [(n as { prop: string }).prop, (n as { value: string }).value]));
    expect(decls.background).toBe('Highlight');
    expect(decls.color).toBe('HighlightText');
  });

  it('keeps the colour of drawings whose colour is the data, with an edge', () => {
    const optOut = rules.filter((r) => r.nodes.some((n) => n.type === 'decl' && n.prop === 'forced-color-adjust' && n.value === 'none'));
    const selectors = optOut.flatMap((r) => r.selectors.map((s) => s.trim()));
    for (const must of ['.wgt-heat-cell', '.stats-heatmap-cell', '.os-theme-swatch-preview']) expect(selectors).toContain(must);
    const edged = rules.filter((r) => r.nodes.some((n) => n.type === 'decl' && n.prop === 'outline' && /CanvasText/.test(n.value)));
    expect(edged.flatMap((r) => r.selectors.map((s) => s.trim()))).toContain('.wgt-heat-cell');
  });

  it('no longer strips every shadow with !important (the UA already does, and it beat the opt-outs)', () => {
    expect(rules.some((r) => r.selector.trim() === '*' && /box-shadow:\s*none\s*!important/.test(r.toString()))).toBe(false);
  });
});

describe('the ARIA audit helper catches what it claims to', () => {
  function audit(html: string): string[] {
    document.body.innerHTML = `<div id="r">${html}</div>`;
    return auditAria(document.getElementById('r') as HTMLElement).map((f) => f.rule);
  }

  it.each([
    ['control-name', '<button></button>'],
    ['aria-required-attr', '<div role="slider" tabindex="0" aria-label="v"></div>'],
    ['aria-required-attr', '<div role="switch" tabindex="0" aria-label="v"></div>'],
    ['aria-required-parent', '<button role="tab">A</button>'],
    ['aria-required-parent', '<div role="option">A</div>'],
    ['aria-valid-attr-value', '<button aria-controls="nope">A</button>'],
    ['aria-valid-attr-value', '<div role="progressbar" aria-valuenow="140" aria-valuemin="0" aria-valuemax="100"></div>'],
    ['tabindex', '<button tabindex="3">A</button>'],
    ['nested-interactive', '<div role="button" tabindex="0" aria-label="outer"><button>inner</button></div>'],
    ['aria-hidden-focus', '<div aria-hidden="true"><button>hidden</button></div>'],
    ['image-alt', '<img src="x.png">'],
  ])('%s', (rule, html) => {
    expect(audit(html)).toContain(rule);
  });

  it('passes good markup', () => {
    expect(audit(`
      <div role="tablist" aria-label="Views"><button role="tab" aria-selected="true">A</button></div>
      <div role="listbox" aria-label="Pick"><div role="option" aria-selected="false">One</div></div>
      <label>Volume <input type="range" min="0" max="10" value="3"></label>
      <div role="slider" tabindex="0" aria-label="Level" aria-valuenow="3" aria-valuemin="0" aria-valuemax="10"></div>
      <label class="ui-toggle"><input type="checkbox" role="switch"> Sound</label>
      <img src="x.png" alt="">
    `)).toEqual([]);
  });
});

describe('reduced motion reaches programmatic scrolling', () => {
  afterEach(() => {
    document.documentElement.className = '';
    delete document.documentElement.dataset.motionMode;
    delete document.documentElement.dataset.displayAnim;
    document.body.innerHTML = '';
  });

  it('asks for smooth only when nothing asked for less motion', () => {
    expect(prefersReducedScroll()).toBe(false);
    expect(preferredScrollBehavior()).toBe('smooth');
    document.documentElement.classList.add('reduce-motion');
    expect(preferredScrollBehavior()).toBe('auto');
    document.documentElement.classList.remove('reduce-motion');
    document.documentElement.dataset.motionMode = 'disabled';
    expect(preferredScrollBehavior()).toBe('auto');
    delete document.documentElement.dataset.motionMode;
    document.documentElement.dataset.displayAnim = 'none';
    expect(preferredScrollBehavior()).toBe('auto');
  });

  it('jumps straight to a card under reduced motion', () => {
    document.documentElement.classList.add('reduce-motion');
    document.body.innerHTML = '<div id="card"></div>';
    const card = document.getElementById('card') as HTMLElement;
    const calls: unknown[] = [];
    card.scrollIntoView = vi.fn((arg?: unknown) => {
      calls.push(arg);
    }) as unknown as typeof card.scrollIntoView;
    scrollIntoViewReliably(card, { block: 'nearest' });
    expect(calls).toEqual([{ block: 'nearest' }]);
  });
});
