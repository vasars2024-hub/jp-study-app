// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { WindowSnapshot } from '../../shared/desktop';
import { collectForeignWindows, switchableDesktopIndexes } from '../foreignWindows';

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

/**
 * The switcher's own selection.
 *
 * The row was two hardcoded buttons, indices 0 and 1, while the layout store
 * grows a desktop per display assignment and one more for every taskbar
 * tear-off. Measured on the user's machine: eight desktops, two buttons, and
 * two maximized Scraper windows stranded on desktops 3 and 5 (D149).
 */
describe('switchableDesktopIndexes', () => {
  const w = (layouts: Record<number, WindowSnapshot[]>, count = 8) => ({
    desktopCount: count,
    windowsOn: (index: number) => layouts[index] ?? [],
  });

  it('offers a button for a desktop that holds a window, however far out it is', () => {
    // The measured case, reduced: windows on 1, 2 and 4 of eight desktops.
    const out = switchableDesktopIndexes({
      activeDesktop: 0,
      ...w({ 1: [win('files')], 2: [win('scraper', { maximized: true })], 4: [win('scraper', { maximized: true })] }),
    });
    expect(out).toEqual([0, 1, 2, 4]);
  });

  it('still shows 0 and 1 when both are empty, so the row never changes shape', () => {
    expect(switchableDesktopIndexes({ activeDesktop: 0, ...w({}) })).toEqual([0, 1]);
  });

  it('omits empty extra desktops, so six assigned displays do not grow six dead buttons', () => {
    const out = switchableDesktopIndexes({ activeDesktop: 0, ...w({ 5: [] }) });
    expect(out).not.toContain(5);
    expect(out).toEqual([0, 1]);
  });

  it('includes the active desktop even when it is empty and far out', () => {
    expect(switchableDesktopIndexes({ activeDesktop: 6, ...w({}) })).toEqual([0, 1, 6]);
  });

  it('skips a desktop whose only windows are hidden — there is nothing to raise', () => {
    const out = switchableDesktopIndexes({ activeDesktop: 0, ...w({ 3: [win('note', { visible: false })] }) });
    expect(out).toEqual([0, 1]);
  });

  it('never returns an index the store does not have', () => {
    // A one-desktop store still yields the pair, because the shell always
    // renders both; nothing beyond `desktopCount` may appear.
    const out = switchableDesktopIndexes({ activeDesktop: 0, ...w({}, 1) });
    expect(out).toEqual([0, 1]);
    expect(switchableDesktopIndexes({ activeDesktop: 0, ...w({ 2: [win('x')] }, 2) })).toEqual([0, 1]);
  });
});

/**
 * The two call sites of the "put this desktop on screen" pairing.
 *
 * `deskwinFocusDesktop` only raises a window that already shows the desktop and
 * answers `{ok:false}` when none does. The shell's monitor-ring route paired it
 * with `deskwinOpenDesktop`; the taskbar's badged button called the raise-only
 * half and `void`ed the answer, so it clicked to silence (D150). Source-read for
 * the same reason as the block above — `DesktopShell.tsx` cannot be imported
 * under vitest.
 */
describe('every desktop-showing route opens when nothing is showing it', () => {
  it('routes both call sites through the shared helper and says so on failure', async () => {
    const fs = await import('node:fs');
    const shell = fs.readFileSync('src/renderer/components/DesktopShell.tsx', 'utf8');
    const state = fs.readFileSync('src/renderer/desktopState.ts', 'utf8');

    // The helper exists and is the pairing, not just a rename of the raise.
    const helper = state.indexOf('export async function focusOrOpenDesktop');
    expect(helper).toBeGreaterThan(-1);
    const body = state.slice(helper, helper + 400);
    expect(body).toContain('deskwinFocusDesktop');
    expect(body).toContain('deskwinOpenDesktop');

    // And no caller in the shell reaches for the raise-only half on its own.
    expect(shell).not.toContain('window.api.deskwinFocusDesktop');
    expect(shell).toContain('focusOrOpenDesktop');

    // A refusal reaches the user rather than only the console.
    expect(shell).toContain("t('desktop.switch.onAnotherDisplay'");
    expect(shell).toContain("t('desktop.switch.failed'");
  });

  /**
   * Boss-audit F4 (2026-09-08). The two assertions above are satisfied by the
   * KEY being referenced, which is exactly what let three failure toasts ship
   * announcing themselves as successes: `showOsToast` defaults to `kind = 'ok'`,
   * so an unqualified call draws the success edge and is queued politely behind
   * whatever the screen reader was already saying.
   *
   * This reads the calls rather than the keys, and it generalises — a NEW
   * unqualified call site fails it too, which a list of three line numbers
   * would not.
   */
  it('every toast in the shell states its severity instead of defaulting to ok', async () => {
    const fs = await import('node:fs');
    const shell = fs.readFileSync('src/renderer/components/DesktopShell.tsx', 'utf8');

    const calls: Array<{ line: number; text: string }> = [];
    const needle = 'showOsToast(';
    for (let i = shell.indexOf(needle); i !== -1; i = shell.indexOf(needle, i + 1)) {
      let depth = 0;
      let end = i + needle.length - 1;
      for (; end < shell.length; end++) {
        if (shell[end] === '(') depth++;
        else if (shell[end] === ')' && --depth === 0) break;
      }
      calls.push({ line: shell.slice(0, i).split('\n').length, text: shell.slice(i, end + 1) });
    }

    // Guards the scanner itself: if the extraction breaks, this fails loudly
    // rather than reporting a clean sweep over nothing.
    expect(calls.length).toBeGreaterThanOrEqual(7);

    const unqualified = calls
      .filter((c) => !/'(ok|muted|warn|warning|err|error)'/.test(c.text))
      .map((c) => `${c.line}: ${c.text.split('\n')[0]}`);
    expect(unqualified).toEqual([]);
  });

  it('steps the keyboard shortcut through the same ring the switcher shows', async () => {
    const fs = await import('node:fs');
    const shell = fs.readFileSync('src/renderer/components/DesktopShell.tsx', 'utf8');
    const at = shell.indexOf('const onSwitchDesktop =');
    expect(at).toBeGreaterThan(-1);
    const body = shell.slice(at, at + 900);
    expect(body).toContain('switchableRef.current');
    // The old two-desktop toggle, which could not reach a torn-off desktop.
    expect(body).not.toContain('current === 0 ? 1 : 0');
  });
});
