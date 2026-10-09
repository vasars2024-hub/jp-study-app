import { describe, expect, it } from 'vitest';
import { zoomForWindow } from '../appZoom';

/**
 * The Region Recorder's picker draws its box at pointer `clientX/Y` (unzoomed
 * viewport px) inside #root, which paints at `x * zoom`. At the default 80 % a
 * drag from (400,200) to (1040,560) drew the box at (320,160)–(832,448) while the
 * region recorded was the dragged one (measured live 2026-10-08). Screen-geometry
 * windows therefore run unzoomed and do not re-apply the saved zoom on resize.
 */
describe('zoomForWindow', () => {
  it('keeps the region picker and the region border unzoomed, ignoring resizes', () => {
    expect(zoomForWindow('?regionRecorder=select', 0.8)).toEqual({ zoom: 1, followResize: false });
    expect(zoomForWindow('?regionRecorder=frame', 1.5)).toEqual({ zoom: 1, followResize: false });
  });

  it('leaves every other window on the saved zoom', () => {
    expect(zoomForWindow('', 0.8)).toEqual({ zoom: 0.8, followResize: true });
    expect(zoomForWindow('?regionRecorder=panel', 0.8)).toEqual({ zoom: 0.8, followResize: true });
    expect(zoomForWindow('?regionRecorder=host', 0.8)).toEqual({ zoom: 0.8, followResize: true });
    expect(zoomForWindow('?popout=dictionary', 1.2)).toEqual({ zoom: 1.2, followResize: true });
  });
});
