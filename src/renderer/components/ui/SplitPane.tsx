/**
 * SplitPane — two panes with a draggable, keyboard-resizable divider.
 * Phase 4 · M1.
 * -----------------------------------------------------------------------------
 * Pointer math is rect-ratio based (pointer position within the container's
 * bounding rect, mapped to layout px via clientWidth/Height), so resizing stays
 * accurate under both the app zoom and the Aero 4:3 viewport scale — the same
 * property VIEWPORT_ARCHITECTURE.md relies on for icon drops. Moves are
 * rAF-throttled (repo drag convention: don't commit layout per pointer event).
 *
 * Divider a11y: role="separator" with aria-value*, arrows resize (Shift for
 * coarse steps), Home/End snap to min/max, Enter or double-click resets.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';

export interface SplitPaneProps {
  /** 'row' = panes side by side (default); 'column' = stacked. */
  direction?: 'row' | 'column';
  /** Initial size of the first pane in layout px. */
  initial?: number;
  min?: number;
  max?: number;
  /** Persist the size in localStorage under this key. */
  storageKey?: string;
  onResize?: (px: number) => void;
  className?: string;
  children: [ReactNode, ReactNode];
}

const STEP = 16;
const STEP_COARSE = 64;

function loadSize(storageKey: string | undefined, fallback: number): number {
  if (!storageKey) return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    const n = raw == null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function SplitPane({
  direction = 'row',
  initial = 240,
  min = 120,
  max,
  storageKey,
  onResize,
  className = '',
  children,
}: SplitPaneProps) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => loadSize(storageKey, initial));
  const raf = useRef(0);
  const pending = useRef(size);

  const clamp = useCallback(
    (px: number): number => {
      const el = containerRef.current;
      const span = el ? (direction === 'row' ? el.clientWidth : el.clientHeight) : Infinity;
      const hi = Math.min(max ?? Infinity, Number.isFinite(span) ? span - 80 : Infinity);
      return Math.round(Math.min(Math.max(px, min), Math.max(hi, min)));
    },
    [direction, min, max],
  );

  const persist = useCallback(
    (px: number): void => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, String(px));
      } catch {
        /* storage unavailable */
      }
    },
    [storageKey],
  );

  const apply = useCallback(
    (px: number): void => {
      const next = clamp(px);
      setSize(next);
      onResize?.(next);
    },
    [clamp, onResize],
  );

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const divider = e.currentTarget;
    divider.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Ratio within the rendered rect → layout px (scale/zoom agnostic).
      const ratio =
        direction === 'row'
          ? (ev.clientX - rect.left) / Math.max(rect.width, 1)
          : (ev.clientY - rect.top) / Math.max(rect.height, 1);
      pending.current = ratio * (direction === 'row' ? el.clientWidth : el.clientHeight);
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => apply(pending.current));
    };
    const up = (): void => {
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', up);
      divider.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf.current);
      const final = clamp(pending.current);
      apply(final);
      persist(final);
    };
    pending.current = size;
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
    divider.addEventListener('pointercancel', up);
  };

  const onDividerKey = (e: React.KeyboardEvent): void => {
    const grow = direction === 'row' ? 'ArrowRight' : 'ArrowDown';
    const shrink = direction === 'row' ? 'ArrowLeft' : 'ArrowUp';
    let next: number | null = null;
    if (e.key === grow) next = size + (e.shiftKey ? STEP_COARSE : STEP);
    else if (e.key === shrink) next = size - (e.shiftKey ? STEP_COARSE : STEP);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max ?? Number.MAX_SAFE_INTEGER;
    else if (e.key === 'Enter') next = initial;
    if (next == null) return;
    e.preventDefault();
    const final = clamp(next);
    apply(final);
    persist(final);
  };

  const reset = (): void => {
    const final = clamp(initial);
    apply(final);
    persist(final);
  };

  return (
    <div
      ref={containerRef}
      className={['ui-split', direction === 'row' ? 'ui-split--row' : 'ui-split--column', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="ui-split__pane ui-split__pane--first"
        style={direction === 'row' ? { width: size } : { height: size }}
      >
        {children[0]}
      </div>
      <div
        className="ui-split__divider"
        role="separator"
        tabIndex={0}
        aria-orientation={direction === 'row' ? 'vertical' : 'horizontal'}
        aria-valuenow={size}
        aria-valuemin={min}
        aria-valuemax={max ?? undefined}
        aria-label={t('ui.splitPane.aria')}
        onPointerDown={onDividerPointerDown}
        onKeyDown={onDividerKey}
        onDoubleClick={reset}
      />
      <div className="ui-split__pane ui-split__pane--second">{children[1]}</div>
    </div>
  );
}

export default SplitPane;
