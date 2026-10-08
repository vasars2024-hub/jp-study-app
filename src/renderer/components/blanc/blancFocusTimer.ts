/**
 * Blanc's focus timer, held outside React.
 *
 * The timer used to be component state inside its tool panel, decremented once
 * per `setInterval` tick. The toolbox mounts only the active tool, so opening
 * any other tool unmounted the panel and the timer simply stopped; and a
 * tick-counting countdown drifts whenever the window is throttled. Now the
 * running timer is a deadline (countdown) or a start time (stopwatch) in this
 * module, the display derives the time from `Date.now()`, and completion is one
 * timeout at the deadline — so it survives switching tools and stays exact.
 */

export type FocusTimerMode = 'countdown' | 'stopwatch';

export interface FocusTimerState {
  mode: FocusTimerMode;
  /** Countdown length chosen by the user, in minutes. */
  minutes: number;
  running: boolean;
  /** Countdown: epoch ms at which it ends (running only). */
  deadline: number | null;
  /** Stopwatch: epoch ms it (re)started from (running only). */
  startedAt: number | null;
  /**
   * Time banked while paused: remaining ms for a countdown, elapsed ms for a
   * stopwatch.
   */
  bankedMs: number;
  laps: number[];
  /** Announce completion with a toast. */
  notify: boolean;
  /** Set when a countdown reached zero since the last reset/start. */
  finishedAt: number | null;
}

type Listener = (state: FocusTimerState) => void;

const listeners = new Set<Listener>();
let finishTimer: ReturnType<typeof setTimeout> | null = null;
let onFinish: (() => void) | null = null;

let state: FocusTimerState = {
  mode: 'countdown',
  minutes: 25,
  running: false,
  deadline: null,
  startedAt: null,
  bankedMs: 25 * 60_000,
  laps: [],
  notify: true,
  finishedAt: null,
};

function emit(next: FocusTimerState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

function clearFinishTimer(): void {
  if (finishTimer !== null) clearTimeout(finishTimer);
  finishTimer = null;
}

function armFinishTimer(): void {
  clearFinishTimer();
  if (!state.running || state.mode !== 'countdown' || state.deadline === null) return;
  finishTimer = setTimeout(() => {
    finishTimer = null;
    if (!state.running || state.mode !== 'countdown') return;
    emit({ ...state, running: false, deadline: null, bankedMs: 0, finishedAt: Date.now() });
    if (state.notify) onFinish?.();
  }, Math.max(0, state.deadline - Date.now()));
}

export function getFocusTimer(): FocusTimerState {
  return state;
}

export function subscribeFocusTimer(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What the completion notice does (the shell supplies a translated toast). */
export function setFocusTimerFinishHandler(handler: (() => void) | null): void {
  onFinish = handler;
}

/** Seconds to show right now: remaining for a countdown, elapsed for a stopwatch. */
export function focusTimerSeconds(current: FocusTimerState = state, now = Date.now()): number {
  if (current.mode === 'countdown') {
    const ms = current.running && current.deadline !== null ? current.deadline - now : current.bankedMs;
    return Math.max(0, Math.ceil(ms / 1000));
  }
  const ms = current.running && current.startedAt !== null ? now - current.startedAt + current.bankedMs : current.bankedMs;
  return Math.max(0, Math.floor(ms / 1000));
}

/** True when the timer has something worth showing outside its own panel. */
export function focusTimerActive(current: FocusTimerState = state): boolean {
  if (current.running) return true;
  return current.mode === 'countdown'
    ? current.bankedMs !== current.minutes * 60_000 && current.bankedMs > 0
    : current.bankedMs > 0;
}

export function startFocusTimer(now = Date.now()): void {
  if (state.running) return;
  if (state.mode === 'countdown') {
    const remaining = state.bankedMs > 0 ? state.bankedMs : state.minutes * 60_000;
    emit({ ...state, running: true, deadline: now + remaining, startedAt: null, bankedMs: remaining, finishedAt: null });
  } else {
    emit({ ...state, running: true, startedAt: now, deadline: null, finishedAt: null });
  }
  armFinishTimer();
}

export function pauseFocusTimer(now = Date.now()): void {
  if (!state.running) return;
  clearFinishTimer();
  if (state.mode === 'countdown') {
    emit({ ...state, running: false, bankedMs: Math.max(0, (state.deadline ?? now) - now), deadline: null });
  } else {
    emit({ ...state, running: false, bankedMs: state.bankedMs + (now - (state.startedAt ?? now)), startedAt: null });
  }
}

export function toggleFocusTimer(): void {
  if (state.running) pauseFocusTimer();
  else startFocusTimer();
}

export function resetFocusTimer(): void {
  clearFinishTimer();
  emit({
    ...state,
    running: false,
    deadline: null,
    startedAt: null,
    bankedMs: state.mode === 'countdown' ? state.minutes * 60_000 : 0,
    laps: [],
    finishedAt: null,
  });
}

export function setFocusTimerMode(mode: FocusTimerMode): void {
  clearFinishTimer();
  emit({
    ...state,
    mode,
    running: false,
    deadline: null,
    startedAt: null,
    bankedMs: mode === 'countdown' ? state.minutes * 60_000 : 0,
    laps: [],
    finishedAt: null,
  });
}

export function setFocusTimerMinutes(minutes: number): void {
  const safe = Math.max(1, Math.min(240, Math.round(minutes) || 1));
  if (state.running) {
    emit({ ...state, minutes: safe });
    return;
  }
  emit({ ...state, minutes: safe, bankedMs: state.mode === 'countdown' ? safe * 60_000 : state.bankedMs, laps: [], finishedAt: null });
}

export function recordFocusTimerLap(): void {
  emit({ ...state, laps: [focusTimerSeconds(), ...state.laps].slice(0, 8) });
}

export function setFocusTimerNotify(notify: boolean): void {
  emit({ ...state, notify });
}

/** Test seam: back to defaults with no timer armed. */
export function resetFocusTimerForTests(): void {
  clearFinishTimer();
  onFinish = null;
  listeners.clear();
  state = {
    mode: 'countdown',
    minutes: 25,
    running: false,
    deadline: null,
    startedAt: null,
    bankedMs: 25 * 60_000,
    laps: [],
    notify: true,
    finishedAt: null,
  };
}
