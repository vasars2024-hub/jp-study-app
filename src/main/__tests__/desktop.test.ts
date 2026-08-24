// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';

// desktop.ts builds its store at module scope, which needs the userData path
// and the IPC surface. sanitizeWindow itself is pure, so stubbing both is enough.
vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { sanitizeWindow } = await import('../desktop');

// Every persisted window field has to survive sanitizeWindow. The main process
// echoes the sanitized layout straight back into renderer state, so a field this
// function forgets is not merely lost on restart — it is reverted mid-session,
// a beat after the user sets it. That is how always-on-top pinning first broke.
describe('sanitizeWindow', () => {
  const base = { id: 'w1', section: 'dictionary', x: 10, y: 20, w: 300, h: 400, z: 5 };

  it('keeps a pinned window pinned', () => {
    expect(sanitizeWindow({ ...base, pinned: true })?.pinned).toBe(true);
  });

  it('accepts the renderer-side `pin` alias, like `max` for `maximized`', () => {
    expect(sanitizeWindow({ ...base, pin: true })?.pinned).toBe(true);
    expect(sanitizeWindow({ ...base, max: true })?.maximized).toBe(true);
  });

  it('defaults pinned to false rather than undefined', () => {
    expect(sanitizeWindow(base)?.pinned).toBe(false);
  });

  it('preserves geometry and visibility', () => {
    const out = sanitizeWindow({ ...base, min: true, rect: { x: 1, y: 2, w: 3, h: 4 } });
    expect(out).toMatchObject({
      id: 'w1',
      x: 10,
      y: 20,
      w: 300,
      h: 400,
      z: 5,
      visible: false,
      restoreRect: { x: 1, y: 2, w: 3, h: 4 },
    });
  });

  it('rejects entries without an id or section', () => {
    expect(sanitizeWindow({ ...base, id: undefined })).toBeNull();
    expect(sanitizeWindow({ ...base, section: 42 })).toBeNull();
    expect(sanitizeWindow(null)).toBeNull();
  });

  // Measured on a live boot: a persisted window with `section: 'media'` — the
  // Start menu's media CATEGORY id, never an app — restored as an 820x580
  // window whose `.fwin-body` held zero child nodes, every boot, permanently.
  // `AppSection` has no `media` case and `agentNavigation` already refuses the
  // same id, so this layer was the only one accepting it silently.
  describe('retired section ids', () => {
    it('repairs `media` to the media shell it used to mean', () => {
      expect(sanitizeWindow({ ...base, section: 'media' })?.section).toBe('player');
    });

    it('leaves a live section alone', () => {
      for (const section of ['dictionary', 'player', 'video', 'note', 'settings']) {
        expect(sanitizeWindow({ ...base, section })?.section).toBe(section);
      }
    });

    // Deliberately kept, not dropped: deleting the row would remove part of the
    // user's layout and userData has no restore point. The renderer's honest
    // "no longer available" state is what makes the kept row safe to keep.
    it('keeps an id it cannot repair instead of dropping the window', () => {
      const out = sanitizeWindow({ ...base, section: 'nonesuch' });
      expect(out).not.toBeNull();
      expect(out?.section).toBe('nonesuch');
    });
  });

  // Liquid presentation (L3.2) is the field the comment above predicted. Live:
  // the window went liquid at t+26ms and reverted to standard at t+630ms,
  // because this allowlist dropped `presentation` and main echoed the stripped
  // layout back. Every assertion below is one half of that measured defect.
  describe('liquid presentation', () => {
    const liquid = { v: 1, mode: 'liquid', standardRect: { x: 1, y: 2, w: 3, h: 4 }, standardMaximized: false };

    it('keeps a liquid window liquid', () => {
      const out = sanitizeWindow({ ...base, presentation: liquid });
      expect(out?.presentation?.mode).toBe('liquid');
      expect(out?.presentation?.standardRect).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    });

    it('omits the key entirely for a conventional window', () => {
      // Not `toBeUndefined()`: that passes for a present key with an undefined
      // value, which would grow every pre-L3 layout blob by a field it never had.
      expect(Object.keys(sanitizeWindow(base) ?? {})).not.toContain('presentation');
    });

    it.each([
      ['liquid with nowhere to return to', { v: 1, mode: 'liquid' }],
      ['a stored standard, which is the absence of the field', { v: 1, mode: 'standard' }],
      ['a version this build cannot read', { v: 99, mode: 'liquid', standardRect: { x: 1, y: 2, w: 3, h: 4 } }],
      ['a zero-size rect', { v: 1, mode: 'liquid', standardRect: { x: 0, y: 0, w: 0, h: 4 } }],
      ['a string', 'liquid'],
    ])('drops %s rather than shipping it to every window', (_label, presentation) => {
      const out = sanitizeWindow({ ...base, presentation });
      expect(Object.keys(out ?? {})).not.toContain('presentation');
      // Corruption in one field must not cost the window its geometry.
      expect(out).toMatchObject({ id: 'w1', x: 10, y: 20, w: 300, h: 400 });
    });
  });
});
