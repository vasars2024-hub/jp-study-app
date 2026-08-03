/**
 * Slice 52 — every range slider in the shipped renderer must have an accessible name.
 *
 * Slice 50 found the media-center player bar's volume slider taking keyboard focus and
 * announcing as a bare "slider". A native `<input type="range">` carries a role and a
 * value for free but **no name**: the `<span>` sitting next to it is not read, so the
 * only thing a screen-reader user hears is "slider, 40". This test is the standing gate
 * for that, run from source rather than from a packaged build so it costs nothing.
 *
 * It is a *source* scan on purpose. `vitest.config.ts` is `environment: 'node'` and
 * these components reach `keyboardShortcuts` / `player` singletons at module eval, so
 * rendering all 25 of them is not on the table. A static accname approximation covers
 * every file instead of the handful a render harness could reach.
 *
 * Accepted naming mechanisms, in accname precedence order:
 *   `aria-labelledby` > `aria-label` > `<label for=id>` > a wrapping `<label>` with text.
 * `title` is deliberately NOT accepted: it is only the last-resort fallback in the
 * accname algorithm, is not announced by every screen reader, and W3C guidance is
 * explicit that it should not be the sole naming mechanism.
 *
 * `__devharness__` is excluded — it is dev-only, absent from `dist`, and already
 * excluded by `tools/architecture-audit.cjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src/renderer', 'src/media'];

/**
 * The shared primitive's own definition. Its `<input type="range">` is nameless by
 * construction because the name arrives from the caller through `{...rest}` — so it is
 * exempt from the scan, and `SliderProps` requiring a name is what replaces the check.
 * Pinned below so removing the requirement fails here rather than going quiet.
 */
const SLIDER_PRIMITIVE = 'src/renderer/components/ui/Slider.tsx';

type Control = {
  file: string;
  line: number;
  kind: 'input' | 'Slider';
  named: boolean;
  mechanism: string;
};

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__devharness__') continue;
        walk(p);
      } else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(p);
    }
  };
  for (const root of ROOTS) if (fs.existsSync(root)) walk(root);
  return out;
}

/**
 * Read one JSX opening tag starting at `start`, tracking quotes and `{}` depth so an
 * expression attribute containing `>` (e.g. `disabled={a > b}`) does not end the tag early.
 * Returns the tag text, or null if it never closes.
 */
function readOpeningTag(src: string, start: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

/** Static approximation of "does this control have an accessible name". */
export function analyseSource(src: string, file = '<inline>'): Control[] {
  const found: Control[] = [];
  const htmlFors = new Set([...src.matchAll(/htmlFor=["']([^"']+)["']/g)].map((m) => m[1]));

  const scan = (pattern: RegExp, kind: Control['kind'], isRange: (tag: string) => boolean): void => {
    for (const match of src.matchAll(pattern)) {
      const start = match.index;
      const tag = readOpeningTag(src, start);
      if (tag === null || !isRange(tag)) continue;

      const mechanisms: string[] = [];
      if (/aria-labelledby=/.test(tag)) mechanisms.push('aria-labelledby');
      if (/aria-label=/.test(tag)) mechanisms.push('aria-label');

      const id = /\sid=["']([^"']+)["']/.exec(tag)?.[1];
      if (id && htmlFors.has(id)) mechanisms.push(`label[for=${id}]`);

      // A wrapping <label> names its control, but only if it has text of its own.
      const before = src.slice(0, start);
      const labelOpen = before.lastIndexOf('<label');
      if (labelOpen !== -1 && labelOpen > before.lastIndexOf('</label>')) {
        const text = src.slice(labelOpen, start).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) mechanisms.push('wrapping <label>');
      }

      found.push({
        file,
        line: before.split(/\r?\n/).length,
        kind,
        named: mechanisms.length > 0,
        mechanism: mechanisms.join(' + ') || 'NONE',
      });
    }
  };

  scan(/<input\b/g, 'input', (tag) => /type\s*=\s*["'{]?["']?range["']/.test(tag));
  // The shared primitive renders `<input type="range">` and spreads the rest, so a
  // <Slider> without a name is exactly as nameless as a raw range input.
  scan(/<Slider\b/g, 'Slider', () => true);

  return found;
}

function allControls(): Control[] {
  return sourceFiles()
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => file !== SLIDER_PRIMITIVE)
    .flatMap((file) => analyseSource(fs.readFileSync(file, 'utf8'), file));
}

describe('range sliders carry an accessible name', () => {
  it('names every range control in the shipped renderer', () => {
    const nameless = allControls()
      .filter((c) => !c.named)
      .map((c) => `${c.file}:${c.line} (${c.kind})`);
    expect(nameless).toEqual([]);
  });

  it('covers the whole surface, so an empty pass cannot be vacuous', () => {
    const controls = allControls();
    // Slice 52 measured 48 raw range inputs (excluding the 2 dev-harness ones and the
    // `Slider` primitive's own definition, which takes its name from the caller) plus 8
    // <Slider> call sites. A floor, not an equality — new sliders are expected.
    expect(controls.length).toBeGreaterThanOrEqual(55);
    expect(controls.filter((c) => c.kind === 'Slider').length).toBeGreaterThanOrEqual(8);
    expect(controls.every((c) => c.named)).toBe(true);
  });
});

describe('the Slider primitive requires a name from its caller', () => {
  const primitive = fs.readFileSync(SLIDER_PRIMITIVE, 'utf8');

  it('still exists where the scan exempts it', () => {
    expect(/type="range"/.test(primitive)).toBe(true);
  });

  it('types the accessible name as required, not optional', () => {
    // `npx tsc --noEmit` is not a gate on this repo (~288 pre-existing errors from other
    // tracks), so the type is asserted here instead of relying on a typecheck nobody runs.
    const props = /export type SliderProps =([\s\S]*?);/.exec(primitive)?.[1] ?? '';
    expect(props).toMatch(/'aria-label':\s*string/);
    expect(props).toMatch(/'aria-labelledby':\s*string/);
    // A union of the two, not `?:` — optional would let a nameless <Slider> compile.
    expect(props).not.toMatch(/'aria-label'\?:/);
  });
});

describe('the analyser itself detects what it claims to', () => {
  // Non-vacuity control: if these ever pass trivially, the scan above proves nothing.
  it('reports an unnamed range input as unnamed', () => {
    const [only] = analyseSource('<input type="range" min={0} max={1} />');
    expect(only.named).toBe(false);
    expect(only.mechanism).toBe('NONE');
  });

  it('reports an unnamed <Slider> as unnamed', () => {
    const [only] = analyseSource('<Slider min={0} max={1} value={v} />');
    expect(only).toMatchObject({ kind: 'Slider', named: false });
  });

  it('does not accept title as an accessible name', () => {
    const [only] = analyseSource('<input type="range" title="Volume" />');
    expect(only.named).toBe(false);
  });

  it('accepts aria-label, label[for] and a wrapping label', () => {
    expect(analyseSource('<input type="range" aria-label="Volume" />')[0].named).toBe(true);
    expect(
      analyseSource('<label htmlFor="v">Volume</label><input id="v" type="range" />')[0].named,
    ).toBe(true);
    expect(analyseSource('<label>Volume<input type="range" /></label>')[0].named).toBe(true);
  });

  it('does not let an expression attribute containing > end the tag early', () => {
    // `disabled={a > b}` before the name is the case a naive scan-to-first-`>` gets wrong:
    // it would truncate the tag and report a named control as nameless.
    const [only] = analyseSource('<input type="range" disabled={a > b} aria-label="Seek" />');
    expect(only.named).toBe(true);
  });

  it('ignores a <label> that closed before the control', () => {
    const [only] = analyseSource('<label>Blur</label><input type="range" />');
    expect(only.named).toBe(false);
  });
});
