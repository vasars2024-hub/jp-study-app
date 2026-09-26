// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * No Electron default menu.
 *
 * `autoHideMenuBar` only hid it: Alt revealed File/Edit/View/Window, and its role
 * accelerators (Ctrl+W close, Ctrl+R reload, F11, Ctrl+=/-/0 page zoom) sat under
 * the app's own bindings for the same keys. Editing chords must keep working: on
 * Windows/Linux Chromium handles them in editable fields without a menu, on macOS the
 * Edit menu roles carry them — and the dev-only DevTools hook must never eat them.
 */

type InputHandler = (event: { preventDefault: () => void }, input: Record<string, unknown>) => void;

const h = vi.hoisted(() => ({
  applicationMenu: 'default' as unknown,
  built: [] as unknown[],
  appListeners: new Map<string, (...a: unknown[]) => void>(),
  isPackaged: true,
}));

vi.mock('electron', () => ({
  Menu: {
    setApplicationMenu: (menu: unknown) => {
      h.applicationMenu = menu;
    },
    buildFromTemplate: (template: unknown[]) => {
      h.built.push(template);
      return { template };
    },
  },
  app: {
    get isPackaged() {
      return h.isPackaged;
    },
    on: (event: string, cb: (...a: unknown[]) => void) => {
      h.appListeners.set(event, cb);
    },
  },
}));

const mod = await import('../appMenu');

const originalPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

function fakeWindow() {
  let handler: InputHandler | null = null;
  const toggleDevTools = vi.fn();
  return {
    toggleDevTools,
    press(input: Partial<Record<'key' | 'type', string> & Record<'control' | 'shift' | 'alt' | 'meta', boolean>>) {
      const event = { preventDefault: vi.fn() };
      handler!(event, { type: 'keyDown', control: false, shift: false, alt: false, meta: false, ...input });
      return event.preventDefault.mock.calls.length > 0;
    },
    win: {
      webContents: {
        on: (event: string, cb: InputHandler) => {
          if (event === 'before-input-event') handler = cb;
        },
        toggleDevTools,
      },
    },
  };
}

beforeEach(() => {
  h.applicationMenu = 'default';
  h.built = [];
  h.appListeners.clear();
  h.isPackaged = true;
});

afterEach(() => setPlatform(originalPlatform));

describe('application menu', () => {
  it('removes the default menu on Windows and Linux', () => {
    for (const p of ['win32', 'linux'] as const) {
      setPlatform(p);
      h.applicationMenu = 'default';
      mod.installAppMenu();
      expect(h.applicationMenu).toBeNull();
    }
  });

  it('on macOS keeps only the app, Edit and Window roles — Edit carries Cmd+C/V/X/Z/A', () => {
    setPlatform('darwin');
    mod.installAppMenu();
    expect(h.applicationMenu).not.toBeNull();
    const roles = (h.built.at(-1) as { role?: string }[]).map((item) => item.role);
    expect(roles).toEqual(['appMenu', 'editMenu', 'windowMenu']);
    // No View menu: its reload / zoom / fullscreen roles are the conflicting ones.
    expect(roles).not.toContain('viewMenu');
  });

  it('packaged builds get no DevTools accelerator', () => {
    setPlatform('win32');
    mod.installAppMenu();
    expect(h.appListeners.has('browser-window-created')).toBe(false);
  });
});

describe('development DevTools accelerator', () => {
  it('toggles DevTools on Ctrl+Shift+I and F12 in every new window', () => {
    setPlatform('win32');
    h.isPackaged = false;
    mod.installAppMenu();
    const w = fakeWindow();
    h.appListeners.get('browser-window-created')!({}, w.win);
    expect(w.press({ key: 'I', control: true, shift: true })).toBe(true);
    expect(w.press({ key: 'F12' })).toBe(true);
    expect(w.toggleDevTools).toHaveBeenCalledTimes(2);
  });

  it('never blocks the editing chords, or any other key', () => {
    setPlatform('win32');
    const w = fakeWindow();
    mod.attachDevToolsAccelerator(w.win as never);
    for (const key of ['c', 'v', 'x', 'z', 'y', 'a']) {
      expect(w.press({ key, control: true }), `Ctrl+${key.toUpperCase()}`).toBe(false);
    }
    expect(w.press({ key: 'z', control: true, shift: true })).toBe(false);
    expect(w.press({ key: 'i', control: true })).toBe(false);
    expect(w.press({ key: 'I', control: true, shift: true, type: 'keyUp' })).toBe(false);
    expect(w.toggleDevTools).not.toHaveBeenCalled();
  });
});
