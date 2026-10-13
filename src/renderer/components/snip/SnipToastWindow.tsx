import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import {
  snipEngineLabel,
  snipWordList,
  SNIP_TOAST_NOTICE_MS,
  SNIP_TOAST_PLAIN_MS,
  SNIP_TOAST_UNDO_MS,
  type SnipToastPayload,
} from '../../../shared/snipToCards';
import './snip.css';

/**
 * The small toast Snip to cards shows over other apps while Gum is in the
 * background (`?snipToast=1`, main/snipToCards.ts): what the snip added, with
 * Undo and Open analysis. Main shows it without taking the focus; it closes
 * itself, and holds while the pointer or the keyboard is on it.
 *
 * Undo's window is shown, not guessed: a bar and a seconds count say how long
 * the toast stays, and the line under it says Undo stays in Snips afterwards.
 * The first snip that makes cards also carries the one-time notice that Snip
 * to cards is on, with Turn off and Keep on.
 */
export default function SnipToastWindow() {
  const { t } = useT();
  const [payload, setPayload] = useState<SnipToastPayload | null>(null);
  const [held, setHeld] = useState(false);
  const [left, setLeft] = useState(0);
  const deadline = useRef(0);
  const total = useRef(SNIP_TOAST_PLAIN_MS);

  useEffect(() => {
    document.documentElement.classList.add('snip-toast-window');
    let alive = true;
    window.api.snipToastGet().then((p) => {
      if (alive && p) setPayload(p);
    }).catch(() => undefined);
    const off = window.api.onSnipToast((p) => {
      setTurnedOff(false);
      setPayload(p);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const close = useCallback(() => {
    void window.api.snipToastClose();
  }, []);

  const [turnedOff, setTurnedOff] = useState(false);
  const undoable = payload?.kind === 'added' && !turnedOff
    && Boolean(payload.id) && ((payload.count ?? 0) > 0 || (payload.merged ?? 0) > 0);
  const notice = Boolean(payload?.notice);
  useEffect(() => {
    if (!payload) return;
    total.current = notice ? SNIP_TOAST_NOTICE_MS : undoable ? SNIP_TOAST_UNDO_MS : SNIP_TOAST_PLAIN_MS;
    deadline.current = Date.now() + total.current;
    setLeft(total.current);
  }, [payload, undoable, notice]);
  useEffect(() => {
    if (!payload || held) return;
    const timer = window.setInterval(() => {
      const remaining = deadline.current - Date.now();
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) close();
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

  const answer = useCallback(async (keep: boolean) => {
    try {
      await window.api.snipSetSettings(keep ? { notice: 'answered' } : { enabled: false, notice: 'answered' });
    } catch {
      /* the Snips view keeps the banner until it is answered */
    }
    if (!keep) setTurnedOff(true);
    // The answer is shown briefly, then the toast goes.
    total.current = SNIP_TOAST_PLAIN_MS;
    deadline.current = Date.now() + SNIP_TOAST_PLAIN_MS;
    setPayload((p) => (p ? { ...p, notice: false } : p));
  }, []);

  if (!payload) return null;
  const words = payload.words ?? [];
  const count = payload.count ?? words.length;
  const merged = payload.merged ?? 0;
  let message: string;
  switch (payload.kind) {
    case 'added':
      message = count
        ? t('snip.toast.added', { count, words: snipWordList(words) })
        : t('snip2.toast.mergedOnly', { count: merged });
      if (count && merged) message = `${message} ${t('snip2.toast.mergedToo', { count: merged })}`;
      break;
    case 'review':
      message = payload.review === 'uncertain'
        ? t('snip2.toast.reviewUnsure', { count, percent: payload.confidence ?? 0 })
        : t('snip2.toast.review', { count });
      break;
    case 'none':
      message = t('snip.toast.none');
      break;
    case 'undone':
      message = count || !merged
        ? t('snip.toast.undone', { count })
        : t('snip2.toast.examplesRemoved', { count: merged });
      if (count && merged) message = `${message} ${t('snip2.toast.examplesRemoved', { count: merged })}`;
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
  if (turnedOff) message = t('snip2.notice.turnedOff');
  const label = snipEngineLabel(payload.engine);
  const engine = label ? label.name ?? t(label.key as string) : '';
  const readBy = engine && (payload.kind === 'added' || payload.kind === 'review' || payload.kind === 'none')
    ? typeof payload.confidence === 'number'
      ? t('snip2.toast.readByConfidence', { engine, percent: payload.confidence })
      : t('snip2.toast.readBy', { engine })
    : '';
  const seconds = Math.ceil(left / 1000);
  const progress = total.current > 0 ? Math.max(0, Math.min(1, left / total.current)) : 0;

  return (
    <div
      className={`snip-toast${notice ? ' has-notice' : ''}`}
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
      {readBy && <p className="snip-toast-meta">{readBy}</p>}
      {undoable && (
        <>
          <div className="snip-toast-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${held ? 1 : progress})` }} />
          </div>
          <p className="snip-toast-meta">{t('snip2.toast.undoLater', { seconds })}</p>
        </>
      )}
      {notice && (
        <div className="snip-toast-notice" role="group" aria-label={t('snip2.notice.title')}>
          <p className="snip-toast-notice-title">{t('snip2.notice.title')}</p>
          <p className="snip-toast-notice-body">{t('snip2.notice.body')}</p>
          <div className="snip-toast-actions">
            <button type="button" className="snip-toast-off" onClick={() => void answer(false)}>
              {t('snip2.notice.turnOff')}
            </button>
            <button type="button" className="snip-toast-keep" onClick={() => void answer(true)}>
              {t('snip2.notice.keep')}
            </button>
          </div>
        </div>
      )}
      <div className="snip-toast-actions">
        {undoable && (
          <button type="button" className="snip-toast-undo" onClick={() => void window.api.snipAction({ id: payload.id as string, action: 'undo' })}>
            {t('snip.toast.undo')}
          </button>
        )}
        {payload.id && (
          <button type="button" className="snip-toast-open" onClick={() => void window.api.snipOpen(payload.id ?? null)}>
            {payload.kind === 'review' ? t('snip2.toast.reviewAction') : t('snip.toast.open')}
          </button>
        )}
        <button type="button" className="snip-toast-close" onClick={close}>
          {t('snip.toast.close')}
        </button>
      </div>
    </div>
  );
}
