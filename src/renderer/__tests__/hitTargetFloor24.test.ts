/**
 * K11 (round 3): no button-like control is drawn smaller than 24x24 CSS px (WCAG 2.5.8).
 *
 * The round-2 scan listed caption buttons, the Start pin, widget/title-bar buttons, toast and
 * reminder closes, chip removers and the Aero variants of each at 16-23px. jsdom has no layout,
 * so this reads every renderer stylesheet the way the scan read the page: a rule whose selector
 * names a button-shaped class and fixes its `width`/`height` in px below 24 is a target under
 * the floor. Pseudo-elements, states and glyph/image children are not targets and are skipped.
 *
 * `.lq-hit` / `.lq-hit-placed` add a 32px pointer region on top of the box (so a control stays
 * reachable at the default 80% app zoom); the Start pins carry it, asserted below.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

/** A selector (last compound) that names a clickable control rather than a part of one. */
const BUTTONISH = /(btn|button|-x\b|close|-pin\b|\.fwin-b\b|\.widget-b\b|\.widget-lock\b)/i;
const NOT_A_TARGET = /::?(before|after)|scrollbar|:hover|:focus|:active|\bsvg\b|\bimg\b|\bem\b|-ic\b|-slot\b|dot|badge/;

function smallButtonRules(): string[] {
  const found: string[] = [];
  for (const file of cssFiles(ROOT)) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2];
      for (const raw of m[1].split(',')) {
        const sel = raw.trim().replace(/\s+/g, ' ');
        const last = sel.split(/\s|>/).filter(Boolean).pop() ?? '';
        if (!BUTTONISH.test(last) || NOT_A_TARGET.test(sel)) continue;
        const w = /(?:^|[;\s])width:\s*(\d+(?:\.\d+)?)px/.exec(body);
        const h = /(?:^|[;\s])height:\s*(\d+(?:\.\d+)?)px/.exec(body);
        const small = (v: RegExpExecArray | null) => v != null && Number(v[1]) >= 8 && Number(v[1]) < 24;
        if (small(h) || (small(w) && h != null)) {
          found.push(`${path.relative(ROOT, file)}  ${sel}  ${w?.[1] ?? '-'}x${h?.[1] ?? '-'}`);
        }
      }
    }
  }
  return found;
}

describe('24px target floor (K11)', () => {
  it('no button-shaped rule fixes a box under 24px', () => {
    expect(smallButtonRules()).toEqual([]);
  });

  it('the Start pins carry the 32px pointer expander', () => {
    const shell = readFileSync(path.join(ROOT, 'components', 'DesktopShell.tsx'), 'utf8');
    expect(shell).toMatch(/className=\{`os-start-tile-pin lq-hit-placed/);
    expect(shell).toMatch(/className=\{`os-start-aero-pin lq-hit-placed/);
  });
});
