import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canMaximizeSection,
  fitNewWindowRect,
  maximizedGeometry,
  restorePoint,
} from '../desktopWindowGeometry';

describe('fitNewWindowRect', () => {
  it('fits a cascaded Games window below the taskbar work-area edge', () => {
    expect(
      fitNewWindowRect(
        { x: 230, y: 174, w: 980, h: 660 },
        { w: 1264, h: 765 },
        { w: 260, h: 170 },
      ),
    ).toEqual({ x: 230, y: 174, w: 980, h: 589 });
  });

  it('keeps the requested size when it already fits', () => {
    expect(
      fitNewWindowRect(
        { x: 60, y: 24, w: 820, h: 580 },
        { w: 1264, h: 765 },
        { w: 260, h: 170 },
      ),
    ).toEqual({ x: 60, y: 24, w: 820, h: 580 });
  });

  it('keeps the minimum reachable on a smaller work area', () => {
    expect(
      fitNewWindowRect(
        { x: 500, y: 400, w: 980, h: 660 },
        { w: 520, h: 360 },
        { w: 260, h: 170 },
      ),
    ).toEqual({ x: 258, y: 188, w: 260, h: 170 });
  });
});

describe('maximized state', () => {
  it('only sections that render a maximize control can hold the flag', () => {
    expect(canMaximizeSection('dictionary')).toBe(true);
    expect(canMaximizeSection('video')).toBe(true);
    expect(canMaximizeSection('settings')).toBe(true);
    // Both refuse for the same reason: no control on the surface could clear it.
    // `note` renders only the presentation toggle and Delete and ignores
    // double-click; `city` is frameless — pop-out / presentation / minimize /
    // close, no maximize. Measured live 2026-09-03 on the running app.
    expect(canMaximizeSection('note')).toBe(false);
    expect(canMaximizeSection('city')).toBe(false);
  });

  it('applies the desk rect, not just the flag — the defect fixed 2026-09-03', () => {
    // The shortcut routes used to patch `{ max: true, min: false }` alone. That
    // is not a smaller maximize: the shell drops drag and all three resize
    // handles while `max` is set, so the window froze at its old size.
    expect(maximizedGeometry(1264, 765)).toEqual({
      max: true,
      min: false,
      x: 0,
      y: 0,
      w: 1264,
      h: 765,
    });
  });

  it('captures the restore point once, so a snap cannot overwrite the authored size', () => {
    expect(restorePoint({ x: 94, y: 54, w: 1080, h: 700 })).toEqual({
      rect: { x: 94, y: 54, w: 1080, h: 700 },
    });
    // Already snapped: the pre-snap rect is kept, not replaced by the half-desk.
    expect(
      restorePoint({ x: 0, y: 0, w: 632, h: 765, rect: { x: 94, y: 54, w: 1080, h: 700 } }),
    ).toEqual({});
  });

  it('leaves no route in the shell that sets the flag without the geometry', () => {
    // Comments are stripped before matching. A comment spelling out a predicate
    // has already been scored as a call site in this repo
    // (`liquidWindowSnapshotFidelity`, boss audit 2026-09-02 finding 2), and the
    // point of this assertion is the executable code, not the prose.
    const source = readFileSync(
      join(__dirname, '..', 'components', 'DesktopShell.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const bareFlag = source.match(/max:\s*true/g) ?? [];
    expect(bareFlag).toEqual([]);
    // …and every route that does maximize goes through the shared helper.
    expect((source.match(/maximizedGeometry\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
