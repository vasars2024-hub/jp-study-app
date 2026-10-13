/**
 * Lockscreen — full-screen Win11-style gate (GrammarX), compact widget (floating),
 * or the Aero logon screen (Secret Aero): a Vista-era dark teal stage with
 * drifting light ribbons, a centred user tile, ease-of-access and power orbs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import {
  isValidPin,
  loadLockscreen,
  markLockscreenUnlocked,
  readLockscreenSecretKind,
  verifyLockscreenPinDetailed,
  type LockscreenSettings,
} from '../lockscreenSettings';
import { LOCK_PASSPHRASE_MAX_CHARS, LOCK_PIN_MAX_DIGITS, normalizeLockSecretKind, type LockSecretKind } from '../../shared/lockSecret';
import { AERO_THEME_ID } from '../theme/frutiger-aero';
import { WIRED_ARCHIVE_THEME_ID } from '../theme/wired-archive';
import { loadThemeId } from '../theme';
import { useLockBlockedToasts } from '../lockBlockedNotice';
import { trapTab } from './ui/focusTrap';
import { showOsToast } from './ToastHost';
import { LockscreenChallenge, LockscreenRecovery, LockscreenStudyPanel, type LockscreenVariant } from './LockscreenStudy';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;
/** lock4: a 4-12 digit PIN has no fixed length to submit at, so the pad gets an Enter key. */
const KEYS_LONG = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ok', '0', 'del'] as const;
type PadKey = (typeof KEYS)[number] | (typeof KEYS_LONG)[number];

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
  // Shortcuts, tray rows and extension requests main refused while locked.
  useLockBlockedToasts();
  const aeroMode = !widgetMode && isAeroLockscreen();
  const wiredMode = !widgetMode && isWiredLockscreen();
  // Aero logon extras: ease-of-access (high-contrast, larger type on this
  // screen only) and the power orb's "display off" doze. Both are local to the
  // lock screen and reversible; neither can bypass the passcode.
  const [easeMode, setEaseMode] = useState(false);
  const [dozing, setDozing] = useState(false);
  const [cfg] = useState<LockscreenSettings>(() => loadLockscreen());
  /**
   * lock4: what the secret is — the 4-digit pad (submits on the fourth digit),
   * a 4-12 digit PIN (the pad gains an Enter key) or a passphrase (a text field
   * on every skin). The mirror draws the first frame; main's answer follows.
   */
  const [kind, setKind] = useState<LockSecretKind>(() => normalizeLockSecretKind(cfg.secretKind));
  useEffect(() => {
    let alive = true;
    void readLockscreenSecretKind().then((next) => {
      if (alive) setKind(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  const maxDigits = kind === 'pin4' ? 4 : LOCK_PIN_MAX_DIGITS;
  const padKeys: readonly PadKey[] = kind === 'pin' ? KEYS_LONG : KEYS;
  const [digits, setDigitsState] = useState('');
  /**
   * The digits as typed so far, updated synchronously. `press` reads and writes
   * this instead of computing the next value inside a state updater: StrictMode
   * runs updaters twice, so a submit scheduled from one fired twice and one wrong
   * PIN cost two of main's attempts (bug 37).
   */
  const digitsRef = useRef('');
  const setDigits = useCallback((next: string) => {
    digitsRef.current = next;
    setDigitsState(next);
  }, []);
  /** A PIN is with main: a second submit (Enter during the auto-submit delay) waits for its answer. */
  const verifyingRef = useRef(false);
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);
  const [error, setError] = useState(false);
  /** A longer PIN or a passphrase submitted below its minimum: said, never sent to main. */
  const [tooShort, setTooShort] = useState(false);
  // Wired lockscreen: amber flash per failure; red is reserved for 3+ failures.
  const [failCount, setFailCount] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  /**
   * Main's backoff (lockscreenPin.ts: after 5 misses, 30 s doubling to 5 min). Until this
   * existed the screen said only "Incorrect passcode" during a lockout — so the RIGHT PIN,
   * typed inside the window, read as wrong too (found by the e2e harness, flow
   * `lockscreen`). Now the wait is stated and entry pauses until it is over.
   */
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [retryNow, setRetryNow] = useState(() => Date.now());
  const waiting = retryUntil !== null && retryNow < retryUntil;
  const waitSeconds = waiting ? Math.max(1, Math.ceil((retryUntil - retryNow) / 1000)) : 0;
  const retryText = waiting ? t('lockscreen.retryIn', { count: waitSeconds }) : null;
  useEffect(() => {
    if (retryUntil === null) return undefined;
    setRetryNow(Date.now());
    const timer = window.setInterval(() => {
      const at = Date.now();
      setRetryNow(at);
      if (at >= retryUntil) setRetryUntil(null);
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryUntil]);
  const [clock, setClock] = useState(() => new Date());
  /**
   * lock3: "answer a card to unlock" comes before the PIN when the owner turned
   * it on. Without a PIN at all it is the whole gate — a study habit at launch,
   * not a lock (main is never locked behind it; `finishChallenge` checks).
   */
  const hasPin = Boolean(cfg.pinHash);
  const [stage, setStage] = useState<'challenge' | 'pin'>(() => (cfg.answerToUnlock ? 'challenge' : 'pin'));
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const pinActive = stage === 'pin' && !recoveryOpen;
  const widgetRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // a11y3: every skin is `role="dialog" aria-modal="true"`, so the keyboard has
  // to stay inside it too. Tab is trapped at the window (capture), and if focus
  // starts outside (the PIN pad skins focus nothing), it lands on the lock.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab') trapTab(e, rootRef.current);
    };
    window.addEventListener('keydown', onTab, true);
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) (passwordRef.current ?? root).focus();
    return () => window.removeEventListener('keydown', onTab, true);
  }, []);

  useEffect(() => {
    // The WIRED terminal ticks seconds; the other skins show minutes.
    const t = window.setInterval(() => setClock(new Date()), wiredMode ? 1_000 : 30_000);
    return () => window.clearInterval(t);
  }, [wiredMode]);

  useEffect(() => {
    if ((aeroMode || wiredMode || kind === 'passphrase') && pinActive) passwordRef.current?.focus();
  }, [aeroMode, wiredMode, pinActive, kind]);
  // The challenge's buttons go away when it is passed: keep focus in the lock.
  useEffect(() => {
    if (stage !== 'pin') return;
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) (passwordRef.current ?? root).focus();
  }, [stage]);

  const finishChallenge = useCallback(() => {
    if (hasPin) {
      setStage('pin');
      return;
    }
    // No PIN in this window's mirror — but main is the judge: if it holds a
    // lock, the PIN step follows after all (a stale mirror never unlocks).
    void Promise.resolve(window.api?.lockscreenIsLocked?.())
      .catch(() => false)
      .then((mainLocked) => {
        if (mainLocked) {
          setStage('pin');
          return;
        }
        setUnlocking(true);
        markLockscreenUnlocked();
        onUnlocked();
      });
  }, [hasPin, onUnlocked]);

  const onRecovered = useCallback(() => {
    // Shown once the desktop is back (toasts wait while the lock screen is up).
    showOsToast(t('lock3.recovery.done'), 'warn');
    setUnlocking(true);
    markLockscreenUnlocked();
    onUnlocked();
  }, [onUnlocked, t]);

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
  }, [setDigits]);

  const tryUnlock = useCallback(
    (pin: string) => {
      if (kind === 'pin4') {
        if (pin.length !== 4) return;
      } else if (!isValidPin(pin)) {
        // Below the minimum (or empty): say so here; main's counter never sees it.
        if (pin.length > 0) setTooShort(true);
        return;
      }
      setTooShort(false);
      if (verifyingRef.current) return;
      verifyingRef.current = true;
      // Main checks the hash (and backs off after repeated misses), so this is async.
      void verifyLockscreenPinDetailed(pin)
        .then((res) => {
          if (!res.ok) {
            if (res.retryAfterMs && res.retryAfterMs > 0) setRetryUntil(Date.now() + res.retryAfterMs);
            fail();
            return;
          }
          setUnlocking(true);
          markLockscreenUnlocked();
          onUnlocked();
        })
        .finally(() => {
          verifyingRef.current = false;
        });
    },
    [fail, onUnlocked, kind],
  );

  const press = useCallback(
    (key: PadKey) => {
      if (unlocking || shake || waiting) return;
      if (key === '') return;
      if (key === 'ok') {
        tryUnlock(digitsRef.current);
        return;
      }
      if (key === 'del') {
        setDigits(digitsRef.current.slice(0, -1));
        setError(false);
        setTooShort(false);
        return;
      }
      setTooShort(false);
      // Outside any state updater (see digitsRef): the submit is scheduled once.
      const d = digitsRef.current;
      if (d.length >= maxDigits) return;
      const next = d + key;
      setDigits(next);
      // Only the classic 4-digit PIN submits by itself; a longer one waits for Enter.
      if (kind === 'pin4' && next.length === 4) window.setTimeout(() => tryUnlock(next), 80);
    },
    [unlocking, shake, waiting, tryUnlock, setDigits, maxDigits, kind],
  );

  useEffect(() => {
    // A passphrase is typed into its own field: no window-level digit capture.
    if (aeroMode || wiredMode || !pinActive || kind === 'passphrase') return;
    const onKey = (e: KeyboardEvent) => {
      if (unlocking) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        press('del');
        return;
      }
      if (e.key === 'Enter' && kind === 'pin') {
        // Enter on a focused pad key activates that key instead.
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        e.stopPropagation();
        press('ok');
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        press(e.key as PadKey);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [press, unlocking, aeroMode, wiredMode, pinActive, kind]);

  const submitPassword = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (unlocking || shake || waiting) return;
    tryUnlock(kind === 'passphrase' ? password : password.replace(/\D/g, '').slice(0, maxDigits));
  };
  /** The password field every skin draws for a passphrase (and Aero / WIRED for any PIN). */
  const secretFieldProps = {
    type: 'password',
    value: password,
    maxLength: kind === 'passphrase' ? LOCK_PASSPHRASE_MAX_CHARS : maxDigits,
    inputMode: kind === 'passphrase' ? ('text' as const) : ('numeric' as const),
    autoComplete: 'off',
    spellCheck: false,
    disabled: unlocking || waiting,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(kind === 'passphrase' ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, maxDigits));
      setError(false);
      setTooShort(false);
    },
  };
  /** What the PIN-pad skins say above the pad (or the passphrase field). */
  const enterPrompt = (classic: string): string =>
    tooShort
      ? t('lock4.tooShort')
      : kind === 'passphrase'
        ? t('lock4.prompt.passphrase')
        : kind === 'pin'
          ? t('lock4.prompt.pin')
          : classic;
  // A longer PIN shows as many dots as typed (never fewer than four): its length is not known.
  const dotCount = kind === 'pin4' ? 4 : Math.max(4, digits.length);
  const goArrow = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h13M12.5 6.5 18 12l-5.5 5.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  /** win11 / widget: a passphrase replaces the dots and the pad with one field. */
  const passphraseForm = (promptId: string) => (
    <form className={`lockscreen-pass-form${widgetMode ? ' is-compact' : ''}`} onSubmit={submitPassword}>
      <input
        ref={passwordRef}
        className="lockscreen-pass-input"
        {...secretFieldProps}
        placeholder={t('lock4.passphrase.label')}
        aria-label={t('lock4.passphrase.label')}
        aria-invalid={error || tooShort || undefined}
        aria-describedby={promptId}
      />
      <button
        type="submit"
        className="lockscreen-pass-go"
        disabled={unlocking || waiting}
        aria-label={t('lockscreen.aria.signIn')}
        title={t('lockscreen.aria.signIn')}
      >
        {goArrow}
      </button>
    </form>
  );

  // Formatted in the *UI* language, not the OS locale. `[]` fell back to the
  // system locale, so every skin printed `Wed, Aug 5` under a Russian or
  // Japanese UI — the clock is the largest text on the default lockscreen.
  const locale = LANG_TAGS[lang];
  const time = clock.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const date = clock.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  // The big clocks are decorative (aria-hidden); a screen reader gets one sentence.
  const clockSr = (
    <span className="sr-only">{t('lock3.clock.sr', { time, date: clock.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }) })}</span>
  );
  const variant: LockscreenVariant = wiredMode ? 'wired' : aeroMode ? 'aero' : widgetMode ? 'widget' : 'win11';
  const studyExtras = (
    <>
      {!widgetMode && <LockscreenStudyPanel mode={cfg.study} variant={variant} />}
      {hasPin && <LockscreenRecovery variant={variant} onRecovered={onRecovered} onOpenChange={setRecoveryOpen} />}
    </>
  );
  const challenge = stage === 'challenge' ? <LockscreenChallenge variant={variant} onPassed={finishChallenge} /> : null;

  /**
   * The Study OS (win11) and widget skins: the prompt, then the dots and the pad
   * for a PIN, or one passphrase field. `p` is the skin's class prefix.
   */
  const pinEntry = (p: 'lockscreen' | 'lockscreen-win11', promptId: string, promptText: string) => (
    <>
      <p id={promptId} className={`${p}-prompt${error || tooShort ? ' is-error' : ''}`} role="status">
        {retryText ?? promptText}
      </p>
      {kind === 'passphrase' ? (
        passphraseForm(promptId)
      ) : (
        <>
          <span className="sr-only" role="status">{t('a11y3.lock.digits', { count: digits.length })}</span>
          <div className={`${p}-dots`} aria-hidden>
            {Array.from({ length: dotCount }, (_, i) => (
              <span key={i} className={`${p}-dot${i < digits.length ? ' is-filled' : ''}${error ? ' is-error' : ''}`} />
            ))}
          </div>
          <div className={`${p}-pad`}>
            {padKeys.map((key, i) => {
              if (key === '') {
                return <span key={`empty-${i}`} className={`${p}-key is-spacer`} aria-hidden />;
              }
              if (key === 'del' || key === 'ok') {
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${p}-key is-action`}
                    title={key === 'del' ? t('lockscreen.delete') : t('lock4.pad.enterLabel')}
                    disabled={unlocking || waiting}
                    onClick={() => press(key)}
                  >
                    {key === 'del' ? t('lockscreen.del') : t('lock4.pad.enter')}
                  </button>
                );
              }
              return (
                <button key={key} type="button" className={`${p}-key`} disabled={unlocking || waiting} onClick={() => press(key)}>
                  {key}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  if (wiredMode) {
    return (
      <div
        className={`lockscreen lockscreen-wired${unlocking ? ' is-unlocking' : ''}${shake ? ' is-shake' : ''}${error ? ' is-error' : ''}${error && failCount >= 3 ? ' is-error-hard' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('lockscreen.aria.wired')}
        ref={rootRef}
        tabIndex={-1}
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
          {clockSr}
          {/* A Navi's boot readout: present day, present time, to the second. */}
          <div className="lockscreen-wired-clock" aria-hidden="true">
            <span className="lockscreen-wired-clock-label">PRESENT DAY</span>
            <span>{date}</span>
            <span className="lockscreen-wired-clock-label">PRESENT TIME</span>
            <time>{clock.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time>
          </div>
          <div className="lockscreen-wired-grid" aria-hidden="true">
            {['LEX', 'MEM', 'FEED', 'OPS', 'LINK', 'SYS'].map((node) => (
              <span key={node}>{node}</span>
            ))}
          </div>
          {challenge}
          {stage === 'pin' && !recoveryOpen && (
          <form className="lockscreen-wired-form" onSubmit={submitPassword}>
            <label htmlFor="wired-access-code">{t('lockscreen.wired.inputCode')}</label>
            <div className="lockscreen-wired-command">
              <span aria-hidden="true">&gt;</span>
              <input
                id="wired-access-code"
                ref={passwordRef}
                {...secretFieldProps}
                aria-label={kind === 'passphrase' ? t('lock4.passphrase.label') : t('lockscreen.aria.accessCode')}
                aria-invalid={error || tooShort || undefined}
                aria-describedby="lockscreen-wired-status"
              />
              <button type="submit" disabled={unlocking || waiting}>
                {t('lockscreen.wired.auth')}
              </button>
            </div>
            <p id="lockscreen-wired-status" className="lockscreen-wired-status" role="status">
              {retryText ??
                (tooShort
                  ? t('lock4.tooShort')
                  : error
                    ? t('lockscreen.wired.denied')
                    : t('lockscreen.wired.clearance'))}
            </p>
          </form>
          )}
          {stage === 'pin' && studyExtras}
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
        ref={rootRef}
        tabIndex={-1}
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
        {clockSr}
        <div className="lockscreen-aero-center">
          <div className={`lockscreen-aero-tile${shake ? ' is-shake' : ''}${error ? ' is-error' : ''}`}>
            <div className="lockscreen-aero-frame" aria-hidden="true">
              <span className="lockscreen-aero-picture" />
            </div>
            <div className="lockscreen-aero-name">{t('lockscreen.user')}</div>
            {challenge}
            {stage === 'pin' && !recoveryOpen && (
            <>
            <form className="lockscreen-aero-form" onSubmit={submitPassword}>
              <input
                ref={passwordRef}
                className="lockscreen-aero-pass"
                {...secretFieldProps}
                placeholder={kind === 'passphrase' ? t('lock4.passphrase.label') : t('lockscreen.aria.password')}
                aria-label={kind === 'passphrase' ? t('lock4.passphrase.label') : t('lockscreen.aria.password')}
                aria-invalid={showIncorrect || tooShort || undefined}
                aria-describedby="lockscreen-aero-status"
              />
              <button type="submit" className="lockscreen-aero-go" disabled={unlocking || waiting} aria-label={t('lockscreen.aria.signIn')}>
                {goArrow}
              </button>
            </form>
            <p id="lockscreen-aero-status" className="lockscreen-aero-status" role="status" aria-live="polite">
              {retryText ?? (tooShort ? t('lock4.tooShort') : showIncorrect ? t('lockscreen.xp.incorrect') : '')}
            </p>
            </>
            )}
            {stage === 'pin' && studyExtras}
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
          disabled={unlocking || waiting}
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
        ref={rootRef}
        tabIndex={-1}
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
          {clockSr}
          {challenge}
          {stage === 'pin' &&
            !recoveryOpen &&
            pinEntry('lockscreen', 'lockscreen-widget-prompt', error ? t('lockscreen.widget.wrong') : enterPrompt(t('lockscreen.widget.enter')))}
          {stage === 'pin' && studyExtras}
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
      ref={rootRef}
      tabIndex={-1}
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
        {clockSr}
        {challenge}
        {stage === 'pin' &&
          !recoveryOpen &&
          pinEntry('lockscreen-win11', 'lockscreen-win11-prompt', error ? t('lockscreen.win11.incorrect') : enterPrompt(t('lockscreen.win11.enter')))}
        {stage === 'pin' && studyExtras}
      </div>
    </div>
  );
}
