/**
 * WiredOscilloscope (WIRED_BESPOKE_SPEC §5.2) — tiny canvas scope for AUD-DAT
 * surfaces (Music now-playing strip, mini audio deck widget). Draws a
 * synthesized Lissajous/sine composite driven by wall-clock time while
 * playback runs — deterministic and cheap, no Web Audio tap. Idle shows a
 * flat trace with an occasional blip. Renders one static frame under
 * prefers-reduced-motion, and steps at ~24fps otherwise (CRTs don't tween).
 */
import { useEffect, useRef } from 'react';
import { getState, subscribe } from '../../playerBus';

const W = 96;
const H = 28;

function traceY(p: number, t: number, playing: boolean): number {
  if (playing) {
    return (
      H / 2 +
      Math.sin(p * Math.PI * 6 + t * 5.1) * 5.4 * Math.sin(t * 1.7 + p * 3) +
      Math.sin(p * Math.PI * 14 + t * 8.3) * 2.2
    );
  }
  // Idle: flat line; every ~7s a narrow blip sweeps through.
  const phase = t % 7;
  const blip = phase < 0.5 ? Math.exp(-((p - phase * 2) ** 2) * 260) * 6 : 0;
  return H / 2 - blip;
}

export default function WiredOscilloscope({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    let playing = getState().playing;
    const unsub = subscribe((s) => {
      playing = s.playing;
    });

    const paint = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(109, 241, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H / 2 + 0.5);
      ctx.lineTo(W, H / 2 + 0.5);
      for (let gx = 12; gx < W; gx += 12) {
        ctx.moveTo(gx + 0.5, 0);
        ctx.lineTo(gx + 0.5, H);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(109, 241, 255, 0.85)';
      ctx.shadowColor = 'rgba(109, 241, 255, 0.5)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const y = traceY(x / W, t, playing);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      paint(1.2);
      return unsub;
    }

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 42) return;
      last = now;
      paint(now / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={['wired-osc', className].filter(Boolean).join(' ')}
      style={{ width: W, height: H }}
      aria-hidden="true"
    />
  );
}
