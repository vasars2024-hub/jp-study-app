import { useRef, useState } from 'react';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  useDismissableDisclosure,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import Icon from '../components/Icons';
import { formatDuration, formatNumber } from '../stats';
import {
  StatsBooks,
  StatsCards,
  StatsChart,
  StatsGrammar,
  StatsReviews,
  StatsShows,
  WordKnowledge,
  useStats,
} from '../components/stats/StatsContent';
import { useT } from '../i18n';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import '../components/stats/statsLiquid.css';

export default function StatisticsView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  const state = useStats();
  const { summary: s, hasData, refresh, resetAllStats } = state;
  const recentActivityRef = useRef<HTMLElement>(null);
  // The Reset disclosure's panel is positioned out of flow and lands on top of the Word
  // Knowledge "Sync from Anki" button one row below it, so without a light dismiss the only
  // gesture that reads as "never mind" presses Reset instead. See the hook's own measurement.
  const dataToolsRef = useRef<HTMLDetailsElement>(null);
  const [dataToolsOpen, setDataToolsOpen] = useState(false);
  useDismissableDisclosure(dataToolsRef, dataToolsOpen);

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('stats.menu.file'),
      items: [
        { id: 'reset', label: t('stats.resetTitle'), disabled: !hasData, onSelect: () => void resetAllStats() },
      ],
    },
    {
      id: 'view',
      label: t('stats.menu.view'),
      items: [
        { id: 'refresh', label: t('stats.menu.refresh'), onSelect: refresh },
      ],
    },
  ];

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>{t('stats.status.total', { duration: formatDuration(s.totalSeconds) })}</StatusBarField>
            <StatusBarField>{t('stats.status.chars', { chars: formatNumber(s.totalChars) })}</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>{t('stats.status.activeDays', { count: s.daysActive })}</StatusBarField>
          </>
        }
        className="aero-stats-chrome"
      >
        <div className="aero-stats">
          <Toolbar className="aero-stats-toolbar" aria-label={t('stats.commands')}>
            <button className="aero-stat-command" onClick={refresh}>
              <Icon name="refresh" size={13} />
              {t('stats.menu.refresh')}
            </button>
            <button className="aero-stat-command danger" disabled={!hasData} onClick={() => void resetAllStats()}>
              {t('stats.reset')}
            </button>
            <ToolbarSpacer />
            <span className="aero-stat-toolbar-note">{t('stats.activityMonitor')}</span>
          </Toolbar>

          <div className="aero-stats-workbench">
            <aside className="aero-stats-summary" aria-label={t('stats.summaryAria')}>
              <h2>{t('stats.summary')}</h2>
              <dl>
                <div>
                  <dt>{t('stats.today')}</dt>
                  <dd>{formatDuration(s.todaySeconds)}</dd>
                </div>
                <div>
                  <dt>{t('stats.charactersToday')}</dt>
                  <dd>{formatNumber(s.todayChars)}</dd>
                </div>
                <div>
                  <dt>{t('stats.streak')}</dt>
                  <dd>{t('stats.streakDays', { count: s.streak })}</dd>
                </div>
                <div>
                  <dt>{t('stats.totalTime')}</dt>
                  <dd>{formatDuration(s.totalSeconds)}</dd>
                </div>
                <div>
                  <dt>{t('stats.totalChars')}</dt>
                  <dd>{formatNumber(s.totalChars)}</dd>
                </div>
                {s.totalWatchSeconds > 0 && (
                  <>
                    <div>
                      <dt>{t('stats.card.watchedToday')}</dt>
                      <dd>{formatDuration(s.todayWatchSeconds)}</dd>
                    </div>
                    <div>
                      <dt>{t('stats.card.totalWatched')}</dt>
                      <dd>{formatDuration(s.totalWatchSeconds)}</dd>
                    </div>
                    <div>
                      <dt>{t('stats.card.showsWatched')}</dt>
                      <dd>{s.shows.length}</dd>
                    </div>
                  </>
                )}
                {s.totalStudySeconds > 0 && (
                  <>
                    <div>
                      <dt>{t('stats.card.studiedToday')}</dt>
                      <dd>{formatDuration(s.todayStudySeconds)}</dd>
                    </div>
                    <div>
                      <dt>{t('stats.card.totalStudied')}</dt>
                      <dd>{formatDuration(s.totalStudySeconds)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </aside>

            <main className="aero-stats-main">
              <section className="aero-stats-panel">
                <header>{t('stats.last14Days')}</header>
                {hasData ? (
                  <StatsChart state={state} />
                ) : (
                  <div className="aero-stats-empty">{t('stats.noSamples')}</div>
                )}
              </section>

              <section className="aero-stats-panel aero-stats-books-panel">
                <header>{t('stats.books')}</header>
                {s.books.length > 0 ? (
                  <div className="aero-stats-table">
                    <div className="aero-stats-book-row aero-stats-book-head">
                      <span>{t('stats.col.title')}</span>
                      <span>{t('stats.col.time')}</span>
                      <span>{t('stats.col.chars')}</span>
                    </div>
                    {s.books.map((b) => (
                      <div key={b.id} className="aero-stats-book-row">
                        <span lang="ja">{b.title}</span>
                        <span>{formatDuration(b.seconds)}</span>
                        <span>{formatNumber(b.chars)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="aero-stats-empty">{t('stats.noBookTotals')}</div>
                )}
              </section>
              {s.shows.length > 0 && (
                <section className="aero-stats-panel stats-by-show">
                  <header>{t('stats.byShow')}</header>
                  <StatsShows state={state} />
                </section>
              )}
            </main>

            <aside className="aero-stats-knowledge">
              <WordKnowledge />
              <StatsReviews />
              <StatsGrammar />
            </aside>
          </div>
        </div>
      </AppChrome>
    );
  }

  const classicStatus = (
    <>
      <StatusBarField>TEL / METRICS LIVE</StatusBarField>
      <StatusBarField>{formatDuration(s.totalSeconds)}</StatusBarField>
      <StatusBarField>{formatNumber(s.totalChars)}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{t('stats.card.daysActive')}: {s.daysActive}</StatusBarField>
    </>
  );

  return (
    <AppChrome menus={menus} status={classicStatus} className="stats-chrome">
    <div className="stats-view">
      <ContextualSurface as="header" className="view-head stats-context-head">
        <p className="muted">{t('stats.intro')}</p>
        {hasData && (
          <div className="actions">
            <button
              type="button"
              className="btn primary stats-recent-jump"
              onClick={() => recentActivityRef.current?.scrollIntoView({ block: 'start' })}
            >
              <Icon name="chart-bar" size={13} />
              {t('stats.last14Days')}
            </button>
            <details
              className="stats-data-tools"
              ref={dataToolsRef}
              onToggle={(e) => setDataToolsOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="btn">{t('stats.reset')}</summary>
              <div className="stats-data-tools-panel">
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => void resetAllStats()}
                >
                  {t('stats.reset')}
                </button>
              </div>
            </details>
          </div>
        )}
      </ContextualSurface>

      <WordKnowledge />

      <StatsReviews />

      <StatsGrammar />

      {!hasData ? (
        <div className="stats-empty">
          <div className="stats-empty-emoji">
            <Icon name="stats" size={40} />
          </div>
          <p>{t('stats.empty.title')}</p>
          <p className="muted">{t('stats.empty.desc')}</p>
        </div>
      ) : (
        <>
          <StatsCards state={state} />

          <section ref={recentActivityRef} className="stats-section stats-recent-activity">
            <h2>{t('stats.last14Days')}</h2>
            <StatsChart state={state} />
          </section>

          {s.books.length > 0 && (
            <section className="stats-section stats-by-book">
              <h2>{t('stats.byBook')}</h2>
              <StatsBooks state={state} />
            </section>
          )}

          {s.shows.length > 0 && (
            <section className="stats-section stats-by-show">
              <h2>{t('stats.byShow')}</h2>
              <StatsShows state={state} />
            </section>
          )}
        </>
      )}
    </div>
    </AppChrome>
  );
}
