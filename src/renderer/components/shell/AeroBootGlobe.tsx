/**
 * AeroBootGlobe — true orthographic boot emblem.
 *
 * Continents are sphere-mapped (not a flat map clipped to a circle); lat/lon
 * curves converge at the poles. The spin is continuous: a per-pixel inverse
 * projection is computed once (`buildGlobeLookup`), and each animation frame is
 * a texture lookup plus a handful of meridian strokes on ONE canvas — no React
 * state per tick, no SVG re-render. The old version stepped 10° every 80 ms by
 * re-rendering 16 SVG paths through React (12.5 fps, visibly ratcheting).
 *
 * Frame rate is capped at ~30 fps (0.5° per frame at the calm 15°/s turn), the
 * loop pauses while the document is hidden, and reduced motion paints a single
 * still frame.
 */
import { useEffect, useRef } from 'react';
import {
  AERO_GLOBE_TILT_DEG,
  buildGlobeLookup,
  paintGlobeLand,
  projectOrthographic,
  type GlobeLookup,
} from './aeroGlobeProjection';

/** Backing-store size. The orb is shown at 220–360 CSS px, so 320 stays crisp. */
const SIZE = 320;
const R = SIZE / 2;
const PARALLELS = [-60, -30, 0, 30, 60];
const MERIDIANS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
const START_LON = -20;
/** Degrees per second — one full turn in 24 s. */
const SPIN_DEG_PER_S = 15;
const FRAME_MS = 1000 / 30;

let sharedLookup: GlobeLookup | null = null;

function lookup(): GlobeLookup {
  if (!sharedLookup) sharedLookup = buildGlobeLookup(SIZE, AERO_GLOBE_TILT_DEG);
  return sharedLookup;
}

function curve(ctx: CanvasRenderingContext2D, kind: 'parallel' | 'meridian', value: number, centralLon: number): void {
  const steps = 64;
  let pen = false;
  for (let i = 0; i <= steps; i++) {
    const lon = kind === 'parallel' ? -180 + (360 * i) / steps : value;
    const lat = kind === 'parallel' ? value : -90 + (180 * i) / steps;
    const p = projectOrthographic(lon, lat, centralLon, AERO_GLOBE_TILT_DEG, R - 1);
    if (!p) {
      pen = false;
      continue;
    }
    const x = R + p.x;
    const y = R - p.y;
    if (pen) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    pen = true;
  }
}

function paint(ctx: CanvasRenderingContext2D, image: ImageData, centralLon: number): void {
  paintGlobeLand(lookup(), centralLon, image);
  ctx.putImageData(image, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Parallels do not move as the globe turns, but they are cheap enough to
  // stroke with the meridians in the same pass.
  ctx.beginPath();
  for (const lat of PARALLELS) curve(ctx, 'parallel', lat, centralLon);
  ctx.strokeStyle = 'rgba(213, 255, 239, 0.38)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  for (const lon of MERIDIANS) curve(ctx, 'meridian', lon, centralLon);
  ctx.strokeStyle = 'rgba(210, 255, 235, 0.46)';
  ctx.lineWidth = 1.15;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(R, R, R - 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220, 255, 245, 0.42)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

type Props = {
  reducedMotion?: boolean;
};

export default function AeroBootGlobe({ reducedMotion = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (!canvas || !ctx) return;
    const image = ctx.createImageData(SIZE, SIZE);
    let raf = 0;
    let cancelled = false;
    let last = 0;
    const t0 = performance.now();

    // The first paint builds the lookup (~30 ms); do it after the sky has had a
    // frame to show, then reveal the canvas.
    const first = requestAnimationFrame(() => {
      if (cancelled) return;
      paint(ctx, image, START_LON);
      canvas.classList.add('ready');
      if (reducedMotion) return;
      const tick = (now: number) => {
        if (cancelled) return;
        raf = requestAnimationFrame(tick);
        if (document.hidden || now - last < FRAME_MS) return;
        last = now;
        const lon = START_LON - (((now - t0) / 1000) * SPIN_DEG_PER_S) % 360;
        paint(ctx, image, lon);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  return (
    <div className="os-aero-boot-globe" aria-hidden="true">
      <canvas ref={canvasRef} className="os-aero-boot-globe-land" width={SIZE} height={SIZE} />
      <span className="os-aero-boot-globe-shine" />
    </div>
  );
}
