/**
 * Estimate how far a subtitle file is out of sync with a video's audio.
 *
 * ## The defect this closes
 *
 * An external subtitle track is only as good as its timing, and a track that was timed
 * against a different release is worse than none: every cue names the wrong moment, the
 * transcript rows seek to the wrong place, and a mined card carries a sentence the audio
 * was not saying. Measured 2026-08-06 on `The Big O - 01`, whose `.ja.srt` sits beside the
 * video on disk: the subtitles run **9.05 s late**. The file's last cue ends at 23:47.4
 * while the video is 23:41 long, which is the same fact seen from the other end.
 *
 * ## Why the shift is applied to the cues, not to the player's delay control
 *
 * `VideoCore`'s `subtitleDelay` moves what is painted over the video and nothing else. The
 * transcript panel would keep the file's own (wrong) timestamps, so clicking a row would
 * seek 9 s away from the line it shows — the transcript is a seek surface here, not just a
 * readout. Shifting the cues themselves keeps the overlay, the transcript timestamps, the
 * seek target and the mined card's timing all saying one thing.
 *
 * ## How the offset is found
 *
 * Cross-correlate "a cue is on screen" against "someone is speaking", and take the lag
 * that lines them up.
 *
 * The speech signal is a 50 ms RMS envelope in the log domain, minus its own 10 s moving
 * average. That subtraction is what makes this work on anime: a scene under continuous
 * music never falls silent, so an absolute threshold sees one unbroken block of sound and
 * scores every lag identically. Measured: `silencedetect` at -32 dB found **one** silent
 * interval in 900 s and returned a flat 1.0 for every lag from -15 s to +15 s — a
 * degenerate answer that looks like a confident one. Detrending removes the steady bed and
 * leaves the transient dialogue energy the cues are supposed to sit on.
 *
 * ## It must be allowed to say "I don't know"
 *
 * Silently shifting an already-correct track by a spurious few seconds is a worse failure
 * than not shifting at all, because nothing on screen would explain it. So the peak has to
 * clear an absolute floor **and** stand clear of the best lag more than a second away.
 * Measured on the three cases that matter:
 *
 * | case                                    | peak    | best off-peak | verdict |
 * |-----------------------------------------|---------|---------------|---------|
 * | real track, 9 s late                    | 0.105   | 0.025 (4.3×)  | -9.05 s |
 * | same track pre-corrected by -9.05 s     | 0.105   | 0.025 (4.3×)  |  0.00 s |
 * | ep01's subtitles against ep02's audio   | 0.030   | 0.029 (1.03×) | refused |
 *
 * The middle row is the one that proves the estimator is not merely finding *a* peak: it
 * returns 0.00 s, to the resolution of the search, for a track that is already right.
 */

/** Envelope resolution. 50 ms is finer than a syllable and keeps the search cheap. */
export const SYNC_HOP_SEC = 0.05;

/** Sample rate the audio windows are decoded at. Speech energy needs no more. */
export const SYNC_SAMPLE_RATE = 8000;

/** Width of the moving average subtracted from the log envelope. */
export const SYNC_BASELINE_SEC = 10;

/** How far out of sync a track is allowed to be and still be found. */
export const SYNC_SEARCH_SEC = 20;

/** Search resolution. Matches the envelope hop — a finer grid would invent precision. */
export const SYNC_STEP_SEC = 0.05;

/**
 * Lags nearer the peak than this are the same peak, not a rival. Set at 1 s because the
 * measured lobe half-width is ~0.2 s; anything inside a second is its shoulder.
 */
export const SYNC_RIVAL_EXCLUSION_SEC = 1;

/** Absolute floor. The mismatch control scored 0.030 and the true matches 0.105. */
export const SYNC_MIN_PEAK_SCORE = 0.05;

/** The peak must beat its nearest genuine rival by this factor. Measured: 4.3 vs 1.03. */
export const SYNC_MIN_PEAK_RATIO = 2;

/** Too few overlapping frames and the mean is noise. */
export const SYNC_MIN_SAMPLES = 200;

export interface SyncCueInterval {
  readonly start: number;
  readonly end: number;
}

/** One decoded stretch of audio, already reduced to a detrended log envelope. */
export interface SyncAudioWindow {
  /** Position of frame 0 within the video, in seconds. */
  readonly startSec: number;
  readonly detrended: Float64Array;
}

export interface SubtitleSyncEstimate {
  /** Seconds to ADD to every cue time. Negative means the subtitles run late. */
  readonly offsetSec: number;
  readonly score: number;
  /** Best score at least {@link SYNC_RIVAL_EXCLUSION_SEC} away from the peak. */
  readonly rivalScore: number;
  /** Whether both gates passed. A caller must not shift anything when this is false. */
  readonly confident: boolean;
}

/**
 * RMS per frame of 16-bit PCM, in the log domain.
 *
 * The epsilon keeps a digitally silent frame finite; without it a single zeroed frame
 * poisons the whole baseline with -Infinity.
 */
export function logRmsEnvelope(samples: Int16Array, frameLength: number): Float64Array {
  if (frameLength <= 0) return new Float64Array(0);
  const frames = Math.floor(samples.length / frameLength);
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let acc = 0;
    const base = i * frameLength;
    for (let j = 0; j < frameLength; j += 1) {
      const v = samples[base + j] / 32768;
      acc += v * v;
    }
    out[i] = Math.log10(Math.sqrt(acc / frameLength) + 1e-6);
  }
  return out;
}

/**
 * Subtract a centred moving average, so only departures from the local loudness survive.
 *
 * Centred rather than trailing: a trailing window lags the signal it is meant to cancel,
 * which shifts the very quantity being measured.
 */
export function detrend(
  values: Float64Array,
  windowFrames: number,
): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const half = Math.max(1, Math.floor(windowFrames));
  // Prefix sums: the naive form is O(n · window), which at 28,000 frames and a 400-frame
  // window is 11M adds per episode — enough to be felt on the open path.
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i] + values[i];
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    out[i] = values[i] - (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }
  return out;
}

/**
 * Mean detrended energy under the cues when they are moved by `lagSec`.
 *
 * Returns null rather than 0 when too little of the subtitle track overlaps the sampled
 * audio: 0 is a legitimate score, and conflating "flat" with "unmeasured" would let an
 * empty overlap win the search at the extremes of the lag range.
 */
export function scoreLag(
  windows: readonly SyncAudioWindow[],
  cues: readonly SyncCueInterval[],
  lagSec: number,
  hopSec: number = SYNC_HOP_SEC,
): number | null {
  let sum = 0;
  let count = 0;
  for (const win of windows) {
    const n = win.detrended.length;
    for (const cue of cues) {
      const from = Math.floor((cue.start + lagSec - win.startSec) / hopSec);
      const to = Math.ceil((cue.end + lagSec - win.startSec) / hopSec);
      for (let i = Math.max(0, from); i < Math.min(n, to); i += 1) {
        sum += win.detrended[i];
        count += 1;
      }
    }
  }
  return count >= SYNC_MIN_SAMPLES ? sum / count : null;
}

/**
 * Search the lag range and apply both confidence gates.
 *
 * `offsetSec` is 0 whenever `confident` is false, so a caller that ignores the flag
 * degrades to today's behaviour rather than to a random shift.
 */
export function estimateOffset(
  windows: readonly SyncAudioWindow[],
  cues: readonly SyncCueInterval[],
  options: {
    searchSec?: number;
    stepSec?: number;
    hopSec?: number;
  } = {},
): SubtitleSyncEstimate {
  const search = options.searchSec ?? SYNC_SEARCH_SEC;
  const step = options.stepSec ?? SYNC_STEP_SEC;
  const hop = options.hopSec ?? SYNC_HOP_SEC;
  const none: SubtitleSyncEstimate = {
    offsetSec: 0, score: 0, rivalScore: 0, confident: false,
  };
  if (!windows.length || !cues.length || step <= 0) return none;

  const scored: { lag: number; score: number }[] = [];
  for (let lag = -search; lag <= search + 1e-9; lag += step) {
    // Rounded so the reported offset is a clean multiple of the step rather than a
    // float-accumulation artefact like -9.049999999999272.
    const rounded = Math.round(lag / step) * step;
    const score = scoreLag(windows, cues, rounded, hop);
    if (score !== null) scored.push({ lag: rounded, score });
  }
  if (!scored.length) return none;

  let best = scored[0];
  for (const entry of scored) if (entry.score > best.score) best = entry;

  let rival = -Infinity;
  for (const entry of scored) {
    if (Math.abs(entry.lag - best.lag) <= SYNC_RIVAL_EXCLUSION_SEC) continue;
    if (entry.score > rival) rival = entry.score;
  }
  if (!Number.isFinite(rival)) rival = 0;

  const confident = best.score >= SYNC_MIN_PEAK_SCORE
    && best.score >= Math.max(rival, 0) * SYNC_MIN_PEAK_RATIO;

  return {
    offsetSec: confident ? Number(best.lag.toFixed(2)) : 0,
    score: best.score,
    rivalScore: rival,
    confident,
  };
}

/**
 * Where to sample the audio.
 *
 * Evenly spaced and interior: an episode's first and last minute are titles and credits,
 * where the subtitle track is least representative and often carries song lyrics timed to
 * music rather than speech. Measured — 4 windows of 90 s reproduced the full-episode
 * answer exactly (-9.05 s) in **2.5 s** instead of ~3 minutes of decoding.
 */
export function syncSampleWindows(
  durationSec: number,
  count = 4,
  windowSec = 90,
): { startSec: number; lengthSec: number }[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || count <= 0) return [];
  // A clip shorter than one window is simply read whole.
  if (durationSec <= windowSec) return [{ startSec: 0, lengthSec: durationSec }];
  const out: { startSec: number; lengthSec: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const centre = (durationSec * (i + 1)) / (count + 1);
    const start = Math.max(0, Math.min(durationSec - windowSec, centre - windowSec / 2));
    out.push({ startSec: Number(start.toFixed(3)), lengthSec: windowSec });
  }
  return out;
}

/**
 * Move every cue by `offsetSec`, never before zero.
 *
 * Rounded to the millisecond, which is the resolution subtitle formats express in the
 * first place. Without it `10 - 9.05` stores as `0.9499999999999993` and that noise is
 * visible: the transcript panel renders these numbers as its row timestamps.
 */
export function shiftCues<T extends { start: number; end: number }>(
  cues: readonly T[],
  offsetSec: number,
): T[] {
  if (!offsetSec) return cues as T[];
  const move = (value: number): number =>
    Math.max(0, Math.round((value + offsetSec) * 1000) / 1000);
  return cues.map((cue) => ({ ...cue, start: move(cue.start), end: move(cue.end) }));
}

/**
 * `shiftCues` for the millisecond cue shape VideoCore hands the study surface.
 *
 * Kept as a second function rather than folded into `shiftCues` with a unit flag: the
 * two cue shapes come from different sources — `parseSubtitles` for a sidecar file,
 * `mediaCaptionCues` for a track VideoCore already loaded — and a caller that picks the
 * wrong unit here is off by a factor of a thousand rather than slightly wrong, which is
 * exactly the class of bug a shared flag would let through.
 *
 * No rounding step: these times are already whole milliseconds, so only the offset needs
 * it. Clamped at zero for the same reason as `shiftCues` — a negative shift on an early
 * cue must not push it before the start of the video.
 */
export function shiftCuesMs<T extends { startMs: number; endMs: number }>(
  cues: readonly T[],
  offsetSec: number,
): T[] {
  if (!offsetSec) return cues as T[];
  const offsetMs = Math.round(offsetSec * 1000);
  const move = (value: number): number => Math.max(0, value + offsetMs);
  return cues.map((cue) => ({
    ...cue,
    startMs: move(cue.startMs),
    endMs: move(cue.endMs),
  }));
}
