/**
 * The glass frame the Aero mechanics' utility windows live in.
 *
 * Deliberately NOT a desktop section: the Memory Defragmenter and the
 * Vocabulary Update are Aero-only system utilities, so they do not join the
 * section catalog every theme, pop-out and saved layout has to know about.
 * They are placed in the desk's own (unscaled) coordinates, dragged by the
 * title bar, and step behind the regular windows when one of those is clicked
 * — the way a non-modal system dialog behaved.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { useT } from '../../../i18n';

export interface AeroMechWindowProps {
  id: string;
  title: string;
  /** Small glyph shown in the title bar (decorative). */
  icon: ReactNode;
  width: number;
  height: number;
  front: boolean;
  onFront: () => void;
  onClose: () => void;
  children: ReactNode;
  /** Initial offset step, so two windows do not open exactly on top of each other. */
  cascade?: number;
}

function localScale(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const s = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

export default function AeroMechWindow({
  id,
  title,
  icon,
  width,
  height,
  front,
  onFront,
  onClose,
  children,
  cascade = 0,
}: AeroMechWindowProps) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: width, h: height });

  // First placement: centred in the desk (minus the taskbar), cascaded.
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const hw = host.offsetWidth || window.innerWidth;
    const hh = (host.offsetHeight || window.innerHeight) - 48;
    const w = Math.min(width, Math.max(320, hw - 24));
    const h = Math.min(height, Math.max(240, hh - 24));
    setSize({ w, h });
    setPos({
      x: Math.max(8, Math.round((hw - w) / 2) + cascade * 28),
      y: Math.max(8, Math.round((hh - h) / 2.4) + cascade * 24),
    });
  }, [cascade, height, width]);

  const onDragStart = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || (e.target as Element).closest('button')) return;
      const host = ref.current?.parentElement;
      if (!host || !pos) return;
      e.preventDefault();
      onFront();
      const scale = localScale(host);
      const start = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
      const maxX = Math.max(0, host.offsetWidth - 120);
      const maxY = Math.max(0, host.offsetHeight - 80);
      let raf = 0;
      let next = start;
      const move = (ev: PointerEvent): void => {
        next = {
          ...start,
          x: Math.min(maxX, Math.max(-size.w + 120, start.x + (ev.clientX - start.px) / scale)),
          y: Math.min(maxY, Math.max(0, start.y + (ev.clientY - start.py) / scale)),
        };
        if (raf) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          setPos({ x: next.x, y: next.y });
        });
      };
      const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (raf) window.cancelAnimationFrame(raf);
        setPos({ x: next.x, y: next.y });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [onFront, pos, size.w],
  );

  return (
    <div
      ref={ref}
      className={`aero-mech-win${front ? ' is-front' : ''}`}
      data-aero-mech-win={id}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{
        width: size.w,
        height: size.h,
        transform: pos ? `translate3d(${pos.x}px, ${pos.y}px, 0)` : undefined,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onPointerDownCapture={onFront}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="aero-mech-win-bar" onPointerDown={onDragStart}>
        <span className="aero-mech-win-icon" aria-hidden="true">{icon}</span>
        <span className="aero-mech-win-title">{title}</span>
        <button
          type="button"
          className="aero-mech-win-close"
          onClick={onClose}
          title={t('aeroMech.window.close')}
          aria-label={t('aeroMech.window.close')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="aero-mech-win-body">{children}</div>
    </div>
  );
}
