// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The main-process half of detach: real windows, real geometry, real relay.
 *
 * Electron is mocked the same way `desktopWindows.test.ts` mocks it — a fake
 * `BrowserWindow` that records what it was constructed with and what was sent to it —
 * because the behaviour worth testing is entirely about *which* window gets *what*,
 * and none of it needs a compositor.
 *
 * The two-display fixture is the same mixed-DPI pair for the same reason: scale factor
 * is part of a display key, and a fixture with matching DPI cannot fail a case where
 * the wrong monitor is chosen.
 */

const h = vi.hoisted(() => {
  interface FakeWin {
    id: number;
    destroyed: boolean;
    bounds: { x: number; y: number; width: number; height: number };
    opts: Record<string, unknown>;
    url: string;
    sent: { channel: string; payload: unknown }[];
    listeners: Record<string, (() => void)[]>;
    isDestroyed(): boolean;
    destroy(): void;
    close(): void;
    show(): void;
    focus(): void;
    restore(): void;
    unmaximize(): void;
    isMaximized(): boolean;
    isMinimized(): boolean;
    getBounds(): { x: number; y: number; width: number; height: number };
    setBounds(b: { x: number; y: number; width: number; height: number }): void;
    loadURL(url: string): Promise<void>;
    once(event: string, cb: () => void): void;
    on(event: string, cb: () => void): void;
    emit(event: string): void;
    webContents: { id: number; send: (channel: string, payload: unknown) => void };
  }

  const created: FakeWin[] = [];
  let nextId = 500;

  function makeWin(opts: Record<string, unknown>): FakeWin {
    const id = ++nextId;
    const win: FakeWin = {
      id,
      destroyed: false,
      bounds: {
        x: Number(opts.x ?? 0),
        y: Number(opts.y ?? 0),
        width: Number(opts.width ?? 800),
        height: Number(opts.height ?? 600),
      },
      opts,
      url: '',
      sent: [],
      listeners: {},
      isDestroyed: () => win.destroyed,
      destroy: () => {
        win.destroyed = true;
        win.emit('closed');
      },
      close: () => win.destroy(),
      show: () => undefined,
      focus: () => undefined,
      restore: () => undefined,
      unmaximize: () => undefined,
      isMaximized: () => false,
      isMinimized: () => false,
      getBounds: () => win.bounds,
      setBounds: (b) => {
        win.bounds = { ...b };
      },
      loadURL: async (url) => {
        win.url = url;
      },
      once: (event, cb) => {
        (win.listeners[event] ??= []).push(cb);
      },
      on: (event, cb) => {
        (win.listeners[event] ??= []).push(cb);
      },
      emit: (event) => {
        for (const cb of win.listeners[event] ?? []) cb();
      },
      webContents: {
        id,
        send: (channel, payload) => {
          win.sent.push({ channel, payload });
        },
      },
    };
    return win;
  }

  const displays = [
    {
      id: 1,
      key: 'primary-panel|1920x1080|1',
      label: 'Primary Panel',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
      primary: true,
      virtual: false,
    },
    {
      id: 2,
      key: 'second-panel|1280x720|2',
      label: 'Second Panel',
      bounds: { x: 1920, y: 0, width: 1280, height: 720 },
      workArea: { x: 1920, y: 0, width: 1280, height: 690 },
      scaleFactor: 2,
      primary: false,
      virtual: false,
    },
  ];

  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  const listeners = new Map<string, (event: unknown, payload: unknown) => void>();
  const files = new Map<string, string>();

  return { created, makeWin, displays, handlers, listeners, files };
});

vi.mock('electron', () => {
  class BrowserWindow {
    constructor(opts: Record<string, unknown>) {
      const win = h.makeWin(opts);
      h.created.push(win);
      // eslint-disable-next-line no-constructor-return
      return win as unknown as BrowserWindow;
    }
    static getAllWindows(): unknown[] {
      return h.created.filter((w) => !w.destroyed);
    }
  }
  return {
    BrowserWindow,
    app: { getPath: () => 'C:/fake/userData' },
    ipcMain: {
      handle: (channel: string, cb: (e: unknown, p: unknown) => unknown) => {
        h.handlers.set(channel, cb);
      },
      on: (channel: string, cb: (e: unknown, p: unknown) => void) => {
        h.listeners.set(channel, cb);
      },
    },
  };
});

// In-memory disk. Covers the calls `../atomicJson` makes (temp file via an fd,
// fsync, rename, `.bak` copy) so the real helper runs against it.
vi.mock('node:fs', () => {
  const enoent = (file: unknown): Error =>
    Object.assign(new Error(`ENOENT: ${String(file)}`), { code: 'ENOENT' });
  const fds = new Map<number, string>();
  let nextFd = 100;
  const fs = {
    readFileSync: (file: string) => {
      const found = h.files.get(String(file));
      if (found === undefined) throw enoent(file);
      return found;
    },
    writeFileSync: (target: string | number, data: string) => {
      const file = typeof target === 'number' ? fds.get(target) : String(target);
      if (file === undefined) throw new Error('EBADF');
      h.files.set(file, String(data));
    },
    renameSync: (from: string, to: string) => {
      const value = h.files.get(String(from));
      if (value === undefined) throw enoent(from);
      h.files.delete(String(from));
      h.files.set(String(to), value);
    },
    openSync: (file: string) => {
      const fd = nextFd++;
      fds.set(fd, String(file));
      h.files.set(String(file), '');
      return fd;
    },
    fsyncSync: () => undefined,
    closeSync: (fd: number) => {
      fds.delete(fd);
    },
    mkdirSync: () => undefined,
    statSync: (file: string) => {
      if (!h.files.has(String(file))) throw enoent(file);
      return { isFile: () => true };
    },
    // The first write of a store checks for an orphaned `.bak` to keep aside.
    existsSync: (file: string) => h.files.has(String(file)),
    copyFileSync: (from: string, to: string) => {
      const value = h.files.get(String(from));
      if (value === undefined) throw enoent(from);
      h.files.set(String(to), value);
    },
    rmSync: (file: string) => {
      h.files.delete(String(file));
    },
    readdirSync: () => [],
  };
  return { default: fs, ...fs };
});

vi.mock('../displays', () => ({
  listDisplays: () => h.displays,
  displayForKey: (key: string) => h.displays.find((d) => d.key === key) ?? null,
  keyForWindow: (win: { getBounds(): { x: number } }) =>
    (win.getBounds().x >= 1920 ? h.displays[1].key : h.displays[0].key),
}));

import {
  closeAllStudyBlockWindows,
  configureStudyBlockWindows,
  listDetachedWindows,
  openStudyBlockWindow,
  registerStudyBlockWindowIpc,
} from '../studyBlockWindows';
import { emptyDetachSnapshot } from '../../shared/studyDetach';

function invoke(channel: string, payload?: unknown, senderId = 1): unknown {
  const handler = h.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({ sender: { id: senderId } }, payload);
}

function emit(channel: string, payload: unknown, senderId = 1): void {
  const listener = h.listeners.get(channel);
  if (!listener) throw new Error(`no listener for ${channel}`);
  listener({ sender: { id: senderId } }, payload);
}

const guarded: unknown[] = [];

beforeEach(() => {
  closeAllStudyBlockWindows();
  h.created.length = 0;
  h.files.clear();
  guarded.length = 0;
  configureStudyBlockWindows({
    rendererUrl: (query = '') => `app://bundle/index.html?${query}`,
    attachNavGuards: (win) => guarded.push(win),
    isDevServer: false,
    popoutWindow: () => null,
  });
  registerStudyBlockWindowIpc();
});

describe('opening a block window', () => {
  it('loads the renderer route the App branch reads', () => {
    expect(openStudyBlockWindow('transcript', 'workspace')).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0].url).toContain('studyBlock=transcript');
    expect(h.created[0].url).toContain('surface=workspace');
  });

  it('applies the same navigation guards as every other window', () => {
    // A detached block must not become the one window where an https:// link
    // navigates the SPA away — the guards are passed in, never re-implemented.
    openStudyBlockWindow('transcript', 'workspace');
    expect(guarded).toHaveLength(1);
  });

  it('refuses a block it cannot host', () => {
    // `cardEditor` needs the live <video> for screenshot and audio; there is none here.
    expect(openStudyBlockWindow('cardEditor', 'workspace')).toBe(false);
    expect(openStudyBlockWindow('nonsense', 'workspace')).toBe(false);
    expect(h.created).toHaveLength(0);
  });

  it('never opens a second window for the same block', () => {
    openStudyBlockWindow('transcript', 'workspace');
    openStudyBlockWindow('transcript', 'workspace');
    expect(h.created).toHaveLength(1);
  });

  it('treats the same block on two surfaces as two windows', () => {
    // Blanc's toolbox player and the host overlay are both real, simultaneous surfaces.
    openStudyBlockWindow('transcript', 'workspace');
    openStudyBlockWindow('transcript', 'player');
    expect(h.created).toHaveLength(2);
    expect(listDetachedWindows().map((w) => w.surface).sort()).toEqual(['player', 'workspace']);
  });

  it('centres on the requested monitor', () => {
    openStudyBlockWindow('transcript', 'workspace', h.displays[1].key);
    const bounds = h.created[0].bounds;
    expect(bounds.x).toBeGreaterThanOrEqual(1920);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1920 + 1280);
  });

  it('opens on the primary when no monitor is named', () => {
    openStudyBlockWindow('studyHud', 'workspace');
    expect(h.created[0].bounds.x).toBeLessThan(1920);
  });
});

describe('geometry is remembered and re-validated', () => {
  it('reuses the rectangle the user left it at', () => {
    openStudyBlockWindow('transcript', 'workspace');
    const win = h.created[0];
    win.setBounds({ x: 300, y: 120, width: 500, height: 900 });
    win.emit('resized');
    win.destroy();

    openStudyBlockWindow('transcript', 'workspace');
    expect(h.created[1].bounds).toMatchObject({ x: 300, y: 120, width: 500, height: 900 });
  });

  it('writes the rectangle to disk, debounced, and atomically', () => {
    /*
      The reuse above is satisfied by the in-memory cache alone, so it cannot tell a
      working persistence layer from one that never writes. This drives the timer.
      A drag fires `moved` continuously; one synchronous `writeFileSync` per event
      would land in the middle of the gesture, hence the debounce being asserted too.
    */
    vi.useFakeTimers();
    try {
      openStudyBlockWindow('transcript', 'workspace');
      const win = h.created[0];
      for (let i = 0; i < 20; i++) {
        win.setBounds({ x: 200 + i, y: 100, width: 480, height: 800 });
        win.emit('moved');
      }
      expect(h.files.size, 'wrote during the drag').toBe(0);

      vi.advanceTimersByTime(700);
      const file = [...h.files.keys()].find((k) => k.endsWith('study-block-windows.json'));
      expect(file, 'no store file').toBeDefined();
      // Written through a .tmp and renamed — a crash mid-write must not leave a
      // half-parsed file that then fails to restore anyone's layout.
      expect([...h.files.keys()].some((k) => k.endsWith('.tmp'))).toBe(false);

      const stored = JSON.parse(h.files.get(file as string) as string);
      expect(stored['workspace:transcript']).toMatchObject({ x: 219, width: 480, height: 800 });
      expect(stored['workspace:transcript'].displayKey).toBe(h.displays[0].key);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a saved rectangle when a monitor is named explicitly', () => {
    // "Send to display 2" is the user asking for a different monitor right now; the
    // old rectangle would silently ignore them.
    openStudyBlockWindow('transcript', 'workspace');
    const win = h.created[0];
    win.setBounds({ x: 300, y: 120, width: 500, height: 900 });
    win.emit('moved');
    win.destroy();

    openStudyBlockWindow('transcript', 'workspace', h.displays[1].key);
    expect(h.created[1].bounds.x).toBeGreaterThanOrEqual(1920);
  });

  it('remembers a monitor it was SENT to, never having been dragged', () => {
    /*
      The live defect, 2026-09-02. "Send to display" on a block that is not detached yet
      means "detach it *there*" (`useStudyDetach.sendToDisplay`), so it routes through
      `openStudyBlockWindow(..., displayKey)` and never through the `moveToDisplay`
      handler that calls `rememberBounds`. Nothing else recorded the rectangle either:
      `moved`/`resized` do not fire for the bounds a window is constructed with, and
      `rememberBoundsFromCacheOnClose` bails on a key the cache has never seen. Measured
      on the real three-monitor desk: placed at 2090,20 460x512 on the second monitor,
      reopened primary-centred at 730,106 460x820, `study-block-windows.json` never
      created at all.

      The two assertions are deliberately different in kind: the rectangle proves the
      in-memory cache, the file proves the write actually happened. The first alone
      passed against a persistence layer that never wrote anything.
    */
    vi.useFakeTimers();
    try {
      openStudyBlockWindow('transcript', 'workspace', h.displays[1].key);
      const placed = { ...h.created[0].bounds };
      expect(placed.x).toBeGreaterThanOrEqual(1920);
      h.created[0].destroy();
      vi.advanceTimersByTime(700);

      const file = [...h.files.keys()].find((k) => k.endsWith('study-block-windows.json'));
      expect(file, 'a placed window was never persisted').toBeDefined();
      expect(JSON.parse(h.files.get(file as string) as string)['workspace:transcript'])
        .toMatchObject(placed);

      // Reopened the way the block menu reopens it — no display named — so the saved
      // rectangle is the only thing that can put it back on the second monitor.
      openStudyBlockWindow('transcript', 'workspace');
      expect(h.created[1].bounds).toMatchObject(placed);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the relay', () => {
  it('sends a published snapshot to the detached windows of that surface only', () => {
    openStudyBlockWindow('transcript', 'workspace');
    openStudyBlockWindow('mediaInfo', 'player');
    const [transcript, mediaInfo] = h.created;

    emit('studyblock:publish', { ...emptyDetachSnapshot(), surface: 'workspace', revision: 1 });

    expect(transcript.sent.filter((s) => s.channel === 'studyblock:sync')).toHaveLength(1);
    expect(mediaInfo.sent.filter((s) => s.channel === 'studyblock:sync')).toHaveLength(0);
  });

  it('carries the cue list forward through light frames', () => {
    openStudyBlockWindow('transcript', 'workspace');
    const win = h.created[0];
    const cues = [{ index: 0, trackNumber: 1, text: 'ひとつ', startMs: 0, endMs: 900 }];

    emit('studyblock:publish', { ...emptyDetachSnapshot(), surface: 'workspace', revision: 1, cues });
    emit('studyblock:publish', {
      ...emptyDetachSnapshot(), surface: 'workspace', revision: 2, cues: null, activeIndex: 0,
    });

    const frames = win.sent.filter((s) => s.channel === 'studyblock:sync');
    expect(frames).toHaveLength(2);
    // The whole point of the optimisation: the receiver never sees the null.
    expect((frames[1].payload as { cues: unknown[] }).cues).toEqual(cues);
  });

  it('replays the last frame to a window that opens later', async () => {
    emit('studyblock:publish', {
      ...emptyDetachSnapshot(), surface: 'workspace', revision: 7, mediaName: 'Ep 3',
    });
    const replayed = await invoke('studyblock:requestSnapshot', 'workspace');
    expect((replayed as { mediaName: string }).mediaName).toBe('Ep 3');
  });

  it('stamps the sender id so a command can be routed back', () => {
    openStudyBlockWindow('transcript', 'workspace');
    emit('studyblock:publish', { ...emptyDetachSnapshot(), surface: 'workspace' }, 42);
    const frame = h.created[0].sent.find((s) => s.channel === 'studyblock:sync');
    expect((frame?.payload as { sourceId: number }).sourceId).toBe(42);
  });

  it('routes a command to the publishing window and nowhere else', () => {
    // Two study surfaces can be mounted at once; a broadcast seek would be executed
    // twice.
    openStudyBlockWindow('transcript', 'workspace');
    const detachedWin = h.created[0];
    // The host publishes, identifying itself as the detached window's peer.
    emit('studyblock:publish', { ...emptyDetachSnapshot(), surface: 'workspace' }, detachedWin.id + 1);

    // …but there is no window with that id in this fixture, so nothing should be sent
    // to the detached window itself.
    emit('studyblock:command', {
      surface: 'workspace', command: { type: 'seek-cue', index: 4 },
    }, detachedWin.id);
    expect(detachedWin.sent.filter((s) => s.channel === 'studyblock:command')).toHaveLength(0);
  });

  it('drops a malformed command instead of forwarding it', () => {
    openStudyBlockWindow('transcript', 'workspace');
    const win = h.created[0];
    emit('studyblock:publish', { ...emptyDetachSnapshot(), surface: 'workspace' }, 999);
    emit('studyblock:command', {
      surface: 'workspace', command: { type: 'seek-cue', index: 'four' },
    }, win.id);
    expect(win.sent.filter((s) => s.channel === 'studyblock:command')).toHaveLength(0);
  });
});

describe('closing', () => {
  it('announces the change so the host can re-dock the block', () => {
    openStudyBlockWindow('transcript', 'workspace');
    const win = h.created[0];
    win.destroy();
    expect(listDetachedWindows()).toEqual([]);
  });

  it('closes on request', async () => {
    openStudyBlockWindow('transcript', 'workspace');
    const result = await invoke('studyblock:close', { blockId: 'transcript', surface: 'workspace' });
    expect(result).toEqual({ ok: true });
    expect(h.created[0].destroyed).toBe(true);
  });

  it('reports honestly when there is nothing to close', async () => {
    expect(await invoke('studyblock:close', { blockId: 'transcript', surface: 'workspace' }))
      .toEqual({ ok: false });
  });
});

describe('send to display', () => {
  it('moves an open block window onto the named monitor', async () => {
    openStudyBlockWindow('transcript', 'workspace');
    const result = await invoke('studyblock:moveToDisplay', {
      blockId: 'transcript', surface: 'workspace', displayKey: h.displays[1].key,
    });
    expect(result).toEqual({ ok: true });
    expect(h.created[0].bounds.x).toBeGreaterThanOrEqual(1920);
  });

  it('refuses a monitor that is not there', async () => {
    openStudyBlockWindow('transcript', 'workspace');
    expect(await invoke('studyblock:moveToDisplay', {
      blockId: 'transcript', surface: 'workspace', displayKey: 'unplugged|1x1|1',
    })).toEqual({ ok: false });
  });

  it('also moves the app pop-out an app-owned block opened', async () => {
    // "Send to display 2" must mean the same thing for a Notes block's Notebook window
    // as for a detached transcript.
    const popout = h.makeWin({ x: 10, y: 10, width: 900, height: 640 });
    h.created.push(popout);
    configureStudyBlockWindows({
      rendererUrl: () => 'app://bundle/index.html',
      attachNavGuards: () => undefined,
      isDevServer: false,
      popoutWindow: (section) => (section === 'notebook' ? (popout as never) : null),
    });
    expect(await invoke('studyblock:moveToDisplay', {
      section: 'notebook', displayKey: h.displays[1].key,
    })).toEqual({ ok: true });
    expect(popout.bounds.x).toBeGreaterThanOrEqual(1920);
  });
});
