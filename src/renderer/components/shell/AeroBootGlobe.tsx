/**
 * AeroBootGlobe — true orthographic boot emblem.
 * Continents are sphere-mapped (not a flat map clipped to a circle); lat/lon
 * curves converge at the poles. Spin uses pre-baked frames so the soft reboot
 * stays light on the main thread after the first paint.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AERO_GLOBE_FRAME_COUNT,
  AERO_GLOBE_FRAME_SIZE,
  AERO_GLOBE_TILT_DEG,
  bakeGlobeFrames,
  gridCurvePath,
} from './aeroGlobeProjection';

const VIEW = AERO_GLOBE_FRAME_SIZE;
const R = VIEW / 2;
const PARALLELS = [-60, -30, 0, 30, 60];
const MERIDIANS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];

type Props = {
  reducedMotion?: boolean;
};

export default function AeroBootGlobe({ reducedMotion = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageData[] | null>(null);
  const [frame, setFrame] = useState(0);
  const [ready, setReady] = useState(false);
  const [bakeDone, setBakeDone] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;

    void bakeGlobeFrames({
      signal: ac.signal,
      onFrame: (index, image) => {
        if (!framesRef.current) framesRef.current = new Array(AERO_GLOBE_FRAME_COUNT);
        framesRef.current[index] = image;
        if (index === 0 && ctx) {
          ctx.putImageData(image, 0, 0);
          setReady(true);
        }
      },
    })
      .then((frames) => {
        framesRef.current = frames;
        setBakeDone(true);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      });

    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!bakeDone || reducedMotion) return;
    const id = window.setInterval(() => {
      setFrame((n) => (n + 1) % AERO_GLOBE_FRAME_COUNT);
    }, 80);
    return () => window.clearInterval(id);
  }, [bakeDone, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || !frames) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const idx = reducedMotion ? 0 : frame;
    const image = frames[idx] ?? frames[0];
    if (image) ctx.putImageData(image, 0, 0);
  }, [frame, ready, reducedMotion, bakeDone]);

  const centralLon = reducedMotion ? -20 : -20 - (360 * frame) / AERO_GLOBE_FRAME_COUNT;

  const grid = useMemo(() => {
    const parallels = PARALLELS.map((lat) =>
      gridCurvePath('parallel', lat, centralLon, AERO_GLOBE_TILT_DEG, R),
    ).filter(Boolean);
    const meridians = MERIDIANS.map((lon) =>
      gridCurvePath('meridian', lon, centralLon, AERO_GLOBE_TILT_DEG, R),
    ).filter(Boolean);
    return { parallels, meridians };
  }, [centralLon]);

  return (
    <div className="os-aero-boot-globe" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className={`os-aero-boot-globe-land${ready ? ' ready' : ''}`}
        width={VIEW}
        height={VIEW}
      />
      <svg
        className="os-aero-boot-globe-graticule"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        focusable="false"
      >
        <circle cx={R} cy={R} r={R - 0.5} className="os-aero-boot-globe-limb" />
        {grid.parallels.map((d, i) => (
          <path key={`p-${i}`} d={d} className="os-aero-boot-globe-parallel" />
        ))}
        {grid.meridians.map((d, i) => (
          <path key={`m-${i}`} d={d} className="os-aero-boot-globe-meridian" />
        ))}
      </svg>
      <span className="os-aero-boot-globe-shine" />
    </div>
  );
}
