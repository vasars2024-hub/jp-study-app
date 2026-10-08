/**
 * Orthographic helpers for the Aero boot globe.
 * Equirectangular Natural Earth path (360×180) → sphere UV / baked spin frames.
 */

import { AERO_WORLD_LAND_PATH } from './aeroWorldPath';

const DEG = Math.PI / 180;

/** Lon/lat degrees → equirectangular pixel in a W×H texture. */
export function lonLatToEquirect(
  lon: number,
  lat: number,
  width: number,
  height: number,
): { u: number; v: number } {
  const λ = ((lon + 180) % 360 + 360) % 360;
  const φ = Math.max(-90, Math.min(90, lat));
  return {
    u: (λ / 360) * width,
    v: ((90 - φ) / 180) * height,
  };
}

/**
 * Inverse orthographic: unit-disk (nx, ny) + central meridian/tilt → lon/lat deg.
 * Returns null outside the sphere limb.
 */
export function inverseOrthographic(
  nx: number,
  ny: number,
  centralLonDeg: number,
  tiltDeg: number,
): { lon: number; lat: number } | null {
  const r2 = nx * nx + ny * ny;
  if (r2 > 1) return null;
  const nz = Math.sqrt(Math.max(0, 1 - r2));

  const λ0 = centralLonDeg * DEG;
  const φ0 = tiltDeg * DEG;
  const sinφ0 = Math.sin(φ0);
  const cosφ0 = Math.cos(φ0);

  const y1 = ny * cosφ0 + nz * sinφ0;
  const z1 = -ny * sinφ0 + nz * cosφ0;
  const x1 = nx;

  const lat = Math.asin(Math.max(-1, Math.min(1, y1)));
  const lon = λ0 + Math.atan2(x1, z1);

  return {
    lon: ((lon / DEG + 540) % 360) - 180,
    lat: lat / DEG,
  };
}

/** Forward orthographic for grid polylines. Visible when cos(c) >= 0. */
export function projectOrthographic(
  lonDeg: number,
  latDeg: number,
  centralLonDeg: number,
  tiltDeg: number,
  radius: number,
): { x: number; y: number } | null {
  const λ = lonDeg * DEG;
  const φ = latDeg * DEG;
  const λ0 = centralLonDeg * DEG;
  const φ0 = tiltDeg * DEG;
  const dλ = λ - λ0;
  const cosφ = Math.cos(φ);
  const sinφ = Math.sin(φ);
  const cosφ0 = Math.cos(φ0);
  const sinφ0 = Math.sin(φ0);
  const cosc = sinφ0 * sinφ + cosφ0 * cosφ * Math.cos(dλ);
  if (cosc < 0) return null;
  return {
    x: radius * cosφ * Math.sin(dλ),
    y: radius * (cosφ0 * sinφ - sinφ0 * cosφ * Math.cos(dλ)),
  };
}

let landPixels: { width: number; height: number; data: Uint8ClampedArray } | null = null;

function getLandPixels(width = 720, height = 360): { width: number; height: number; data: Uint8ClampedArray } {
  if (landPixels && landPixels.width === width && landPixels.height === height) {
    return landPixels;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    landPixels = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    return landPixels;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#9eff4f';
  ctx.strokeStyle = 'rgba(241, 255, 184, 0.55)';
  ctx.lineWidth = 0.55;
  ctx.lineJoin = 'round';

  const sx = width / 360;
  const sy = height / 180;
  ctx.save();
  ctx.scale(sx, sy);
  const path = new Path2D(AERO_WORLD_LAND_PATH);
  ctx.fill(path);
  ctx.stroke(path);
  ctx.restore();

  landPixels = {
    width,
    height,
    data: ctx.getImageData(0, 0, width, height).data,
  };
  return landPixels;
}

/** Rasterize one orthographic view into an ImageData buffer. */
export function renderOrthographicFrame(
  size: number,
  centralLonDeg: number,
  tiltDeg: number,
): ImageData {
  const tex = getLandPixels();
  const tw = tex.width;
  const th = tex.height;
  const texData = tex.data;
  const out = new ImageData(size, size);
  const px = out.data;
  const R = (size - 1) / 2;
  const glow = [158, 255, 79];

  for (let py = 0; py < size; py++) {
    for (let pxI = 0; pxI < size; pxI++) {
      const nx = (pxI - R) / R;
      // Canvas y grows downward; geographic +y is north.
      const ny = (R - py) / R;
      const ll = inverseOrthographic(nx, ny, centralLonDeg, tiltDeg);
      if (!ll) continue;

      const { u, v } = lonLatToEquirect(ll.lon, ll.lat, tw, th);
      const ui = Math.min(tw - 1, Math.max(0, u | 0));
      const vi = Math.min(th - 1, Math.max(0, v | 0));
      const ti = (vi * tw + ui) * 4;
      const a = texData[ti + 3];
      if (a < 16) continue;

      const r2 = nx * nx + ny * ny;
      const limb = Math.sqrt(Math.max(0, 1 - r2));
      const shade = 0.55 + 0.45 * limb;
      const i = (py * size + pxI) * 4;
      px[i] = (glow[0] * shade) | 0;
      px[i + 1] = (glow[1] * shade) | 0;
      px[i + 2] = (glow[2] * shade) | 0;
      px[i + 3] = Math.min(255, (a * (0.72 + 0.28 * limb)) | 0);
    }
  }
  return out;
}

/**
 * Per-pixel inverse projection, computed ONCE for a fixed tilt.
 *
 * For a constant tilt the inverse orthographic gives each disk pixel a latitude
 * and a longitude OFFSET from the central meridian that never change as the
 * globe spins — only the offset's origin moves. So a spin frame is a texture
 * lookup per pixel (no trig at all), cheap enough to run every animation frame
 * at any rotation angle. That is what lets the boot globe turn smoothly instead
 * of stepping through 36 pre-baked 10° frames.
 */
export interface GlobeLookup {
  size: number;
  /** Disk pixel indices (into a size×size image) that land on the sphere. */
  pixels: Int32Array;
  /** Texture row per disk pixel. */
  row: Int32Array;
  /** Longitude offset from the central meridian, in degrees, per disk pixel. */
  lonOffset: Float32Array;
  /** 0–1 limb shading per disk pixel. */
  limb: Float32Array;
}

export function buildGlobeLookup(size: number, tiltDeg: number): GlobeLookup {
  const tex = getLandPixels();
  const R = (size - 1) / 2;
  const pixels: number[] = [];
  const row: number[] = [];
  const lonOffset: number[] = [];
  const limb: number[] = [];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = (px - R) / R;
      const ny = (R - py) / R;
      const ll = inverseOrthographic(nx, ny, 0, tiltDeg);
      if (!ll) continue;
      const v = Math.min(tex.height - 1, Math.max(0, (((90 - ll.lat) / 180) * tex.height) | 0));
      pixels.push(py * size + px);
      row.push(v);
      lonOffset.push(ll.lon);
      limb.push(Math.sqrt(Math.max(0, 1 - (nx * nx + ny * ny))));
    }
  }
  return {
    size,
    pixels: Int32Array.from(pixels),
    row: Int32Array.from(row),
    lonOffset: Float32Array.from(lonOffset),
    limb: Float32Array.from(limb),
  };
}

/** Paint the land for one central longitude into `out` (cleared first). */
export function paintGlobeLand(lookup: GlobeLookup, centralLonDeg: number, out: ImageData): void {
  const tex = getLandPixels();
  const tw = tex.width;
  const texData = tex.data;
  const px = out.data;
  px.fill(0);
  const scale = tw / 360;
  const { pixels, row, lonOffset, limb } = lookup;
  for (let k = 0; k < pixels.length; k++) {
    let lon = lonOffset[k] + centralLonDeg + 180;
    lon -= Math.floor(lon / 360) * 360;
    const ui = Math.min(tw - 1, (lon * scale) | 0);
    const ti = (row[k] * tw + ui) * 4;
    const a = texData[ti + 3];
    if (a < 16) continue;
    const l = limb[k];
    const shade = 0.55 + 0.45 * l;
    const i = pixels[k] * 4;
    px[i] = (158 * shade) | 0;
    px[i + 1] = (255 * shade) | 0;
    px[i + 2] = (79 * shade) | 0;
    px[i + 3] = Math.min(255, (a * (0.72 + 0.28 * l)) | 0);
  }
}

export const AERO_GLOBE_FRAME_COUNT = 36;
export const AERO_GLOBE_TILT_DEG = 14;
export const AERO_GLOBE_FRAME_SIZE = 192;

let bakedFrames: ImageData[] | null = null;
let bakePromise: Promise<ImageData[]> | null = null;

function frameLon(index: number, frameCount: number): number {
  return -20 - (360 * index) / frameCount;
}

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining: () => number };

function scheduleIdle(cb: (deadline?: IdleDeadlineLike) => void): number {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(cb, { timeout: 48 });
  }
  return window.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 0) as unknown as number;
}

function cancelIdle(id: number): void {
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(id);
  } else {
    window.clearTimeout(id);
  }
}

/**
 * Bake spin frames in idle chunks so the soft-reboot sky can paint first.
 * Resolves with a shared cache; first frame is available ASAP via onFrame.
 */
export function bakeGlobeFrames(options?: {
  size?: number;
  frameCount?: number;
  tiltDeg?: number;
  onFrame?: (index: number, frame: ImageData, total: number) => void;
  signal?: AbortSignal;
}): Promise<ImageData[]> {
  const size = options?.size ?? AERO_GLOBE_FRAME_SIZE;
  const frameCount = options?.frameCount ?? AERO_GLOBE_FRAME_COUNT;
  const tiltDeg = options?.tiltDeg ?? AERO_GLOBE_TILT_DEG;

  if (bakedFrames && bakedFrames.length === frameCount && bakedFrames[0]?.width === size) {
    options?.onFrame?.(0, bakedFrames[0], frameCount);
    return Promise.resolve(bakedFrames);
  }
  if (bakePromise) return bakePromise;

  let idleId = 0;

  bakePromise = new Promise<ImageData[]>((resolve, reject) => {
    const frames: ImageData[] = new Array(frameCount);
    let i = 0;

    const onAbort = () => {
      cancelIdle(idleId);
      bakePromise = null;
      reject(new DOMException('Aborted', 'AbortError'));
    };
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    const step = () => {
      if (options?.signal?.aborted) {
        onAbort();
        return;
      }
      const frame = renderOrthographicFrame(size, frameLon(i, frameCount), tiltDeg);
      frames[i] = frame;
      options?.onFrame?.(i, frame, frameCount);
      i += 1;
      if (i >= frameCount) {
        options?.signal?.removeEventListener('abort', onAbort);
        bakedFrames = frames;
        resolve(frames);
        return;
      }
      idleId = scheduleIdle(() => step());
    };

    idleId = scheduleIdle(() => step());
  });

  bakePromise.catch(() => {
    /* cleared in abort path */
  });

  return bakePromise;
}

/** Build SVG path `d` for a parallel (latitude) or meridian. */
export function gridCurvePath(
  kind: 'parallel' | 'meridian',
  valueDeg: number,
  centralLonDeg: number,
  tiltDeg: number,
  radius: number,
  steps = 72,
): string {
  const parts: string[] = [];
  let penDown = false;

  for (let i = 0; i <= steps; i++) {
    let λ: number;
    let φ: number;
    if (kind === 'parallel') {
      λ = -180 + (360 * i) / steps;
      φ = valueDeg;
    } else {
      λ = valueDeg;
      φ = -90 + (180 * i) / steps;
    }
    const p = projectOrthographic(λ, φ, centralLonDeg, tiltDeg, radius);
    if (!p) {
      penDown = false;
      continue;
    }
    const x = radius + p.x;
    // SVG y grows downward; geographic +y is north.
    const y = radius - p.y;
    if (!penDown) {
      parts.push(`M${x.toFixed(2)} ${y.toFixed(2)}`);
      penDown = true;
    } else {
      parts.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
    }
  }
  return parts.join('');
}
