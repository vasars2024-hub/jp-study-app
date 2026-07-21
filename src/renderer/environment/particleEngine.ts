/**
 * Universal particle engine for the living desktop layer.
 * Canvas-only rAF loop — never touches React during the frame.
 *
 * Features: multi-preset particles, intensity scaling, firefly blink/glow,
 * and true snow accumulation along the bottom of the desk.
 */

export type ParticlePresetId =
  | 'fireflies'
  | 'rain'
  | 'snow'
  | 'dust'
  | 'leaves'
  | 'stars'
  | 'magic';

export interface ParticlePresetMeta {
  id: ParticlePresetId;
  label: string;
  /** Environment tags that auto-suggest this preset. */
  suggestTags: string[];
}

export const PARTICLE_PRESETS: ParticlePresetMeta[] = [
  { id: 'fireflies', label: 'Fireflies', suggestTags: ['night', 'evening', 'forest'] },
  { id: 'rain', label: 'Rain', suggestTags: ['rain', 'storm'] },
  { id: 'snow', label: 'Snow', suggestTags: ['winter', 'snow'] },
  { id: 'dust', label: 'Dust motes', suggestTags: ['day', 'morning', 'afternoon'] },
  { id: 'leaves', label: 'Leaves', suggestTags: ['autumn', 'forest'] },
  { id: 'stars', label: 'Stars', suggestTags: ['night'] },
  { id: 'magic', label: 'Magic motes', suggestTags: ['evening', 'night', 'aurora'] },
];

export interface Particle {
  kind: ParticlePresetId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  phase: number;
  hue: number;
  a: number;
  /** Firefly blink phase (seconds). */
  blink?: number;
  /** Firefly duty: how long the light stays on (0–1 of cycle). */
  duty?: number;
  /** Settled snowflake resting on the pile (drawn with pile, no fall). */
  settled?: boolean;
}

/** Horizontal snow pile samples (column heights in px). */
export interface SnowAccumulation {
  cols: number;
  heights: Float32Array;
  width: number;
  height: number;
}

export interface ParticleSimConfig {
  presets: ParticlePresetId[];
  density: number; // 0–1 count scale
  /** 0–1 visual strength (alpha + glow). */
  intensity: number;
  /** 0–1 radius scale for flakes / motes / glows. */
  size: number;
  /** Hard cap from performance tier × density. */
  maxParticles: number;
  width: number;
  height: number;
  /** Night-ish lighting: boost glow. */
  nightBoost: boolean;
  reduceMotion: boolean;
  /** Build ground snow piles when snow preset is active. */
  snowAccumulation: boolean;
  /**
   * Visual quality for adaptive FPS:
   * high = full glows · medium = simplified · low = dots only
   */
  quality?: 'high' | 'medium' | 'low';
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function tierMaxParticles(tier: 'off' | 'low' | 'medium' | 'high', density: number): number {
  if (tier === 'off') return 0;
  // Visible but not GPU-saturating on large desks.
  const base = tier === 'low' ? 48 : tier === 'medium' ? 110 : 180;
  // Density curve: 0 → few, 0.5 → ~70% of base, 1 → full base
  const d = Math.min(1, Math.max(0, density));
  const scale = 0.2 + d * 0.8;
  return Math.max(0, Math.round(base * scale));
}

export function suggestPresetsFromTags(tags: string[]): ParticlePresetId[] {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  const out: ParticlePresetId[] = [];
  for (const p of PARTICLE_PRESETS) {
    if (p.suggestTags.some((t) => set.has(t))) out.push(p.id);
  }
  if (!out.length && (set.has('night') || set.has('evening'))) out.push('fireflies', 'stars');
  if (!out.length && (set.has('winter') || set.has('snow'))) out.push('snow');
  if (!out.length) out.push('dust');
  return out;
}

/** Intensity scales alpha + glow. Floor so low slider still shows something. */
function intensityScale(intensity: number): number {
  return 0.45 + Math.min(1, Math.max(0, intensity)) * 1.35;
}

/** Size slider 0–1 → radius multiplier (~0.35× … ~2.2×). */
export function particleSizeScale(size: number): number {
  const s = Math.min(1, Math.max(0, size));
  return 0.35 + s * 1.85;
}

export function createSnowAccumulation(width: number, height: number, cols = 160): SnowAccumulation {
  const c = Math.max(32, Math.min(320, cols));
  return {
    cols: c,
    heights: new Float32Array(c),
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

export function resizeSnowAccumulation(field: SnowAccumulation, width: number, height: number): void {
  const old = field.heights;
  const oldW = field.width;
  field.width = Math.max(1, width);
  field.height = Math.max(1, height);
  if (Math.abs(oldW - field.width) < 1) return;
  // Resample heights into same column count across new width (keep visual mass).
  const next = new Float32Array(field.cols);
  for (let i = 0; i < field.cols; i++) {
    const t = (i + 0.5) / field.cols;
    const j = Math.min(field.cols - 1, Math.floor(t * field.cols));
    next[i] = old[j] ?? 0;
  }
  field.heights = next;
}

function pileAt(field: SnowAccumulation, x: number): number {
  const i = Math.min(field.cols - 1, Math.max(0, Math.floor((x / field.width) * field.cols)));
  return field.heights[i] ?? 0;
}

function depositSnow(field: SnowAccumulation, x: number, amount: number): void {
  const cols = field.cols;
  if (cols <= 0 || field.width <= 0) return;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor((x / field.width) * cols)));
  // Allow a visible bank along the desk edge (up to ~28% of canvas height).
  const maxH = Math.max(28, field.height * 0.28);
  const spread = 3;
  for (let d = -spread; d <= spread; d++) {
    const i = cx + d;
    if (i < 0 || i >= cols) continue;
    const falloff = 1 - Math.abs(d) / (spread + 1);
    field.heights[i] = Math.min(maxH, field.heights[i] + amount * falloff);
  }
  // Light neighbour blend (keep most mass at the impact column).
  if (cx > 0 && cx < cols - 1) {
    const avg = (field.heights[cx - 1] + field.heights[cx] + field.heights[cx + 1]) / 3;
    field.heights[cx] = field.heights[cx] * 0.82 + avg * 0.18;
  }
}

function meltSnow(field: SnowAccumulation, dt: number, rate: number): void {
  if (rate <= 0) return;
  // Constant melt — no per-frame random (random melt made piles / settled flakes jitter).
  const melt = rate * dt;
  if (melt <= 0) return;
  for (let i = 0; i < field.cols; i++) {
    if (field.heights[i] <= 0) continue;
    field.heights[i] = Math.max(0, field.heights[i] - melt);
  }
}

function spawnOne(kind: ParticlePresetId, w: number, h: number, night: boolean): Particle {
  switch (kind) {
    case 'rain':
      return {
        kind,
        x: rand(0, w),
        y: rand(-h * 0.2, 0),
        vx: rand(-30, -8),
        vy: rand(480, 820),
        r: rand(0.8, 1.8),
        life: 1,
        maxLife: 1,
        phase: rand(0, Math.PI * 2),
        hue: 200,
        a: rand(0.4, 0.75),
      };
    case 'snow': {
      // Steady fall; sway frequency lives in phase, amplitude in duty.
      // Avoid near-zero net velocity (old sin+vx cancel looked like stop–start).
      const vy = rand(48, 110);
      const fallDist = h + 140;
      const fallSec = fallDist / Math.max(32, vy);
      return {
        kind,
        x: rand(0, w),
        y: rand(-120, -12),
        // Constant horizontal drift (never fully cancelled by sway).
        vx: rand(-14, 14) || rand(4, 10) * (Math.random() < 0.5 ? -1 : 1),
        vy,
        r: rand(1.6, 4.2),
        life: 1,
        maxLife: fallSec + rand(2, 5),
        phase: rand(0, Math.PI * 2),
        // Reuse duty as sway angular speed (rad/s), blink as sway amplitude (px/s).
        duty: rand(0.7, 1.6),
        blink: rand(10, 22),
        hue: 0,
        a: rand(0.78, 1),
        settled: false,
      };
    }
    case 'dust':
      return {
        kind,
        x: rand(0, w),
        y: rand(0, h),
        vx: rand(-10, 10),
        vy: rand(-8, 8),
        r: rand(1.0, 2.4),
        life: rand(0.4, 1),
        maxLife: rand(5, 12),
        phase: rand(0, Math.PI * 2),
        hue: 40,
        a: rand(0.35, 0.7),
      };
    case 'leaves':
      return {
        kind,
        x: rand(0, w),
        y: rand(-30, h * 0.3),
        vx: rand(-40, 15),
        vy: rand(30, 80),
        r: rand(4, 9),
        life: 1,
        maxLife: 1,
        phase: rand(0, Math.PI * 2),
        hue: rand(15, 45),
        a: rand(0.7, 1),
      };
    case 'stars':
      return {
        kind,
        x: rand(0, w),
        y: rand(0, h * 0.65),
        vx: 0,
        vy: 0,
        r: rand(0.8, 2.4),
        life: rand(0.3, 1),
        maxLife: rand(3, 8),
        phase: rand(0, Math.PI * 2),
        hue: 50,
        a: rand(0.55, 1) * (night ? 1 : 0.55),
      };
    case 'magic':
      return {
        kind,
        x: rand(0, w),
        y: rand(0, h),
        vx: rand(-18, 18),
        vy: rand(-24, -5),
        r: rand(1.6, 3.4),
        life: 1,
        maxLife: rand(3, 7),
        phase: rand(0, Math.PI * 2),
        hue: rand(280, 330),
        a: rand(0.55, 0.95),
      };
    case 'fireflies':
    default:
      // Real fireflies: lower half of desk, slow drift, bright intermittent blink.
      return {
        kind: 'fireflies',
        x: rand(0, w),
        y: rand(h * 0.35, h * 0.92),
        vx: rand(-18, 18),
        vy: rand(-14, 14),
        r: rand(2.2, 4.2),
        life: 1,
        maxLife: rand(8, 18),
        phase: rand(0, Math.PI * 2),
        hue: rand(48, 72),
        a: night ? rand(0.85, 1) : rand(0.55, 0.85),
        blink: rand(0, 4),
        duty: rand(0.12, 0.35),
      };
  }
}

export function ensurePopulation(particles: Particle[], cfg: ParticleSimConfig): void {
  if (cfg.reduceMotion || cfg.maxParticles <= 0 || !cfg.presets.length) {
    particles.length = 0;
    return;
  }
  const allowed = new Set(cfg.presets);
  for (let i = particles.length - 1; i >= 0; i--) {
    if (!allowed.has(particles[i].kind)) {
      particles.splice(i, 1);
    }
  }
  let flying = 0;
  let settled = 0;
  for (const p of particles) {
    if (p.kind === 'snow' && p.settled) settled++;
    else flying++;
  }
  const settledCap = Math.min(80, Math.floor(cfg.maxParticles * 0.35));
  if (settled > settledCap) {
    let drop = settled - settledCap;
    for (let i = 0; i < particles.length && drop > 0; i++) {
      if (particles[i].kind === 'snow' && particles[i].settled) {
        particles.splice(i, 1);
        i--;
        drop--;
        settled--;
      }
    }
  }
  const targetFlying = cfg.maxParticles;
  while (flying < targetFlying) {
    const kind = cfg.presets[Math.floor(Math.random() * cfg.presets.length)];
    particles.push(spawnOne(kind, cfg.width, cfg.height, cfg.nightBoost));
    flying++;
  }
  const hardCap = cfg.maxParticles + settledCap;
  if (particles.length > hardCap) particles.length = hardCap;
}

export function stepParticles(
  particles: Particle[],
  dt: number,
  cfg: ParticleSimConfig,
  snow?: SnowAccumulation | null,
): void {
  if (cfg.reduceMotion) return;
  const w = cfg.width;
  const h = cfg.height;
  const snowOn = cfg.presets.includes('snow') && cfg.snowAccumulation && snow;

  if (snow) {
    if (snow.width !== w || snow.height !== h) resizeSnowAccumulation(snow, w, h);
    if (!cfg.presets.includes('snow')) {
      // Melt quickly when snow weather leaves
      meltSnow(snow, dt, 10);
    } else if (snowOn) {
      // Gentle melt so banks build under active snowfall (was 0.35 — melted faster than deposits).
      meltSnow(snow, dt, 0.04);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.phase += dt;
    // Falling snow keeps full opacity until ground; settled flakes age slowly.
    if (p.kind === 'snow' && !p.settled) {
      /* life reserved for settled dwell */
    } else if (p.kind !== 'snow' || !p.settled) {
      p.life -= dt / Math.max(0.001, p.maxLife);
    }

    switch (p.kind) {
      case 'rain':
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > h + 10 || p.x < -20) {
          p.x = rand(0, w);
          p.y = rand(-40, -5);
          p.life = 1;
        }
        break;
      case 'snow': {
        if (p.settled) {
          // Sit on pile; ease toward bank height (no hard snap each frame).
          const pile = snow ? pileAt(snow, p.x) : 0;
          const S = particleSizeScale(cfg.size ?? 0.55);
          const targetY = h - pile - p.r * S * 0.55;
          p.y += (targetY - p.y) * Math.min(1, 6 * dt);
          p.life -= dt / Math.max(0.8, p.maxLife);
          if (p.life <= 0) {
            Object.assign(p, spawnOne('snow', w, h, cfg.nightBoost));
          }
          break;
        }
        // Continuous fall + smooth lateral sway (phase advances steadily).
        const swayHz = p.duty ?? 1.1;
        const swayAmp = p.blink ?? 14; // px/s peak lateral from sway
        p.phase += swayHz * dt;
        // Base drift always present; sway is additive cosine so motion never stalls.
        const vxi = p.vx + Math.cos(p.phase) * swayAmp;
        p.x += vxi * dt;
        p.y += p.vy * dt;
        // Soft approach to terminal fall speed (no jumpy accel spikes).
        const terminal = 95 + p.r * 6;
        p.vy += (terminal - p.vy) * Math.min(1, 0.35 * dt);
        if (p.x < -12) p.x = w + 12;
        if (p.x > w + 12) p.x = -12;

        // Ground is the canvas bottom, or the top of the local snow bank.
        const pile = snowOn && snow ? pileAt(snow, p.x) : 0;
        const groundY = snowOn && snow ? h - pile : h + 2;
        if (p.y + p.r >= groundY) {
          // Snap exactly onto ground to avoid multi-frame bounce/stutter at impact.
          p.y = groundY - p.r;
          if (snowOn && snow) {
            const S = particleSizeScale(cfg.size ?? 0.55);
            const amount =
              p.r * S * (1.15 + cfg.intensity * 0.9) * (0.85 + cfg.density * 0.4);
            depositSnow(snow, p.x, amount);
            // Keep a fraction of flakes resting on the bank for visual accumulation.
            if (Math.random() < 0.22) {
              p.settled = true;
              p.vx = 0;
              p.vy = 0;
              p.life = 1;
              p.maxLife = rand(2.5, 7);
              p.y = h - pileAt(snow, p.x) - p.r * S * 0.55;
              p.a = Math.min(1, p.a * 1.05);
            } else {
              Object.assign(p, spawnOne('snow', w, h, cfg.nightBoost));
            }
          } else {
            Object.assign(p, spawnOne('snow', w, h, cfg.nightBoost));
          }
        }
        break;
      }
      case 'dust':
        p.x += (p.vx + Math.sin(p.phase * 0.7) * 6) * dt;
        p.y += (p.vy + Math.cos(p.phase * 0.5) * 4) * dt;
        if (p.life <= 0) {
          Object.assign(p, spawnOne('dust', w, h, cfg.nightBoost));
        }
        wrap(p, w, h);
        break;
      case 'leaves':
        p.x += (p.vx + Math.sin(p.phase * 2) * 25) * dt;
        p.y += p.vy * dt;
        p.phase += dt * 2;
        if (p.y > h + 20) {
          p.y = -15;
          p.x = rand(0, w);
        }
        break;
      case 'stars':
        if (p.life <= 0) {
          p.life = 1;
          p.phase = rand(0, Math.PI * 2);
        }
        break;
      case 'magic':
        p.x += (p.vx + Math.sin(p.phase) * 8) * dt;
        p.y += p.vy * dt;
        if (p.life <= 0 || p.y < -20) {
          Object.assign(p, spawnOne('magic', w, h, cfg.nightBoost));
        }
        wrap(p, w, h);
        break;
      case 'fireflies':
      default: {
        // Drift + occasional dart (more firefly-like than smooth orbit)
        p.blink = (p.blink ?? 0) + dt;
        const cycle = 1.8 + (p.duty ?? 0.2) * 4;
        if (p.blink > cycle) {
          p.blink = 0;
          p.duty = rand(0.1, 0.4);
          // Dart to a nearby hover point
          if (Math.random() < 0.45) {
            p.vx = rand(-40, 40);
            p.vy = rand(-28, 28);
          }
        }
        // Soft acceleration toward mild hover
        p.vx += Math.sin(p.phase * 0.6) * 6 * dt;
        p.vy += Math.cos(p.phase * 0.5) * 5 * dt;
        p.vx *= 1 - 0.4 * dt;
        p.vy *= 1 - 0.4 * dt;
        p.x += p.vx * dt + Math.sin(p.phase * 0.9) * 8 * dt;
        p.y += p.vy * dt + Math.cos(p.phase * 0.7) * 6 * dt;
        // Keep in lower canopy band
        if (p.y < h * 0.2) p.vy += 20 * dt;
        if (p.y > h * 0.96) p.vy -= 20 * dt;
        if (p.life <= 0) {
          Object.assign(p, spawnOne('fireflies', w, h, cfg.nightBoost));
        }
        wrap(p, w, h);
        break;
      }
    }
  }
}

function wrap(p: Particle, w: number, h: number): void {
  if (p.x < -20) p.x = w + 20;
  if (p.x > w + 20) p.x = -20;
  if (p.y < -20) p.y = h + 20;
  if (p.y > h + 20) p.y = -20;
}

function fireflyBrightness(p: Particle): number {
  // Classic firefly: mostly dark, brief warm flash
  const blink = p.blink ?? 0;
  const duty = p.duty ?? 0.22;
  const cycle = 1.8 + duty * 4;
  const t = (blink % cycle) / cycle;
  if (t < duty) {
    // Soft attack/release envelope
    const local = t / duty;
    const env = local < 0.2 ? local / 0.2 : local > 0.7 ? (1 - local) / 0.3 : 1;
    return Math.max(0, Math.min(1, env));
  }
  // Dim residual glow so you still see them float
  return 0.04 + 0.06 * Math.sin(p.phase * 2);
}

export function drawParticles(
  g: CanvasRenderingContext2D,
  particles: Particle[],
  cfg: ParticleSimConfig,
  snow?: SnowAccumulation | null,
): void {
  g.clearRect(0, 0, cfg.width, cfg.height);
  if (cfg.reduceMotion) return;

  const I = intensityScale(cfg.intensity);
  const S = particleSizeScale(cfg.size ?? 0.55);
  const night = cfg.nightBoost ? 1.15 : 1;
  const q = cfg.quality ?? 'high';
  const simpleGlow = q !== 'high';

  // Snow piles first (under falling flakes) — skip detail piles on low quality
  if (
    q !== 'low' &&
    snow &&
    cfg.snowAccumulation &&
    (cfg.presets.includes('snow') || hasMass(snow))
  ) {
    drawSnowPiles(g, snow, I);
  }

  if (!particles.length) return;

  // Additive-ish soft light for fireflies/magic (helps visibility on dark walls)
  const prevComp = g.globalCompositeOperation;

  for (const p of particles) {
    if (p.kind === 'fireflies' || p.kind === 'magic' || p.kind === 'stars') {
      g.globalCompositeOperation = 'lighter';
    } else {
      g.globalCompositeOperation = prevComp === 'lighter' ? 'source-over' : prevComp;
    }

    // Falling snow ignores life fade (life only ages settled flakes).
    const lifeFade =
      p.kind === 'snow' && !p.settled
        ? 1
        : Math.min(1, Math.max(0, p.life + 0.25));
    const alpha = Math.max(0, Math.min(1, p.a * I * night * lifeFade));
    const R = p.r * S;

    if (p.kind === 'rain') {
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = `rgba(190, 215, 245, ${alpha})`;
      g.lineWidth = R * (0.8 + cfg.intensity * 0.6);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + p.vx * 0.018, p.y + 14 + R * 5);
      g.stroke();
      continue;
    }

    if (p.kind === 'leaves') {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `hsla(${p.hue}, 72%, 44%, ${alpha})`;
      g.beginPath();
      g.ellipse(p.x, p.y, R, R * 0.55, p.phase, 0, Math.PI * 2);
      g.fill();
      continue;
    }

    if (p.kind === 'fireflies') {
      const flash = fireflyBrightness(p);
      const a = Math.min(1, alpha * (0.15 + flash * 1.5));
      if (a < 0.02) continue;
      if (simpleGlow) {
        // Solid discs — no createRadialGradient (huge win when FPS dips)
        const core = R * (1.2 + flash * 1.4);
        g.fillStyle = `rgba(255, 240, 120, ${a})`;
        g.beginPath();
        g.arc(p.x, p.y, core, 0, Math.PI * 2);
        g.fill();
        if (q === 'medium' && flash > 0.2) {
          g.fillStyle = `rgba(180, 255, 70, ${a * 0.25})`;
          g.beginPath();
          g.arc(p.x, p.y, core * 2.2, 0, Math.PI * 2);
          g.fill();
        }
        continue;
      }
      const glow = R * (5.5 + cfg.intensity * 7) * (0.55 + flash * 0.9);
      const core = R * (0.55 + flash * 0.9);
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      grad.addColorStop(0, `rgba(255, 255, 160, ${a})`);
      grad.addColorStop(0.15, `rgba(255, 230, 90, ${a * 0.95})`);
      grad.addColorStop(0.4, `rgba(180, 255, 70, ${a * 0.45})`);
      grad.addColorStop(0.75, `rgba(80, 180, 40, ${a * 0.12})`);
      grad.addColorStop(1, 'rgba(40, 100, 20, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(p.x, p.y, glow, 0, Math.PI * 2);
      g.fill();
      if (flash > 0.15) {
        g.fillStyle = `rgba(255, 255, 220, ${Math.min(1, a * 1.1)})`;
        g.beginPath();
        g.arc(p.x, p.y, core, 0, Math.PI * 2);
        g.fill();
      }
      continue;
    }

    if (p.kind === 'magic') {
      const twinkle = 0.55 + 0.45 * Math.sin(p.phase * 2.2);
      const a = alpha * twinkle;
      if (simpleGlow) {
        g.fillStyle = `hsla(${p.hue}, 90%, 70%, ${a})`;
        g.beginPath();
        g.arc(p.x, p.y, R * 1.6, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      const glow = R * (3.5 + cfg.intensity * 4);
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      grad.addColorStop(0, `hsla(${p.hue}, 95%, 78%, ${a})`);
      grad.addColorStop(0.4, `hsla(${p.hue}, 85%, 58%, ${a * 0.4})`);
      grad.addColorStop(1, `hsla(${p.hue}, 80%, 50%, 0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(p.x, p.y, glow, 0, Math.PI * 2);
      g.fill();
      continue;
    }

    if (p.kind === 'stars') {
      const twinkle = 0.45 + 0.55 * Math.sin(p.phase * 3);
      const a = alpha * twinkle;
      g.fillStyle = `rgba(255, 250, 230, ${a})`;
      g.beginPath();
      g.arc(p.x, p.y, R * (0.9 + cfg.intensity * 0.5), 0, Math.PI * 2);
      g.fill();
      if (a > 0.55) {
        const arm = R * (2.4 + cfg.intensity);
        g.strokeStyle = `rgba(255, 255, 255, ${a * 0.4})`;
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(p.x - arm, p.y);
        g.lineTo(p.x + arm, p.y);
        g.moveTo(p.x, p.y - arm);
        g.lineTo(p.x, p.y + arm);
        g.stroke();
      }
      continue;
    }

    // snow / dust
    g.globalCompositeOperation = 'source-over';
    if (p.kind === 'snow') {
      const r = R * (0.9 + cfg.intensity * 0.4) * (p.settled ? 0.85 : 1);
      const a = p.settled ? Math.min(1, alpha * 0.95) : Math.min(1, alpha);
      g.fillStyle = `rgba(255, 255, 255, ${a})`;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      // Soft halo so flakes read on light walls too
      g.fillStyle = `rgba(230, 240, 255, ${a * 0.28})`;
      g.beginPath();
      g.arc(p.x, p.y, r * 1.75, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = `rgba(255, 230, 180, ${alpha})`;
      g.beginPath();
      g.arc(p.x, p.y, R * (1 + cfg.intensity * 0.3), 0, Math.PI * 2);
      g.fill();
    }
  }

  g.globalCompositeOperation = 'source-over';
}

function hasMass(snow: SnowAccumulation): boolean {
  for (let i = 0; i < snow.cols; i++) {
    if (snow.heights[i] > 0.5) return true;
  }
  return false;
}

function drawSnowPiles(g: CanvasRenderingContext2D, snow: SnowAccumulation, intensity: number): void {
  const { cols, heights, width, height } = snow;
  if (!cols || width <= 0 || height <= 0) return;
  let max = 0;
  for (let i = 0; i < cols; i++) max = Math.max(max, heights[i]);
  // Draw as soon as any real bank exists (was 0.4 — often never reached under melt).
  if (max < 0.15) return;

  const a = Math.min(0.98, 0.62 + intensity * 0.28);
  g.beginPath();
  g.moveTo(0, height);
  for (let i = 0; i < cols; i++) {
    const x = ((i + 0.5) / cols) * width;
    const y = height - Math.max(0, heights[i]);
    g.lineTo(x, y);
  }
  g.lineTo(width, height);
  g.closePath();
  const grad = g.createLinearGradient(0, height - max, 0, height);
  grad.addColorStop(0, `rgba(255, 255, 255, ${a * 0.92})`);
  grad.addColorStop(0.5, `rgba(238, 244, 255, ${a * 0.78})`);
  grad.addColorStop(1, `rgba(200, 212, 230, ${a * 0.55})`);
  g.fillStyle = grad;
  g.fill();

  // Soft top sparkle edge
  g.strokeStyle = `rgba(255, 255, 255, ${a * 0.55})`;
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < cols; i++) {
    const x = ((i + 0.5) / cols) * width;
    const y = height - Math.max(0, heights[i]);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}
