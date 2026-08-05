// @vitest-environment node
/**
 * Reading Lens lifecycle tests.
 *
 * `readingLens.ts` is enabled by default and claims an OS-level global
 * accelerator at boot (`Ctrl+Shift+Space`). Two things therefore matter more
 * than anything else it does, and neither had a test:
 *
 *  - **Boot must not throw.** `startReadingLens()` runs during app startup, so a
 *    corrupt `reading-lens.json` — truncated by a crash, hand-edited, or written
 *    by an older build — must degrade to defaults rather than take the main
 *    process down before any window exists to report it.
 *  - **The accelerator must not leak.** Every path that changes the hotkey or
 *    disables the Lens has to unregister the old one first, or the app holds an
 *    OS-wide key combination nothing can release short of a restart.
 *
 * Electron is stubbed; no window is created and no real shortcut is claimed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---- Electron stub ------------------------------------------------------

const h = vi.hoisted(() => {
  const shortcut = {
    registered: new Map<string, () => void>(),
    registerCalls: [] as string[],
    unregisterCalls: [] as string[],
    registerReturns: true,
    registerThrows: null as Error | null,
    unregisterThrows: null as Error | null,
  };
  const ipc = {
    handlers: new Map<string, (...a: unknown[]) => unknown>(),
    listeners: new Map<string, (...a: unknown[]) => unknown>(),
  };
  const env = { userData: '' };
  const sent: Array<{ channel: string; payload: unknown }> = [];

  class FakeWebContents {
    on = (): void => undefined;
    send = (channel: string, payload: unknown): void => {
      sent.push({ channel, payload });
    };
  }
  class FakeWindow {
    static all: FakeWindow[] = [];
    destroyed = false;
    visible = false;
    ignoreMouse: unknown = null;
    bounds: unknown = null;
    webContents = new FakeWebContents();
    constructor(public opts: unknown) {
      FakeWindow.all.push(this);
    }
    setAlwaysOnTop = (): void => undefined;
    setVisibleOnAllWorkspaces = (): void => undefined;
    once = (_e: string, cb: () => void): void => {
      if (_e === 'ready-to-show') cb();
    };
    on = (): void => undefined;
    loadURL = async (): Promise<void> => undefined;
    isDestroyed = (): boolean => this.destroyed;
    isVisible = (): boolean => this.visible;
    show = (): void => {
      this.visible = true;
    };
    focus = (): void => undefined;
    hide = (): void => {
      this.visible = false;
    };
    destroy = (): void => {
      this.destroyed = true;
    };
    setBounds = (b: unknown): void => {
      this.bounds = b;
    };
    setIgnoreMouseEvents = (...a: unknown[]): void => {
      this.ignoreMouse = a;
    };
  }
  return { shortcut, ipc, env, sent, FakeWindow };
});

vi.mock('electron', () => {
  const BrowserWindow = h.FakeWindow as unknown as {
    new (o: unknown): unknown;
    getAllWindows: () => unknown[];
    fromWebContents: (wc: unknown) => unknown;
  };
  (BrowserWindow as unknown as { getAllWindows: () => unknown[] }).getAllWindows = () =>
    h.FakeWindow.all.filter((w) => !w.destroyed);
  (BrowserWindow as unknown as { fromWebContents: (wc: unknown) => unknown }).fromWebContents = (wc) =>
    h.FakeWindow.all.find((w) => w.webContents === wc) ?? null;
  return {
    app: { getPath: () => h.env.userData },
    BrowserWindow,
    globalShortcut: {
      register: (acc: string, cb: () => void) => {
        h.shortcut.registerCalls.push(acc);
        if (h.shortcut.registerThrows) throw h.shortcut.registerThrows;
        if (!h.shortcut.registerReturns) return false;
        h.shortcut.registered.set(acc, cb);
        return true;
      },
      unregister: (acc: string) => {
        h.shortcut.unregisterCalls.push(acc);
        if (h.shortcut.unregisterThrows) throw h.shortcut.unregisterThrows;
        h.shortcut.registered.delete(acc);
      },
    },
    ipcMain: {
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipc.handlers.set(ch, fn),
      on: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipc.listeners.set(ch, fn),
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 10, y: 10 }),
      getDisplayNearestPoint: () => ({
        id: 7,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
      }),
    },
  };
});

const ocrCalls: unknown[][] = [];
vi.mock('../screenOcr', () => ({
  ocrRegion: async (...args: unknown[]) => {
    ocrCalls.push(args);
    return { ok: true, engine: 'web', lines: [], text: '', available: true, hash: 'x' };
  },
}));

// ---- harness ------------------------------------------------------------

let tmpRoot = '';
const STATE = 'reading-lens.json';

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-lens-test-'));
  h.env.userData = tmpRoot;
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeState(raw: string): void {
  fs.writeFileSync(path.join(tmpRoot, STATE), raw, 'utf8');
}
function clearState(): void {
  fs.rmSync(path.join(tmpRoot, STATE), { force: true });
}
function readState(): unknown {
  return JSON.parse(fs.readFileSync(path.join(tmpRoot, STATE), 'utf8'));
}

/** Fresh module instance — the module keeps `settings` and the accelerator in module scope. */
async function load() {
  vi.resetModules();
  return import('../readingLens');
}

beforeEach(() => {
  h.shortcut.registered.clear();
  h.shortcut.registerCalls.length = 0;
  h.shortcut.unregisterCalls.length = 0;
  h.shortcut.registerReturns = true;
  h.shortcut.registerThrows = null;
  h.shortcut.unregisterThrows = null;
  h.ipc.handlers.clear();
  h.ipc.listeners.clear();
  h.sent.length = 0;
  h.FakeWindow.all.length = 0;
  ocrCalls.length = 0;
  clearState();
});

// ---- settings load ------------------------------------------------------

describe('loadSettings', () => {
  it('returns the defaults when no state file exists', async () => {
    const m = await load();
    expect(m.__readingLensTestables.loadSettings()).toEqual({
      enabled: true,
      hotkey: 'Ctrl+Shift+Space',
    });
  });

  it('falls back to the defaults on unparseable JSON rather than throwing', async () => {
    writeState('{"enabled": tru');
    const m = await load();
    expect(() => m.__readingLensTestables.loadSettings()).not.toThrow();
    expect(m.__readingLensTestables.loadSettings()).toEqual(m.__readingLensTestables.DEFAULTS);
  });

  it('falls back on valid JSON that is not an object', async () => {
    writeState('"just a string"');
    const m = await load();
    expect(m.__readingLensTestables.loadSettings()).toEqual(m.__readingLensTestables.DEFAULTS);
  });

  it('falls back on an empty file', async () => {
    writeState('');
    const m = await load();
    expect(m.__readingLensTestables.loadSettings()).toEqual(m.__readingLensTestables.DEFAULTS);
  });

  it('repairs each field independently when the stored type is wrong', async () => {
    writeState(JSON.stringify({ enabled: 'yes', hotkey: 123 }));
    const m = await load();
    expect(m.__readingLensTestables.loadSettings()).toEqual({
      enabled: true,
      hotkey: 'Ctrl+Shift+Space',
    });
  });

  it('rejects a whitespace-only hotkey, which would register nothing', async () => {
    writeState(JSON.stringify({ enabled: true, hotkey: '   ' }));
    const m = await load();
    expect(m.__readingLensTestables.loadSettings().hotkey).toBe('Ctrl+Shift+Space');
  });

  it('honours a stored value that is actually valid', async () => {
    writeState(JSON.stringify({ enabled: false, hotkey: 'Ctrl+Alt+L' }));
    const m = await load();
    expect(m.__readingLensTestables.loadSettings()).toEqual({ enabled: false, hotkey: 'Ctrl+Alt+L' });
  });

  it('trims a stored hotkey', async () => {
    writeState(JSON.stringify({ hotkey: '  Ctrl+Alt+L  ' }));
    const m = await load();
    expect(m.__readingLensTestables.loadSettings().hotkey).toBe('Ctrl+Alt+L');
  });
});

describe('startReadingLens', () => {
  it('boots to the default hotkey when the state file is corrupt', async () => {
    writeState('}}}not json{{{');
    const m = await load();
    expect(() => m.startReadingLens()).not.toThrow();
    expect(h.shortcut.registerCalls).toEqual(['Ctrl+Shift+Space']);
  });

  it('registers nothing when the stored settings disable the Lens', async () => {
    writeState(JSON.stringify({ enabled: false, hotkey: 'Ctrl+Alt+L' }));
    const m = await load();
    m.startReadingLens();
    expect(h.shortcut.registerCalls).toEqual([]);
  });

  it('does not throw when the accelerator is already taken by another app', async () => {
    h.shortcut.registerReturns = false;
    const m = await load();
    expect(() => m.startReadingLens()).not.toThrow();
    m.registerReadingLensIpc();
    const status = (await h.ipc.handlers.get('lens:getSettings')!()) as { registered: boolean };
    expect(status.registered).toBe(false);
  });

  it('does not throw when globalShortcut.register itself throws', async () => {
    h.shortcut.registerThrows = new Error('X11 grab failed');
    const m = await load();
    expect(() => m.startReadingLens()).not.toThrow();
  });
});

// ---- accelerator mapping ------------------------------------------------

describe('toAccelerator', () => {
  it('passes a plain chord through unchanged', async () => {
    const { __readingLensTestables: t } = await load();
    expect(t.toAccelerator('Ctrl+Shift+Space')).toBe('Ctrl+Shift+Space');
  });

  it('maps Meta to Electron’s Super', async () => {
    const { __readingLensTestables: t } = await load();
    expect(t.toAccelerator('Meta+K')).toBe('Super+K');
    expect(t.toAccelerator('Ctrl+Meta+Alt+J')).toBe('Ctrl+Super+Alt+J');
  });

  it('takes the first alternative of a pipe-separated chord', async () => {
    const { __readingLensTestables: t } = await load();
    expect(t.toAccelerator('Ctrl+K|Meta+K')).toBe('Ctrl+K');
  });

  it('trims surrounding whitespace', async () => {
    const { __readingLensTestables: t } = await load();
    expect(t.toAccelerator('  Ctrl+K  |Meta+K')).toBe('Ctrl+K');
  });

  it('does not rewrite Meta inside a longer word', async () => {
    const { __readingLensTestables: t } = await load();
    expect(t.toAccelerator('Ctrl+Metal')).toBe('Ctrl+Metal');
  });
});

// ---- registration lifecycle --------------------------------------------

describe('hotkey registration', () => {
  async function booted() {
    const m = await load();
    m.startReadingLens();
    m.registerReadingLensIpc();
    return m;
  }

  it('refuses an accelerator with no modifier instead of asking the OS', async () => {
    const m = await booted();
    h.shortcut.registerCalls.length = 0;
    const res = (await h.ipc.handlers.get('lens:setHotkey')!({}, 'Space')) as {
      ok: boolean;
      error?: string;
      status: { registered: boolean };
    };
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/modifier/i);
    expect(h.shortcut.registerCalls).toEqual([]);
    expect(res.status.registered).toBe(false);
    expect(m).toBeTruthy();
  });

  it('rejects an empty hotkey without disturbing the live registration', async () => {
    await booted();
    const res = (await h.ipc.handlers.get('lens:setHotkey')!({}, '   ')) as {
      ok: boolean;
      error?: string;
      status: { registered: boolean; hotkey: string };
    };
    expect(res.ok).toBe(false);
    expect(res.status.hotkey).toBe('Ctrl+Shift+Space');
    expect(res.status.registered).toBe(true);
    expect(h.shortcut.registered.has('Ctrl+Shift+Space')).toBe(true);
  });

  it('releases the previous accelerator before claiming a new one', async () => {
    await booted();
    expect(h.shortcut.registered.has('Ctrl+Shift+Space')).toBe(true);
    await h.ipc.handlers.get('lens:setHotkey')!({}, 'Ctrl+Alt+L');
    expect(h.shortcut.unregisterCalls).toContain('Ctrl+Shift+Space');
    expect(h.shortcut.registered.has('Ctrl+Shift+Space')).toBe(false);
    expect(h.shortcut.registered.has('Ctrl+Alt+L')).toBe(true);
    expect([...h.shortcut.registered.keys()]).toEqual(['Ctrl+Alt+L']);
  });

  it('reports a busy accelerator by name and holds nothing', async () => {
    await booted();
    h.shortcut.registerReturns = false;
    const res = (await h.ipc.handlers.get('lens:setHotkey')!({}, 'Ctrl+Alt+L')) as {
      ok: boolean;
      error?: string;
    };
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Ctrl+Alt+L');
    expect(res.error).toMatch(/already in use/i);
    expect(h.shortcut.registered.size).toBe(0);
  });

  it('surfaces a register() exception as an error result', async () => {
    await booted();
    h.shortcut.registerThrows = new Error('X11 grab failed');
    const res = (await h.ipc.handlers.get('lens:setHotkey')!({}, 'Ctrl+Alt+L')) as {
      ok: boolean;
      error?: string;
    };
    expect(res.ok).toBe(false);
    expect(res.error).toBe('X11 grab failed');
  });

  it('unregisters cleanly when disabled, and re-registers when re-enabled', async () => {
    await booted();
    await h.ipc.handlers.get('lens:setEnabled')!({}, false);
    expect(h.shortcut.unregisterCalls).toContain('Ctrl+Shift+Space');
    expect(h.shortcut.registered.size).toBe(0);
    let status = (await h.ipc.handlers.get('lens:getSettings')!()) as { registered: boolean };
    expect(status.registered).toBe(false);

    await h.ipc.handlers.get('lens:setEnabled')!({}, true);
    expect(h.shortcut.registered.has('Ctrl+Shift+Space')).toBe(true);
    status = (await h.ipc.handlers.get('lens:getSettings')!()) as { registered: boolean };
    expect(status.registered).toBe(true);
  });

  it('treats any non-true value as disable', async () => {
    await booted();
    await h.ipc.handlers.get('lens:setEnabled')!({}, 'false');
    const status = (await h.ipc.handlers.get('lens:getSettings')!()) as { enabled: boolean };
    expect(status.enabled).toBe(false);
  });

  it('survives an unregister() that throws', async () => {
    await booted();
    h.shortcut.unregisterThrows = new Error('already gone');
    expect(() => h.ipc.handlers.get('lens:setEnabled')!({}, false)).not.toThrow();
  });

  it('releases the accelerator on stop', async () => {
    const m = await booted();
    m.stopReadingLens();
    expect(h.shortcut.unregisterCalls).toContain('Ctrl+Shift+Space');
    expect(h.shortcut.registered.size).toBe(0);
  });

  it('does not double-unregister on a second stop', async () => {
    const m = await booted();
    m.stopReadingLens();
    const after = h.shortcut.unregisterCalls.length;
    m.stopReadingLens();
    expect(h.shortcut.unregisterCalls.length).toBe(after);
  });
});

// ---- persistence --------------------------------------------------------

describe('persistence', () => {
  it('writes a hotkey change to disk and reads it back on the next boot', async () => {
    const m = await load();
    m.startReadingLens();
    m.registerReadingLensIpc();
    await h.ipc.handlers.get('lens:setHotkey')!({}, 'Ctrl+Alt+L');
    expect(readState()).toEqual({ enabled: true, hotkey: 'Ctrl+Alt+L' });

    const fresh = await load();
    expect(fresh.__readingLensTestables.loadSettings()).toEqual({
      enabled: true,
      hotkey: 'Ctrl+Alt+L',
    });
  });

  it('persists the enabled flag', async () => {
    const m = await load();
    m.startReadingLens();
    m.registerReadingLensIpc();
    await h.ipc.handlers.get('lens:setEnabled')!({}, false);
    expect(readState()).toMatchObject({ enabled: false });
  });

  it('does not throw when the state file cannot be written', async () => {
    const m = await load();
    m.startReadingLens();
    m.registerReadingLensIpc();
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('EACCES');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => h.ipc.handlers.get('lens:setEnabled')!({}, false)).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    spy.mockRestore();
    errSpy.mockRestore();
  });

  it('puts the state file in userData under a stable name', async () => {
    const { __readingLensTestables: t } = await load();
    expect(t.statePath()).toBe(path.join(tmpRoot, 'reading-lens.json'));
  });
});

// ---- IPC surface --------------------------------------------------------

describe('lens:ocr region coercion', () => {
  async function booted() {
    const m = await load();
    m.startReadingLens();
    m.registerReadingLensIpc();
    return m;
  }

  it('coerces a garbage region to zeros rather than passing NaN down', async () => {
    await booted();
    await h.ipc.handlers.get('lens:ocr')!({}, { x: 'abc', y: undefined, width: {}, height: null });
    expect(ocrCalls[0][0]).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('coerces a missing region object', async () => {
    await booted();
    await h.ipc.handlers.get('lens:ocr')!({}, undefined);
    expect(ocrCalls[0][0]).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('accepts numeric strings from the renderer', async () => {
    await booted();
    await h.ipc.handlers.get('lens:ocr')!({}, { x: '10', y: '20', width: '30', height: '40' });
    expect(ocrCalls[0][0]).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('defaults the engine to auto and the screenshot to off', async () => {
    await booted();
    await h.ipc.handlers.get('lens:ocr')!({}, { x: 1, y: 2, width: 3, height: 4 });
    expect(ocrCalls[0][2]).toEqual({ engine: 'auto', includeScreenshot: false });
  });

  it('only attaches a screenshot on an explicit true', async () => {
    await booted();
    await h.ipc.handlers.get('lens:ocr')!({}, { x: 1, y: 2, width: 3, height: 4, includeScreenshot: 'yes' });
    expect((ocrCalls[0][2] as { includeScreenshot: boolean }).includeScreenshot).toBe(false);
  });
});

describe('IPC registration', () => {
  it('registers every channel preload expects', async () => {
    const m = await load();
    m.registerReadingLensIpc();
    for (const ch of ['lens:getSettings', 'lens:setEnabled', 'lens:setHotkey', 'lens:open', 'lens:getInit', 'lens:ocr', 'lens:close']) {
      expect(h.ipc.handlers.has(ch)).toBe(true);
    }
    expect(h.ipc.listeners.has('lens:setInteractive')).toBe(true);
  });

  it('reports supported only on win32', async () => {
    const m = await load();
    m.registerReadingLensIpc();
    const status = (await h.ipc.handlers.get('lens:getSettings')!()) as { supported: boolean };
    expect(status.supported).toBe(process.platform === 'win32');
  });

  it('has no pending init before the Lens is opened', async () => {
    const m = await load();
    m.registerReadingLensIpc();
    expect(await h.ipc.handlers.get('lens:getInit')!()).toBeNull();
  });

  it('ignores setInteractive from a webContents with no window', async () => {
    const m = await load();
    m.registerReadingLensIpc();
    expect(() => h.ipc.listeners.get('lens:setInteractive')!({ sender: {} }, true)).not.toThrow();
  });
});
