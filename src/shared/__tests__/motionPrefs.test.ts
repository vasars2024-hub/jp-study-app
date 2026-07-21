import { describe, expect, it } from 'vitest';
import { clampVelocity, DURATION, isSnap, scaleDuration } from '../../renderer/motion/tokens';
import {
  animationLevelToMode,
  companionPhysics,
  effectiveVelocity,
  modeToAnimationLevel,
  MOTION_DEFAULTS,
  normalizeMotionPrefs,
  particleBudget,
  type MotionPrefs,
} from '../../renderer/motion/motionPrefs';

const prefs = (p: Partial<MotionPrefs> = {}): MotionPrefs =>
  normalizeMotionPrefs({ ...MOTION_DEFAULTS, ...p });

describe('motion tokens', () => {
  it('scales durations by velocity', () => {
    expect(scaleDuration(DURATION.normal, 1)).toBe(240);
    expect(scaleDuration(DURATION.normal, 2)).toBe(480);
    expect(scaleDuration(DURATION.normal, 0.5)).toBe(120);
  });

  it('velocity 0 is a snap, not a divide-by-zero', () => {
    expect(scaleDuration(DURATION.slow, 0)).toBe(0);
    expect(Number.isFinite(scaleDuration(DURATION.slow, 0))).toBe(true);
    expect(isSnap(0)).toBe(true);
    expect(isSnap(1)).toBe(false);
  });

  it('clamps velocity to the slider range and survives junk', () => {
    expect(clampVelocity(-5)).toBe(0);
    expect(clampVelocity(99)).toBe(2);
    expect(clampVelocity(Number.NaN)).toBe(1);
  });
});

describe('motion prefs', () => {
  it('motion mode and animation level are the same switch', () => {
    // Round-tripping must be lossless, or the two settings pages disagree.
    for (const mode of ['normal', 'performance', 'disabled'] as const) {
      expect(animationLevelToMode(modeToAnimationLevel(mode))).toBe(mode);
    }
    expect(modeToAnimationLevel('disabled')).toBe('none');
    expect(modeToAnimationLevel('performance')).toBe('reduced');
    expect(modeToAnimationLevel('normal')).toBe('full');
  });

  it('normalizes unknown values to the defaults', () => {
    const n = normalizeMotionPrefs({
      motionMode: 'nonsense' as never,
      rewardParticles: 'nonsense' as never,
      velocity: Number.NaN,
      companionWeight: 42,
    });
    expect(n.motionMode).toBe('normal');
    expect(n.rewardParticles).toBe('high');
    expect(n.velocity).toBe(1);
    expect(n.companionWeight).toBe(1);
  });

  it('disabled mode snaps regardless of the velocity slider', () => {
    expect(effectiveVelocity(prefs({ motionMode: 'disabled', velocity: 2 }))).toBe(0);
    expect(isSnap(effectiveVelocity(prefs({ motionMode: 'disabled', velocity: 2 })))).toBe(true);
  });

  it('performance mode shortens but does not kill motion', () => {
    const v = effectiveVelocity(prefs({ motionMode: 'performance', velocity: 1 }));
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it('the velocity slider reaches playback in normal mode', () => {
    expect(effectiveVelocity(prefs({ velocity: 0.5 }))).toBe(0.5);
    expect(effectiveVelocity(prefs({ velocity: 2 }))).toBe(2);
    expect(effectiveVelocity(prefs({ velocity: 0 }))).toBe(0);
  });

  it('particle density is a hard budget, and disabled mode zeroes it', () => {
    expect(particleBudget(prefs({ rewardParticles: 'off' }))).toBe(0);
    expect(particleBudget(prefs({ rewardParticles: 'low' }))).toBeGreaterThan(0);
    expect(particleBudget(prefs({ rewardParticles: 'high' }))).toBeGreaterThan(
      particleBudget(prefs({ rewardParticles: 'low' })),
    );
    // Accessibility: Disabled must not spray confetti just because density is High.
    expect(particleBudget(prefs({ motionMode: 'disabled', rewardParticles: 'high' }))).toBe(0);
  });

  it('heavier companions fall faster and damp harder', () => {
    const light = companionPhysics(prefs({ companionWeight: 0 }));
    const heavy = companionPhysics(prefs({ companionWeight: 1 }));
    expect(heavy.gravity).toBeGreaterThan(light.gravity);
    expect(heavy.damping).toBeLessThan(light.damping);
    // Damping stays a sane per-second retention factor at both extremes.
    for (const p of [light, heavy]) {
      expect(p.damping).toBeGreaterThan(0);
      expect(p.damping).toBeLessThan(1);
    }
  });
});
