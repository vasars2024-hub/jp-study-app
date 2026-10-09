// @vitest-environment node
/**
 * The lock as a main-process gate (main/lockGuard.ts), driven with stubbed
 * windows: what a content window, a gated window (Study OS main, Blanc) and the
 * PIN widget each do while locked; that arming hides and unlocking restores
 * exactly what was hidden; deferral, refusal throttling and DevTools.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCK_NOTICE_THROTTLE_MS,
  appLocked,
  blockKindOf,
  createLockGuard,
  deferWhileLocked,
  extensionRouteAllowedWhileLocked,
  installLockGuard,
  LOCK_SAFE_COMMANDS,
  refuseWhileLocked,
  type GuardWindow,
  type LockBlockNotice,
  type LockWindowRole,
} from '../lockGuard';
import { createLockGate, hashPin, resetPinAttemptsForTests } from '../lockscreenPin';

class FakeContents {
  sent: string[] = [];
  devtools = false;
  destroyed = false;
  private listeners: Array<() => void> = [];
  send(channel: string): void {
    this.sent.push(channel);
  }
  on(_event: 'devtools-opened', listener: () => void): this {
    this.listeners.push(listener);
    return this;
  }
  openDevTools(): void {
    this.devtools = true;
    for (const l of this.listeners) l();
  }
  isDevToolsOpened(): boolean {
    return this.devtools;
  }
  closeDevTools(): void {
    this.devtools = false;
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

class FakeWindow implements GuardWindow {
  visible = false;
  destroyed = false;
  readonly webContents = new FakeContents();
  private showListeners: Array<() => void> = [];
  constructor(readonly role: LockWindowRole, readonly name: string) {}
  isDestroyed(): boolean {
    return this.destroyed;
  }
  isVisible(): boolean {
    return this.visible;
  }
  hide(): void {
    this.visible = false;
  }
  show(): void {
    this.visible = true;
    for (const l of this.showListeners) l();
  }
  showInactive(): void {
    this.show();
  }
  on(_event: 'show', listener: () => void): this {
    this.showListeners.push(listener);
    return this;
  }
}

function setup(opts: { locked?: boolean; devToolsAllowed?: boolean } = {}) {
  let locked = opts.locked ?? true;
  let clock = 1_000_000;
  const windows: FakeWindow[] = [];
  const notices: LockBlockNotice[] = [];
  const guard = createLockGuard<FakeWindow>({
    isLocked: () => locked,
    roleOf: (w) => w.role,
    windows: () => windows,
    notifyBlocked: (n) => notices.push(n),
    devToolsAllowed: opts.devToolsAllowed ?? false,
    now: () => clock,
  });
  const make = (role: LockWindowRole, name: string) => {
    const w = new FakeWindow(role, name);
    windows.push(w);
    guard.adopt(w);
    guard.adoptWebContents(w.webContents);
    return w;
  };
  return {
    guard,
    windows,
    notices,
    make,
    setLocked: (v: boolean) => {
      locked = v;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

afterEach(() => installLockGuard(null));

describe('lock guard: the show gate on every window', () => {
  it('a content window shown while locked is hidden again and remembered', () => {
    const { make, guard } = setup();
    const popout = make('content', 'popout');
    popout.show();
    expect(popout.visible).toBe(false);
    expect(guard.hiddenCount()).toBe(1);
  });

  it('the PIN widget shows; a gated window shows and is told to draw its PIN pad', () => {
    const { make } = setup();
    const widget = make('lock', 'lockscreen');
    const main = make('gated', 'main');
    widget.show();
    main.show();
    expect(widget.visible).toBe(true);
    expect(main.visible).toBe(true);
    expect(main.webContents.sent).toContain('lockscreen:locked');
    expect(widget.webContents.sent).not.toContain('lockscreen:locked');
  });

  it('unlocked, nothing is touched', () => {
    const { make, guard } = setup({ locked: false });
    const popout = make('content', 'popout');
    popout.show();
    expect(popout.visible).toBe(true);
    expect(guard.hiddenCount()).toBe(0);
  });
});

describe('lock guard: arming and lifting', () => {
  it('engage hides visible content only, release restores exactly those and runs deferred work', () => {
    const { make, guard, setLocked } = setup({ locked: false });
    const main = make('gated', 'main');
    const lens = make('content', 'lens');
    const hiddenAlready = make('content', 'sysdict');
    main.show();
    lens.show();
    setLocked(true);
    guard.engage();
    expect(lens.visible).toBe(false);
    expect(main.visible).toBe(true);
    expect(main.webContents.sent).toContain('lockscreen:locked');

    const ran: string[] = [];
    expect(guard.defer('desktops', () => ran.push('desktops'))).toBe(true);
    expect(guard.defer('desktops', () => ran.push('desktops-latest'))).toBe(true);
    expect(guard.deferredKeys()).toEqual(['desktops']);

    setLocked(false);
    guard.release();
    expect(lens.visible).toBe(true);
    expect(hiddenAlready.visible).toBe(false); // was not visible when the lock engaged
    expect(ran).toEqual(['desktops-latest']);
    expect(guard.hiddenCount()).toBe(0);
  });

  it('a window destroyed while hidden is skipped on release', () => {
    const { make, guard, setLocked } = setup({ locked: false });
    const w = make('content', 'popout');
    w.show();
    setLocked(true);
    guard.engage();
    w.destroyed = true;
    setLocked(false);
    expect(() => guard.release()).not.toThrow();
  });

  it('defer is false (run now) when unlocked', () => {
    const { guard } = setup({ locked: false });
    expect(guard.defer('x', () => undefined)).toBe(false);
  });
});

describe('lock guard: refusals', () => {
  it('commands, tray and extension refusals toast, throttled per kind; window refusals are quiet', () => {
    const { guard, notices, advance } = setup();
    expect(guard.refuse('command:lens.region')).toBe(true);
    expect(guard.refuse('command:companion.wheel')).toBe(true); // same kind inside the window
    expect(guard.refuse('window:popout:library')).toBe(true);
    expect(guard.refuse('extension:/v1/lookup')).toBe(true);
    expect(notices).toEqual([
      { kind: 'command', action: 'command:lens.region' },
      { kind: 'extension', action: 'extension:/v1/lookup' },
    ]);
    advance(BLOCK_NOTICE_THROTTLE_MS.command);
    guard.refuse('tray:openBlanc');
    guard.refuse('command:lens.auto');
    guard.refuse('extension:/v1/mine'); // extension throttle is a minute
    expect(notices.map((n) => n.action)).toEqual([
      'command:lens.region',
      'extension:/v1/lookup',
      'tray:openBlanc',
      'command:lens.auto',
    ]);
  });

  it('nothing is refused while unlocked', () => {
    const { guard, notices } = setup({ locked: false });
    expect(guard.refuse('command:lens.region')).toBe(false);
    expect(notices).toEqual([]);
  });

  it('blockKindOf reads the prefix; anything unknown is a quiet window refusal', () => {
    expect(blockKindOf('command:x')).toBe('command');
    expect(blockKindOf('tray:x')).toBe('tray');
    expect(blockKindOf('extension:/v1/x')).toBe('extension');
    expect(blockKindOf('window:lens')).toBe('window');
    expect(blockKindOf('whatever')).toBe('window');
  });

  it('only the commands that bring the lock UI forward stay live', () => {
    expect([...LOCK_SAFE_COMMANDS].sort()).toEqual(['app.focus', 'app.restart', 'app.toggle']);
  });
});

describe('lock guard: DevTools', () => {
  it('a packaged build closes DevTools the moment they open, and on engage', () => {
    const { make, guard, setLocked } = setup({ locked: false, devToolsAllowed: false });
    const w = make('content', 'popout');
    w.webContents.openDevTools();
    expect(w.webContents.isDevToolsOpened()).toBe(false);
    w.webContents.devtools = true; // opened some way that raised no event
    setLocked(true);
    guard.engage();
    expect(w.webContents.isDevToolsOpened()).toBe(false);
  });

  it('a dev build keeps them', () => {
    const { make, guard } = setup({ devToolsAllowed: true });
    const w = make('gated', 'main');
    w.webContents.openDevTools();
    guard.engage();
    expect(w.webContents.isDevToolsOpened()).toBe(true);
  });
});

describe('process-wide helpers', () => {
  it('unconfigured means unlocked: feature modules work in their own tests', () => {
    installLockGuard(null);
    expect(appLocked()).toBe(false);
    expect(refuseWhileLocked('window:lens')).toBe(false);
    expect(deferWhileLocked('x', () => undefined)).toBe(false);
  });

  it('route through the installed guard', () => {
    const { guard, setLocked } = setup();
    installLockGuard(guard as never);
    expect(appLocked()).toBe(true);
    expect(refuseWhileLocked('window:lens')).toBe(true);
    const fn = vi.fn();
    expect(deferWhileLocked('k', fn)).toBe(true);
    setLocked(false);
    guard.release();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(appLocked()).toBe(false);
  });
});

describe('extension routes while locked', () => {
  it('only liveness, the pairing pull and the URL classifier stay open', () => {
    for (const p of ['/health', '/v1/health', '/v1/health/', '/v1/extension-settings', '/v1/page-kind']) {
      expect(extensionRouteAllowedWhileLocked(p)).toBe(true);
    }
    for (const p of ['/v1/mine', '/v1/lookup', '/v1/known-snapshot', '/v1/recordings', '/v1/recordings/abc', '/v1/page-context', '/']) {
      expect(extensionRouteAllowedWhileLocked(p)).toBe(false);
    }
  });
});

describe('the lock gate reports its transitions to the guard', () => {
  it('arming, a wrong PIN, the right PIN', () => {
    resetPinAttemptsForTests();
    const changes: boolean[] = [];
    let stored: unknown = { enabled: true, pinHash: hashPin('2468') };
    const gate = createLockGate(
      { read: () => stored as never, write: (r) => void (stored = r) },
      (locked) => changes.push(locked),
    );
    // Locked from creation: that is the starting state, not a transition.
    expect(gate.isLocked()).toBe(true);
    expect(changes).toEqual([]);
    gate.lock(); // already locked
    expect(changes).toEqual([]);
    expect(gate.verify('1111').ok).toBe(false);
    expect(changes).toEqual([]);
    expect(gate.verify('2468').ok).toBe(true);
    expect(changes).toEqual([false]);
    gate.lock();
    expect(changes).toEqual([false, true]);
  });

  it('a throwing listener never changes the lock', () => {
    resetPinAttemptsForTests();
    const gate = createLockGate(
      { read: () => ({ enabled: true, pinHash: hashPin('1357') }), write: () => undefined },
      () => {
        throw new Error('listener');
      },
    );
    expect(gate.verify('1357').ok).toBe(true);
    expect(gate.isLocked()).toBe(false);
  });
});
