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
import { endOfStudyDayKey, startOfStudyDayKey } from '../../../shared/studyDay';
import { useT } from '../../i18n';
import { grammarDueOnDay, grammarDueSummary, openGrammarReview, useGrammarDue } from '../../grammarDue';
import { loadGrammarSrs, onGrammarSrsChanged } from '../../grammarSrs';
import './grammarReview2.css';

/**
 * Grammar points due on one STUDY day (`YYYY-MM-DD`), for the Calendar day view's
 * "Due" section: today counts everything owed today, a later day what first falls
 * due on it. Renders nothing for a day with none. The Calendar passes its cell's
 * study day (`calendarCell`), so between midnight and the day-start hour today's
 * cell asks for the study day still running, as Review does.
 *
 * Today's number is the Calendar's convention (the cards' line counts the same
 * way: overdue plus what falls due later today), so it can be larger than what
 * the Review tab offers right now, which is only `dueAt <= now`. It is labelled
 * "due today", and when the two differ the line also says how many are ready
 * now, which is what the Review button opens.
 */
export function GrammarDueDayLine({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const { t } = useT();
  const [state, setState] = useState(() => loadGrammarSrs());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => onGrammarSrsChanged(() => {
    setState(loadGrammarSrs());
    setNow(Date.now());
  }), []);
  // Relearning steps are minutes: what is ready now changes while the day view is open.
  useEffect(() => {
    if (!isToday) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [isToday]);
  // The study day's bounds (4 am to 4 am by default), as the cards' due line and `due:` use.
  const start = startOfStudyDayKey(dateKey);
  const end = endOfStudyDayKey(dateKey);
  const count = grammarDueOnDay(state, start, end, isToday);
  if (count === 0) return null;
  if (!isToday) return <p className="gram-due-day">{t('gram2.due.count', { count })}</p>;
  const readyNow = grammarDueSummary(state, now).due;
  return (
    <p className="gram-due-day">
      {t('gram2.due.today', { count })}
      {readyNow !== count && <> · {t('gram2.due.readyNow', { count: readyNow })}</>}
      {readyNow > 0 && (
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
