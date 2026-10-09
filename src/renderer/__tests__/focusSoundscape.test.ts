// @vitest-environment jsdom
/**
 * snd2 — the Soundscape follows focus. Driven through the real timer store,
 * Focus Mode and mixer store; jsdom has no AudioContext, so the engine stays
 * silent while the store's own playing state is what is asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Link = typeof import('../soundscape/focusSoundscape');
type Store = typeof import('../soundscape/soundscapeStore');
type Timers = typeof import('../widgets/timerStore');
type Focus = typeof import('../focusMode');
type Model = typeof import('../soundscape/soundscapeModel');

let link: Link;
let store: Store;
let timers: Timers;
let focus: Focus;
let model: Model;
let uninstall: () => void = () => undefined;

const POMO = 'pomo-1';

async function load(): Promise<void> {
  vi.resetModules();
  link = await import('../soundscape/focusSoundscape');
  store = await import('../soundscape/soundscapeStore');
  timers = await import('../widgets/timerStore');
  focus = await import('../focusMode');
  model = await import('../soundscape/soundscapeModel');
  timers.setTimerFinishedHandler(() => undefined);
}

function startWork(now = Date.now()): void {
  timers.setTimer(POMO, timers.startTimer(timers.idleTimer('pomodoro', 25 * 60_000), now), { work: 25 * 60_000, break: 5 * 60_000 });
}

function finishWork(now: number): void {
  timers.tickTimers(now);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 8, 10, 0, 0));
  localStorage.clear();
  await load();
});

afterEach(() => {
  uninstall();
  timers.resetTimerStoreForTests();
  vi.useRealTimers();
});

describe('soundscape during focus', () => {
  it('is off by default: a work block does not start sound nobody asked for', () => {
    uninstall = link.installFocusSoundscape();
    startWork();
    expect(store.isSoundscapePlaying()).toBe(false);
  });

  it('plays the chosen scene for a work block and fades it out for the break', () => {
    const scene = model.BUILT_IN_SCENES[0];
    link.saveFocusSoundscape({ enabled: true, sceneId: scene.id });
    uninstall = link.installFocusSoundscape();
    const t0 = Date.now();
    startWork(t0);
    expect(store.isSoundscapePlaying()).toBe(true);
    expect(store.getSoundscape().sceneId).toBe(scene.id);
    expect(link.focusSoundscapeOwnsPlayback()).toBe(true);

    vi.setSystemTime(t0 + 25 * 60_000 + 10);
    finishWork(Date.now());
    expect(timers.isPomodoroOnBreak()).toBe(true);
    expect(store.isSoundscapePlaying()).toBe(false);
    expect(link.focusSoundscapeOwnsPlayback()).toBe(false);
  });

  it('keeps playing through the break when fading is off', () => {
    link.saveFocusSoundscape({ enabled: true, sceneId: model.BUILT_IN_SCENES[0].id, fadeOnBreak: false });
    uninstall = link.installFocusSoundscape();
    const t0 = Date.now();
    startWork(t0);
    vi.setSystemTime(t0 + 25 * 60_000 + 10);
    finishWork(Date.now());
    expect(store.isSoundscapePlaying()).toBe(true);
  });

  it('never stops a soundscape the user started by hand', () => {
    link.saveFocusSoundscape({ enabled: true, sceneId: model.BUILT_IN_SCENES[0].id });
    uninstall = link.installFocusSoundscape();
    store.applySoundscapeScene(model.BUILT_IN_SCENES[1].id);
    expect(store.isSoundscapePlaying()).toBe(true);
    const t0 = Date.now();
    startWork(t0);
    // Already playing: the link does not switch the scene under the user.
    expect(store.getSoundscape().sceneId).toBe(model.BUILT_IN_SCENES[1].id);
    vi.setSystemTime(t0 + 25 * 60_000 + 10);
    finishWork(Date.now());
    expect(store.isSoundscapePlaying()).toBe(true);
  });

  it('hands control back when the user pauses during focus', () => {
    link.saveFocusSoundscape({ enabled: true, sceneId: model.BUILT_IN_SCENES[0].id });
    uninstall = link.installFocusSoundscape();
    startWork();
    store.toggleSoundscape();
    expect(store.isSoundscapePlaying()).toBe(false);
    expect(link.focusSoundscapeOwnsPlayback()).toBe(false);
  });

  it('follows Focus Mode on and off', () => {
    link.saveFocusSoundscape({ enabled: true, sceneId: model.BUILT_IN_SCENES[0].id, withPomodoro: false });
    uninstall = link.installFocusSoundscape();
    focus.setFocusMode(true);
    expect(store.isSoundscapePlaying()).toBe(true);
    focus.setFocusMode(false);
    expect(store.isSoundscapePlaying()).toBe(false);
  });

  it('acts at once when switched on mid-block, and off again', () => {
    uninstall = link.installFocusSoundscape();
    startWork();
    expect(store.isSoundscapePlaying()).toBe(false);
    link.saveFocusSoundscape({ enabled: true, sceneId: model.BUILT_IN_SCENES[0].id });
    expect(store.isSoundscapePlaying()).toBe(true);
    link.saveFocusSoundscape({ enabled: false });
    expect(store.isSoundscapePlaying()).toBe(false);
  });

  it('tallies the focus time the soundscape accompanied, per day', () => {
    link.saveFocusSoundscape({ enabled: true, sceneId: model.BUILT_IN_SCENES[0].id });
    uninstall = link.installFocusSoundscape();
    const t0 = Date.now();
    startWork(t0);
    vi.setSystemTime(t0 + 25 * 60_000 + 10);
    finishWork(Date.now());
    expect(Math.round(link.focusSoundSecondsOn() / 60)).toBe(25);
  });
});
