import { describe, expect, it } from 'vitest';
import {
  BURST_DEFAULTS,
  burstAlpha,
  clearBurst,
  countActive,
  createBurstPool,
  spawnBurst,
  stepBurst,
  type BurstConfig,
} from '../../renderer/motion/rewardParticles';

const cfg = (width = 800, height = 600): BurstConfig => ({
  ...BURST_DEFAULTS,
  bounds: { width, height },
});

describe('reward particles', () => {
  it('pools up front — the pool never grows past the density budget', () => {
    const pool = createBurstPool(24);
    expect(pool).toHaveLength(24);
    // Ask for far more than the budget allows.
    const spawned = spawnBurst(pool, 100, 100, 500);
    expect(spawned).toBe(24);
    expect(pool).toHaveLength(24);
    expect(countActive(pool)).toBe(24);
  });

  it('an off budget spawns nothing rather than erroring', () => {
    const pool = createBurstPool(0);
    expect(pool).toHaveLength(0);
    expect(spawnBurst(pool, 10, 10, 50)).toBe(0);
    expect(stepBurst(pool, cfg(), 1 / 60)).toBe(0);
  });

  it('reuses dead slots instead of allocating', () => {
    const pool = createBurstPool(8);
    spawnBurst(pool, 50, 50, 8);
    const identities = pool.map((p) => p);
    clearBurst(pool);
    expect(countActive(pool)).toBe(0);
    spawnBurst(pool, 90, 90, 8);
    expect(countActive(pool)).toBe(8);
    // Same object references — no per-burst allocation.
    pool.forEach((p, i) => expect(p).toBe(identities[i]));
  });

  it('confetti never leaves the window', () => {
    const pool = createBurstPool(60);
    const c = cfg(400, 300);
    // Max power, aimed in every direction, from a corner.
    spawnBurst(pool, 5, 5, 60, { power: 3, spread: Math.PI * 2 });
    for (let i = 0; i < 400; i++) {
      stepBurst(pool, c, 1 / 60);
      for (const p of pool) {
        if (!p.active) continue;
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(400);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(300);
      }
    }
  });

  it('drains to empty so the rAF loop can stop', () => {
    const pool = createBurstPool(40);
    const c = cfg();
    spawnBurst(pool, 400, 300, 40);
    let alive = countActive(pool);
    expect(alive).toBe(40);
    // Longest maxLife is 1.8s; 4s of frames must finish every particle.
    for (let i = 0; i < 240 && alive > 0; i++) {
      alive = stepBurst(pool, c, 1 / 60);
    }
    expect(alive).toBe(0);
    expect(countActive(pool)).toBe(0);
  });

  it('stays finite through a long stalled frame', () => {
    const pool = createBurstPool(10);
    const c = cfg();
    spawnBurst(pool, 400, 300, 10);
    stepBurst(pool, c, 5);
    for (const p of pool) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('fades out over the tail of life, not the whole flight', () => {
    const pool = createBurstPool(1);
    spawnBurst(pool, 100, 100, 1);
    const p = pool[0];
    p.life = p.maxLife;
    expect(burstAlpha(p)).toBe(1);
    p.life = p.maxLife * 0.5;
    expect(burstAlpha(p)).toBe(1);
    p.life = p.maxLife * 0.15;
    expect(burstAlpha(p)).toBeGreaterThan(0);
    expect(burstAlpha(p)).toBeLessThan(1);
    p.life = 0;
    expect(burstAlpha(p)).toBe(0);
  });
});
