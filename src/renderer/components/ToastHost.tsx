import { useEffect, useState } from 'react';

/**
 * Renders transient `os:toast` messages. Extracted from App.tsx when Blanc got
 * its own entry point (BLANC_REFINEMENT_PLAN.md Pillar 1) — both the Study OS
 * shell and the standalone Blanc window need it, and Blanc must not import
 * App.tsx, which pulls in the whole desktop.
 *
 * A toast may carry one action, used by the drop router's Undo. It is optional
 * and additive: an `os:toast` event without `action` behaves exactly as before,
 * and an actioned toast lingers longer because it asks the user to decide.
 */
interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  id: number;
  message: string;
  kind: string;
  action?: ToastAction;
}

const ACTION_TIMEOUT_MS = 9000;
const PLAIN_TIMEOUT_MS = 2800;

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<{ message?: string; kind?: string; action?: ToastAction }>).detail;
      const message = d?.message?.trim();
      if (!message) return;
      const id = ++n;
      const kind = d?.kind ?? 'ok';
      const action =
        d?.action && typeof d.action.run === 'function' && d.action.label ? d.action : undefined;
      setToasts((t) => [...t.slice(-4), { id, message, kind, action }]);
      window.setTimeout(
        () => {
          setToasts((t) => t.filter((x) => x.id !== id));
        },
        action ? ACTION_TIMEOUT_MS : PLAIN_TIMEOUT_MS,
      );
    };
    window.addEventListener('os:toast', onToast);
    return () => window.removeEventListener('os:toast', onToast);
  }, []);
  if (!toasts.length) return null;
  return (
    <div className="os-toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`os-toast ${t.kind}`}>
          <span className="os-toast-text">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="os-toast-action"
              onClick={() => {
                t.action?.run();
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Show a toast on the `os:toast` bus, so callers do not hand-build the event.
 *
 * Named `showOsToast`, not `showToast`: `components/ui/Toast.tsx` already
 * exports a `showToast` for the separate `ui:toast` platform primitive, and two
 * same-named exports driving different buses is how a call site ends up
 * dispatching into a viewport that is not mounted.
 */
export function showOsToast(message: string, kind = 'ok', action?: ToastAction): void {
  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind, action } }));
}
