import { useEffect, useState } from 'react';

/**
 * Renders transient `os:toast` messages. Extracted from App.tsx when Blanc got
 * its own entry point (BLANC_REFINEMENT_PLAN.md Pillar 1) — both the Study OS
 * shell and the standalone Blanc window need it, and Blanc must not import
 * App.tsx, which pulls in the whole desktop.
 */
export default function ToastHost() {
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<{ message?: string; kind?: string }>).detail;
      const message = d?.message?.trim();
      if (!message) return;
      const id = ++n;
      const kind = d?.kind ?? 'ok';
      setToasts((t) => [...t.slice(-4), { id, message, kind }]);
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 2800);
    };
    window.addEventListener('os:toast', onToast);
    return () => window.removeEventListener('os:toast', onToast);
  }, []);
  if (!toasts.length) return null;
  return (
    <div className="os-toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`os-toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
