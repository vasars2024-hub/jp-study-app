import { useEffect, useRef, useState } from 'react';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { getUiLang, useT } from '../../i18n';
import { verifyLockscreenPin } from '../../lockscreenSettings';
import { useLockBlockedToasts } from '../../lockBlockedNotice';

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * Blanc's PIN lockscreen.
 *
 * Two input paths feed the same four digits: the auto-focused PIN field (its
 * own `onChange`) and a window-level keydown for when focus is elsewhere. They
 * used to BOTH count a keypress made in the field — the window listener had no
 * target check — so every digit was entered twice and a correct PIN typed
 * normally could never unlock. The window path now ignores keys whose target
 * is an editable field, the same rule Study OS's lockscreen follows.
 */
export function BlancLockscreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useT();
  useLockBlockedToasts();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const now = useMinuteClock();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (pin: string): void => {
    if (pin.length !== 4) return;
    void Promise.resolve(verifyLockscreenPin(pin)).then((ok) => {
      if (!ok) {
        setDigits('');
        setError(t('blanc.tb.wrongPin'));
        return;
      }
      onUnlocked();
    });
  };
  // The keydown listener registers once; it reaches the latest `submit` here.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target === inputRef.current || target.closest('input, textarea, select, [contenteditable="true"]'))
      ) {
        return;
      }
      if (/^\d$/.test(event.key)) {
        setDigits((prev) => {
          if (prev.length >= 4) return prev;
          const next = prev + event.key;
          if (next.length === 4) window.setTimeout(() => submitRef.current(next), 40);
          return next;
        });
        setError('');
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        setDigits((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="blanc-lock">
      <section className="blanc-lock-box" role="dialog" aria-modal="true" aria-label={t('blanc.tb.lockscreen')}>
        <time className="blanc-lock-time">
          {now.toLocaleTimeString(LANG_TAGS[getUiLang()], { hour: '2-digit', minute: '2-digit' })}
        </time>
        <div className="blanc-lock-date">
          {now.toLocaleDateString(LANG_TAGS[getUiLang()], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <label>
          {t('blanc.tb.pinLabel')}
          <input
            ref={inputRef}
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={digits}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, '').slice(0, 4);
              setDigits(next);
              setError('');
              if (next.length === 4) submit(next);
            }}
          />
        </label>
        <div className="blanc-lock-dots" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < digits.length ? 'filled' : ''} />
          ))}
        </div>
        {error && <p className="blanc-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
