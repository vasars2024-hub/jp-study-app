/**
 * L11 bullet 4, clause 3 — the neighbour ring, and the monitors that are not there.
 *
 * The fixture is not invented: it is this machine's real stored state on
 * 2026-09-01, read out of `desktop-layout.json`, beside the three display keys
 * `window.api.displayList()` actually returned. That is the shape the defect
 * needs — a store that has outlived several monitor arrangements — and it is not
 * a shape anyone would have written by hand.
 */
import { describe, expect, it } from 'vitest';
import type { DisplayAssignment } from '../../shared/desktop';
import { neighbourDisplayKey } from '../monitorRing';

function assign(displayKey: string, desktopIndex: number, enabled: boolean): DisplayAssignment {
  return { displayKey, desktopIndex, enabled, aero: true, taskbar: 'full', showAllWindows: false };
}

/** Verbatim from this profile's `desktop-layout.json`, 2026-09-01. */
const STORED: DisplayAssignment[] = [
  assign('display|1920x1080|1', 0, true),
  assign('vdd-by-mtt|800x600|1', 1, false),
  assign('vdd-by-mtt|1920x1080|1', 2, false),
  assign('dell-up3017|2560x1600|1', 3, true),
  assign('dell-up3017|2560x1600|1#2', 4, false),
  assign('dell-up3017|2560x1600|1#1', 5, false),
  assign('display|1920x1080|1#1', 6, true),
  assign('display|1920x1080|1#2', 7, false),
];

/** Verbatim from `window.api.displayList()` on the same machine, same evening. */
const ATTACHED = new Set(['display|1920x1080|1#2', 'vdd-by-mtt|800x600|1', 'display|1920x1080|1#1']);

const ME = 'display|1920x1080|1#1';

describe('the ring only contains monitors that are there', () => {
  it('is empty of neighbours on the real machine, so the move is a no-op', () => {
    // Three assignments are enabled; exactly one of them is attached, and it is
    // this display. There is nowhere to move to, and saying so is the fix.
    expect(neighbourDisplayKey(STORED, ATTACHED, ME, 1)).toBeNull();
    expect(neighbourDisplayKey(STORED, ATTACHED, ME, -1)).toBeNull();
  });

  it('returns the detached monitor when attachment is not consulted', () => {
    // The BEFORE, reproduced: this is what the shell computed until 2026-09-01,
    // and `display|1920x1080|1` is desktop 0 on a display that is not plugged in.
    // Observed live on that ring: the desk went 1 window -> 0, nothing opened.
    expect(neighbourDisplayKey(STORED, null, ME, 1)).toBe('display|1920x1080|1');
  });

  it('finds the neighbour once a second attached display is enabled', () => {
    // The AFTER-B leg, as a unit: enabling `display|1920x1080|1#2` (desktop 7)
    // gave a real neighbour, and the Dictionary window crossed to the desk
    // window at x=2720 and was visible there.
    const withSecond = STORED.map((a) =>
      a.displayKey === 'display|1920x1080|1#2' ? { ...a, enabled: true } : a,
    );
    expect(neighbourDisplayKey(withSecond, ATTACHED, ME, 1)).toBe('display|1920x1080|1#2');
    expect(neighbourDisplayKey(withSecond, ATTACHED, ME, -1)).toBe('display|1920x1080|1#2');
  });
});

describe('the ring itself', () => {
  const THREE: DisplayAssignment[] = [assign('a', 0, true), assign('b', 1, true), assign('c', 2, true)];
  const ALL = new Set(['a', 'b', 'c']);

  it('wraps in both directions', () => {
    expect(neighbourDisplayKey(THREE, ALL, 'a', 1)).toBe('b');
    expect(neighbourDisplayKey(THREE, ALL, 'c', 1)).toBe('a');
    expect(neighbourDisplayKey(THREE, ALL, 'a', -1)).toBe('c');
  });

  it('treats dir as a direction, not a distance', () => {
    // `(here + dir) % len` with a stray detail of 2 on a 3-ring silently lands on
    // the PREVIOUS monitor, which reads to the user as the key going backwards.
    expect(neighbourDisplayKey(THREE, ALL, 'a', 2)).toBe('b');
    expect(neighbourDisplayKey(THREE, ALL, 'a', -5)).toBe('c');
    expect(neighbourDisplayKey(THREE, ALL, 'a', 0)).toBe('b');
  });

  it('has no neighbour with one enabled display, or none', () => {
    expect(neighbourDisplayKey([assign('a', 0, true)], ALL, 'a', 1)).toBeNull();
    expect(neighbourDisplayKey([], ALL, 'a', 1)).toBeNull();
  });

  it('answers null rather than guessing when this display is not in the ring', () => {
    // A shell on a display the user has disabled. Moving "next" from outside the
    // ring has no defined meaning, and picking index 0 would be a lottery.
    const disabledMe = THREE.map((a) => (a.displayKey === 'a' ? { ...a, enabled: false } : a));
    expect(neighbourDisplayKey(disabledMe, ALL, 'a', 1)).toBeNull();
  });

  it('never filters on an unresolved display list', () => {
    // `displayList()` is async. Filtering against an empty set during the first
    // frame would report no neighbours on a machine that has three.
    expect(neighbourDisplayKey(THREE, null, 'a', 1)).toBe('b');
    // And the control that this is really the `null` branch, not a coincidence:
    // an empty SET is knowledge — it means nothing is attached.
    expect(neighbourDisplayKey(THREE, new Set(), 'a', 1)).toBeNull();
  });

  it('needs a display key of its own', () => {
    expect(neighbourDisplayKey(THREE, ALL, '', 1)).toBeNull();
  });
});
