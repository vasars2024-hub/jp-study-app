import { describe, expect, it } from 'vitest';
import {
  createSpring,
  isSpringAtRest,
  retargetSpring,
  snapSpring,
  SPRING_PRESETS,
  stepSpring,
} from '../../renderer/motion/spring';

/** Run a spring to rest (or until the frame budget runs out). */
function settle(state: ReturnType<typeof createSpring>, cfg = SPRING_PRESETS.slide, maxFrames = 2000) {
  let frames = 0;
  while (!isSpringAtRest(state, cfg) && frames < maxFrames) {
    stepSpring(state, cfg, 1 / 60);
    frames++;
  }
  return frames;
}

describe('spring', () => {
  it('converges on its target and stops exactly there', () => {
    const s = createSpring(0, 100);
    const frames = settle(s);
    expect(frames).toBeLessThan(2000);
    expect(s.value).toBe(100);
    expect(s.velocity).toBe(0);
  });

  it('a critically damped spring does not overshoot', () => {
    const s = createSpring(0, 100);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      stepSpring(s, SPRING_PRESETS.meter, 1 / 60);
      peak = Math.max(peak, s.value);
    }
    expect(peak).toBeLessThanOrEqual(100.001);
  });

  it('the pop preset overshoots — that is what makes it feel springy', () => {
    const s = createSpring(0, 100);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      stepSpring(s, SPRING_PRESETS.pop, 1 / 60);
      peak = Math.max(peak, s.value);
    }
    expect(peak).toBeGreaterThan(100);
  });

  it('retargets mid-flight from the current position, carrying velocity', () => {
    const s = createSpring(0, 100);
    for (let i = 0; i < 8; i++) stepSpring(s, SPRING_PRESETS.slide, 1 / 60);
    const midValue = s.value;
    const midVelocity = s.velocity;
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(100);

    // The interruption: a second view switch. Position/velocity must survive.
    retargetSpring(s, -50);
    expect(s.value).toBe(midValue);
    expect(s.velocity).toBe(midVelocity);

    settle(s);
    expect(s.value).toBe(-50);
  });

  it('a long frame does not explode the integration', () => {
    const s = createSpring(0, 100);
    // A 2-second stall (GC pause / dragged window) must stay bounded.
    stepSpring(s, SPRING_PRESETS.toss, 2);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(Math.abs(s.value)).toBeLessThan(1000);
  });

  it('ignores non-advancing frames', () => {
    const s = createSpring(0, 100);
    stepSpring(s, SPRING_PRESETS.slide, 0);
    stepSpring(s, SPRING_PRESETS.slide, -1);
    stepSpring(s, SPRING_PRESETS.slide, Number.NaN);
    expect(s.value).toBe(0);
    expect(s.velocity).toBe(0);
  });

  it('snap jumps to the target with no residual velocity', () => {
    const s = createSpring(0, 100);
    for (let i = 0; i < 10; i++) stepSpring(s, SPRING_PRESETS.pop, 1 / 60);
    snapSpring(s);
    expect(s.value).toBe(100);
    expect(s.velocity).toBe(0);
    expect(isSpringAtRest(s, SPRING_PRESETS.pop)).toBe(true);
  });

  it('a spring already at rest stays put', () => {
    const s = createSpring(42, 42);
    expect(isSpringAtRest(s, SPRING_PRESETS.slide)).toBe(true);
    stepSpring(s, SPRING_PRESETS.slide, 1 / 60);
    expect(s.value).toBe(42);
  });
});
