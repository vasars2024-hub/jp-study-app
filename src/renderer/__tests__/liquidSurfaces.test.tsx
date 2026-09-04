// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AmbientSurface,
  AnchorSurface,
  ContextualSurface,
  LIQUID_SURFACE_ROLES,
  LiquidSurface,
  WorkSurface,
} from '../components/liquid/LiquidSurface';

/**
 * L2's second gate. `liquidTokens.test.ts` proved the token sheet cannot paint;
 * this sheet CAN, so the equivalent guarantee has to be argued differently:
 * every selector lives in the `lq-` namespace nothing else in the app uses, and
 * every value it paints with comes from a `--lq-*` token rather than a literal.
 *
 * Then the role invariants that a stylesheet alone cannot hold — an anchor that
 * never blurs, an ambient surface that is never a carrier.
 */

const CSS = readFileSync(
  resolve(__dirname, '..', 'theme', 'liquid-surfaces.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

type Block = { selector: string; declarations: string };
function parseBlocks(source: string): Block[] {
  const out: Block[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, declarations: m[2] });
  }
  return out;
}
const blocks = parseBlocks(CSS);

/**
 * Split a selector list on TOP-LEVEL commas only. `:where(button, a[href])` is
 * one selector; a naive `split(',')` reports `a[href]` as an unnamespaced rule
 * and the invariant below fails on correct CSS.
 */
function splitSelectorList(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selector) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Minimal render harness — this repo's renderer tests use createRoot directly. */
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

describe('liquid surface primitives — the sheet stays inside its namespace', () => {
  it('read a sheet that actually declares the four roles', () => {
    expect(blocks.length).toBeGreaterThan(5);
    for (const role of LIQUID_SURFACE_ROLES) {
      expect(CSS, `role ${role} has no rule`).toContain(`.lq-${role}`);
    }
  });

  it('anchors every selector on an .lq- class', () => {
    // A compound like `.lq-anchor :focus-visible` is fine — it is still scoped
    // inside a primitive. A bare `button` or `.panel` is not.
    const foreign = blocks
      .flatMap((b) => splitSelectorList(b.selector))
      .filter((s) => !s.startsWith('.lq-'));
    // Sanity: the splitter did not collapse the list to nothing.
    expect(blocks.flatMap((b) => splitSelectorList(b.selector)).length).toBeGreaterThan(8);
    expect(
      foreign,
      `these would restyle elements outside a Liquid primitive:\n${foreign.join('\n')}`,
    ).toEqual([]);
  });

  it('paints only through --lq-* tokens and shell vars, never a literal colour', () => {
    const literals = [...CSS.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab)\s*\(/gi)].map(
      (m) => m[0],
    );
    expect(
      literals,
      `plan §8 — never hardcode one shell's palette:\n${literals.join('\n')}`,
    ).toEqual([]);
  });

  it('reads no token that liquid-tokens.css does not declare', () => {
    const tokens = readFileSync(resolve(__dirname, '..', 'theme', 'liquid-tokens.css'), 'utf8');
    const declared = new Set([...tokens.matchAll(/(--lq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    expect(declared.size).toBeGreaterThan(40);
    const unresolved = [...CSS.matchAll(/var\(\s*(--lq-[a-z0-9-]+)/g)]
      .map((m) => m[1])
      .filter((name) => !declared.has(name));
    expect(
      [...new Set(unresolved)],
      `a var() nothing declares renders empty — invisible until it ships:\n${unresolved.join('\n')}`,
    ).toEqual([]);
  });
});

describe('liquid surface primitives — the role invariants', () => {
  it('never gives anchor or work a backdrop-filter', () => {
    const offenders = blocks
      .filter((b) => /\.lq-(anchor|work)\b/.test(b.selector))
      .filter((b) => /backdrop-filter\s*:/i.test(b.declarations))
      .map((b) => b.selector);
    expect(
      offenders,
      `plan §2.3 — reading, editing, forms, tables and logs stay opaque:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the liquid role translucent through tokens, not a fixed blur', () => {
    const liquidRule = blocks.find((b) => b.selector === '.lq-liquid');
    expect(liquidRule).toBeDefined();
    expect(liquidRule!.declarations).toMatch(/backdrop-filter\s*:[^;]*var\(--lq-liquid-blur\)/);
    // A literal px blur here is how high-contrast and the battery tier lose
    // their flattening: the token is overridden and the rule ignores it.
    expect(liquidRule!.declarations).not.toMatch(/backdrop-filter\s*:\s*blur\(\s*\d/);
  });

  it('drives every animated displacement through --lq-motion-scale', () => {
    const transforms = [...CSS.matchAll(/transform\s*:\s*([^;]+)/g)].map((m) => m[1].trim());
    expect(transforms.length).toBeGreaterThan(0);
    for (const value of transforms) {
      expect(value, `reduced motion cannot switch off "${value}"`).toContain('--lq-motion-scale');
    }
  });
});

describe('liquid surface primitives — rendered behaviour', () => {
  it('renders each role with its class and role marker', () => {
    const container = render(
      <>
        <AnchorSurface data-testid="a">anchor</AnchorSurface>
        <WorkSurface data-testid="w">work</WorkSurface>
        <LiquidSurface data-testid="l">liquid</LiquidSurface>
        <AmbientSurface data-testid="m" />
        <ContextualSurface data-testid="c">contextual</ContextualSurface>
      </>,
    );
    for (const role of LIQUID_SURFACE_ROLES) {
      const el = container.querySelector(`[data-lq-role="${role}"]`);
      expect(el, `no element for role ${role}`).not.toBeNull();
      expect(el!.classList.contains(`lq-${role}`)).toBe(true);
    }
  });

  it('hides the ambient surface from assistive tech', () => {
    const container = render(<AmbientSurface>should not be a carrier</AmbientSurface>);
    const el = container.querySelector('.lq-ambient')!;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    // ...and the sheet makes it inert, so it cannot swallow a click either.
    const ambientRule = blocks.find((b) => b.selector === '.lq-ambient');
    expect(ambientRule!.declarations).toMatch(/pointer-events\s*:\s*none/);
  });

  it('keeps caller className, semantic element and passthrough props', () => {
    const container = render(
      <AnchorSurface as="section" className="reader" aria-label="Reader" measure>
        text
      </AnchorSurface>,
    );
    const el = container.querySelector('[aria-label="Reader"]')!;
    expect(el.tagName).toBe('SECTION');
    expect(el.classList.contains('lq-anchor')).toBe(true);
    expect(el.classList.contains('reader')).toBe(true);
    expect(el.getAttribute('data-measure')).toBe('true');
  });

  it('leaves the optional switches off rather than defaulting them on', () => {
    // A surface that silently caps its own width or animates on every mount is
    // the "Liquid chaos" §3.3 rules out.
    const container = render(
      <>
        <AnchorSurface>a</AnchorSurface>
        <LiquidSurface>l</LiquidSurface>
        <WorkSurface>w</WorkSurface>
      </>,
    );
    expect(container.querySelector('.lq-anchor')!.hasAttribute('data-measure')).toBe(false);
    expect(container.querySelector('.lq-anchor')!.hasAttribute('data-bare')).toBe(false);
    expect(container.querySelector('.lq-liquid')!.hasAttribute('data-entering')).toBe(false);
    expect(container.querySelector('.lq-work')!.hasAttribute('data-raised')).toBe(false);
  });

  it('lets a bare anchor keep the fill and drop the box', () => {
    /*
     * The switch a migration needs. Measured on Immersion: `form.immersion-url-form`
     * went 186x32 to 186x66 the moment it became an anchor, because the role adds a
     * border, a radius, an elevation and 16px of padding to a field the toolbar was
     * already spacing — a 34px conventional-pixel regression in a 580px window. The
     * role still has to win: without it the form read `alpha 0.88 on
     * div.immersion-toolbar`, which is exactly the dense-work-on-glass category 3
     * scores. So `bare` drops the four box properties and keeps the fill, which is
     * why `background` must NOT appear in the rule.
     */
    const container = render(<AnchorSurface bare>a</AnchorSurface>);
    expect(container.querySelector('.lq-anchor')!.getAttribute('data-bare')).toBe('true');

    const bare = blocks.filter((b) =>
      b.selector.split(',').some((s) => s.trim() === ".lq-anchor[data-bare='true']"),
    );
    expect(bare.length, 'the sheet declares no bare-anchor rule').toBe(1);
    const body = bare[0].declarations;
    for (const property of ['border', 'border-radius', 'box-shadow', 'padding']) {
      expect(body, `bare anchor does not drop ${property}`).toMatch(
        new RegExp(`(^|[;\\s])${property}\\s*:`, 'm'),
      );
    }
    expect(
      /(^|[;\s])background\s*:/m.test(body),
      'a background here would let bare change the fill the role exists to guarantee',
    ).toBe(false);
  });
});

/**
 * L5 — the contextual role. It exists so an EXISTING conventional window can
 * declare which of its regions are navigation/transport/tools without becoming
 * glass, and §2's first non-negotiable ("conventional windows remain the default")
 * is enforceable only if this class paints nothing here.
 */
describe('liquid surface primitives — the contextual role is inert until a window opts in', () => {
  /** Every property that would put a pixel on screen. */
  const PAINT = /(^|;|\s)(background|border|box-shadow|backdrop-filter|-webkit-backdrop-filter|opacity|filter|color)\s*:/;

  it('declares .lq-contextual with layout only — no paint property anywhere in this sheet', () => {
    const owning = blocks.filter((b) =>
      splitSelectorList(b.selector).some((s) => s === '.lq-contextual'),
    );
    // The rule must exist: an absent class would make the component a no-op and
    // this suite would pass by measuring nothing.
    expect(owning.length).toBeGreaterThan(0);
    for (const block of owning) {
      expect(block.declarations).not.toMatch(PAINT);
    }
  });

  it('gives the contextual role the same hit floor and focus ring as the painted roles', () => {
    // Category 1 is scored on the migrated region, so it inherits the floor even
    // while it is invisible — otherwise adopting the primitive would silently
    // regress hit targets in conventional presentation.
    const floor = blocks.find((b) => /min-height:\s*var\(--lq-hit-target\)/.test(b.declarations));
    expect(floor).toBeDefined();
    expect(floor!.selector).toMatch(/\.lq-contextual :where\(/);
    // Matched by what the rule DOES, not by its literal text. This assertion used
    // to pin `outline: 2px solid var(--focus-ring)` exactly — and `--focus-ring` is
    // declared nowhere, so it was pinning a declaration the browser discarded
    // whole (`7bea52d4`). A guard that spells out the broken value keeps it.
    const focus = blocks.find((b) => /outline:\s*var\(--focus-ring-width\)/.test(b.declarations));
    expect(focus, 'a :focus-visible rule built from the --focus-ring-* tokens').toBeDefined();
    expect(focus!.selector).toMatch(/\.lq-contextual :focus-visible/);
    // The width and offset come from tokens too, or high contrast's 3px ring
    // (`a11y.css`) never reaches a Liquid surface.
    expect(focus!.declarations).toMatch(/var\(--focus-ring-color\)/);
    expect(focus!.declarations).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
  });

  it('renders the class and role marker, and is NOT the liquid class', () => {
    const container = render(
      <ContextualSurface className="lexicon-lens-picker" aria-label="Lens">
        picker
      </ContextualSurface>,
    );
    const el = container.querySelector('[aria-label="Lens"]')!;
    expect(el.classList.contains('lq-contextual')).toBe(true);
    // NEGATIVE: if it also carried `lq-liquid` it would paint unconditionally and
    // every conventional window hosting a migrated region would go glass.
    expect(el.classList.contains('lq-liquid')).toBe(false);
    expect(el.getAttribute('data-lq-role')).toBe('contextual');
    expect(el.classList.contains('lexicon-lens-picker')).toBe(true);
  });

  it('is one of the declared roles, so a consumer mapping data to a surface can reach it', () => {
    expect(LIQUID_SURFACE_ROLES).toContain('contextual');
  });
});
