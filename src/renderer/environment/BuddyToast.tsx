import { useEffect, useState } from 'react';
import { BUDDY_TOAST_EVENT } from './buddyRoutines';

export default function BuddyToast() {
  const [toast, setToast] = useState<{ title: string; body?: string } | null>(null);

  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ title?: string; body?: string }>).detail;
      if (!d?.title) return;
      setToast({ title: d.title, body: d.body });
    };
    window.addEventListener(BUDDY_TOAST_EVENT, on);
    return () => window.removeEventListener(BUDDY_TOAST_EVENT, on);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="buddy-toast" role="status" aria-live="polite">
      <strong>{toast.title}</strong>
      {toast.body && <span className="muted">{toast.body}</span>}
    </div>
  );
}
