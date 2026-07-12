/**
 * Toast — imperative toasts over a small event bus. Phase 1 · M5a.
 *
 * Mount <ToastViewport/> once; call showToast(...) from anywhere. Independent
 * of the app's existing `os:toast` runtime (this is the platform primitive).
 */
import { useEffect, useState, type ReactNode } from 'react';

export type ToastKind = 'default' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  title?: ReactNode;
  message: ReactNode;
  kind?: ToastKind;
  /** ms before auto-dismiss (default 2800). */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const BUS = 'ui:toast';
let seq = 0;

/** Show a toast from anywhere. Accepts a message string or full options. */
export function showToast(opts: ToastOptions | string): void {
  const detail = typeof opts === 'string' ? { message: opts } : opts;
  window.dispatchEvent(new CustomEvent<ToastOptions>(BUS, { detail }));
}

export function ToastViewport({ max = 4 }: { max?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event): void => {
      const d = (e as CustomEvent<ToastOptions>).detail;
      if (!d || d.message == null) return;
      const id = ++seq;
      const item: ToastItem = { kind: 'default', duration: 2800, ...d, id };
      setItems((xs) => [...xs.slice(-(max - 1)), item]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), item.duration);
    };
    window.addEventListener(BUS, onToast);
    return () => window.removeEventListener(BUS, onToast);
  }, [max]);

  if (items.length === 0) return null;

  return (
    <div className="ui-toast-host" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={['ui-toast', 'anim-notification', t.kind && t.kind !== 'default' ? `ui-toast--${t.kind}` : '']
            .filter(Boolean)
            .join(' ')}
          role="status"
        >
          <div>
            {t.title != null && <div className="ui-toast__title">{t.title}</div>}
            <div className="ui-toast__msg">{t.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ToastViewport;
