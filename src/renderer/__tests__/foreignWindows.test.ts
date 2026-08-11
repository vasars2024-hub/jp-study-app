// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { WindowSnapshot } from '../../shared/desktop';
import { collectForeignWindows } from '../foreignWindows';

/**
 * The cross-monitor "show windows from all desktops" taskbar list.
 *
 * These rules were only ever reachable with a second display attached, so they
 * shipped unexercised. The staleness case at the bottom is the one that was
 * measured failing on a live simulated display, not one imagined here.
 */

function win(id: string, over: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    id,
    section: id,
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    visible: true,
    maximized: false,
    pinned: false,
    ...over,
  } as WindowSnapshot;
}

/** A three-desktop world, addressed the way the shell addresses it. */
function world(layouts: Record<number, WindowSnapshot[]>, names: Record<number, string> = {}) {
  return {
    desktopCount: 3,
    windowsOn: (index: number) => layouts[index] ?? [],
    nameOf: (index: number) => names[index] ?? `Desktop ${index + 1}`,
  };
}

describe('collectForeignWindows', () => {
  it('lists nothing at all when the taskbar has not opted in', () => {
    const out = collectForeignWindows({
      showAllWindows: false,
      activeDesktop: 1,
      ...world({ 0: [win('music')], 2: [win('agent')] }),
    });
    expect(out).toEqual([]);
  });

  it('lists windows from the other desktops, each carrying its desktop name', () => {
    const out = collectForeignWindows({
      showAllWindows: true,
      activeDesktop: 1,
      ...world({ 0: [win('music')], 2: [win('agent')] }, { 0: 'Study', 2: 'Desktop 3' }),
    });
    expect(out.map((e) => [e.win.id, e.desktopIndex, e.desktopName])).toEqual([
      ['music', 0, 'Study'],
      ['agent', 2, 'Desktop 3'],
    ]);
  });

  it('never lists the active desktop — those are already the taskbar’s own entries', () => {
    const out = collectForeignWindows({
      showAllWindows: true,
      activeDesktop: 0,
      ...world({ 0: [win('music'), win('novels')], 2: [win('agent')] }),
    });
    expect(out.map((e) => e.win.id)).toEqual(['agent']);
  });

  it('skips minimised windows, which have nothing to raise on the other monitor', () => {
    const out = collectForeignWindows({
      showAllWindows: true,
      activeDesktop: 1,
      ...world({ 0: [win('music', { visible: false }), win('novels')] }),
    });
    expect(out.map((e) => e.win.id)).toEqual(['novels']);
  });

  it('reads the name at collection time, so a renamed desktop is not badged stale', () => {
    const out = collectForeignWindows({
      showAllWindows: true,
      activeDesktop: 1,
      ...world({ 0: [win('music')] }, { 0: 'Renamed' }),
    });
    expect(out[0]?.desktopName).toBe('Renamed');
  });

  /**
   * The live defect, reduced to its inputs.
   *
   * A window dragged from desktop 0 onto this monitor's desktop 1 is gone from
   * desktop 0 and present here. Re-collecting against the *new* layout must not
   * list it, or the taskbar shows it twice — once as its own and once badged
   * with the desktop it left. That is what a live simulated display produced
   * while the shell's memo was still reading a store it did not depend on.
   */
  it('drops a window that has moved to the active desktop', () => {
    const before = collectForeignWindows({
      showAllWindows: true,
      activeDesktop: 1,
      ...world({ 0: [win('library')], 1: [] }),
    });
    expect(before.map((e) => e.win.id)).toEqual(['library']);

    const after = collectForeignWindows({
      showAllWindows: true,
      activeDesktop: 1,
      ...world({ 0: [], 1: [win('library')] }),
    });
    expect(after).toEqual([]);
  });
});

/**
 * The selection above is pure, so it cannot catch the actual bug: the shell's
 * memo had correct logic and no dependency on the store it read. Nothing about
 * `collectForeignWindows` can fail for that. `DesktopShell.tsx` still cannot be
 * imported under vitest, so this reads its source — the same tactic
 * `monitorsPage.test.ts` uses for `SettingsApp`'s routing.
 */
describe('DesktopShell subscribes the list to the store it reads', () => {
  it('bumps a revision on the desktop broadcast and depends on it', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/renderer/components/DesktopShell.tsx', 'utf8');

    expect(src).toContain('setLayoutRevision((n) => n + 1)');

    // The bump must come from the layout broadcast, not from some unrelated
    // event that merely happens to fire often.
    const bump = src.indexOf('setLayoutRevision((n) => n + 1)');
    expect(src.slice(Math.max(0, bump - 200), bump)).toContain('onDesktopChanged');

    // And the memo must actually read it, or the subscription is decoration.
    const memo = src.indexOf('collectForeignWindows(');
    expect(memo).toBeGreaterThan(-1);
    expect(src.slice(memo, memo + 500)).toContain('layoutRevision');
  });
});
