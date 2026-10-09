import { soundEngine, type LoopHandle } from './audio/soundEngine';
import {
  AERO_ENTRY_LOCKED_EVENT,
  armLockscreenOnWiredEntry,
} from './lockscreenSettings';
import {
  markWiredArchiveBootSeen,
  loadWiredArchiveSettings,
  onWiredArchiveSettingsChanged,
  shouldReplayWiredArchiveBoot,
} from './terminalModeSettings';
import { DEFAULT_THEME_ID, loadThemeId, onThemeChanged, setTheme } from './theme/engine';
import { AERO_THEME_ID } from './theme/frutiger-aero';
import { WIRED_ARCHIVE_THEME_ID } from './theme/wired-archive';
import { applyAeroEnvironment, restoreStudyEnvironmentAfterAero } from './aeroEnvironment';

export type WiredArchivePhase =
  | 'inactive'
  | 'preboot'
  | 'boot'
  | 'warning'
  | 'reveal'
  | 'active'
  /**
   * Leaving is not a fade. The archive notices, corrupts the display, and asks
   * the operator directly how they want to proceed — the one moment the fiction
   * addresses the person rather than the character. Blocks until resolved.
   */
  | 'breach'
  | 'sleeping'
  | 'waking'
  | 'shutting-down';

/** How the operator answered the breach prompt. */
export type WiredExitChoice =
  /** Hand control back to the Aero service layer (the historical behaviour). */
  | 'aero'
  /** Restore whatever theme they were actually using before they came here. */
  | 'restore'
  /** Never mind. Stay. */
  | 'stay';

export type WiredArchiveReason = 'entry' | 'restart' | 'sleep' | 'wake' | 'shutdown';

export interface WiredArchiveLifecycleState {
  phase: WiredArchivePhase;
  reason: WiredArchiveReason;
  reducedMotion: boolean;
  muted: boolean;
  canSkip: boolean;
  /** Catalog key (wired.lifecycle.*) — resolved with t() by whoever renders it. */
  messageKey: string;
  sequenceId: number;
  startedAt: number;
}

const WIRED_ENTRY_EVENT = 'shell:wiredEntry';
const WIRED_ENTRY_BOOT_EVENT = 'shell:wiredEntryBoot';
const WIRED_RESTART_EVENT = 'shell:wiredRestart';
const WIRED_SLEEP_EVENT = 'shell:wiredSleep';
const WIRED_WAKE_EVENT = 'shell:wiredWake';
const WIRED_SHUTDOWN_EVENT = 'shell:wiredShutdown';
const WIRED_LIFECYCLE_EVENT = 'wired:lifecycle';
const STARTUP_SOUND_EVENT = 'shell:startup';
const SHUTDOWN_SOUND_EVENT = 'shell:shutdown';

const listeners = new Set<(state: WiredArchiveLifecycleState) => void>();
const timers: number[] = [];
let installed = false;
let sequenceId = 0;
let ambientHandle: LoopHandle | null = null;
let ambientStarting = false;

function isWiredTheme(): boolean {
  if (typeof document === 'undefined') return loadThemeId() === WIRED_ARCHIVE_THEME_ID;
  return (
    document.documentElement.getAttribute('data-materials') === 'wired' ||
    loadThemeId() === WIRED_ARCHIVE_THEME_ID
  );
}

function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.classList.contains('reduce-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function readMuted(): boolean {
  try {
    return soundEngine.isMuted();
  } catch {
    return false;
  }
}

function syncDocumentLifecycle(next: WiredArchiveLifecycleState): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (next.phase === 'inactive') {
    root.removeAttribute('data-wired-lifecycle');
    root.removeAttribute('data-wired-lifecycle-reason');
    root.classList.remove('wired-lifecycle-running', 'wired-lifecycle-suspended');
    return;
  }
  root.dataset.wiredLifecycle = next.phase;
  root.dataset.wiredLifecycleReason = next.reason;
  root.classList.add('wired-lifecycle-running');
  root.classList.toggle('wired-lifecycle-suspended', next.phase === 'sleeping' || next.phase === 'shutting-down');
}

function initialState(): WiredArchiveLifecycleState {
  return {
    phase: isWiredTheme() ? 'active' : 'inactive',
    reason: 'entry',
    reducedMotion: prefersReducedMotion(),
    muted: readMuted(),
    canSkip: false,
    messageKey: isWiredTheme() ? 'wired.lifecycle.active' : 'wired.lifecycle.inactive',
    sequenceId,
    startedAt: Date.now(),
  };
}

let state = initialState();

function clearTimers(): void {
  while (timers.length) {
    const timer = timers.pop();
    if (timer != null) window.clearTimeout(timer);
  }
}

function after(ms: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, ms));
}

function publish(patch: Partial<WiredArchiveLifecycleState>): void {
  state = {
    ...state,
    ...patch,
    muted: patch.muted ?? readMuted(),
    reducedMotion: patch.reducedMotion ?? prefersReducedMotion(),
  };
  syncDocumentLifecycle(state);
  syncAmbient();
  window.dispatchEvent(new CustomEvent<WiredArchiveLifecycleState>(WIRED_LIFECYCLE_EVENT, { detail: state }));
  listeners.forEach((listener) => listener(state));
}

/**
 * Rare one-shots under the hum — a relay closing somewhere in the rack, a
 * crackle on the line — every 25–70 s while the ambient bed is playing. They
 * ride the same gate as the bed (ambient setting, active phase, Wired theme),
 * play in the `environment` category so Battery Saver and the category volume
 * apply, and go through soundEngine like every other cue (mute respected).
 */
let oneShotTimer: number | null = null;

function scheduleAmbientOneShot(): void {
  if (oneShotTimer !== null || typeof window === 'undefined') return;
  const delay = 25000 + Math.random() * 45000;
  oneShotTimer = window.setTimeout(() => {
    oneShotTimer = null;
    if (!ambientHandle) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      scheduleAmbientOneShot();
      return;
    }
    const cue = Math.random() < 0.6 ? 'relay-click' : 'line-crackle';
    void soundEngine.play('environment', cue, { volume: 0.55 + Math.random() * 0.3 });
    scheduleAmbientOneShot();
  }, delay);
}

function cancelAmbientOneShot(): void {
  if (oneShotTimer === null) return;
  window.clearTimeout(oneShotTimer);
  oneShotTimer = null;
}

function syncAmbient(): void {
  const shouldPlay =
    state.phase === 'active' &&
    isWiredTheme() &&
    loadWiredArchiveSettings().ambientEnabled &&
    document.documentElement.dataset.wiredAmbient !== 'off';
  if (!shouldPlay) {
    cancelAmbientOneShot();
    ambientHandle?.fadeTo(0, 260);
    const handle = ambientHandle;
    ambientHandle = null;
    if (handle) window.setTimeout(() => handle.stop(), 320);
    return;
  }
  if (ambientHandle || ambientStarting) return;
  ambientStarting = true;
  void soundEngine.playLoop('environment', 'ambient', { volume: 0 }).then((handle) => {
    ambientStarting = false;
    if (state.phase !== 'active' || !isWiredTheme() || !loadWiredArchiveSettings().ambientEnabled) {
      handle.stop();
      return;
    }
    ambientHandle = handle;
    handle.fadeTo(0.34, 800);
    scheduleAmbientOneShot();
  });
}

function beginEntry(reason: WiredArchiveReason = 'entry', forceBoot = false): void {
  clearTimers();
  const reducedMotion = prefersReducedMotion();
  const shouldBoot = forceBoot || shouldReplayWiredArchiveBoot();
  const id = ++sequenceId;

  if (!shouldBoot) {
    publish({
      phase: 'active',
      reason,
      canSkip: false,
      messageKey: 'wired.lifecycle.active',
      sequenceId: id,
      startedAt: Date.now(),
    });
    return;
  }

  const bootAt = reducedMotion ? 60 : 520;
  const soundAt = reducedMotion ? 80 : 1050;
  const warningAt = reducedMotion ? 420 : 4300;
  const revealAt = reducedMotion ? 760 : 5400;
  const activeAt = reducedMotion ? 960 : 6600;

  publish({
    phase: 'preboot',
    reason,
    canSkip: false,
    messageKey: reason === 'restart' ? 'wired.lifecycle.restarting' : 'wired.lifecycle.handoff',
    sequenceId: id,
    startedAt: Date.now(),
  });

  after(bootAt, () => {
    if (state.sequenceId === id) publish({ phase: 'boot', canSkip: true, messageKey: 'wired.lifecycle.mounting' });
  });
  after(soundAt, () => {
    if (state.sequenceId === id) window.dispatchEvent(new CustomEvent(STARTUP_SOUND_EVENT));
  });
  after(warningAt, () => {
    if (state.sequenceId === id) publish({ phase: 'warning', canSkip: true, messageKey: 'wired.lifecycle.unregistered' });
  });
  after(revealAt, () => {
    if (state.sequenceId === id) publish({ phase: 'reveal', canSkip: false, messageKey: 'wired.lifecycle.opening' });
  });
  after(activeAt, () => {
    if (state.sequenceId !== id) return;
    markWiredArchiveBootSeen();
    publish({ phase: 'active', canSkip: false, messageKey: 'wired.lifecycle.active' });
  });
}

function beginSleep(): void {
  if (state.phase === 'inactive') return;
  clearTimers();
  publish({
    phase: 'sleeping',
    reason: 'sleep',
    canSkip: false,
    messageKey: 'wired.lifecycle.suspended',
    sequenceId: ++sequenceId,
    startedAt: Date.now(),
  });
}

function beginWake(): void {
  if (state.phase === 'inactive') return;
  clearTimers();
  const reducedMotion = prefersReducedMotion();
  const id = ++sequenceId;
  publish({
    phase: 'waking',
    reason: 'wake',
    canSkip: true,
    messageKey: 'wired.lifecycle.restoring',
    sequenceId: id,
    startedAt: Date.now(),
  });
  after(reducedMotion ? 160 : 620, () => {
    if (state.sequenceId === id) publish({ phase: 'active', canSkip: false, messageKey: 'wired.lifecycle.active' });
  });
}

const WIRED_RESTORE_THEME_KEY = 'jp-wired-restore-theme-v1';

/**
 * Remember the theme the operator was actually using before entering, so the
 * breach prompt can offer to put it back.
 *
 * Previously leaving WIRED always force-landed on Aero, which is asymmetric
 * with Aero's own restore-previous behaviour and strands anyone who entered
 * from a plain Study OS theme in a mode they never chose.
 */
export function rememberWiredRestoreTheme(themeId: string): void {
  const id = themeId.trim();
  if (!id || id === WIRED_ARCHIVE_THEME_ID) return;
  try {
    localStorage.setItem(WIRED_RESTORE_THEME_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Falls back to the Study OS default, not Aero.
 *
 * Aero is already its own choice in the breach prompt; defaulting here too
 * would render two buttons that do exactly the same thing.
 */
export function loadWiredRestoreTheme(): string {
  try {
    const stored = localStorage.getItem(WIRED_RESTORE_THEME_KEY);
    if (stored && stored !== WIRED_ARCHIVE_THEME_ID) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

/** Enter the breach prompt. The actual unmount waits on `resolveWiredExit`. */
function beginShutdown(): void {
  if (state.phase === 'inactive' || state.phase === 'breach') return;
  clearTimers();
  const id = ++sequenceId;
  publish({
    phase: 'breach',
    reason: 'shutdown',
    canSkip: false,
    messageKey: 'wired.lifecycle.compromised',
    sequenceId: id,
    startedAt: Date.now(),
  });
}

/** Finish (or cancel) the exit once the operator has answered. */
export function resolveWiredExit(choice: WiredExitChoice): void {
  if (state.phase !== 'breach') return;
  clearTimers();

  if (choice === 'stay') {
    publish({ phase: 'active', reason: 'entry', canSkip: false, messageKey: 'wired.lifecycle.active' });
    return;
  }

  const reducedMotion = prefersReducedMotion();
  const id = ++sequenceId;
  publish({
    phase: 'shutting-down',
    reason: 'shutdown',
    canSkip: false,
    messageKey: 'wired.lifecycle.unmounting',
    sequenceId: id,
    startedAt: Date.now(),
  });
  window.dispatchEvent(new CustomEvent(SHUTDOWN_SOUND_EVENT));
  after(reducedMotion ? 240 : 900, () => {
    if (state.sequenceId !== id) return;
    const next = choice === 'restore' ? loadWiredRestoreTheme() : AERO_THEME_ID;
    // Back into Aero means Aero's living layer (bubbles, its assistant, its walls),
    // not the Study one Wired ran on. Without this Aero came back on the Study
    // environment and then saved those values as its own snapshot.
    if (next === AERO_THEME_ID) applyAeroEnvironment(false);
    setTheme(next);
    soundEngine.stopAll();
    publish({ phase: 'inactive', canSkip: false, messageKey: 'wired.lifecycle.inactive' });
  });
}

function enterWiredArchive(): void {
  const from = loadThemeId();
  // Capture where they came from BEFORE switching, so the breach prompt can
  // offer to put it back.
  rememberWiredRestoreTheme(from);
  // Wired runs on the Study OS living layer. Straight from Aero, put it back FIRST,
  // explicitly, rather than trusting the theme bridge's listener to run (and to run
  // before Wired's first frame): Aero's bubbles and assistant stayed on screen in
  // Wired until it was left (2026-10 hardware run). Idempotent with that bridge.
  if (from === AERO_THEME_ID) restoreStudyEnvironmentAfterAero();
  setTheme(WIRED_ARCHIVE_THEME_ID);
  if (armLockscreenOnWiredEntry()) {
    window.dispatchEvent(new CustomEvent(AERO_ENTRY_LOCKED_EVENT));
    return;
  }
  beginEntry('entry');
}

export function installWiredArchiveLifecycle(): void {
  if (installed) return;
  installed = true;

  // Re-derive the phase now that the theme registry is populated.
  //
  // `initialState()` runs at module-eval, which is before main.tsx calls
  // `registerWiredArchive()`. Until then `loadThemeId()` does not recognise
  // 'wired-archive' and falls back to the default, so a cold boot straight
  // into WIRED left the lifecycle stuck 'inactive' — every subsequent
  // sleep/wake/shutdown request early-returned and silently did nothing.
  // Entering WIRED at runtime masked this, because that path goes through
  // `onThemeChanged` instead.
  if (state.phase === 'inactive' && isWiredTheme()) {
    state = { ...state, phase: 'active', messageKey: 'wired.lifecycle.active' };
  }

  syncDocumentLifecycle(state);
  window.addEventListener(WIRED_ENTRY_EVENT, enterWiredArchive);
  window.addEventListener(WIRED_ENTRY_BOOT_EVENT, () => beginEntry('entry'));
  window.addEventListener(WIRED_RESTART_EVENT, () => beginEntry('restart', true));
  window.addEventListener(WIRED_SLEEP_EVENT, beginSleep);
  window.addEventListener(WIRED_WAKE_EVENT, beginWake);
  window.addEventListener(WIRED_SHUTDOWN_EVENT, beginShutdown);
  onWiredArchiveSettingsChanged(syncAmbient);
  onThemeChanged((id) => {
    if (id !== WIRED_ARCHIVE_THEME_ID && state.phase !== 'inactive' && state.phase !== 'shutting-down') {
      clearTimers();
      publish({ phase: 'inactive', canSkip: false, messageKey: 'wired.lifecycle.inactive' });
    }
    if (id === WIRED_ARCHIVE_THEME_ID && state.phase === 'inactive') {
      publish({ phase: 'active', reason: 'entry', canSkip: false, messageKey: 'wired.lifecycle.active' });
    }
  });
  if (loadThemeId() === WIRED_ARCHIVE_THEME_ID && shouldReplayWiredArchiveBoot()) {
    beginEntry('entry');
  }
}

export function getWiredArchiveLifecycleState(): WiredArchiveLifecycleState {
  return state;
}

export function subscribeWiredArchiveLifecycle(listener: (state: WiredArchiveLifecycleState) => void): () => void {
  installWiredArchiveLifecycle();
  listener(state);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function skipWiredArchiveLifecycle(): void {
  if (!state.canSkip) return;
  clearTimers();
  markWiredArchiveBootSeen();
  publish({ phase: 'active', canSkip: false, messageKey: 'wired.lifecycle.active' });
}

export function requestWiredArchiveEntry(): void {
  window.dispatchEvent(new CustomEvent(WIRED_ENTRY_EVENT));
}

export function requestWiredArchiveRestart(): void {
  window.dispatchEvent(new CustomEvent(WIRED_RESTART_EVENT));
}

export function requestWiredArchiveSleep(): void {
  window.dispatchEvent(new CustomEvent(WIRED_SLEEP_EVENT));
}

export function requestWiredArchiveWake(): void {
  window.dispatchEvent(new CustomEvent(WIRED_WAKE_EVENT));
}

export function requestWiredArchiveShutdown(): void {
  window.dispatchEvent(new CustomEvent(WIRED_SHUTDOWN_EVENT));
}

export function requestWiredArchiveEntryBoot(): void {
  window.dispatchEvent(new CustomEvent(WIRED_ENTRY_BOOT_EVENT));
}

export function isWiredArchiveActive(): boolean {
  return isWiredTheme();
}
