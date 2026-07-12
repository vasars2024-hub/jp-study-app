/**
 * Lightweight performance hub for the desktop shell.
 * Tracks FPS, adaptive effect budget, and interaction mode without React.
 */

export type PerfSnapshot = {
  fps: number;
  frameMs: number;
  particleBudget: number;
  particleCount: number;
  quality: 'high' | 'medium' | 'low';
  interacting: boolean;
  memMb: number | null;
};

type Listener = (s: PerfSnapshot) => void;

const listeners = new Set<Listener>();

let fps = 60;
let frameMs = 16.7;
let particleBudget = 1;
let particleCount = 0;
let quality: PerfSnapshot['quality'] = 'high';
let lastSample = performance.now();
let frames = 0;
let emaFrame = 16.7;

/** Rolling frame time sample from any rAF loop (particles preferred). */
export function perfSampleFrame(now: number, dtMs: number): void {
  if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 250) return;
  // Exponential moving average of frame cost
  emaFrame = emaFrame * 0.9 + dtMs * 0.1;
  frameMs = emaFrame;
  frames++;
  if (now - lastSample >= 500) {
    fps = Math.round((frames * 1000) / (now - lastSample));
    frames = 0;
    lastSample = now;
    // Adaptive quality: drop particle budget when frames cost too much
    if (fps < 28 || emaFrame > 40) {
      particleBudget = Math.max(0.25, particleBudget * 0.85);
      quality = 'low';
    } else if (fps < 45 || emaFrame > 24) {
      particleBudget = Math.max(0.45, Math.min(1, particleBudget * 0.95));
      quality = 'medium';
    } else if (fps >= 55 && emaFrame < 18) {
      particleBudget = Math.min(1, particleBudget + 0.04);
      quality = particleBudget > 0.85 ? 'high' : 'medium';
    }
    emit();
  }
}

export function perfSetParticleCount(n: number): void {
  particleCount = Math.max(0, n | 0);
}

export function perfGetBudget(): number {
  return particleBudget;
}

export function perfGetQuality(): PerfSnapshot['quality'] {
  return quality;
}

export function perfIsInteracting(): boolean {
  return document.documentElement.classList.contains('os-interacting');
}

export function perfSnapshot(): PerfSnapshot {
  let memMb: number | null = null;
  try {
    const perfMem = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    if (perfMem?.usedJSHeapSize) memMb = Math.round(perfMem.usedJSHeapSize / (1024 * 1024));
  } catch {
    /* Chrome-only */
  }
  return {
    fps,
    frameMs: Math.round(frameMs * 10) / 10,
    particleBudget: Math.round(particleBudget * 100) / 100,
    particleCount,
    quality,
    interacting: perfIsInteracting(),
    memMb,
  };
}

export function onPerfSnapshot(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(): void {
  if (!listeners.size) return;
  const s = perfSnapshot();
  for (const l of listeners) {
    try {
      l(s);
    } catch {
      /* ignore */
    }
  }
}

/** Begin/end interaction (window drag, icon drag). */
export function perfSetInteracting(on: boolean): void {
  document.documentElement.classList.toggle('os-interacting', on);
  emit();
}
