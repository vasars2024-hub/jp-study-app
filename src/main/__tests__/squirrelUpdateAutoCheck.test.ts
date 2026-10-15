// @vitest-environment node
/**
 * "Check for updates automatically" and "Pause updates" (shared/appUpdate.ts
 * AppUpdatePrefs): the timer check honours both, "Check now" ignores both, and
 * both survive a restart through the prefs store.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  APP_UPDATE_PAUSE_MAX_MS,
  APP_UPDATE_PAUSE_MS,
  DEFAULT_APP_UPDATE_PREFS,
  automaticUpdateCheckAllowed,
  describeAppUpdate,
  sanitizeAppUpdatePrefs,
  type AppUpdatePrefs,
} from '../../shared/appUpdate';
import { createAppUpdateController } from '../squirrelUpdater';

function rig(initial: Partial<AppUpdatePrefs> = {}) {
  const updater = Object.assign(new EventEmitter(), {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  });
  const clock = { t: 1_700_000_000_000 };
  const timers: Array<{ fn: () => void; ms: number; repeat: boolean }> = [];
  let stored: AppUpdatePrefs = { ...DEFAULT_APP_UPDATE_PREFS, ...initial };
  const logs: string[] = [];
  const c = createAppUpdateController({
    install: 'installed',
    updater,
    broadcast: () => undefined,
    setTimer: (fn, ms, repeat) => void timers.push({ fn, ms, repeat }),
    now: () => clock.t,
    log: (m) => logs.push(m),
    prefsStore: {
      load: () => stored,
      save: (p) => {
        stored = p;
      },
    },
  });
  c.start();
  const tick = () => timers[1]!.fn();
  return { c, updater, clock, tick, logs, stored: () => stored };
}

describe('automatic update checks', () => {
  it('are on by default, and an older state file without the fields keeps them on', () => {
    expect(DEFAULT_APP_UPDATE_PREFS.autoCheck).toBe(true);
    expect(sanitizeAppUpdatePrefs({ channel: 'beta', skippedVersion: null })).toEqual({
      channel: 'beta',
      skippedVersion: null,
      autoCheck: true,
      pausedUntil: null,
    });
    const r = rig();
    r.tick();
    expect(r.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(r.c.details().autoCheck).toBe(true);
  });

  it('turned off: the timer does nothing, "Check now" still checks, and it is saved', () => {
    const r = rig();
    r.c.setPrefs({ autoCheck: false });
    expect(r.stored().autoCheck).toBe(false);
    r.tick();
    expect(r.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(r.logs.join('\n')).toMatch(/skipped: turned off/);
    r.c.checkNow();
    expect(r.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(r.c.details().autoCheck).toBe(false);
  });

  it('paused: no automatic check until the pause ends; "Resume" ends it at once', () => {
    const r = rig();
    const until = r.clock.t + APP_UPDATE_PAUSE_MS;
    r.c.setPrefs({ pausedUntil: until });
    expect(r.c.details().pausedUntil).toBe(until);
    r.tick();
    expect(r.updater.checkForUpdates).not.toHaveBeenCalled();
    r.c.checkNow();
    expect(r.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    // A week later the pause is over by itself, and the panel stops saying so.
    r.clock.t = until + 1;
    expect(r.c.details().pausedUntil).toBeUndefined();
    r.tick();
    expect(r.updater.checkForUpdates).toHaveBeenCalledTimes(2);
    // Paused again, then resumed by hand.
    r.c.setPrefs({ pausedUntil: r.clock.t + APP_UPDATE_PAUSE_MS });
    r.c.setPrefs({ pausedUntil: null });
    r.tick();
    expect(r.updater.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it('a saved pause survives a restart; a pause from a clock set far ahead does not hold', () => {
    const now = 1_700_000_000_000;
    const kept = rig({ pausedUntil: now + 60_000 });
    kept.tick();
    expect(kept.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(automaticUpdateCheckAllowed({ autoCheck: true, pausedUntil: now + APP_UPDATE_PAUSE_MAX_MS + 1 }, now)).toBe(true);
    expect(automaticUpdateCheckAllowed({ autoCheck: true, pausedUntil: now - 1 }, now)).toBe(true);
    expect(automaticUpdateCheckAllowed({ autoCheck: false, pausedUntil: null }, now)).toBe(false);
  });

  it('rejects junk over IPC', () => {
    const base = { ...DEFAULT_APP_UPDATE_PREFS, autoCheck: false, pausedUntil: 5 };
    expect(sanitizeAppUpdatePrefs({ autoCheck: 'no', pausedUntil: 'soon' }, base)).toEqual(base);
    expect(sanitizeAppUpdatePrefs({ pausedUntil: -1 }, base).pausedUntil).toBe(5);
    expect(sanitizeAppUpdatePrefs({ pausedUntil: null }, base).pausedUntil).toBeNull();
  });

  it('the panel never promises a timed check while automatic checks are off or paused', () => {
    const d = { install: 'installed' as const, state: 'idle' as const, current: '1.0.1', channel: 'stable' as const, feedUrl: '', lastCheckedAt: null };
    expect(describeAppUpdate(d).messageKey).toBe('upd2.state.notChecked');
    expect(describeAppUpdate({ ...d, autoCheck: false }).messageKey).toBe('upd3.state.manualOnly');
    expect(describeAppUpdate({ ...d, pausedUntil: Date.now() + 1000 }).messageKey).toBe('upd3.state.manualOnly');
    expect(describeAppUpdate({ ...d, autoCheck: false, lastCheckedAt: 1 }).messageKey).toBe('upd2.state.upToDate');
  });
});
