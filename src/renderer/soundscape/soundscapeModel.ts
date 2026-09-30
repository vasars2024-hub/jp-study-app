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
  | 'chimes';

export type SoundLayerGroup = 'noise' | 'weather' | 'nature' | 'places';

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
];

export const SOUND_LAYER_GROUPS: readonly { id: SoundLayerGroup; labelKey: string }[] = [
  { id: 'noise', labelKey: 'soundscape.group.noise' },
  { id: 'weather', labelKey: 'soundscape.group.weather' },
  { id: 'nature', labelKey: 'soundscape.group.nature' },
  { id: 'places', labelKey: 'soundscape.group.places' },
];

export type MusicStyleId =
  | 'off'
  | 'lofi-chill'
  | 'lofi-dusk'
  | 'jazz-cafe'
  | 'jazz-ballad'
  | 'piano-emotional'
  | 'ambient-drift';

export const MUSIC_STYLES: readonly { id: MusicStyleId; labelKey: string }[] = [
  { id: 'off', labelKey: 'soundscape.music.off' },
  { id: 'lofi-chill', labelKey: 'soundscape.music.lofiChill' },
  { id: 'lofi-dusk', labelKey: 'soundscape.music.lofiDusk' },
  { id: 'jazz-cafe', labelKey: 'soundscape.music.jazzCafe' },
  { id: 'jazz-ballad', labelKey: 'soundscape.music.jazzBallad' },
  { id: 'piano-emotional', labelKey: 'soundscape.music.pianoEmotional' },
  { id: 'ambient-drift', labelKey: 'soundscape.music.ambientDrift' },
];

/** What is sounding: the layers in the mix with their levels, plus one music style. */
export interface SoundscapeMix {
  layers: Partial<Record<SoundLayerId, number>>;
  music: MusicStyleId;
  musicVolume: number;
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
];

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
}

export const SOUNDSCAPE_STORAGE_KEY = 'jp-soundscape-v1';
export const DEFAULT_LAYER_LEVEL = 0.5;
export const MAX_SAVED_MIXES = 24;
export const SLEEP_TIMER_MINUTES: readonly number[] = [15, 30, 45, 60, 90];
/** How far `duckWithMedia` lowers the soundscape. */
export const DUCK_GAIN = 0.3;

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
  return {
    layers,
    music: isMusicStyleId(source.music) ? source.music : 'off',
    musicVolume: clamp01(source.musicVolume, 0.5),
  };
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
  };
}

/** The mix that is sounding for `state`. */
export function mixOf(state: SoundscapeState): SoundscapeMix {
  const layers: Partial<Record<SoundLayerId, number>> = {};
  for (const id of state.active) layers[id] = state.levels[id];
  return { layers, music: state.music, musicVolume: state.musicVolume };
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
  return { ...state, levels, active, music: clean.music, musicVolume: clean.musicVolume };
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
export function isSilent(state: SoundscapeState): boolean {
  return state.active.length === 0 && state.music === 'off';
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
