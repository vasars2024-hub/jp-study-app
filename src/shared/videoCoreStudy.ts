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

export const PLAYER_PREFERENCES_STORAGE_KEY = 'jp-media-player-preferences-v1';
export const VIDEO_CORE_RESUME_STORAGE_KEY = 'jp-video-core-resume-v1';
export const VIDEO_CORE_RESUME_LIMIT = 100;

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

export function cuePlaybackEndSec(
  cue: Pick<VideoCoreStudyCue, 'endMs'>,
  subtitleDelaySec: number,
): number {
  return Math.max(0, cue.endMs / 1000 + subtitleDelaySec);
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
