// @vitest-environment node
/**
 * lock3 — main arms the lock by itself (main/lockAutoArm.ts): after system idle,
 * on sleep, on Windows' own lock. Each is opt-in, needs a PIN, and nothing here
 * can unlock. The power monitor is a stub: real sleep / Win+L on hardware is
 * covered by the e2e flow's direct event emit and by hand.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installLockAutoArm,
  trackMediaActivity,
  IDLE_POLL_MS,
  MEDIA_PROBE_TIMEOUT_MS,
  VISIBLE_VIDEO_PROBE,
  type AutoLockReason,
  type MediaWebContentsLike,
} from '../lockAutoArm';
import type { AutoLockOptions } from '../../shared/lockStatus';

function rig(
  options: Partial<AutoLockOptions>,
  opts: { hasPin?: boolean; idle?: number; media?: { secondsSinceMedia(): number | null; refresh?(): Promise<void> } } = {},
) {
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

describe('media counts only when the viewer can hear or see it (re-checked each poll)', () => {
  /** A contents the tracker can ask: Chromium's audible flag and a look inside its page. */
  const live = (id: number) => {
    const state = { audible: false, visible: false as boolean | 'hang' | 'throw', destroyed: false, looks: 0, code: '' };
    const wc = Object.assign(new EventEmitter(), {
      id,
      isDestroyed: () => state.destroyed,
      isCurrentlyAudible: () => state.audible,
      executeJavaScript: (code: string): Promise<unknown> => {
        state.looks += 1;
        state.code = code;
        if (state.visible === 'hang') return new Promise(() => undefined);
        if (state.visible === 'throw') return Promise.reject(new Error('frame gone'));
        return Promise.resolve(state.visible);
      },
    }) as EventEmitter & MediaWebContentsLike;
    return { wc, state };
  };
  const setup = () => {
    const clock = { t: 5_000_000 };
    const app = new EventEmitter();
    const main = live(1);
    const media = trackMediaActivity(app as never, [main.wc], () => clock.t);
    return { clock, app, main, media };
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muted music nobody sees (the e2e under --mute-audio) and a hidden warm video are not activity, and do not restart the idle clock', async () => {
    const { clock, main, media } = setup();
    main.wc.emit('media-started-playing');
    await settle();
    expect(main.state.looks).toBe(1);
    expect(main.state.code).toBe(VISIBLE_VIDEO_PROBE);
    expect(media.playing()).toBe(false);
    clock.t += 30_000;
    main.wc.emit('media-paused');
    await settle();
    expect(media.secondsSinceMedia()).toBeNull();
    // 61 s of system idle with "after 1 minute": it locks, the silent song does not hold it.
    const r = rig({ idleMinutes: 1 }, { idle: 61, media });
    expect(r.arm.checkIdle()).toBe(true);
  });

  it('audible audio holds the lock off, and the clock restarts when it stops', async () => {
    const { clock, main, media } = setup();
    main.state.audible = true;
    main.wc.emit('media-started-playing');
    await settle();
    const r = rig({ idleMinutes: 1 }, { idle: 3600, media });
    expect(r.arm.checkIdle()).toBe(false);
    clock.t += 10 * 60_000;
    // Chromium still reports it audible when `media-paused` arrives.
    main.wc.emit('media-paused');
    main.state.audible = false;
    clock.t += 59_000;
    expect(r.arm.checkIdle()).toBe(false);
    clock.t += 2_000;
    expect(r.arm.checkIdle()).toBe(true);
  });

  it('a video on screen counts even muted; a missed media-paused cannot hold the lock off', async () => {
    const { clock, main, media } = setup();
    main.state.visible = true;
    main.wc.emit('media-started-playing');
    await settle();
    expect(media.playing()).toBe(true);
    const r = rig({ idleMinutes: 1 }, { idle: 3600, media });
    clock.t += 60 * 60_000;
    await media.refresh();
    expect(r.arm.checkIdle()).toBe(false);
    // The video stopped but Chromium's media-paused never came: the next look says so.
    main.state.visible = false;
    clock.t += IDLE_POLL_MS;
    await media.refresh();
    expect(media.playing()).toBe(false);
    clock.t += 61_000;
    expect(r.arm.checkIdle()).toBe(true);
  });

  it('without any look at all the "playing" claim goes stale instead of lasting forever', async () => {
    const { clock, main, media } = setup();
    main.state.visible = true;
    main.wc.emit('media-started-playing');
    await settle();
    expect(media.playing()).toBe(true);
    // Nobody refreshes (a stuck poll): the last sighting expires.
    clock.t += 2 * IDLE_POLL_MS + MEDIA_PROBE_TIMEOUT_MS + 1;
    expect(media.playing()).toBe(false);
  });

  it('two players in one window: one pausing does not stop the other counting', async () => {
    const { main, media } = setup();
    main.state.visible = true;
    main.wc.emit('media-started-playing');
    main.wc.emit('media-started-playing');
    await settle();
    main.wc.emit('media-paused');
    // The clip is still on screen; the look after the pause finds it.
    await settle();
    expect(media.playing()).toBe(true);
  });

  it('looks in every frame (a video in an embedded frame counts)', async () => {
    const clock = { t: 0 };
    const app = new EventEmitter();
    const frames = [{ executeJavaScript: () => Promise.resolve(false) }, { executeJavaScript: () => Promise.resolve(true) }];
    const wc = Object.assign(new EventEmitter(), {
      id: 7,
      isDestroyed: () => false,
      isCurrentlyAudible: () => false,
      executeJavaScript: () => Promise.resolve(false),
      mainFrame: { framesInSubtree: frames },
    }) as EventEmitter & MediaWebContentsLike;
    const media = trackMediaActivity(app as never, [], () => clock.t);
    app.emit('web-contents-created', {}, wc);
    wc.emit('media-started-playing');
    await settle();
    expect(media.playing()).toBe(true);
  });

  it('a look that never answers or throws counts as nothing seen', async () => {
    vi.useFakeTimers();
    const { main, media } = setup();
    main.state.visible = 'hang';
    main.wc.emit('media-started-playing');
    // While the first look is on its way the start event holds...
    expect(media.playing()).toBe(true);
    await vi.advanceTimersByTimeAsync(MEDIA_PROBE_TIMEOUT_MS + 1);
    // ...and no longer than the look's timeout.
    expect(media.playing()).toBe(false);
    main.state.visible = 'throw';
    await media.refresh();
    expect(media.playing()).toBe(false);
  });

  it('a contents that is gone stops counting even without a destroyed event', async () => {
    const { main, media } = setup();
    main.state.audible = true;
    main.wc.emit('media-started-playing');
    await settle();
    expect(media.playing()).toBe(true);
    main.state.destroyed = true;
    expect(media.playing()).toBe(false);
  });

  it('the poll looks at the media again before it checks the idle time', async () => {
    const order: string[] = [];
    const media = {
      refresh: vi.fn(async () => {
        order.push('refresh');
      }),
      secondsSinceMedia: vi.fn(() => {
        order.push('read');
        return null;
      }),
    };
    const r = rig({ idleMinutes: 1 }, { idle: 61, media });
    r.state.intervals[0]!.fn();
    await settle();
    expect(order).toEqual(['refresh', 'read']);
    expect(r.state.reasons).toEqual(['idle']);
    // Idle lock off: the poll does not look at anything.
    const off = rig({ idleMinutes: 0 }, { idle: 61, media });
    off.state.intervals[0]!.fn();
    await settle();
    expect(media.refresh).toHaveBeenCalledTimes(1);
  });
});
