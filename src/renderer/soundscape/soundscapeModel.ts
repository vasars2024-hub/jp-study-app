/**
 * Soundscape — the data half of the study-sound mixer.
 *
 * Everything the mixer plays is synthesized at runtime (see soundscapeEngine.ts):
 * there are no audio files to bundle, license or download. This module holds what
 * can be reasoned about without an AudioContext — the layer and music catalogs,
 * the built-in scenes, the persisted state and its repair — so it is unit-tested
 * in plain Node.
 */

export type SoundLayerId =
  | 'white'
  | 'pink'
  | 'brown'
  | 'rain'
  | 'thunder'
  | 'wind'
  | 'ocean'
  | 'stream'
  | 'fire'
  | 'birds'
  | 'crickets'
  | 'cafe'
  | 'train'
  | 'chimes'
  // snd5 — eight more, every one synthesized in soundscapeEngine.ts.
  | 'umbrella'
  | 'cicadas'
  | 'carriage'
  | 'konbini'
  | 'cityNight'
  | 'templeBell'
  | 'furin'
  | 'shishiOdoshi';

export type SoundLayerGroup = 'noise' | 'weather' | 'nature' | 'japan' | 'places';

export interface SoundLayerDef {
  id: SoundLayerId;
  group: SoundLayerGroup;
  /** i18n key, resolved with t() where it is rendered. */
  labelKey: string;
}

export const SOUND_LAYERS: readonly SoundLayerDef[] = [
  { id: 'white', group: 'noise', labelKey: 'soundscape.layer.white' },
  { id: 'pink', group: 'noise', labelKey: 'soundscape.layer.pink' },
  { id: 'brown', group: 'noise', labelKey: 'soundscape.layer.brown' },
  { id: 'rain', group: 'weather', labelKey: 'soundscape.layer.rain' },
  { id: 'thunder', group: 'weather', labelKey: 'soundscape.layer.thunder' },
  { id: 'wind', group: 'weather', labelKey: 'soundscape.layer.wind' },
  { id: 'ocean', group: 'nature', labelKey: 'soundscape.layer.ocean' },
  { id: 'stream', group: 'nature', labelKey: 'soundscape.layer.stream' },
  { id: 'birds', group: 'nature', labelKey: 'soundscape.layer.birds' },
  { id: 'crickets', group: 'nature', labelKey: 'soundscape.layer.crickets' },
  { id: 'fire', group: 'places', labelKey: 'soundscape.layer.fire' },
  { id: 'cafe', group: 'places', labelKey: 'soundscape.layer.cafe' },
  { id: 'train', group: 'places', labelKey: 'soundscape.layer.train' },
  { id: 'chimes', group: 'places', labelKey: 'soundscape.layer.chimes' },
  { id: 'umbrella', group: 'weather', labelKey: 'snd5.layer.umbrella' },
  { id: 'cicadas', group: 'nature', labelKey: 'snd5.layer.cicadas' },
  { id: 'templeBell', group: 'japan', labelKey: 'snd5.layer.templeBell' },
  { id: 'furin', group: 'japan', labelKey: 'snd5.layer.furin' },
  { id: 'shishiOdoshi', group: 'japan', labelKey: 'snd5.layer.shishiOdoshi' },
  { id: 'carriage', group: 'places', labelKey: 'snd5.layer.carriage' },
  { id: 'konbini', group: 'places', labelKey: 'snd5.layer.konbini' },
  { id: 'cityNight', group: 'places', labelKey: 'snd5.layer.cityNight' },
];

export const SOUND_LAYER_GROUPS: readonly { id: SoundLayerGroup; labelKey: string }[] = [
  { id: 'noise', labelKey: 'soundscape.group.noise' },
  { id: 'weather', labelKey: 'soundscape.group.weather' },
  { id: 'nature', labelKey: 'soundscape.group.nature' },
  { id: 'japan', labelKey: 'snd5.group.japan' },
  { id: 'places', labelKey: 'soundscape.group.places' },
];

export type MusicStyleId =
  | 'off'
  | 'lofi-chill'
  | 'lofi-dusk'
  | 'jazz-cafe'
  | 'jazz-ballad'
  | 'piano-emotional'
  | 'ambient-drift'
  | 'koto-garden';

export const MUSIC_STYLES: readonly { id: MusicStyleId; labelKey: string }[] = [
  { id: 'off', labelKey: 'soundscape.music.off' },
  { id: 'lofi-chill', labelKey: 'soundscape.music.lofiChill' },
  { id: 'lofi-dusk', labelKey: 'soundscape.music.lofiDusk' },
  { id: 'jazz-cafe', labelKey: 'soundscape.music.jazzCafe' },
  { id: 'jazz-ballad', labelKey: 'soundscape.music.jazzBallad' },
  { id: 'piano-emotional', labelKey: 'soundscape.music.pianoEmotional' },
  { id: 'ambient-drift', labelKey: 'soundscape.music.ambientDrift' },
  { id: 'koto-garden', labelKey: 'snd5.music.kotoGarden' },
];

/** What is sounding: the layers in the mix with their levels, plus one music style. */
export interface SoundscapeMix {
  layers: Partial<Record<SoundLayerId, number>>;
  music: MusicStyleId;
  musicVolume: number;
  /**
   * snd6: tone and pan per layer. Optional — the built-in scenes leave the
   * owner's own shaping alone; a saved mix carries the shaping it was saved with.
   */
  shapes?: Partial<Record<SoundLayerId, LayerShape>>;
}

/**
 * snd6 — per-layer shaping. `tone` tilts the layer from dark (-1: highs cut,
 * lows lifted) to bright (+1); `pan` places it from left (-1) to right (+1).
 */
export interface LayerShape {
  tone: number;
  pan: number;
}

export const NEUTRAL_SHAPE: Readonly<LayerShape> = { tone: 0, pan: 0 };
/** Shelf gains at full tilt. The cut is deeper than the lift: a lift is how a mix starts to clip. */
export const TONE_HIGH_DB = 6;
export const TONE_LOW_DB = 4;
/** Where the tilt's two shelves sit. */
export const TONE_LOW_HZ = 280;
export const TONE_HIGH_HZ = 2600;

function clampSigned(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

export function normalizeLayerShape(raw: unknown): LayerShape {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<LayerShape>;
  // Snap near-centre values to centre so "back to neutral" is reachable by drag.
  const snap = (v: number): number => (Math.abs(v) < 0.02 ? 0 : Math.round(v * 100) / 100);
  return { tone: snap(clampSigned(source.tone)), pan: snap(clampSigned(source.pan)) };
}

export function isNeutralShape(shape: LayerShape | undefined): boolean {
  return !shape || (shape.tone === 0 && shape.pan === 0);
}

/** Clean a stored shape map: known layers only, neutral shapes dropped. */
export function normalizeShapes(raw: unknown): Partial<Record<SoundLayerId, LayerShape>> {
  const out: Partial<Record<SoundLayerId, LayerShape>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSoundLayerId(id)) continue;
    const shape = normalizeLayerShape(value);
    if (!isNeutralShape(shape)) out[id] = shape;
  }
  return out;
}

/** The two shelf gains (dB) a tone setting asks for. */
export function toneShelfGains(tone: number): { lowDb: number; highDb: number } {
  const t = clampSigned(tone);
  if (t === 0) return { lowDb: 0, highDb: 0 };
  return { lowDb: -t * TONE_LOW_DB, highDb: t * TONE_HIGH_DB };
}

export interface SoundscapeScene {
  id: string;
  labelKey: string;
  mix: SoundscapeMix;
}

export const BUILT_IN_SCENES: readonly SoundscapeScene[] = [
  {
    id: 'deep-focus',
    labelKey: 'soundscape.scene.deepFocus',
    mix: { layers: { brown: 0.6 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'rainy-cafe',
    labelKey: 'soundscape.scene.rainyCafe',
    mix: { layers: { rain: 0.55, cafe: 0.4 }, music: 'jazz-cafe', musicVolume: 0.4 },
  },
  {
    id: 'night-study',
    labelKey: 'soundscape.scene.nightStudy',
    mix: { layers: { crickets: 0.3, fire: 0.45 }, music: 'lofi-dusk', musicVolume: 0.5 },
  },
  {
    id: 'rainy-piano',
    labelKey: 'soundscape.scene.rainyPiano',
    mix: { layers: { rain: 0.5, thunder: 0.3 }, music: 'piano-emotional', musicVolume: 0.55 },
  },
  {
    id: 'forest-morning',
    labelKey: 'soundscape.scene.forestMorning',
    mix: { layers: { birds: 0.5, stream: 0.4, wind: 0.25 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'ocean-breeze',
    labelKey: 'soundscape.scene.oceanBreeze',
    mix: { layers: { ocean: 0.65, wind: 0.2, chimes: 0.25 }, music: 'ambient-drift', musicVolume: 0.35 },
  },
  {
    id: 'storm',
    labelKey: 'soundscape.scene.storm',
    mix: { layers: { rain: 0.7, thunder: 0.55, wind: 0.4 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'night-train',
    labelKey: 'soundscape.scene.nightTrain',
    mix: { layers: { train: 0.55, rain: 0.3 }, music: 'lofi-chill', musicVolume: 0.45 },
  },
  // snd5 — scenes built on the new layers.
  {
    id: 'temple-dawn',
    labelKey: 'snd5.scene.templeDawn',
    mix: { layers: { templeBell: 0.55, birds: 0.25, wind: 0.15 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'umbrella-walk',
    labelKey: 'snd5.scene.umbrellaWalk',
    mix: { layers: { umbrella: 0.6, cityNight: 0.25 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'local-train',
    labelKey: 'snd5.scene.localTrain',
    mix: { layers: { carriage: 0.6, rain: 0.15 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'summer-afternoon',
    labelKey: 'snd5.scene.summerAfternoon',
    mix: { layers: { cicadas: 0.5, furin: 0.35, stream: 0.2 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'konbini-night',
    labelKey: 'snd5.scene.konbiniNight',
    mix: { layers: { konbini: 0.55, cityNight: 0.2 }, music: 'off', musicVolume: 0.5 },
  },
  {
    id: 'city-lights',
    labelKey: 'snd5.scene.cityLights',
    mix: { layers: { cityNight: 0.55, rain: 0.2 }, music: 'lofi-dusk', musicVolume: 0.4 },
  },
  {
    id: 'zen-garden',
    labelKey: 'snd5.scene.zenGarden',
    mix: { layers: { shishiOdoshi: 0.5, furin: 0.2, wind: 0.1 }, music: 'koto-garden', musicVolume: 0.4 },
  },
];

// ---------------------------------------------------------------------------
// snd5 — study-mode presets, fade schedules, per-scene volume
// ---------------------------------------------------------------------------

/** The study surfaces a scene can follow. */
export type StudyModeId = 'reading' | 'review' | 'listening';
export const STUDY_MODES: readonly { id: StudyModeId; labelKey: string }[] = [
  { id: 'reading', labelKey: 'snd5.modes.reading' },
  { id: 'review', labelKey: 'snd5.modes.review' },
  { id: 'listening', labelKey: 'snd5.modes.listening' },
];

/** '' leaves the mixer alone, 'pause' fades it out for the mode, anything else is a scene or saved mix id. */
export const MODE_PRESET_KEEP = '';
export const MODE_PRESET_PAUSE = 'pause';

export interface StudyModePresets {
  /** Off by default: sound must be asked for. */
  enabled: boolean;
  reading: string;
  review: string;
  listening: string;
}

/**
 * Reading wants a bed with no melody to compete with the text; a review session
 * a light, lively one; listening practice the ear to itself, so it pauses.
 */
export const DEFAULT_STUDY_MODE_PRESETS: StudyModePresets = {
  enabled: false,
  reading: 'deep-focus',
  review: 'summer-afternoon',
  listening: MODE_PRESET_PAUSE,
};

export function normalizeStudyModePresets(raw: unknown): StudyModePresets {
  const base = { ...DEFAULT_STUDY_MODE_PRESETS };
  if (!raw || typeof raw !== 'object') return base;
  const source = raw as Partial<StudyModePresets>;
  const pick = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.length <= 80 ? value : fallback;
  return {
    enabled: source.enabled === true,
    reading: pick(source.reading, base.reading),
    review: pick(source.review, base.review),
    listening: pick(source.listening, base.listening),
  };
}

export type FadeScheduleId = 'quick' | 'gentle' | 'slow' | 'sleep';

export interface FadeSchedule {
  id: FadeScheduleId;
  labelKey: string;
  /** Seconds from silence to the mix when playback starts. */
  fadeInSec: number;
  /** Seconds the sleep timer spends fading out before it stops. */
  fadeOutSec: number;
  /** Seconds the focus link fades over when a Pomodoro work block ends. */
  breakFadeSec: number;
  /** snd6: seconds one scene takes to cross-fade into the next. */
  crossfadeSec: number;
}

export const FADE_SCHEDULES: readonly FadeSchedule[] = [
  { id: 'quick', labelKey: 'snd5.fade.quick', fadeInSec: 0.6, fadeOutSec: 8, breakFadeSec: 6, crossfadeSec: 1.5 },
  { id: 'gentle', labelKey: 'snd5.fade.gentle', fadeInSec: 5, fadeOutSec: 30, breakFadeSec: 12, crossfadeSec: 4 },
  { id: 'slow', labelKey: 'snd5.fade.slow', fadeInSec: 20, fadeOutSec: 180, breakFadeSec: 30, crossfadeSec: 8 },
  { id: 'sleep', labelKey: 'snd5.fade.sleep', fadeInSec: 45, fadeOutSec: 600, breakFadeSec: 60, crossfadeSec: 12 },
];

export function fadeScheduleOf(id: unknown): FadeSchedule {
  return FADE_SCHEDULES.find((s) => s.id === id) ?? (FADE_SCHEDULES[0] as FadeSchedule);
}

/**
 * When a sleep timer of `minutes` starts its fade and how long the fade runs,
 * in ms from now. The fade ENDS at the timer's end; a fade longer than the
 * timer starts at once and is shortened to fit.
 */
export function sleepFadePlan(minutes: number, schedule: FadeSchedule): { fadeStartsInMs: number; fadeMs: number; stopInMs: number } {
  const stopInMs = Math.max(0, minutes) * 60_000;
  const fadeMs = Math.min(stopInMs, schedule.fadeOutSec * 1000);
  return { fadeStartsInMs: stopInMs - fadeMs, fadeMs, stopInMs };
}

/** Clean a stored scene-volume map: known-shaped ids, levels clamped. */
export function normalizeSceneVolumes(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (id.length > 80 || typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[id] = Math.min(1, Math.max(0, value));
  }
  return out;
}

/** A mix the owner named and kept. The name is their content and is never translated. */
export interface SavedMix extends SoundscapeMix {
  id: string;
  name: string;
}

export interface SoundscapeState {
  /** Overall volume, 0..1. */
  master: number;
  /** The level each layer was last set to, kept while the layer is off. */
  levels: Record<SoundLayerId, number>;
  /** Layers currently in the mix. */
  active: SoundLayerId[];
  music: MusicStyleId;
  musicVolume: number;
  /** Lower the soundscape while the app's own music player is playing. */
  duckWithMedia: boolean;
  saved: SavedMix[];
  /** snd5: how playback fades in, and how the sleep timer and focus breaks fade out. */
  fade: FadeScheduleId;
  /** snd5: the overall volume the owner last chose while each scene or saved mix was on. */
  sceneVolumes: Record<string, number>;
  /** snd6: tone and pan per layer; neutral layers are absent. Kept while a layer is off, like its level. */
  shapes: Partial<Record<SoundLayerId, LayerShape>>;
  /** snd6: lower the soundscape further while speech, a card clip or a video is playing. */
  duckForSpeech: boolean;
}

export const SOUNDSCAPE_STORAGE_KEY = 'jp-soundscape-v1';
export const DEFAULT_LAYER_LEVEL = 0.5;
export const MAX_SAVED_MIXES = 24;
export const SLEEP_TIMER_MINUTES: readonly number[] = [15, 30, 45, 60, 90];
/** How far `duckWithMedia` lowers the soundscape. */
export const DUCK_GAIN = 0.3;
/** snd6: how far `duckForSpeech` lowers it — further, because a voice has to be understood, not just heard. */
export const DUCK_SPEECH_GAIN = 0.15;

const LAYER_IDS: readonly SoundLayerId[] = SOUND_LAYERS.map((layer) => layer.id);
const LAYER_ID_SET: ReadonlySet<string> = new Set(LAYER_IDS);
const MUSIC_ID_SET: ReadonlySet<string> = new Set(MUSIC_STYLES.map((style) => style.id));

export function isSoundLayerId(value: unknown): value is SoundLayerId {
  return typeof value === 'string' && LAYER_ID_SET.has(value);
}

export function isMusicStyleId(value: unknown): value is MusicStyleId {
  return typeof value === 'string' && MUSIC_ID_SET.has(value);
}

export function clamp01(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function defaultLevels(): Record<SoundLayerId, number> {
  const levels = {} as Record<SoundLayerId, number>;
  for (const id of LAYER_IDS) levels[id] = DEFAULT_LAYER_LEVEL;
  return levels;
}

export function defaultSoundscapeState(): SoundscapeState {
  return {
    master: 0.85,
    levels: defaultLevels(),
    active: [],
    music: 'off',
    musicVolume: 0.5,
    duckWithMedia: true,
    saved: [],
    fade: 'quick',
    sceneVolumes: {},
    shapes: {},
    duckForSpeech: true,
  };
}

function normalizeMix(raw: unknown): SoundscapeMix {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<SoundscapeMix>;
  const layers: Partial<Record<SoundLayerId, number>> = {};
  if (source.layers && typeof source.layers === 'object') {
    for (const [id, level] of Object.entries(source.layers)) {
      // A layer at zero is not in the mix; keeping it would show a silent row as "on".
      if (isSoundLayerId(id) && clamp01(level) > 0) layers[id] = clamp01(level);
    }
  }
  const mix: SoundscapeMix = {
    layers,
    music: isMusicStyleId(source.music) ? source.music : 'off',
    musicVolume: clamp01(source.musicVolume, 0.5),
  };
  if (source.shapes !== undefined) {
    // Only the shaping of layers that are in the mix means anything.
    const shapes = normalizeShapes(source.shapes);
    for (const id of Object.keys(shapes) as SoundLayerId[]) if (layers[id] === undefined) delete shapes[id];
    mix.shapes = shapes;
  }
  return mix;
}

/** Repair whatever was stored: unknown layers and styles are dropped, levels clamped. */
export function normalizeSoundscapeState(raw: unknown): SoundscapeState {
  const base = defaultSoundscapeState();
  if (!raw || typeof raw !== 'object') return base;
  const source = raw as Partial<SoundscapeState>;

  const levels = defaultLevels();
  if (source.levels && typeof source.levels === 'object') {
    for (const id of LAYER_IDS) {
      levels[id] = clamp01((source.levels as Record<string, unknown>)[id], DEFAULT_LAYER_LEVEL);
    }
  }

  const active: SoundLayerId[] = [];
  if (Array.isArray(source.active)) {
    for (const id of source.active) if (isSoundLayerId(id) && !active.includes(id)) active.push(id);
  }

  const saved: SavedMix[] = [];
  if (Array.isArray(source.saved)) {
    for (const entry of source.saved) {
      if (!entry || typeof entry !== 'object') continue;
      const { id, name } = entry as Partial<SavedMix>;
      if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) continue;
      if (saved.some((mix) => mix.id === id)) continue;
      saved.push({ id, name: name.trim().slice(0, 60), ...normalizeMix(entry) });
      if (saved.length >= MAX_SAVED_MIXES) break;
    }
  }

  return {
    master: clamp01(source.master, base.master),
    levels,
    active,
    music: isMusicStyleId(source.music) ? source.music : 'off',
    musicVolume: clamp01(source.musicVolume, base.musicVolume),
    duckWithMedia: source.duckWithMedia !== false,
    saved,
    fade: fadeScheduleOf(source.fade).id,
    sceneVolumes: normalizeSceneVolumes(source.sceneVolumes),
    shapes: normalizeShapes(source.shapes),
    duckForSpeech: source.duckForSpeech !== false,
  };
}

/** The mix that is sounding for `state`. */
export function mixOf(state: SoundscapeState): SoundscapeMix {
  const layers: Partial<Record<SoundLayerId, number>> = {};
  for (const id of state.active) layers[id] = state.levels[id];
  const mix: SoundscapeMix = { layers, music: state.music, musicVolume: state.musicVolume };
  const shapes = activeShapesOf(state);
  if (Object.keys(shapes).length) mix.shapes = shapes;
  return mix;
}

/** snd6: the shaping of the layers that are sounding (what a saved mix keeps). */
export function activeShapesOf(state: SoundscapeState): Partial<Record<SoundLayerId, LayerShape>> {
  const shapes: Partial<Record<SoundLayerId, LayerShape>> = {};
  for (const id of state.active) {
    const shape = state.shapes[id];
    if (shape && !isNeutralShape(shape)) shapes[id] = { ...shape };
  }
  return shapes;
}

/** snd6: a layer's shaping, neutral when it has none. */
export function shapeOf(state: SoundscapeState, id: SoundLayerId): LayerShape {
  return state.shapes[id] ?? { ...NEUTRAL_SHAPE };
}

/** `state` with `mix` applied: its layers become the active set at their levels. */
export function applyMix(state: SoundscapeState, mix: SoundscapeMix): SoundscapeState {
  const clean = normalizeMix(mix);
  const levels = { ...state.levels };
  const active: SoundLayerId[] = [];
  for (const id of LAYER_IDS) {
    const level = clean.layers[id];
    if (level === undefined) continue;
    levels[id] = level;
    active.push(id);
  }
  let shapes = state.shapes;
  if (clean.shapes) {
    // A saved mix brings the shaping it was saved with; its unshaped layers go neutral.
    shapes = { ...state.shapes };
    for (const id of active) {
      const shape = clean.shapes[id];
      if (shape) shapes[id] = { ...shape };
      else delete shapes[id];
    }
  }
  return { ...state, levels, active, music: clean.music, musicVolume: clean.musicVolume, shapes };
}

function sameMix(a: SoundscapeMix, b: SoundscapeMix): boolean {
  if (a.music !== b.music) return false;
  if (a.music !== 'off' && Math.abs(a.musicVolume - b.musicVolume) > 0.005) return false;
  const aIds = Object.keys(a.layers) as SoundLayerId[];
  const bIds = Object.keys(b.layers) as SoundLayerId[];
  if (aIds.length !== bIds.length) return false;
  return aIds.every((id) => b.layers[id] !== undefined && Math.abs((a.layers[id] ?? 0) - (b.layers[id] ?? 0)) <= 0.005);
}

/**
 * The scene or saved mix the current state matches exactly, so the picker can show
 * its name; `null` once the owner has moved a slider away from it.
 */
export function matchingSceneId(state: SoundscapeState): string | null {
  const current = mixOf(state);
  for (const scene of BUILT_IN_SCENES) if (sameMix(current, scene.mix)) return scene.id;
  for (const mix of state.saved) if (sameMix(current, mix)) return mix.id;
  return null;
}

/** Nothing would be heard: no layer in the mix and no music. */
export function isMixSilent(state: SoundscapeState): boolean {
  return state.active.length === 0 && state.music === 'off';
}

// ---------------------------------------------------------------------------
// snd6 — saved mixes as a file: export, import, merge
// ---------------------------------------------------------------------------

export const MIXES_FORMAT = 'gum-soundscape-mixes';
export const MIXES_VERSION = 1;

export interface MixesDocument {
  format: typeof MIXES_FORMAT;
  version: number;
  exportedAt: string;
  mixes: { name: string; layers: Partial<Record<SoundLayerId, number>>; music: MusicStyleId; musicVolume: number; shapes?: Partial<Record<SoundLayerId, LayerShape>> }[];
}

/** The owner's saved mixes as a shareable JSON document (ids stay local). */
export function exportMixesDocument(saved: readonly SavedMix[], now: Date = new Date()): string {
  const doc: MixesDocument = {
    format: MIXES_FORMAT,
    version: MIXES_VERSION,
    exportedAt: now.toISOString(),
    // The ids are local to this install; an importer makes its own.
    mixes: saved.map((kept) => {
      const mix: Partial<SavedMix> = { ...kept };
      delete mix.id;
      return mix as MixesDocument['mixes'][number];
    }),
  };
  return JSON.stringify(doc, null, 2);
}

export type MixesImportError = 'notJson' | 'notMixes' | 'empty';

/**
 * Read a mixes document — or a bare array of mixes, or a single mix — into
 * clean mixes. Unknown layers and styles are dropped exactly as a stored state
 * would be repaired; an entry left with nothing to hear is skipped.
 */
export function parseMixesDocument(text: string): { ok: true; mixes: Omit<SavedMix, 'id'>[] } | { ok: false; error: MixesImportError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  let entries: unknown[];
  if (Array.isArray(parsed)) entries = parsed;
  else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { mixes?: unknown }).mixes)) {
    const doc = parsed as { format?: unknown; mixes: unknown[] };
    if (doc.format !== undefined && doc.format !== MIXES_FORMAT) return { ok: false, error: 'notMixes' };
    entries = doc.mixes;
  } else if (parsed && typeof parsed === 'object' && 'layers' in parsed) entries = [parsed];
  else return { ok: false, error: 'notMixes' };
  const mixes: Omit<SavedMix, 'id'>[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const name = (entry as { name?: unknown }).name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const mix = normalizeMix(entry);
    if (!Object.keys(mix.layers).length && mix.music === 'off') continue;
    mixes.push({ name: name.trim().slice(0, 60), ...mix });
  }
  return mixes.length ? { ok: true, mixes } : { ok: false, error: 'empty' };
}

/**
 * Add imported mixes to the saved list. A mix that sounds the same as one
 * already kept is skipped (it would only be a second row for one sound); a name
 * already in use gets a counter; the list never grows past MAX_SAVED_MIXES.
 */
export function mergeImportedMixes(
  saved: readonly SavedMix[],
  incoming: readonly Omit<SavedMix, 'id'>[],
  makeId: (index: number) => string,
): { saved: SavedMix[]; added: number; duplicates: number; overflow: number } {
  const out = [...saved];
  let added = 0;
  let duplicates = 0;
  let overflow = 0;
  incoming.forEach((mix, index) => {
    if (out.some((kept) => sameMix(kept, mix))) {
      duplicates += 1;
      return;
    }
    if (out.length >= MAX_SAVED_MIXES) {
      overflow += 1;
      return;
    }
    let name = mix.name;
    for (let n = 2; out.some((kept) => kept.name === name); n += 1) name = `${mix.name.slice(0, 55)} (${n})`;
    out.push({ ...mix, name, id: makeId(index) });
    added += 1;
  });
  return { saved: out, added, duplicates, overflow };
}

/**
 * Perceived loudness is roughly logarithmic, so a linear slider crowds everything
 * useful into its bottom fifth. Raising the position to a power spreads it across
 * the track; 1.5 keeps the middle of the slider at a comfortable background level.
 */
export function sliderToGain(position: number): number {
  return Math.pow(clamp01(position), 1.5);
}

// ---------------------------------------------------------------------------
// Music theory for the generative styles. Pure, so the note choices are testable.
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) so a test can pin what the generators choose. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export type ChordQuality = 'maj7' | 'min7' | 'dom7' | 'm7b5' | 'maj' | 'min';

const CHORD_INTERVALS: Record<ChordQuality, readonly number[]> = {
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  maj: [0, 4, 7],
  min: [0, 3, 7],
};

/** The scale a melody can move through over each chord quality. */
const CHORD_SCALES: Record<ChordQuality, readonly number[]> = {
  maj7: [0, 2, 4, 7, 9, 11],
  min7: [0, 2, 3, 5, 7, 10],
  dom7: [0, 2, 4, 5, 7, 9, 10],
  m7b5: [0, 1, 3, 5, 6, 8, 10],
  // Triads borrow from whatever key they sit in, so only the notes every such
  // key shares are offered: the pentatonic built on the chord.
  maj: [0, 2, 4, 7, 9],
  min: [0, 3, 5, 7, 10],
};

/** Scale steps above a key's tonic. */
export const NATURAL_MINOR: readonly number[] = [0, 2, 3, 5, 7, 8, 10];
/** Natural minor with the seventh raised: what a major V chord asks of a minor key. */
export const HARMONIC_MINOR: readonly number[] = [0, 2, 3, 5, 7, 8, 11];
export const MAJOR_PENTATONIC: readonly number[] = [0, 2, 4, 7, 9];
/**
 * snd5: the in (miyako-bushi) scale of koto music — two half steps in five
 * notes, which is what makes it sound like a koto piece rather than a
 * pentatonic exercise.
 */
export const MIYAKO_BUSHI: readonly number[] = [0, 1, 5, 7, 8];

/** Every note in [low, high] on the given scale of the key whose tonic is `tonicPc`. */
export function keyNotes(tonicPc: number, steps: readonly number[], low: number, high: number): number[] {
  const pcs = new Set(steps.map((step) => (tonicPc + step) % 12));
  const notes: number[] = [];
  for (let note = low; note <= high; note++) if (pcs.has(note % 12)) notes.push(note);
  return notes;
}

export interface Chord {
  /** Semitones above the key's tonic, 0..11. */
  root: number;
  quality: ChordQuality;
}

export function chordIntervals(quality: ChordQuality): readonly number[] {
  return CHORD_INTERVALS[quality];
}

/** Pitch classes (0..11) of the chord in a key whose tonic is `tonicPc`. */
export function chordPitchClasses(chord: Chord, tonicPc: number): number[] {
  return CHORD_INTERVALS[chord.quality].map((interval) => (tonicPc + chord.root + interval) % 12);
}

/**
 * A close voicing of the chord whose notes all sit within an octave starting at
 * `low`, so successive chords stay in one register instead of leaping around.
 */
export function voiceChord(chord: Chord, tonicPc: number, low: number): number[] {
  return chordPitchClasses(chord, tonicPc)
    .map((pc) => {
      let note = low - (low % 12) + pc;
      if (note < low) note += 12;
      return note;
    })
    .sort((a, b) => a - b);
}

/** The chord's root as a bass note at or above `low`. */
export function bassRoot(chord: Chord, tonicPc: number, low: number): number {
  const pc = (tonicPc + chord.root) % 12;
  let note = low - (low % 12) + pc;
  if (note < low) note += 12;
  return note;
}

/** Every note in [low, high] that belongs to the scale implied by the chord. */
export function scaleNotes(chord: Chord, tonicPc: number, low: number, high: number): number[] {
  const rootPc = (tonicPc + chord.root) % 12;
  const pcs = new Set(CHORD_SCALES[chord.quality].map((step) => (rootPc + step) % 12));
  const notes: number[] = [];
  for (let note = low; note <= high; note++) if (pcs.has(note % 12)) notes.push(note);
  return notes;
}

/** Every chord tone in [low, high]. */
export function chordTones(chord: Chord, tonicPc: number, low: number, high: number): number[] {
  const pcs = new Set(chordPitchClasses(chord, tonicPc));
  const notes: number[] = [];
  for (let note = low; note <= high; note++) if (pcs.has(note % 12)) notes.push(note);
  return notes;
}

/** The member of `candidates` closest to `target` (the first one on a tie). */
export function nearestNote(target: number, candidates: readonly number[]): number {
  let best = candidates[0] ?? target;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One bar of walking bass: the root on beat one, chord tones through the middle,
 * and a note a semitone away from the next root on beat four, so the line always
 * steps into the next bar.
 */
export function walkingBassBar(
  chord: Chord,
  next: Chord,
  tonicPc: number,
  low: number,
  rand: () => number,
): [number, number, number, number] {
  const root = bassRoot(chord, tonicPc, low);
  const tones = chordTones(chord, tonicPc, low, low + 16).filter((note) => note !== root);
  const pick = (): number => tones[Math.floor(rand() * tones.length)] ?? root;
  const nextRoot = nearestNote(root, [
    bassRoot(next, tonicPc, low),
    bassRoot(next, tonicPc, low) + 12,
    bassRoot(next, tonicPc, low) - 12,
  ]);
  const approach = nextRoot + (rand() < 0.5 ? 1 : -1);
  return [root, pick(), pick(), approach];
}

const MAJOR_KEY: Record<string, Chord> = {
  I: { root: 0, quality: 'maj7' },
  ii: { root: 2, quality: 'min7' },
  iii: { root: 4, quality: 'min7' },
  IV: { root: 5, quality: 'maj7' },
  V: { root: 7, quality: 'dom7' },
  vi: { root: 9, quality: 'min7' },
  VI7: { root: 9, quality: 'dom7' },
  III7: { root: 4, quality: 'dom7' },
  vii: { root: 11, quality: 'm7b5' },
};

const MINOR_KEY: Record<string, Chord> = {
  i: { root: 0, quality: 'min' },
  III: { root: 3, quality: 'maj' },
  iv: { root: 5, quality: 'min' },
  v: { root: 7, quality: 'min' },
  V: { root: 7, quality: 'maj' },
  VI: { root: 8, quality: 'maj' },
  VII: { root: 10, quality: 'maj' },
};

function bars(table: Record<string, Chord>, names: string): Chord[] {
  return names.split(' ').map((name) => table[name]);
}

/** One chord per bar. Every progression resolves back to its first chord. */
export const LOFI_PROGRESSIONS: readonly Chord[][] = [
  bars(MAJOR_KEY, 'ii V I vi'),
  bars(MAJOR_KEY, 'I vi ii V'),
  bars(MAJOR_KEY, 'IV iii ii I'),
  bars(MAJOR_KEY, 'vi ii V I'),
  bars(MAJOR_KEY, 'IV V iii vi'),
];

export const JAZZ_PROGRESSIONS: readonly Chord[][] = [
  bars(MAJOR_KEY, 'ii V I VI7 ii V I I'),
  bars(MAJOR_KEY, 'ii V I IV vii III7 vi vi'),
  bars(MAJOR_KEY, 'I vi ii V iii VI7 ii V'),
];

export const PIANO_PROGRESSIONS: readonly Chord[][] = [
  bars(MINOR_KEY, 'i VI III VII'),
  bars(MINOR_KEY, 'i iv VI V'),
  bars(MINOR_KEY, 'VI VII i i'),
  bars(MINOR_KEY, 'i VII VI VII'),
  bars(MINOR_KEY, 'iv VI i V'),
];

export const AMBIENT_PROGRESSIONS: readonly Chord[][] = [
  bars(MAJOR_KEY, 'I IV vi IV'),
  bars(MAJOR_KEY, 'IV I ii vi'),
  bars(MAJOR_KEY, 'vi IV I iii'),
];

/**
 * A one-bar melodic idea: where in the bar each note falls (in beats) and how far
 * it moves from the previous one in scale steps. Repeating the same shape over
 * each chord of a phrase is what makes generated notes read as a melody.
 */
export interface Motif {
  beats: number[];
  steps: number[];
}

const MOTIF_RHYTHMS: readonly number[][] = [
  [0, 1.5, 2, 3],
  [0, 1, 2.5],
  [0.5, 1, 2, 3.5],
  [0, 2, 3],
  [0, 0.5, 1, 2],
  [1, 2, 2.5, 3],
];

export function createMotif(rand: () => number): Motif {
  const beats = MOTIF_RHYTHMS[Math.floor(rand() * MOTIF_RHYTHMS.length)];
  // Mostly steps, an occasional leap, and a fall at the end: it sounds like a sigh.
  const steps = beats.map((_, index) => {
    if (index === 0) return 0;
    if (index === beats.length - 1) return -1 - Math.floor(rand() * 2);
    const roll = rand();
    if (roll < 0.35) return 1;
    if (roll < 0.65) return -1;
    if (roll < 0.85) return 2;
    return -2;
  });
  return { beats: [...beats], steps };
}

/**
 * Set a motif over a bar: start from the chord tone nearest `anchor`, walk `scale`
 * by the motif's steps, and land the final note on a chord tone so the bar resolves.
 * `scale` and `tones` are ascending note lists for the register being played.
 */
export function realizeMotif(
  motif: Motif,
  scale: readonly number[],
  tones: readonly number[],
  anchor: number,
): number[] {
  if (!scale.length || !tones.length) return [];
  let index = scale.indexOf(nearestNote(nearestNote(anchor, tones), scale));
  const notes: number[] = [];
  motif.steps.forEach((step, position) => {
    index = Math.min(scale.length - 1, Math.max(0, index + step));
    const last = position === motif.steps.length - 1;
    const note = last ? nearestNote(scale[index], tones) : scale[index];
    notes.push(note);
  });
  return notes;
}
