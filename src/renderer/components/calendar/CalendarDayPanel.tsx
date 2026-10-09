/**
 * The Calendar's day view: what was studied on the selected day, and a way back to each part
 * of it.
 *
 * The month grid could say "12 min · 30 rev" on a day and nothing else. This panel follows the
 * selected day (a click, or the arrow keys in the grid) and lists what that day held — reviews
 * with how many were remembered and how many cards were new, time by activity, the books read
 * and the videos watched, the lines mined from them, the games played — and every row opens
 * its source: the deck narrowed to that day's cards, the book in the reader, the line in the
 * player, the game in the Arena. A coming day shows what is due, with "Study ahead" and a
 * reminder on the day; any day exports as Markdown, alone or with its month.
 *
 * Study content (book and show titles, mined lines) is shown as written, never translated.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import {
  formatCalendarDaySummary,
  formatCalendarMonthSummary,
  monthDateKeys,
  type CalendarDayDetail,
  type DayScene,
} from '../../../shared/calendarDayDetail';
import { formatSceneTime } from '../../sceneRoundTrip';
import { loadReviewLog } from '../../reviewLog';
import { onCalendarChanged } from '../../calendar';
import { useStudyLanguage } from '../../useStudyLanguage';
import { arenaGameTitleKey } from '../../games/gameTitles';
import type { GameId } from '../../games/types';
import {
  addDayStudyReminder,
  clearDailyStudyReminder,
  copySummaryText,
  currentDailyStudyReminder,
  monthDayDetails,
  openBookFromCalendar,
  openDeckForDay,
  openGameFromCalendar,
  openTodaysReviews,
  playSceneFromCalendar,
  resumeShowFromCalendar,
  saveMarkdownFile,
  setDailyStudyReminder,
  showFilePath,
  studyAheadUntil,
  useCalendarDayDetail,
} from './calendarDayData';
import { GrammarDueDayLine } from '../grammar/GrammarDueChip';
import './calendarDay.css';

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * The daily study reminder this panel created, kept current as the calendar changes. The
 * refresh is for this panel's own toggle: the calendar's change event fires inside `addEvent`,
 * before the new reminder's id is recorded.
 */
function useDailyReminder(): [ReturnType<typeof currentDailyStudyReminder>, () => void] {
  const [reminder, setReminder] = useState(currentDailyStudyReminder);
  const refresh = (): void => setReminder(currentDailyStudyReminder());
  useEffect(() => onCalendarChanged(refresh), []);
  return [reminder, refresh];
}

export function CalendarDayPanel({ dateKey }: { dateKey: string }) {
  const { t, lang } = useT();
  const { lang: studyLang, tag: studyTag } = useStudyLanguage();
  const detail = useCalendarDayDetail(dateKey);
  const [dailyReminder, refreshDailyReminder] = useDailyReminder();
  const [status, setStatus] = useState('');
  const [time, setTime] = useState('19:00');
  useEffect(() => setStatus(''), [dateKey]);

  const locale = LANG_TAGS[lang];
  const dateLabel = useMemo(
    () => dateFromKey(dateKey).toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    [dateKey, locale],
  );
  const history = detail.kind !== 'future';

  const exportDay = async (mode: 'copy' | 'save'): Promise<void> => {
    const text = `${formatCalendarDaySummary(detail, t, dateLabel)}\n`;
    if (mode === 'save') {
      saveMarkdownFile(`study-${dateKey}.md`, text);
      setStatus(t('cal2.export.saved'));
      return;
    }
    setStatus((await copySummaryText(text)) ? t('cal2.export.copied') : t('cal2.export.copyFailed'));
  };

  const exportMonth = async (): Promise<void> => {
    const day = dateFromKey(dateKey);
    const keys = monthDateKeys(day.getFullYear(), day.getMonth());
    const rows = await loadReviewLog().catch(() => []);
    const monthLabel = day.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const text = formatCalendarMonthSummary(
      monthDayDetails(keys, rows),
      t,
      monthLabel,
      (key) => dateFromKey(key).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }),
    );
    saveMarkdownFile(`study-${dateKey.slice(0, 7)}.md`, text);
    setStatus(t('cal2.export.saved'));
  };

  const remindOnDay = (): void => {
    addDayStudyReminder(dateKey, time, detail.due > 0 ? t('cal2.reminder.titleDue', { count: detail.due }) : t('cal2.reminder.title'));
    setStatus(t('cal2.reminder.added', { time }));
  };

  const toggleDaily = (): void => {
    if (dailyReminder) {
      clearDailyStudyReminder();
      refreshDailyReminder();
      setStatus(t('cal2.reminder.dailyOff'));
      return;
    }
    setDailyStudyReminder(detail.kind === 'past' ? toTodayKey() : dateKey, time, t('cal2.reminder.title'));
    refreshDailyReminder();
    setStatus(t('cal2.reminder.dailyOn', { time }));
  };

  return (
    <section className="cal-day-panel" aria-label={t('cal2.day.label', { date: dateLabel })}>
      <header className="cal-day-head">
        <h3>{dateLabel}</h3>
        {detail.streak === 'streak' && <span className="cal-day-badge is-streak">{t('cal2.day.inStreak')}</span>}
        {detail.streak === 'rest' && <span className="cal-day-badge is-rest">{t('cal2.day.restDay')}</span>}
      </header>

      {detail.empty && (
        <p className="muted cal-day-empty">
          {detail.kind === 'future' ? t('cal2.day.nothingDue') : t('cal2.day.nothing')}
        </p>
      )}

      {history && (detail.reviews.count > 0 || detail.addedCards > 0 || detail.practice.count > 0) && (
        <DaySection title={t('cal2.day.section.reviews')}>
          {detail.reviews.count > 0 && (
            <p>
              {t('cal2.day.reviewsLine', {
                count: detail.reviews.count,
                accuracy: Math.round((detail.reviews.accuracy ?? 0) * 100),
              })}
            </p>
          )}
          {detail.reviews.newCards > 0 && <p className="muted">{t('cal2.day.newCards', { count: detail.reviews.newCards })}</p>}
          {detail.practice.count > 0 && (
            <p className="muted">{t('cal2.day.practiceLine', { count: detail.practice.count, correct: detail.practice.correct })}</p>
          )}
          <div className="cal-day-actions">
            {detail.reviews.count > 0 && (
              <button type="button" className="btn small" onClick={() => openDeckForDay(dateKey, 'reviewed')}>
                {t('cal2.day.showReviewed')}
              </button>
            )}
            {detail.addedCards > 0 && (
              <button type="button" className="btn small" onClick={() => openDeckForDay(dateKey, 'added')}>
                {t('cal2.day.showAdded', { count: detail.addedCards })}
              </button>
            )}
          </div>
        </DaySection>
      )}

      {history && detail.minutes.total > 0 && <DayTime detail={detail} />}

      {history && (detail.books.length > 0 || detail.chars > 0) && (
        <DaySection title={t('cal2.day.section.reading')}>
          {detail.chars > 0 && <p className="muted">{t('cal2.day.chars', { count: detail.chars })}</p>}
          {detail.books.length > 0 && (
            <ul className="cal-day-list-rows">
              {detail.books.map((book) => (
                <li key={book.id}>
                  <span className="cal-day-row-text">
                    <b lang={studyTag}>{book.title}</b>
                    <small className="muted">{t('cal2.day.bookMeta', { minutes: book.minutes, chars: book.chars })}</small>
                  </span>
                  <button
                    type="button"
                    className="btn small"
                    aria-label={t('cal2.day.openBookNamed', { title: book.title })}
                    onClick={() => openBookFromCalendar(book.id)}
                  >
                    {t('cal2.day.openBook')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DaySection>
      )}

      {history && (detail.shows.length > 0 || detail.mined.count > 0 || detail.linesStudied > 0) && (
        <DaySection title={t('cal2.day.section.video')}>
          {detail.shows.length > 0 && (
            <ul className="cal-day-list-rows">
              {detail.shows.map((show) => (
                <li key={show.id}>
                  <span className="cal-day-row-text">
                    <b lang={studyTag}>{show.title}</b>
                    <small className="muted">{t('cal2.day.minutes.watching', { count: show.minutes })}</small>
                  </span>
                  {showFilePath(show.id) && (
                    <button
                      type="button"
                      className="btn small"
                      aria-label={t('cal2.day.resumeNamed', { title: show.title })}
                      onClick={() => resumeShowFromCalendar(show.id, setStatus)}
                    >
                      {t('cal2.day.resume')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {detail.mined.count > 0 && <p className="muted">{t('cal2.day.mined', { count: detail.mined.count })}</p>}
          {detail.linesStudied > 0 && <p className="muted">{t('cal2.day.linesStudied', { count: detail.linesStudied })}</p>}
          {detail.mined.scenes.length > 0 && (
            <ul className="cal-day-list-rows">
              {detail.mined.scenes.map((scene) => (
                <SceneRow key={scene.key} scene={scene} studyTag={studyTag} onNotify={setStatus} />
              ))}
            </ul>
          )}
        </DaySection>
      )}

      {history && (detail.games.answers > 0 || detail.games.sessions.length > 0) && (
        <DaySection title={t('cal2.day.section.games')}>
          {detail.games.answers > 0 && (
            <p>{t('cal2.day.gamesLine', { count: detail.games.answers, correct: detail.games.correct })}</p>
          )}
          {detail.games.sessions.length > 0 && (
            <ul className="cal-day-list-rows">
              {detail.games.sessions.map((session) => {
                const title = t(arenaGameTitleKey(session.gameId as GameId, studyLang));
                return (
                  <li key={session.id}>
                    <span className="cal-day-row-text">
                      <b>{title}</b>
                      <small className="muted">
                        {t('cal2.day.gameMeta', {
                          score: session.score,
                          accuracy: Math.round(session.accuracy * 100),
                          missed: session.mistakes,
                        })}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="btn small"
                      aria-label={t('cal2.day.playGameNamed', { title })}
                      onClick={() => openGameFromCalendar(session.gameId as GameId)}
                    >
                      {t('cal2.day.playGame')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DaySection>
      )}

      {detail.kind !== 'past' && (
        <DaySection title={t('cal2.day.section.due')}>
          <p>{detail.due > 0 ? t('cal2.day.due', { count: detail.due }) : t('cal2.day.noneDue')}</p>
          {/* gram2: the grammar review queue for this day, beside the cards'. */}
          <GrammarDueDayLine dateKey={dateKey} isToday={detail.kind === 'today'} />
          <div className="cal-day-actions">
            {detail.kind === 'today' && detail.due > 0 && (
              <button type="button" className="btn small primary" onClick={openTodaysReviews}>
                {t('cal2.day.reviewNow')}
              </button>
            )}
            {detail.kind === 'future' && detail.due > 0 && (
              <button type="button" className="btn small primary" onClick={() => studyAheadUntil(dateKey)}>
                {t('cal2.day.studyAhead')}
              </button>
            )}
          </div>
          <div className="cal-day-reminder">
            <label className="cal-day-time">
              <span>{t('cal2.reminder.time')}</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value || '19:00')} />
            </label>
            <button type="button" className="btn small" onClick={remindOnDay}>
              {t('cal2.reminder.onDay')}
            </button>
            <button type="button" className="btn small" aria-pressed={!!dailyReminder} onClick={toggleDaily}>
              {dailyReminder
                ? t('cal2.reminder.dailyActive', { time: dailyReminder.startTime ?? '' })
                : t('cal2.reminder.daily')}
            </button>
          </div>
          <p className="muted cal-day-hint">{t('cal2.reminder.trayHint')}</p>
        </DaySection>
      )}

      <footer className="cal-day-export">
        <button type="button" className="btn small" onClick={() => void exportDay('copy')}>
          {t('cal2.export.copyDay')}
        </button>
        <button type="button" className="btn small" onClick={() => void exportDay('save')}>
          {t('cal2.export.saveDay')}
        </button>
        <button type="button" className="btn small" onClick={() => void exportMonth()}>
          {t('cal2.export.saveMonth')}
        </button>
      </footer>
      <p className="muted cal-day-status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}

function toTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function DaySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cal-day-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

/** Minutes by activity, as text with a proportional bar beside each. */
function DayTime({ detail }: { detail: CalendarDayDetail }) {
  const { t } = useT();
  const rows: Array<[string, number]> = [
    ['cal2.day.minutes.reading', detail.minutes.reading],
    ['cal2.day.minutes.watching', detail.minutes.watching],
    ['cal2.day.minutes.listening', detail.minutes.listening],
    ['cal2.day.minutes.study', detail.minutes.study],
  ];
  const peak = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <DaySection title={t('cal2.day.section.time')}>
      <p>{t('cal2.day.minutesTotal', { count: detail.minutes.total })}</p>
      <ul className="cal-day-bars">
        {rows.filter(([, value]) => value > 0).map(([key, value]) => (
          <li key={key}>
            <span>{t(key, { count: value })}</span>
            <i aria-hidden="true" style={{ transform: `scaleX(${value / peak})` }} />
          </li>
        ))}
      </ul>
    </DaySection>
  );
}

function SceneRow({
  scene,
  studyTag,
  onNotify,
}: {
  scene: DayScene;
  studyTag: string;
  onNotify: (message: string) => void;
}) {
  const { t } = useT();
  return (
    <li>
      <span className="cal-day-row-text">
        <b lang={studyTag}>{scene.sentence}</b>
        <small className="muted">
          <span lang={studyTag}>{scene.title}</span> · {formatSceneTime(scene.cueStartSec)}
        </small>
      </span>
      <button
        type="button"
        className="btn small"
        aria-label={t('cal2.day.playSceneNamed', { line: scene.sentence })}
        onClick={() => playSceneFromCalendar(scene, onNotify)}
      >
        {t('cal2.day.playScene')}
      </button>
    </li>
  );
}
