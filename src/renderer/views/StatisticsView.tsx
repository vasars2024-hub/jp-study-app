import { useEffect, useMemo, useState } from 'react';
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
  // A counter we bump to recompute after a reset.
  const [nonce, setNonce] = useState(0);
  const s: StatsSummary = useMemo(() => getSummary(), [nonce]);

  const peak = Math.max(1, ...s.recent.map((d) => d.seconds));
  const hasData = s.totalSeconds > 0 || s.totalChars > 0;

  return (
    <div className="stats-view">
      <div className="view-head">
        <p className="muted">{t('stats.intro')}</p>
        {hasData && (
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                if (confirm(t('stats.resetConfirm'))) {
                  resetStats();
                  setNonce((n) => n + 1);
                }
              }}
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
