/**
 * Full-desk particle canvas — pure rAF, no React in the loop.
 * Adaptive quality/budget via perfHub keeps desktop interaction at ~60 FPS.
 */
import { useEffect, useRef } from 'react';
import type { EnvironmentSettings } from './types';
import { resolveWall } from './schedules';
import { getWallPreset } from './wallCatalog';
import {
  createSnowAccumulation,
  drawParticles,
  ensurePopulation,
  resizeSnowAccumulation,
  stepParticles,
  suggestPresetsFromTags,
  tierMaxParticles,
  type Particle,
  type ParticlePresetId,
  type ParticleSimConfig,
  type SnowAccumulation,
} from './particleEngine';
import {
  perfGetBudget,
  perfGetQuality,
  perfIsInteracting,
  perfSampleFrame,
  perfSetParticleCount,
} from '../perf/perfHub';
import { particlesForWall } from './frameworkBridge';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 2;

function activeTags(env: EnvironmentSettings): string[] {
  if (env.rotationEnabled) {
    const resolved = resolveWall(env);
    if (resolved?.item.tags?.length) return resolved.item.tags;
    if (resolved?.item.kind === 'preset') {
      return getWallPreset(resolved.item.ref).tags ?? [];
    }
  }
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return ['morning', 'day'];
  if (h >= 11 && h < 17) return ['day', 'afternoon'];
  if (h >= 17 && h < 21) return ['evening'];
  return ['night'];
}

function isNightish(tags: string[]): boolean {
  return tags.some((t) => t === 'night' || t === 'evening');
}

function resolvePresets(env: EnvironmentSettings): ParticlePresetId[] {
  if (env.matchParticleSuggestions) {
    // Prefer explicit wallpaper-framework metadata for the active wall
    // (Phase 3 · M1), else fall back to the tag heuristic.
    if (env.rotationEnabled) {
      const fw = particlesForWall(resolveWall(env)?.item.ref);
      if (fw.length) return fw;
    }
    return suggestPresetsFromTags(activeTags(env));
  }
  // No fallback: an empty selection means the user turned every preset off.
  return env.particlePresets ?? [];
}

function secretLifecycleSuspended(): boolean {
  return document.documentElement.classList.contains('secret-lifecycle-suspended');
}

export default function ParticleLayer({ env }: { env: EnvironmentSettings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const envRef = useRef(env);
  envRef.current = env;

  const hardOn = env.enabled && env.particlesEnabled && env.performanceTier !== 'off';

  useEffect(() => {
    if (!hardOn) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const g =
      canvas.getContext('2d', { alpha: true, desynchronized: true } as CanvasRenderingContext2DSettings) ??
      canvas.getContext('2d');
    if (!g) return;

    const particles: Particle[] = [];
    let snow: SnowAccumulation = createSnowAccumulation(1, 1);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let running = !document.hidden && !secretLifecycleSuspended();
    let cfgCache: ParticleSimConfig | null = null;
    let cfgAt = 0;
    let skipDraw = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
      const q = perfGetQuality();
      const dprCap = q === 'low' ? 1 : q === 'medium' ? 1.15 : 1.25;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (canvas.width === Math.floor(w * dpr) && canvas.height === Math.floor(h * dpr)) {
        return { w, h };
      }
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      resizeSnowAccumulation(snow, w, h);
      cfgCache = null;
      return { w, h };
    };

    let size = resize();
    let resizeQueued = false;
    const ro = new ResizeObserver(() => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        if (!running) return;
        size = resize();
      });
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const buildCfg = (): ParticleSimConfig => {
      const now = performance.now();
      if (cfgCache && now - cfgAt < 120) {
        cfgCache.width = size.w;
        cfgCache.height = size.h;
        cfgCache.quality = perfGetQuality();
        const budget = perfGetBudget();
        const base = tierMaxParticles(envRef.current.performanceTier, envRef.current.particleDensity);
        cfgCache.maxParticles = Math.max(0, Math.round(base * budget));
        return cfgCache;
      }
      const e = envRef.current;
      const tags = activeTags(e);
      const reduceMotion = document.documentElement.classList.contains('reduce-motion') || secretLifecycleSuspended();
      const presets = resolvePresets(e);
      const budget = perfGetBudget();
      const base = tierMaxParticles(e.performanceTier, e.particleDensity);
      cfgCache = {
        presets,
        density: e.particleDensity,
        intensity: e.particleIntensity ?? 0.8,
        size: e.particleSize ?? 0.55,
        maxParticles: Math.max(0, Math.round(base * budget)),
        width: size.w,
        height: size.h,
        nightBoost: isNightish(tags),
        reduceMotion,
        snowAccumulation: e.snowAccumulation !== false,
        quality: perfGetQuality(),
      };
      cfgAt = now;
      return cfgCache;
    };

    const onVis = () => {
      const shouldRun = !document.hidden && !secretLifecycleSuspended();
      if (!shouldRun) {
        running = false;
        cancelAnimationFrame(raf);
        particles.length = 0;
        perfSetParticleCount(0);
        try {
          g.clearRect(0, 0, size.w, size.h);
        } catch {
          /* ignore */
        }
      } else if (!running) {
        running = true;
        last = performance.now();
        acc = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('secret:lifecycle', onVis);

    const frame = (now: number) => {
      if (!running) return;
      let frameDt = (now - last) / 1000;
      const dtMs = now - last;
      last = now;
      if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = FIXED_DT;
      if (frameDt > 0.25) {
        frameDt = FIXED_DT;
        acc = 0;
      }
      acc += frameDt;
      perfSampleFrame(now, dtMs);

      // v1.0 audit §1.5: the High desktop tier keeps its particles alive through a
      // window drag — dropping the whole frame is what made them vanish. Cheaper tiers
      // still hand the entire frame back so dragging stays at 60 FPS there.
      const interacting = perfIsInteracting();
      if (interacting && envRef.current.performanceTier !== 'high') {
        acc = Math.min(acc, FIXED_DT);
        raf = requestAnimationFrame(frame);
        return;
      }

      const cfg = buildCfg();
      if (cfg.maxParticles <= 0 || cfg.reduceMotion || !cfg.presets.length) {
        particles.length = 0;
        perfSetParticleCount(0);
        g.clearRect(0, 0, size.w, size.h);
        acc = 0;
        raf = requestAnimationFrame(frame);
        return;
      }

      // One sub-step while dragging: motion continues at half the simulation cost.
      // The adaptive budget in perfHub is the real safety net — if frames get
      // expensive it drops quality to 'low', which halves the draw rate below.
      const maxSteps = interacting ? 1 : MAX_STEPS;
      acc = Math.min(acc, FIXED_DT * maxSteps);
      ensurePopulation(particles, cfg);

      let steps = 0;
      while (acc >= FIXED_DT && steps < maxSteps) {
        stepParticles(particles, FIXED_DT, cfg, snow);
        acc -= FIXED_DT;
        steps++;
      }

      // On low quality, draw every other frame to free the main thread for UI.
      const q = cfg.quality ?? 'high';
      if (q === 'low') {
        skipDraw++;
        if (skipDraw % 2 === 1) {
          perfSetParticleCount(particles.length);
          raf = requestAnimationFrame(frame);
          return;
        }
      } else {
        skipDraw = 0;
      }

      drawParticles(g, particles, cfg, snow);
      perfSetParticleCount(particles.length);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('secret:lifecycle', onVis);
      particles.length = 0;
      perfSetParticleCount(0);
      snow = createSnowAccumulation(1, 1);
      try {
        g.clearRect(0, 0, canvas.width, canvas.height);
      } catch {
        /* ignore */
      }
    };
  }, [hardOn]);

  if (!hardOn) return null;

  return <canvas ref={canvasRef} className="os-particle-canvas" aria-hidden />;
}
