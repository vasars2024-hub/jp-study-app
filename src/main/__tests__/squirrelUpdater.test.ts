// @vitest-environment node
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdateStatus } from '../../shared/appUpdate';
import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  SQUIRREL_FEED_URL,
  createAppUpdateController,
  detectInstallKind,
} from '../squirrelUpdater';

const INSTALLED = 'C:\\Users\\u\\AppData\\Local\\jp_study_app\\app-1.0.1\\jp-study-app.exe';
const PORTABLE = 'C:\\Apps\\jp-study-app-win32-x64\\jp-study-app.exe';

describe('detectInstallKind', () => {
  const updateExeExists = (p: string) => p.endsWith('jp_study_app\\Update.exe');
  it('installed = app-<version> folder with Update.exe beside it', () => {
    expect(detectInstallKind(INSTALLED, true, 'win32', updateExeExists)).toBe('installed');
  });
  it('the zip is portable, a dev run is dev', () => {
    expect(detectInstallKind(PORTABLE, true, 'win32', updateExeExists)).toBe('portable');
    expect(detectInstallKind(INSTALLED, true, 'win32', () => false)).toBe('portable');
    expect(detectInstallKind(INSTALLED, false, 'win32', updateExeExists)).toBe('dev');
    expect(detectInstallKind(INSTALLED, true, 'linux', updateExeExists)).toBe('portable');
  });
});

function fakeUpdater() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  });
}

describe('createAppUpdateController', () => {
  it('stays idle on a portable or dev build: no feed, no checks, nothing to restart', () => {
    const updater = fakeUpdater();
    const timers: number[] = [];
    const c = createAppUpdateController({
      install: 'portable',
      updater,
      broadcast: () => undefined,
      setTimer: (_fn, ms) => void timers.push(ms),
    });
    c.start();
    c.check();
    expect(updater.setFeedURL).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(timers).toEqual([]);
    expect(c.restart()).toBe(false);
    expect(c.status()).toEqual({ install: 'portable', state: 'idle' });
  });

  it('installed: points at the GitHub feed, checks later and periodically, then offers the restart', () => {
    const updater = fakeUpdater();
    const seen: AppUpdateStatus[] = [];
    const timers: Array<{ fn: () => void; ms: number; repeat: boolean }> = [];
    const c = createAppUpdateController({
      install: 'installed',
      updater,
      broadcast: (s) => seen.push(s),
      setTimer: (fn, ms, repeat) => void timers.push({ fn, ms, repeat }),
    });
    c.start();
    expect(updater.setFeedURL).toHaveBeenCalledWith({ url: SQUIRREL_FEED_URL });
    expect(SQUIRREL_FEED_URL).toBe('https://github.com/vasars2024-hub/jp-study-app/releases/latest/download');
    expect(timers.map((t) => [t.ms, t.repeat])).toEqual([[FIRST_CHECK_DELAY_MS, false], [CHECK_INTERVAL_MS, true]]);

    expect(c.restart()).toBe(false); // nothing downloaded yet
    timers[0]!.fn();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

    updater.emit('checking-for-update');
    updater.emit('update-available');
    c.check(); // a download in flight is not restarted
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    updater.emit('update-downloaded', {}, '', '1.0.2', new Date(), '');
    expect(seen.map((s) => s.state)).toEqual(['checking', 'downloading', 'downloaded']);
    expect(c.status()).toEqual({ install: 'installed', state: 'downloaded', version: '1.0.2' });

    // A late error (e.g. the periodic check offline) does not hide a staged update.
    updater.emit('error', new Error('offline'));
    expect(c.status().state).toBe('downloaded');

    expect(c.restart()).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('restart flags the app as quitting before quitAndInstall (tray mode would otherwise hide)', () => {
    const updater = fakeUpdater();
    const order: string[] = [];
    updater.quitAndInstall.mockImplementation(() => void order.push('quitAndInstall'));
    const markQuitting = vi.fn(() => void order.push('markQuitting'));
    const c = createAppUpdateController({
      install: 'installed',
      updater,
      broadcast: () => undefined,
      markQuitting,
      setTimer: () => undefined,
    });
    c.start();
    // Squirrel's own quit path (e.g. from elsewhere) also flags it.
    updater.emit('before-quit-for-update');
    expect(markQuitting).toHaveBeenCalledTimes(1);
    expect(c.restart()).toBe(false);
    expect(markQuitting).toHaveBeenCalledTimes(1);
    updater.emit('update-downloaded', {}, '', '1.0.2', new Date(), '');
    order.length = 0;
    expect(c.restart()).toBe(true);
    expect(order).toEqual(['markQuitting', 'quitAndInstall']);
  });

  it('a release without Squirrel assets is an error state, logged, not a crash', () => {
    const updater = fakeUpdater();
    const logs: string[] = [];
    const c = createAppUpdateController({
      install: 'installed',
      updater,
      broadcast: () => undefined,
      log: (m) => logs.push(m),
      setTimer: () => undefined,
    });
    c.start();
    updater.emit('error', new Error('404 RELEASES'));
    expect(c.status().state).toBe('error');
    expect(logs[0]).toContain('404 RELEASES');
    // and it tries again on the next check
    c.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
