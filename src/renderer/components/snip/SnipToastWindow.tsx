import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { snipWordList, type SnipToastPayload } from '../../../shared/snipToCards';
import './snip.css';

/** How long the toast stays: longer when it offers Undo, because that asks for a decision. */
const PLAIN_MS = 5000;
const ACTION_MS = 9000;

/**
 * The small toast Snip to cards shows over other apps while Gum is in the
 * background (`?snipToast=1`, main/snipToCards.ts): what the snip added, with
 * Undo and Open analysis. Main shows it without taking the focus; it closes
 * itself, and holds while the pointer or the keyboard is on it.
 */
export default function SnipToastWindow() {
  const { t } = useT();
  const [payload, setPayload] = useState<SnipToastPayload | null>(null);
  const [held, setHeld] = useState(false);
  const deadline = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add('snip-toast-window');
    let alive = true;
    window.api.snipToastGet().then((p) => {
      if (alive && p) setPayload(p);
    }).catch(() => undefined);
    const off = window.api.onSnipToast((p) => setPayload(p));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const close = useCallback(() => {
    void window.api.snipToastClose();
  }, []);

  const hasUndo = payload?.kind === 'added' && Boolean(payload.id) && (payload.count ?? 0) > 0;
  useEffect(() => {
    if (!payload) return;
    deadline.current = Date.now() + (hasUndo ? ACTION_MS : PLAIN_MS);
  }, [payload, hasUndo]);
  useEffect(() => {
    if (!payload || held) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= deadline.current) close();
    }, 250);
    return () => window.clearInterval(timer);
  }, [payload, held, close]);
  // Released after a hold: the rest of the time, not all of it again.
  useEffect(() => {
    if (!held) deadline.current = Math.max(deadline.current, Date.now() + 2000);
  }, [held]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!payload) return null;
  const words = payload.words ?? [];
  const count = payload.count ?? words.length;
  let message: string;
  switch (payload.kind) {
    case 'added':
      message = t('snip.toast.added', { count, words: snipWordList(words) });
      break;
    case 'none':
      message = t('snip.toast.none');
      break;
    case 'undone':
      message = t('snip.toast.undone', { count });
      break;
    case 'paused':
      message = t('snip.toast.paused');
      break;
    case 'resumed':
      message = t('snip.toast.resumed');
      break;
    default:
      message = payload.error === 'models-missing'
        ? t('snip.toast.modelsMissing', { lang: t(`snip.lang.${payload.lang ?? 'zh'}`) })
        : payload.error === 'no-text'
          ? t('snip.error.noText')
          : payload.error === 'garbage'
            ? t('snip.error.garbage')
            : payload.error === 'low-confidence'
              ? t('snip.error.lowConfidence')
              : t('snip.error.ocrFailed');
  }

  return (
    <div
      className="snip-toast"
      role="status"
      aria-live="polite"
      aria-label={t('snip.toast.label')}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="snip-toast-title">{t('snip.toast.label')}</div>
      <p className="snip-toast-message">{message}</p>
      <div className="snip-toast-actions">
        {hasUndo && (
          <button type="button" className="snip-toast-undo" onClick={() => void window.api.snipAction({ id: payload.id as string, action: 'undo' })}>
            {t('snip.toast.undo')}
          </button>
        )}
        {payload.id && (
          <button type="button" className="snip-toast-open" onClick={() => void window.api.snipOpen(payload.id ?? null)}>
            {t('snip.toast.open')}
          </button>
        )}
        <button type="button" className="snip-toast-close" onClick={close}>
          {t('snip.toast.close')}
        </button>
      </div>
    </div>
  );
}
