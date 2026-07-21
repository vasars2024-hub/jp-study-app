import { useEffect, useState } from 'react';
import { getFocusLockRemainingMs, isFocusLocked, onFocusLockChanged } from '../focusMode';
import { useT } from '../i18n';

function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function FocusLockBadge() {
  const { t } = useT();
  const [remaining, setRemaining] = useState(() =>
    isFocusLocked() ? getFocusLockRemainingMs() : 0,
  );

  useEffect(() => {
    const tick = () => {
      if (!isFocusLocked()) {
        setRemaining(0);
        return;
      }
      setRemaining(getFocusLockRemainingMs());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    const unsub = onFocusLockChanged(tick);
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, []);

  if (remaining <= 0) return null;

  return (
    <span className="focus-lock-badge" title={t('focus.lock.badgeHint')}>
      <span className="focus-lock-badge-label">{t('focus.lock.badge')}</span>
      <time className="focus-lock-badge-time">{formatRemaining(remaining)}</time>
    </span>
  );
}
