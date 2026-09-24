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
  const env = {
    userData: '',
    // Mutable so a test can unplug a monitor or change its resolution, which is
    // what `repeat` has to survive without replaying a rectangle somewhere else.
    displays: [
      { id: 7, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
      { id: 9, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 },
    ] as Array<{ id: number; bounds: Electron.Rectangle; scaleFactor: number }>,
    // Electron's cross-scale-factor placement: the next placement lands this many times too small.
    shrinkNextPlacement: 0,
  };
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
      const o = opts as { x?: number; y?: number; width?: number; height?: number };
      this.bounds = FakeWindow.place({ x: o.x ?? 0, y: o.y ?? 0, width: o.width ?? 0, height: o.height ?? 0 });
    }
    static place(b: Electron.Rectangle): Electron.Rectangle {
      const k = env.shrinkNextPlacement;
      env.shrinkNextPlacement = 0;
      return k ? { ...b, width: Math.round(b.width / k), height: Math.round(b.height / k) } : b;
    }
    getBounds = (): Electron.Rectangle => this.bounds as Electron.Rectangle;
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
      this.bounds = FakeWindow.place(b as Electron.Rectangle);
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
      // The cursor is always on the FIRST display in these tests, so a repeat
      // that lands on the second one proves it followed the region rather than
      // the cursor.
      getDisplayNearestPoint: () => h.env.displays[0],
      getAllDisplays: () => h.env.displays,
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

/**
 * Installed-model state, mocked so `lens:ocrEngineStatus` is a decision this
 * suite controls rather than a property of the machine running it. Both modules
 * would otherwise reach the real asset directory, and the same test would then
 * pass or fail depending on which packs a developer has downloaded.
 */
const installed = { manga: true, web: true, webLangs: ['ja'] as string[] };
vi.mock('../mangaOcr', () => ({ mangaOcrAvailable: () => installed.manga }));
vi.mock('../paddleOcr', () => ({
  paddleOcrAvailable: () => installed.web,
  installedPaddleLangs: () => installed.webLangs,
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
  // A .bak without its primary counts as damage and would be reinstated.
  fs.rmSync(path.join(tmpRoot, `${STATE}.bak`), { force: true });
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
  h.env.displays = [
    { id: 7, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 9, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 },
  ];
  h.env.shrinkNextPlacement = 0;
  clearState();
});

// ---- settings load ------------------------------------------------------

describe('loadSettings', () => {
  it('returns the defaults when no state file exists', async () => {
    const m = await load();
    expect(m.__readingLensTestables.loadSettings()).toEqual({
      enabled: true,
      hotkey: 'Ctrl+Shift+Space',
      lastRegion: null,
      defaultEngine: 'auto',
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
    writeState(JSON.stringify({ enabled: 'yes', hotkey: 123, lastRegion: 'nope' }));
    const m = await load();
    expect(m.__readingLensTestables.loadSettings()).toEqual({
      enabled: true,
      hotkey: 'Ctrl+Shift+Space',
      lastRegion: null,
      defaultEngine: 'auto',
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
    expect(m.__readingLensTestables.loadSettings())
      .toEqual({ enabled: false, hotkey: 'Ctrl+Alt+L', lastRegion: null, defaultEngine: 'auto' });
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
    expect(readState())
      .toEqual({ enabled: true, hotkey: 'Ctrl+Alt+L', lastRegion: null, defaultEngine: 'auto' });

    const fresh = await load();
    expect(fresh.__readingLensTestables.loadSettings()).toEqual({
      enabled: true,
      hotkey: 'Ctrl+Alt+L',
      lastRegion: null,
      defaultEngine: 'auto',
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

// ---- capture history ----------------------------------------------------

/**
 * The five `lens:history:*` handlers, driven through the IPC map rather than by
 * calling the store directly. That is the point: `main/readingLensHistory.ts`
 * has its own pure tests, but nothing else proves the *handlers* are registered,
 * validate their argument, and write the file the next boot reads.
 *
 * The screenshot assertion is the one that must never regress. A lens scan
 * carries a bounded JPEG and the store's whole privacy contract is that it never
 * reaches disk — so it is asserted against the bytes on disk, not against the
 * returned object, because only the file is what a user would find later.
 */
describe('capture history IPC', () => {
  const HISTORY = 'reading-lens-history.json';
  const historyPath = (): string => path.join(tmpRoot, HISTORY);
  const readHistoryRaw = (): string => fs.readFileSync(historyPath(), 'utf8');

  const capture = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
    captureId: 'cap-1',
    source: 'screen',
    sourceLabel: 'Steam — VN',
    sourceRef: 'game://vn/ch1',
    capturedAt: 1_700_000_000_000,
    language: 'ja',
    engine: 'auto',
    hash: 'h1',
    text: '猫が好きです',
    lines: [{ text: '猫が好きです', box: [0, 0, 100, 20] }],
    ...patch,
  });

  const handler = (channel: string): ((...a: unknown[]) => unknown) => {
    const fn = h.ipc.handlers.get(channel);
    if (!fn) throw new Error(`no handler registered for ${channel}`);
    return fn;
  };

  async function withHistory() {
    const m = await load();
    m.registerReadingLensIpc();
    return {
      record: (value: unknown) => handler('lens:history:record')({}, value),
      list: (query?: unknown) => handler('lens:history:list')({}, query),
      pin: (id: unknown, pinned: unknown) => handler('lens:history:pin')({}, id, pinned),
      remove: (id: unknown) => handler('lens:history:remove')({}, id),
      clear: () => handler('lens:history:clear')({}),
    };
  }

  it('shares the established history location with Files catalogue consumers', async () => {
    const { READING_LENS_HISTORY_FILE } = await import('../readingLensHistory');
    expect(READING_LENS_HISTORY_FILE).toBe(HISTORY);
  });

  beforeEach(() => {
    fs.rmSync(historyPath(), { force: true });
    // The store keeps a last-good copy; without clearing it a later "corrupt
    // file" case would (correctly) recover the previous test's history.
    fs.rmSync(`${historyPath()}.bak`, { force: true });
  });

  it('records a capture and reads it back', async () => {
    const api = await withHistory();
    await api.record(capture());

    const listed = (await api.list()) as Array<{ captureId: string; text: string }>;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ captureId: 'cap-1', text: '猫が好きです' });
  });

  it('never writes the screenshot to disk', async () => {
    const api = await withHistory();
    await api.record(
      capture({ screenshotDataUrl: `data:image/jpeg;base64,${'A'.repeat(4_000)}` }),
    );

    const raw = readHistoryRaw();
    expect(raw).not.toContain('data:image');
    expect(raw).not.toContain('screenshotDataUrl');
    expect(raw.length).toBeLessThan(2_000);
  });

  it('survives a restart — the file is what the next boot reads', async () => {
    const first = await withHistory();
    await first.record(capture());

    const second = await withHistory();
    expect((await second.list()) as unknown[]).toHaveLength(1);
  });

  it('pins without incrementing sightings and preserves the pin across restart', async () => {
    const first = await withHistory();
    await first.record(capture());

    expect(await first.pin('cap-1', true)).toMatchObject({ pinned: true, seenCount: 1 });
    expect(JSON.parse(readHistoryRaw()).entries[0].pinned).toBe(true);

    const second = await withHistory();
    expect((await second.list()) as Array<{ pinned: boolean }>).toMatchObject([{ pinned: true }]);
  });

  it('degrades a corrupt history file to empty rather than taking the handler down', async () => {
    fs.writeFileSync(historyPath(), '{ not json', 'utf8');
    const api = await withHistory();

    expect((await api.list()) as unknown[]).toEqual([]);
  });

  it('rejects a payload that is not a capture instead of storing garbage', async () => {
    const api = await withHistory();

    expect(await api.record(null)).toBeNull();
    expect(await api.record({ nope: true })).toBeNull();
    expect(fs.existsSync(historyPath())).toBe(false);
  });

  it('searches through the handler, not only in the renderer', async () => {
    const api = await withHistory();
    await api.record(capture({ captureId: 'a', hash: 'ha', text: '猫が好きです' }));
    await api.record(capture({ captureId: 'b', hash: 'hb', text: '犬も好きです' }));

    const hits = (await api.list({ query: '犬' })) as Array<{ captureId: string }>;
    expect(hits.map((e) => e.captureId)).toEqual(['b']);
  });

  it('forgets one capture and clears the rest', async () => {
    const api = await withHistory();
    await api.record(capture({ captureId: 'a', hash: 'ha' }));
    await api.record(capture({ captureId: 'b', hash: 'hb', text: '犬も好きです' }));

    expect(await api.remove('a')).toBe(1);
    expect((await api.list()) as unknown[]).toHaveLength(1);

    await api.clear();
    expect((await api.list()) as unknown[]).toEqual([]);
    // Rewritten empty rather than deleted, so the next read does not have to
    // tell "cleared" apart from "never used".
    expect(fs.existsSync(historyPath())).toBe(true);
  });

  it('does not throw when the history file cannot be written', async () => {
    const api = await withHistory();
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('EACCES');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await api.record(capture())).toMatchObject({ captureId: 'cap-1' });
    expect(errSpy).toHaveBeenCalled();

    spy.mockRestore();
    errSpy.mockRestore();
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

// ---- repeat-region ------------------------------------------------------

describe('repeat region', () => {
  async function booted() {
    const m = await load();
    m.startReadingLens();
    m.registerReadingLensIpc();
    return m;
  }
  const init = (): { mode: string; region?: unknown; bounds: Electron.Rectangle } =>
    h.ipc.handlers.get('lens:getInit')!() as never;
  const status = async (): Promise<{ canRepeatRegion: boolean; lastRegion: unknown }> =>
    (await h.ipc.handlers.get('lens:getSettings')!()) as never;
  /**
   * The real sequence, and it matters: `lensDisplayId` is only set by an open,
   * so an OCR call with no open before it records display 0 — which
   * `normalizeLensRegionMemory` refuses. Every scan here opens first.
   */
  const scan = async (region: Record<string, unknown>): Promise<void> => {
    await h.ipc.handlers.get('lens:open')!({}, 'select');
    await h.ipc.handlers.get('lens:ocr')!({}, region);
  };

  it('remembers the rectangle the OCR handler was actually given', async () => {
    await booted();
    await scan({ x: 100, y: 200, width: 300, height: 80 });
    expect((await status()).lastRegion)
      .toEqual({ displayId: 7, x: 100, y: 200, width: 300, height: 80 });
  });

  it('records nothing when the OCR arrives with no open behind it', async () => {
    await booted();
    await h.ipc.handlers.get('lens:ocr')!({}, { x: 100, y: 200, width: 300, height: 80 });
    expect((await status()).lastRegion).toBeNull();
  });

  it('replays it without a drag, and reports the region on the init', async () => {
    await booted();
    await scan({ x: 100, y: 200, width: 300, height: 80 });
    await h.ipc.handlers.get('lens:open')!({}, 'repeat');
    expect(init().mode).toBe('repeat');
    expect(init().region).toEqual({ x: 100, y: 200, width: 300, height: 80 });
  });

  it('follows the region’s display, not the cursor’s', async () => {
    await booted();
    // The stub's cursor is always on displays[0]; make that display 9 for the
    // scan, then put the cursor back on 7 for the repeat.
    h.env.displays[0] = { id: 9, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 };
    await scan({ x: 5, y: 5, width: 40, height: 40 });
    h.env.displays[0] = { id: 7, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
    h.env.displays[1] = { id: 9, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 };
    await h.ipc.handlers.get('lens:open')!({}, 'repeat');
    expect(init().bounds).toEqual({ x: 1920, y: 0, width: 2560, height: 1440 });
    // Control: an ordinary open on the same state follows the cursor to 7.
    await h.ipc.handlers.get('lens:open')!({}, 'select');
    expect(init().bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('covers the whole second monitor even when Electron places it at the wrong scale', async () => {
    // Measured: 1280×720 @150% primary + 1920×1080 @100% second monitor → a 1280×720 overlay.
    await booted();
    h.env.displays = [
      { id: 7, bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1.5 },
      { id: 9, bounds: { x: 1280, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    ];
    h.env.displays.reverse(); // the stub's cursor is on displays[0]
    h.env.shrinkNextPlacement = 1.5;
    await h.ipc.handlers.get('lens:open')!({}, 'select');
    const lensWin = h.FakeWindow.all.filter((w) => !w.destroyed).pop()!;
    expect(lensWin.getBounds()).toEqual({ x: 1280, y: 0, width: 1920, height: 1080 });
    // Moving the open overlay to the other monitor goes through the same correction.
    h.env.displays.reverse();
    h.env.shrinkNextPlacement = 1 / 1.5;
    await h.ipc.handlers.get('lens:open')!({}, 'select');
    expect(lensWin.getBounds()).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it('degrades to an ordinary selection when the region’s monitor is gone', async () => {
    await booted();
    h.env.displays[0] = { id: 9, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 };
    await scan({ x: 5, y: 5, width: 40, height: 40 });
    // Unplug display 9 entirely.
    h.env.displays = [{ id: 7, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }];
    await h.ipc.handlers.get('lens:open')!({}, 'repeat');
    expect(init().mode).toBe('select');
    expect(init().region).toBeUndefined();
    // And the button that offers it says so, rather than staying enabled.
    expect((await status()).canRepeatRegion).toBe(false);
    // The memory itself is untouched — plug the monitor back in and it replays.
    expect((await status()).lastRegion).toEqual({ displayId: 9, x: 5, y: 5, width: 40, height: 40 });
  });

  it('degrades when the display shrank out from under the region', async () => {
    await booted();
    await scan({ x: 1400, y: 900, width: 400, height: 150 });
    expect((await status()).canRepeatRegion).toBe(true); // control: fits at 1920x1080
    h.env.displays[0] = { id: 7, bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1 };
    expect((await status()).canRepeatRegion).toBe(false);
    await h.ipc.handlers.get('lens:open')!({}, 'repeat');
    expect(init().mode).toBe('select');
  });

  it('has nothing to repeat before the first scan', async () => {
    await booted();
    expect((await status()).canRepeatRegion).toBe(false);
    await h.ipc.handlers.get('lens:open')!({}, 'repeat');
    expect(init().mode).toBe('select');
  });

  it('does not remember a stray click the renderer would have ignored', async () => {
    await booted();
    await scan({ x: 10, y: 10, width: 4, height: 4 });
    expect((await status()).lastRegion).toBeNull();
    expect((await status()).canRepeatRegion).toBe(false);
  });

  it('survives a restart — the file is what the next boot replays', async () => {
    await booted();
    await scan({ x: 60, y: 70, width: 80, height: 90 });
    expect((readState() as { lastRegion: unknown }).lastRegion)
      .toEqual({ displayId: 7, x: 60, y: 70, width: 80, height: 90 });
    await booted();
    expect((await status()).lastRegion)
      .toEqual({ displayId: 7, x: 60, y: 70, width: 80, height: 90 });
    await h.ipc.handlers.get('lens:open')!({}, 'repeat');
    expect(init().region).toEqual({ x: 60, y: 70, width: 80, height: 90 });
  });

  it('drops a hand-edited region rather than scanning a garbage rectangle', async () => {
    for (const bad of [
      { displayId: 7, x: -5, y: 0, width: 50, height: 50 },
      { displayId: 7, x: 0, y: 0, width: 50, height: Number.NaN },
      { displayId: 0, x: 0, y: 0, width: 50, height: 50 },
      { displayId: 7, x: 0, y: 0, width: 3, height: 50 },
      'not an object',
      [7, 0, 0, 50, 50],
    ]) {
      writeState(JSON.stringify({ enabled: true, hotkey: 'Ctrl+Shift+Space', lastRegion: bad }));
      await booted();
      expect((await status()).lastRegion).toBeNull();
    }
    // Control: the same shape, valid, does load — so the refusals above are the
    // named rules and not a branch that rejects everything.
    writeState(JSON.stringify({
      enabled: true,
      hotkey: 'Ctrl+Shift+Space',
      lastRegion: { displayId: 7, x: 0, y: 0, width: 50, height: 50 },
    }));
    await booted();
    expect((await status()).lastRegion).toEqual({ displayId: 7, x: 0, y: 0, width: 50, height: 50 });
  });

  it('broadcasts the change so an open Settings page can enable its button', async () => {
    await booted();
    await h.ipc.handlers.get('lens:open')!({}, 'select');
    h.sent.length = 0;
    await h.ipc.handlers.get('lens:ocr')!({}, { x: 1, y: 2, width: 300, height: 80 });
    const pushed = h.sent.filter((s) => s.channel === 'lens:settings-changed');
    expect(pushed.length).toBe(1);
    expect((pushed[0].payload as { canRepeatRegion: boolean }).canRepeatRegion).toBe(true);
    // Re-scanning the SAME rectangle writes and broadcasts nothing.
    h.sent.length = 0;
    await h.ipc.handlers.get('lens:ocr')!({}, { x: 1, y: 2, width: 300, height: 80 });
    expect(h.sent.filter((s) => s.channel === 'lens:settings-changed').length).toBe(0);
  });

  it('still hands the OCR the rectangle it was called with', async () => {
    await booted();
    await scan({ x: 1, y: 2, width: 300, height: 80 });
    expect(ocrCalls[0][0]).toEqual({ x: 1, y: 2, width: 300, height: 80 });
    expect(ocrCalls[0][1]).toBe(7);
  });
});

describe('IPC registration', () => {
  it('registers every channel preload expects', async () => {
    const m = await load();
    m.registerReadingLensIpc();
    for (const ch of ['lens:getSettings', 'lens:setEnabled', 'lens:setHotkey', 'lens:open', 'lens:getInit', 'lens:ocr', 'lens:close', 'lens:history:record', 'lens:history:list', 'lens:history:pin', 'lens:history:remove', 'lens:history:clear']) {
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

// ---- OCR engine default -------------------------------------------------

describe('default OCR engine', () => {
  async function booted() {
    const m = await load();
    m.startReadingLens();
    m.registerReadingLensIpc();
    return m;
  }

  const init = (): { defaultEngine: string } => h.ipc.handlers.get('lens:getInit')!() as never;
  const setEngine = async (engine: unknown): Promise<{ defaultEngine: string }> =>
    (await h.ipc.handlers.get('lens:setDefaultEngine')!({}, engine)) as never;

  it('starts on auto and reports it on the status', async () => {
    await booted();
    const status = (await h.ipc.handlers.get('lens:getSettings')!()) as { defaultEngine: string };
    expect(status.defaultEngine).toBe('auto');
  });

  it('persists a choice and reads it back on the next boot', async () => {
    await booted();
    expect((await setEngine('manga')).defaultEngine).toBe('manga');
    expect((readState() as { defaultEngine: string }).defaultEngine).toBe('manga');
    const fresh = await load();
    expect(fresh.__readingLensTestables.loadSettings().defaultEngine).toBe('manga');
  });

  it('carries the choice into the init the lens window opens with', async () => {
    // The lens window is created and scanning in the same tick as the hotkey,
    // so the default has to arrive *with* the open. A second IPC the overlay
    // had to await would leave the first capture of a session on auto.
    await booted();
    await setEngine('web');
    await h.ipc.handlers.get('lens:open')!({}, 'select');
    expect(init().defaultEngine).toBe('web');
  });

  it('falls back to the default on an unknown stored value, not to a neighbour', async () => {
    writeState(JSON.stringify({ defaultEngine: 'Manga' }));
    const m = await load();
    expect(m.__readingLensTestables.loadSettings().defaultEngine).toBe('auto');
  });

  it('refuses an unknown value over IPC too', async () => {
    await booted();
    expect((await setEngine({ engine: 'manga' })).defaultEngine).toBe('auto');
    expect((await setEngine('paddle')).defaultEngine).toBe('auto');
  });

  it('reports which recognizers are installed, live', async () => {
    await booted();
    installed.manga = true;
    installed.web = true;
    installed.webLangs = ['ja', 'en'];
    expect(await h.ipc.handlers.get('lens:ocrEngineStatus')!())
      .toEqual({ manga: true, web: true, webLangs: ['ja', 'en'], none: false });

    // Read live on every call, not cached at boot: a pack downloaded from the
    // Assets surface while the app runs must change this answer without a
    // restart, or Settings keeps warning about an engine that now works.
    installed.manga = false;
    installed.web = false;
    installed.webLangs = [];
    expect(await h.ipc.handlers.get('lens:ocrEngineStatus')!())
      .toEqual({ manga: false, web: false, webLangs: [], none: true });
    installed.manga = true;
    installed.web = true;
    installed.webLangs = ['ja'];
  });
});
