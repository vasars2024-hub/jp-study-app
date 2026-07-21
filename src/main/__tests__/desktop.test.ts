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
});
