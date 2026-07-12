import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icons';
import { getSummary, resetStats, formatDuration, formatNumber, type StatsSummary } from '../stats';
import { knowledgeCounts, onKnowledgeChanged } from '../knownWords';
import { syncKnowledgeFromAnki } from '../ankiSync';

function WordKnowledge() {
  const [counts, setCounts] = useState(() => knowledgeCounts());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => onKnowledgeChanged(() => setCounts(knowledgeCounts())), []);

  const total = counts[1] + counts[2] + counts[3];
  const sync = async () => {
    setBusy(true);
    setMsg('Reading your Anki cards…');
    const r = await syncKnowledgeFromAnki();
    setBusy(false);
    if (!r.ok) setMsg(r.error ?? 'Sync failed.');
    else setMsg(`Synced ${r.scanned ?? 0} words from Anki — ${r.changed ?? 0} updated.`);
    setCounts(knowledgeCounts());
  };

  return (
    <section className="stats-section">
      <div className="wk-head">
        <h2>Word knowledge</h2>
        <button className="btn small" disabled={busy} onClick={sync}>
          {busy ? (
            'Syncing…'
          ) : (
            <>
              <Icon name="refresh" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              Sync from Anki
            </>
          )}
        </button>
      </div>
      <div className="stats-cards">
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(counts[3])}</span>
          <span className="stats-card-lbl">known</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(counts[2])}</span>
          <span className="stats-card-lbl">familiar</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(counts[1])}</span>
          <span className="stats-card-lbl">learning</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(total)}</span>
          <span className="stats-card-lbl">tracked total</span>
        </div>
      </div>
      <p className="muted wk-note">
        Grade words from any dictionary popup, or pull your progress from Anki (card intervals →
        familiar / known). Turn on “Highlight new words” in the reader to see them tinted.
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
  // A counter we bump to recompute after a reset.
  const [nonce, setNonce] = useState(0);
  const s: StatsSummary = useMemo(() => getSummary(), [nonce]);

  const peak = Math.max(1, ...s.recent.map((d) => d.seconds));
  const hasData = s.totalSeconds > 0 || s.totalChars > 0;

  return (
    <div className="stats-view">
      <div className="view-head">
        <p className="muted">
          Your reading time and characters read, tracked locally as you read in the app.
        </p>
        {hasData && (
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                if (confirm('Reset all reading statistics? This cannot be undone.')) {
                  resetStats();
                  setNonce((n) => n + 1);
                }
              }}
            >
              Reset
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
          <p>No reading tracked yet.</p>
          <p className="muted">
            Open a book from your Library and start reading — your time and characters read will
            show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="stats-cards">
            <div className="stats-card">
              <span className="stats-card-val">
                <Icon name="flame" size={16} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                {s.streak}
              </span>
              <span className="stats-card-lbl">day streak</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatDuration(s.todaySeconds)}</span>
              <span className="stats-card-lbl">read today</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatNumber(s.todayChars)}</span>
              <span className="stats-card-lbl">characters today</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatDuration(s.totalSeconds)}</span>
              <span className="stats-card-lbl">total time</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{formatNumber(s.totalChars)}</span>
              <span className="stats-card-lbl">total characters</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-val">{s.daysActive}</span>
              <span className="stats-card-lbl">days read</span>
            </div>
          </div>

          <section className="stats-section">
            <h2>Last 14 days</h2>
            <div className="stats-chart">
              {s.recent.map((d) => (
                <div key={d.date} className="stats-bar-col" title={`${d.date}: ${formatDuration(d.seconds)}, ${formatNumber(d.chars)} chars`}>
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
              <h2>By book</h2>
              <ul className="stats-books">
                {s.books.map((b) => (
                  <li key={b.id} className="stats-book-row">
                    <span className="stats-book-title" lang="ja">
                      {b.title}
                    </span>
                    <span className="stats-book-meta muted">
                      {formatDuration(b.seconds)} · {formatNumber(b.chars)} chars
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
