// @vitest-environment jsdom
/**
 * risk4: while main holds the lock, renderers make no sound and raise no OS
 * banners. The mirror (`appLockState.ts`) takes main's transitions; the sound
 * engine stays silent (and silences a running bed through the master gain) and
 * the calendar's system banner waits for the unlock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('renderer lock mirror', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows main: initial query, state broadcasts, and runs held tasks once on unlock', async () => {
    const mod = await import('../appLockState');
    mod.__resetAppLockStateForTests();
    let stateCb: ((locked: boolean) => void) | null = null;
    mod.installAppLockState({
      lockscreenIsLocked: () => Promise.resolve(true),
      onLockscreenState: (cb) => {
        stateCb = cb;
        return () => undefined;
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(mod.isAppLockedInRenderer()).toBe(true);
    const fn = vi.fn();
    expect(mod.runWhenUnlocked('k', fn)).toBe(true);
    expect(mod.runWhenUnlocked('k', fn)).toBe(true); // latest per key wins
    expect(fn).not.toHaveBeenCalled();
    stateCb!(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mod.isAppLockedInRenderer()).toBe(false);
    const now = vi.fn();
    expect(mod.runWhenUnlocked('n', now)).toBe(false);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it('without a bridge it counts as unlocked', async () => {
    const mod = await import('../appLockState');
    mod.__resetAppLockStateForTests();
    expect(mod.isAppLockedInRenderer()).toBe(false);
  });
});

describe('sound engine while locked', () => {
  const started = vi.fn();
  let master: { gain: { value: number } } | null = null;

  beforeEach(() => {
    vi.resetModules();
    started.mockClear();
    master = null;
    localStorage.clear();
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } });
    vi.stubGlobal('AudioContext', vi.fn(function MockAudioContext(this: Record<string, unknown>) {
      Object.assign(this, {
        state: 'running',
        currentTime: 0,
        destination: {},
        createGain: () => {
          const g = node();
          if (!master) master = g;
          return g;
        },
        createBufferSource: () => ({ ...node(), buffer: null, playbackRate: { value: 1 }, start: started, stop: vi.fn() }),
        decodeAudioData: vi.fn(async () => ({ duration: 0.2 })),
        resume: vi.fn(async () => undefined),
      });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays nothing while locked, mutes what is playing, restores the level after', async () => {
    const lock = await import('../appLockState');
    lock.__resetAppLockStateForTests();
    const { soundEngine } = await import('../audio/soundEngine');
    const { registerAeroProofSoundPack, AERO_PROOF_SOUND_PACK_ID } = await import('../audio/aeroProofPack');
    registerAeroProofSoundPack();
    soundEngine.setActivePack(AERO_PROOF_SOUND_PACK_ID);
    await soundEngine.play('ui', 'confirm');
    expect(started).toHaveBeenCalledTimes(1);
    const level = master!.gain.value;
    expect(level).toBeGreaterThan(0);

    lock.__setAppLockedForTests(true);
    expect(soundEngine.isLockSilenced()).toBe(true);
    expect(master!.gain.value).toBe(0);
    await soundEngine.play('ui', 'confirm');
    soundEngine.playTone('ui');
    expect(started).toHaveBeenCalledTimes(1);

    lock.__setAppLockedForTests(false);
    expect(master!.gain.value).toBe(level);
    await soundEngine.play('ui', 'confirm');
    expect(started).toHaveBeenCalledTimes(2);
  });
});

describe('calendar reminders while locked', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('the OS banner waits for the unlock', async () => {
    const lock = await import('../appLockState');
    lock.__resetAppLockStateForTests();
    const banners: string[] = [];
    vi.stubGlobal('Notification', vi.fn(function FakeNotification(this: Record<string, unknown>, title: string) {
      banners.push(title);
    }));
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { deliverCalendarReminders } = await import('../calendarReminderDelivery');
    lock.__setAppLockedForTests(true);
    deliverCalendarReminders([
      { key: 'r1', title: 'Exam', startsAt: Date.now() + 60_000, allDay: false, missed: false } as never,
    ]);
    expect(banners).toEqual([]);
    lock.__setAppLockedForTests(false);
    expect(banners).toEqual(['Exam']);
  });
});
