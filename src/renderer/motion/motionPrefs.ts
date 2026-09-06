/**
 * Motion & Accessibility preferences (Phase 4.5).
 *
 * Motion Mode deliberately does NOT introduce a second animation switch:
 * the app already had `displayPrefs.animationLevel` ('full' | 'reduced' |
 * 'none') driving `html[data-display-anim]` and the legacy `.reduce-motion`
 * class, which a lot of existing CSS keys off. Two independent switches for
 * one concept is how you get "Disabled mode still animates". So Motion Mode
 * is a *view* of that same stored value:
 *
 *     normal  <-> full
 *     performance <-> reduced
 *     disabled <-> none
 *
 * The genuinely new axes (velocity, reward particle density, companion
 * physics weight) live here.
 */
import {
  loadDisplayPrefs,
  onDisplayPrefsChanged,
  saveDisplayPrefs,
  type AnimationLevelId,
} from '../displayPrefs';
import { writeLocalStorageJson } from '../localStorageWrite';
import { clampVelocity, DURATION, VELOCITY_MAX, VELOCITY_MIN } from './tokens';

export type MotionModeId = 'normal' | 'performance' | 'disabled';
export type ParticleDensityId = 'off' | 'low' | 'high';
/** 0 = light (floaty), 1 = heavy (fast fall, tight damping). */
export type PhysicsWeight = number;

export interface MotionPrefs {
  /** Mirrors displayPrefs.animationLevel — see module note. */
  motionMode: MotionModeId;
  /** 0.0x (instant) – 2.0x (slow). 1.0 = design timing. */
  velocity: number;
  rewardParticles: ParticleDensityId;
  /** 0–1, Light → Heavy. */
  companionWeight: PhysicsWeight;
}

const KEY = 'jp-os-motion-prefs-v1';
const EVENT = 'jp-os-motion-prefs-changed';

export const MOTION_DEFAULTS: MotionPrefs = {
  motionMode: 'normal',
  velocity: 1,
  rewardParticles: 'high',
  companionWeight: 0.5,
};

export function modeToAnimationLevel(mode: MotionModeId): AnimationLevelId {
  if (mode === 'disabled') return 'none';
  if (mode === 'performance') return 'reduced';
  return 'full';
}

export function animationLevelToMode(level: AnimationLevelId): MotionModeId {
  if (level === 'none') return 'disabled';
  if (level === 'reduced') return 'performance';
  return 'normal';
}

/** OS-level reduced-motion request. Safe when matchMedia is unavailable. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function normalizeMotionPrefs(raw: Partial<MotionPrefs>): MotionPrefs {
  const mode: MotionModeId =
    raw.motionMode === 'performance' || raw.motionMode === 'disabled'
      ? raw.motionMode
      : 'normal';
  const rewardParticles: ParticleDensityId =
    raw.rewardParticles === 'off' || raw.rewardParticles === 'low'
      ? raw.rewardParticles
      : 'high';
  const weight = Number.isFinite(raw.companionWeight)
    ? Math.min(1, Math.max(0, raw.companionWeight as number))
    : MOTION_DEFAULTS.companionWeight;
  return {
    motionMode: mode,
    velocity: clampVelocity(raw.velocity ?? MOTION_DEFAULTS.velocity),
    rewardParticles,
    companionWeight: weight,
  };
}

export function loadMotionPrefs(): MotionPrefs {
  let stored: Partial<MotionPrefs> = {};
  let hadStored = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      stored = JSON.parse(raw) as Partial<MotionPrefs>;
      hadStored = true;
    }
  } catch {
    /* ignore */
  }
  const next = normalizeMotionPrefs(stored);
  // animationLevel is the source of truth for the mode — a change made via
  // the older Display page must be reflected here.
  next.motionMode = animationLevelToMode(loadDisplayPrefs().animationLevel);
  // First run with no stored prefs: honour the OS request (plan: "respected
  // on first run"). Performance, not Disabled — the user asked for less
  // motion, not for a dead UI, and every mode still resolves states.
  if (!hadStored && prefersReducedMotion()) {
    next.motionMode = 'performance';
  }
  return next;
}

/**
 * Resolved velocity actually used for playback. Disabled mode snaps
 * regardless of the slider; Performance halves the timing so the UI still
 * communicates direction without lingering.
 */
export function effectiveVelocity(p: MotionPrefs): number {
  if (p.motionMode === 'disabled') return 0;
  if (p.motionMode === 'performance') return clampVelocity(p.velocity) * 0.5;
  return clampVelocity(p.velocity);
}

/** Reward burst particle budget. Off means the burst never spawns. */
export function particleBudget(p: MotionPrefs): number {
  if (p.motionMode === 'disabled') return 0;
  if (p.rewardParticles === 'off') return 0;
  if (p.rewardParticles === 'low') return 24;
  return 90;
}

/** Companion gravity px/s² and velocity damping per second, Light → Heavy. */
export function companionPhysics(p: MotionPrefs): { gravity: number; damping: number } {
  const w = Math.min(1, Math.max(0, p.companionWeight));
  return {
    gravity: 620 + w * 1180,
    damping: 0.86 - w * 0.24,
  };
}

export function applyMotionPrefs(p: MotionPrefs): void {
  const root = document.documentElement;
  const st = root.style;
  const n = normalizeMotionPrefs(p);
  const v = effectiveVelocity(n);

  // Rewriting the shared duration tokens is what makes the slider reach
  // every CSS animation in the app without touching a single view.
  st.setProperty('--motion-velocity', String(v));
  st.setProperty('--dur-instant', `${Math.round(DURATION.instant * v)}ms`);
  st.setProperty('--dur-fast', `${Math.round(DURATION.fast * v)}ms`);
  st.setProperty('--dur-normal', `${Math.round(DURATION.normal * v)}ms`);
  st.setProperty('--dur-slow', `${Math.round(DURATION.slow * v)}ms`);
  st.setProperty('--dur-xslow', `${Math.round(DURATION.xslow * v)}ms`);
  // Legacy shell token (styles.css) — in seconds.
  st.setProperty('--motion-duration', `${(0.14 * v).toFixed(3)}s`);

  root.dataset.motionMode = n.motionMode;
  root.dataset.motionParticles = n.rewardParticles;
  // Snap is a distinct state from Disabled: velocity 0 in Normal mode still
  // means "resolve instantly", and CSS needs to know to skip in-flight ones.
  root.dataset.motionSnap = v === 0 ? '1' : '0';
}

let displaySyncInstalled = false;
let writingAnimationLevel = false;

function saveAnimationLevel(level: AnimationLevelId): void {
  writingAnimationLevel = true;
  try {
    saveDisplayPrefs({ animationLevel: level });
  } finally {
    writingAnimationLevel = false;
  }
}

export function saveMotionPrefs(partial: Partial<MotionPrefs>): MotionPrefs {
  const prev = loadMotionPrefs();
  const next = normalizeMotionPrefs({ ...prev, ...partial });
  writeLocalStorageJson(KEY, next);
  // Keep the one underlying animation switch in sync.
  if (next.motionMode !== prev.motionMode) {
    saveAnimationLevel(modeToAnimationLevel(next.motionMode));
  }
  applyMotionPrefs(next);
  window.dispatchEvent(new CustomEvent<MotionPrefs>(EVENT, { detail: next }));
  return next;
}

export function bootMotionPrefs(): void {
  const p = loadMotionPrefs();
  applyMotionPrefs(p);
  // Persist the first-run OS-derived mode so the Display page and this page
  // agree immediately rather than after the first edit.
  try {
    if (localStorage.getItem(KEY) === null) {
      writeLocalStorageJson(KEY, p);
      if (p.motionMode !== 'normal') {
        saveAnimationLevel(modeToAnimationLevel(p.motionMode));
      }
    }
  } catch {
    /* ignore */
  }
  if (!displaySyncInstalled) {
    displaySyncInstalled = true;
    onDisplayPrefsChanged(() => {
      if (writingAnimationLevel) return;
      const next = loadMotionPrefs();
      writeLocalStorageJson(KEY, next);
      applyMotionPrefs(next);
      window.dispatchEvent(new CustomEvent<MotionPrefs>(EVENT, { detail: next }));
    });
  }
}

export function onMotionPrefsChanged(cb: (p: MotionPrefs) => void): () => void {
  const h = (e: Event): void => cb((e as CustomEvent<MotionPrefs>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function resetMotionPrefs(): MotionPrefs {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  const next = { ...MOTION_DEFAULTS };
  saveAnimationLevel(modeToAnimationLevel(next.motionMode));
  applyMotionPrefs(next);
  window.dispatchEvent(new CustomEvent<MotionPrefs>(EVENT, { detail: next }));
  return next;
}

export { VELOCITY_MIN, VELOCITY_MAX };
