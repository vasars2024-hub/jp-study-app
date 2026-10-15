// @vitest-environment node
/**
 * lock3 — main arms the lock by itself (main/lockAutoArm.ts): after system idle,
 * on sleep, on Windows' own lock. Each is opt-in, needs a PIN, and nothing here
 * can unlock. The power monitor is a stub: real sleep / Win+L on hardware is
 * covered by the e2e flow's direct event emit and by hand.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { installLockAutoArm, trackMediaActivity, IDLE_POLL_MS, type AutoLockReason, type MediaWebContentsLike } from '../lockAutoArm';
import type { AutoLockOptions } from '../../shared/lockStatus';

function rig(options: Partial<AutoLockOptions>, opts: { hasPin?: boolean; idle?: number; media?: { secondsSinceMedia(): number | null } } = {}) {
  const power = Object.assign(new EventEmitter(), { idle: opts.idle ?? 0, getSystemIdleTime() { return this.idle; } });
  const state = { locked: false, reasons: [] as AutoLockReason[], intervals: [] as Array<{ fn: () => void; ms: number }> };
  const arm = installLockAutoArm({
    power,
    options: () => ({ idleMinutes: 0, onSleep: false, onScreenLock: false, ...options }),
    canLock: () => opts.hasPin ?? true,
    isLocked: () => state.locked,
    lock: (reason) => {
      state.reasons.push(reason);
      state.locked = true;
      return true;
    },
    setInterval: (fn, ms) => {
      state.intervals.push({ fn, ms });
      return state.intervals.length;
    },
    clearInterval: () => undefined,
    ...(opts.media ? { media: opts.media } : {}),
  });
  return { power, state, arm };
}

describe('auto-lock', () => {
  it('locks on sleep and on Windows lock only when each is turned on', () => {
    const off = rig({});
    off.power.emit('suspend');
    off.power.emit('lock-screen');
    expect(off.state.reasons).toEqual([]);

    const sleep = rig({ onSleep: true });
    sleep.power.emit('lock-screen');
    expect(sleep.state.reasons).toEqual([]);
    sleep.power.emit('suspend');
    expect(sleep.state.reasons).toEqual(['sleep']);

    const screen = rig({ onScreenLock: true });
    screen.power.emit('lock-screen');
    expect(screen.state.reasons).toEqual(['screen-lock']);
  });

  it('locks after the chosen idle time, polled every 15 s', () => {
    const r = rig({ idleMinutes: 5 }, { idle: 4 * 60 + 59 });
    expect(r.state.intervals.map((i) => i.ms)).toEqual([IDLE_POLL_MS]);
    r.state.intervals[0]!.fn();
    expect(r.state.reasons).toEqual([]);
    r.power.idle = 5 * 60;
    r.state.intervals[0]!.fn();
    expect(r.state.reasons).toEqual(['idle']);
    // Already locked: not armed again.
    r.state.intervals[0]!.fn();
    expect(r.state.reasons).toEqual(['idle']);
  });

  it('never arms without a PIN, never with idle "never"', () => {
    const noPin = rig({ idleMinutes: 1, onSleep: true }, { hasPin: false, idle: 3600 });
    noPin.power.emit('suspend');
    expect(noPin.arm.checkIdle()).toBe(false);
    expect(noPin.state.reasons).toEqual([]);
    const never = rig({ idleMinutes: 0 }, { idle: 99_999 });
    expect(never.arm.checkIdle()).toBe(false);
  });

  it('a power monitor that throws never breaks the poll', () => {
    const r = rig({ idleMinutes: 1 });
    r.power.getSystemIdleTime = () => {
      throw new Error('gone');
    };
    expect(r.arm.checkIdle()).toBe(false);
  });
});

describe('media playback counts as activity', () => {
  const contents = (id: number) => Object.assign(new EventEmitter(), { id }) as EventEmitter & MediaWebContentsLike;
  const clockRig = () => {
    const clock = { t: 1_000_000 };
    const app = new EventEmitter();
    const existing = contents(1);
    const media = trackMediaActivity(app as never, [existing], () => clock.t);
    return { clock, app, existing, media };
  };

  it('tracks every Gum webContents, existing and created later', () => {
    const { app, existing, media } = clockRig();
    expect(media.playing()).toBe(false);
    expect(media.secondsSinceMedia()).toBeNull();
    existing.emit('media-started-playing');
    expect(media.playing()).toBe(true);
    const popout = contents(2);
    app.emit('web-contents-created', {}, popout);
    popout.emit('media-started-playing');
    existing.emit('media-paused');
    // The pop-out is still playing.
    expect(media.playing()).toBe(true);
    expect(media.secondsSinceMedia()).toBe(0);
    // Closed mid-video: no media-paused ever comes, and it stops counting.
    popout.emit('destroyed');
    expect(media.playing()).toBe(false);
  });

  it('does not idle-lock while a video plays, and the idle clock restarts when it stops', () => {
    const { clock, existing, media } = clockRig();
    const r = rig({ idleMinutes: 5 }, { idle: 2 * 60 * 60, media });
    existing.emit('media-started-playing');
    // Two hours without a key press, but the film is still on.
    expect(r.arm.checkIdle()).toBe(false);
    existing.emit('media-paused');
    // It just ended: the system has been idle for hours, Gum has not.
    expect(r.arm.checkIdle()).toBe(false);
    clock.t += 4 * 60 * 1000;
    expect(r.arm.checkIdle()).toBe(false);
    clock.t += 60 * 1000;
    expect(r.arm.checkIdle()).toBe(true);
    expect(r.state.reasons).toEqual(['idle']);
  });

  it('the system idle time still wins when it is shorter, and a broken tracker never blocks the lock', () => {
    const { clock, existing, media } = clockRig();
    existing.emit('media-started-playing');
    existing.emit('media-paused');
    clock.t += 60 * 60 * 1000;
    const typed = rig({ idleMinutes: 5 }, { idle: 30, media });
    expect(typed.arm.checkIdle()).toBe(false);
    const broken = rig({ idleMinutes: 5 }, {
      idle: 10 * 60,
      media: {
        secondsSinceMedia() {
          throw new Error('gone');
        },
      },
    });
    expect(broken.arm.checkIdle()).toBe(true);
  });
});
