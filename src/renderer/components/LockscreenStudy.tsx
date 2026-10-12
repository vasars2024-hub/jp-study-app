/**
 * The study half of the lock screen (lock3), shared by every skin — Study OS,
 * Aero, WIRED, the floating widget and Blanc. Each part takes a `variant` that
 * only picks class names; the skins style them in their own sheets.
 *
 *  - `LockscreenStudyPanel`: how many cards are due, and in `card` mode the
 *    card of the day with its answer behind a button.
 *  - `LockscreenChallenge`: "answer a card to unlock" — multiple choice from the
 *    deck (keys 1-4), or a self-check when the deck is too small to offer
 *    choices. Passing it only opens the PIN step; it never lifts main's lock.
 *  - `LockscreenRecovery`: "Forgot your PIN?" — the recovery code, which main
 *    checks against the same backoff as the PIN.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useT } from '../i18n';
import { getStudyLang } from '../studyEnvironment';
import { studyLangTag } from '../../shared/studyLang';
import { recoverLockscreen, type LockscreenStudyMode } from '../lockscreenSettings';
import {
  buildChallenge,
  loadLockStudy,
  nextChallengeCard,
  type LockChallenge,
  type LockStudySnapshot,
} from '../lockscreenStudy';
import './lockscreenStudy.css';

export type LockscreenVariant = 'win11' | 'aero' | 'wired' | 'widget' | 'blanc';

function useLockStudy(enabled = true): LockStudySnapshot | null {
  const [snap, setSnap] = useState<LockStudySnapshot | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void loadLockStudy().then((s) => {
      if (alive) setSnap(s);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return snap;
}

function contentLang(): string | undefined {
  try {
    return studyLangTag(getStudyLang());
  } catch {
    return undefined;
  }
}

export function LockscreenStudyPanel({ mode, variant }: { mode: LockscreenStudyMode; variant: LockscreenVariant }) {
  const { t } = useT();
  const active = mode === 'count' || mode === 'card';
  const snap = useLockStudy(active);
  const [reveal, setReveal] = useState(false);
  if (!active || !snap) return null;
  const card = mode === 'card' ? snap.card : null;
  const lang = contentLang();
  return (
    <section className={`lockscreen-study lockscreen-study--${variant}`} aria-label={t('lock3.study.label')}>
      <p className="lockscreen-study-due">
        {snap.due > 0 ? t('lock3.study.due', { count: snap.due }) : t('lock3.study.noneDue')}
      </p>
      {card && (
        <div className="lockscreen-study-card">
          <span className="lockscreen-study-kicker">{t('lock3.study.cardOfDay')}</span>
          <span className="lockscreen-study-front" lang={lang}>{card.front}</span>
          {reveal && (
            <span className="lockscreen-study-back">
              {card.reading && card.reading !== card.front && (
                <span className="lockscreen-study-reading" lang={lang}>{card.reading}</span>
              )}
              <span>{card.back}</span>
            </span>
          )}
          <button
            type="button"
            className="lockscreen-study-reveal"
            aria-expanded={reveal}
            onClick={() => setReveal((on) => !on)}
          >
            {reveal ? t('lock3.study.hideAnswer') : t('lock3.study.showAnswer')}
          </button>
        </div>
      )}
    </section>
  );
}

export function LockscreenChallenge({ variant, onPassed }: { variant: LockscreenVariant; onPassed: () => void }) {
  const { t } = useT();
  const snap = useLockStudy();
  const [challenge, setChallenge] = useState<LockChallenge | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  const deal = useCallback(
    (previousId: string | null) => {
      if (!snap) return;
      const card = nextChallengeCard(snap, previousId);
      setChallenge(card ? buildChallenge(card, snap.pool) : null);
      setPicked(null);
      setRevealed(false);
    },
    [snap],
  );
  useEffect(() => deal(null), [deal]);
  useEffect(() => {
    window.setTimeout(() => firstRef.current?.focus(), 0);
  }, [challenge]);

  const choose = useCallback(
    (index: number) => {
      if (!challenge || picked !== null) return;
      setPicked(index);
      if (index === challenge.answer) window.setTimeout(onPassed, 450);
    },
    [challenge, picked, onPassed],
  );

  // Keys 1-4 pick a choice (the PIN pad's digit capture is off during this step).
  useEffect(() => {
    if (!challenge || !challenge.options.length) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (!/^[1-4]$/.test(e.key) || e.ctrlKey || e.altKey || e.metaKey) return;
      const i = Number(e.key) - 1;
      if (i >= challenge.options.length) return;
      e.preventDefault();
      e.stopPropagation();
      choose(i);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [challenge, choose]);

  if (!snap) return null;
  const lang = contentLang();
  const cls = `lockscreen-challenge lockscreen-challenge--${variant}`;

  if (!challenge) {
    return (
      <section className={cls} aria-labelledby={headingId}>
        <h2 id={headingId} className="lockscreen-challenge-title">{t('lock3.challenge.title')}</h2>
        <p className="lockscreen-challenge-note">{t('lock3.challenge.empty')}</p>
        <button ref={firstRef} type="button" className="lockscreen-challenge-btn is-primary" onClick={onPassed}>
          {t('lock3.challenge.continue')}
        </button>
      </section>
    );
  }

  const wrong = picked !== null && picked !== challenge.answer;
  const right = picked !== null && picked === challenge.answer;
  return (
    <section className={cls} aria-labelledby={headingId}>
      <h2 id={headingId} className="lockscreen-challenge-title">{t('lock3.challenge.title')}</h2>
      <p className="lockscreen-challenge-front" lang={lang}>{challenge.card.front}</p>
      {challenge.options.length > 0 ? (
        <>
          <p className="lockscreen-challenge-note">{t('lock3.challenge.prompt')}</p>
          <div className="lockscreen-challenge-options" role="group" aria-label={t('lock3.challenge.optionsLabel')}>
            {challenge.options.map((option, i) => (
              <button
                key={`${i}-${option}`}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                className={`lockscreen-challenge-option${picked === i ? (i === challenge.answer ? ' is-right' : ' is-wrong') : ''}${wrong && i === challenge.answer ? ' is-answer' : ''}`}
                disabled={picked !== null}
                onClick={() => choose(i)}
              >
                <kbd aria-hidden="true">{i + 1}</kbd>
                <span>{option}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="lockscreen-challenge-note">{t('lock3.challenge.selfCheck')}</p>
          {revealed ? (
            <>
              <p className="lockscreen-challenge-back">
                {challenge.card.reading && challenge.card.reading !== challenge.card.front && (
                  <span lang={lang}>{challenge.card.reading} · </span>
                )}
                {challenge.card.back}
              </p>
              <button ref={firstRef} type="button" className="lockscreen-challenge-btn is-primary" onClick={onPassed}>
                {t('lock3.challenge.remembered')}
              </button>
              <button type="button" className="lockscreen-challenge-btn" onClick={() => deal(challenge.card.id)}>
                {t('lock3.challenge.next')}
              </button>
            </>
          ) : (
            <button ref={firstRef} type="button" className="lockscreen-challenge-btn is-primary" onClick={() => setRevealed(true)}>
              {t('lock3.study.showAnswer')}
            </button>
          )}
        </>
      )}
      <p className="lockscreen-challenge-status" role="status" aria-live="polite">
        {right ? t('lock3.challenge.right') : wrong ? t('lock3.challenge.wrong', { answer: challenge.card.back }) : ''}
      </p>
      {wrong && (
        <button type="button" className="lockscreen-challenge-btn" onClick={() => deal(challenge.card.id)}>
          {t('lock3.challenge.next')}
        </button>
      )}
    </section>
  );
}

export function LockscreenRecovery({
  variant,
  onRecovered,
  onOpenChange,
}: {
  variant: LockscreenVariant;
  onRecovered: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useT();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    let alive = true;
    void Promise.resolve(window.api?.lockscreenStatus?.())
      .then((s) => {
        if (alive) setAvailable(Boolean(s?.hasRecovery));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const toggle = (next: boolean) => {
    setOpen(next);
    setMessage('');
    onOpenChange?.(next);
    if (next) window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  if (!available) return null;
  const cls = `lockscreen-recovery lockscreen-recovery--${variant}`;
  if (!open) {
    return (
      <div className={cls}>
        <button type="button" className="lockscreen-recovery-link" onClick={() => toggle(true)}>
          {t('lock3.recovery.link')}
        </button>
      </div>
    );
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    void recoverLockscreen(code).then((res) => {
      setBusy(false);
      if (res.ok) {
        setCode('');
        onRecovered();
        return;
      }
      setMessage(
        res.retryAfterMs
          ? t('lockscreen.retryIn', { count: Math.max(1, Math.ceil(res.retryAfterMs / 1000)) })
          : t('lock3.recovery.wrong'),
      );
    });
  };
  return (
    <form className={cls} onSubmit={submit} onKeyDownCapture={(e) => e.stopPropagation()}>
      <p className="lockscreen-recovery-hint">{t('lock3.recovery.hint')}</p>
      <label htmlFor={inputId}>{t('lock3.recovery.label')}</label>
      <input
        id={inputId}
        ref={inputRef}
        className="lockscreen-recovery-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        maxLength={24}
        value={code}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        aria-invalid={message ? true : undefined}
        onChange={(e) => {
          setCode(e.target.value);
          setMessage('');
        }}
      />
      <div className="lockscreen-recovery-actions">
        <button type="submit" disabled={busy || !code.trim()}>
          {t('lock3.recovery.submit')}
        </button>
        <button type="button" onClick={() => toggle(false)}>
          {t('lock3.recovery.cancel')}
        </button>
      </div>
      <p className="lockscreen-recovery-status" role="status" aria-live="polite">{message}</p>
    </form>
  );
}
