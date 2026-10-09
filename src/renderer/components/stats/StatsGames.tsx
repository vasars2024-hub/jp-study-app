/**
 * Statistics: the Game Arena's scores and streak.
 *
 * The Arena kept XP, a play streak, high scores and the last thirty sessions, and only the
 * Arena's own header ever showed any of it — Statistics counted game answers and nothing
 * else. This section shows the streak as it stands today (a streak whose last day is before
 * yesterday is over, which the Arena header used to keep showing), sessions this week,
 * recent accuracy with its direction, and the best score in each game, each game a link
 * into the Arena.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { summarizeArenaProgress } from '../../../shared/gameStudyMix';
import { formatNumber, GAME_PROGRESS_EVENT, loadGameProgress } from '../../stats';
import { arenaGameTitleKey } from '../../games/gameTitles';
import { requestArenaGame } from '../../games/arenaIntent';
import { useStudyLanguage } from '../../useStudyLanguage';
import type { GameId } from '../../games/types';

const BEST_ROWS = 6;

export function StatsGames() {
  const { t, lang } = useT();
  const { lang: studyLang } = useStudyLanguage();
  const [progress, setProgress] = useState(loadGameProgress);
  useEffect(() => {
    const refresh = (): void => setProgress(loadGameProgress());
    window.addEventListener(GAME_PROGRESS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(GAME_PROGRESS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const summary = useMemo(
    () => summarizeArenaProgress({ ...progress, highScores: Object.values(progress.highScores) }),
    [progress],
  );
  if (progress.recent.length === 0 && summary.best.length === 0) return null;
  const percent = new Intl.NumberFormat(LANG_TAGS[lang], { style: 'percent', maximumFractionDigits: 0 });

  return (
    <section className="stats-section stats-games" aria-label={t('games2.stats.title')}>
      <h2>{t('games2.stats.title')}</h2>
      <div className="stats-cards">
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(summary.streak)}</span>
          <span className="stats-card-lbl">{t('games2.stats.streak', { count: summary.streak })}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(summary.sessionsThisWeek)}</span>
          <span className="stats-card-lbl">{t('games2.stats.week', { count: summary.sessionsThisWeek })}</span>
        </div>
        <div className="stats-card" title={t('games2.stats.accuracyHint')}>
          <span className="stats-card-val">
            {summary.recentAccuracy === null ? '—' : percent.format(summary.recentAccuracy)}
          </span>
          <span className="stats-card-lbl">
            {summary.trend ? t(`games2.stats.trend.${summary.trend}`) : t('games2.stats.accuracy')}
          </span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(summary.xp)}</span>
          <span className="stats-card-lbl">{t('games2.stats.xp')}</span>
        </div>
      </div>
      {summary.best.length > 0 && (
        <ul className="stats-books stats-games-best">
          {summary.best.slice(0, BEST_ROWS).map((entry) => {
            const title = t(arenaGameTitleKey(entry.gameId as GameId, studyLang));
            return (
              <li key={entry.gameId} className="stats-book-row-item">
                <button
                  type="button"
                  className="stats-book-row"
                  title={t('games2.stats.playNamed', { title })}
                  onClick={() => requestArenaGame({ gameId: entry.gameId as GameId })}
                >
                  <span className="stats-book-title">{title}</span>
                  <span className="stats-book-meta muted">
                    {t('games2.stats.bestMeta', {
                      score: entry.score,
                      accuracy: Math.round(entry.accuracy * 100),
                      level: entry.level,
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
