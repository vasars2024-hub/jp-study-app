// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_PROGRESSIONS,
  BUILT_IN_SCENES,
  HARMONIC_MINOR,
  JAZZ_PROGRESSIONS,
  LOFI_PROGRESSIONS,
  MAX_SAVED_MIXES,
  MUSIC_STYLES,
  NATURAL_MINOR,
  PIANO_PROGRESSIONS,
  SOUND_LAYERS,
  SOUND_LAYER_GROUPS,
  applyMix,
  bassRoot,
  chordPitchClasses,
  chordTones,
  createMotif,
  createRng,
  defaultSoundscapeState,
  isMixSilent,
  keyNotes,
  matchingSceneId,
  midiToHz,
  mixOf,
  normalizeSoundscapeState,
  realizeMotif,
  sliderToGain,
  voiceChord,
  walkingBassBar,
  type Chord,
} from '../soundscape/soundscapeModel';
import { en } from '../../shared/i18n/catalogs/en';

describe('the soundscape catalog', () => {
  it('offers white noise, nature sounds and well over eight others', () => {
    const ids = SOUND_LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(ids).toEqual(expect.arrayContaining(['white', 'rain', 'ocean', 'birds', 'fire', 'cafe']));
  });

  it('puts every layer in a group the widget renders', () => {
    const groups = new Set(SOUND_LAYER_GROUPS.map((group) => group.id));
    for (const layer of SOUND_LAYERS) expect(groups.has(layer.group)).toBe(true);
    for (const group of groups) expect(SOUND_LAYERS.some((layer) => layer.group === group)).toBe(true);
  });

  it('has lofi, jazz and piano music, and a way to have none', () => {
    const ids = MUSIC_STYLES.map((style) => style.id);
    expect(ids[0]).toBe('off');
    expect(ids.filter((id) => id.startsWith('lofi')).length).toBeGreaterThanOrEqual(2);
    expect(ids.filter((id) => id.startsWith('jazz')).length).toBeGreaterThanOrEqual(2);
    expect(ids).toContain('piano-emotional');
  });

  it('names every layer, group, style and scene in the English catalog', () => {
    const keys = [
      ...SOUND_LAYERS.map((layer) => layer.labelKey),
      ...SOUND_LAYER_GROUPS.map((group) => group.labelKey),
      ...MUSIC_STYLES.map((style) => style.labelKey),
      ...BUILT_IN_SCENES.map((scene) => scene.labelKey),
    ];
    for (const key of keys) expect(typeof en[key], key).toBe('string');
  });

  it('only builds scenes from layers and styles that exist', () => {
    const layers = new Set<string>(SOUND_LAYERS.map((layer) => layer.id));
    const styles = new Set<string>(MUSIC_STYLES.map((style) => style.id));
    expect(new Set(BUILT_IN_SCENES.map((scene) => scene.id)).size).toBe(BUILT_IN_SCENES.length);
    for (const scene of BUILT_IN_SCENES) {
      expect(styles.has(scene.mix.music), scene.id).toBe(true);
      for (const [id, level] of Object.entries(scene.mix.layers)) {
        expect(layers.has(id), `${scene.id}:${id}`).toBe(true);
        expect(level).toBeGreaterThan(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('soundscape state', () => {
  it('starts silent with every layer at a usable level', () => {
    const state = defaultSoundscapeState();
    expect(isMixSilent(state)).toBe(true);
    for (const layer of SOUND_LAYERS) expect(state.levels[layer.id]).toBeGreaterThan(0);
  });

  it('repairs stored state instead of trusting it', () => {
    const state = normalizeSoundscapeState({
      master: 7,
      levels: { rain: -2, wind: 'loud', unknown: 1 },
      active: ['rain', 'rain', 'lasers', 42],
      music: 'dubstep',
      musicVolume: Number.NaN,
      saved: [
        { id: 'a', name: '  Mine  ', layers: { rain: 0.4, lasers: 1, wind: 0 }, music: 'jazz-cafe', musicVolume: 0.3 },
        { id: 'a', name: 'Duplicate id' },
        { id: 'b', name: '   ' },
        'nonsense',
      ],
    });
    expect(state.master).toBe(1);
    expect(state.levels.rain).toBe(0);
    expect(state.levels.wind).toBe(0.5);
    expect(state.active).toEqual(['rain']);
    expect(state.music).toBe('off');
    expect(state.musicVolume).toBe(0.5);
    // A zero-level or unknown layer is not part of a saved mix.
    expect(state.saved).toEqual([
      { id: 'a', name: 'Mine', layers: { rain: 0.4 }, music: 'jazz-cafe', musicVolume: 0.3 },
    ]);
  });

  it('survives garbage and caps how many mixes it keeps', () => {
    expect(normalizeSoundscapeState('nope')).toEqual(defaultSoundscapeState());
    expect(normalizeSoundscapeState(null)).toEqual(defaultSoundscapeState());
    const many = Array.from({ length: MAX_SAVED_MIXES + 10 }, (_, i) => ({ id: `m${i}`, name: `Mix ${i}` }));
    expect(normalizeSoundscapeState({ saved: many }).saved).toHaveLength(MAX_SAVED_MIXES);
  });

  it('applies a scene and recognises it until a slider moves', () => {
    const scene = BUILT_IN_SCENES[1];
    const state = applyMix(defaultSoundscapeState(), scene.mix);
    expect(mixOf(state)).toEqual(scene.mix);
    expect(matchingSceneId(state)).toBe(scene.id);
    expect(isMixSilent(state)).toBe(false);

    const [first] = state.active;
    const nudged = { ...state, levels: { ...state.levels, [first]: state.levels[first] + 0.1 } };
    expect(matchingSceneId(nudged)).toBeNull();
  });

  it('leaves the levels of layers a scene does not use alone', () => {
    const base = { ...defaultSoundscapeState(), levels: { ...defaultSoundscapeState().levels, chimes: 0.9 } };
    const state = applyMix(base, { layers: { rain: 0.2 }, music: 'off', musicVolume: 0.5 });
    expect(state.levels.chimes).toBe(0.9);
    expect(state.active).toEqual(['rain']);
  });

  it('recognises a saved mix by its contents', () => {
    const mix = { layers: { fire: 0.33, wind: 0.21 }, music: 'off' as const, musicVolume: 0.5 };
    const state = applyMix({ ...defaultSoundscapeState(), saved: [{ id: 'mine', name: 'Mine', ...mix }] }, mix);
    expect(matchingSceneId(state)).toBe('mine');
  });

  it('gives the bottom of a slider room: gain rises faster than the position', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(0.5)).toBeLessThan(0.5);
    expect(sliderToGain(0.5)).toBeGreaterThan(0.25);
    expect(sliderToGain(2)).toBe(1);
  });
});

describe('the harmony the generated music is written from', () => {
  const ALL: Chord[][] = [...LOFI_PROGRESSIONS, ...JAZZ_PROGRESSIONS, ...PIANO_PROGRESSIONS, ...AMBIENT_PROGRESSIONS];

  it('defines every chord it names', () => {
    for (const progression of ALL) {
      expect(progression.length).toBeGreaterThanOrEqual(4);
      for (const chord of progression) {
        expect(chord, 'a progression names a chord its key table lacks').toBeDefined();
        expect(chord.root).toBeGreaterThanOrEqual(0);
        expect(chord.root).toBeLessThan(12);
      }
    }
  });

  it('tunes A above middle C to 440 Hz and doubles per octave', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });

  it('spells chords in the key they are played in', () => {
    // ii7 in C major is D minor seventh: D F A C.
    expect(chordPitchClasses({ root: 2, quality: 'min7' }, 0)).toEqual([2, 5, 9, 0]);
    // The same chord in G major is A minor seventh: A C E G.
    expect(chordPitchClasses({ root: 2, quality: 'min7' }, 7)).toEqual([9, 0, 4, 7]);
  });

  it('voices a chord inside one octave so chords do not leap between registers', () => {
    for (const progression of ALL) {
      for (const chord of progression) {
        const notes = voiceChord(chord, 3, 55);
        expect(Math.min(...notes)).toBeGreaterThanOrEqual(55);
        expect(Math.max(...notes)).toBeLessThan(67);
        expect(new Set(notes.map((note) => note % 12))).toEqual(new Set(chordPitchClasses(chord, 3)));
      }
    }
  });

  it('walks the bass from the root into the next bar by a semitone', () => {
    const rand = createRng(7);
    for (const progression of JAZZ_PROGRESSIONS) {
      progression.forEach((chord, i) => {
        const next = progression[(i + 1) % progression.length];
        const bar = walkingBassBar(chord, next, 5, 33, rand);
        expect(bar[0]).toBe(bassRoot(chord, 5, 33));
        const nextRootPc = (5 + next.root) % 12;
        const distance = (((bar[3] % 12) - nextRootPc + 12) % 12);
        expect([1, 11]).toContain(distance);
        const tones = new Set(chordPitchClasses(chord, 5));
        expect(tones.has(bar[1] % 12)).toBe(true);
        expect(tones.has(bar[2] % 12)).toBe(true);
      });
    }
  });

  it('keeps a melody in the key and ends each bar on a chord tone', () => {
    const rand = createRng(11);
    const tonic = 9; // A minor
    for (const progression of PIANO_PROGRESSIONS) {
      let anchor = 76;
      for (const chord of progression) {
        const dominant = chord.quality === 'maj' && chord.root === 7;
        const steps = dominant ? HARMONIC_MINOR : NATURAL_MINOR;
        const scale = keyNotes(tonic, steps, 67, 91);
        const tones = chordTones(chord, tonic, 67, 91);
        const motif = createMotif(rand);
        const notes = realizeMotif(motif, scale, tones, anchor);

        expect(notes).toHaveLength(motif.beats.length);
        const allowed = new Set([...scale, ...tones]);
        for (const note of notes) expect(allowed.has(note)).toBe(true);
        expect(tones).toContain(notes[notes.length - 1]);
        // A major V in a minor key must not be sung over with the flat seventh.
        if (dominant) expect(scale.some((note) => note % 12 === (tonic + 10) % 12)).toBe(false);
        anchor = notes[notes.length - 1];
      }
    }
  });

  it('writes motifs whose notes fall inside the bar, in order', () => {
    const rand = createRng(3);
    for (let i = 0; i < 40; i++) {
      const motif = createMotif(rand);
      expect(motif.steps).toHaveLength(motif.beats.length);
      expect(motif.steps[0]).toBe(0);
      expect(motif.steps[motif.steps.length - 1]).toBeLessThan(0);
      motif.beats.forEach((beat, index) => {
        expect(beat).toBeGreaterThanOrEqual(0);
        expect(beat).toBeLessThan(4);
        if (index > 0) expect(beat).toBeGreaterThan(motif.beats[index - 1]);
      });
    }
  });

  it('is repeatable from a seed, so these tests pin real choices', () => {
    const a = createRng(99);
    const b = createRng(99);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
