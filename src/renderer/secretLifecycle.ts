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

/**
 * Lifecycle status lines. The state carries the i18n KEY (`messageKey`) so the
 * overlays translate at render time — the strings used to be raw English and
 * were read aloud as the boot overlay's accessible name in every language.
 * `message` keeps the English text for consumers that still print it verbatim.
 */
const LIFECYCLE_MESSAGES = {
  'aero.lifecycle.active': 'Secret OS active',
  'aero.lifecycle.inactive': 'Secret OS inactive',
  'aero.lifecycle.preparing': 'Preparing Secret Gum',
  'aero.lifecycle.restarting': 'Restarting Secret Gum',
  'aero.lifecycle.forming': 'Forming the Aero desktop',
  'aero.lifecycle.welcome': 'Welcome to Secret Gum',
  'aero.lifecycle.revealing': 'Revealing the Aero desktop',
  'aero.lifecycle.safeFallback': 'Safe fallback',
  'aero.lifecycle.sleeping': 'Secret OS sleeping',
  'aero.lifecycle.waking': 'Restoring Secret OS',
  'aero.lifecycle.shuttingDown': 'Shutting down Secret OS',
  'aero.lifecycle.restoringDesktop': 'Restoring desktop',
  'aero.lifecycle.revealingDesktop': 'Revealing desktop',
} as const;

export type SecretLifecycleMessageKey = keyof typeof LIFECYCLE_MESSAGES;

export interface SecretLifecycleState {
  phase: SecretLifecyclePhase;
  reason: SecretLifecycleReason;
  reducedMotion: boolean;
  muted: boolean;
  canSkip: boolean;
  /** i18n key for the status line; translate with `t(messageKey)`. */
  messageKey: SecretLifecycleMessageKey;
  /** English rendering of `messageKey`, kept for verbatim consumers. */
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
    messageKey: isAeroActive() ? 'aero.lifecycle.active' : 'aero.lifecycle.inactive',
    message: LIFECYCLE_MESSAGES[isAeroActive() ? 'aero.lifecycle.active' : 'aero.lifecycle.inactive'],
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
  const messageKey = patch.messageKey ?? state.messageKey;
  state = {
    ...state,
    ...patch,
    messageKey,
    message: LIFECYCLE_MESSAGES[messageKey],
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
  const bootAt = reducedMotion ? 60 : 900;
  const soundAt = reducedMotion ? 120 : 2100;
  const welcomeAt = reducedMotion ? 260 : 6200;
  const revealAt = reducedMotion ? 640 : 8200;
  const activeAt = revealAt + (reducedMotion ? 180 : 1400);
  const fallbackAt = reducedMotion ? 2400 : 15000;

  publish({
    phase: 'preboot',
    reason,
    canSkip: false,
    messageKey: reason === 'restart' ? 'aero.lifecycle.restarting' : 'aero.lifecycle.preparing',
    sequenceId: id,
    startedAt: Date.now(),
  });

  after(bootAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'boot', canSkip: true, messageKey: 'aero.lifecycle.forming' });
  });
  after(soundAt, () => {
    if (state.sequenceId !== id) return;
    window.dispatchEvent(new CustomEvent(STARTUP_SOUND_EVENT));
  });
  after(welcomeAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'welcome', canSkip: true, messageKey: 'aero.lifecycle.welcome' });
  });
  after(revealAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'reveal', canSkip: false, messageKey: 'aero.lifecycle.revealing' });
  });
  after(activeAt, () => {
    if (state.sequenceId !== id) return;
    publish({ phase: 'active', canSkip: false, messageKey: 'aero.lifecycle.active' });
  });
  after(fallbackAt, () => {
    // A watchdog, not a scheduled step: only fire if the sequence is still
    // stuck. Checking the id alone re-showed the "Safe fallback" splash ~5s
    // after every boot that simply ran to completion.
    if (state.sequenceId !== id || state.phase === 'active') return;
    publish({ phase: 'safe-fallback', reason: 'fallback', canSkip: true, messageKey: 'aero.lifecycle.safeFallback' });
    after(reducedMotion ? 260 : 900, () => {
      if (state.sequenceId === id) publish({ phase: 'active', canSkip: false, messageKey: 'aero.lifecycle.active' });
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
    messageKey: 'aero.lifecycle.sleeping',
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
    messageKey: 'aero.lifecycle.waking',
    sequenceId: id,
    startedAt: Date.now(),
  });
  after(reducedMotion ? 220 : 650, () => {
    if (state.sequenceId === id) publish({ phase: 'active', canSkip: false, messageKey: 'aero.lifecycle.active' });
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
    messageKey: 'aero.lifecycle.shuttingDown',
    sequenceId: id,
    startedAt: Date.now(),
  });
  window.dispatchEvent(new CustomEvent(SHUTDOWN_SOUND_EVENT));
  after(reducedMotion ? 260 : 980, () => {
    if (state.sequenceId === id) publish({ phase: 'inactive', canSkip: false, messageKey: 'aero.lifecycle.inactive' });
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
      publish({ phase: 'active', reason: 'entry', canSkip: false, messageKey: 'aero.lifecycle.active' });
    }
    if (id !== AERO_THEME_ID && state.phase !== 'inactive' && state.phase !== 'shutting-down') {
      clearTimers();
      publish({ phase: 'inactive', canSkip: false, messageKey: 'aero.lifecycle.inactive' });
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
    messageKey: state.reason === 'wake' ? 'aero.lifecycle.restoringDesktop' : 'aero.lifecycle.revealingDesktop',
    sequenceId: id,
  });
  after(reducedMotion ? 160 : 360, () => {
    if (state.sequenceId === id) publish({ phase: 'active', canSkip: false, messageKey: 'aero.lifecycle.active' });
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
