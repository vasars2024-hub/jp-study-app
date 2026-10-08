/**
 * WiredOscilloscope (WIRED_BESPOKE_SPEC §5.2) — tiny canvas scope for AUD-DAT
 * surfaces (Music now-playing strip, mini audio deck widget). Draws a
 * synthesized Lissajous/sine composite driven by wall-clock time while
 * playback runs — deterministic and cheap, no Web Audio tap. Idle shows a
 * flat trace with an occasional blip. Steps at ~24fps (CRTs don't tween).
 *
 * Stands still (one static frame) under OS reduced motion, the in-app
 * `html.reduce-motion` control, Wired motion "off" and Wired idle animations
 * "off"; re-evaluates live when any of those flip. Pauses while the document
 * is hidden. `fluid` makes the canvas track its container's width (the
 * mini-player widget) instead of the fixed 96px default.
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

function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const root = document.documentElement;
  if (root.classList.contains('reduce-motion')) return false;
  if (root.dataset.wiredMotion === 'off' || root.dataset.wiredIdle === 'off') return false;
  return !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export default function WiredOscilloscope({ className, fluid = false }: { className?: string; fluid?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = W;

    const size = () => {
      width = fluid ? Math.max(48, Math.round(canvas.clientWidth || W)) : W;
      canvas.width = width * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    let playing = getState().playing;
    const unsub = subscribe((s) => {
      playing = s.playing;
    });

    const paint = (t: number) => {
      ctx.clearRect(0, 0, width, H);
      ctx.strokeStyle = 'rgba(109, 241, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H / 2 + 0.5);
      ctx.lineTo(width, H / 2 + 0.5);
      for (let gx = 12; gx < width; gx += 12) {
        ctx.moveTo(gx + 0.5, 0);
        ctx.lineTo(gx + 0.5, H);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(109, 241, 255, 0.85)';
      ctx.shadowColor = 'rgba(109, 241, 255, 0.5)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const y = traceY(x / width, t, playing);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 42) return;
      last = now;
      paint(now / 1000);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!motionAllowed() || document.visibilityState === 'hidden') {
        paint(1.2);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    start();

    // Re-evaluate when the gates change: OS preference, the in-app class and
    // the Wired data-* attributes on <html>, and tab visibility.
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    mq?.addEventListener?.('change', start);
    const obs = new MutationObserver(start);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-wired-motion', 'data-wired-idle'],
    });
    document.addEventListener('visibilitychange', start);
    const ro = fluid && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          size();
          if (!raf) paint(1.2);
        })
      : null;
    ro?.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      mq?.removeEventListener?.('change', start);
      obs.disconnect();
      document.removeEventListener('visibilitychange', start);
      ro?.disconnect();
    };
  }, [fluid]);

  return (
    <canvas
      ref={canvasRef}
      className={['wired-osc', className].filter(Boolean).join(' ')}
      style={fluid ? { height: H } : { width: W, height: H }}
      aria-hidden="true"
    />
  );
}
