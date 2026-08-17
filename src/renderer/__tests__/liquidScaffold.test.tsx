// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LIQUID_BREAKPOINTS,
  LIQUID_WIDTH_CLASSES,
  LiquidAppScaffold,
  widthClassFor,
} from '../components/liquid/LiquidAppScaffold';

/**
 * L2's third gate. The scaffold's three promises, each of which is a way this
 * plan's non-negotiables get lost quietly:
 *   - an absent slot renders NOTHING (§ honest states: chrome that exists
 *     because the grid always draws it);
 *   - DOM order is keyboard order at every width (§2.4: a reflow must not
 *     reorder the tab ring);
 *   - a slot squeezed out of the spine is MOVED, never deleted (§2.2).
 */

const CSS = readFileSync(resolve(__dirname, '..', 'theme', 'liquid-scaffold.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function render(node: ReactNode): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(node);
  });
  return host;
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

const SLOTS = {
  rail: <button type="button">rail item</button>,
  toolbar: <button type="button">toolbar item</button>,
  inspector: <button type="button">inspector item</button>,
  dock: <button type="button">dock item</button>,
};

describe('liquid scaffold — width contract', () => {
  it('maps a width to exactly one class, at the documented thresholds', () => {
    expect(widthClassFor(0)).toBe('compact');
    expect(widthClassFor(LIQUID_BREAKPOINTS.medium - 1)).toBe('compact');
    expect(widthClassFor(LIQUID_BREAKPOINTS.medium)).toBe('medium');
    expect(widthClassFor(LIQUID_BREAKPOINTS.wide - 1)).toBe('medium');
    expect(widthClassFor(LIQUID_BREAKPOINTS.wide)).toBe('wide');
    expect(widthClassFor(4096)).toBe('wide');
    expect(LIQUID_WIDTH_CLASSES).toEqual(['compact', 'medium', 'wide']);
  });

  it('collapses the rail at medium and drops it from the spine at compact', () => {
    for (const [width, hasRail, collapsed] of [
      ['wide', 'true', undefined],
      ['medium', 'true', 'true'],
      ['compact', undefined, undefined],
    ] as const) {
      const container = render(
        <LiquidAppScaffold widthClass={width} rail={SLOTS.rail} railLabel="Sections">
          body
        </LiquidAppScaffold>,
      );
      const el = container.querySelector('.lq-scaffold')!;
      expect(el.getAttribute('data-width'), width).toBe(width);
      expect(el.getAttribute('data-has-rail') ?? undefined, width).toBe(hasRail);
      expect(el.getAttribute('data-rail-collapsed') ?? undefined, width).toBe(collapsed);
      act(() => root!.unmount());
      host!.remove();
      root = null;
    }
  });
});

describe('liquid scaffold — an absent slot renders nothing', () => {
  it('draws only the canvas when nothing else is given', () => {
    const container = render(<LiquidAppScaffold widthClass="wide">work</LiquidAppScaffold>);
    const el = container.querySelector('.lq-scaffold')!;
    expect(container.querySelector('.lq-scaffold-canvas')!.textContent).toBe('work');
    for (const slot of ['rail', 'toolbar', 'inspector', 'dock']) {
      expect(container.querySelector(`.lq-scaffold-${slot}`), `${slot} drawn empty`).toBeNull();
      expect(el.hasAttribute(`data-has-${slot}`), `data-has-${slot} set`).toBe(false);
    }
  });

  it('gives an absent slot no grid track', () => {
    // The geometry half of the same promise: the baseline template is a single
    // canvas cell, and each track arrives with its own `data-has-*` rule.
    const base = /\.lq-scaffold\s*\{([^}]*)\}/.exec(CSS)![1];
    expect(base).toMatch(/grid-template-areas:\s*'canvas'/);
    expect(base).not.toMatch(/rail|inspector|toolbar|dock/);
    for (const slot of ['rail', 'inspector', 'toolbar', 'dock']) {
      expect(CSS, `no rule adds a ${slot} track`).toContain(`[data-has-${slot}='true']`);
    }
  });

  it('marks each present slot on the scaffold', () => {
    const container = render(
      <LiquidAppScaffold widthClass="wide" {...SLOTS} railLabel="R" inspectorLabel="I">
        work
      </LiquidAppScaffold>,
    );
    const el = container.querySelector('.lq-scaffold')!;
    for (const slot of ['rail', 'toolbar', 'inspector', 'dock']) {
      expect(el.getAttribute(`data-has-${slot}`), slot).toBe('true');
      expect(container.querySelector(`.lq-scaffold-${slot}`), slot).not.toBeNull();
    }
  });
});

describe('liquid scaffold — keyboard order survives every reflow', () => {
  it('keeps toolbar, rail, canvas, inspector, dock in DOM order at every width', () => {
    for (const width of LIQUID_WIDTH_CLASSES) {
      const container = render(
        <LiquidAppScaffold widthClass={width} {...SLOTS} railLabel="R" inspectorLabel="I">
          <button type="button">canvas item</button>
        </LiquidAppScaffold>,
      );
      const labels = [...container.querySelectorAll('button')].map((b) => b.textContent);
      const expected =
        width === 'compact'
          ? ['toolbar item', 'canvas item', 'inspector item', 'dock item']
          : ['toolbar item', 'rail item', 'canvas item', 'inspector item', 'dock item'];
      expect(labels, `tab order at ${width}`).toEqual(expected);
      act(() => root!.unmount());
      host!.remove();
      root = null;
    }
  });

  it('never sets a tabindex, so the ring is the document order', () => {
    const container = render(
      <LiquidAppScaffold widthClass="wide" {...SLOTS} railLabel="R" inspectorLabel="I">
        work
      </LiquidAppScaffold>,
    );
    const chrome = [...container.querySelectorAll('[class^="lq-scaffold-"]')];
    expect(chrome.length).toBe(5);
    for (const el of chrome) expect(el.hasAttribute('tabindex'), el.className).toBe(false);
  });

  it('puts the rail and inspector in named landmarks', () => {
    const container = render(
      <LiquidAppScaffold
        widthClass="wide"
        rail={SLOTS.rail}
        inspector={SLOTS.inspector}
        railLabel="Sections"
        inspectorLabel="Details"
      >
        work
      </LiquidAppScaffold>,
    );
    const nav = container.querySelector('nav.lq-scaffold-rail')!;
    const aside = container.querySelector('aside.lq-scaffold-inspector')!;
    expect(nav.getAttribute('aria-label')).toBe('Sections');
    expect(aside.getAttribute('aria-label')).toBe('Details');
  });
});

describe('liquid scaffold — compact moves the inspector, it does not delete it', () => {
  it('still renders the inspector and its controls at compact', () => {
    const container = render(
      <LiquidAppScaffold widthClass="compact" inspector={SLOTS.inspector} inspectorLabel="Details">
        work
      </LiquidAppScaffold>,
    );
    const aside = container.querySelector('aside.lq-scaffold-inspector');
    expect(aside, '§2.2 — a narrow window is not a reason to delete a feature').not.toBeNull();
    expect(aside!.textContent).toBe('inspector item');
  });

  it('reflows the compact inspector below the canvas rather than beside it', () => {
    const rule = new RegExp(
      `\\.lq-scaffold\\[data-width='compact'\\]\\[data-has-inspector='true'\\]\\s*\\{([^}]*)\\}`,
    ).exec(CSS);
    expect(rule, 'no compact inspector reflow rule').not.toBeNull();
    expect(rule![1]).toMatch(/grid-template-areas:\s*\n?\s*'canvas'\s*\n?\s*'inspector'/);
    expect(rule![1]).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it('caps the compact inspector on its row track, not on the item', () => {
    // Measured in the running app: `max-height: 40%` on the item resolved
    // against its own 19px row and rendered an 8px-tall inspector. A cap only
    // means "at most 40% of the panel" when it is on the row.
    expect(CSS).not.toMatch(/\.lq-scaffold-inspector\s*\{[^}]*max-height/);
    const compactRows = [
      ...CSS.matchAll(
        /\.lq-scaffold\[data-width='compact'\][^{]*\[data-has-inspector='true'\]\s*\{([^}]*)\}/g,
      ),
    ].map((m) => m[1]);
    expect(compactRows.length).toBe(4);
    for (const body of compactRows) {
      expect(body, `compact inspector row uncapped:
${body}`).toMatch(
        /grid-template-rows:[^;]*minmax\(0, 40%\)/,
      );
    }
  });
});

describe('liquid scaffold — the sheet stays inside the namespace and the tokens', () => {
  it('anchors every selector on .lq-scaffold', () => {
    const selectors = [...CSS.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim().replace(/\s+/g, ' '))
      .filter((s) => s && !s.startsWith('@'))
      .flatMap((s) => s.split(',').map((p) => p.trim()));
    expect(selectors.length).toBeGreaterThan(10);
    const foreign = selectors.filter((s) => !s.startsWith('.lq-scaffold'));
    expect(foreign, `would restyle outside the scaffold:\n${foreign.join('\n')}`).toEqual([]);
  });

  it('sizes every track from a --lq-* token and hardcodes no colour', () => {
    const literals = [...CSS.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab)\s*\(/gi)].map(
      (m) => m[0],
    );
    expect(literals, `plan §8 — not one palette:\n${literals.join('\n')}`).toEqual([]);
    for (const token of [
      '--lq-rail-width',
      '--lq-rail-width-collapsed',
      '--lq-inspector-width',
      '--lq-dock-height',
      '--lq-toolbar-height',
    ]) {
      expect(CSS, `${token} unused — a track was sized by hand`).toContain(`var(${token})`);
    }
    // The "contains" check above is not enough on its own: a rule that swaps
    // `var(--lq-rail-width)` for a literal `232px` still leaves the token
    // present in a sibling rule and passes. So forbid raw px in a track or a
    // slot dimension outright. (Verified: this is exactly what a mutation of
    // one such rule slipped past before this assertion existed.)
    const sized = [
      ...CSS.matchAll(/(grid-template-(?:columns|rows)|min-height|max-height|width)\s*:\s*([^;]+)/g),
    ];
    expect(sized.length).toBeGreaterThan(10);
    const handSized = sized
      .filter(([, , value]) => /\d+px/.test(value))
      .map(([, prop, value]) => `${prop}: ${value.trim()}`);
    expect(
      handSized,
      `a geometry value that no shell can remap:\n${handSized.join('\n')}`,
    ).toEqual([]);
    const tokens = readFileSync(resolve(__dirname, '..', 'theme', 'liquid-tokens.css'), 'utf8');
    const declared = new Set([...tokens.matchAll(/(--lq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const unresolved = [...CSS.matchAll(/var\(\s*(--lq-[a-z0-9-]+)/g)]
      .map((m) => m[1])
      .filter((name) => !declared.has(name));
    expect([...new Set(unresolved)]).toEqual([]);
  });
});
