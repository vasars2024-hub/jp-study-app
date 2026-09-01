// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Settings > Display > Contrast, expressed as a check rather than a promise.
 *
 * The three-state control writes `data-display-contrast`, and `styles.css`
 * answers it by mixing `--text`, `--muted` and `--border` a measured step
 * towards each other. Every one of those declarations used to name the token it
 * was defining as its own source — `--muted: color-mix(… var(--muted) …)` on the
 * element that already carries `--muted`. That is a cycle, and CSS resolves a
 * cycle to the guaranteed-invalid value rather than to the previous value, so
 * all four declarations computed to nothing and the two non-default states of a
 * shipped accessibility control did not do what they said.
 *
 * It failed worse than a no-op. An empty token falls back to `currentColor`
 * only where the author supplied no `var()` fallback of their own, so one token
 * painted two different colours on the same screen — measured live at `high`,
 * a subtle `rgb(45,43,55)` hairline beside a near-white `rgb(245,244,247)` one.
 *
 * Nothing in the suite covered this. The check below is the contract the repair
 * rests on, and it is deliberately about the SHAPE rather than the numbers: a
 * future turn is free to retune 55/45, and is not free to reintroduce a cycle.
 */

const CSS = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');

/** Strip comments so prose about the bug cannot satisfy or break a match. */
const BODY = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

type Block = { selector: string; declarations: string };

/**
 * Targeted rather than a whole-sheet parse: `styles.css` nests inside `@media`,
 * and the flat `selector { … }` regex the token tests use mis-attributes a
 * declaration block to an at-rule prelude when it does.
 */
function contrastBlocks(source: string): Block[] {
  const out: Block[] = [];
  const re = /([^{}]*data-display-contrast[^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    out.push({ selector: m[1].trim().replace(/\s+/g, ' '), declarations: m[2] });
  }
  return out;
}

/** `--name: value` pairs declared directly in one block. */
function customProps(declarations: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of declarations.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
    out.set(m[1].trim(), m[2].trim());
  }
  return out;
}

/** Every `var(--x)` a value reads. */
function references(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
}

const blocks = contrastBlocks(BODY);

describe('Settings > Display > Contrast — the shift must read a separate source', () => {
  it('reads blocks that actually declare the contrast shift', () => {
    // Guards every assertion below from passing vacuously on a bad read or a
    // renamed attribute.
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks.some((b) => b.selector.includes("'medium'"))).toBe(true);
    expect(blocks.some((b) => b.selector.includes("'high'"))).toBe(true);
  });

  it('still shifts all three tokens the control promises', () => {
    const declared = new Set<string>();
    for (const b of blocks) for (const name of customProps(b.declarations).keys()) declared.add(name);
    // Deleting the feature is as much a regression as breaking it.
    expect(declared).toContain('--text');
    expect(declared).toContain('--muted');
    expect(declared).toContain('--border');
  });

  it('declares no custom property in terms of itself', () => {
    const selfReferential: string[] = [];
    for (const b of blocks) {
      for (const [name, value] of customProps(b.declarations)) {
        if (references(value).includes(name)) selfReferential.push(`${b.selector} { ${name} }`);
      }
    }
    expect(selfReferential).toEqual([]);
  });

  it('closes no cycle through a second property in the same block either', () => {
    // Capturing `--src: var(--muted)` and consuming it back into `--muted` on
    // ONE element is still a cycle, just an indirect one — which is why the
    // repair captures on `html` and consumes on `html … body`. A block-local
    // dependency graph catches both spellings.
    const cycles: string[] = [];
    for (const b of blocks) {
      const props = customProps(b.declarations);
      const seen = new Set<string>();
      const stack = new Set<string>();
      const walk = (name: string): boolean => {
        if (stack.has(name)) return true;
        if (seen.has(name)) return false;
        seen.add(name);
        stack.add(name);
        for (const ref of references(props.get(name) ?? '')) {
          if (props.has(ref) && walk(ref)) return true;
        }
        stack.delete(name);
        return false;
      };
      for (const name of props.keys()) {
        if (walk(name)) cycles.push(`${b.selector} { ${name} }`);
      }
    }
    expect(cycles).toEqual([]);
  });
});
