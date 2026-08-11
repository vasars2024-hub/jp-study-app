// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/**
 * Which display does the MAIN window sit on, when a simulated display overlaps it?
 *
 * This is a regression fixture for a defect observed live on 2026-08-07. Simulated
 * displays are tiled into the right half of the primary monitor's own work area,
 * so at 1920x1080 the strip starts at x=960 — and a main window of 1280x860 at
 * (320,110) has its centre at exactly (960,540), i.e. inside the strip.
 *
 * `keyForWindow` deliberately prefers a virtual display that contains the point
 * (a secondary shell dragged onto a simulated strip really is "on" it). Applying
 * that same rule to the main window made it appear to migrate onto the
 * simulation, which flipped `syncDesktopWindows`' main-display guard onto the
 * wrong entry: the simulated display was skipped as if it were main's, and the
 * REAL display got a full-screen second shell stacked on top of the main window.
 *
 * The fixture must therefore use overlapping geometry. A strip that did not
 * contain the main window's centre could not fail, and the pass would carry no
 * information.
 */

const h = vi.hoisted(() => {
  const primary = {
    id: 1,
    label: 'Display',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  };
  return { primary };
});

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  screen: {
    getAllDisplays: () => [h.primary],
    getPrimaryDisplay: () => h.primary,
    getDisplayNearestPoint: () => h.primary,
    on: () => undefined,
  },
}));

const { keyForWindow, realKeyForWindow, setVirtualDisplayCount, listDisplays } = await import(
  '../displays'
);

/** Main window as the app actually opens it: 1280x860 at (320,110). */
function mainWindowStub() {
  return {
    isDestroyed: () => false,
    getBounds: () => ({ x: 320, y: 110, width: 1280, height: 860 }),
  } as unknown as Electron.BrowserWindow;
}

describe('display identity for the main window under simulated displays', () => {
  it('tiles a simulated display that really does overlap the main window centre', () => {
    setVirtualDisplayCount(1);
    const displays = listDisplays();
    const sim = displays.find((d) => d.virtual);
    expect(sim, 'a simulated display should exist').toBeTruthy();

    // The fixture is only meaningful if the strip contains the window centre.
    const centre = { x: 320 + 1280 / 2, y: 110 + 860 / 2 };
    expect(centre).toEqual({ x: 960, y: 540 });
    expect(sim!.bounds.x).toBe(960);
    expect(centre.x).toBeGreaterThanOrEqual(sim!.bounds.x);
    expect(centre.x).toBeLessThan(sim!.bounds.x + sim!.bounds.width);
    expect(centre.y).toBeGreaterThanOrEqual(sim!.bounds.y);
    expect(centre.y).toBeLessThan(sim!.bounds.y + sim!.bounds.height);

    setVirtualDisplayCount(0);
  });

  it('keyForWindow prefers the simulated display — the behaviour secondaries need', () => {
    setVirtualDisplayCount(1);
    const key = keyForWindow(mainWindowStub());
    expect(key).toBe('simulated-1|960x1080|1');
    setVirtualDisplayCount(0);
  });

  it('realKeyForWindow ignores the simulation and answers with the physical display', () => {
    setVirtualDisplayCount(1);
    const key = realKeyForWindow(mainWindowStub());
    expect(key).toBe('display|1920x1080|1');
    setVirtualDisplayCount(0);
  });

  it('the two agree once simulation is off', () => {
    setVirtualDisplayCount(0);
    const win = mainWindowStub();
    expect(realKeyForWindow(win)).toBe('display|1920x1080|1');
    expect(keyForWindow(win)).toBe('display|1920x1080|1');
  });
});
