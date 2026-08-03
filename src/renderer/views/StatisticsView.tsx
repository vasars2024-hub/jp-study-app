import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import Icon from '../components/Icons';
import { formatDuration, formatNumber } from '../stats';
import {
  StatsBooks,
  StatsCards,
  StatsChart,
  StatsShows,
  WordKnowledge,
  weekdayInitial,
  useStats,
} from '../components/stats/StatsContent';
import { useT } from '../i18n';

export default function StatisticsView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  const state = useStats();
  const { summary: s, peak, hasData, refresh, resetAllStats } = state;

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'reset', label: 'Reset statistics', disabled: !hasData, onSelect: () => void resetAllStats() },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'refresh', label: 'Refresh', onSelect: refresh },
      ],
    },
  ];

  if (aero) {
    return (
      <AppChrome
        menus={menus}
        status={
          <>
            <StatusBarField>{formatDuration(s.totalSeconds)} total</StatusBarField>
            <StatusBarField>{formatNumber(s.totalChars)} chars</StatusBarField>
            <StatusBarSpacer />
            <StatusBarField>{s.daysActive} active days</StatusBarField>
          </>
        }
        className="aero-stats-chrome"
      >
        <div className="aero-stats">
          <Toolbar className="aero-stats-toolbar" aria-label="Statistics commands">
            <button className="aero-stat-command" onClick={refresh}>
              <Icon name="refresh" size={13} />
              Refresh
            </button>
            <button className="aero-stat-command danger" disabled={!hasData} onClick={() => void resetAllStats()}>
              Reset
            </button>
            <ToolbarSpacer />
            <span className="aero-stat-toolbar-note">Reading activity monitor</span>
          </Toolbar>

          <div className="aero-stats-workbench">
            <aside className="aero-stats-summary" aria-label="Reading summary">
              <h2>Summary</h2>
              <dl>
                <div>
                  <dt>Today</dt>
                  <dd>{formatDuration(s.todaySeconds)}</dd>
                </div>
                <div>
                  <dt>Characters today</dt>
                  <dd>{formatNumber(s.todayChars)}</dd>
                </div>
                <div>
                  <dt>Streak</dt>
                  <dd>{s.streak} days</dd>
                </div>
                <div>
                  <dt>Total time</dt>
                  <dd>{formatDuration(s.totalSeconds)}</dd>
                </div>
                <div>
                  <dt>Total chars</dt>
                  <dd>{formatNumber(s.totalChars)}</dd>
                </div>
              </dl>
            </aside>

            <main className="aero-stats-main">
              <section className="aero-stats-panel">
                <header>Last 14 days</header>
                {hasData ? (
                  <div className="aero-stats-chart">
                    {s.recent.map((d) => (
                      <div key={d.date} className="aero-stats-bar" title={`${d.date}: ${formatDuration(d.seconds)}, ${formatNumber(d.chars)} chars`}>
                        <span style={{ height: `${Math.round((d.seconds / peak) * 100)}%` }} />
                        <b>{weekdayInitial(d.date)}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="aero-stats-empty">No reading samples recorded yet.</div>
                )}
              </section>

              <section className="aero-stats-panel aero-stats-books-panel">
                <header>Books</header>
                {s.books.length > 0 ? (
                  <div className="aero-stats-table">
                    <div className="aero-stats-book-row aero-stats-book-head">
                      <span>Title</span>
                      <span>Time</span>
                      <span>Chars</span>
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
                  <div className="aero-stats-empty">No book totals yet.</div>
                )}
              </section>
            </main>

            <aside className="aero-stats-knowledge">
              <WordKnowledge />
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
      <div className="view-head">
        <p className="muted">{t('stats.intro')}</p>
        {hasData && (
          <div className="actions">
            <button
              className="btn"
              onClick={() => void resetAllStats()}
            >
              {t('stats.reset')}
            </button>
          </div>
        )}
      </div>

      <WordKnowledge />

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

          <section className="stats-section">
            <h2>{t('stats.last14Days')}</h2>
            <StatsChart state={state} />
          </section>

          {s.books.length > 0 && (
            <section className="stats-section">
              <h2>{t('stats.byBook')}</h2>
              <StatsBooks state={state} />
            </section>
          )}

          {s.shows.length > 0 && (
            <section className="stats-section">
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
