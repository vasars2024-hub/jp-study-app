// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ screen: {} }));
vi.mock('../atomicJson', () => ({ readJsonSync: () => null, writeJsonAtomicSync: () => undefined }));

import { parseSavedWindowState, restoreRect, type DisplayLike } from '../windowState';

const primary: DisplayLike = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
};
const right: DisplayLike = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
  scaleFactor: 1.5,
};

describe('window placement restore', () => {
  it('reopens exactly where it was on an unchanged display', () => {
    const saved = { bounds: { x: 2100, y: 100, width: 1400, height: 900 }, maximized: true, displayId: 2, displayBounds: right.bounds, scaleFactor: 1.5 };
    expect(restoreRect(saved, [primary, right], primary)).toEqual(saved.bounds);
  });

  it('a removed monitor brings the window back onto the primary display', () => {
    const saved = { bounds: { x: 2100, y: 100, width: 1400, height: 900 }, maximized: false, displayId: 2, displayBounds: right.bounds };
    const rect = restoreRect(saved, [primary], primary);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1920);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1040);
  });

  it('a window bigger than its (now smaller) display is capped and pulled inside', () => {
    const smaller: DisplayLike = { ...right, workArea: { x: 1920, y: 0, width: 1280, height: 680 }, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, scaleFactor: 2 };
    const saved = { bounds: { x: 2000, y: 50, width: 2400, height: 1300 }, maximized: false, displayId: 2, displayBounds: right.bounds, scaleFactor: 1.5 };
    const rect = restoreRect(saved, [primary, smaller], primary);
    expect(rect).toEqual({ x: 1920, y: 0, width: 1280, height: 680 });
  });

  it('a title bar hanging off the bottom edge is pulled up', () => {
    const saved = { bounds: { x: 100, y: 1000, width: 800, height: 600 }, maximized: false, displayId: 1, displayBounds: primary.bounds };
    const rect = restoreRect(saved, [primary], primary);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1040);
  });

  it('parses the old size-only Blanc file and rejects junk', () => {
    const legacy = parseSavedWindowState({ width: 720, height: 560 });
    expect(legacy?.bounds.width).toBe(720);
    const rect = restoreRect(legacy!, [primary], primary);
    expect(rect).toEqual({ x: 600, y: 240, width: 720, height: 560 });
    expect(parseSavedWindowState({ bounds: { x: 'a' } })).toBeNull();
    expect(parseSavedWindowState(null)).toBeNull();
  });
});
