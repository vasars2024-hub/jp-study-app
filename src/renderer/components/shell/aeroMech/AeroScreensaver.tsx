/**
 * The study screensaver: glossy bubbles drifting over light ribbons, each
 * carrying a word from the user's own deck. Hovering a bubble (or tapping it)
 * swells it to show the reading and meaning — passive exposure while away.
 *
 * Moving the mouse does not dismiss it, because hovering is the point; a click
 * outside a bubble, or any key, does. One canvas, capped at 30 fps, paused
 * while the document is hidden. Reduced motion, display animations off,
 * Battery Saver and Aero safe mode get a still slideshow instead.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MechCard } from '../../../aeroMechanics/aeroMechLogic';
import { wantsStillness } from '../../../aeroMechanics/aeroMechEnv';
import { useT } from '../../../i18n';

interface Bubble {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  card: MechCard;
  grow: number;
  hue: number;
}

const FRAME_MS = 1000 / 30;
const MAX_BUBBLES = 12;
const SLIDE_MS = 8000;

function trimText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

export interface AeroScreensaverProps {
  words: MechCard[];
  onExit: () => void;
}

export default function AeroScreensaver({ words, onExit }: AeroScreensaverProps) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [still] = useState(wantsStillness);
  const [slide, setSlide] = useState(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pinned = useRef<Bubble | null>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  // Any key leaves. Registered on capture so an app's own shortcut does not
  // fire underneath the screensaver.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      exitRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Still slideshow.
  useEffect(() => {
    if (!still || words.length < 2) return undefined;
    const id = window.setInterval(() => setSlide((s) => (s + 1) % words.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [still, words.length]);

  // Animated canvas.
  useEffect(() => {
    if (still) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = (): void => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();

    let nextWord = 0;
    const takeWord = (): MechCard => {
      const card = words[nextWord % Math.max(1, words.length)];
      nextWord += 1;
      return card;
    };
    const spawn = (initial: boolean): Bubble => {
      const r = 38 + Math.random() * 34;
      return {
        x: r + Math.random() * Math.max(1, w - 2 * r),
        y: initial ? r + Math.random() * Math.max(1, h - 2 * r) : h + r + Math.random() * 120,
        r,
        vx: (Math.random() - 0.5) * 14,
        vy: -(10 + Math.random() * 16),
        phase: Math.random() * Math.PI * 2,
        card: takeWord(),
        grow: 0,
        hue: 188 + Math.random() * 40,
      };
    };
    const count = Math.min(MAX_BUBBLES, Math.max(words.length, 6));
    bubblesRef.current = Array.from({ length: count }, () => spawn(true));

    let raf = 0;
    let last = 0;
    let time = 0;

    const drawRibbons = (): void => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bands = [
        { base: 0.62, amp: 0.08, freq: 0.0032, speed: 0.22, width: 120, color: '120, 220, 255', alpha: 0.1 },
        { base: 0.7, amp: 0.06, freq: 0.0045, speed: -0.17, width: 70, color: '160, 255, 220', alpha: 0.12 },
        { base: 0.55, amp: 0.1, freq: 0.0024, speed: 0.12, width: 44, color: '220, 245, 255', alpha: 0.14 },
      ];
      for (const band of bands) {
        ctx.beginPath();
        for (let x = -40; x <= w + 40; x += 28) {
          const y = h * band.base + Math.sin(x * band.freq + time * band.speed) * h * band.amp
            + Math.sin(x * band.freq * 2.3 + time * band.speed * 1.7) * h * band.amp * 0.3;
          if (x === -40) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = band.width;
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${band.color}, ${band.alpha})`;
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawBubble = (b: Bubble): void => {
      const r = b.r * (1 + b.grow * 0.75);
      const grad = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
      grad.addColorStop(0.55, `hsla(${b.hue}, 80%, 70%, 0.12)`);
      grad.addColorStop(0.9, `hsla(${b.hue}, 90%, 80%, 0.3)`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.55)');
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.stroke();
      // Specular highlight.
      ctx.beginPath();
      ctx.ellipse(b.x - r * 0.32, b.y - r * 0.5, r * 0.36, r * 0.16, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 40, 70, 0.6)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
      const wordSize = Math.max(14, Math.round(r * 0.42));
      ctx.font = `${wordSize}px "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif`;
      const wordY = b.grow > 0.05 ? b.y - r * 0.28 : b.y;
      ctx.fillText(trimText(ctx, b.card.word, r * 1.6), b.x, wordY);
      if (b.grow > 0.05) {
        ctx.globalAlpha = Math.min(1, b.grow * 1.4);
        if (b.card.reading && b.card.reading !== b.card.word) {
          ctx.font = `${Math.max(11, Math.round(r * 0.2))}px "Yu Gothic UI", "Meiryo", sans-serif`;
          ctx.fillStyle = 'rgba(220, 245, 255, 0.95)';
          ctx.fillText(trimText(ctx, b.card.reading, r * 1.6), b.x, b.y + r * 0.08);
        }
        if (b.card.meaning) {
          ctx.font = `${Math.max(11, Math.round(r * 0.17))}px "Segoe UI", sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(trimText(ctx, b.card.meaning, r * 1.7), b.x, b.y + r * 0.38);
        }
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
    };

    const step = (ts: number): void => {
      raf = window.requestAnimationFrame(step);
      if (ts - last < FRAME_MS) return;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : FRAME_MS / 1000;
      last = ts;
      time += dt;
      const p = pointer.current;
      let hover: Bubble | null = null;
      for (const b of bubblesRef.current) {
        if (p && Math.hypot(p.x - b.x, p.y - b.y) <= b.r * (1 + b.grow * 0.75)) hover = b;
      }
      for (const b of bubblesRef.current) {
        const active = b === hover || b === pinned.current;
        b.grow += ((active ? 1 : 0) - b.grow) * Math.min(1, dt * 6);
        const slow = 1 - b.grow * 0.9;
        b.x += (b.vx + Math.sin(time * 0.8 + b.phase) * 8) * dt * slow;
        b.y += b.vy * dt * slow;
        if (b.x < b.r) b.vx = Math.abs(b.vx);
        if (b.x > w - b.r) b.vx = -Math.abs(b.vx);
        if (b.y < -b.r * 1.2 && b !== pinned.current) Object.assign(b, spawn(false));
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRibbons();
      // Grown bubbles last, so they are drawn on top.
      [...bubblesRef.current].sort((a, b) => a.grow - b.grow).forEach(drawBubble);
    };

    const onVisibility = (): void => {
      if (document.hidden) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = 0;
        raf = window.requestAnimationFrame(step);
      }
    };
    raf = window.requestAnimationFrame(step);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [still, words]);

  const hitBubble = (x: number, y: number): Bubble | null => {
    for (const b of bubblesRef.current) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r * (1 + b.grow * 0.75)) return b;
    }
    return null;
  };

  const card = words[slide % Math.max(1, words.length)];

  return createPortal(
    <div
      className={`aero-mech-saver${still ? ' is-still' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('aeroMech.saver.label')}
      onPointerMove={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
      onPointerDown={(e) => {
        if (!still) {
          const hit = hitBubble(e.clientX, e.clientY);
          if (hit) {
            pinned.current = pinned.current === hit ? null : hit;
            return;
          }
        }
        exitRef.current();
      }}
      onWheel={() => exitRef.current()}
    >
      {!still && <canvas ref={canvasRef} className="aero-mech-saver-canvas" aria-hidden="true" />}
      {still && card && (
        <div className="aero-mech-saver-slide">
          <div className="aero-mech-saver-word" lang="ja">{card.word}</div>
          {card.reading && card.reading !== card.word && <div className="aero-mech-saver-reading" lang="ja">{card.reading}</div>}
          {card.meaning && <div className="aero-mech-saver-meaning">{card.meaning}</div>}
        </div>
      )}
      <div className="aero-mech-saver-hint">{still ? t('aeroMech.saver.hintStill') : t('aeroMech.saver.hint')}</div>
    </div>,
    document.body,
  );
}
