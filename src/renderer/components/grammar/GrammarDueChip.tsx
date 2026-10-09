/**
 * "N grammar points due — Review grammar", for the surfaces that show a review
 * queue (Flashcards, the Calendar's day view, Statistics). Reads the schedule
 * through `grammarDue.ts`, so it costs no grammar data.
 *
 * Silent until grammar review is in use at all: a learner who never enrolled a
 * point is not told about a queue they have no reason to know exists. Once points
 * are scheduled, a day with nothing due says when the next one is.
 */
import { useEffect, useState } from 'react';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';
import { grammarDueOnDay, openGrammarReview, useGrammarDue } from '../../grammarDue';
import { loadGrammarSrs, onGrammarSrsChanged } from '../../grammarSrs';
import './grammarReview2.css';

/**
 * Grammar points due on one Calendar day (`YYYY-MM-DD`), for the day view's "Due"
 * section: today counts everything owed today, a later day what first falls due
 * on it. Renders nothing for a day with none.
 */
export function GrammarDueDayLine({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const { t } = useT();
  const [state, setState] = useState(() => loadGrammarSrs());
  useEffect(() => onGrammarSrsChanged(() => setState(loadGrammarSrs())), []);
  const [y, m, d] = dateKey.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1).getTime();
  const end = new Date(y, (m || 1) - 1, (d || 1) + 1).getTime();
  const count = grammarDueOnDay(state, start, end, isToday);
  if (count === 0) return null;
  return (
    <p className="gram-due-day">
      {t('gram2.due.count', { count })}
      {isToday && (
        <>
          {' '}
          <button type="button" className="btn small" onClick={openGrammarReview}>
            {t('gram2.due.review')}
          </button>
        </>
      )}
    </p>
  );
}

interface Props {
  className?: string;
}

export default function GrammarDueChip({ className }: Props) {
  const { t, lang } = useT();
  const { due, scheduled, nextAt } = useGrammarDue();
  if (scheduled === 0) return null;
  const locale = LANG_TAGS[lang] ?? 'en';
  return (
    <div className={['gram-due-chip', className].filter(Boolean).join(' ')} role="status">
      {due > 0 ? (
        <>
          <span className="gram-due-chip-count">{t('gram2.due.count', { count: due })}</span>
          <button type="button" className="btn small primary gram-due-chip-go" onClick={openGrammarReview}>
            {t('gram2.due.review')}
          </button>
        </>
      ) : (
        <span className="muted gram-due-chip-next">
          {nextAt !== null
            ? t('gram2.due.nextAt', {
                when: new Date(nextAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }),
              })
            : t('gram2.due.none')}
        </span>
      )}
    </div>
  );
}
