// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushRootVars,
  resetRootVarsForTest,
  setRootVars,
  setRootVarsNow,
} from '../rootCssVars';

/**
 * The defect these guard, measured live on 2026-08-26 with ten `.fwin` windows
 * open (3,438 elements): a *changed* custom property on `:root` costs ~70–87 ms
 * of full-document style recalc because every element re-inherits, while an
 * unchanged one costs 0 ms and a class toggle that matches nothing costs 0.5 ms.
 * The appearance sliders wrote three changed properties per `change` event.
 */

/** Count real CSSOM writes, so "batched" is asserted by side effect, not by timing. */
function countWrites(): { writes: string[]; restore: () => void } {
  const style = document.documentElement.style;
  const writes: string[] = [];
  const realSet = style.setProperty.bind(style);
  const realRemove = style.removeProperty.bind(style);
  const setSpy = vi
    .spyOn(style, 'setProperty')
    .mockImplementation((name: string, value: string | null, priority?: string) => {
      writes.push(`set:${name}=${value}`);
      return realSet(name, value, priority);
    });
  const removeSpy = vi.spyOn(style, 'removeProperty').mockImplementation((name: string) => {
    writes.push(`remove:${name}`);
    return realRemove(name);
  });
  return {
    writes,
    restore: () => {
      setSpy.mockRestore();
      removeSpy.mockRestore();
    },
  };
}

/** jsdom's rAF is real but timer-driven; drain it deterministically. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('rootCssVars', () => {
  beforeEach(() => {
    resetRootVarsForTest();
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    resetRootVarsForTest();
    document.documentElement.removeAttribute('style');
    vi.restoreAllMocks();
  });

  it('does not touch the CSSOM until a frame runs', async () => {
    const probe = countWrites();
    setRootVars({ '--app-border-width': '2px' });
    expect(probe.writes).toEqual([]);
    await nextFrame();
    expect(probe.writes).toEqual(['set:--app-border-width=2px']);
    expect(document.documentElement.style.getPropertyValue('--app-border-width')).toBe('2px');
    probe.restore();
  });

  it('collapses a slider tick storm into one write per property per frame', async () => {
    const probe = countWrites();
    // 20 ticks of the border-blur range control inside one frame.
    for (let i = 0; i < 20; i++) setRootVars({ '--app-border-blur': `${i}px` });
    await nextFrame();
    expect(probe.writes).toEqual(['set:--app-border-blur=19px']);
    probe.restore();
  });

  it('drops properties whose value has not changed', async () => {
    setRootVars({ '--taskbar-h': '48px' });
    await nextFrame();
    const probe = countWrites();
    setRootVars({ '--taskbar-h': '48px' });
    await nextFrame();
    expect(probe.writes).toEqual([]);
    probe.restore();
  });

  it('schedules no frame at all when every value is unchanged', () => {
    setRootVarsNow({ '--start-cols': '4' });
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    setRootVars({ '--start-cols': '4' });
    expect(raf).not.toHaveBeenCalled();
  });

  it('writes through immediately for boot, before any frame', () => {
    const probe = countWrites();
    setRootVarsNow({ '--desk-icon-w': '92px', '--desk-icon-h': '92px' });
    expect(probe.writes).toEqual(['set:--desk-icon-w=92px', 'set:--desk-icon-h=92px']);
    probe.restore();
  });

  it('lets an immediate write supersede a queued one for the same property', async () => {
    setRootVars({ '--taskbar-h': '40px' });
    setRootVarsNow({ '--taskbar-h': '56px' });
    await nextFrame();
    expect(document.documentElement.style.getPropertyValue('--taskbar-h')).toBe('56px');
  });

  it('removes a property when the value is null', async () => {
    setRootVarsNow({ '--pillarbox-wall-image': 'url("a.png")' });
    setRootVars({ '--pillarbox-wall-image': null });
    await nextFrame();
    expect(document.documentElement.style.getPropertyValue('--pillarbox-wall-image')).toBe('');
  });

  it('applies synchronously while the document is hidden, which gets no frames', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    setRootVars({ '--taskbar-h': '64px' });
    expect(raf).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--taskbar-h')).toBe('64px');
    hidden.mockRestore();
  });

  it('NEGATIVE CONTROL: batching is what suppresses the writes, not the spy', async () => {
    // The same 20 ticks written the pre-fix way must produce 20 CSSOM writes.
    const probe = countWrites();
    for (let i = 0; i < 20; i++) {
      document.documentElement.style.setProperty('--app-border-blur', `${i}px`);
    }
    expect(probe.writes).toHaveLength(20);
    probe.restore();
  });

  it('flushRootVars lands queued work without waiting for a frame', () => {
    setRootVars({ '--start-cols': '5' });
    expect(document.documentElement.style.getPropertyValue('--start-cols')).toBe('');
    flushRootVars();
    expect(document.documentElement.style.getPropertyValue('--start-cols')).toBe('5');
  });
});
