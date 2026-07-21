/**
 * Motion framework (Road to v1.01 · Phase 4.5).
 *
 * One hardware-accelerated animation layer: CSS transitions/keyframes for
 * state changes, a spring helper for interruptible physical motion, and canvas
 * only for particles. All timing flows from the tokens here — no view should
 * hard-code its own duration, or the Animation Velocity slider silently misses
 * it.
 */
export {
  DURATION,
  EASING,
  VELOCITY_MAX,
  VELOCITY_MIN,
  clampVelocity,
  isSnap,
  scaleDuration,
  type DurationId,
  type EasingId,
} from './tokens';

export {
  MOTION_DEFAULTS,
  animationLevelToMode,
  applyMotionPrefs,
  bootMotionPrefs,
  companionPhysics,
  effectiveVelocity,
  loadMotionPrefs,
  modeToAnimationLevel,
  normalizeMotionPrefs,
  onMotionPrefsChanged,
  particleBudget,
  prefersReducedMotion,
  resetMotionPrefs,
  saveMotionPrefs,
  type MotionModeId,
  type MotionPrefs,
  type ParticleDensityId,
} from './motionPrefs';

export {
  SPRING_PRESETS,
  createSpring,
  isSpringAtRest,
  retargetSpring,
  snapSpring,
  stepSpring,
  type SpringConfig,
  type SpringState,
} from './spring';

export {
  BURST_DEFAULTS,
  burstAlpha,
  clearBurst,
  countActive,
  createBurstPool,
  drawBurst,
  spawnBurst,
  stepBurst,
  type BurstConfig,
  type BurstParticle,
} from './rewardParticles';

export { fireReward, fireRewardAt, installRewardBursts, stopRewards } from './rewardBurst';
export { useCountUp, useMotionPrefs, useSpringValue } from './hooks';
export { default as LiquidMeter } from './LiquidMeter';
export { default as ScoreTicker } from './ScoreTicker';
