/**
 * Timer state for the Pomodoro, Stopwatch and Countdown widgets, kept OUTSIDE
 * the widget bodies.
 *
 * The bodies used to hold their clocks in `useState`, and `WidgetFrame`
 * unmounts the body when a widget is collapsed — so collapsing a running
 * Pomodoro threw it away and expanding it showed a fresh 25:00. Here each
 * widget instance (keyed by its `WidgetSnapshot.id`) has one entry in a
 * module-level store, times are wall-clock based (`startedAt` + accumulated
 * `baseMs`, never a decrementing counter), and one shared ticker notices a
 * finished countdown even while nothing is mounted to render it, so the
 * "done" chime plays whether the widget is open, collapsed or on another
 * desktop.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { soundEngine } from '../audio/soundEngine';

export type TimerKind = 'pomodoro' | 'stopwatch' | 'countdown';
export type PomodoroPhase = 'work' | 'break';

export interface TimerState {
  kind: TimerKind;
  running: boolean;
  /** Epoch ms the current run started; null while paused/idle. */
  startedAt: number | null;
  /** Milliseconds counted before `startedAt` in the current phase. */
  baseMs: number;
  /** Length of the current phase (countdown/pomodoro); 0 for the stopwatch. */
  durationMs: number;
  /** Pomodoro only. */
  phase: PomodoroPhase;
  /** Epoch ms the countdown last reached zero; cleared by start/reset. */
  finishedAt: number | null;
}

export function idleTimer(kind: TimerKind, durationMs = 0): TimerState {
  return { kind, running: false, startedAt: null, baseMs: 0, durationMs, phase: 'work', finishedAt: null };
}

export function timerElapsedMs(state: TimerState, now = Date.now()): number {
  return state.baseMs + (state.running && state.startedAt !== null ? Math.max(0, now - state.startedAt) : 0);
}

export function timerRemainingMs(state: TimerState, now = Date.now()): number {
  return Math.max(0, state.durationMs - timerElapsedMs(state, now));
}

export function startTimer(state: TimerState, now = Date.now()): TimerState {
  if (state.running) return state;
  // Starting a finished countdown starts it over rather than finishing again instantly.
  const base = state.finishedAt !== null ? 0 : state.baseMs;
  return { ...state, running: true, startedAt: now, baseMs: base, finishedAt: null };
}

export function pauseTimer(state: TimerState, now = Date.now()): TimerState {
  if (!state.running) return state;
  return { ...state, running: false, startedAt: null, baseMs: timerElapsedMs(state, now) };
}

export function resetTimer(state: TimerState, durationMs = state.durationMs): TimerState {
  return { ...state, running: false, startedAt: null, baseMs: 0, durationMs, finishedAt: null };
}

/** Apply settings while idle or finished, preserving running and paused progress. */
export function withDuration(state: TimerState, durationMs: number): TimerState {
  if (state.running || state.durationMs === durationMs) return state;
  if (state.finishedAt !== null) return resetTimer(state, durationMs);
  if (state.baseMs > 0) return state;
  return { ...state, durationMs };
}

/**
 * Settle a running countdown/pomodoro whose time is up. Returns the next state
 * and whether it just finished. A finished pomodoro phase flips to the other
 * phase (with `nextPhaseMs`) and stops, which is what the widget always did.
 */
export function settleTimer(
  state: TimerState,
  now = Date.now(),
  nextPhaseMs?: number,
): { state: TimerState; finished: boolean } {
  if (!state.running || state.kind === 'stopwatch' || state.durationMs <= 0) return { state, finished: false };
  if (timerElapsedMs(state, now) < state.durationMs) return { state, finished: false };
  if (state.kind === 'pomodoro') {
    const phase: PomodoroPhase = state.phase === 'work' ? 'break' : 'work';
    return {
      state: { ...state, running: false, startedAt: null, baseMs: 0, phase, durationMs: nextPhaseMs ?? state.durationMs, finishedAt: null },
      finished: true,
    };
  }
  return {
    state: { ...state, running: false, startedAt: null, baseMs: state.durationMs, finishedAt: now },
    finished: true,
  };
}

// ── store ────────────────────────────────────────────────────────────────────

interface Entry {
  state: TimerState;
  /** Pomodoro: the other phase's length, read when a phase ends. */
  phaseMs?: Record<PomodoroPhase, number>;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
let ticker: ReturnType<typeof setInterval> | null = null;

/** Chime for a finished timer. Replaceable for tests. */
let onFinished: (kind: TimerKind) => void = playTimerDoneChime;

export function setTimerFinishedHandler(handler: (kind: TimerKind) => void): () => void {
  const previous = onFinished;
  onFinished = handler;
  return () => {
    onFinished = previous;
  };
}

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

function anyCountingDown(): boolean {
  for (const { state } of entries.values()) {
    if (state.running && state.kind !== 'stopwatch') return true;
  }
  return false;
}

/** Check every running timer once. Exported for tests; the ticker calls it. */
export function tickTimers(now = Date.now()): void {
  let changed = false;
  for (const [id, entry] of entries) {
    const nextPhaseMs =
      entry.state.kind === 'pomodoro' && entry.phaseMs
        ? entry.phaseMs[entry.state.phase === 'work' ? 'break' : 'work']
        : undefined;
    const { state, finished } = settleTimer(entry.state, now, nextPhaseMs);
    if (finished) {
      entries.set(id, { ...entry, state });
      changed = true;
      try {
        onFinished(state.kind);
      } catch {
        /* a failed chime must not stop the other timers */
      }
    }
  }
  if (changed) emit();
  syncTicker();
}

function syncTicker(): void {
  const need = anyCountingDown();
  if (need && ticker === null) ticker = setInterval(() => tickTimers(), 250);
  else if (!need && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

export function getTimer(id: string): TimerState | undefined {
  return entries.get(id)?.state;
}

export function setTimer(id: string, state: TimerState, phaseMs?: Record<PomodoroPhase, number>): void {
  const prev = entries.get(id);
  entries.set(id, { state, phaseMs: phaseMs ?? prev?.phaseMs });
  emit();
  syncTicker();
}

/** Forget a removed widget's timer. */
export function clearTimer(id: string): void {
  if (entries.delete(id)) {
    emit();
    syncTicker();
  }
}

/** Test seam. */
export function resetTimerStoreForTests(): void {
  entries.clear();
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
  onFinished = playTimerDoneChime;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Three rising tones through the app's sound engine, so the master mute, the
 * sound on/off switch, the volume sliders and reduced-sensory mode all apply.
 * Synthesised because the default sound pack is silent by design.
 */
export function playTimerDoneChime(): void {
  const notes = [880, 1175, 1568];
  notes.forEach((freq, i) => {
    setTimeout(() => soundEngine.playTone('notification', { freq, durationMs: 260, volume: 0.32 }), i * 180);
  });
}

/**
 * Create the audio context during the Start click, so a chime 25 minutes later
 * is not refused as audio without a user gesture. A zero-volume tone plays nothing.
 */
function primeAudio(): void {
  try {
    soundEngine.playTone('notification', { volume: 0 });
  } catch {
    /* no audio in this context */
  }
}

let anonCounter = 0;

export interface TimerHandle {
  state: TimerState;
  now: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Replace the state outright (pomodoro phase switch while idle). */
  set: (next: TimerState) => void;
}

/**
 * Bind a widget body to its timer. `id` is the widget instance id; a body
 * rendered without one (a gallery preview) gets a private id and simply does
 * not survive its own unmount, which is all a preview needs.
 */
export function useWidgetTimer(
  id: string | undefined,
  kind: TimerKind,
  durationMs: number,
  phaseMs?: Record<PomodoroPhase, number>,
): TimerHandle {
  const [anonId] = useState(() => `anon-${(anonCounter += 1)}`);
  const key = id ?? anonId;
  useSyncExternalStore(subscribe, () => version, () => version);
  const existing = getTimer(key);
  const phase = existing && existing.kind === kind ? existing.phase : 'work';
  // A pomodoro's length is the current phase's; the others take `durationMs` as given.
  const dur = kind === 'pomodoro' && phaseMs ? phaseMs[phase] : durationMs;
  const state = existing && existing.kind === kind ? existing : idleTimer(kind, dur);

  // Settings changes (minutes) reach an idle timer; a running one keeps its length.
  const phaseWork = phaseMs?.work;
  const phaseBreak = phaseMs?.break;
  useEffect(() => {
    const cur = getTimer(key);
    const base = cur && cur.kind === kind ? cur : idleTimer(kind, dur);
    const next = withDuration(base, dur);
    const phases = phaseWork !== undefined && phaseBreak !== undefined ? { work: phaseWork, break: phaseBreak } : undefined;
    if (next !== cur || phases) setTimer(key, next, phases);
  }, [key, kind, dur, phaseWork, phaseBreak]);

  // Repaint while running; the store itself does not tick for display.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.running) return undefined;
    const handle = setInterval(() => setNow(Date.now()), kind === 'stopwatch' ? 50 : 250);
    return () => clearInterval(handle);
  }, [state.running, kind]);

  const start = useCallback(() => {
    primeAudio();
    setTimer(key, startTimer(getTimer(key) ?? idleTimer(kind, dur), Date.now()));
    setNow(Date.now());
  }, [key, kind, dur]);
  const pause = useCallback(() => {
    const pausedAt = Date.now();
    // A click can arrive after the deadline but before the completion ticker.
    // Settle first so pausing cannot suppress the chime or the next phase.
    tickTimers(pausedAt);
    setTimer(key, pauseTimer(getTimer(key) ?? idleTimer(kind, dur), pausedAt));
    setNow(pausedAt);
  }, [key, kind, dur]);
  const reset = useCallback(() => {
    setTimer(key, resetTimer(getTimer(key) ?? idleTimer(kind, dur), dur));
    setNow(Date.now());
  }, [key, kind, dur]);
  const set = useCallback((next: TimerState) => setTimer(key, next), [key]);

  return { state, now: state.running ? Math.max(now, Date.now()) : now, start, pause, reset, set };
}
