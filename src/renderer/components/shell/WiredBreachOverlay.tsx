import { useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { getSummary } from '../../stats';
import { knowledgeCounts } from '../../knownWords';
import {
  resolveWiredExit,
  subscribeWiredArchiveLifecycle,
  getWiredArchiveLifecycleState,
  loadWiredRestoreTheme,
} from '../../wiredArchiveLifecycle';
import { getTheme } from '../../theme/engine';
import { AERO_THEME_ID } from '../../theme/frutiger-aero';

/**
 * The exit sequence.
 *
 * Every other surface in WIRED addresses the *character* — an operator at a
 * 1998 terminal. This one addresses the person holding the mouse, and it does
 * it by reading their real study data back at them. That is the whole trick:
 * a glitch effect alone is just decoration, but a machine that knows how many
 * days you have actually shown up stops being set dressing.
 *
 * It blocks. The archive does not let you leave without answering.
 */

/** Corruption glyphs — the display losing its grip on the character set. */
const NOISE = '█▓▒░╱╲┃━╋◢◣◤◥▚▞';

function corrupt(text: string, intensity: number, seed: number): string {
  if (intensity <= 0) return text;
  return [...text]
    .map((ch, i) => {
      if (ch === ' ') return ch;
      // Deterministic per (seed, index) so a re-render mid-frame is stable.
      const n = (seed * 31 + i * 17) % 100;
      return n < intensity * 100 ? NOISE[(seed + i) % NOISE.length] : ch;
    })
    .join('');
}

export default function WiredBreachOverlay() {
  const { t } = useT();
  const [phase, setPhase] = useState(() => getWiredArchiveLifecycleState().phase);
  const [step, setStep] = useState(0);
  const [seed, setSeed] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeWiredArchiveLifecycle((s) => setPhase(s.phase)), []);

  const active = phase === 'breach';

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );

  /**
   * Real numbers, read once when the breach opens. These are the fourth wall:
   * the archive cites the user's own history, not the fiction's.
   */
  const facts = useMemo(() => {
    if (!active) return null;
    try {
      const s = getSummary();
      const k = knowledgeCounts();
      return {
        days: s.daysActive,
        streak: s.streak,
        words: (k[1] ?? 0) + (k[2] ?? 0) + (k[3] ?? 0),
        chars: s.totalChars,
      };
    } catch {
      return { days: 0, streak: 0, words: 0, chars: 0 };
    }
  }, [active]);

  // Staged reveal: corruption → recognition → the question.
  useEffect(() => {
    if (!active) {
      setStep(0);
      return undefined;
    }
    if (reducedMotion) {
      setStep(3);
      return undefined;
    }
    const timers = [
      window.setTimeout(() => setStep(1), 700),
      window.setTimeout(() => setStep(2), 1900),
      window.setTimeout(() => setStep(3), 3100),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [active, reducedMotion]);

  // Decay the corruption as the machine steadies itself to speak.
  useEffect(() => {
    if (!active || reducedMotion) return undefined;
    const id = window.setInterval(() => setSeed((n) => n + 1), 90);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  // Move focus into the dialog so the choice is reachable by keyboard, and
  // trap Escape — declining to answer is itself one of the options.
  useEffect(() => {
    if (!active || step < 3) return undefined;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveWiredExit('stay');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, step]);

  /**
   * The theme to offer restoring, unless that is Aero — which is already its
   * own button below. Two options that do the same thing is worse than two
   * options.
   */
  const restore = useMemo(() => {
    if (!active) return null;
    const id = loadWiredRestoreTheme();
    if (id === AERO_THEME_ID) return null;
    return { id, label: getTheme(id)?.label ?? id };
  }, [active]);

  if (!active || !facts) return null;

  // Corruption is heaviest at the breach and clears as it starts making sense.
  const intensity = reducedMotion ? 0 : step === 0 ? 0.55 : step === 1 ? 0.22 : step === 2 ? 0.06 : 0;
  const line = (text: string) => corrupt(text, intensity, seed);

  return (
    <div className="wired-breach" role="presentation">
      <div className="wired-breach-scan" aria-hidden="true" />
      <div className="wired-breach-tear" aria-hidden="true" />

      <div
        className="wired-breach-inner"
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-label={t('wired.breach.title')}
      >
        <p className="wired-breach-kicker">{line(t('wired.breach.kicker'))}</p>

        {step >= 1 && <h2 className="wired-breach-title">{line(t('wired.breach.title'))}</h2>}

        {step >= 2 && (
          <div className="wired-breach-facts">
            {/* The turn: it stops narrating and starts citing. */}
            <p>{line(t('wired.breach.seen', { days: facts.days }))}</p>
            <p>{line(t('wired.breach.held', { words: facts.words }))}</p>
            <p className="wired-breach-address">{line(t('wired.breach.address'))}</p>
          </div>
        )}

        {step >= 3 && (
          <div className="wired-breach-prompt">
            <p className="wired-breach-question">{t('wired.breach.question')}</p>
            <div className="wired-breach-actions">
              <button type="button" onClick={() => resolveWiredExit('stay')} className="is-stay">
                <b>{t('wired.breach.stay')}</b>
                <span>{t('wired.breach.stayHint')}</span>
              </button>
              {restore && (
                <button type="button" onClick={() => resolveWiredExit('restore')}>
                  <b>{t('wired.breach.restore')}</b>
                  <span>{t('wired.breach.restoreHint', { theme: restore.label })}</span>
                </button>
              )}
              <button type="button" onClick={() => resolveWiredExit('aero')}>
                <b>{t('wired.breach.aero')}</b>
                <span>{t('wired.breach.aeroHint')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
