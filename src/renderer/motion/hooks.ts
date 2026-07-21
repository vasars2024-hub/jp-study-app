/**
 * Motion React hooks (Phase 4.5).
 *
 * Every hook here honours the velocity setting and snaps at velocity 0 —
 * "skip to the end state", never a zero-length animation or a divide-by-zero.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  createSpring,
  isSpringAtRest,
  retargetSpring,
  snapSpring,
  stepSpring,
  type SpringConfig,
} from './spring';
import {
  effectiveVelocity,
  loadMotionPrefs,
  onMotionPrefsChanged,
  type MotionPrefs,
} from './motionPrefs';
import { isSnap, scaleDuration } from './tokens';
import { soundEngine } from '../audio/soundEngine';

/** Live motion prefs. Re-renders on any change (settings, OS, other window). */
export function useMotionPrefs(): MotionPrefs {
  const subscribe = useCallback((cb: () => void) => onMotionPrefsChanged(cb), []);
  // loadMotionPrefs re-reads storage, so cache the snapshot until it changes.
  return useSyncExternalStore(subscribe, getCachedPrefs, getCachedPrefs);
}

let cachedPrefs: MotionPrefs | null = null;
let prefsSubscribed = false;
function getCachedPrefs(): MotionPrefs {
  if (!prefsSubscribed) {
    prefsSubscribed = true;
    onMotionPrefsChanged((p) => {
      cachedPrefs = p;
    });
  }
  if (!cachedPrefs) cachedPrefs = loadMotionPrefs();
  return cachedPrefs;
}

/**
 * Roll a number up to `value` instead of jumping (score cards, XP totals).
 *
 * Ticks are audible through the shared sound engine's `ui` category, so
 * volume/mute/perf-tier all apply. They mute when motion snaps — an
 * accessibility user should not trade flashing for ticking (plan pitfall).
 */
export function useCountUp(
  value: number,
  opts: { durationMs?: number; tick?: boolean } = {},
): number {
  const prefs = useMotionPrefs();
  const velocity = effectiveVelocity(prefs);
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const duration = scaleDuration(opts.durationMs ?? 900, velocity);
    if (duration <= 0 || isSnap(velocity)) {
      // Snap: land on the value, no loop, no ticks.
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tickAudible = opts.tick !== false;
    lastTickRef.current = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Decelerate — a score that lands softly reads as a total, not a stopwatch.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);

      if (tickAudible && now - lastTickRef.current > 55 && t < 0.98) {
        lastTickRef.current = now;
        // Rising pitch as the number climbs — subtle, high-frequency.
        soundEngine.playTone('ui', { freq: 1500 + eased * 900, durationMs: 18, volume: 0.05 });
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        fromRef.current = to;
        setDisplay(to);
        rafRef.current = 0;
      }
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      // Interrupted mid-roll: continue from where the eye last saw it.
      fromRef.current = display;
    };
    // `display` is read only in cleanup (to resume from where the eye last saw
    // the number) and must NOT be a dependency — it changes every frame.
  }, [value, velocity, opts.durationMs, opts.tick]);

  return display;
}

/**
 * An interruptible spring driven by rAF. Retargeting mid-flight carries
 * position and velocity, so a second view switch never queues or restarts.
 * The loop stops when the spring rests.
 */
export function useSpringValue(
  target: number,
  cfg: SpringConfig,
  opts: { onChange?: (v: number) => void } = {},
): number {
  const prefs = useMotionPrefs();
  const velocity = effectiveVelocity(prefs);
  const stateRef = useRef(createSpring(target));
  const rafRef = useRef(0);
  const [, force] = useState(0);
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;

  useEffect(() => {
    const spring = stateRef.current;
    if (isSnap(velocity)) {
      snapSpring(spring, target);
      onChangeRef.current?.(spring.value);
      force((n) => n + 1);
      return;
    }
    retargetSpring(spring, target);
    if (rafRef.current) return;

    let last = performance.now();
    const frame = (now: number) => {
      // Velocity scales time itself, so the slider reaches springs too.
      const dt = ((now - last) / 1000) / Math.max(0.05, velocity);
      last = now;
      stepSpring(spring, cfg, dt);
      onChangeRef.current?.(spring.value);
      force((n) => n + 1);
      if (isSpringAtRest(spring, cfg)) {
        rafRef.current = 0;
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [target, velocity, cfg]);

  return stateRef.current.value;
}
