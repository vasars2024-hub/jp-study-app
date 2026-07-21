/**
 * Reading-statistics state and content blocks — shared by Study OS's
 * `StatisticsView` and Blanc's `BlancStatisticsPanel`.
 *
 * Pillar 0 (BLANC_REFINEMENT_PLAN.md): `stats` used to be a tab bail-out that
 * mounted `StatisticsView` inside `BlancViewHost`, which dragged `AppChrome`
 * into a Blanc window. The numbers all come from `renderer/stats.ts`; what was
 * still view-local was the summary cards, the 14-day chart, the per-book list,
 * and the word-knowledge section. Both shells now compose these.
 *
 * Nothing here may import `AppChrome`/`MenuBar`/`StatusBar` — `confirmDialog`
 * is imported from `ui/dialogService` directly rather than the `ui` barrel so
 * Blanc's bundle never pulls the chrome in transitively.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../Icons';
import { confirmDialog } from '../ui/dialogService';
import {
  formatDuration,
  formatNumber,
  getSummary,
  resetStats,
  type StatsSummary,
} from '../../stats';
import { knowledgeCounts, onKnowledgeChanged } from '../../knownWords';
import { syncKnowledgeFromAnki } from '../../ankiSync';
import { LevelMeter } from '../LevelMeter';
import { getLevelEstimate, onLevelChange } from '../../levelService';
import type { LevelEstimate } from '../../../shared/levelEstimate';
import { useT } from '../../i18n';

export function dayLabel(isoDate: string): string {
  // isoDate = YYYY-MM-DD → weekday initial (M T W …).
  const d = new Date(`${isoDate}T00:00:00`);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
}

export interface StatsState {
  summary: StatsSummary;
  peak: number;
  hasData: boolean;
  refresh: () => void;
  resetAllStats: () => Promise<void>;
}

export function useStats(): StatsState {
  // A counter we bump to recompute after a reset.
  const [nonce, setNonce] = useState(0);
  const summary: StatsSummary = useMemo(() => getSummary(), [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const resetAllStats = useCallback(async () => {
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
  }, []);

  return {
    summary,
    peak: Math.max(1, ...summary.recent.map((d) => d.seconds)),
    hasData: summary.totalSeconds > 0 || summary.totalChars > 0,
    refresh,
    resetAllStats,
  };
}

export function EstimatedLevelBadge() {
  const { t } = useT();
  const [estimate, setEstimate] = useState<LevelEstimate>(() => getLevelEstimate());

  useEffect(() => {
    const refresh = (): void => setEstimate(getLevelEstimate());
    refresh();
    return onLevelChange(refresh);
  }, []);

  return (
    <div
      className="stats-level-estimate"
      role="status"
      aria-label={t('stats.level.aria', { level: estimate.short })}
    >
      <span className="stats-level-badge">{estimate.short}</span>
      <div className="stats-level-copy">
        <span className="stats-level-title">{t('stats.level.title')}</span>
        <span className="stats-level-hint muted">{t('stats.level.hint')}</span>
      </div>
    </div>
  );
}

export function WordKnowledge() {
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
      <EstimatedLevelBadge />
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

/** The six headline totals. `state.hasData` gates this in both shells. */
export function StatsCards({ state }: { state: StatsState }) {
  const { t } = useT();
  const s = state.summary;

  return (
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
  );
}

export function StatsChart({ state }: { state: StatsState }) {
  const { t } = useT();

  return (
    <div className="stats-chart">
      {state.summary.recent.map((d) => (
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
              style={{ height: `${Math.round((d.seconds / state.peak) * 100)}%` }}
            />
          </div>
          <span className="stats-bar-lbl">{dayLabel(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsBooks({ state }: { state: StatsState }) {
  const { t } = useT();

  return (
    <ul className="stats-books">
      {state.summary.books.map((b) => (
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
  );
}
