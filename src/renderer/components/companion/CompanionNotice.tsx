import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import './companion.css';

type Notice = { messageKey: string; vars?: Record<string, string | number>; tone?: 'ok' | 'muted' | 'warn' };

/**
 * The companion notice (`?companion=notice`): one line saying what a hotkey
 * just did — "Added to your deck", "Capture started" — shown without taking
 * focus from the app the user is in, and gone by itself. Click-through.
 */
export default function CompanionNotice() {
  const { t } = useT();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let alive = true;
    window.api
      .companionGetNotice()
      .then((n) => {
        if (alive) setNotice(n);
      })
      .catch(() => undefined);
    const off = window.api.onCompanionNotice((n) => setNotice(n));
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!notice) return <div className="companion-notice-root" />;
  return (
    <div className="companion-notice-root">
      <div className={`companion-surface companion-notice tone-${notice.tone ?? 'ok'}`} role="status">
        <span className="companion-notice-dot" aria-hidden="true" />
        <span className="companion-notice-text">{t(notice.messageKey, notice.vars)}</span>
      </div>
    </div>
  );
}
