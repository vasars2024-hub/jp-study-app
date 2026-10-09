/**
 * Soundscape during focus (snd2).
 *
 * The mixer used to be an island: nothing started it when a Pomodoro work block
 * began or Focus Mode came on, and nothing stopped it for the break. This is
 * that link, opt-in and conservative:
 *
 *  - When focus starts (a Pomodoro WORK block is running, and/or Focus Mode is
 *    on — each a separate switch) and the mixer is silent, it plays the chosen
 *    scene, or the current mix when no scene is chosen.
 *  - It only ever stops what IT started. A soundscape the user started by hand
 *    plays through focus and break alike; pausing it by hand hands control back.
 *  - When the work block ends (the break) it fades out slowly, if asked to;
 *    leaving Focus Mode fades it out quickly.
 *  - Seconds of focus spent with the soundscape playing are tallied per local
 *    day, so the widget can say how much of today's focus it accompanied. The
 *    study statistics have no focus-time metric to add this to, and adding
 *    ambient sound to "study time" would overstate it, so it is kept here.
 */
import { onFocusModeChanged, loadFocusMode } from '../focusMode';
import { isPomodoroOnBreak, isPomodoroWorkRunning, onTimersChanged } from '../widgets/timerStore';
import { writeLocalStorageJson } from '../localStorageWrite';
import { fadeOutSoundscape, isSoundscapePlaying, startSoundscape, subscribeSoundscape } from './soundscapeStore';

export interface FocusSoundscapeSettings {
  /** Master switch for the whole link. Off by default: sound must be asked for. */
  enabled: boolean;
  /** Built-in scene or saved mix id; '' plays whatever the mixer is set to. */
  sceneId: string;
  /** Follow Pomodoro work blocks. */
  withPomodoro: boolean;
  /** Follow Focus Mode. */
  withFocusMode: boolean;
  /** Fade out when a work block ends (the break). */
  fadeOnBreak: boolean;
}

export const FOCUS_SOUNDSCAPE_KEY = 'jp-soundscape-focus-v1';
const TALLY_KEY = 'jp-soundscape-focus-tally-v1';
const EVENT = 'jp-soundscape-focus-changed';
/** The break fade is long on purpose: the end of a block should not feel like a cut. */
export const BREAK_FADE_SECONDS = 6;
export const EXIT_FADE_SECONDS = 2;

const DEFAULTS: FocusSoundscapeSettings = {
  enabled: false,
  sceneId: '',
  withPomodoro: true,
  withFocusMode: true,
  fadeOnBreak: true,
};

export function loadFocusSoundscape(): FocusSoundscapeSettings {
  try {
    const raw = localStorage.getItem(FOCUS_SOUNDSCAPE_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<FocusSoundscapeSettings>;
    return {
      enabled: p.enabled === true,
      sceneId: typeof p.sceneId === 'string' ? p.sceneId.slice(0, 80) : '',
      withPomodoro: p.withPomodoro !== false,
      withFocusMode: p.withFocusMode !== false,
      fadeOnBreak: p.fadeOnBreak !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFocusSoundscape(patch: Partial<FocusSoundscapeSettings>): FocusSoundscapeSettings {
  const next = { ...loadFocusSoundscape(), ...patch };
  writeLocalStorageJson(FOCUS_SOUNDSCAPE_KEY, next);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  // Turning the link on mid-block should act now, not at the next block —
  // in the window that owns the link; another window hears it via `storage`.
  if (installed) sync('settings');
  return next;
}

export function onFocusSoundscapeChanged(cb: (s: FocusSoundscapeSettings) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<FocusSoundscapeSettings>).detail ?? loadFocusSoundscape());
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// ---- focus-with-sound tally --------------------------------------------------

function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadTally(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TALLY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Seconds of focus spent with the soundscape playing on the given local day. */
export function focusSoundSecondsOn(at: number = Date.now()): number {
  const value = loadTally()[dayKey(at)];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function addTally(seconds: number, at: number): void {
  if (!(seconds > 0)) return;
  const tally = loadTally();
  const key = dayKey(at);
  tally[key] = Math.round((tally[key] ?? 0) + seconds);
  // Keep a fortnight; this is a "today" readout, not a history.
  const keep = Object.keys(tally).sort().slice(-14);
  writeLocalStorageJson(TALLY_KEY, Object.fromEntries(keep.map((k) => [k, tally[k]])));
}

// ---- the link ------------------------------------------------------------------

let installed = false;
let autoStarted = false;
let focusMode = false;
let wasActive = false;
/** Start of the current focus-with-sound stretch, for the tally. */
let accompaniedSince: number | null = null;

function focusActive(s: FocusSoundscapeSettings): boolean {
  return (s.withPomodoro && isPomodoroWorkRunning()) || (s.withFocusMode && focusMode);
}

function settleTally(now: number): void {
  if (accompaniedSince === null) return;
  // A stretch across midnight is credited to the day it ends on: good enough
  // for a "today" readout, and never double-counted.
  addTally((now - accompaniedSince) / 1000, now);
  accompaniedSince = null;
}

function syncTally(active: boolean, now: number): void {
  const accompanied = active && isSoundscapePlaying();
  if (accompanied && accompaniedSince === null) accompaniedSince = now;
  if (!accompanied) settleTally(now);
}

type Reason = 'pomodoro' | 'focus-mode' | 'settings' | 'mixer';

function sync(reason: Reason, now: number = Date.now()): void {
  const s = loadFocusSoundscape();
  const active = s.enabled && focusActive(s);
  if (active && !wasActive && !isSoundscapePlaying()) {
    autoStarted = startSoundscape(s.sceneId || undefined);
  } else if (!active && wasActive && autoStarted) {
    if (reason === 'pomodoro') {
      // The block ended (break) or was paused/reset. "Fade on break" off means
      // the sound carries on until the user stops it.
      if (s.fadeOnBreak) {
        fadeOutSoundscape(isPomodoroOnBreak() ? BREAK_FADE_SECONDS : EXIT_FADE_SECONDS);
        autoStarted = false;
      }
    } else {
      // Focus Mode left, or the link switched off: a quick fade.
      fadeOutSoundscape(EXIT_FADE_SECONDS);
      autoStarted = false;
    }
  }
  wasActive = active;
  syncTally(active, now);
}

/** Main window only (main.tsx); idempotent. Returns an uninstall for tests. */
export function installFocusSoundscape(): () => void {
  if (installed) return () => undefined;
  installed = true;
  focusMode = loadFocusMode();
  wasActive = false;
  const offTimers = onTimersChanged(() => sync('pomodoro'));
  const offFocus = onFocusModeChanged((on) => {
    focusMode = on;
    sync('focus-mode');
  });
  // The user pausing by hand takes the sound back from the link.
  const offMixer = subscribeSoundscape((snap) => {
    if (!snap.playing) autoStarted = false;
    syncTally(wasActive, Date.now());
  });
  const onUnload = (): void => settleTally(Date.now());
  const onStorage = (event: StorageEvent): void => {
    if (event.key === FOCUS_SOUNDSCAPE_KEY) sync('settings');
  };
  window.addEventListener('beforeunload', onUnload);
  window.addEventListener('storage', onStorage);
  sync('settings');
  return () => {
    offTimers();
    offFocus();
    offMixer();
    window.removeEventListener('beforeunload', onUnload);
    window.removeEventListener('storage', onStorage);
    settleTally(Date.now());
    installed = false;
    autoStarted = false;
    wasActive = false;
  };
}

/** Test seam: whether the link believes it owns the current playback. */
export function focusSoundscapeOwnsPlayback(): boolean {
  return autoStarted;
}
