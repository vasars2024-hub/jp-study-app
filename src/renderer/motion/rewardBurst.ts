/**
 * Reward burst controller (Phase 4.5) — the single rAF loop for celebration
 * confetti. Views fire `fireReward(x, y)` from anywhere; nothing needs to be
 * mounted or threaded through props.
 *
 * Rules this enforces (plan pitfalls):
 *  - ONE loop for all bursts, started on demand and **stopped at zero alive**
 *  - the pool is allocated once per density change, never per burst
 *  - the canvas is sized to the window, so confetti is bounded by it
 */
import {
  clearBurst,
  createBurstPool,
  drawBurst,
  spawnBurst,
  stepBurst,
  BURST_DEFAULTS,
  type BurstConfig,
  type BurstParticle,
} from './rewardParticles';
import { loadMotionPrefs, particleBudget } from './motionPrefs';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let pool: BurstParticle[] = [];
let poolBudget = -1;
let raf = 0;
let lastFrame = 0;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (ctx && canvas?.isConnected) return ctx;
  if (typeof document === 'undefined') return null;
  canvas = document.createElement('canvas');
  canvas.className = 'motion-reward-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resizeCanvas();
  return ctx;
}

function resizeCanvas(): void {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function config(): BurstConfig {
  return {
    ...BURST_DEFAULTS,
    bounds: { width: window.innerWidth, height: window.innerHeight },
  };
}

function frame(now: number): void {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 1 / 60;
  lastFrame = now;
  const cfg = config();
  const alive = stepBurst(pool, cfg, dt);
  if (ctx) drawBurst(ctx, pool, cfg);
  if (alive > 0) {
    raf = requestAnimationFrame(frame);
  } else {
    // Idle: stop the loop entirely rather than spinning on an empty pool.
    stopLoop();
  }
}

function startLoop(): void {
  if (raf) return;
  lastFrame = 0;
  raf = requestAnimationFrame(frame);
}

function stopLoop(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastFrame = 0;
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Fire a celebration burst at viewport coordinates. Silently does nothing when
 * density is Off or Motion Mode is Disabled — callers never have to check.
 */
export function fireReward(
  x: number,
  y: number,
  opts: { count?: number; hueBase?: number; power?: number } = {},
): void {
  const prefs = loadMotionPrefs();
  const budget = particleBudget(prefs);
  if (budget <= 0) return;

  if (budget !== poolBudget) {
    pool = createBurstPool(budget);
    poolBudget = budget;
  }
  const g = ensureCanvas();
  if (!g) return;
  resizeCanvas();

  spawnBurst(pool, x, y, Math.min(opts.count ?? budget, budget), {
    hueBase: opts.hueBase,
    power: opts.power,
    // A cone, not a sphere: reads as a celebration launch rather than an explosion.
    spread: Math.PI * 0.9,
  });
  startLoop();
}

/** Fire centred on an element (badge reveal, level-up meter, score card). */
export function fireRewardAt(el: Element | null, opts?: Parameters<typeof fireReward>[2]): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  fireReward(r.left + r.width / 2, r.top + r.height / 2, opts);
}

/** Tear down on view change / lifecycle suspend. */
export function stopRewards(): void {
  clearBurst(pool);
  stopLoop();
}

export function installRewardBursts(): () => void {
  const onResize = () => resizeCanvas();
  const onVis = () => {
    if (document.hidden) stopRewards();
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    stopRewards();
    canvas?.remove();
    canvas = null;
    ctx = null;
  };
}
