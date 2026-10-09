// @vitest-environment node
/**
 * A node-level simulation of the Squirrel update flow, N -> N+1, with Electron's
 * `autoUpdater` stubbed: every event Update.exe produces is replayed into the
 * controller (main/squirrelUpdater.ts) and what the update panel renders for it
 * is read back through the same pure function the panel uses
 * (`describeAppUpdate`, shared/appUpdate.ts). Also: the metered-connection guard,
 * translated error codes, the persisted last-check time, and that the restart
 * flags the app as quitting before Squirrel takes over (tray mode would swallow
 * the close otherwise).
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyUpdateError,
  describeAppUpdate,
  type AppUpdateDetails,
} from '../../shared/appUpdate';
import { createAppUpdateController, SQUIRREL_FEED_URL } from '../squirrelUpdater';
import { isConnectionMetered, parseConnectionCost } from '../meteredConnection';

function fakeUpdater() {
  return Object.assign(new EventEmitter(), {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  });
}

function harness(opts: { metered?: boolean | null; lastChecked?: number | null } = {}) {
  const updater = fakeUpdater();
  const timers: Array<{ fn: () => void; ms: number; repeat: boolean }> = [];
  const panel: AppUpdateDetails[] = [];
  const order: string[] = [];
  let clock = 1_700_000_000_000;
  let saved: number | null = opts.lastChecked ?? null;
  updater.quitAndInstall.mockImplementation(() => void order.push('quitAndInstall'));
  const controller = createAppUpdateController({
    install: 'installed',
    updater,
    currentVersion: '1.0.2',
    broadcast: () => undefined,
    broadcastDetails: (d) => panel.push(d),
    markQuitting: () => void order.push('markQuitting'),
    setTimer: (fn, ms, repeat) => void timers.push({ fn, ms, repeat }),
    now: () => clock,
    ...(opts.metered !== undefined ? { isMetered: async () => opts.metered ?? null } : {}),
    lastCheckedStore: { load: () => saved, save: (at) => void (saved = at) },
  });
  return {
    updater,
    timers,
    panel,
    order,
    controller,
    advance: (ms: number) => {
      clock += ms;
    },
    saved: () => saved,
    /** What the panel shows right now. */
    view: () => describeAppUpdate(controller.details()),
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('Squirrel update flow, simulated', () => {
  it('N -> N+1: idle, check, download, ready, restart', () => {
    const h = harness();
    h.controller.start();
    expect(h.updater.setFeedURL).toHaveBeenCalledWith({ url: SQUIRREL_FEED_URL });
    expect(h.view()).toMatchObject({ messageKey: 'upd2.state.notChecked', canCheck: true, canRestart: false });

    // "Check now"
    const afterClick = h.controller.checkNow();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(afterClick.lastCheckedAt).toBe(h.saved());

    h.updater.emit('checking-for-update');
    expect(h.view()).toMatchObject({ tone: 'busy', messageKey: 'upd2.state.checking', progress: 'indeterminate', canCheck: false });

    h.updater.emit('update-available');
    expect(h.view()).toMatchObject({ tone: 'busy', messageKey: 'upd2.state.downloading', progress: 'indeterminate' });
    const started = h.controller.details().downloadStartedAt;
    expect(typeof started).toBe('number');
    // A second click while downloading does not start a second download.
    h.controller.checkNow();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);

    h.advance(5 * 60_000);
    h.updater.emit('update-downloaded', {}, '', '1.0.3', new Date(), '');
    expect(h.view()).toEqual({
      tone: 'ok',
      messageKey: 'upd2.state.ready',
      vars: { version: '1.0.3' },
      progress: null,
      canCheck: false,
      canRestart: true,
    });
    expect(h.controller.details().downloadStartedAt).toBeUndefined();

    // The panel heard every step on its own channel.
    expect(h.panel.map((d) => d.state)).toEqual(['idle', 'checking', 'downloading', 'downloaded']);

    // Restart: the quit flag first, then Squirrel.
    expect(h.controller.restart()).toBe(true);
    expect(h.order).toEqual(['markQuitting', 'quitAndInstall']);
  });

  it('no update: checking then "up to date" with the running version', () => {
    const h = harness();
    h.controller.start();
    h.timers[0]!.fn(); // the automatic first check, no metered guard configured
    h.updater.emit('checking-for-update');
    h.updater.emit('update-not-available');
    expect(h.view()).toMatchObject({ tone: 'ok', messageKey: 'upd2.state.upToDate', vars: { version: '1.0.2' } });
  });

  it('errors are codes the panel translates, and a check clears them', () => {
    const h = harness();
    h.controller.start();
    h.updater.emit('error', new Error('The remote server returned an error: (404) Not Found.'));
    expect(h.view()).toMatchObject({ tone: 'warn', messageKey: 'upd2.error.no-feed', canCheck: true });
    h.controller.checkNow();
    h.updater.emit('checking-for-update');
    expect(h.controller.details().error).toBeUndefined();
    h.updater.emit('error', new Error('getaddrinfo ENOTFOUND github.com'));
    expect(h.view().messageKey).toBe('upd2.error.network');
  });

  it('checkForUpdates throwing (Update.exe missing) is an error state, not a crash', () => {
    const h = harness();
    h.updater.checkForUpdates.mockImplementation(() => {
      throw new Error('spawn C:\\Users\\u\\AppData\\Local\\jp_study_app\\Update.exe ENOENT');
    });
    h.controller.start();
    expect(() => h.controller.checkNow()).not.toThrow();
    expect(h.view().messageKey).toBe('upd2.error.updater-missing');
  });

  it('metered: the automatic check is skipped and said so; "Check now" still goes', async () => {
    const h = harness({ metered: true });
    h.controller.start();
    h.timers[0]!.fn();
    await flush();
    expect(h.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(h.view().messageKey).toBe('upd2.state.meteredSkipped');
    h.controller.checkNow();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(h.controller.details().skippedMetered).toBeUndefined();
  });

  it('metered unknown (cannot tell) checks as before', async () => {
    const h = harness({ metered: null });
    h.controller.start();
    h.timers[1]!.fn(); // the six-hourly one
    await flush();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('the last check time survives a restart', () => {
    const h = harness({ lastChecked: 1_600_000_000_000 });
    expect(h.controller.details().lastCheckedAt).toBe(1_600_000_000_000);
    expect(h.view().messageKey).toBe('upd2.state.upToDate');
  });

  it('a portable copy never touches the updater and the panel says why', () => {
    const updater = fakeUpdater();
    const c = createAppUpdateController({ install: 'portable', updater, broadcast: () => undefined, setTimer: () => undefined });
    c.start();
    c.checkNow();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(describeAppUpdate(c.details())).toMatchObject({ messageKey: 'upd2.state.portable', canCheck: true, canRestart: false });
  });
});

describe('error classification', () => {
  it.each([
    ['The remote server returned an error: (404) Not Found.', 'no-feed'],
    ['Could not find RELEASES file', 'no-feed'],
    ['getaddrinfo ENOTFOUND github.com', 'network'],
    ['The remote name could not be resolved', 'network'],
    ['connect ETIMEDOUT 140.82.112.3:443', 'network'],
    ['spawn Update.exe ENOENT', 'updater-missing'],
    ['Something odd', 'unknown'],
  ])('%s -> %s', (message, code) => {
    expect(classifyUpdateError(message)).toBe(code);
  });
});

describe('metered connection probe', () => {
  it('parses the WinRT connection cost', () => {
    expect(parseConnectionCost('Unrestricted|False|False')).toBe('unrestricted');
    expect(parseConnectionCost('Fixed|False|False\r\n')).toBe('metered');
    expect(parseConnectionCost('Variable|False|False')).toBe('metered');
    expect(parseConnectionCost('Unrestricted|True|False')).toBe('metered'); // roaming
    expect(parseConnectionCost('Unrestricted|False|True')).toBe('metered'); // over the data limit
    expect(parseConnectionCost('none')).toBe('unknown');
    expect(parseConnectionCost('Unknown|False|False')).toBe('unknown');
    expect(parseConnectionCost('')).toBe('unknown');
  });

  it('a failed or non-Windows probe is "cannot tell", never "metered"', async () => {
    expect(await isConnectionMetered(async () => { throw new Error('no powershell'); }, 'win32')).toBeNull();
    expect(await isConnectionMetered(async () => 'Fixed|False|False', 'linux')).toBeNull();
    expect(await isConnectionMetered(async () => 'Fixed|False|False', 'win32')).toBe(true);
    const run = vi.fn(async () => 'Unrestricted|False|False');
    expect(await isConnectionMetered(run, 'win32')).toBe(false);
    // Hidden, non-interactive, bounded.
    const [file, args, timeout] = run.mock.calls[0] as unknown as [string, string[], number];
    expect(file).toBe('powershell.exe');
    expect(args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive']));
    expect(timeout).toBeGreaterThan(0);
  });
});
