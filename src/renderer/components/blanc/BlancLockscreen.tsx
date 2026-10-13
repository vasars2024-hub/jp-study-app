import { useEffect, useRef, useState } from 'react';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { getUiLang, useT } from '../../i18n';
import {
  isValidPin,
  loadLockscreen,
  markLockscreenUnlocked,
  readLockscreenSecretKind,
  verifyLockscreenPinDetailed,
} from '../../lockscreenSettings';
import { LOCK_PASSPHRASE_MAX_CHARS, LOCK_PIN_MAX_DIGITS, normalizeLockSecretKind, type LockSecretKind } from '../../../shared/lockSecret';
import { useLockBlockedToasts } from '../../lockBlockedNotice';
import { trapTab } from '../ui/focusTrap';
import { showOsToast } from '../ToastHost';
import { LockscreenChallenge, LockscreenRecovery, LockscreenStudyPanel } from '../LockscreenStudy';

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
 * lock4: only a 4-digit PIN submits itself; a longer one or a passphrase uses Enter.
 */
export function BlancLockscreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useT();
  useLockBlockedToasts();
  const [digits, setDigitsState] = useState('');
  /**
   * The digits as typed so far, updated synchronously. The keydown path reads and
   * writes this instead of computing the next value inside a state updater:
   * StrictMode runs updaters twice, so a submit scheduled from one fired twice and
   * one wrong PIN cost two of main's attempts (bug 37).
   */
  const digitsRef = useRef('');
  const setDigits = (next: string): void => {
    digitsRef.current = next;
    setDigitsState(next);
  };
  /** A PIN is with main: a second submit waits for its answer. */
  const verifyingRef = useRef(false);
  const [error, setError] = useState('');
  const now = useMinuteClock();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  // lock3: the same study step and recovery as Study OS's lock screen.
  const [cfg] = useState(() => loadLockscreen());
  const hasPin = Boolean(cfg.pinHash);
  const [kind, setKind] = useState<LockSecretKind>(() => normalizeLockSecretKind(cfg.secretKind));
  const kindRef = useRef(kind);
  kindRef.current = kind;
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
  const maxDigitsRef = useRef(maxDigits);
  maxDigitsRef.current = maxDigits;
  const [stage, setStage] = useState<'challenge' | 'pin'>(() => (cfg.answerToUnlock ? 'challenge' : 'pin'));
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const pinActiveRef = useRef(stage === 'pin' && !recoveryOpen);
  pinActiveRef.current = stage === 'pin' && !recoveryOpen;
  const finishChallenge = (): void => {
    if (hasPin) {
      setStage('pin');
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    // A stale mirror never unlocks: main decides whether a PIN is due after all.
    void Promise.resolve(window.api?.lockscreenIsLocked?.())
      .catch(() => false)
      .then((mainLocked) => {
        if (mainLocked) {
          setStage('pin');
          return;
        }
        markLockscreenUnlocked();
        onUnlocked();
      });
  };
  const onRecovered = (): void => {
    showOsToast(t('lock3.recovery.done'), 'warn');
    markLockscreenUnlocked();
    onUnlocked();
  };

  const submit = (pin: string): void => {
    if (kind === 'pin4') {
      if (pin.length !== 4) return;
    } else if (!isValidPin(pin)) {
      // Too short: never spends one of main's attempts.
      if (pin.length > 0) setError(t('lock4.tooShort'));
      return;
    }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    void Promise.resolve(verifyLockscreenPinDetailed(pin))
      .then((res) => {
        if (!res.ok) {
          setDigits('');
          // Main's backoff holds entry: say how long, or the right PIN reads as wrong too.
          setError(
            res.retryAfterMs && res.retryAfterMs > 0
              ? t('lockscreen.retryIn', { count: Math.max(1, Math.ceil(res.retryAfterMs / 1000)) })
              : t('blanc.tb.wrongPin'),
          );
          return;
        }
        onUnlocked();
      })
      .finally(() => {
        verifyingRef.current = false;
      });
  };
  // The keydown listener registers once; it reaches the latest `submit` here.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // a11y: the box is `aria-modal`, and nothing behind a lock screen may take
      // focus. The shared trap keeps Tab / Shift+Tab inside it (the PIN field is
      // its only control, so Tab stays there).
      if (event.key === 'Tab') {
        trapTab(event, boxRef.current);
        return;
      }
      if (!pinActiveRef.current) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target === inputRef.current || target.closest('input, textarea, select, [contenteditable="true"]'))
      ) {
        return;
      }
      // A passphrase is typed into its own field only.
      if (kindRef.current === 'passphrase') return;
      if (event.key === 'Enter' && kindRef.current === 'pin' && !(target instanceof HTMLButtonElement)) {
        event.preventDefault();
        submitRef.current(digitsRef.current);
        return;
      }
      if (/^\d$/.test(event.key)) {
        // Outside any state updater (see digitsRef): the submit is scheduled once.
        const prev = digitsRef.current;
        if (prev.length < maxDigitsRef.current) {
          const next = prev + event.key;
          digitsRef.current = next;
          setDigitsState(next);
          if (kindRef.current === 'pin4' && next.length === 4) window.setTimeout(() => submitRef.current(next), 40);
        }
        setError('');
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        const next = digitsRef.current.slice(0, -1);
        digitsRef.current = next;
        setDigitsState(next);
      }
    };
    // Focus that lands outside the lock (a toast's button, a click on the window
    // chrome) is brought back to the PIN field.
    const onFocusIn = (event: FocusEvent): void => {
      const box = boxRef.current;
      const target = event.target;
      if (!box || !(target instanceof Node) || box.contains(target)) return;
      (inputRef.current ?? box).focus();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  return (
    <div className="blanc-lock">
      <section
        ref={boxRef}
        className="blanc-lock-box"
        role="dialog"
        aria-modal="true"
        aria-label={t('blanc.tb.lockscreen')}
        tabIndex={-1}
      >
        <time className="blanc-lock-time">
          {now.toLocaleTimeString(LANG_TAGS[getUiLang()], { hour: '2-digit', minute: '2-digit' })}
        </time>
        <div className="blanc-lock-date">
          {now.toLocaleDateString(LANG_TAGS[getUiLang()], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {stage === 'challenge' && <LockscreenChallenge variant="blanc" onPassed={finishChallenge} />}
        {stage === 'pin' && !recoveryOpen && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(digits);
            }}
          >
            <label>
              {kind === 'passphrase' ? t('lock4.passphrase.label') : t('blanc.tb.pinLabel')}
              <input
                ref={inputRef}
                autoFocus
                type="password"
                className={kind === 'passphrase' ? 'is-passphrase' : undefined}
                inputMode={kind === 'passphrase' ? 'text' : 'numeric'}
                maxLength={kind === 'passphrase' ? LOCK_PASSPHRASE_MAX_CHARS : maxDigits}
                autoComplete="off"
                spellCheck={false}
                value={digits}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'blanc-lock-error' : undefined}
                onChange={(event) => {
                  const raw = event.target.value;
                  const next = kind === 'passphrase' ? raw : raw.replace(/\D/g, '').slice(0, maxDigits);
                  setDigits(next);
                  setError('');
                  if (kind === 'pin4' && next.length === 4) submit(next);
                }}
              />
            </label>
            {kind !== 'passphrase' && (
              <div className="blanc-lock-dots" aria-hidden>
                {Array.from({ length: kind === 'pin4' ? 4 : Math.max(4, digits.length) }, (_, i) => (
                  <span key={i} className={i < digits.length ? 'filled' : ''} />
                ))}
              </div>
            )}
            {kind !== 'pin4' && (
              <button type="submit" className="blanc-lock-submit">
                {t('lock4.blanc.unlock')}
              </button>
            )}
            {error && <p id="blanc-lock-error" className="blanc-error" role="alert">{error}</p>}
          </form>
        )}
        {stage === 'pin' && <LockscreenStudyPanel mode={cfg.study} variant="blanc" />}
        {stage === 'pin' && hasPin && (
          <LockscreenRecovery variant="blanc" onRecovered={onRecovered} onOpenChange={setRecoveryOpen} />
        )}
      </section>
    </div>
  );
}
