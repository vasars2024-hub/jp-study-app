// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * A DESKTOP WINDOW MUST BE ADDRESSABLE BY WHAT IT IS, NOT BY THE TEXT IN ITS TITLE BAR.
 *
 * Three sections render an EMPTY title — `visualizer`, `musicwidget` and the frameless
 * `city` (DesktopShell's `title` ternary). Every instrument that resolved a window with
 * `.find(w => titleText(w) === key)` therefore returned whichever of the three came first
 * in the DOM, and all three collapsed onto ONE window: one read, one toggle, one crop,
 * three app rows.
 *
 * MEASURED IN THE BANKED EVIDENCE, before anything was changed:
 *   - `baselines/l12-matrix-maximized.json` — the three apps share ONE sha256 per theme.
 *   - `baselines/l12-matrix-normal.json` — all three carry the visualizer's own 380x200
 *     rect, although musicwidget opens at 430x190 and city at 680x800.
 *   - `city` cannot be maximized at all (the shell excludes the frameless garden) yet was
 *     recorded maximized at 1264x765.
 * So L12's atlas reported 100% app-universe on 23 of 25 surfaces, and its published
 * product fact — "3 of 25 surfaces offer no Liquid presentation" — is wrong about
 * `musicwidget`, whose `canPresentLiquid` is true and whose bar renders the toggle.
 *
 * This case is the ratchet on both halves: the product attribute that makes a window
 * identifiable, and the harness that must use it. The manifests captured before the fix
 * are frozen at their known damage rather than repaired — those crops are of the wrong
 * window and no edit brings the right pixels back.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const SHELL = join(REPO, 'src', 'renderer', 'components', 'DesktopShell.tsx');
const HARNESS = join(REPO, 'src', '.coordination', 'liquid-workplace', 'probes', 'l12-visual-matrix.cjs');
const BASELINES = join(REPO, 'src', '.coordination', 'liquid-workplace', 'baselines');

/** Manifests captured under title addressing. Their app axis is known-fabricated. */
const LEGACY = new Set([
  'l12-matrix-normal.json',
  'l12-matrix-maximized.json',
  'l12-matrix-tries40.json',
  'l12-matrix-oledblack.json',
]);

type Cell = { app?: string; theme?: string; presentation?: string; ok?: boolean; sha256?: string };

describe('L12 window identity', () => {
  it('the .fwin root carries data-section', () => {
    const src = readFileSync(SHELL, 'utf8');
    // Anchored to the root element rather than counted, because a `data-section` anywhere
    // else in this 4,000-line file would satisfy a bare substring search.
    const root = src.slice(src.indexOf('<section\n      ref={winRef}'));
    expect(root.slice(0, 1200)).toContain('data-section={win.section}');
  });

  it('three sections still render an empty title, which is why the attribute is needed', () => {
    const src = readFileSync(SHELL, 'utf8');
    // If a later change gives these windows real titles the collision goes away — but the
    // attribute stays correct, so this asserts the PREMISE is still live rather than
    // requiring it. A failure here means the comment above needs rewriting, not the code.
    expect(src).toContain('isVisualizer || isMusicWidget || isGarden');
  });

  it('the matrix harness addresses by section, and keeps title as a named falsifier', () => {
    const src = readFileSync(HARNESS, 'utf8');
    expect(src).toContain("const ADDRESS = arg('address', 'section');");
    expect(src).toContain("w.getAttribute('data-section') ===");
    // Ambiguity must be a refusal. A first-match resolve is the whole defect.
    expect(src).toContain('refusing to guess');
  });

  it('every manifest written after the fix records how it addressed windows', () => {
    const files = readdirSync(BASELINES).filter((f) => /^l12-matrix.*\.json$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const f of files) {
      if (LEGACY.has(f)) continue;
      const m = JSON.parse(readFileSync(join(BASELINES, f), 'utf8')) as {
        addressing?: { mode?: string; titleCollisions?: unknown };
      };
      if (m.addressing?.mode !== 'section' || m.addressing?.titleCollisions == null) missing.push(f);
    }
    expect(missing).toEqual([]);
  });

  it('the legacy damage is frozen as a number, so it cannot be quietly re-claimed', () => {
    const m = JSON.parse(
      readFileSync(join(BASELINES, 'l12-matrix-maximized.json'), 'utf8'),
    ) as { cells: Cell[] };
    const collided = ['visualizer', 'musicwidget', 'city'];
    // Per theme, the three apps captured in `standard` produced exactly one image.
    const themes = [...new Set(m.cells.map((c) => c.theme))];
    const groups = themes.map((t) => new Set(
      m.cells
        .filter((c) => c.theme === t && c.presentation === 'standard' && c.ok && collided.includes(c.app ?? ''))
        .map((c) => c.sha256),
    ).size);
    expect(groups).toEqual([1, 1]);
  });
});
