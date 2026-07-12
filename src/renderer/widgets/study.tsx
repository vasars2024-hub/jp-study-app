import { useEffect, useState } from 'react';
import { getSummary, formatDuration, formatNumber, READING_RECORDED_EVENT, type StatsSummary } from '../stats';
import { loadSaved, onSavedChanged, type SavedWord } from '../savedWords';
import { knowledgeCounts } from '../knownWords';

/** Live stats summary — refreshes whenever the reader records activity. */
function useStatsSummary(): StatsSummary {
  const [s, setS] = useState<StatsSummary>(() => getSummary());
  useEffect(() => {
    const refresh = () => setS(getSummary());
    window.addEventListener(READING_RECORDED_EVENT, refresh);
    // Also pick up cross-day changes / other windows.
    const t = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener(READING_RECORDED_EVENT, refresh);
      window.clearInterval(t);
    };
  }, []);
  return s;
}

// ---------- Study streak ----------
export function StudyStreak() {
  const s = useStatsSummary();
  return (
    <div className="wgt wgt-stat">
      <div className="wgt-stat-value">{s.streak}</div>
      <div className="wgt-stat-label">day streak</div>
      <div className="wgt-stat-sub">{s.daysActive} days studied total</div>
    </div>
  );
}

// ---------- Today's study time ----------
export function TodayStudyTime() {
  const s = useStatsSummary();
  return (
    <div className="wgt wgt-stat">
      <div className="wgt-stat-value">{formatDuration(s.todaySeconds)}</div>
      <div className="wgt-stat-label">read today</div>
      <div className="wgt-stat-sub">{formatNumber(s.todayChars)} characters</div>
    </div>
  );
}

// ---------- Reading progress (14-day sparkline) ----------
export function ReadingProgress() {
  const s = useStatsSummary();
  const max = Math.max(1, ...s.recent.map((d) => d.seconds));
  return (
    <div className="wgt wgt-reading">
      <div className="wgt-reading-top">
        <span className="wgt-stat-value sm">{formatDuration(s.totalSeconds)}</span>
        <span className="wgt-stat-label">total reading</span>
      </div>
      <div className="wgt-spark">
        {s.recent.map((d) => (
          <div
            key={d.date}
            className={`wgt-spark-bar ${d.seconds > 0 ? '' : 'empty'}`}
            style={{ height: `${Math.max(4, (d.seconds / max) * 100)}%` }}
            title={`${d.date}: ${formatDuration(d.seconds)}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Vocabulary progress (knowledge breakdown) ----------
export function VocabularyProgress() {
  const [counts, setCounts] = useState(() => knowledgeCounts());
  useEffect(() => {
    const refresh = () => setCounts(knowledgeCounts());
    window.addEventListener('word-knowledge-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('word-knowledge-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const learned = counts[2] + counts[3]; // Familiar or better
  const total = counts[1] + counts[2] + counts[3];
  const pct = total > 0 ? (learned / total) * 100 : 0;
  const rows: { label: string; n: number; cls: string }[] = [
    { label: 'Known', n: counts[3], cls: 'k3' },
    { label: 'Familiar', n: counts[2], cls: 'k2' },
    { label: 'Learning', n: counts[1], cls: 'k1' },
  ];
  return (
    <div className="wgt wgt-vocab">
      <div className="wgt-reading-top">
        <span className="wgt-stat-value sm">{learned}</span>
        <span className="wgt-stat-label">familiar+ words</span>
      </div>
      <div className="wgt-progress"><div className="wgt-progress-fill" style={{ width: `${pct}%` }} /></div>
      <ul className="wgt-vocab-rows">
        {rows.map((r) => (
          <li key={r.label}>
            <span className={`wgt-dot ${r.cls}`} />
            <span className="wgt-vocab-lbl">{r.label}</span>
            <span className="wgt-vocab-n">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Word of the day (from saved dictionary words) ----------
export function WordOfTheDay() {
  const [saved, setSaved] = useState<SavedWord[]>(() => loadSaved());
  useEffect(() => onSavedChanged(() => setSaved(loadSaved())), []);
  if (saved.length === 0) {
    return (
      <div className="wgt wgt-wotd">
        <div className="wgt-empty">Save words from the dictionary and one will appear here each day.</div>
      </div>
    );
  }
  // Deterministic pick that rotates once per calendar day.
  const dayNum = Math.floor(Date.now() / 86400000);
  const w = saved[dayNum % saved.length];
  return (
    <div className="wgt wgt-wotd">
      <div className="wgt-wotd-word" lang="ja">{w.word}</div>
      {w.reading && <div className="wgt-wotd-reading" lang="ja">{w.reading}</div>}
      <div className="wgt-wotd-meaning">{w.meaning}</div>
    </div>
  );
}
