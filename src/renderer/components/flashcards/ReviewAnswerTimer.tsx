/**
 * The answer timer on a review card: seconds since the card was shown, the
 * same span the review log records (capped at a minute there, as in Anki).
 * It ticks on its own so the rest of the review surface does not re-render
 * every second.
 */
import { useEffect, useState } from 'react';
import { REVIEW_ANSWER_CAP_MS } from '../../../shared/reviewLog';
import { useT } from '../../i18n';

export function formatAnswerTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ReviewAnswerTimer({ startedAt }: { startedAt: number }) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const elapsed = Math.max(0, now - startedAt);
  const capped = elapsed >= REVIEW_ANSWER_CAP_MS;
  return (
    <span
      className={`flash-answer-timer${capped ? ' is-capped' : ''}`}
      role="timer"
      aria-label={t('srs2.timer.aria', { seconds: Math.floor(elapsed / 1000) })}
    >
      {formatAnswerTime(elapsed)}
    </span>
  );
}
