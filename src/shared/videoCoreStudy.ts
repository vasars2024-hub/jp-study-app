export interface VideoCoreStudyCue {
  index: number;
  trackNumber: number;
  text: string;
  startMs: number;
  endMs: number;
}

export interface VideoCoreStudyLoopState {
  lineLoop: boolean;
  abLoop: boolean;
  abStartSec: number | null;
  abEndSec: number | null;
}

export interface VideoCoreStudyPreferences {
  playbackRate: number;
  autoPause: boolean;
  loopLine: boolean;
  furigana: boolean;
  primarySubs: boolean;
  dualSubs: boolean;
  dictationMode: boolean;
  shadowingMode: boolean;
  subtitleFontSize: number;
  /** Cue background opacity, 0 (fully transparent) to 90. */
  subtitleBgOpacity: number;
  /** Colour-code the active cue by grammar/vocab/particle and allow click-to-explain. */
  grammarHighlight: boolean;
  /** Show the whole subtitle track as a seekable transcript rail. */
  transcriptPanel: boolean;
  /** Seconds the rewind / fast-forward shortcuts move, 1–60. */
  seekStepSec: number;
  [key: string]: unknown;
}

export interface VideoCoreDictationEvaluation {
  exact: boolean;
  score: number;
  answer: string;
  expected: string;
}

export interface VideoCoreWhisperCue {
  start: number;
  end: number;
  text: string;
}

export interface VideoCoreWhisperEvent {
  trackNumber: number;
  text: string;
  startTime: number;
  duration: number;
  codecID: 'S_TEXT/ASS';
  extraData: Record<string, string>;
}

export interface VideoCoreResumeSource {
  playbackId?: string;
  localFilePath?: string;
  streamPath?: string;
  mediaId?: number;
  episodeNumber?: number;
}

export interface VideoCoreResumePosition {
  key: string;
  positionSec: number;
  updatedAt: number;
}

export interface VideoCoreCueReplaySignal {
  cueKey: string;
  replayCount: number;
  firstReplayAt: number;
  lastReplayAt: number;
  dismissed: boolean;
}

export type VideoCoreComprehensionEvent = 'lookup' | 'rewind' | 'pause';

export interface VideoCoreComprehensionSignal {
  trackNumber: number;
  anchorCueIndex: number;
  anchorCueKey: string;
  lookupCount: number;
  rewindCount: number;
  pauseCount: number;
  firstEventAt: number;
  lastEventAt: number;
  dismissed: boolean;
}

export interface VideoCoreRescueScene {
  startSec: number;
  endSec: number;
  cueCount: number;
  firstCueIndex: number;
  lastCueIndex: number;
}

/** One explicit ±0.1s activation: where playback was, and what the delay became. */
export interface VideoCoreTimingSample {
  positionSec: number;
  delaySec: number;
  at: number;
}

export interface VideoCoreTimingSignal {
  trackNumber: number;
  changeCount: number;
  firstChangeAt: number;
  lastChangeAt: number;
  samples: VideoCoreTimingSample[];
  dismissed: boolean;
}

export interface VideoCoreTimingDrift {
  /** Signed subtitle-delay change, in milliseconds, per minute of playback. */
  msPerMinute: number;
  /** The user's newest manual correction — the point the projection trusts. */
  anchorPositionSec: number;
  anchorDelaySec: number;
  spanSec: number;
  sampleCount: number;
  netDelaySec: number;
}

export const PLAYER_PREFERENCES_STORAGE_KEY = 'jp-media-player-preferences-v1';
export const VIDEO_CORE_RESUME_STORAGE_KEY = 'jp-video-core-resume-v1';
export const VIDEO_CORE_RESUME_LIMIT = 100;
export const VIDEO_CORE_SHADOWING_REPLAY_THRESHOLD = 3;
export const VIDEO_CORE_SHADOWING_REPLAY_WINDOW_MS = 10 * 60_000;
export const VIDEO_CORE_COMPREHENSION_WINDOW_MS = 2 * 60_000;
export const VIDEO_CORE_COMPREHENSION_SCENE_RADIUS = 2;
export const VIDEO_CORE_COMPREHENSION_LOOKUP_THRESHOLD = 2;
export const VIDEO_CORE_COMPREHENSION_REWIND_THRESHOLD = 2;
export const VIDEO_CORE_TIMING_WINDOW_MS = 15 * 60_000;
export const VIDEO_CORE_TIMING_SAMPLE_LIMIT = 16;
export const VIDEO_CORE_TIMING_CHANGE_THRESHOLD = 4;
/** Corrections spread over less playback than this describe one moment, not drift. */
export const VIDEO_CORE_TIMING_MIN_SPAN_SEC = 120;
/** Below this rate a constant offset still explains the fault. */
export const VIDEO_CORE_TIMING_MIN_DRIFT_MS_PER_MIN = 100;
/** How far off the drift line one manual correction may sit — 1.5 control steps. */
export const VIDEO_CORE_TIMING_MAX_RESIDUAL_SEC = 0.15;
/** The manual control's own range; the tracker never exceeds it. */
export const VIDEO_CORE_TIMING_MAX_DELAY_SEC = 10;
/** The tracker only rewrites the delay once its projection has moved this far. */
export const VIDEO_CORE_TIMING_APPLY_STEP_SEC = 0.05;

export function normalizeVideoCoreStudyPreferences(value: unknown): VideoCoreStudyPreferences {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<VideoCoreStudyPreferences>
    : {};
  const fontSize = typeof raw.subtitleFontSize === 'number'
    && Number.isFinite(raw.subtitleFontSize)
    ? Math.round(Math.max(16, Math.min(48, raw.subtitleFontSize)))
    : 26;
  return {
    ...raw,
    playbackRate: clampStudyPlaybackRate(
      typeof raw.playbackRate === 'number' ? raw.playbackRate : 1,
    ),
    autoPause: raw.autoPause === true,
    loopLine: raw.loopLine === true,
    furigana: raw.furigana === true,
    primarySubs: raw.primarySubs !== false,
    dualSubs: raw.dualSubs !== false,
    dictationMode: raw.dictationMode === true,
    shadowingMode: raw.shadowingMode === true,
    subtitleFontSize: fontSize,
    subtitleBgOpacity: typeof raw.subtitleBgOpacity === 'number'
      && Number.isFinite(raw.subtitleBgOpacity)
      ? Math.round(Math.max(0, Math.min(90, raw.subtitleBgOpacity)))
      : 35,
    grammarHighlight: raw.grammarHighlight === true,
    transcriptPanel: raw.transcriptPanel === true,
    seekStepSec: typeof raw.seekStepSec === 'number' && Number.isFinite(raw.seekStepSec)
      ? Math.round(Math.max(1, Math.min(60, raw.seekStepSec)))
      : 5,
  };
}

export function stripAssCueText(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/\\[Nn]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cuePlaybackStartSec(
  cue: Pick<VideoCoreStudyCue, 'startMs'>,
  subtitleDelaySec: number,
): number {
  return Math.max(0, cue.startMs / 1000 + subtitleDelaySec);
}

/**
 * Where playback lands when a transcript line is clicked: the cue's start, less
 * a run-up, never before the file.
 *
 * Kept here rather than inline in the overlay because the clamp is the whole
 * content of it — a lead-in applied to a cue in the first second of an episode
 * produces a negative `currentTime`, which Chromium silently coerces to 0 on
 * some paths and rejects on others.
 */
export function transcriptSeekSec(
  cue: Pick<VideoCoreStudyCue, 'startMs'>,
  subtitleDelaySec: number,
  leadInSec: number,
): number {
  return Math.max(0, cuePlaybackStartSec(cue, subtitleDelaySec) - leadInSec);
}

export function cuePlaybackEndSec(
  cue: Pick<VideoCoreStudyCue, 'endMs'>,
  subtitleDelaySec: number,
): number {
  return Math.max(0, cue.endMs / 1000 + subtitleDelaySec);
}

export function videoCoreStudyCueKey(
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'>,
): string {
  return `${cue.trackNumber}:${cue.index}:${cue.startMs}:${cue.endMs}`;
}

/**
 * Records only an explicit replay-control activation. Automatic line/A-B loops
 * do not pass through this helper, so they cannot manufacture a recommendation.
 * The state holds one cue and one ten-minute window, keeping the signal bounded
 * to the active player session.
 */
export function recordVideoCoreCueReplay(
  current: VideoCoreCueReplaySignal | null,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'>,
  now = Date.now(),
): VideoCoreCueReplaySignal {
  const cueKey = videoCoreStudyCueKey(cue);
  const timestamp = Number.isFinite(now) ? Math.max(0, Math.round(now)) : Date.now();
  if (
    !current
    || current.cueKey !== cueKey
    || timestamp - current.firstReplayAt > VIDEO_CORE_SHADOWING_REPLAY_WINDOW_MS
  ) {
    return {
      cueKey,
      replayCount: 1,
      firstReplayAt: timestamp,
      lastReplayAt: timestamp,
      dismissed: false,
    };
  }
  return {
    ...current,
    replayCount: Math.min(99, current.replayCount + 1),
    lastReplayAt: timestamp,
  };
}

export function dismissVideoCoreShadowingSuggestion(
  current: VideoCoreCueReplaySignal | null,
): VideoCoreCueReplaySignal | null {
  return current ? { ...current, dismissed: true } : null;
}

export function shouldSuggestVideoCoreShadowing(
  signal: VideoCoreCueReplaySignal | null,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'> | null,
  shadowingMode: boolean,
): boolean {
  return Boolean(
    signal
    && cue
    && !shadowingMode
    && !signal.dismissed
    && signal.cueKey === videoCoreStudyCueKey(cue)
    && signal.replayCount >= VIDEO_CORE_SHADOWING_REPLAY_THRESHOLD,
  );
}

/**
 * Keeps only one short, nearby-cue evidence window in the active player.
 * Callers deliberately route explicit lookup/rewind/pause actions here; automatic
 * playback loops never call this helper and therefore cannot create a rescue.
 */
export function recordVideoCoreComprehensionEvent(
  current: VideoCoreComprehensionSignal | null,
  event: VideoCoreComprehensionEvent,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'>,
  now = Date.now(),
): VideoCoreComprehensionSignal {
  const timestamp = Number.isFinite(now) ? Math.max(0, Math.round(now)) : Date.now();
  const nearby = Boolean(
    current
    && current.trackNumber === cue.trackNumber
    && Math.abs(current.anchorCueIndex - cue.index) <= VIDEO_CORE_COMPREHENSION_SCENE_RADIUS
    && timestamp - current.firstEventAt <= VIDEO_CORE_COMPREHENSION_WINDOW_MS,
  );
  const base: VideoCoreComprehensionSignal = nearby && current
    ? current
    : {
      trackNumber: cue.trackNumber,
      anchorCueIndex: cue.index,
      anchorCueKey: videoCoreStudyCueKey(cue),
      lookupCount: 0,
      rewindCount: 0,
      pauseCount: 0,
      firstEventAt: timestamp,
      lastEventAt: timestamp,
      dismissed: false,
    };
  const anchor = event === 'lookup'
    ? {
      trackNumber: cue.trackNumber,
      anchorCueIndex: cue.index,
      anchorCueKey: videoCoreStudyCueKey(cue),
    }
    : {};
  return {
    ...base,
    ...anchor,
    lookupCount: Math.min(99, base.lookupCount + (event === 'lookup' ? 1 : 0)),
    rewindCount: Math.min(99, base.rewindCount + (event === 'rewind' ? 1 : 0)),
    pauseCount: Math.min(99, base.pauseCount + (event === 'pause' ? 1 : 0)),
    lastEventAt: timestamp,
  };
}

export function dismissVideoCoreComprehensionSuggestion(
  current: VideoCoreComprehensionSignal | null,
): VideoCoreComprehensionSignal | null {
  return current ? { ...current, dismissed: true } : null;
}

export function shouldSuggestVideoCoreComprehensionRescue(
  signal: VideoCoreComprehensionSignal | null,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber'> | null,
  paused: boolean,
  now = Date.now(),
): boolean {
  return Boolean(
    signal
    && cue
    && paused
    && !signal.dismissed
    && signal.trackNumber === cue.trackNumber
    && Math.abs(signal.anchorCueIndex - cue.index) <= VIDEO_CORE_COMPREHENSION_SCENE_RADIUS
    && now - signal.firstEventAt <= VIDEO_CORE_COMPREHENSION_WINDOW_MS
    && signal.lookupCount >= VIDEO_CORE_COMPREHENSION_LOOKUP_THRESHOLD
    && signal.rewindCount >= VIDEO_CORE_COMPREHENSION_REWIND_THRESHOLD
    && signal.pauseCount >= 1,
  );
}

export function videoCoreRescueScene(
  cues: readonly VideoCoreStudyCue[],
  anchor: Pick<VideoCoreStudyCue, 'index' | 'trackNumber'>,
  subtitleDelaySec: number,
): VideoCoreRescueScene | null {
  const trackCues = cues.filter((cue) => cue.trackNumber === anchor.trackNumber);
  const position = trackCues.findIndex((cue) => cue.index === anchor.index);
  if (position < 0) return null;
  const first = trackCues[Math.max(0, position - 1)];
  const last = trackCues[Math.min(trackCues.length - 1, position + 1)];
  if (!first || !last) return null;
  const startSec = cuePlaybackStartSec(first, subtitleDelaySec);
  const endSec = cuePlaybackEndSec(last, subtitleDelaySec);
  if (!(endSec > startSec)) return null;
  return {
    startSec,
    endSec,
    cueCount: Math.min(trackCues.length - 1, position + 1) - Math.max(0, position - 1) + 1,
    firstCueIndex: first.index,
    lastCueIndex: last.index,
  };
}

/**
 * Records one *explicit* subtitle-delay activation — the ±0.1s controls only.
 * Programmatic writes (loading a track, the drift tracker below) never reach
 * this helper, so a correction the app applied itself can never be mistaken for
 * the user fighting the timing.
 *
 * The state holds one track and one bounded window of samples, so the evidence
 * lives and dies with the active player session.
 */
export function recordVideoCoreTimingAdjustment(
  current: VideoCoreTimingSignal | null,
  trackNumber: number,
  positionSec: number,
  delaySec: number,
  now = Date.now(),
): VideoCoreTimingSignal | null {
  if (!Number.isFinite(positionSec) || !Number.isFinite(delaySec) || !Number.isFinite(trackNumber)) {
    return current;
  }
  const timestamp = Number.isFinite(now) ? Math.max(0, Math.round(now)) : Date.now();
  const sample: VideoCoreTimingSample = {
    positionSec: Math.max(0, Math.round(positionSec * 1000) / 1000),
    delaySec: Math.round(delaySec * 1000) / 1000,
    at: timestamp,
  };
  const continues = Boolean(
    current
    && current.trackNumber === trackNumber
    && timestamp - current.firstChangeAt <= VIDEO_CORE_TIMING_WINDOW_MS,
  );
  if (!continues || !current) {
    return {
      trackNumber,
      changeCount: 1,
      firstChangeAt: timestamp,
      lastChangeAt: timestamp,
      samples: [sample],
      dismissed: false,
    };
  }
  const samples = [...current.samples, sample].slice(-VIDEO_CORE_TIMING_SAMPLE_LIMIT);
  return {
    ...current,
    changeCount: Math.min(99, current.changeCount + 1),
    lastChangeAt: timestamp,
    samples,
  };
}

export function dismissVideoCoreTimingRepair(
  current: VideoCoreTimingSignal | null,
): VideoCoreTimingSignal | null {
  return current ? { ...current, dismissed: true } : null;
}

/**
 * Reads progressive drift out of the recorded samples, or returns null.
 *
 * Drift is the one timing fault a constant delay cannot fix, so the bar is
 * deliberately high: enough explicit corrections, all in one direction, made at
 * strictly advancing playback positions across a real span, implying a rate far
 * above ordinary fiddling — and every intermediate sample must sit on the same
 * line. A user hunting back and forth around one value produces no drift here,
 * because that is a constant offset they have already solved by hand.
 */
export function videoCoreTimingDrift(
  signal: VideoCoreTimingSignal | null,
  now = Date.now(),
): VideoCoreTimingDrift | null {
  if (!signal || signal.samples.length < VIDEO_CORE_TIMING_CHANGE_THRESHOLD) return null;
  if (now - signal.firstChangeAt > VIDEO_CORE_TIMING_WINDOW_MS) return null;
  const samples = signal.samples;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const spanSec = last.positionSec - first.positionSec;
  if (spanSec < VIDEO_CORE_TIMING_MIN_SPAN_SEC) return null;

  const direction = Math.sign(last.delaySec - first.delaySec);
  if (direction === 0) return null;
  for (let index = 1; index < samples.length; index += 1) {
    const step = samples[index];
    const previous = samples[index - 1];
    // Playback must advance and the correction must keep pushing the same way.
    if (step.positionSec < previous.positionSec) return null;
    if (Math.sign(step.delaySec - previous.delaySec) !== direction) return null;
  }

  const secPerSec = (last.delaySec - first.delaySec) / spanSec;
  const msPerMinute = secPerSec * 60_000;
  if (Math.abs(msPerMinute) < VIDEO_CORE_TIMING_MIN_DRIFT_MS_PER_MIN) return null;

  // Every correction must lie on the same line; a random walk is not drift.
  for (const step of samples) {
    const expected = first.delaySec + secPerSec * (step.positionSec - first.positionSec);
    if (Math.abs(step.delaySec - expected) > VIDEO_CORE_TIMING_MAX_RESIDUAL_SEC) return null;
  }

  return {
    msPerMinute: Math.round(msPerMinute),
    anchorPositionSec: last.positionSec,
    anchorDelaySec: last.delaySec,
    spanSec: Math.round(spanSec),
    sampleCount: samples.length,
    netDelaySec: Math.round((last.delaySec - first.delaySec) * 1000) / 1000,
  };
}

export function shouldSuggestVideoCoreTimingRepair(
  signal: VideoCoreTimingSignal | null,
  drift: VideoCoreTimingDrift | null,
  tracking: boolean,
): boolean {
  return Boolean(signal && drift && !signal.dismissed && !tracking);
}

/**
 * The delay the measured drift implies at `positionSec`, anchored on the user's
 * most recent manual correction — their most trusted point. Clamped to the same
 * ±10s range the manual control uses, so the tracker can never leave the player
 * somewhere the user could not have reached by hand.
 */
export function videoCoreDriftDelaySec(
  drift: VideoCoreTimingDrift,
  positionSec: number,
): number {
  if (!Number.isFinite(positionSec)) return drift.anchorDelaySec;
  const projected = drift.anchorDelaySec
    + ((positionSec - drift.anchorPositionSec) * drift.msPerMinute) / 60_000;
  const bounded = Math.max(
    -VIDEO_CORE_TIMING_MAX_DELAY_SEC,
    Math.min(VIDEO_CORE_TIMING_MAX_DELAY_SEC, projected),
  );
  return Math.round(bounded * 1000) / 1000;
}

export function activeStudyCuesAtTime(
  cues: readonly VideoCoreStudyCue[],
  playbackTimeSec: number,
  subtitleDelaySec: number,
): VideoCoreStudyCue[] {
  const sourceTimeMs = (playbackTimeSec - subtitleDelaySec) * 1000;
  const active: VideoCoreStudyCue[] = [];
  for (const cue of cues) {
    if (cue.startMs > sourceTimeMs) break;
    if (sourceTimeMs < cue.endMs) active.push(cue);
  }
  return active;
}

export function clampStudyPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.25, Math.min(3, value));
}

function normalizeJapaneseDictation(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[\s、。！？!?・「」『』（）()[\]【】〈〉《》…‥ー.,'":;：；]/gu, '');
}

function editDistance(left: string[], right: string[]): number {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 0; row < left.length; row += 1) {
    const current = [row + 1];
    for (let column = 0; column < right.length; column += 1) {
      current[column + 1] = Math.min(
        current[column] + 1,
        previous[column + 1] + 1,
        previous[column] + (left[row] === right[column] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function evaluateVideoCoreDictation(
  answerValue: string,
  expectedValue: string,
): VideoCoreDictationEvaluation {
  const answer = normalizeJapaneseDictation(answerValue).slice(0, 500);
  const expected = normalizeJapaneseDictation(expectedValue).slice(0, 500);
  const longest = Math.max(answer.length, expected.length);
  const distance = editDistance([...answer], [...expected]);
  return {
    exact: !!expected && answer === expected,
    score: longest ? Math.max(0, Math.round((1 - distance / longest) * 100)) : 0,
    answer,
    expected,
  };
}

export function nextVideoCoreWhisperTrackNumber(
  trackNumbers: readonly number[],
): number {
  return Math.max(0, ...trackNumbers.filter(Number.isFinite)) + 1;
}

export function whisperCuesToVideoCoreEvents(
  cues: readonly VideoCoreWhisperCue[],
  trackNumber: number,
): VideoCoreWhisperEvent[] {
  return cues.flatMap((cue) => {
    const text = cue.text.trim();
    if (
      !text
      || !Number.isFinite(cue.start)
      || !Number.isFinite(cue.end)
      || cue.end <= cue.start
    ) {
      return [];
    }
    const startTime = Math.round(Math.max(0, cue.start) * 1000);
    const endTime = Math.round(Math.max(0, cue.end) * 1000);
    const duration = Math.max(1, endTime - startTime);
    return [{
      trackNumber,
      text,
      startTime,
      duration,
      codecID: 'S_TEXT/ASS' as const,
      extraData: {
        readorder: '0',
        layer: '0',
        style: 'Default',
        name: '',
        marginl: '0',
        marginr: '0',
        marginv: '0',
        effect: '',
      },
    }];
  });
}

function resumeText(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function videoCoreResumeKey(source: VideoCoreResumeSource): string {
  const localFilePath = resumeText(source.localFilePath)
    .replace(/\\/g, '/')
    .toLocaleLowerCase('en-US');
  if (localFilePath) return `file:${localFilePath}`;
  if (Number.isFinite(source.mediaId)) {
    const episode = Number.isFinite(source.episodeNumber)
      ? `:episode:${Math.round(source.episodeNumber as number)}`
      : '';
    return `media:${Math.round(source.mediaId as number)}${episode}`;
  }
  const streamPath = resumeText(source.streamPath);
  if (streamPath) return `stream:${streamPath}`;
  const playbackId = resumeText(source.playbackId, 240);
  return playbackId ? `playback:${playbackId}` : '';
}

export function normalizeVideoCoreResumePositions(
  value: unknown,
): VideoCoreResumePosition[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-VIDEO_CORE_RESUME_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Partial<VideoCoreResumePosition>;
    const key = resumeText(raw.key);
    if (
      !key
      || typeof raw.positionSec !== 'number'
      || !Number.isFinite(raw.positionSec)
      || typeof raw.updatedAt !== 'number'
      || !Number.isFinite(raw.updatedAt)
    ) return [];
    return [{
      key,
      positionSec: Math.max(0, Math.min(86_400, raw.positionSec)),
      updatedAt: Math.max(0, Math.round(raw.updatedAt)),
    }];
  });
}

export function upsertVideoCoreResumePosition(
  positions: readonly VideoCoreResumePosition[],
  entry: VideoCoreResumePosition,
): VideoCoreResumePosition[] {
  const normalized = normalizeVideoCoreResumePositions([entry])[0];
  if (!normalized) return normalizeVideoCoreResumePositions(positions);
  return [
    ...normalizeVideoCoreResumePositions(positions)
      .filter((position) => position.key !== normalized.key),
    normalized,
  ].slice(-VIDEO_CORE_RESUME_LIMIT);
}

export function resolveVideoCoreResumePosition(
  positions: readonly VideoCoreResumePosition[],
  key: string,
  durationSec?: number,
): number {
  const entry = normalizeVideoCoreResumePositions(positions)
    .find((position) => position.key === key);
  if (!entry || entry.positionSec < 1) return 0;
  if (
    typeof durationSec === 'number'
    && Number.isFinite(durationSec)
    && durationSec > 0
    && entry.positionSec >= durationSec - 5
  ) return 0;
  return entry.positionSec;
}

export function adjacentStudyCue(
  cues: readonly VideoCoreStudyCue[],
  currentSourceTimeMs: number,
  direction: -1 | 1,
): VideoCoreStudyCue | null {
  if (!cues.length) return null;
  let currentIndex = -1;
  for (let index = 0; index < cues.length; index += 1) {
    if (cues[index].startMs <= currentSourceTimeMs + 50) currentIndex = index;
    else break;
  }
  const target = Math.min(
    Math.max(currentIndex + direction, 0),
    cues.length - 1,
  );
  return cues[target] ?? null;
}

export function resolveStudyLoopSeekSec(
  currentTimeSec: number,
  activeCue: VideoCoreStudyCue | null,
  subtitleDelaySec: number,
  loop: VideoCoreStudyLoopState,
): number | null {
  if (
    loop.abLoop
    && loop.abStartSec != null
    && loop.abEndSec != null
    && loop.abEndSec > loop.abStartSec
    && currentTimeSec >= loop.abEndSec - 0.04
  ) {
    return loop.abStartSec;
  }
  if (
    loop.lineLoop
    && activeCue
    && currentTimeSec >= cuePlaybackEndSec(activeCue, subtitleDelaySec) - 0.04
  ) {
    return cuePlaybackStartSec(activeCue, subtitleDelaySec);
  }
  return null;
}

export function isCueEndTransition(
  currentTimeSec: number,
  cue: VideoCoreStudyCue,
  subtitleDelaySec: number,
  toleranceSec = 0.5,
): boolean {
  const end = cuePlaybackEndSec(cue, subtitleDelaySec);
  return currentTimeSec >= end - 0.3 && currentTimeSec <= end + toleranceSec;
}

/**
 * Study cues for a track the player renders but never *indexes*.
 *
 * `VideoCoreSubtitleManager` keeps two kinds of subtitle track and only one of them
 * reaches the study layer. An **event track** (the container's own muxed streams, and
 * anything mounted through `addEventTrack`/`onSubtitleEvents`) lands in the manager's
 * event cache, which is the only thing its cue index is built from. A **file track** —
 * every `playbackInfo.subtitleTracks` entry with `useLibassRenderer`, numbered from 1000
 * up — is handed to libass as ASS *text* and cached on the track, never as events. So
 * `getCues()` and `getActiveCues()` both return `[]` for it forever, and every study
 * surface downstream reads that as "this file has no subtitles": the cue line stays on
 * `Waiting for subtitle` while the very same lines are painted on the video by libass.
 *
 * The manager exposes the cached ASS through `getTrackContent(n)`, so the missing half is
 * a parse, not a fetch. `parseStudySubtitles` rather than `parseSubtitles` for the same
 * reason the external-mount path uses it: this is the PRIMARY study track, the one the
 * transcript, the analyser and every mined card read, so a dual-script `.ass` must not
 * feed its non-Japanese half into mining. That split is inert on `.srt`/`.vtt` and on any
 * single-script `.ass`, which is the common case here.
 *
 * Timing is normalised to the same `startMs`/`endMs` the event path produces, so
 * `activeStudyCuesAtTime` and every consumer of `VideoCoreStudyCue` work unchanged.
 */
export function studyCuesFromParsedCues(
  cues: readonly VideoCoreWhisperCue[],
  trackNumber: number,
): VideoCoreStudyCue[] {
  const usable: VideoCoreStudyCue[] = [];
  for (const cue of cues) {
    const text = cue.text.trim();
    if (
      !text
      || !Number.isFinite(cue.start)
      || !Number.isFinite(cue.end)
      || cue.end <= cue.start
    ) {
      continue;
    }
    usable.push({
      index: 0,
      trackNumber,
      text,
      startMs: Math.round(Math.max(0, cue.start) * 1000),
      endMs: Math.round(Math.max(0, cue.end) * 1000),
    });
  }
  usable.sort((left, right) => left.startMs - right.startMs);
  usable.forEach((cue, index) => { cue.index = index; });
  return usable;
}
