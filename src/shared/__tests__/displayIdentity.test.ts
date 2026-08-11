import { describe, expect, it } from 'vitest';
import {
  PRIMARY_DISPLAY_KEY,
  baseDisplayKey,
  displayKeyFor,
  displayKeysFor,
  isDisplayPresent,
  primaryDisplayKey,
  resolveDisplayKey,
  type DisplayLike,
} from '../displayIdentity';

function display(over: Partial<DisplayLike> & { id: number }): DisplayLike {
  return {
    label: 'Dell U2720Q',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
    primary: false,
    ...over,
  };
}

describe('displayIdentity', () => {
  describe('key stability — the whole reason this module exists', () => {
    it('survives a replug that hands out a new Electron display id', () => {
      // Windows reassigns Display.id when a monitor moves to another port. If
      // the key tracked the id, every per-display setting would be orphaned.
      const before = display({ id: 2001 });
      const after = display({ id: 77 });
      expect(baseDisplayKey(after)).toBe(baseDisplayKey(before));
    });

    it('survives the monitor being moved in the display arrangement', () => {
      const left = display({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
      const right = display({ id: 1, bounds: { x: 2560, y: 0, width: 1920, height: 1080 } });
      expect(baseDisplayKey(right)).toBe(baseDisplayKey(left));
    });

    it('changes when the DPI scale changes, because layout must be re-fitted', () => {
      const at1x = display({ id: 1, scaleFactor: 1 });
      const at125 = display({ id: 1, scaleFactor: 1.25 });
      expect(baseDisplayKey(at125)).not.toBe(baseDisplayKey(at1x));
    });

    it('changes when the resolution changes', () => {
      const hd = display({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
      const uhd = display({ id: 1, bounds: { x: 0, y: 0, width: 3840, height: 2160 } });
      expect(baseDisplayKey(uhd)).not.toBe(baseDisplayKey(hd));
    });

    it('treats floating-point scale noise as the same scale', () => {
      const a = display({ id: 1, scaleFactor: 1.5 });
      const b = display({ id: 1, scaleFactor: 1.5000000000000002 });
      expect(baseDisplayKey(b)).toBe(baseDisplayKey(a));
    });

    it('does not collapse two unlabelled monitors onto one key', () => {
      // `label` is '' on some Windows adapters; `main/displays.ts` substitutes
      // `display-<id>` before calling in, so the two stay distinct.
      const a = display({ id: 1, label: 'display-1' });
      const b = display({ id: 2, label: 'display-2' });
      expect(baseDisplayKey(a)).not.toBe(baseDisplayKey(b));
    });
  });

  describe('identical twins', () => {
    const left = display({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, primary: true });
    const right = display({ id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } });

    it('disambiguates by position', () => {
      const keys = displayKeysFor([left, right]);
      expect(keys[0]).not.toBe(keys[1]);
      expect(keys[0]).toMatch(/#1$/);
      expect(keys[1]).toMatch(/#2$/);
    });

    it('assigns the suffix by arrangement, not by enumeration order', () => {
      // Electron does not promise a stable order from getAllDisplays().
      const forward = displayKeysFor([left, right]);
      const reversed = displayKeysFor([right, left]);
      expect(reversed[1]).toBe(forward[0]);
      expect(reversed[0]).toBe(forward[1]);
    });

    it('does not suffix a display that has no twin', () => {
      const solo = displayKeysFor([left]);
      expect(solo[0]).not.toMatch(/#\d+$/);
    });

    it('falls back to the base key when the twin is unplugged', () => {
      const keys = displayKeysFor([left, right]);
      // Right monitor gone; its stored key still resolves to the survivor's
      // base identity rather than orphaning the assignment.
      expect(resolveDisplayKey(keys[1], [left])).toBe(left);
    });
  });

  describe('resolveDisplayKey', () => {
    const dell = display({ id: 1, primary: true });
    const lg = display({
      id: 2,
      label: 'LG Ultrafine',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      scaleFactor: 2,
    });

    it('matches exactly when the display is present', () => {
      expect(resolveDisplayKey(baseDisplayKey(lg), [dell, lg])).toBe(lg);
    });

    it('returns null for a display that is not attached', () => {
      // An absent display must keep its assignment — the user unplugged a
      // monitor, they did not reset its configuration.
      expect(resolveDisplayKey(baseDisplayKey(lg), [dell])).toBeNull();
      expect(isDisplayPresent(baseDisplayKey(lg), [dell])).toBe(false);
    });

    it('resolves the reserved primary key', () => {
      expect(resolveDisplayKey(PRIMARY_DISPLAY_KEY, [lg, dell])).toBe(dell);
    });

    it('returns null when nothing is attached at all', () => {
      expect(resolveDisplayKey(PRIMARY_DISPLAY_KEY, [])).toBeNull();
    });
  });

  describe('helpers', () => {
    it('primaryDisplayKey picks the primary, not the first', () => {
      const second = display({ id: 2, label: 'LG', primary: true });
      const first = display({ id: 1, label: 'Dell' });
      expect(primaryDisplayKey([first, second])).toBe(baseDisplayKey(second));
    });

    it('primaryDisplayKey falls back to the reserved key with no displays', () => {
      expect(primaryDisplayKey([])).toBe(PRIMARY_DISPLAY_KEY);
    });

    it('displayKeyFor answers with the base key for a non-member display', () => {
      const stranger = display({ id: 9, label: 'Unknown' });
      expect(displayKeyFor(stranger, [display({ id: 1 })])).toBe(baseDisplayKey(stranger));
    });
  });
});
