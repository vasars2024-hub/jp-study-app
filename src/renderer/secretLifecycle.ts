import { soundEngine } from './audio/soundEngine';
import { saveDisplayPrefs } from './displayPrefs';
import { loadThemeId, onThemeChanged } from './theme/engine';
import { AERO_THEME_ID } from './theme/frutiger-aero';

export type SecretLifecyclePhase =
  | 'inactive'
  | 'preboot'
  | 'boot'
  | 'welcome'
  | 'reveal'
  | 'active'
  | 'sleeping'
  | 'waking'
  | 'shutting-down'
  | 'safe-fallback';

export type SecretLifecycleReason = 'entry' | 'restart' | 'sleep' | 'wake' | 'shutdown' | 'fallback';

export interface SecretLifecycleState {
  phase: SecretLifecyclePhase;
  reason: SecretLifecycleReason;
  reducedMotion: boolean;
  muted: boolean;
  canSkip: boolean;
  message: string;
  sequenceId: number;
  startedAt: number;
}

const SOFT_REBOOT_EVENT = 'shell:softReboot';
const SECRET_RESTART_EVENT = 'shell:secretRestart';
const SECRET_SLEEP_EVENT = 'shell:secretSleep';
const SECRET_WAKE_EVENT = 'shell:secretWake';
const SECRET_SHUTDOWN_EVENT = 'shell:secretShutdown';
const STARTUP_SOUND_EVENT = 'shell:startup';
const SHUTDOWN_SOUND_EVENT = 'shell:shutdown';
const SECRET_LIFECYCLE_EVENT = 'secret:lifecycle';

const listeners = new Set<(state: SecretLifecycleState) => void>();
const timers: number[] = [];
let installed = false;
let sequenceId = 0;

function isSuspendedPhase(phase: SecretLifecyclePhase): boolean {
  return phase === 'sleeping' || phase === 'shutting-down';
}

function syncDocumentLifecycle(next: SecretLifecycleState): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (next.phase === 'inactive') {
    root.removeAttribute('data-secret-lifecycle');
    root.removeAttribute('data-secret-lifecycle-reason');
    root.classList.remove('secret-lifecycle-running', 'secret-lifecycle-suspended');
    return;
  }
  root.dataset.secretLifecycle = next.phase;
  root.dataset.secretLifecycleReason = next.reason;
  root.classList.add('secret-lifecycle-running');
  root.classList.toggle('secret-lifecycle-suspended', isSuspendedPhase(next.phase));
}

function isAeroActive(): boolean {
  if (typeof document === 'undefined') return loadThemeId() === AERO_THEME_ID;
  return document.documentElement.getAttribute('data-materials') === 'aero' || loadThemeId() === AERO_THEME_ID;
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

function initialState(): SecretLifecycleState {
  return {
    phase: isAeroActive() ? 'active' : 'inactive',
    reason: 'entry',
    reducedMotion: prefersReducedMotion(),
    muted: readMuted(),
    canSkip: false,
    message: isAeroActive() ? 'Secret OS active' : 'Secret OS inactive',
    sequenceId,
    startedAt: Date.now(),
  };
}

let state: SecretLifecycleState = initialState();
let coldStartEntryQueued = false;

function clearTimers(): void {
  while (timers.length) {
    const timer = timers.pop();
    if (timer != null) window.clearTimeout(timer);
  }
}

function after(ms: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, ms));
}

function publish(patch: Partial<SecretLifecycleState>): void {
  state = {
    ...state,
    ...patch,
    muted: patch.muted ?? readMuted(),
    reducedMotion: patch.reducedMotion ?? prefersReducedMotion(),
  };
  syncDocumentLifecycle(state);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SecretLifecycleState>(SECRET_LIFECYCLE_EVENT, { detail: state }));
  }
  listeners.forEach((listener) => listener(state));
}

function beginEntry(reason: SecretLifecycleReason = 'entry'): void {
  clearTimers();
  sequenceId += 1;
  const reducedMotion = prefersReducedMotion();
  const id = sequenceId;
  const bootAt = reducedMotion ? 60 : 650;
  const soundAt = reducedMotion ? 120 : 1500;
  const welcomeAt = reducedMotion ? 260 : 3600;
  const revealAt = reducedMotion ? 640 : 5200;
  const activeAt = revealAt + (reducedMotion ? 180 : 1100);
  const fallbackAt = reducedMotion ? 2400 : 12000;

  publish({
    phase: 'preboot',
    reason,
    canSkip: false,
    message: reason === 'restart' ? 'Restarting Secret Study OS' : 'Preparing Secret Study OS',
    sequenceId: id,
    startedAt: Date.now(),
  });

  after(bootAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'boot', canSkip: true, message: 'Forming the Aero desktop' });
  });
  after(soundAt, () => {
    if (state.sequenceId !== id) return;
    window.dispatchEvent(new CustomEvent(STARTUP_SOUND_EVENT));
  });
  after(welcomeAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'welcome', canSkip: true, message: 'Welcome to Secret Study OS' });
  });
  after(revealAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'reveal', canSkip: false, message: 'Revealing the corrected Aero desktop' });
  });
  after(activeAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'active', canSkip: false, message: 'Secret OS active' });
  });
  after(fallbackAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'safe-fallback', reason: 'fallback', canSkip: true, message: 'Safe fallback' });
    after(reducedMotion ? 260 : 900, () => {
      if (state.sequenceId === id) publish({ phase: 'active', canSkip: false, message: 'Secret OS active' });
    });
  });
}

function beginSleep(): void {
  if (state.phase === 'inactive') return;
  clearTimers();
  sequenceId += 1;
  publish({
    phase: 'sleeping',
    reason: 'sleep',
    canSkip: false,
    message: 'Secret OS sleeping',
    sequenceId,
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
    message: 'Restoring Secret OS',
    sequenceId: id,
    startedAt: Date.now(),
  });
  after(reducedMotion ? 220 : 650, () => {
    if (state.sequenceId === id) publish({ phase: 'active', canSkip: false, message: 'Secret OS active' });
  });
}

function beginShutdown(): void {
  if (state.phase === 'inactive') return;
  clearTimers();
  const reducedMotion = prefersReducedMotion();
  const id = ++sequenceId;
  publish({
    phase: 'shutting-down',
    reason: 'shutdown',
    canSkip: false,
    message: 'Shutting down Secret OS',
    sequenceId: id,
    startedAt: Date.now(),
  });
  window.dispatchEvent(new CustomEvent(SHUTDOWN_SOUND_EVENT));
  after(reducedMotion ? 260 : 980, () => {
    if (state.sequenceId === id) publish({ phase: 'inactive', canSkip: false, message: 'Secret OS inactive' });
  });
}

export function installSecretLifecycle(): void {
  if (installed) return;
  installed = true;
  syncDocumentLifecycle(state);
  window.addEventListener(SOFT_REBOOT_EVENT, () => beginEntry('entry'));
  window.addEventListener(SECRET_RESTART_EVENT, () => beginEntry('restart'));
  window.addEventListener(SECRET_SLEEP_EVENT, beginSleep);
  window.addEventListener(SECRET_WAKE_EVENT, beginWake);
  window.addEventListener(SECRET_SHUTDOWN_EVENT, beginShutdown);
  onThemeChanged((id) => {
    if (id === AERO_THEME_ID && state.phase === 'inactive') {
      publish({ phase: 'active', reason: 'entry', canSkip: false, message: 'Secret OS active' });
    }
    if (id !== AERO_THEME_ID && state.phase !== 'inactive' && state.phase !== 'shutting-down') {
      clearTimers();
      publish({ phase: 'inactive', canSkip: false, message: 'Secret OS inactive' });
    }
  });
  if (
    !coldStartEntryQueued &&
    (state.phase === 'inactive' || state.phase === 'active') &&
    isAeroActive()
  ) {
    coldStartEntryQueued = true;
    beginEntry('entry');
  }
}

export function getSecretLifecycleState(): SecretLifecycleState {
  return state;
}

export function subscribeSecretLifecycle(listener: (state: SecretLifecycleState) => void): () => void {
  installSecretLifecycle();
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function requestSecretLifecycleRestart(): void {
  window.dispatchEvent(new CustomEvent(SECRET_RESTART_EVENT));
}

export function requestSecretLifecycleSleep(): void {
  window.dispatchEvent(new CustomEvent(SECRET_SLEEP_EVENT));
}

export function requestSecretLifecycleWake(): void {
  window.dispatchEvent(new CustomEvent(SECRET_WAKE_EVENT));
}

export function requestSecretLifecycleShutdown(): void {
  window.dispatchEvent(new CustomEvent(SECRET_SHUTDOWN_EVENT));
}

export function skipSecretLifecycle(): void {
  if (!state.canSkip) return;
  clearTimers();
  const reducedMotion = prefersReducedMotion();
  const id = ++sequenceId;
  publish({
    phase: 'reveal',
    canSkip: false,
    message: state.reason === 'wake' ? 'Restoring desktop' : 'Revealing desktop',
    sequenceId: id,
  });
  after(reducedMotion ? 160 : 360, () => {
    if (state.sequenceId === id) publish({ phase: 'active', canSkip: false, message: 'Secret OS active' });
  });
}

export function setSecretLifecycleMuted(muted: boolean): void {
  soundEngine.setMuted(muted);
  publish({ muted });
}

export function reduceSecretLifecycleMotion(): void {
  saveDisplayPrefs({ animationLevel: 'reduced', reduceFlashes: true });
  publish({ reducedMotion: prefersReducedMotion() });
}
