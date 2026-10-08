/**
 * Frame for a Wired console (Navi terminal, Signal decrypt, intercept channel):
 * a module plate like the desktop windows, draggable by its bar, raised on
 * pointer-down, closed with its key or Escape. Drag writes `left/top` straight
 * to the element and commits once on release, so moving a console never
 * re-renders its contents.
 */
import { useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { closeWiredConsole, raiseWiredConsole, type WiredConsoleId } from '../../wiredMechanics/consoleBus';

/** Session-only positions (consoles are instruments, not layout). */
const positions = new Map<WiredConsoleId, { x: number; y: number }>();

const DEFAULTS: Record<WiredConsoleId, { x: number; y: number }> = {
  tty: { x: 0.08, y: 0.1 },
  decrypt: { x: 0.3, y: 0.08 },
  intercept: { x: 0.56, y: 0.18 },
};

function initialPos(id: WiredConsoleId, width: number): { x: number; y: number } {
  const stored = positions.get(id);
  if (stored) return stored;
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const d = DEFAULTS[id];
  return { x: Math.max(8, Math.min(vw - width - 8, Math.round(vw * d.x))), y: Math.max(8, Math.round(vh * d.y)) };
}

export interface WiredConsoleProps {
  id: WiredConsoleId;
  code: string;
  title: string;
  width: number;
  stackIndex: number;
  top: boolean;
  status?: ReactNode;
  className?: string;
  /** Extra Escape handling (return true to keep the console open). */
  onEscape?: () => boolean;
  onClose?: () => void;
  children: ReactNode;
}

export default function WiredConsole({
  id,
  code,
  title,
  width,
  stackIndex,
  top,
  status,
  className = '',
  onEscape,
  onClose,
  children,
}: WiredConsoleProps) {
  const { t } = useT();
  const ref = useRef<HTMLElement | null>(null);
  const pos = useRef(initialPos(id, width));
  const drag = useRef<{ dx: number; dy: number; pointer: number } | null>(null);

  const close = useCallback(() => {
    onClose?.();
    closeWiredConsole(id);
  }, [id, onClose]);

  // Keep the console on screen when the window shrinks.
  useEffect(() => {
    const clamp = (): void => {
      const el = ref.current;
      if (!el) return;
      const maxX = Math.max(8, window.innerWidth - el.offsetWidth - 8);
      const maxY = Math.max(8, window.innerHeight - 80);
      const next = { x: Math.min(pos.current.x, maxX), y: Math.min(pos.current.y, maxY) };
      if (next.x !== pos.current.x || next.y !== pos.current.y) {
        pos.current = next;
        positions.set(id, next);
        el.style.left = `${next.x}px`;
        el.style.top = `${next.y}px`;
      }
    };
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [id]);

  const onBarPointerDown = (e: PointerEvent<HTMLElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - pos.current.x, dy: e.clientY - pos.current.y, pointer: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onBarPointerMove = (e: PointerEvent<HTMLElement>): void => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || d.pointer !== e.pointerId) return;
    const x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - d.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy));
    pos.current = { x, y };
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  };

  const onBarPointerUp = (e: PointerEvent<HTMLElement>): void => {
    if (!drag.current || drag.current.pointer !== e.pointerId) return;
    drag.current = null;
    positions.set(id, pos.current);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'Escape') return;
    if (onEscape?.()) return;
    e.stopPropagation();
    close();
  };

  const style: CSSProperties = {
    left: pos.current.x,
    top: pos.current.y,
    width,
    // Within the mechanics host's own layer (see wired-mechanics.css).
    zIndex: 1 + stackIndex,
  };

  return (
    <section
      ref={ref}
      className={`wmc-console${top ? ' is-top' : ''} ${className}`}
      data-console={id}
      role="dialog"
      aria-label={`${code} / ${title}`}
      style={style}
      onPointerDownCapture={() => raiseWiredConsole(id)}
      onKeyDown={onKeyDown}
    >
      <header
        className="wmc-bar"
        onPointerDown={onBarPointerDown}
        onPointerMove={onBarPointerMove}
        onPointerUp={onBarPointerUp}
        onPointerCancel={onBarPointerUp}
      >
        <b className="wmc-code">{code}</b>
        <span className="wmc-sep" aria-hidden="true"> / </span>
        <span className="wmc-name">{title}</span>
        <i className="wmc-meter" aria-hidden="true" />
        <button type="button" className="wmc-close" onClick={close} aria-label={t('wiredMech.console.close')} title={t('wiredMech.console.close')}>
          [X]
        </button>
      </header>
      <div className="wmc-body">{children}</div>
      {status ? <footer className="wmc-status">{status}</footer> : null}
    </section>
  );
}
