/**
 * Shadowing feedback from the AUDIO itself (docs/AI_AUDIT.md N18, round 2): the
 * pitch the learner spoke with and the rhythm of their take, measured on the
 * device from the recording's samples. No model and no network.
 *
 * - Pitch: a YIN fundamental-frequency track (de Cheveigné & Kawahara 2002) at
 *   10 ms frames, octave-error folded and median-smoothed, in semitones from the
 *   speaker's own median, so a low and a high voice compare the same way.
 * - Morae: Japanese is mora-timed, so once the pauses are cut out the stretch of
 *   speech is divided into as many equal slots as the line has morae, and each
 *   slot's pitch is the median of the voiced frames in its middle 60%. That only
 *   holds when the learner said (about) the line — the caller gates on the sound
 *   score and on the heard mora count — and it is said in the UI as an estimate.
 * - Accent: for each word with pitch-dictionary data the steepest fall between
 *   neighbouring morae (into the following particle too) is the HEARD downstep,
 *   compared with the dictionary's. Only the fall is judged: it is what makes
 *   はし "chopsticks" (H-L) differ from はし "bridge" (L-H, then L on the
 *   particle), and the phrase-initial rise is not a property of a word at all.
 * - Rhythm: morae per second over the speech itself (the articulation rate),
 *   against the cue's own rate, and every pause inside the line placed by mora,
 *   so "you stopped inside 図書館" can be said rather than just "slow".
 *
 * Pure: the renderer and the tests share it. Tested on synthesised fixture
 * audio only (`src/shared/__tests__/shadowingProsody.test.ts`).
 */

// ---- the pitch track -----------------------------------------------------------------

export interface PitchFrame {
  /** Centre of the frame, seconds from the start of the recording. */
  t: number;
  /** Fundamental frequency, Hz; null for an unvoiced or silent frame. */
  f0: number | null;
  /** Root-mean-square level of the frame (0..1 for normalised audio). */
  rms: number;
}

export interface PitchTrack {
  hopSec: number;
  frames: PitchFrame[];
  /** Median f0 over the voiced frames, Hz (null when nothing was voiced). */
  medianF0: number | null;
  /** The loudest frame's rms. */
  peakRms: number;
}

export interface PitchTrackOptions {
  minHz?: number;
  maxHz?: number;
  /** Only the first `maxSec` seconds are analysed (a shadowing take is a line). */
  maxSec?: number;
}

/** The rate the analysis runs at: plenty for a voice's f0 (≤ 500 Hz), a quarter of the work of 16 kHz. */
const ANALYSIS_RATE = 8_000;
const HOP_SEC = 0.01;
const WINDOW_SEC = 0.03;
/** YIN's absolute threshold on the cumulative-mean-normalised difference. */
const YIN_THRESHOLD = 0.15;
/** Above this even the best dip is not a period: the frame is unvoiced. */
const YIN_GIVE_UP = 0.35;
/** A frame quieter than this share of the loudest one is not speech. */
const SPEECH_LEVEL = 0.12;
const MIN_LEVEL = 0.01;

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Box-filtered decimation to about `ANALYSIS_RATE` (the box is the anti-alias filter). */
function decimate(samples: ArrayLike<number>, sampleRate: number, maxSec: number): { x: Float32Array; rate: number } {
  const factor = Math.max(1, Math.floor(sampleRate / ANALYSIS_RATE));
  const total = Math.min(samples.length, Math.floor(maxSec * sampleRate));
  const length = Math.floor(total / factor);
  const x = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    const start = i * factor;
    for (let k = 0; k < factor; k += 1) sum += samples[start + k];
    x[i] = sum / factor;
  }
  return { x, rate: sampleRate / factor };
}

/** One frame's period by YIN; 0 when the frame has none. */
function yinPeriod(x: Float32Array, start: number, win: number, minLag: number, maxLag: number, diff: Float64Array): number {
  diff[0] = 0;
  for (let tau = 1; tau <= maxLag; tau += 1) {
    let sum = 0;
    for (let j = 0; j < win; j += 1) {
      const d = x[start + j] - x[start + j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  // Cumulative-mean normalisation: d'(τ) = d(τ) · τ / Σ d(1..τ).
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau += 1) {
    running += diff[tau];
    diff[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t += 1) {
    if (diff[t] < YIN_THRESHOLD) {
      while (t + 1 <= maxLag && diff[t + 1] < diff[t]) t += 1;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = minLag;
    for (let t = minLag + 1; t <= maxLag; t += 1) if (diff[t] < diff[best]) best = t;
    if (diff[best] >= YIN_GIVE_UP) return 0;
    tau = best;
  }
  // Parabolic interpolation around the dip for a sub-sample period.
  if (tau > minLag && tau < maxLag) {
    const a = diff[tau - 1];
    const b = diff[tau];
    const c = diff[tau + 1];
    const denom = a - 2 * b + c;
    if (denom > 0) return tau + Math.max(-0.5, Math.min(0.5, (a - c) / (2 * denom)));
  }
  return tau;
}

/**
 * The f0 track of mono PCM. Octave errors (a frame at double or half the
 * speaker's median) are folded back, single-frame blips are dropped, and the
 * track is median-smoothed over five frames.
 */
export function trackPitch(samples: ArrayLike<number>, sampleRate: number, options: PitchTrackOptions = {}): PitchTrack {
  const empty: PitchTrack = { hopSec: HOP_SEC, frames: [], medianF0: null, peakRms: 0 };
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate < 2_000) return empty;
  const minHz = options.minHz ?? 70;
  const maxHz = options.maxHz ?? 500;
  const { x, rate } = decimate(samples, sampleRate, options.maxSec ?? 30);
  const hop = Math.max(1, Math.round(rate * HOP_SEC));
  const win = Math.max(8, Math.round(rate * WINDOW_SEC));
  const minLag = Math.max(2, Math.floor(rate / maxHz));
  const maxLag = Math.max(minLag + 2, Math.ceil(rate / minHz));
  const diff = new Float64Array(maxLag + 2);
  const frames: PitchFrame[] = [];
  for (let start = 0; start + win + maxLag < x.length; start += hop) {
    let energy = 0;
    for (let j = 0; j < win; j += 1) energy += x[start + j] * x[start + j];
    frames.push({ t: (start + win / 2) / rate, f0: null, rms: Math.sqrt(energy / win) });
  }
  if (!frames.length) return empty;
  const peakRms = Math.max(...frames.map((frame) => frame.rms));
  const floor = Math.max(MIN_LEVEL, peakRms * SPEECH_LEVEL);
  frames.forEach((frame, index) => {
    if (frame.rms < floor) return;
    const period = yinPeriod(x, index * hop, win, minLag, maxLag, diff);
    if (period > 0) frame.f0 = rate / period;
  });

  // Octave errors: fold anything near double or half the median back onto it.
  const rough = median(frames.flatMap((frame) => (frame.f0 ? [frame.f0] : [])));
  if (rough) {
    for (const frame of frames) {
      if (!frame.f0) continue;
      if (frame.f0 > rough * 1.8) frame.f0 /= 2;
      else if (frame.f0 < rough * 0.55) frame.f0 *= 2;
    }
  }
  // A voiced run shorter than 30 ms is a click or a breath, not a syllable.
  let runStart = -1;
  for (let i = 0; i <= frames.length; i += 1) {
    const voiced = i < frames.length && frames[i].f0 !== null;
    if (voiced && runStart < 0) runStart = i;
    if (!voiced && runStart >= 0) {
      if (i - runStart < 3) for (let k = runStart; k < i; k += 1) frames[k].f0 = null;
      runStart = -1;
    }
  }
  // Five-frame median over the voiced neighbours.
  const raw = frames.map((frame) => frame.f0);
  frames.forEach((frame, i) => {
    if (raw[i] === null) return;
    const near: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k += 1) {
      const value = raw[k];
      if (value !== null) near.push(value);
    }
    frame.f0 = median(near);
  });
  return { hopSec: HOP_SEC, frames, medianF0: median(frames.flatMap((frame) => (frame.f0 ? [frame.f0] : []))), peakRms };
}

/** Semitones of `f0` above (or below) `reference`. */
export function semitones(f0: number, reference: number): number {
  return 12 * Math.log2(f0 / reference);
}

// ---- speech and pauses ----------------------------------------------------------------

export interface TimeSpan {
  start: number;
  end: number;
}

/** A silence shorter than this inside a line is a consonant closure (っ, a stop), not a pause. */
export const SHADOW_MIN_PAUSE_SEC = 0.2;

/** The stretches of speech in the track, gaps under `minPauseSec` merged. */
export function speechSegments(track: PitchTrack, minPauseSec = SHADOW_MIN_PAUSE_SEC): TimeSpan[] {
  if (!track.frames.length || !(track.peakRms > MIN_LEVEL)) return [];
  const floor = Math.max(MIN_LEVEL, track.peakRms * SPEECH_LEVEL);
  const half = track.hopSec / 2;
  const spans: TimeSpan[] = [];
  for (const frame of track.frames) {
    if (frame.rms < floor) continue;
    const last = spans[spans.length - 1];
    if (last && frame.t - half - last.end < minPauseSec) last.end = frame.t + half;
    else spans.push({ start: frame.t - half, end: frame.t + half });
  }
  return spans.filter((span) => span.end - span.start >= 0.05);
}

// ---- morae on the timeline ----------------------------------------------------------------

export interface MoraSlot {
  /** Median pitch over the slot's middle, semitones from the speaker's median; null when unvoiced. */
  semitone: number | null;
  voicedFrames: number;
}

export interface MoraTimeline {
  slots: MoraSlot[];
  /** Seconds of speech (pauses cut out). */
  speechSec: number;
  /** Seconds per mora over the speech. */
  slotSec: number;
  /** Pauses inside the speech, with how many morae came before each. */
  pauses: Array<{ afterMora: number; sec: number }>;
}

/**
 * Lays `moraCount` equal slots over the speech (pauses cut out) and reads each
 * slot's pitch. `null` when there is no speech or no voice.
 */
export function moraTimeline(track: PitchTrack, moraCount: number, segments = speechSegments(track)): MoraTimeline | null {
  if (moraCount < 1 || !segments.length || !track.medianF0) return null;
  const speechSec = segments.reduce((sum, span) => sum + (span.end - span.start), 0);
  if (speechSec <= 0) return null;
  const slotSec = speechSec / moraCount;
  const values: number[][] = Array.from({ length: moraCount }, () => []);
  const pauses: MoraTimeline['pauses'] = [];
  let offset = 0;
  segments.forEach((span, index) => {
    for (const frame of track.frames) {
      if (frame.t < span.start || frame.t > span.end || frame.f0 === null) continue;
      const position = (offset + frame.t - span.start) / slotSec;
      const slot = Math.min(moraCount - 1, Math.floor(position));
      const within = position - slot;
      if (within >= 0.2 && within <= 0.8) values[slot].push(semitones(frame.f0, track.medianF0 as number));
    }
    offset += span.end - span.start;
    const next = segments[index + 1];
    if (next) pauses.push({ afterMora: Math.round(offset / slotSec), sec: Math.round((next.start - span.end) * 100) / 100 });
  });
  return {
    slots: values.map((list) => ({ semitone: list.length >= 2 ? median(list) : null, voicedFrames: list.length })),
    speechSec: Math.round(speechSec * 100) / 100,
    slotSec,
    pauses,
  };
}

// ---- the accent, word by word ---------------------------------------------------------------

/** A word of the line as the prosody check needs it. */
export interface ProsodyWord {
  surface: string;
  /** Morae of its reading (0 for punctuation). */
  morae: number;
  /** Downstep positions from the pitch dictionary (0 = heiban); empty when it has no entry. */
  downsteps: readonly number[];
}

/** High (true) or low for each mora of a word, and for the mora after it (a particle). */
export function accentHighs(moraCount: number, downstep: number): { word: boolean[]; next: boolean } {
  const word = Array.from({ length: moraCount }, (_, i) => {
    const n = i + 1;
    if (downstep === 0) return n > 1;
    if (downstep === 1) return n === 1;
    return n > 1 && n <= downstep;
  });
  return { word, next: downstep === 0 };
}

/** A fall of at least this many semitones between neighbouring morae is a downstep. */
export const SHADOW_DOWNSTEP_ST = 1.5;

export type AccentVerdict = 'match' | 'mismatch' | 'unclear';

export interface WordAccent {
  surface: string;
  /** Index of the word in the line's tokens. */
  token: number;
  /** Morae of the word. */
  morae: number;
  /** The contour also covers the mora after the word (the line went on without a pause). */
  includesNext: boolean;
  /** The dictionary's downstep(s) for the word (first is drawn). */
  expected: number[];
  /** The downstep heard: 0 = no fall (heiban), n = fall after mora n; null when unclear. */
  heard: number | null;
  verdict: AccentVerdict;
  /** The learner's pitch per mora of the word and the mora after it, semitones (null = unvoiced). */
  contour: Array<number | null>;
}

export interface ProsodyPause {
  sec: number;
  /** Morae said before it. */
  afterMora: number;
  /** The word it came after (between words) or inside of. */
  word: string;
  inside: boolean;
  /** The line has punctuation there: a pause is natural. */
  natural: boolean;
}

export interface ProsodyTiming {
  morae: number;
  speechSec: number;
  /** Morae per second over the speech itself. */
  moraPerSec: number;
  /** The cue's morae per second (its length includes any padding, so it is a lower bound). */
  cueMoraPerSec: number | null;
  pauses: ProsodyPause[];
}

export interface ShadowProsody {
  timing: ProsodyTiming;
  /** Words with pitch data that could be judged; empty when the take was not clear enough. */
  accents: WordAccent[];
  /** 0-100 over the words judged; null when none could be. */
  accentScore: number | null;
  /** Why no accent could be judged, when none was. */
  accentSkipped: 'no-pitch-data' | 'unvoiced' | null;
}

function nearestVoicedIndex(contour: ReadonlyArray<number | null>, from: number, step: 1 | -1): number {
  for (let i = from; i >= 0 && i < contour.length; i += step) {
    if (contour[i] !== null && contour[i] !== undefined) return i;
  }
  return -1;
}

/**
 * The downstep heard in one word: the steepest fall between neighbouring morae,
 * into the following mora too. `[0]` when nothing falls far enough (heiban),
 * `null` when too little of the word was voiced to tell.
 *
 * A devoiced mora (the き of 聞きます, the す of です) has no pitch: the fall is
 * measured across it, and since it may have happened on either side, every
 * position it spans is returned — the first is the one drawn.
 */
export function heardDownsteps(contour: ReadonlyArray<number | null>, wordMorae: number): number[] | null {
  const voiced = contour.filter((value) => value !== null).length;
  if (voiced < Math.max(2, Math.ceil(contour.length / 2))) return null;
  let steepest = 0;
  let range: [number, number] = [0, 0];
  for (let i = 0; i + 1 < contour.length && i < wordMorae; i += 1) {
    const before = nearestVoicedIndex(contour, i, -1);
    const after = nearestVoicedIndex(contour, i + 1, 1);
    if (before < 0 || after < 0) continue;
    const fall = (contour[after] as number) - (contour[before] as number);
    if (fall < steepest - 1e-9) {
      steepest = fall;
      range = [before + 1, Math.min(after, wordMorae)];
    }
  }
  if (steepest > -SHADOW_DOWNSTEP_ST) return [0];
  const out: number[] = [];
  for (let p = range[0]; p <= range[1]; p += 1) out.push(p);
  return out;
}

export interface ProsodyInput {
  track: PitchTrack;
  words: readonly ProsodyWord[];
  /** The cue's length, seconds. */
  cueSec?: number;
}

/**
 * Pitch accent and rhythm of a take. `null` when there is no speech or no
 * voice in it. Callers gate it on the sound comparison first: equal mora slots
 * only line up with the line when the learner said the line.
 */
export function analyzeShadowProsody({ track, words, cueSec }: ProsodyInput): ShadowProsody | null {
  const total = words.reduce((sum, word) => sum + word.morae, 0);
  if (total < 1) return null;
  const segments = speechSegments(track);
  const timeline = moraTimeline(track, total, segments);
  if (!timeline) return null;

  // Where every word starts on the mora axis.
  const starts: number[] = [];
  let cursor = 0;
  for (const word of words) {
    starts.push(cursor);
    cursor += word.morae;
  }
  const wordAt = (mora: number): { index: number; inside: boolean } => {
    for (let i = words.length - 1; i >= 0; i -= 1) {
      if (words[i].morae && starts[i] < mora) return { index: i, inside: starts[i] + words[i].morae > mora };
    }
    return { index: 0, inside: false };
  };
  const punctuationAfter = (index: number): boolean => {
    for (let i = index + 1; i < words.length; i += 1) {
      if (words[i].morae) return false;
      if (/[、。，,.!?！？…]/u.test(words[i].surface)) return true;
    }
    return false;
  };

  const pauses: ProsodyPause[] = timeline.pauses
    .filter((pause) => pause.afterMora > 0 && pause.afterMora < total)
    .map((pause) => {
      const { index, inside } = wordAt(pause.afterMora);
      return {
        sec: pause.sec,
        afterMora: pause.afterMora,
        word: words[index]?.surface ?? '',
        inside,
        natural: !inside && punctuationAfter(index),
      };
    });

  const accents: WordAccent[] = [];
  let withData = 0;
  words.forEach((word, index) => {
    if (!word.morae || !word.downsteps.length) return;
    const valid = word.downsteps.filter((d) => Number.isInteger(d) && d >= 0 && d <= word.morae);
    if (!valid.length) return;
    withData += 1;
    const first = starts[index];
    // The mora after the word, when the line goes on without a pause there.
    const pausedAfter = pauses.some((pause) => pause.afterMora === first + word.morae);
    const span = first + word.morae < total && !pausedAfter ? word.morae + 1 : word.morae;
    // A one-mora word with nothing after it has no fall to hear.
    if (span < 2) return;
    const contour = timeline.slots.slice(first, first + span).map((slot) => slot.semitone);
    const heard = heardDownsteps(contour, word.morae);
    // Without the following mora an odaka word sounds heiban: both count.
    const expected = span === word.morae ? valid.map((d) => (d === word.morae ? 0 : d)) : valid;
    const hit = heard?.find((position) => expected.includes(position));
    accents.push({
      surface: word.surface,
      token: index,
      morae: word.morae,
      includesNext: span > word.morae,
      expected: valid,
      heard: heard === null ? null : hit ?? heard[0],
      verdict: heard === null ? 'unclear' : hit !== undefined ? 'match' : 'mismatch',
      contour: contour.map((value) => (value === null ? null : Math.round(value * 10) / 10)),
    });
  });
  const judged = accents.filter((accent) => accent.verdict !== 'unclear');
  const matched = judged.filter((accent) => accent.verdict === 'match').length;

  const moraPerSec = Math.round((total / timeline.speechSec) * 10) / 10;
  const cueRate = cueSec && Number.isFinite(cueSec) && cueSec > 0.2 ? Math.round((total / cueSec) * 10) / 10 : null;
  return {
    timing: { morae: total, speechSec: timeline.speechSec, moraPerSec, cueMoraPerSec: cueRate, pauses },
    accents,
    accentScore: judged.length ? Math.round((matched / judged.length) * 100) : null,
    accentSkipped: !withData ? 'no-pitch-data' : !judged.length ? 'unvoiced' : null,
  };
}

/**
 * Whether a take is close enough to the line for equal mora slots to mean
 * anything: most of the line's sound heard, and about as many morae said.
 */
export function prosodyComparable(score: number, expectedUnits: number, heardUnits: number): boolean {
  if (score < 60 || expectedUnits < 2 || heardUnits < 1) return false;
  return Math.abs(heardUnits - expectedUnits) / expectedUnits <= 0.25;
}

/** Pauses worth naming: inside a word, or between words where the line has no comma. */
export function awkwardPauses(prosody: ShadowProsody, minSec = 0.25): ProsodyPause[] {
  return prosody.timing.pauses.filter((pause) => pause.sec >= minSec && !pause.natural);
}
