/**
 * Reward burst particles (Phase 4.5) — pure sim for badge/level-up confetti.
 *
 * NOT the same thing as `environment/particleEngine.ts`: that is a continuous
 * ambient weather sim whose population is topped back up forever. A reward
 * burst is the opposite lifecycle — a finite spawn that drains to empty and
 * lets the rAF loop stop. Sharing one module would mean one of the two
 * lifecycles is always fighting the other.
 *
 * Plan constraints encoded here:
 *  - pool objects, never allocate per frame
 *  - cap by the density setting
 *  - confetti must never leave the window (`bounds`)
 */

export interface BurstParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation in radians + spin rate, for the ribbon look. */
  rot: number;
  spin: number;
  w: number;
  h: number;
  hue: number;
  life: number;
  maxLife: number;
}

export interface BurstBounds {
  width: number;
  height: number;
}

export interface BurstConfig {
  gravity: number;
  /** Per-second velocity retention (air drag). */
  drag: number;
  /** Energy kept on a wall/floor hit. */
  restitution: number;
  bounds: BurstBounds;
}

export const BURST_DEFAULTS: Omit<BurstConfig, 'bounds'> = {
  gravity: 1400,
  drag: 0.82,
  restitution: 0.42,
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A fixed-size pool. `budget` comes from the density setting. */
export function createBurstPool(budget: number): BurstParticle[] {
  const n = Math.max(0, Math.floor(budget));
  const pool: BurstParticle[] = new Array(n);
  for (let i = 0; i < n; i++) {
    pool[i] = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      spin: 0,
      w: 0,
      h: 0,
      hue: 0,
      life: 0,
      maxLife: 1,
    };
  }
  return pool;
}

/**
 * Light up to `count` pooled particles at (x, y). Reuses dead slots; when the
 * pool is exhausted the burst is simply smaller — it never grows the array,
 * so density is a hard ceiling on memory and per-frame cost.
 *
 * Returns how many were actually spawned.
 */
export function spawnBurst(
  pool: BurstParticle[],
  x: number,
  y: number,
  count: number,
  opts: { hueBase?: number; spread?: number; power?: number } = {},
): number {
  const hueBase = opts.hueBase ?? rand(0, 360);
  const spread = opts.spread ?? Math.PI * 2;
  const power = opts.power ?? 1;
  let spawned = 0;
  for (let i = 0; i < pool.length && spawned < count; i++) {
    const p = pool[i];
    if (p.active) continue;
    // Bias upward: gravity should be what brings the burst down, so the
    // arc reads as thrown rather than sprayed.
    const angle = -Math.PI / 2 + rand(-spread / 2, spread / 2);
    const speed = rand(220, 620) * power;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.rot = rand(0, Math.PI * 2);
    p.spin = rand(-14, 14);
    p.w = rand(5, 11);
    p.h = rand(3, 7);
    p.hue = (hueBase + rand(-40, 40) + 360) % 360;
    p.maxLife = rand(0.9, 1.8);
    p.life = p.maxLife;
    spawned++;
  }
  return spawned;
}

/**
 * Advance the sim. Returns the number still alive — the caller stops its rAF
 * loop at 0 rather than idling forever (plan: "must not ... leave a running
 * loop").
 */
export function stepBurst(pool: BurstParticle[], cfg: BurstConfig, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return countActive(pool);
  const h = Math.min(0.05, dt);
  const { width, height } = cfg.bounds;
  const dragFactor = Math.pow(cfg.drag, h);
  let alive = 0;

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;

    p.life -= h;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }

    p.vy += cfg.gravity * h;
    p.vx *= dragFactor;
    p.vy *= dragFactor;
    p.x += p.vx * h;
    p.y += p.vy * h;
    p.rot += p.spin * h;

    // Window boundaries: confetti bounces back in, never escapes.
    const r = Math.max(p.w, p.h) * 0.5;
    if (p.x - r < 0) {
      p.x = r;
      p.vx = Math.abs(p.vx) * cfg.restitution;
    } else if (p.x + r > width) {
      p.x = width - r;
      p.vx = -Math.abs(p.vx) * cfg.restitution;
    }
    if (p.y - r < 0) {
      p.y = r;
      p.vy = Math.abs(p.vy) * cfg.restitution;
    } else if (p.y + r > height) {
      p.y = height - r;
      p.vy = -Math.abs(p.vy) * cfg.restitution;
      // Floor friction, else pieces skate along the bottom edge forever.
      p.vx *= 0.7;
    }

    alive++;
  }
  return alive;
}

export function countActive(pool: BurstParticle[]): number {
  let n = 0;
  for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
  return n;
}

export function clearBurst(pool: BurstParticle[]): void {
  for (let i = 0; i < pool.length; i++) pool[i].active = false;
}

/** Alpha for a particle — fades out over the tail of its life. */
export function burstAlpha(p: BurstParticle): number {
  const t = p.maxLife <= 0 ? 0 : p.life / p.maxLife;
  return Math.max(0, Math.min(1, t < 0.3 ? t / 0.3 : 1));
}

export function drawBurst(g: CanvasRenderingContext2D, pool: BurstParticle[], cfg: BurstConfig): void {
  g.clearRect(0, 0, cfg.bounds.width, cfg.bounds.height);
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;
    const a = burstAlpha(p);
    if (a <= 0.01) continue;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillStyle = `hsla(${p.hue}, 85%, 62%, ${a})`;
    g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    g.restore();
  }
}
