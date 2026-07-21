import { useEffect, useRef } from 'react';
import type { CityPresentationModel } from '../../engine/types';

function fract(value: number): number { return value - Math.floor(value); }
function sample(seed: number, index: number, channel: number): number {
  return fract(Math.sin(seed * 0.013 + index * 78.233 + channel * 19.19) * 43758.5453);
}

export default function NoctisParticleCanvas({ model }: { model: CityPresentationModel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
    const cap = memory <= 2 ? 40 : memory >= 8 ? 180 : 100;
    const metabolic = model.status === 'active' ? model.atmosphere.intensity01 : 0;
    const count = Math.min(cap, Math.floor(8 + metabolic * cap * 0.44));
    let frame = 0;
    let disposed = false;

    const resize = (): void => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time: number): void => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      const seconds = reduced ? 0 : time / 1000;
      for (let index = 0; index < count; index += 1) {
        const originX = sample(model.seed, index, 1) * width;
        const originY = (0.2 + sample(model.seed, index, 2) * 0.7) * height;
        const drift = (sample(model.seed, index, 3) - 0.5) * 22;
        const x = (originX + seconds * drift + width * 2) % width;
        const y = originY + Math.sin(seconds * 0.35 + index) * (2 + sample(model.seed, index, 4) * 8);
        const radius = 0.7 + sample(model.seed, index, 5) * 1.8;
        context.beginPath();
        context.fillStyle = index % 4 === 0
          ? `rgba(83, 213, 200, ${0.12 + metabolic * 0.3})`
          : `rgba(242, 204, 114, ${0.08 + metabolic * 0.24})`;
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
      if (!reduced && !disposed && document.visibilityState !== 'hidden') frame = requestAnimationFrame(draw);
    };

    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    draw(0);
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [model.seed, model.revision, model.status, model.atmosphere.intensity01]);

  return <canvas ref={canvasRef} className="noctis-particles" aria-hidden="true" />;
}
