import { describe, expect, it } from 'vitest';
import { fitNewWindowRect } from '../desktopWindowGeometry';

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
