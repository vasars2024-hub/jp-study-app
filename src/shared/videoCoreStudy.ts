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
  dictationMode: boolean;
  subtitleFontSize: number;
  [key: string]: unknown;
}

export interface VideoCoreDictationEvaluation {
  exact: boolean;
  score: number;
  answer: string;
  expected: string;
}

export const PLAYER_PREFERENCES_STORAGE_KEY = 'jp-media-player-preferences-v1';

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
    dictationMode: raw.dictationMode === true,
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
