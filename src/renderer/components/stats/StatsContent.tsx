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
  onStatsChanged,
  resetStats,
  type StatsSummary,
} from '../../stats';
import {
  mediaWorkspaceHostIsMounted,
  readContinueWatching,
} from '../../continueWatchingStore';
import {
  continueWatchingPathFromKey,
  continueWatchingResumeSec,
} from '../../../shared/seanimeContinueWatching';
import { MEDIA_WORKSPACE_OPEN_EVENT } from '../../../shared/mediaWorkspace';
import { knowledgeCounts, onKnowledgeChanged } from '../../knownWords';
import { syncKnowledgeFromAnki } from '../../ankiSync';
import { LevelMeter } from '../LevelMeter';
import { getLevelEstimate, onLevelChange } from '../../levelService';
import { badgeKeyForTier, type LevelEstimate } from '../../../shared/levelEstimate';
import { useT } from '../../i18n';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';

/**
 * YYYY-MM-DD → single weekday initial (M T W … / 月 火 水 … / П В С …) for the
 * bar-chart axis, in the interface language.
 *
 * `weekday: 'narrow'` is the one CLDR field that is a single character in every
 * language we ship, so the axis keeps its one-glyph shape rather than needing a
 * per-language layout. In English it returns exactly the S M T W T F S the
 * hardcoded array used to. Ambiguity (two S in English, two В in Russian) is
 * inherent to a one-letter axis and is what the tooltip's full date is for.
 *
 * Not `dayLabel`: shared/reviewForecast exports a different function under that
 * name (offset days → "Today"/"Tomorrow"/short weekday), and the collision made
 * it possible to import the wrong one.
 */
export function weekdayInitial(isoDate: string, lang: UiLang = 'en'): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat(LANG_TAGS[lang], { weekday: 'narrow' }).format(d);
}

/**
 * YYYY-MM-DD → the full day as the tooltip says it, in the interface language.
 * The axis is one ambiguous glyph by design, so this is where the reader
 * actually finds out which day a bar is; a bare ISO string is language-neutral
 * but nobody's native way of writing a date.
 */
export function chartDayLabel(isoDate: string, lang: UiLang = 'en'): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(LANG_TAGS[lang], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export interface StatsState {
  summary: StatsSummary;
  peak: number;
  hasData: boolean;
  refresh: () => void;
  resetAllStats: () => Promise<void>;
}

export function useStats(): StatsState {
  const { t, lang } = useT();
  // A counter we bump to recompute after a reset.
  const [nonce, setNonce] = useState(0);
  const summary: StatsSummary = useMemo(() => getSummary(), [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => onStatsChanged(refresh), [refresh]);

  const resetAllStats = useCallback(async () => {
    const ok = await confirmDialog({
      title: t('stats.resetTitle'),
      message: t('stats.resetConfirm'),
      confirmLabel: t('stats.reset'),
      danger: true,
    });
    if (ok) {
      resetStats();
      setNonce((n) => n + 1);
    }
    // `lang`, not `t` — `t`'s identity is stable by design, so depending on it goes
    // silently stale after a language switch (CLAUDE.md i18n rule 6).
  }, [lang, t]);

  return {
    summary,
    // The bar is stacked since slice 8, so the scale is the taller of the two channels
    // combined — peaking on reading alone would let a heavy watching day overflow it.
    peak: Math.max(1, ...summary.recent.map((d) => d.seconds + d.watchSeconds)),
    hasData:
      summary.totalSeconds > 0 || summary.totalChars > 0 || summary.totalWatchSeconds > 0,
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

  // "N3"/"HSK 4" are proper nouns and stay; tier 7's "Advanced" is an ordinary
  // English word, so badgeKeyForTier hands back a key for that case alone.
  const badgeKey = badgeKeyForTier(estimate.lang, estimate.tier);
  const badgeText = badgeKey ? t(badgeKey) : estimate.short;

  return (
    <div
      className="stats-level-estimate"
      role="status"
      aria-label={t('stats.level.aria', { level: badgeText })}
    >
      <span className="stats-level-badge">{badgeText}</span>
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
  const [message, setMessage] = useState<{
    text: string;
    tone: 'busy' | 'error' | 'success' | 'stale';
  } | null>(null);

  useEffect(() => onKnowledgeChanged(() => setCounts(knowledgeCounts())), []);

  const total = counts[1] + counts[2] + counts[3];
  const sync = async () => {
    setBusy(true);
    setMessage({ text: t('stats.wk.readingCards'), tone: 'busy' });
    const r = await syncKnowledgeFromAnki();
    setBusy(false);
    if (!r.ok) {
      setMessage({ text: r.error ?? t('stats.wk.syncFailed'), tone: 'error' });
    } else if (r.stale) {
      // Real counts from the last good snapshot, but nothing was re-read from Anki just
      // now. Saying "synced" here is the false success this tone exists to prevent.
      setMessage({
        text: t('stats.wk.syncStale', { scanned: r.scanned ?? 0 }),
        tone: 'stale',
      });
    } else {
      setMessage({
        text: t('stats.wk.syncResult', { scanned: r.scanned ?? 0, changed: r.changed ?? 0 }),
        tone: 'success',
      });
    }
    setCounts(knowledgeCounts());
  };

  return (
    <section className="stats-section stats-knowledge">
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
      <p className="muted wk-note">{t('stats.wk.note')}</p>
      {message && (
        <div
          className={`wk-message ${message.tone}`}
          role={message.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span>{message.text}</span>
          <button
            type="button"
            className="btn small wk-message-close"
            onClick={() => setMessage(null)}
          >
            {t('common.close')}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * The headline totals. `state.hasData` gates this in both shells.
 *
 * Six of them, plus three for watching **once there is any** — a permanent row of
 * `0s / 0s / 0` for someone who only ever reads is noise, and the grid is three columns
 * wide, so the watch channel either fills a whole row or takes none. Discovery of the
 * feature happens in the player and the Today widget, not by staring at zeroes here.
 */
export function StatsCards({ state }: { state: StatsState }) {
  const { t } = useT();
  const s = state.summary;
  const watched = s.totalWatchSeconds > 0;

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
        <span className="stats-card-lbl">{t('stats.card.daysActive')}</span>
      </div>
      {watched && (
        <>
          <div className="stats-card">
            <span className="stats-card-val">{formatDuration(s.todayWatchSeconds)}</span>
            <span className="stats-card-lbl">{t('stats.card.watchedToday')}</span>
          </div>
          <div className="stats-card">
            <span className="stats-card-val">{formatDuration(s.totalWatchSeconds)}</span>
            <span className="stats-card-lbl">{t('stats.card.totalWatched')}</span>
          </div>
          <div className="stats-card">
            <span className="stats-card-val">{s.shows.length}</span>
            <span className="stats-card-lbl">{t('stats.card.showsWatched')}</span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Fourteen days, reading and watching stacked on one scale.
 *
 * Two channels on one bar rather than two charts side by side: the question this chart
 * answers is "how much did I do that day", and splitting it into two would make the
 * answer something the reader has to add up. The segments carry a 2px gap and the legend
 * names both, because their fills sit at almost the same lightness — hue alone would
 * separate them for most people and for nobody in greyscale.
 */
export function StatsChart({ state }: { state: StatsState }) {
  const { t, lang } = useT();
  const anyWatch = state.summary.totalWatchSeconds > 0;

  return (
    <>
      <div className="stats-chart">
        {state.summary.recent.map((d) => (
          <div
            key={d.date}
            className="stats-bar-col"
            title={
              anyWatch
                ? t('stats.barTooltipWithWatch', {
                    date: chartDayLabel(d.date, lang),
                    duration: formatDuration(d.seconds),
                    chars: formatNumber(d.chars),
                    watched: formatDuration(d.watchSeconds),
                  })
                : t('stats.barTooltip', {
                    date: chartDayLabel(d.date, lang),
                    duration: formatDuration(d.seconds),
                    chars: formatNumber(d.chars),
                  })
            }
          >
            <div className="stats-bar-track">
              <div className="stats-bar-stack">
                {d.watchSeconds > 0 && (
                  <div
                    className="stats-bar-fill watch"
                    style={{ height: `${(d.watchSeconds / state.peak) * 100}%` }}
                  />
                )}
                {d.seconds > 0 && (
                  <div
                    className="stats-bar-fill"
                    style={{ height: `${(d.seconds / state.peak) * 100}%` }}
                  />
                )}
              </div>
            </div>
            <span className="stats-bar-lbl">{weekdayInitial(d.date, lang)}</span>
          </div>
        ))}
      </div>
      {anyWatch && (
        <div className="stats-legend">
          <span className="stats-legend-item">
            <i className="stats-legend-dot" aria-hidden="true" />
            {t('stats.legend.read')}
          </span>
          <span className="stats-legend-item">
            <i className="stats-legend-dot watch" aria-hidden="true" />
            {t('stats.legend.watched')}
          </span>
        </div>
      )}
    </>
  );
}

/**
 * Per-show watch time, most recent first — and a way back into each one.
 *
 * Keyed by `videoCoreResumeKey`, the same identity the continue-watching row, the
 * readiness row and the mined-card provenance already use, so this list is the same files
 * under a different question rather than a fourth name for them. That shared key is also
 * what lets a row *do* something: `readContinueWatching()` can be asked where this exact
 * file was left, and the row becomes the same resume control the desktop widget offers.
 * Titles are never translated: a media title is study content (`CLAUDE.md` i18n rule 4).
 *
 * Three conditions gate the control, and each one's absence would leave a button that
 * silently does nothing — the refusal slice 7 made for the same event:
 *
 * 1. **`MediaWorkspaceHost` must be mounted.** It renders `null` while the sidecar is
 *    `disabled` or unknown, and registers no listener then. It is mounted at the *App*
 *    level, so it is reachable from this view; that is why this connection exists at all.
 * 2. **Only `file:` keys can be reopened**, because `localFilePath` is the only way in.
 * 3. **A row with no known position still opens** — it just does not claim one, and the
 *    player falls back to its own stored resume. Passing a fabricated `startAtSec` to fill
 *    the argument would move a real video to a place nothing measured.
 *
 * A row that fails any of them stays exactly what it was: a readout.
 */
export function StatsShows({ state }: { state: StatsState }) {
  const { t } = useT();
  const [resumable, setResumable] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    if (!mediaWorkspaceHostIsMounted()) return;
    // One read for the whole list, in an effect: `readContinueWatching` parses two
    // localStorage stores and this list is rendered on a view that repaints for
    // unrelated reasons.
    const positions = new Map<string, number>();
    for (const entry of readContinueWatching()) {
      positions.set(`file:${entry.pathKey}`, continueWatchingResumeSec(entry));
    }
    setResumable(positions);
  }, [state.summary.shows.length]);

  const resume = (id: string): void => {
    const localFilePath = continueWatchingPathFromKey(id);
    if (!localFilePath) return;
    const startAtSec = resumable?.get(id);
    window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, {
      detail: { localFilePath, ...(startAtSec != null ? { startAtSec } : {}) },
    }));
  };

  return (
    <ul className="stats-books">
      {state.summary.shows.map((show) => {
        const meta = t('stats.showMeta', { duration: formatDuration(show.seconds) });
        const canResume = resumable != null && continueWatchingPathFromKey(show.id) !== '';
        const body = (
          <>
            <span className="stats-book-title" lang="ja">
              {show.title}
            </span>
            <span className="stats-book-meta muted">{meta}</span>
          </>
        );
        return (
          <li key={show.id} className="stats-book-row-item">
            {canResume ? (
              <button
                type="button"
                className="stats-book-row stats-show-resume"
                onClick={() => resume(show.id)}
                title={t('stats.showResume', { title: show.title })}
              >
                {body}
                <Icon name="player" size={13} className="stats-show-resume-icon" />
              </button>
            ) : (
              <div className="stats-book-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
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
