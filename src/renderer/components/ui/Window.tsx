/**
 * Window — a reusable draggable/resizable glass window primitive. Phase 1 · M5a.
 *
 * Drag/resize follow the project invariant: write geometry directly to the
 * element's style during the gesture and commit to React state exactly once on
 * pointerup (never setState per pointermove). Pointer deltas are divided by the
 * app zoom factor (the "fixed-position under CSS zoom" gotcha).
 *
 * This is for NEW windows; the shell's existing FloatingWindow is intentionally
 * left as-is (it carries the same invariant, battle-tested).
 */
import { useRef, useState, type CSSProperties, type PointerEvent as RPE, type ReactNode } from 'react';
import { appZoomFactor } from './zoom';
import { useT } from '../../i18n';

const MIN_W = 220;
const MIN_H = 140;

export interface WindowProps {
  title?: ReactNode;
  children: ReactNode;
  initialX?: number;
  initialY?: number;
  initialWidth?: number;
  initialHeight?: number;
  resizable?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  /** Extra controls rendered before the built-in min/max/close buttons. */
  controls?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Window({
  title,
  children,
  initialX = 80,
  initialY = 80,
  initialWidth = 480,
  initialHeight = 320,
  resizable = true,
  onClose,
  onMinimize,
  onMaximize,
  controls,
  className = '',
  style,
}: WindowProps) {
  const { t } = useT();
  const [rect, setRect] = useState<Rect>({ x: initialX, y: initialY, w: initialWidth, h: initialHeight });
  const elRef = useRef<HTMLElement>(null);

  const beginDrag = (e: RPE<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = elRef.current;
    if (!el) return;
    const z = appZoomFactor();
    const startX = e.clientX;
    const startY = e.clientY;
    const base = { ...rect };
    let cur = { x: base.x, y: base.y };
    const move = (ev: PointerEvent) => {
      cur = { x: base.x + (ev.clientX - startX) / z, y: base.y + (ev.clientY - startY) / z };
      el.style.left = `${cur.x}px`;
      el.style.top = `${cur.y}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRect((r) => ({ ...r, x: cur.x, y: cur.y }));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const beginResize = (e: RPE<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = elRef.current;
    if (!el) return;
    const z = appZoomFactor();
    const startX = e.clientX;
    const startY = e.clientY;
    const base = { ...rect };
    let cur = { w: base.w, h: base.h };
    const move = (ev: PointerEvent) => {
      cur = {
        w: Math.max(MIN_W, base.w + (ev.clientX - startX) / z),
        h: Math.max(MIN_H, base.h + (ev.clientY - startY) / z),
      };
      el.style.width = `${cur.w}px`;
      el.style.height = `${cur.h}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRect((r) => ({ ...r, w: cur.w, h: cur.h }));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section
      ref={elRef}
      className={['ui-window', 'anim-window', className].filter(Boolean).join(' ')}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...style }}
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div className="ui-window__bar" onPointerDown={beginDrag} onDoubleClick={onMaximize}>
        <span className="ui-window__title">{title}</span>
        <div className="ui-window__controls">
          {controls}
          {onMinimize && (
            <button
              type="button"
              className="ui-icon-btn ui-icon-btn--sm ui-focusable"
              aria-label={t('desktop.minimize')}
              title={t('desktop.minimize')}
              onClick={onMinimize}
            >
              ─
            </button>
          )}
          {onMaximize && (
            <button
              type="button"
              className="ui-icon-btn ui-icon-btn--sm ui-focusable"
              aria-label={t('desktop.maximize')}
              title={t('desktop.maximize')}
              onClick={onMaximize}
            >
              ▢
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="ui-icon-btn ui-icon-btn--sm ui-focusable"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="ui-window__body">{children}</div>
      {resizable && (
        <div
          className="ui-window__resize"
          onPointerDown={beginResize}
          style={{ position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize' }}
          aria-hidden="true"
        />
      )}
    </section>
  );
}

export default Window;
