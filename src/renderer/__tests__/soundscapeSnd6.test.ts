// @vitest-environment jsdom
/**
 * snd6 — the data and wiring half: per-layer shaping in the model and the
 * store, saved mixes as a file (export, import, merge), scene changes asking
 * the engine for a cross-fade, ducking for speech / clips / video, and study
 * modes reported by pop-out windows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LAYER_LEVEL,
  FADE_SCHEDULES,
  MAX_SAVED_MIXES,
  applyMix,
  defaultSoundscapeState,
  exportMixesDocument,
  mergeImportedMixes,
  mixOf,
  normalizeLayerShape,
  normalizeSoundscapeState,
  parseMixesDocument,
  toneShelfGains,
  type SavedMix,
} from '../soundscape/soundscapeModel';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

describe('snd6 model: shaping', () => {
  it('clamps, snaps near-centre values and drops neutral shapes', () => {
    expect(normalizeLayerShape({ tone: 3, pan: -9 })).toEqual({ tone: 1, pan: -1 });
    expect(normalizeLayerShape({ tone: 0.011, pan: 'x' })).toEqual({ tone: 0, pan: 0 });
    const state = normalizeSoundscapeState({ shapes: { rain: { tone: 0.5, pan: -0.25 }, wind: { tone: 0, pan: 0 }, bogus: { tone: 1 } } });
    expect(state.shapes).toEqual({ rain: { tone: 0.5, pan: -0.25 } });
    expect(state.duckForSpeech).toBe(true);
    expect(normalizeSoundscapeState({ duckForSpeech: false }).duckForSpeech).toBe(false);
  });

  it('maps tone to two opposed shelves, nothing at centre', () => {
    expect(toneShelfGains(0)).toEqual({ lowDb: 0, highDb: 0 });
    expect(toneShelfGains(1)).toEqual({ lowDb: -4, highDb: 6 });
    expect(toneShelfGains(-1)).toEqual({ lowDb: 4, highDb: -6 });
  });

  it('a built-in scene leaves the owner\'s shaping alone; a saved mix brings its own', () => {
    const shaped = { ...defaultSoundscapeState(), shapes: { rain: { tone: -0.5, pan: 0.4 } } };
    const scene = applyMix(shaped, { layers: { rain: 0.5 }, music: 'off', musicVolume: 0.5 });
    expect(scene.shapes).toEqual({ rain: { tone: -0.5, pan: 0.4 } });
    const saved = applyMix(shaped, { layers: { rain: 0.5, wind: 0.3 }, music: 'off', musicVolume: 0.5, shapes: { wind: { tone: 1, pan: 0 } } });
    expect(saved.shapes).toEqual({ wind: { tone: 1, pan: 0 } });
  });

  it('mixOf only carries shapes when a sounding layer is shaped', () => {
    const state = applyMix(defaultSoundscapeState(), { layers: { rain: 0.5 }, music: 'off', musicVolume: 0.5 });
    expect(mixOf(state).shapes).toBeUndefined();
    expect(mixOf({ ...state, shapes: { rain: { tone: 0.3, pan: 0 }, wind: { tone: 1, pan: 0 } } }).shapes).toEqual({ rain: { tone: 0.3, pan: 0 } });
  });

  it('every fade schedule cross-fades scenes, longer as the schedule slows', () => {
    const fades = FADE_SCHEDULES.map((s) => s.crossfadeSec);
    expect(fades.every((x) => x > 0)).toBe(true);
    expect([...fades].sort((a, b) => a - b)).toEqual(fades);
  });
});

describe('snd6 model: mixes as a file', () => {
  const mine: SavedMix[] = [
    { id: 'mix-a', name: 'Night reading', layers: { rain: 0.4, fire: 0.3 }, music: 'lofi-dusk', musicVolume: 0.4, shapes: { rain: { tone: -0.4, pan: 0.2 } } },
    { id: 'mix-b', name: '朝', layers: { birds: 0.5 }, music: 'off', musicVolume: 0.5, shapes: {} },
  ];

  it('round-trips through export and parse, without the local ids', () => {
    const text = exportMixesDocument(mine, new Date('2026-10-12T00:00:00Z'));
    expect(text).not.toContain('mix-a');
    const parsed = parseMixesDocument(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mixes.map((m) => m.name)).toEqual(['Night reading', '朝']);
    expect(parsed.mixes[0].shapes).toEqual({ rain: { tone: -0.4, pan: 0.2 } });
  });

  it('accepts a bare array or one mix, repairs entries and refuses the rest', () => {
    const arr = parseMixesDocument(JSON.stringify([{ name: 'x', layers: { rain: 2, nope: 1 }, music: 'polka', musicVolume: 9 }]));
    expect(arr).toEqual({ ok: true, mixes: [{ name: 'x', layers: { rain: 1 }, music: 'off', musicVolume: 1 }] });
    expect(parseMixesDocument(JSON.stringify({ name: 'one', layers: { wind: 0.2 } })).ok).toBe(true);
    expect(parseMixesDocument('{oops')).toEqual({ ok: false, error: 'notJson' });
    expect(parseMixesDocument(JSON.stringify({ format: 'gum-keymap', mixes: [] }))).toEqual({ ok: false, error: 'notMixes' });
    expect(parseMixesDocument(JSON.stringify({ hello: 1 }))).toEqual({ ok: false, error: 'notMixes' });
    expect(parseMixesDocument(JSON.stringify([{ name: 'silent', layers: {}, music: 'off' }, { layers: { rain: 0.5 } }]))).toEqual({ ok: false, error: 'empty' });
  });

  it('merges: skips a mix that sounds the same, renames a clash, stops at the cap', () => {
    const incoming = [
      { name: 'Night reading', layers: { rain: 0.4, fire: 0.3 }, music: 'lofi-dusk' as const, musicVolume: 0.4 },
      { name: 'Night reading', layers: { rain: 0.9 }, music: 'off' as const, musicVolume: 0.5 },
    ];
    const merged = mergeImportedMixes(mine, incoming, (i) => `new-${i}`);
    expect(merged.added).toBe(1);
    expect(merged.duplicates).toBe(1);
    expect(merged.saved.at(-1)).toMatchObject({ id: 'new-1', name: 'Night reading (2)' });
    const full: SavedMix[] = Array.from({ length: MAX_SAVED_MIXES }, (_, i) => ({ id: `m${i}`, name: `m${i}`, layers: { rain: (i + 1) / 100 }, music: 'off', musicVolume: 0.5 }));
    const capped = mergeImportedMixes(full, [{ name: 'more', layers: { wind: 0.7 }, music: 'off', musicVolume: 0.5 }], () => 'x');
    expect(capped).toMatchObject({ added: 0, overflow: 1 });
    expect(capped.saved).toHaveLength(MAX_SAVED_MIXES);
  });
});

// ---- the store, the engine target, ducking and presence -----------------------

type Store = typeof import('../soundscape/soundscapeStore');
type Engine = typeof import('../soundscape/soundscapeEngine');
type FA = typeof import('../foregroundAudio');

let store: Store;
let engineMod: Engine;
let fa: FA;

async function load(): Promise<void> {
  vi.resetModules();
  fa = await import('../foregroundAudio');
  engineMod = await import('../soundscape/soundscapeEngine');
  store = await import('../soundscape/soundscapeStore');
}

describe('snd6 store', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    localStorage.clear();
    await load();
  });
  afterEach(() => {
    fa.resetForegroundAudioForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shapes a layer, keeps it while the layer is off, and drops it at neutral', () => {
    store.toggleSoundLayer('rain');
    store.setSoundLayerShape('rain', { tone: 0.6 });
    store.setSoundLayerShape('rain', { pan: -0.3 });
    expect(store.getSoundscape().state.shapes.rain).toEqual({ tone: 0.6, pan: -0.3 });
    store.toggleSoundLayer('rain');
    expect(store.getSoundscape().state.shapes.rain).toEqual({ tone: 0.6, pan: -0.3 });
    store.setSoundLayerShape('rain', { tone: 0, pan: 0 });
    expect(store.getSoundscape().state.shapes.rain).toBeUndefined();
  });

  it('sends shaping to the engine only for sounding layers', () => {
    const apply = vi.spyOn(engineMod.soundscapeEngine, 'apply');
    store.setSoundLayerShape('wind', { tone: 1 });
    store.toggleSoundLayer('rain');
    store.setSoundLayerShape('rain', { pan: 0.5 });
    expect(apply.mock.calls.at(-1)?.[0].shapes).toEqual({ rain: { tone: 0, pan: 0.5 } });
  });

  it('a scene change while playing asks the engine for the schedule\'s cross-fade; a slider never does', () => {
    const apply = vi.spyOn(engineMod.soundscapeEngine, 'apply');
    store.applySoundscapeScene('storm');
    // jsdom has no AudioContext: the store still counts itself as playing.
    expect(store.isSoundscapePlaying()).toBe(true);
    apply.mockClear();
    store.setSoundscapeFade('gentle');
    store.applySoundscapeScene('forest-morning');
    const withFade = apply.mock.calls.filter((c) => c[0].crossfadeSec !== undefined);
    expect(withFade.map((c) => c[0].crossfadeSec)).toEqual([4]);
    apply.mockClear();
    store.setSoundLayerLevel('birds', 0.8);
    expect(apply.mock.calls.every((c) => c[0].crossfadeSec === undefined)).toBe(true);
  });

  it('the first scene of a silent mixer fades in on its schedule rather than cross-fading', () => {
    const apply = vi.spyOn(engineMod.soundscapeEngine, 'apply');
    store.applySoundscapeScene('storm');
    expect(apply.mock.calls.some((c) => c[0].crossfadeSec !== undefined)).toBe(false);
  });

  it('ducks for speech deeper than for music, and only while asked to', () => {
    const apply = vi.spyOn(engineMod.soundscapeEngine, 'apply');
    store.applySoundscapeScene('deep-focus');
    fa.setForegroundAudio('tts', true);
    let last = apply.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ ducked: true, duckGain: 0.15 });
    expect(store.getSoundscape().ducking).toBe('speech');
    store.setSoundscapeDuckForSpeech(false);
    last = apply.mock.calls.at(-1)?.[0];
    expect(last?.ducked).toBe(false);
    expect(store.getSoundscape().ducking).toBeNull();
    store.setSoundscapeDuckForSpeech(true);
    fa.setForegroundAudio('tts', false);
    expect(apply.mock.calls.at(-1)?.[0].ducked).toBe(false);
  });

  it('a playing, audible <video> anywhere in the document ducks the mix; muting it lets go', () => {
    store.applySoundscapeScene('deep-focus');
    const video = document.createElement('video');
    document.body.appendChild(video);
    let paused = true;
    let muted = false;
    Object.defineProperty(video, 'paused', { get: () => paused });
    Object.defineProperty(video, 'muted', { get: () => muted });
    paused = false;
    video.dispatchEvent(new Event('playing'));
    expect(store.getSoundscape().ducking).toBe('speech');
    muted = true;
    video.dispatchEvent(new Event('volumechange'));
    expect(store.getSoundscape().ducking).toBeNull();
    video.remove();
  });

  it('exports and imports saved mixes, reporting what was added', () => {
    store.applySoundscapeScene('rainy-cafe');
    store.setSoundLayerLevel('rain', 0.7);
    store.setSoundLayerShape('rain', { tone: -0.5 });
    expect(store.saveSoundscapeMix('Wet café')).toBe(true);
    const text = store.exportSoundscapeMixes();
    const saved = store.getSoundscape().state.saved;
    store.deleteSoundscapeMix(saved[0].id);
    expect(store.importSoundscapeMixes(text)).toEqual({ ok: true, added: 1, duplicates: 0, overflow: 0 });
    expect(store.importSoundscapeMixes(text)).toEqual({ ok: true, added: 0, duplicates: 1, overflow: 0 });
    const back = store.getSoundscape().state.saved[0];
    expect(back.name).toBe('Wet café');
    expect(back.shapes).toEqual({ rain: { tone: -0.5, pan: 0 } });
    expect(store.importSoundscapeMixes('nope')).toEqual({ ok: false, error: 'notJson' });
  });

  it('a level remembered at zero still comes back audible (default level kept)', () => {
    expect(defaultSoundscapeState().levels.rain).toBe(DEFAULT_LAYER_LEVEL);
  });
});

describe('snd6 pop-out presence', () => {
  type Presence = typeof import('../soundscape/studyModePresence');
  type Link = typeof import('../soundscape/studyModeSoundscape');
  type KS = typeof import('../keyboardShortcuts');
  let presence: Presence;
  let link: Link;
  let ks: KS;
  const cleanups: (() => void)[] = [];

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 12, 9, 0, 0));
    localStorage.clear();
    await load();
    ks = await import('../keyboardShortcuts');
    presence = await import('../soundscape/studyModePresence');
    link = await import('../soundscape/studyModeSoundscape');
  });
  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    fa.resetForegroundAudioForTests();
    vi.useRealTimers();
  });

  /** What the main window hears when a pop-out writes: a storage event. */
  function storageEvent(): void {
    window.dispatchEvent(new StorageEvent('storage', { key: presence.PRESENCE_KEY }));
  }

  it('a pop-out publishes its mode and withdraws it on close', () => {
    cleanups.push(presence.installStudyModePresence('pop-1'));
    expect(presence.readPresence()).toEqual({});
    const off = ks.registerCommandHandler('reader.pageNext', () => true);
    vi.advanceTimersByTime(300);
    expect(presence.readPresence()['pop-1']).toMatchObject({ mode: 'reading', audio: false });
    off();
    vi.advanceTimersByTime(300);
    expect(presence.readPresence()['pop-1']).toBeUndefined();
  });

  it('the main window follows a pop-out\'s review session and lets go when it closes', () => {
    const { saveStudyModePresets } = link;
    saveStudyModePresets({ enabled: true, review: 'summer-afternoon' });
    cleanups.push(link.installStudyModeSoundscape());
    expect(store.isSoundscapePlaying()).toBe(false);
    // The pop-out's entry, as its own window would have written it.
    localStorage.setItem(presence.PRESENCE_KEY, JSON.stringify({ 'pop-2': { mode: 'review', audio: false, at: Date.now() } }));
    storageEvent();
    expect(link.studyModeLinkState().mode).toBe('review');
    expect(store.getSoundscape().sceneId).toBe('summer-afternoon');
    expect(store.isSoundscapePlaying()).toBe(true);
    localStorage.setItem(presence.PRESENCE_KEY, JSON.stringify({}));
    storageEvent();
    expect(link.studyModeLinkState().mode).toBeNull();
    expect(store.isSoundscapePlaying()).toBe(false);
  });

  it('ignores an entry a crashed pop-out left behind, once it goes stale', () => {
    localStorage.setItem(presence.PRESENCE_KEY, JSON.stringify({ dead: { mode: 'listening', audio: true, at: Date.now() } }));
    expect(presence.remoteStudyModes()).toEqual(['listening']);
    expect(presence.remoteStudyAudio()).toBe(true);
    vi.advanceTimersByTime(presence.PRESENCE_STALE_MS + 1000);
    expect(presence.remoteStudyModes()).toEqual([]);
    expect(presence.remoteStudyAudio()).toBe(false);
  });

  it('a video playing in a pop-out ducks the main window\'s mix', () => {
    cleanups.push(link.installStudyModeSoundscape());
    store.applySoundscapeScene('deep-focus');
    localStorage.setItem(presence.PRESENCE_KEY, JSON.stringify({ 'pop-3': { mode: null, audio: true, at: Date.now() } }));
    storageEvent();
    expect(store.getSoundscape().ducking).toBe('speech');
    localStorage.setItem(presence.PRESENCE_KEY, JSON.stringify({}));
    storageEvent();
    expect(store.getSoundscape().ducking).toBeNull();
  });

  it('picks the highest-priority mode across windows', () => {
    expect(presence.pickStudyMode(['reading', null, 'listening'])).toBe('listening');
    expect(presence.pickStudyMode(['reading', 'review'])).toBe('review');
    expect(presence.pickStudyMode([null])).toBeNull();
  });
});
