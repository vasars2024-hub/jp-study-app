// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reconciling desktop windows against (assignments x present displays).
 *
 * The mixed-DPI two-display fixture mirrors `screenOcr.test.ts:60-63` — a 1x
 * primary next to a 2x secondary — because scale factor is part of the display
 * key and a fixture with matching DPI cannot fail the case that matters.
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
    show(): void;
    focus(): void;
    restore(): void;
    isMinimized(): boolean;
    getBounds(): { x: number; y: number; width: number; height: number };
    setBounds(b: { x: number; y: number; width: number; height: number }): void;
    loadURL(url: string): Promise<void>;
    once(event: string, cb: () => void): void;
    on(event: string, cb: () => void): void;
    webContents: { send: (channel: string, payload: unknown) => void };
  }

  const created: FakeWin[] = [];
  let nextId = 100;

  function makeWin(opts: Record<string, unknown>): FakeWin {
    const win: FakeWin = {
      id: ++nextId,
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
        for (const cb of win.listeners.closed ?? []) cb();
      },
      show: () => undefined,
      focus: () => undefined,
      restore: () => undefined,
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
      webContents: {
        send: (channel, payload) => {
          win.sent.push({ channel, payload });
        },
      },
    };
    return win;
  }

  // Mixed-DPI pair: 1x primary, 2x secondary.
  const displays = [
    {
      id: 1,
      label: 'Primary Panel',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
      primary: true,
      virtual: false,
    },
    {
      id: 2,
      label: 'Second Panel',
      bounds: { x: 1920, y: 0, width: 1280, height: 720 },
      workArea: { x: 1920, y: 0, width: 1280, height: 690 },
      scaleFactor: 2,
      primary: false,
      virtual: false,
    },
  ];

  const state = {
    present: [displays[0], displays[1]],
    assignments: [] as {
      displayKey: string;
      desktopIndex: number;
      enabled: boolean;
      aero?: boolean;
      taskbar?: string;
      showAllWindows?: boolean;
    }[],
    activeDesktopIndex: 0,
    mainDisplayKey: 'primary-panel|1920x1080|1' as string | null,
    setMainCalls: [] as (string | null)[],
    syncCalls: 0,
  };

  return { created, makeWin, displays, state };
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
    static fromWebContents(): unknown {
      return null;
    }
  }
  return {
    BrowserWindow,
    ipcMain: { handle: () => undefined, on: () => undefined },
  };
});

vi.mock('../displays', () => ({
  listDisplays: () =>
    h.state.present.map((d) => ({
      id: d.id,
      key: `${d.label.toLowerCase().replace(/\s+/g, '-')}|${d.bounds.width}x${d.bounds.height}|${d.scaleFactor}`,
      label: d.label,
      bounds: d.bounds,
      workArea: d.workArea,
      primary: d.primary,
      scaleFactor: d.scaleFactor,
      virtual: d.virtual,
    })),
  displayForKey: () => null,
  // The main window resolves against REAL displays only — a simulated strip
  // overlaps the primary monitor, so the virtual-preferring lookup would report
  // the main window as sitting on the simulation. See realKeyForWindow.
  realKeyForWindow: () => h.state.mainDisplayKey,
  keyForWindow: () => h.state.mainDisplayKey,
  keyForPoint: () => null,
  onDisplaysChanged: () => () => undefined,
}));

vi.mock('../desktop', () => ({
  desktopStore: () => ({
    snapshot: () => ({
      activeDesktopIndex: h.state.activeDesktopIndex,
      viewports: [],
      assignments: h.state.assignments,
      globalZTop: 10,
      switching: false,
    }),
    syncAssignments: (present: { key: string; primary: boolean }[]) => {
      h.state.syncCalls += 1;
      for (const d of present) {
        if (h.state.assignments.some((a) => a.displayKey === d.key)) continue;
        h.state.assignments.push({
          displayKey: d.key,
          desktopIndex: h.state.assignments.length,
          enabled: d.primary,
        });
      }
      return {
        activeDesktopIndex: h.state.activeDesktopIndex,
        viewports: [],
        assignments: h.state.assignments,
        globalZTop: 10,
        switching: false,
      };
    },
    setMainDisplayKey: (key: string | null) => {
      h.state.setMainCalls.push(key);
    },
    setAssignment: () => undefined,
  }),
}));

const PRIMARY_KEY = 'primary-panel|1920x1080|1';
const SECOND_KEY = 'second-panel|1280x720|2';

const mod = await import('../desktopWindows');

function reset(): void {
  mod.closeAllDesktopWindows();
  h.created.length = 0;
  h.state.present = [h.displays[0], h.displays[1]];
  h.state.assignments = [];
  h.state.mainDisplayKey = PRIMARY_KEY;
  h.state.setMainCalls = [];
  h.state.activeDesktopIndex = 0;
  mod.configureDesktopWindows({
    rendererUrl: (query = '') => (query ? `app://bundle/index.html?${query}` : 'app://bundle/index.html'),
    attachNavGuards: () => undefined,
    isDevServer: false,
    // `main.ts` only syncs after `createWindow()`, so a main window always
    // exists by this point. Without one here the primary display looks
    // unoccupied and the fixture would happily open a second shell on top of
    // the main window — a pass that proves nothing.
    mainWindow: () => ({ isDestroyed: () => false }) as never,
  });
}

const openWindows = () => h.created.filter((w) => !w.destroyed);

describe('desktopWindows', () => {
  beforeEach(reset);

  it('opens no window when only the primary display is configured', () => {
    // The main window already hosts the primary; a second shell there would
    // stack two desktops on one monitor.
    mod.syncDesktopWindows();
    expect(openWindows()).toHaveLength(0);
  });

  it('opens one window once the second display is enabled', () => {
    mod.syncDesktopWindows();
    const second = h.state.assignments.find((a) => a.displayKey === SECOND_KEY);
    expect(second).toBeDefined();
    second!.enabled = true;
    mod.syncDesktopWindows();
    expect(openWindows()).toHaveLength(1);
  });

  it('places the window on that display work area, not its full bounds', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();
    expect(openWindows()[0].bounds).toEqual({ x: 1920, y: 0, width: 1280, height: 690 });
  });

  it('never loads a bare desktop URL — jp-bridge identifies the main window by it (B6)', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();
    const url = openWindows()[0].url;
    expect(url).toContain('desk=');
    expect(url).toContain('displayKey=');
  });

  it('is idempotent — syncing twice does not open a second window', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();
    mod.syncDesktopWindows();
    mod.syncDesktopWindows();
    expect(openWindows()).toHaveLength(1);
  });

  it('closes the window when the display is disabled', () => {
    mod.syncDesktopWindows();
    const second = h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!;
    second.enabled = true;
    mod.syncDesktopWindows();
    expect(openWindows()).toHaveLength(1);
    second.enabled = false;
    mod.syncDesktopWindows();
    expect(openWindows()).toHaveLength(0);
  });

  it('closes the window when the display is unplugged, keeping the assignment', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();

    h.state.present = [h.displays[0]];
    mod.syncDesktopWindows();

    expect(openWindows()).toHaveLength(0);
    // Nothing is lost — the desktop's contents live in the store, and the
    // assignment survives so replugging restores the setup.
    expect(h.state.assignments.some((a) => a.displayKey === SECOND_KEY)).toBe(true);
  });

  it('reopens the window when the display comes back', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();
    h.state.present = [h.displays[0]];
    mod.syncDesktopWindows();
    h.state.present = [h.displays[0], h.displays[1]];
    mod.syncDesktopWindows();
    expect(openWindows()).toHaveLength(1);
  });

  it('retargets in place rather than rebuilding when the desktop changes', () => {
    mod.syncDesktopWindows();
    const second = h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!;
    second.enabled = true;
    mod.syncDesktopWindows();
    const win = openWindows()[0];

    second.desktopIndex = 3;
    mod.syncDesktopWindows();

    expect(openWindows()[0]).toBe(win);
    const retarget = win.sent.filter((s) => s.channel === 'deskwin:retarget');
    expect(retarget.length).toBeGreaterThan(0);
    expect(retarget.at(-1)?.payload).toMatchObject({ desktopIndex: 3, displayKey: SECOND_KEY });
  });

  it('repositions an existing window when its display work area moves', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();
    const win = openWindows()[0];

    h.displays[1].workArea = { x: 1920, y: 40, width: 1280, height: 650 };
    mod.syncDesktopWindows();

    expect(openWindows()[0]).toBe(win);
    expect(win.bounds).toEqual({ x: 1920, y: 40, width: 1280, height: 650 });
    // Restore for the next case.
    h.displays[1].workArea = { x: 1920, y: 0, width: 1280, height: 690 };
  });

  it('tells the store which display the main window is on', () => {
    mod.configureDesktopWindows({
      rendererUrl: () => 'app://bundle/index.html',
      attachNavGuards: () => undefined,
      isDevServer: false,
      mainWindow: () => ({ isDestroyed: () => false }) as never,
    });
    mod.syncDesktopWindows();
    expect(h.state.setMainCalls.at(-1)).toBe(PRIMARY_KEY);
  });

  it('closeAllDesktopWindows tears every secondary down', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();
    expect(openWindows()).toHaveLength(1);
    mod.closeAllDesktopWindows();
    expect(openWindows()).toHaveLength(0);
  });

  it('listDeskWindows reports open state per assignment', () => {
    mod.syncDesktopWindows();
    h.state.assignments.find((a) => a.displayKey === SECOND_KEY)!.enabled = true;
    mod.syncDesktopWindows();
    const list = mod.listDeskWindows();
    expect(list.find((d) => d.displayKey === SECOND_KEY)?.open).toBe(true);
    expect(list.find((d) => d.displayKey === PRIMARY_KEY)?.open).toBe(false);
  });

  it('desktopIndexForDisplayKey answers activeDesktopIndex for the main display', () => {
    mod.configureDesktopWindows({
      rendererUrl: () => 'app://bundle/index.html',
      attachNavGuards: () => undefined,
      isDevServer: false,
      mainWindow: () => ({ isDestroyed: () => false }) as never,
    });
    h.state.activeDesktopIndex = 1;
    mod.syncDesktopWindows();
    expect(mod.desktopIndexForDisplayKey(PRIMARY_KEY)).toBe(1);
  });
});
