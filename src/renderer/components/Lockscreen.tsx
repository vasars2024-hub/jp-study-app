/**
 * Lockscreen — compact PIN widget (default) or Windows XP welcome screen (Aero).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadLockscreen,
  markLockscreenUnlocked,
  verifyLockscreenPin,
  type LockscreenSettings,
} from '../lockscreenSettings';
import { AERO_THEME_ID } from '../theme/frutiger-aero';
import { loadThemeId } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

function isAeroLockscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.getAttribute('data-materials') === 'aero' ||
    loadThemeId() === AERO_THEME_ID
  );
}

export default function Lockscreen({
  onUnlocked,
  widgetMode = false,
}: {
  onUnlocked: () => void;
  widgetMode?: boolean;
}) {
  const xpMode = !widgetMode && isAeroLockscreen();
  const [cfg] = useState<LockscreenSettings>(() => loadLockscreen());
  const [digits, setDigits] = useState('');
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);
  const [error, setError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const widgetRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (xpMode) passwordRef.current?.focus();
  }, [xpMode]);

  useEffect(() => {
    if (!widgetMode) return;
    document.documentElement.classList.add('lockscreen-widget-root');
    document.body.classList.add('lockscreen-widget-root');
    void import('../appZoom').then(({ applyZoom, loadZoom }) => {
      const prev = loadZoom();
      applyZoom(1);
      (window as unknown as { __lockPrevZoom?: number }).__lockPrevZoom = prev;
    });
    return () => {
      document.documentElement.classList.remove('lockscreen-widget-root');
      document.body.classList.remove('lockscreen-widget-root');
      const prev = (window as unknown as { __lockPrevZoom?: number }).__lockPrevZoom;
      if (typeof prev === 'number') {
        void import('../appZoom').then(({ applyZoom }) => applyZoom(prev));
      }
    };
  }, [widgetMode]);

  useEffect(() => {
    if (!widgetMode || !widgetRef.current) return;
    const el = widgetRef.current;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      void window.api.lockscreenSetSize({
        width: Math.ceil(rect.width) + 8,
        height: Math.ceil(rect.height) + 8,
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widgetMode]);

  const fail = useCallback(() => {
    setError(true);
    setShake(true);
    window.setTimeout(() => {
      setDigits('');
      setPassword('');
      setShake(false);
      setError(false);
    }, 420);
  }, []);

  const tryUnlock = useCallback(
    (pin: string) => {
      if (pin.length !== 4) return;
      if (!verifyLockscreenPin(pin)) {
        fail();
        return;
      }
      setUnlocking(true);
      markLockscreenUnlocked();
      const reduce =
        typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');
      window.setTimeout(() => onUnlocked(), reduce ? 80 : 560);
    },
    [fail, onUnlocked],
  );

  const press = useCallback(
    (key: (typeof KEYS)[number]) => {
      if (unlocking || shake) return;
      if (key === '') return;
      if (key === 'del') {
        setDigits((d) => d.slice(0, -1));
        setError(false);
        return;
      }
      setDigits((d) => {
        if (d.length >= 4) return d;
        const next = d + key;
        if (next.length === 4) window.setTimeout(() => tryUnlock(next), 80);
        return next;
      });
    },
    [unlocking, shake, tryUnlock],
  );

  useEffect(() => {
    if (xpMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (unlocking) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        press('del');
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key as (typeof KEYS)[number]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, unlocking, xpMode]);

  const submitPassword = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (unlocking || shake) return;
    tryUnlock(password.replace(/\D/g, '').slice(0, 4));
  };

  const time = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = clock.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  if (xpMode) {
    return (
      <div
        className={`lockscreen lockscreen-xp${unlocking ? ' is-unlocking' : ''}${shake ? ' is-shake' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome — enter your password"
      >
        <div className="lockscreen-xp-left">
          <div className="lockscreen-xp-logo" aria-hidden="true">
            <span className="lockscreen-xp-emblem" />
            <span className="lockscreen-xp-wordmark">
              <span className="lockscreen-xp-tag">Secret</span>
              <span className="lockscreen-xp-brand">
                Study<span className="lockscreen-xp-ed">OS</span>
              </span>
            </span>
          </div>
          <p className="lockscreen-xp-hint">To begin, click your user name</p>
        </div>
        <div className="lockscreen-xp-right">
          <div className={`lockscreen-xp-user${shake ? ' is-shake' : ''}${error ? ' is-error' : ''}`}>
            <div className="lockscreen-xp-avatar" aria-hidden="true" />
            <div className="lockscreen-xp-user-body">
              <div className="lockscreen-xp-user-name">User</div>
              <div className="lockscreen-xp-user-prompt">
                {error ? 'Incorrect password' : 'Type your password'}
              </div>
              <form className="lockscreen-xp-pass-row" onSubmit={submitPassword}>
                <input
                  ref={passwordRef}
                  type="password"
                  className="lockscreen-xp-pass"
                  value={password}
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={unlocking}
                  aria-label="Password"
                  onChange={(e) => {
                    setPassword(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setError(false);
                  }}
                />
                <button type="submit" className="lockscreen-xp-go" disabled={unlocking} aria-label="Sign in">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
          <div className="lockscreen-xp-clock muted">
            {time} · {date}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`lockscreen lock-tint-${cfg.tint}${widgetMode ? ' is-widget' : ''}${unlocking ? ' is-unlocking' : ''}${shake ? ' is-shake' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Enter passcode"
    >
      <div ref={widgetRef} className="lockscreen-widget">
        <header className="lockscreen-bar">
          <span className="lockscreen-brand">
            <span className="lockscreen-brand-mark" aria-hidden />
            Lock
          </span>
          <span className="lockscreen-clock-inline">{time}</span>
        </header>
        <div className="lockscreen-date muted">{date}</div>
        <p className={`lockscreen-prompt${error ? ' is-error' : ''}`}>
          {error ? 'Wrong passcode' : 'Enter passcode'}
        </p>
        <div className="lockscreen-dots" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`lockscreen-dot${i < digits.length ? ' is-filled' : ''}${error ? ' is-error' : ''}`} />
          ))}
        </div>
        <div className="lockscreen-pad">
          {KEYS.map((key, i) => {
            if (key === '') {
              return <span key={`empty-${i}`} className="lockscreen-key is-spacer" aria-hidden />;
            }
            if (key === 'del') {
              return (
                <button
                  key="del"
                  type="button"
                  className="lockscreen-key is-action"
                  title="Delete"
                  disabled={unlocking}
                  onClick={() => press('del')}
                >
                  Del
                </button>
              );
            }
            return (
              <button
                key={key}
                type="button"
                className="lockscreen-key"
                disabled={unlocking}
                onClick={() => press(key)}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
