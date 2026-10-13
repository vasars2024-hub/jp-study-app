// @vitest-environment node
/**
 * Shadowing from the audio itself (`shadowingProsody.ts`): the YIN pitch track,
 * the speech/pause segmentation, the equal mora slots and the heard downstep —
 * all on SYNTHESISED fixture audio (harmonic "vowels" at chosen pitches, silent
 * pauses, noise for a devoiced mora). Never the microphone.
 */
import { describe, expect, it } from 'vitest';
import {
  accentHighs,
  analyzeShadowProsody,
  awkwardPauses,
  heardDownsteps,
  moraTimeline,
  prosodyComparable,
  semitones,
  speechSegments,
  trackPitch,
  type ProsodyWord,
} from '../shadowingProsody';

const RATE = 16_000;

/** A deterministic pseudo-random sequence (the noise of a devoiced mora). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000 - 0.5;
  };
}

type Part = { hz: number; sec: number; toHz?: number } | { silence: number } | { noise: number };

/** Fixture audio: voiced parts are five harmonics with 10 ms ramps; pauses are silence. */
function synth(parts: Part[], rate = RATE): Float32Array {
  const out: number[] = [];
  const random = lcg(7);
  let phase = 0;
  for (const part of parts) {
    if ('silence' in part) {
      for (let i = 0; i < Math.round(part.silence * rate); i += 1) out.push(0);
      continue;
    }
    if ('noise' in part) {
      for (let i = 0; i < Math.round(part.noise * rate); i += 1) out.push(random() * 0.5);
      continue;
    }
    const n = Math.round(part.sec * rate);
    const ramp = Math.round(0.01 * rate);
    for (let i = 0; i < n; i += 1) {
      const hz = part.toHz ? part.hz + ((part.toHz - part.hz) * i) / n : part.hz;
      phase += (2 * Math.PI * hz) / rate;
      let value = 0;
      for (let k = 1; k <= 5; k += 1) value += Math.sin(phase * k) / k;
      const envelope = Math.min(1, i / ramp, (n - i) / ramp);
      out.push(0.25 * value * envelope);
    }
  }
  return Float32Array.from(out);
}

const H = 220;
const L = 165;
const mora = (hz: number, sec = 0.16): Part => ({ hz, sec });
const lead: Part = { silence: 0.3 };

describe('pitch track', () => {
  it('finds a steady voice within 2%, at a low and a high pitch, at 16 kHz and 48 kHz', () => {
    for (const [hz, rate] of [[110, RATE], [200, RATE], [320, RATE], [200, 48_000]] as const) {
      const track = trackPitch(synth([lead, { hz, sec: 0.6 }, lead], rate), rate);
      expect(track.medianF0).not.toBeNull();
      expect(Math.abs((track.medianF0 as number) - hz) / hz).toBeLessThan(0.02);
    }
  });

  it('silence and noise are unvoiced', () => {
    const track = trackPitch(synth([{ silence: 0.3 }, { noise: 0.4 }, { silence: 0.3 }]), RATE);
    expect(track.frames.every((frame) => frame.f0 === null)).toBe(true);
    expect(track.medianF0).toBeNull();
    expect(trackPitch(new Float32Array(0), RATE).frames).toEqual([]);
  });

  it('follows a glide', () => {
    const track = trackPitch(synth([lead, { hz: 150, toHz: 250, sec: 0.8 }, lead]), RATE);
    const voiced = track.frames.filter((frame) => frame.f0 !== null);
    expect(voiced[0].f0 as number).toBeLessThan(170);
    expect(voiced[voiced.length - 1].f0 as number).toBeGreaterThan(225);
  });

  it('semitones: an octave is 12', () => {
    expect(semitones(440, 220)).toBeCloseTo(12, 6);
    expect(semitones(220 * 2 ** (-3 / 12), 220)).toBeCloseTo(-3, 6);
  });
});

describe('speech, pauses and mora slots', () => {
  it('a 0.4 s silence is a pause; a 0.08 s closure (っ) is not', () => {
    const track = trackPitch(synth([lead, mora(H), mora(H), { silence: 0.4 }, mora(L), { silence: 0.08 }, mora(L), lead]), RATE);
    const spans = speechSegments(track);
    expect(spans).toHaveLength(2);
    const timeline = moraTimeline(track, 4, spans);
    expect(timeline?.pauses).toHaveLength(1);
    expect(timeline?.pauses[0].afterMora).toBe(2);
    expect(timeline?.pauses[0].sec).toBeGreaterThan(0.3);
  });

  it('each slot reads its own mora\'s pitch', () => {
    const track = trackPitch(synth([lead, mora(L), mora(H), mora(H), mora(L), lead]), RATE);
    const slots = moraTimeline(track, 4)?.slots.map((slot) => slot.semitone) ?? [];
    expect(slots).toHaveLength(4);
    expect((slots[1] as number) - (slots[0] as number)).toBeGreaterThan(3);
    expect(Math.abs((slots[2] as number) - (slots[1] as number))).toBeLessThan(1);
    expect((slots[3] as number) - (slots[2] as number)).toBeLessThan(-3);
  });

  it('no speech, no timeline', () => {
    expect(moraTimeline(trackPitch(new Float32Array(RATE), RATE), 3)).toBeNull();
  });
});

describe('heard downstep', () => {
  it('names the steepest fall, 0 for none, null when mostly unvoiced', () => {
    expect(heardDownsteps([4, -2, -3], 2)).toEqual([1]);
    expect(heardDownsteps([-3, 3, -2], 2)).toEqual([2]);
    expect(heardDownsteps([-3, 2, 2.4], 2)).toEqual([0]);
    expect(heardDownsteps([null, null, 1], 2)).toBeNull();
  });

  it('a fall across a devoiced mora may be on either side of it', () => {
    expect(heardDownsteps([3, null, -3, -3], 3)).toEqual([1, 2]);
  });

  it('accent highs follow the Tokyo rule', () => {
    expect(accentHighs(3, 0)).toEqual({ word: [false, true, true], next: true });
    expect(accentHighs(3, 1)).toEqual({ word: [true, false, false], next: false });
    expect(accentHighs(3, 2)).toEqual({ word: [false, true, false], next: false });
    expect(accentHighs(3, 3)).toEqual({ word: [false, true, true], next: false });
  });
});

describe('pitch accent against the dictionary', () => {
  // 箸が (chopsticks, atamadaka [1]) vs 橋が (bridge, odaka [2]): は・し・が.
  const words = (downsteps: number[]): ProsodyWord[] => [
    { surface: 'はし', morae: 2, downsteps },
    { surface: 'が', morae: 1, downsteps: [] },
  ];

  it('H-L-L heard for chopsticks matches [1]; the same take for bridge [2] does not', () => {
    const track = trackPitch(synth([lead, mora(H), mora(L), mora(L), lead]), RATE);
    const chopsticks = analyzeShadowProsody({ track, words: words([1]), cueSec: 0.6 });
    expect(chopsticks?.accents).toHaveLength(1);
    expect(chopsticks?.accents[0]).toMatchObject({ surface: 'はし', heard: 1, verdict: 'match', expected: [1] });
    expect(chopsticks?.accentScore).toBe(100);
    const bridge = analyzeShadowProsody({ track, words: words([2]), cueSec: 0.6 });
    expect(bridge?.accents[0]).toMatchObject({ heard: 1, verdict: 'mismatch' });
    expect(bridge?.accentScore).toBe(0);
  });

  it('L-H-L (the drop on the particle) is odaka; L-H-H is heiban', () => {
    const odaka = trackPitch(synth([lead, mora(L), mora(H), mora(L), lead]), RATE);
    expect(analyzeShadowProsody({ track: odaka, words: words([2]) })?.accents[0]).toMatchObject({ heard: 2, verdict: 'match' });
    const heiban = trackPitch(synth([lead, mora(L), mora(H), mora(H), lead]), RATE);
    expect(analyzeShadowProsody({ track: heiban, words: words([0]) })?.accents[0]).toMatchObject({ heard: 0, verdict: 'match' });
    expect(analyzeShadowProsody({ track: heiban, words: words([2]) })?.accents[0]).toMatchObject({ heard: 0, verdict: 'mismatch' });
  });

  it('a word with several dictionary accents matches any of them', () => {
    const track = trackPitch(synth([lead, mora(L), mora(H), mora(H), lead]), RATE);
    expect(analyzeShadowProsody({ track, words: words([2, 0]) })?.accents[0].verdict).toBe('match');
  });

  it('a lower voice and a higher one are judged the same way', () => {
    for (const scale of [0.55, 1.4]) {
      const track = trackPitch(synth([lead, mora(H * scale), mora(L * scale), mora(L * scale), lead]), RATE);
      expect(analyzeShadowProsody({ track, words: words([1]) })?.accents[0].verdict).toBe('match');
    }
  });

  it('a devoiced mora is bridged: 聞きます [3] with き as noise', () => {
    // き・き・ま・す is L-H-H-L (downstep 3); the second き is devoiced (noise, no pitch).
    const track = trackPitch(synth([lead, mora(L), { noise: 0.16 }, mora(H), mora(L), lead]), RATE);
    const result = analyzeShadowProsody({ track, words: [{ surface: '聞きます', morae: 4, downsteps: [3] }] });
    expect(result?.accents[0].verdict).toBe('match');
    expect(result?.accents[0].contour[1]).toBeNull();
  });

  it('without pitch data nothing is judged, and says why', () => {
    const track = trackPitch(synth([lead, mora(H), mora(L), mora(L), lead]), RATE);
    const result = analyzeShadowProsody({ track, words: words([]) });
    expect(result?.accents).toEqual([]);
    expect(result?.accentScore).toBeNull();
    expect(result?.accentSkipped).toBe('no-pitch-data');
  });
});

describe('rhythm', () => {
  const line: ProsodyWord[] = [
    { surface: 'としょかん', morae: 4, downsteps: [] },
    { surface: 'に', morae: 1, downsteps: [] },
    { surface: '、', morae: 0, downsteps: [] },
    { surface: 'いき', morae: 2, downsteps: [] },
    { surface: 'ます', morae: 2, downsteps: [] },
  ];

  it('rate is morae per second of speech, pauses are placed by mora and word', () => {
    const parts: Part[] = [lead, mora(H), mora(H), { silence: 0.45 }, mora(H), mora(H), mora(H), { silence: 0.4 }, mora(H), mora(H), mora(H), mora(L), lead];
    const track = trackPitch(synth(parts), RATE);
    const result = analyzeShadowProsody({ track, words: line, cueSec: 1.8 });
    expect(result?.timing.morae).toBe(9);
    expect(result?.timing.moraPerSec).toBeGreaterThan(5);
    expect(result?.timing.moraPerSec).toBeLessThan(7.5);
    expect(result?.timing.cueMoraPerSec).toBe(5);
    expect(result?.timing.pauses).toHaveLength(2);
    const [inside, comma] = result?.timing.pauses ?? [];
    expect(inside).toMatchObject({ afterMora: 2, word: 'としょかん', inside: true, natural: false });
    expect(comma).toMatchObject({ afterMora: 5, word: 'に', inside: false, natural: true });
    expect(awkwardPauses(result!).map((pause) => pause.word)).toEqual(['としょかん']);
  });

  it('the comparison gate: most of the sound, about as many morae', () => {
    expect(prosodyComparable(90, 10, 10)).toBe(true);
    expect(prosodyComparable(55, 10, 10)).toBe(false);
    expect(prosodyComparable(80, 10, 6)).toBe(false);
    expect(prosodyComparable(80, 1, 1)).toBe(false);
  });
});
