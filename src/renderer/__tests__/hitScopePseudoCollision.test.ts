// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `.lq-hit-scope` gives every button in it a pointer floor drawn as an `::after`
 * (theme/liquid-controls.css). A component that ALSO draws its own `::after` on such a
 * button shares one pseudo-element with the floor, and whichever rule wins each property
 * wins it alone. The Grammar Filters button's "filters on" dot kept its colour and radius
 * but took the floor's `left: 50%`, `width: max(100%, 32px)` and centring transform: a
 * pink ellipse over the whole button that hid its label (round-3 sweep, every locale).
 *
 * Guard: a class given to a button that sits directly in a `lq-hit-scope` row must not
 * be styled through `::after`. The rows are found in the TSX, the rules in every sheet.
 */

const ROOT = resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const FILES = walk(ROOT);
const CSS = FILES.filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  .join('\n');

/** Literal class names on `<Button …>` / `<button …>` elements inside a `lq-hit-scope` element. */
function scopedButtonClasses(): Set<string> {
  const found = new Set<string>();
  for (const f of FILES.filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/className=["'`][^"'`]*\blq-hit-scope\b[^"'`]*["'`]/g)) {
      // The scope's own subtree: up to the next closing tag at the same indentation is not
      // parseable without a JSX parser, so a generous window after the opening tag is read.
      const window = src.slice(m.index, (m.index ?? 0) + 4000);
      for (const b of window.matchAll(/<(?:Button|button)\b[^>]*?className=\{?\s*["'`]([^"'`$]+)["'`]/g)) {
        for (const c of b[1].split(/\s+/)) if (c && !c.startsWith('lq-') && !c.startsWith('ui-')) found.add(c);
      }
      for (const b of window.matchAll(/<(?:Button|button)\b[^>]*?className=\{[^}]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) {
        for (const c of `${b[1]} ${b[2]}`.split(/\s+/)) if (c && !c.startsWith('lq-') && !c.startsWith('ui-')) found.add(c);
      }
    }
  }
  return found;
}

describe('.lq-hit-scope: no component ::after on a scoped button', () => {
  const classes = scopedButtonClasses();

  it('finds the Grammar explorer row (the case that shipped)', () => {
    expect(classes.has('gram-x-filters-btn')).toBe(true);
  });

  it('no scoped button class is styled through ::after', () => {
    const offenders: string[] = [];
    for (const c of classes) {
      const re = new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])[^{},]*::after`);
      if (re.test(CSS)) offenders.push(c);
    }
    expect(offenders).toEqual([]);
  });
});
