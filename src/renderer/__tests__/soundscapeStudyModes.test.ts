// @vitest-environment jsdom
/**
 * snd5 — the mixer follows the study mode, remembers a volume per scene, and
 * the sleep timer ends on the chosen fade schedule. Driven through the real
 * store, the real command registry and fake timers; jsdom has no AudioContext,
 * so the store's own playing state is what is asserted (as focusSoundscape.test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

type Store = typeof import('../soundscape/soundscapeStore');
type Link = typeof import('../soundscape/studyModeSoundscape');
type KS = typeof import('../keyboardShortcuts');

let store: Store;
let link: Link;
let ks: KS;
let uninstall: () => void = () => undefined;

async function load(): Promise<void> {
  vi.resetModules();
  ks = await import('../keyboardShortcuts');
  store = await import('../soundscape/soundscapeStore');
  link = await import('../soundscape/studyModeSoundscape');
}

/** Let the registry's coalesced signal fire. */
function settle(): void {
  vi.advanceTimersByTime(300);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 9, 10, 0, 0));
  localStorage.clear();
  await load();
});

afterEach(() => {
  uninstall();
  uninstall = () => undefined;
  vi.useRealTimers();
});

describe('per-scene volume memory', () => {
  it('brings each scene back at the volume last used with it', () => {
    store.applySoundscapeScene('temple-dawn');
    store.setSoundscapeMaster(0.3);
    store.applySoundscapeScene('rainy-cafe');
    store.setSoundscapeMaster(0.9);
    store.applySoundscapeScene('temple-dawn');
    expect(store.getSoundscape().state.master).toBeCloseTo(0.3);
    store.applySoundscapeScene('rainy-cafe');
    expect(store.getSoundscape().state.master).toBeCloseTo(0.9);
  });

  it('a mix that matches no scene remembers nothing', () => {
    store.setSoundLayerLevel('rain', 0.33);
    store.setSoundscapeMaster(0.2);
    expect(store.getSoundscape().state.sceneVolumes).toEqual({});
  });
});

describe('the sleep timer follows the fade schedule', () => {
  it('stops exactly at the end, after fading for the schedule\'s length', () => {
    store.setSoundscapeFade('gentle');
    store.applySoundscapeScene('deep-focus');
    expect(store.isSoundscapePlaying()).toBe(true);
    store.setSoundscapeTimer(1);
    vi.advanceTimersByTime(59_000);
    expect(store.isSoundscapePlaying(), 'still playing (fading) before the end').toBe(true);
    vi.advanceTimersByTime(1_500);
    expect(store.isSoundscapePlaying()).toBe(false);
    expect(store.getSoundscape().timerEndsAt).toBeNull();
  });

  it('remembers the schedule', async () => {
    store.setSoundscapeFade('sleep');
    vi.advanceTimersByTime(400);
    await load();
    expect(store.getSoundscape().state.fade).toBe('sleep');
  });
});

describe('scenes follow the study mode', () => {
  it('does nothing until it is switched on', () => {
    uninstall = link.installStudyModeSoundscape();
    const off = ks.registerCommandHandler('flashcards.flip', () => undefined);
    settle();
    expect(store.isSoundscapePlaying()).toBe(false);
    off();
  });

  it('a review session plays its scene and stops what it started when it ends', () => {
    uninstall = link.installStudyModeSoundscape();
    link.saveStudyModePresets({ enabled: true, review: 'summer-afternoon' });
    const off = ks.registerCommandHandler('flashcards.flip', () => undefined);
    settle();
    expect(store.isSoundscapePlaying()).toBe(true);
    expect(store.getSoundscape().sceneId).toBe('summer-afternoon');
    expect(link.studyModeLinkState()).toMatchObject({ mode: 'review', owned: true });
    off();
    settle();
    expect(store.isSoundscapePlaying()).toBe(false);
  });

  it('listening pauses the owner\'s sound and gives it back afterwards', () => {
    store.applySoundscapeScene('rainy-cafe');
    expect(store.isSoundscapePlaying()).toBe(true);
    uninstall = link.installStudyModeSoundscape();
    link.saveStudyModePresets({ enabled: true });
    const off = ks.registerCommandHandler('video.replayLine', () => undefined);
    settle();
    expect(store.isSoundscapePlaying()).toBe(false);
    expect(link.studyModeLinkState().pausedFor).toBe('listening');
    off();
    settle();
    expect(store.isSoundscapePlaying()).toBe(true);
    expect(store.getSoundscape().sceneId).toBe('rainy-cafe');
  });

  it('review wins over a book left open behind it', () => {
    expect(link.detectStudyMode((id) => id === 'reader.pageNext' || id === 'flashcards.flip')).toBe('review');
    expect(link.detectStudyMode((id) => id === 'reader.pageNext')).toBe('reading');
    expect(link.detectStudyMode(() => false)).toBeNull();
  });

  it('pausing by hand takes the sound back from the link', () => {
    uninstall = link.installStudyModeSoundscape();
    link.saveStudyModePresets({ enabled: true, reading: 'deep-focus' });
    const off = ks.registerCommandHandler('reader.pageNext', () => undefined);
    settle();
    expect(store.isSoundscapePlaying()).toBe(true);
    store.toggleSoundscape();
    expect(store.isSoundscapePlaying()).toBe(false);
    off();
    settle();
    expect(store.isSoundscapePlaying()).toBe(false);
    expect(link.studyModeLinkState().owned).toBe(false);
  });
});
