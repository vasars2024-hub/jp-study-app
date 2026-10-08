/**
 * Lockscreen — full-screen Win11-style gate (GrammarX), compact widget (floating),
 * or the Aero logon screen (Secret Aero): a Vista-era dark teal stage with
 * drifting light ribbons, a centred user tile, ease-of-access and power orbs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import {
  loadLockscreen,
  markLockscreenUnlocked,
  verifyLockscreenPin,
  type LockscreenSettings,
} from '../lockscreenSettings';
import { AERO_THEME_ID } from '../theme/frutiger-aero';
import { WIRED_ARCHIVE_THEME_ID } from '../theme/wired-archive';
import { loadThemeId } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

function isAeroLockscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.getAttribute('data-materials') === 'aero' ||
    loadThemeId() === AERO_THEME_ID
  );
}

function isWiredLockscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.getAttribute('data-materials') === 'wired' ||
    loadThemeId() === WIRED_ARCHIVE_THEME_ID
  );
}

export default function Lockscreen({
  onUnlocked,
  widgetMode = false,
}: {
  onUnlocked: () => void;
  widgetMode?: boolean;
}) {
  const { t, lang } = useT();
  const aeroMode = !widgetMode && isAeroLockscreen();
  const wiredMode = !widgetMode && isWiredLockscreen();
  // Aero logon extras: ease-of-access (high-contrast, larger type on this
  // screen only) and the power orb's "display off" doze. Both are local to the
  // lock screen and reversible; neither can bypass the passcode.
  const [easeMode, setEaseMode] = useState(false);
  const [dozing, setDozing] = useState(false);
  const [cfg] = useState<LockscreenSettings>(() => loadLockscreen());
  const [digits, setDigits] = useState('');
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);
  const [error, setError] = useState(false);
  // Wired lockscreen: amber flash per failure; red is reserved for 3+ failures.
  const [failCount, setFailCount] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const widgetRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (aeroMode || wiredMode) passwordRef.current?.focus();
  }, [aeroMode, wiredMode]);

  // Doze: any key or press wakes the screen and puts focus back in the field.
  useEffect(() => {
    if (!dozing) return;
    const wake = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setDozing(false);
      window.setTimeout(() => passwordRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', wake, true);
    window.addEventListener('pointerdown', wake, true);
    return () => {
      window.removeEventListener('keydown', wake, true);
      window.removeEventListener('pointerdown', wake, true);
    };
  }, [dozing]);

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
    setFailCount((c) => c + 1);
    if (isWiredLockscreen()) window.dispatchEvent(new CustomEvent('wired:sync-fail'));
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
      onUnlocked();
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
    if (aeroMode || wiredMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (unlocking) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        press('del');
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        press(e.key as (typeof KEYS)[number]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [press, unlocking, aeroMode, wiredMode]);

  const submitPassword = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (unlocking || shake) return;
    tryUnlock(password.replace(/\D/g, '').slice(0, 4));
  };

  // Formatted in the *UI* language, not the OS locale. `[]` fell back to the
  // system locale, so every skin printed `Wed, Aug 5` under a Russian or
  // Japanese UI — the clock is the largest text on the default lockscreen.
  const locale = LANG_TAGS[lang];
  const time = clock.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const date = clock.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });

  if (wiredMode) {
    return (
      <div
        className={`lockscreen lockscreen-wired${unlocking ? ' is-unlocking' : ''}${shake ? ' is-shake' : ''}${error ? ' is-error' : ''}${error && failCount >= 3 ? ' is-error-hard' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('lockscreen.aria.wired')}
      >
        <div className="lockscreen-wired-map" aria-hidden="true" />
        <div className="lockscreen-wired-noise" aria-hidden="true" />
        <section className="lockscreen-wired-panel">
          {/* Fixed terminal/node identifiers — set dressing, English by design.
              See the lockscreen block in catalogs/en.ts. */}
          <header className="lockscreen-wired-head">
            <span>TERMINAL ID: WIRED ARCHIVE</span>
            <span>NODE STATUS: PASSIVE</span>
          </header>
          <div className="lockscreen-wired-clock">
            <time>{time}</time>
            <span>{date}</span>
          </div>
          <div className="lockscreen-wired-grid" aria-hidden="true">
            {['LEX', 'MEM', 'FEED', 'OPS', 'LINK', 'SYS'].map((node) => (
              <span key={node}>{node}</span>
            ))}
          </div>
          <form className="lockscreen-wired-form" onSubmit={submitPassword}>
            <label htmlFor="wired-access-code">{t('lockscreen.wired.inputCode')}</label>
            <div className="lockscreen-wired-command">
              <span aria-hidden="true">&gt;</span>
              <input
                id="wired-access-code"
                ref={passwordRef}
                type="password"
                value={password}
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                disabled={unlocking}
                aria-label={t('lockscreen.aria.accessCode')}
                onChange={(e) => {
                  setPassword(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setError(false);
                }}
              />
              <button type="submit" disabled={unlocking}>
                {t('lockscreen.wired.auth')}
              </button>
            </div>
            <p className="lockscreen-wired-status">
              {error ? t('lockscreen.wired.denied') : t('lockscreen.wired.clearance')}
            </p>
          </form>
        </section>
      </div>
    );
  }

  if (aeroMode) {
    // The failure flash (`error`) lasts 420 ms; the Vista-style notice under the
    // field stays until the person starts typing again, so it can be read.
    const showIncorrect = error || (failCount > 0 && password === '');
    return (
      <div
        className={`lockscreen lockscreen-aero${unlocking ? ' is-unlocking' : ''}${shake ? ' is-shake' : ''}${easeMode ? ' is-ease' : ''}${dozing ? ' is-dozing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('lockscreen.aria.xp')}
      >
        <div className="lockscreen-aero-bg" aria-hidden="true">
          <span className="lockscreen-aero-ribbon is-a" />
          <span className="lockscreen-aero-ribbon is-b" />
          <span className="lockscreen-aero-glow" />
        </div>
        <div className="lockscreen-aero-clock" aria-hidden="true">
          <time>{time}</time>
          <span>{date}</span>
        </div>
        <div className="lockscreen-aero-center">
          <div className={`lockscreen-aero-tile${shake ? ' is-shake' : ''}${error ? ' is-error' : ''}`}>
            <div className="lockscreen-aero-frame" aria-hidden="true">
              <span className="lockscreen-aero-picture" />
            </div>
            <div className="lockscreen-aero-name">{t('lockscreen.user')}</div>
            <form className="lockscreen-aero-form" onSubmit={submitPassword}>
              <input
                ref={passwordRef}
                type="password"
                className="lockscreen-aero-pass"
                value={password}
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                disabled={unlocking}
                placeholder={t('lockscreen.aria.password')}
                aria-label={t('lockscreen.aria.password')}
                aria-invalid={showIncorrect || undefined}
                aria-describedby="lockscreen-aero-status"
                onChange={(e) => {
                  setPassword(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setError(false);
                }}
              />
              <button type="submit" className="lockscreen-aero-go" disabled={unlocking} aria-label={t('lockscreen.aria.signIn')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h13M12.5 6.5 18 12l-5.5 5.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
            <p id="lockscreen-aero-status" className="lockscreen-aero-status" role="status" aria-live="polite">
              {showIncorrect ? t('lockscreen.xp.incorrect') : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="lockscreen-aero-orb lockscreen-aero-ease"
          aria-pressed={easeMode}
          aria-label={t('aeroVista.lock.easeOfAccess')}
          title={t('aeroVista.lock.easeOfAccess')}
          onClick={() => {
            setEaseMode((on) => !on);
            passwordRef.current?.focus();
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="7.4" r="1.6" fill="currentColor" />
            <path d="M7.2 10.2 12 11.2l4.8-1M12 11.2v3.4M12 14.6l-2.6 4M12 14.6l2.6 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lockscreen-aero-brand" aria-hidden="true">
          <span className="lockscreen-aero-mark" />
          <span className="lockscreen-aero-word">Gum</span>
          <span className="lockscreen-aero-edition">{t('aeroVista.lock.edition')}</span>
        </div>
        <button
          type="button"
          className="lockscreen-aero-orb lockscreen-aero-power"
          aria-label={t('aeroVista.lock.sleep')}
          title={t('aeroVista.lock.sleep')}
          disabled={unlocking}
          onClick={() => setDozing(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3.6v7.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M7.1 6.4a7.4 7.4 0 1 0 9.8 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        {dozing && (
          <div className="lockscreen-aero-doze" role="status" aria-live="polite">
            <span>{t('aeroVista.lock.wakeHint')}</span>
          </div>
        )}
      </div>
    );
  }

  if (widgetMode) {
    return (
      <div
        className={`lockscreen lock-tint-${cfg.tint} is-widget${unlocking ? ' is-unlocking' : ''}${shake ? ' is-shake' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('lockscreen.aria.widget')}
      >
        <div ref={widgetRef} className="lockscreen-widget">
          <header className="lockscreen-bar">
            <span className="lockscreen-brand">
              <span className="lockscreen-brand-mark" aria-hidden />
              {t('lockscreen.widget.brand')}
            </span>
            <span className="lockscreen-clock-inline">{time}</span>
          </header>
          <div className="lockscreen-date muted">{date}</div>
          <p className={`lockscreen-prompt${error ? ' is-error' : ''}`}>
            {error ? t('lockscreen.widget.wrong') : t('lockscreen.widget.enter')}
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
                    title={t('lockscreen.delete')}
                    disabled={unlocking}
                    onClick={() => press('del')}
                  >
                    {t('lockscreen.del')}
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

  return (
    <div
      className={`lockscreen lockscreen-win11 lock-tint-${cfg.tint}${unlocking ? ' is-unlocking' : ''}${shake ? ' is-shake' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('lockscreen.aria.win11')}
    >
      <div className="lockscreen-win11-bg" aria-hidden="true">
        <div className="lockscreen-win11-bg-clouds" />
        <div className="lockscreen-win11-bg-vignette" />
      </div>
      <div className="lockscreen-win11-clock" aria-hidden="true">
        <time className="lockscreen-win11-time">{time}</time>
        <span className="lockscreen-win11-date">{date}</span>
      </div>
      <div className="lockscreen-win11-panel">
        <div className="lockscreen-win11-avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.6" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="lockscreen-win11-name">{t('lockscreen.user')}</div>
        <p className={`lockscreen-win11-prompt${error ? ' is-error' : ''}`}>
          {error ? t('lockscreen.win11.incorrect') : t('lockscreen.win11.enter')}
        </p>
        <div className="lockscreen-win11-dots" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`lockscreen-win11-dot${i < digits.length ? ' is-filled' : ''}${error ? ' is-error' : ''}`} />
          ))}
        </div>
        <div className="lockscreen-win11-pad">
          {KEYS.map((key, i) => {
            if (key === '') {
              return <span key={`empty-${i}`} className="lockscreen-win11-key is-spacer" aria-hidden />;
            }
            if (key === 'del') {
              return (
                <button
                  key="del"
                  type="button"
                  className="lockscreen-win11-key is-action"
                  title={t('lockscreen.delete')}
                  disabled={unlocking}
                  onClick={() => press('del')}
                >
                  {t('lockscreen.del')}
                </button>
              );
            }
            return (
              <button
                key={key}
                type="button"
                className="lockscreen-win11-key"
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
