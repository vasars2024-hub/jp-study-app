import { useEffect, useMemo, useState } from 'react';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  confirmDialog,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import Icon from '../components/Icons';
import { getSummary, resetStats, formatDuration, formatNumber, type StatsSummary } from '../stats';
import { knowledgeCounts, onKnowledgeChanged } from '../knownWords';
import { syncKnowledgeFromAnki } from '../ankiSync';
import { LevelMeter } from '../components/LevelMeter';
import { useT } from '../i18n';

function WordKnowledge() {
  const { t } = useT();
  const [counts, setCounts] = useState(() => knowledgeCounts());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => onKnowledgeChanged(() => setCounts(knowledgeCounts())), []);

  const total = counts[1] + counts[2] + counts[3];
  const sync = async () => {
    setBusy(true);
    setMsg(t('stats.wk.readingCards'));
    const r = await syncKnowledgeFromAnki();
    setBusy(false);
    if (!r.ok) setMsg(r.error ?? t('stats.wk.syncFailed'));
    else setMsg(t('stats.wk.syncResult', { scanned: r.scanned ?? 0, changed: r.changed ?? 0 }));
    setCounts(knowledgeCounts());
  };

  return (
    <section className="stats-section">
      <div className="wk-head">
        <h2>{t('stats.wk.title')}</h2>
        <button className="btn small" disabled={busy} onClick={sync}>
          {busy ? (
            t('stats.wk.syncing')
          ) : (
            <>
              <Icon name="refresh" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {t('stats.wk.syncFromAnki')}
            </>
          )}
        </button>
      </div>
      <LevelMeter compact />
      <div className="stats-cards">
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(counts[3])}</span>
          <span className="stats-card-lbl">{t('stats.wk.known')}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(counts[2])}</span>
          <span className="stats-card-lbl">{t('stats.wk.familiar')}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(counts[1])}</span>
          <span className="stats-card-lbl">{t('stats.wk.learning')}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(total)}</span>
          <span className="stats-card-lbl">{t('stats.wk.trackedTotal')}</span>
        </div>
      </div>
      <p className="muted wk-note">
        {t('stats.wk.note')}
        {msg ? ` · ${msg}` : ''}
      </p>
    </section>
  );
}

function dayLabel(isoDate: string): string {
  // isoDate = YYYY-MM-DD → weekday initial (M T W …).
  const d = new Date(`${isoDate}T00:00:00`);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
}

export default function StatisticsView() {
  const { t } = useT();
  const aero = useAeroMaterials();
  // A counter we bump to recompute after a reset.
  const [nonce, setNonce] = useState(0);
  const s: StatsSummary = useMemo(() => getSummary(), [nonce]);

  const peak = Math.max(1, ...s.recent.map((d) => d.seconds));
  const hasData = s.totalSeconds > 0 || s.totalChars > 0;

  async function resetAllStats() {
    const ok = await confirmDialog({
      title: 'Reset statistics',
      message: 'Reset all reading statistics? This cannot be undone.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (ok) {
      resetStats();
      setNonce((n) => n + 1);
    }
  }

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
        { id: 'refresh', label: 'Refresh', onSelect: () => setNonce((n) => n + 1) },
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
            <button className="aero-stat-command" onClick={() => setNonce((n) => n + 1)}>
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
                        <b>{dayLabel(d.date)}</b>
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

  return (
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
          <div className="stats-cards">
            <div className="stats-card">
              <span className="stats-card-val">
                <Icon name="flame" size={16} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                {s.streak}
              </span>
              <span className="stats-card-lbl">{t('stats.card.dayStreak')}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatDuration(s.todaySeconds)}</span>
              <span className="stats-card-lbl">{t('stats.card.readToday')}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatNumber(s.todayChars)}</span>
              <span className="stats-card-lbl">{t('stats.card.charsToday')}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatDuration(s.totalSeconds)}</span>
              <span className="stats-card-lbl">{t('stats.card.totalTime')}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatNumber(s.totalChars)}</span>
              <span className="stats-card-lbl">{t('stats.card.totalChars')}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{s.daysActive}</span>
              <span className="stats-card-lbl">{t('stats.card.daysRead')}</span>
            </div>
          </div>

          <section className="stats-section">
            <h2>{t('stats.last14Days')}</h2>
            <div className="stats-chart">
              {s.recent.map((d) => (
                <div
                  key={d.date}
                  className="stats-bar-col"
                  title={t('stats.barTooltip', {
                    date: d.date,
                    duration: formatDuration(d.seconds),
                    chars: formatNumber(d.chars),
                  })}
                >
                  <div className="stats-bar-track">
                    <div
                      className="stats-bar-fill"
                      style={{ height: `${Math.round((d.seconds / peak) * 100)}%` }}
                    />
                  </div>
                  <span className="stats-bar-lbl">{dayLabel(d.date)}</span>
                </div>
              ))}
            </div>
          </section>

          {s.books.length > 0 && (
            <section className="stats-section">
              <h2>{t('stats.byBook')}</h2>
              <ul className="stats-books">
                {s.books.map((b) => (
                  <li key={b.id} className="stats-book-row">
                    <span className="stats-book-title" lang="ja">
                      {b.title}
                    </span>
                    <span className="stats-book-meta muted">
                      {t('stats.bookMeta', {
                        duration: formatDuration(b.seconds),
                        chars: formatNumber(b.chars),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
