/**
 * The study player's one cue clock: which line the study tools are on, and the precise
 * end-of-line actions (auto-pause, line loop, A-B loop) — for every subtitle source.
 *
 * ## What it replaces
 *
 * Three activation paths feed the overlay (the subtitle manager's `cuechange` for event
 * tracks, a `timeupdate` parse for libass file tracks, and the MediaCaptions branch for
 * sidecars). Auto-pause lived in the FIRST one only, as "the cue list went empty right after
 * a cue ended", so it never fired for a sidecar or an ASS file track — the common case —
 * and never between back-to-back lines, where the list is never empty. The line and A-B
 * loops polled `timeupdate`, which fires about every 250 ms: the loop overshot the line by
 * up to a quarter second, replaying the first syllable of the NEXT line every time.
 *
 * This works off the selected track's whole cue list instead, which all three paths
 * already produce, so the behaviour is the same whichever path is driving.
 *
 * ## How it stays precise without per-frame work
 *
 * While playing, one timer is armed for the next boundary that matters (the end of the
 * spoken stretch, the A-B end, or the next line's start), scaled by `playbackRate`. When
 * it fires the media clock is read again: a timer that fired early re-arms for the
 * remainder, so the action lands within {@link STUDY_CLOCK_EARLY_SEC} of the boundary
 * rather than within a `timeupdate` interval. `timeupdate`, `seeked`, `play`, `pause` and
 * `ratechange` re-plan, which also covers a throttled timer: an armed action whose moment
 * has passed is still carried out on the next re-plan. Nothing here touches React — the
 * overlay hears about a new study line only when the line changes.
 */
import {
  activeCueGroupEndSec,
  cuePlaybackEndSec,
  cuePlaybackStartSec,
  nextCueStartSec,
  sameStudyCue,
  studyCueAt,
  type VideoCoreStudyCue,
} from '../shared/videoCoreStudy';

/** How early an end-of-line action may fire. Small enough that no word is clipped. */
export const STUDY_CLOCK_EARLY_SEC = 0.015;

/** A timer that fires this little before its moment counts as on time. */
const ON_TIME_SEC = 0.004;

/** An armed action this far past its moment without a seek is stale, not late. */
const STALE_AFTER_SEC = 1;

/** The slice of an `HTMLVideoElement` the clock reads. */
export interface StudyClockVideo {
  readonly currentTime: number;
  readonly paused: boolean;
  readonly playbackRate: number;
  readonly seeking?: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface StudyCueClockMode {
  autoPause: boolean;
  lineLoop: boolean;
  /** A-B loop bounds in playback seconds, when the loop is on. */
  ab: { startSec: number; endSec: number } | null;
}

export interface StudyCueClockTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface StudyCueClockOptions {
  video: StudyClockVideo;
  getCues(): readonly VideoCoreStudyCue[];
  getDelaySec(): number;
  getMode(): StudyCueClockMode;
  /** The study line changed (the active line, or the line just heard). */
  onStudyCue(cue: VideoCoreStudyCue | null): void;
  /** Stop at the end of `cue` (auto-pause). The caller pauses the element. */
  pause(cue: VideoCoreStudyCue): void;
  /** Jump back for a loop. The caller seeks and keeps playing. */
  seek(targetSec: number, reason: 'line' | 'ab'): void;
  timers?: StudyCueClockTimers;
}

export interface StudyCueClock {
  /** Re-read cues / delay / mode and re-plan. Call after any of them change. */
  refresh(): void;
  /** The current study line. */
  current(): VideoCoreStudyCue | null;
  dispose(): void;
}

type Target =
  | { sec: number; action: 'wake' }
  | { sec: number; action: 'pause'; cue: VideoCoreStudyCue; groupEndSec: number }
  | { sec: number; action: 'line'; cue: VideoCoreStudyCue; toSec: number }
  | { sec: number; action: 'ab'; toSec: number };

const VIDEO_EVENTS = ['timeupdate', 'seeked', 'play', 'playing', 'pause', 'ratechange', 'loadeddata'] as const;

export function createStudyCueClock(options: StudyCueClockOptions): StudyCueClock {
  const timers: StudyCueClockTimers = options.timers ?? {
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
  const { video } = options;
  let disposed = false;
  let timer: unknown = null;
  let armed: Target | null = null;
  let studyCue: VideoCoreStudyCue | null = null;
  /** False from a seek until a line is active again — see `studyCueAt`'s `linger`. */
  let linger = true;
  /**
   * The line a line-loop is holding. Its own seek back lands on the start frame, which can
   * read a hair before the cue's start; without the pin the loop would let go of the line.
   */
  let pinned: VideoCoreStudyCue | null = null;
  /**
   * The boundary auto-pause last stopped at. Resuming from a pause that landed a few
   * milliseconds BEFORE the end would otherwise stop again at once; a seek clears it.
   */
  let handledPauseSec: number | null = null;
  /** Where our own loop seek is going, so its `seeked` is not mistaken for the user's. */
  let ownSeekSec: number | null = null;

  const clearTimer = (): void => {
    if (timer != null) timers.clearTimeout(timer);
    timer = null;
  };

  const publish = (next: VideoCoreStudyCue | null): void => {
    if (sameStudyCue(next, studyCue)) return;
    studyCue = next;
    options.onStudyCue(next);
  };

  const validAb = (mode: StudyCueClockMode): StudyCueClockMode['ab'] =>
    (mode.ab && mode.ab.endSec > mode.ab.startSec ? mode.ab : null);

  const execute = (target: Target): boolean => {
    switch (target.action) {
      case 'ab':
        handledPauseSec = null;
        ownSeekSec = target.toSec;
        options.seek(target.toSec, 'ab');
        return true;
      case 'line':
        handledPauseSec = null;
        pinned = target.cue;
        ownSeekSec = target.toSec;
        options.seek(target.toSec, 'line');
        return true;
      case 'pause':
        handledPauseSec = target.groupEndSec;
        options.pause(target.cue);
        return true;
      default:
        return false;
    }
  };

  const handled = (groupEndSec: number): boolean =>
    handledPauseSec != null && Math.abs(handledPauseSec - groupEndSec) <= 0.001;

  /** Whether an armed action is still enabled by the current mode. */
  const stillWanted = (target: Target, mode: StudyCueClockMode): boolean => {
    switch (target.action) {
      case 'pause':
        return mode.autoPause && !mode.lineLoop;
      case 'line':
        return mode.lineLoop;
      case 'ab': {
        const ab = validAb(mode);
        return !!ab && Math.abs(ab.startSec - target.toSec) <= 0.001;
      }
      default:
        return true;
    }
  };

  /** Something due right now (a loop toggled on after its line ended, say). */
  const dueNow = (timeSec: number, mode: StudyCueClockMode): Target | null => {
    const delay = options.getDelaySec();
    const ab = validAb(mode);
    if (ab && timeSec >= ab.endSec - STUDY_CLOCK_EARLY_SEC) {
      return { sec: timeSec, action: 'ab', toSec: ab.startSec };
    }
    if (mode.lineLoop) {
      if (studyCue && timeSec >= cuePlaybackEndSec(studyCue, delay) - STUDY_CLOCK_EARLY_SEC) {
        return {
          sec: timeSec,
          action: 'line',
          cue: studyCue,
          toSec: cuePlaybackStartSec(studyCue, delay),
        };
      }
      return null;
    }
    if (mode.autoPause && studyCue) {
      const groupEnd = activeCueGroupEndSec(options.getCues(), timeSec, delay);
      if (groupEnd != null && timeSec >= groupEnd - STUDY_CLOCK_EARLY_SEC && !handled(groupEnd)) {
        return { sec: timeSec, action: 'pause', cue: studyCue, groupEndSec: groupEnd };
      }
    }
    return null;
  };

  /** The next moment worth waking for. */
  const nextTarget = (timeSec: number, mode: StudyCueClockMode): Target | null => {
    const cues = options.getCues();
    const delay = options.getDelaySec();
    const candidates: Target[] = [];
    const ab = validAb(mode);
    if (ab && ab.endSec > timeSec) {
      candidates.push({ sec: ab.endSec - STUDY_CLOCK_EARLY_SEC, action: 'ab', toSec: ab.startSec });
    }
    if (mode.lineLoop && studyCue) {
      candidates.push({
        sec: cuePlaybackEndSec(studyCue, delay) - STUDY_CLOCK_EARLY_SEC,
        action: 'line',
        cue: studyCue,
        toSec: cuePlaybackStartSec(studyCue, delay),
      });
    }
    const groupEnd = activeCueGroupEndSec(cues, timeSec, delay);
    if (groupEnd != null) {
      candidates.push(mode.autoPause && !mode.lineLoop && !handled(groupEnd) && studyCue
        ? { sec: groupEnd - STUDY_CLOCK_EARLY_SEC, action: 'pause', cue: studyCue, groupEndSec: groupEnd }
        : { sec: groupEnd, action: 'wake' });
    }
    const nextStart = nextCueStartSec(cues, timeSec, delay);
    if (nextStart != null) candidates.push({ sec: nextStart, action: 'wake' });
    let best: Target | null = null;
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate.sec)) continue;
      if (
        !best
        || candidate.sec < best.sec
        || (candidate.sec === best.sec && best.action === 'wake' && candidate.action !== 'wake')
      ) {
        best = candidate;
      }
    }
    return best;
  };

  const resolveStudyCue = (timeSec: number, mode: StudyCueClockMode): VideoCoreStudyCue | null => {
    const delay = options.getDelaySec();
    if (pinned) {
      const startSec = cuePlaybackStartSec(pinned, delay);
      const endSec = cuePlaybackEndSec(pinned, delay);
      if (mode.lineLoop && timeSec >= startSec - 0.5 && timeSec <= endSec + 0.5) return pinned;
      pinned = null;
    }
    const next = studyCueAt(options.getCues(), timeSec, delay, { linger });
    if (next) linger = true;
    return next;
  };

  const plan = (): void => {
    if (disposed) return;
    clearTimer();
    const timeSec = video.currentTime;
    const mode = options.getMode();
    publish(resolveStudyCue(timeSec, mode));
    if (video.paused || video.seeking || !options.getCues().length) {
      armed = null;
      return;
    }
    const previous = armed;
    armed = null;
    if (
      previous
      && previous.action !== 'wake'
      // Armed under the mode as it WAS: a pause or loop queued before the switch was
      // turned off must not fire after it.
      && stillWanted(previous, mode)
      && timeSec >= previous.sec - ON_TIME_SEC
      && timeSec - previous.sec < STALE_AFTER_SEC
      && execute(previous)
    ) return;
    const due = dueNow(timeSec, mode);
    if (due && execute(due)) return;
    const target = nextTarget(timeSec, mode);
    if (!target) return;
    armed = target;
    const rate = video.playbackRate > 0 ? video.playbackRate : 1;
    const waitMs = Math.max(0, ((target.sec - timeSec) / rate) * 1000);
    timer = timers.setTimeout(() => {
      timer = null;
      plan();
    }, Math.min(waitMs, 60_000));
  };

  const onSeeked = (): void => {
    const own = ownSeekSec != null && Math.abs(video.currentTime - ownSeekSec) <= 0.3;
    ownSeekSec = null;
    if (!own) {
      linger = false;
      pinned = null;
    }
    handledPauseSec = null;
    armed = null;
    plan();
  };

  const listeners = new Map<string, () => void>();
  for (const type of VIDEO_EVENTS) {
    const listener = type === 'seeked' ? onSeeked : plan;
    listeners.set(type, listener);
    video.addEventListener(type, listener);
  }
  plan();

  return {
    refresh: plan,
    current: () => studyCue,
    dispose: () => {
      disposed = true;
      clearTimer();
      armed = null;
      for (const [type, listener] of listeners) video.removeEventListener(type, listener);
      listeners.clear();
    },
  };
}
