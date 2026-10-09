// @vitest-environment node
/**
 * Every window-creating and window-showing path in main against the lock gate
 * (main/lockGuard.ts). Two halves:
 *
 *  1. STATIC. Every `new BrowserWindow(` site under src/main and src/main.ts is
 *     listed below with its policy. A new site fails this file until it is given
 *     one, and a "refused"/"deferred" site must call the gate BEFORE it constructs
 *     the window. Every `.show()` in main.ts must be on a lock surface or behind a
 *     refusal. main.ts must install the backstop (`browser-window-created` /
 *     `web-contents-created`) that hides any content window shown while locked,
 *     so a path this list missed is still covered at run time.
 *  2. BEHAVIOUR, with Electron stubbed: global commands, the VN reader, the
 *     companion host and secondary desktops consult the installed gate.
 *
 * Policies:
 *   lock    the PIN widget itself
 *   gated   its renderer draws its own PIN pad (Study OS main, Blanc) and is told
 *           `lockscreen:locked` whenever it shows while locked
 *   refuse  the creating path asks `refuseWhileLocked` first
 *   defer   the creating path asks `deferWhileLocked` first and runs on unlock
 *   session part of a session that could only start unlocked (recorder panel /
 *           frame); hidden by the backstop while locked
 *   hidden  never shown at all (an offscreen worker window)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLockGuard, installLockGuard, type GuardWindow, type LockGuard } from '../lockGuard';

const REPO = resolve(__dirname, '..', '..', '..');
const SITE = /new BrowserWindow\(/g;

type Policy = 'lock' | 'gated' | 'refuse' | 'defer' | 'session' | 'hidden';

interface Gate {
  /** The gate call. */
  call: RegExp;
  /**
   * The function it must sit in. When that function also constructs a window, the
   * gate must come first; otherwise it is the path's single entry (named in `why`).
   */
  inFunction: string;
}

interface MatrixEntry {
  /** One policy per `new BrowserWindow(` in source order. */
  sites: Policy[];
  gates: Gate[];
  why: string;
}

const MATRIX: Record<string, MatrixEntry> = {
  'src/main.ts': {
    sites: ['gated', 'gated', 'refuse', 'lock', 'refuse'],
    gates: [
      { call: /refuseWhileLocked\('window:mini'\)/, inFunction: 'createMiniWidgetWindow' },
      { call: /refuseWhileLocked\(`window:popout:\$\{section\}`\)/, inFunction: 'createPopoutWindow' },
    ],
    why: 'main window, Blanc, Mini widget, PIN widget, app pop-outs',
  },
  'src/main/companionHost.ts': {
    sites: ['defer'],
    gates: [{ call: /deferWhileLocked\('companion-host'/, inFunction: 'openCompanionHost' }],
    why: 'desktop pets: openCompanionHost is the only caller of createHostWindow',
  },
  'src/main/companion.ts': {
    sites: ['refuse'],
    gates: [{ call: /refuseWhileLocked\(`window:companion-\$\{kind\}`\)/, inFunction: 'surface' }],
    why: 'radial wheel, card preview, notice',
  },
  'src/main/desktopWindows.ts': {
    sites: ['defer', 'refuse'],
    gates: [
      { call: /deferWhileLocked\('desktop-windows', syncDesktopWindows\)/, inFunction: 'syncDesktopWindows' },
      { call: /refuseWhileLocked\('window:desktop-spawned'\)/, inFunction: 'openSpawnedDesktop' },
    ],
    why: 'per-monitor desktops (syncDesktopWindows is the only caller of createDesktopWindow), torn-off desktops',
  },
  'src/main/immersion/visualNovelReaderWindow.ts': {
    sites: ['refuse'],
    gates: [{ call: /refuseWhileLocked\('window:vn-reader'\)/, inFunction: 'openVisualNovelReader' }],
    why: 'VN reader beside a game',
  },
  'src/main/pdfRasterize.ts': {
    sites: ['hidden'],
    gates: [],
    why: 'sandboxed PDF rasterizer, show: false, never shown',
  },
  'src/main/readingLens.ts': {
    sites: ['refuse'],
    gates: [{ call: /refuseWhileLocked\('window:lens'\)/, inFunction: 'openLens' }],
    why: 'Reading Lens overlay',
  },
  'src/main/regionRecorder.ts': {
    sites: ['refuse', 'session', 'session', 'hidden'],
    gates: [{ call: /refuseWhileLocked\('window:recorder'\)/, inFunction: 'startRecorder' }],
    why: 'region picker (startRecorder is its entry), panel, frame, hidden encoder host',
  },
  'src/main/studyBlockWindows.ts': {
    sites: ['refuse'],
    gates: [{ call: /refuseWhileLocked\('window:study-block'\)/, inFunction: 'openStudyBlockWindow' }],
    why: 'detached Study Block (skips the PIN pad by design)',
  },
  'src/main/systemDictionary.ts': {
    sites: ['refuse'],
    gates: [{ call: /refuseWhileLocked\('window:lookup'\)/, inFunction: 'lookUpText' }],
    why: 'popup dictionary over other apps',
  },
  'src/main/systemAudioCapture.ts': {
    sites: ['hidden', 'defer'],
    gates: [
      {
        call: /deferWhileLocked\('captions-overlay', syncOverlayVisibility\)/,
        inFunction: 'syncOverlayVisibility',
      },
    ],
    why: 'hidden capture host; the captions bar is only ever shown by syncOverlayVisibility',
  },
};

/** [start, end) of `function name(` up to the next top-level declaration. */
function functionSpan(source: string, name: string): [number, number] | null {
  const re = new RegExp(`(^|\\n)(export )?(async )?function ${name}\\(`);
  const m = re.exec(source);
  if (!m) return null;
  const start = m.index;
  const rest = source.slice(start + m[0].length);
  const next = /\n(export )?(async )?function |\n(export )?const |\n(export )?let /.exec(rest);
  return [start, next ? start + m[0].length + next.index : source.length];
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const posix = (p: string) => relative(REPO, p).split('\\').join('/');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

function sitesIn(source: string): number[] {
  return [...source.matchAll(SITE)].map((m) => m.index ?? 0);
}

describe('static: every window-creating path has a lock policy', () => {
  const files = [resolve(REPO, 'src/main.ts'), ...sourceFiles(resolve(REPO, 'src/main'))];
  const found = new Map<string, number>();
  for (const file of files) {
    const n = sitesIn(readFileSync(file, 'utf8')).length;
    if (n) found.set(posix(file), n);
  }

  it('the scan sees the window factories (control)', () => {
    expect(found.size).toBeGreaterThanOrEqual(10);
    expect(found.get('src/main.ts')).toBe(5);
  });

  it('no `new BrowserWindow(` site exists without a matrix entry, and counts match', () => {
    const unknown = [...found.keys()].filter((f) => !(f in MATRIX));
    expect(unknown).toEqual([]);
    for (const [file, entry] of Object.entries(MATRIX)) {
      expect({ file, sites: found.get(file) ?? 0 }).toEqual({ file, sites: entry.sites.length });
    }
  });

  it('every refused/deferred site has a gate, inside its function and before any construction there', () => {
    for (const [file, entry] of Object.entries(MATRIX)) {
      const source = read(file);
      const sites = sitesIn(source);
      const gatedPolicies = entry.sites.filter((p) => p === 'refuse' || p === 'defer').length;
      expect({ file, hasGates: entry.gates.length >= Math.min(1, gatedPolicies) }).toEqual({ file, hasGates: true });
      for (const gate of entry.gates) {
        const label = `${file} ${gate.inFunction}`;
        const span = functionSpan(source, gate.inFunction);
        expect({ label, fn: Boolean(span) }).toEqual({ label, fn: true });
        const [start, end] = span!;
        const body = source.slice(start, end);
        const m = gate.call.exec(body);
        expect({ label, gate: Boolean(m) }).toEqual({ label, gate: true });
        const at = start + (m?.index ?? 0);
        const constructedBefore = sites.filter((s) => s > start && s < at);
        expect({ label, constructedBeforeGate: constructedBefore.length }).toEqual({ label, constructedBeforeGate: 0 });
      }
    }
  });

  it('a gate that guards an entry rather than the factory names the only caller', () => {
    // createDesktopWindow / createHostWindow / openSelect are reached only through the gated entry.
    const desks = read('src/main/desktopWindows.ts');
    expect(desks.match(/createDesktopWindow\(/g)?.length).toBe(2); // definition + the one call in syncDesktopWindows
    const host = read('src/main/companionHost.ts');
    expect(host.match(/createHostWindow\(/g)?.length).toBe(2);
    const rec = read('src/main/regionRecorder.ts');
    const start = functionSpan(rec, 'startRecorder')!;
    expect(rec.slice(...start)).toContain('openSelect(');
  });

  it('"hidden" windows are created hidden', () => {
    for (const [file, entry] of Object.entries(MATRIX)) {
      const source = read(file);
      const sites = sitesIn(source);
      entry.sites.forEach((policy, i) => {
        if (policy !== 'hidden') return;
        const options = source.slice(sites[i], sites[i] + 400);
        expect({ file, site: i, showFalse: /show:\s*false/.test(options) }).toEqual({ file, site: i, showFalse: true });
      });
    }
  });
});

describe('static: main.ts wires the gate', () => {
  const main = read('src/main.ts');

  it('installs the backstop on every window and every webContents', () => {
    expect(main).toContain("app.on('browser-window-created', (_event, win) => lockGuard.adopt(win));");
    expect(main).toContain("app.on('web-contents-created', (_event, contents) => lockGuard.adoptWebContents(contents));");
    expect(main).toContain('installLockGuard(');
    expect(main).toContain('devToolsAllowed: !app.isPackaged');
  });

  it('classifies the lock surfaces: the widget is `lock`, main and Blanc are `gated`', () => {
    expect(main).toMatch(/if \(win === lockscreenWindow\) return 'lock';/);
    expect(main).toMatch(/if \(win === mainWindow \|\| win === blancWindow\) return 'gated';/);
  });

  it('arming and lifting the lock drive the guard', () => {
    expect(main).toMatch(/\(locked\) => \(locked \? lockGuard\.engage\(\) : lockGuard\.release\(\)\)/);
  });

  it('every .show() in main.ts is on a lock surface or behind a refusal', () => {
    // Receivers that are lock surfaces (gated/lock) or a pop-out/mini already past its refusal.
    const allowed = new Set(['mainWindow', 'blancWindow', 'lockscreenWindow', 'miniWidgetWindow', 'existing']);
    // `win.show()` is a window's own ready-to-show; only these factories may do it.
    const ownShowFactories = new Set(['createBlancWindow', 'createMiniWidgetWindow', 'createLockscreenWindow']);
    const offenders: string[] = [];
    for (const m of main.matchAll(/\b([A-Za-z_]+)!?\.(show|showInactive)\(\)/g)) {
      const receiver = m[1]!;
      if (allowed.has(receiver)) continue;
      const before = main.slice(0, m.index);
      const fn = [...before.matchAll(/function ([A-Za-z0-9_]+)\(/g)].pop()?.[1] ?? '?';
      if (receiver === 'win' && ownShowFactories.has(fn)) continue;
      offenders.push(`${receiver}.${m[2]}() in ${fn}`);
    }
    expect(offenders).toEqual([]);
  });

  it('launch-time pop-outs queue while locked instead of being dropped', () => {
    expect(main).toMatch(/if \(coldOpen\) \{\s*if \(isAppLocked\(\)\) pendingOpenSection = coldOpen;/);
    expect(main).toMatch(/if \(pendingOpenSection && !isAppLocked\(\)\)/);
  });

  it('the tray "Open Blanc" row is refused while locked', () => {
    expect(main).toMatch(/if \(!refuseWhileLocked\('tray:openBlanc'\)\) createBlancWindow\(\);/);
  });
});

describe('static: the other gates', () => {
  it('global commands: the one chokepoint (`fire`) consults the gate', () => {
    const src = read('src/main/globalCommands.ts');
    const fire = src.slice(src.indexOf('function fire('), src.indexOf('function fire(') + 600);
    expect(fire).toMatch(/if \(!LOCK_SAFE_COMMANDS\.has\(id\) && refuseWhileLocked\(`command:\$\{id\}`\)\) return;/);
  });

  it('extension server: the lock check precedes every route, recordings included', () => {
    const src = read('src/main/extensionServer.ts');
    const check = src.indexOf('if (!extensionRouteAllowedWhileLocked(pathname) && appLocked())');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(src.indexOf("pathname === '/v1/recordings'"));
    expect(check).toBeLessThan(src.indexOf("pathname === '/v1/mine'"));
  });

  it('Blanc takes main\'s lock (it used to read only its own session flag)', () => {
    const src = read('src/renderer/blancMain.tsx');
    expect(src).toContain('lockscreenIsLocked');
    expect(src).toContain('onLockscreenLocked');
    expect(src).toContain('onLockscreenUnlocked');
  });
});

// ---- Behaviour, with Electron stubbed -------------------------------------------

const h = vi.hoisted(() => ({
  shortcuts: new Map<string, () => void>(),
  constructed: [] as unknown[],
}));

vi.mock('electron', () => {
  class BrowserWindow {
    static getAllWindows = () => [];
    webContents = { send: () => undefined, on: () => undefined, once: () => undefined };
    constructor(opts: unknown) {
      h.constructed.push(opts);
    }
    on() {
      return this;
    }
    once() {
      return this;
    }
    setOpacity() {
      return undefined;
    }
    setAlwaysOnTop() {
      return undefined;
    }
    setIgnoreMouseEvents() {
      return undefined;
    }
    setVisibleOnAllWorkspaces() {
      return undefined;
    }
    setBounds() {
      return undefined;
    }
    isDestroyed() {
      return false;
    }
    loadURL() {
      return Promise.resolve();
    }
    showInactive() {
      return undefined;
    }
    close() {
      return undefined;
    }
  }
  return {
    app: { getPath: () => process.cwd(), isPackaged: false, on: () => undefined },
    BrowserWindow,
    ipcMain: { handle: () => undefined, on: () => undefined },
    globalShortcut: {
      register: (acc: string, fn: () => void) => {
        h.shortcuts.set(acc, fn);
        return true;
      },
      unregister: (acc: string) => void h.shortcuts.delete(acc),
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    },
    powerMonitor: { on: () => undefined },
  };
});
vi.mock('../atomicJson', () => ({ readJsonSync: (_f: string, fallback: unknown) => fallback, writeJsonAtomicSync: () => undefined }));
vi.mock('../bootLoad', () => ({ loadWindowWithRetry: () => Promise.resolve() }));
vi.mock('../displays', () => ({
  listDisplays: () => [],
  onDisplaysChanged: () => () => undefined,
  unionDisplayBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
  displayForKey: () => null,
  realKeyForWindow: () => null,
}));
const desktopStoreSpy = vi.hoisted(() => vi.fn());
vi.mock('../desktop', () => ({ desktopStore: desktopStoreSpy }));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));
vi.mock('../windowBounds', () => ({ applyBoundsVerified: () => undefined }));

let locked = true;
let guard: LockGuard<GuardWindow>;

beforeEach(() => {
  locked = true;
  h.constructed.length = 0;
  desktopStoreSpy.mockReset();
  guard = createLockGuard<GuardWindow>({
    isLocked: () => locked,
    roleOf: () => 'content',
    windows: () => [],
    notifyBlocked: () => undefined,
    devToolsAllowed: true,
  });
  installLockGuard(guard);
});

afterEach(() => installLockGuard(null));

describe('behaviour: global commands refuse while locked', () => {
  it('a chord or a tray row runs nothing but the lock-UI commands until the unlock', async () => {
    const reg = await import('../globalCommands');
    reg.__globalCommandsTestables.reset();
    const lens = vi.fn();
    const content = vi.fn();
    const focus = vi.fn();
    reg.registerGlobalCommand('lens.region', lens);
    // An id outside the defaults, so its chord is certainly held: the chord path.
    reg.registerGlobalCommand('test.revealContent', content, { defaultKeys: 'Ctrl+Alt+Shift+F11' });
    reg.registerGlobalCommand('app.focus', focus);
    expect(h.shortcuts.size).toBeGreaterThan(0);
    for (const fn of h.shortcuts.values()) fn(); // every held chord pressed
    expect(content).not.toHaveBeenCalled();
    expect(lens).not.toHaveBeenCalled();
    // The tray / wheel / IPC path.
    expect(reg.runGlobalCommand('lens.region')).toBe(true);
    expect(lens).not.toHaveBeenCalled();
    reg.runGlobalCommand('app.focus'); // brings the PIN pad forward: allowed
    expect(focus).toHaveBeenCalled();

    locked = false;
    reg.runGlobalCommand('lens.region');
    reg.runGlobalCommand('test.revealContent');
    expect(lens).toHaveBeenCalledTimes(1);
    expect(content).toHaveBeenCalledTimes(1);
    reg.__globalCommandsTestables.reset();
  });
});

describe('behaviour: window factories', () => {
  it('the VN reader is not constructed while locked', async () => {
    const vn = await import('../immersion/visualNovelReaderWindow');
    vn.configureVisualNovelReader({ rendererUrl: () => 'app://x', isDevServer: false });
    vn.openVisualNovelReader('vn-1', { opacity: 1 } as never, () => undefined);
    expect(h.constructed).toHaveLength(0);
    locked = false;
    vn.openVisualNovelReader('vn-1', { opacity: 1 } as never, () => undefined);
    expect(h.constructed).toHaveLength(1);
    vn.closeVisualNovelReader();
  });

  it('the companion host waits for the unlock, then opens', async () => {
    const host = await import('../companionHost');
    host.configureCompanionHost({ rendererUrl: () => 'app://x', isDevServer: false });
    host.openCompanionHost('primary');
    expect(h.constructed).toHaveLength(0);
    expect(guard.deferredKeys()).toContain('companion-host');
    locked = false;
    guard.release();
    expect(h.constructed).toHaveLength(1);
    host.closeCompanionHost();
  });

  it('secondary desktops reconcile after the unlock, not before', async () => {
    const desks = await import('../desktopWindows');
    desks.syncDesktopWindows();
    expect(desktopStoreSpy).not.toHaveBeenCalled();
    expect(guard.deferredKeys()).toContain('desktop-windows');
    expect(desks.openSpawnedDesktop(1 as never)).toBe(false);
    expect(h.constructed).toHaveLength(0);
  });
});
