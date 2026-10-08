/**
 * One card inside an Aero mechanic: the Memory Defragmenter's review step and
 * the Vocabulary Update's install step.
 *
 * Grading goes through the host's `onGrade`, which calls `reviewDeckCard` —
 * the one review path every surface uses — so the schedule, the review log,
 * the known-word inference and the day's stats all move exactly as they do in
 * the Flashcards app. The interval under each button is `previewSchedule`, the
 * same preview the Flashcards app shows.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeckFlashcard } from '../../../flashcardDeck';
import type { LocalSrsRating } from '../../../../shared/localSrs';
import { previewSchedule } from '../../../../shared/flashcardScheduling';
import { loadSchedulingConfig } from '../../../flashcardScheduling';
import { srsIntervalLabel } from '../../../srsIntervalLabel';
import { useT } from '../../../i18n';

const RATINGS: LocalSrsRating[] = ['again', 'hard', 'good', 'easy'];
const LEARN_RATINGS: LocalSrsRating[] = ['again', 'good', 'easy'];

export interface AeroMechCardProps {
  card: DeckFlashcard;
  /** `learn` shows the whole card at once (it has never been seen). */
  mode: 'review' | 'learn';
  onGrade: (rating: LocalSrsRating) => void;
  /** Learn only: leave the card for another day. */
  onSkip?: () => void;
}

export default function AeroMechCard({ card, mode, onGrade, onSkip }: AeroMechCardProps) {
  const { t, lang } = useT();
  const [revealed, setRevealed] = useState(mode === 'learn');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRevealed(mode === 'learn');
    rootRef.current?.focus({ preventScroll: true });
  }, [card.id, mode]);

  const ratings = mode === 'learn' ? LEARN_RATINGS : RATINGS;
  const preview = useMemo(() => previewSchedule(card.srs, loadSchedulingConfig()), [card.id, card.srs]);
  // `lang`, not `t`: the labels only change when the language does.
  const intervals = useMemo(() => {
    const out = {} as Record<LocalSrsRating, string>;
    for (const r of RATINGS) out[r] = srsIntervalLabel(preview[r], t);
    return out;
  }, [preview, lang]);

  const front = card.front?.trim() || card.word;
  const meaning = card.back?.trim() || card.meaning;

  return (
    <div
      ref={rootRef}
      className={`aero-mech-card${revealed ? ' is-revealed' : ''}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          setRevealed(true);
          return;
        }
        if (!revealed) return;
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= ratings.length) {
          e.preventDefault();
          onGrade(ratings[n - 1]);
        }
      }}
    >
      <div className="aero-mech-card-face">
        <div className="aero-mech-card-word" lang="ja">{front}</div>
        {revealed && (
          <div className="aero-mech-card-back">
            {card.reading && card.reading !== front && (
              <div className="aero-mech-card-reading" lang="ja">{card.reading}</div>
            )}
            {meaning && <div className="aero-mech-card-meaning">{meaning}</div>}
            {card.sentence && card.sentence !== front && (
              <div className="aero-mech-card-sentence" lang="ja">{card.sentence}</div>
            )}
          </div>
        )}
      </div>
      <div className="aero-mech-card-actions">
        {!revealed ? (
          <button type="button" className="aero-mech-btn is-default" onClick={() => setRevealed(true)}>
            {t('aeroMech.card.show')}
          </button>
        ) : (
          <>
            {ratings.map((rating, i) => (
              <button
                key={rating}
                type="button"
                className={`aero-mech-btn aero-mech-grade is-${rating}`}
                onClick={() => onGrade(rating)}
                title={t('aeroMech.card.key', { n: i + 1 })}
              >
                <span>{t(`flash.rating.${rating}`)}</span>
                <small>{intervals[rating]}</small>
              </button>
            ))}
            {onSkip && (
              <button type="button" className="aero-mech-btn aero-mech-skip" onClick={onSkip}>
                {t('aeroMech.update.skip')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
