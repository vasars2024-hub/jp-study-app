import { useCallback, useEffect, useState } from 'react';
import { ToastViewport } from './ui/Toast';
import ReadingReminderHost from './reading/ReadingReminderHost';
import { useT } from '../i18n';

/**
 * Renders transient `os:toast` messages. Extracted from App.tsx when Blanc got
 * its own entry point (BLANC_REFINEMENT_PLAN.md Pillar 1) — both the Study OS
 * shell and the standalone Blanc window need it, and Blanc must not import
 * App.tsx, which pulls in the whole desktop.
 *
 * A toast may carry one action, used by the drop router's Undo. It is optional
 * and additive: an `os:toast` event without `action` behaves exactly as before,
 * and an actioned toast lingers longer because it asks the user to decide.
 *
 * It also mounts `ui/Toast`'s `ToastViewport`, the separate `ui:toast` bus, for
 * the reason that file's own note predicts: `showToast` had no viewport mounted
 * anywhere in the app, so every call to it — the subtitle harvest's "mined N
 * words", the download dialog's finished/failed announcement — dispatched into
 * nothing and the user saw no confirmation at all. Measured live 2026-08-16:
 * clicking Mine added 30 cards and produced zero `.ui-toast-host` nodes.
 * The two buses stay separate (different events, hosts and CSS); what is shared
 * is the single place every shell already mounts exactly once.
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
  /** Milliseconds still owed to this toast. Frozen while the host is held. */
  remaining: number;
  /** Wall-clock instant it expires, or `null` while held. */
  deadline: number | null;
}

const ACTION_TIMEOUT_MS = 9000;
const PLAIN_TIMEOUT_MS = 2800;
/**
 * How often the sweep looks for an expired toast. Deadlines are wall-clock
 * instants rather than a countdown, so a background window whose timers are
 * throttled to ~1 Hz dismisses late but never dismisses early — the elapsed
 * accounting does not depend on the tick actually firing at this rate.
 */
const SWEEP_MS = 150;

/**
 * `err` and `warn` are announced assertively and drawn with their own edge.
 * Both come from real call sites — `DropRouter.tsx:130`, `:139` and `:169` —
 * and until now a failed file drop was announced through the same polite region
 * as a success and drew with the same neutral border, because only `.ok` and
 * `.muted` had rules. A failure that reads exactly like a success for 2.8
 * seconds and then disappears is the "honest states" rubric failing in the one
 * surface whose whole job is to report what happened.
 */
function isUrgent(kind: string): boolean {
  return kind === 'err' || kind === 'error' || kind === 'warn' || kind === 'warning';
}

export default function ToastHost() {
  // `t` is called during render, not memoised, so the `lang` re-render that
  // `useT` drives is what relabels the dismiss control on a language change.
  const { t } = useT();
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
      const remaining = action ? ACTION_TIMEOUT_MS : PLAIN_TIMEOUT_MS;
      setToasts((prev) => [
        ...prev.slice(-4),
        { id, message, kind, action, remaining, deadline: Date.now() + remaining },
      ]);
    };
    window.addEventListener('os:toast', onToast);
    return () => window.removeEventListener('os:toast', onToast);
  }, []);

  // One sweep for every toast, instead of a `setTimeout` per toast that no
  // longer knows its own deadline once the host is held.
  useEffect(() => {
    if (toasts.length === 0) return;
    const h = window.setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((x) => x.deadline === null || x.deadline > now));
    }, SWEEP_MS);
    return () => window.clearInterval(h);
  }, [toasts.length]);

  /**
   * Hold every countdown while the user is deciding. The actioned toast is why:
   * the drop router's Undo gives nine seconds to reverse a file move, and that
   * window used to keep running while the pointer travelled to the button and
   * while a screen-reader user tabbed into it — a recovery path that expires
   * mid-reach is not a recovery path.
   */
  const hold = useCallback(() => {
    const now = Date.now();
    setToasts((prev) =>
      prev.map((x) =>
        x.deadline === null ? x : { ...x, remaining: Math.max(0, x.deadline - now), deadline: null },
      ),
    );
  }, []);
  const release = useCallback(() => {
    const now = Date.now();
    setToasts((prev) =>
      prev.map((x) => (x.deadline === null ? { ...x, deadline: now + x.remaining } : x)),
    );
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);
  // `ToastViewport` is rendered unconditionally — an early `return null` on an
  // empty `os:toast` list would unmount the `ui:toast` listener with it, which
  // is the same "no viewport" bug in a slower form. It renders nothing of its
  // own until a `ui:toast` arrives.
  return (
    <>
      {toasts.length > 0 && (
        <div className="os-toast-host" aria-live="polite" onFocus={hold} onBlur={release}>
          {toasts.map((toast) => {
            const urgent = isUrgent(toast.kind);
            return (
              <div
                key={toast.id}
                // `has-action` is what opts the box back into hit-testing: the
                // host is `pointer-events: none` so a purely informational
                // toast never swallows a desktop click, and only the one
                // carrying a decision needs the pointer to be able to rest on
                // it. The dismiss button opts itself in either way.
                className={`os-toast ${toast.kind}${toast.action ? ' has-action' : ''}`}
                // A nested live region wins over the polite ancestor for its
                // own subtree, so a failure interrupts instead of queueing
                // behind whatever the screen reader was already saying.
                role={urgent ? 'alert' : undefined}
                aria-live={urgent ? 'assertive' : undefined}
                onMouseEnter={hold}
                onMouseLeave={release}
              >
                <span className="os-toast-text">{toast.message}</span>
                {toast.action && (
                  <button
                    type="button"
                    className="os-toast-action"
                    onClick={() => {
                      toast.action?.run();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                )}
                <button
                  type="button"
                  className="os-toast-close"
                  // Several toasts stack at once — three were on screen while
                  // this was measured — and every one of their ✕ buttons
                  // announced the bare word "Dismiss" (D152). The visible
                  // sentence is the toast's only identity, so it is its name.
                  // `title` stays the short word: it is a hover tooltip on a
                  // control whose own message is already two lines above it.
                  title={t('notifications.dismiss')}
                  aria-label={t('notifications.dismissNamed', { title: toast.message })}
                  onClick={() => dismiss(toast.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <ToastViewport />
      {/*
        Reading Lists §11.3's reminder card. Mounted here for the reason this
        file's header already gives: this is the one place every shell mounts
        exactly once, and App.tsx alone renders `ToastHost` in ten branches. An
        eleventh mount point would be eleven chances for one shell to be the one
        that never shows a reminder. It renders nothing until main pushes one.
      */}
      <ReadingReminderHost />
    </>
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
