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
  type DayStat,
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
import { dueDeckCards, loadDeck, onDeckChanged } from '../../flashcardDeck';
import { loadReviewLog, onReviewLogChanged } from '../../reviewLog';
import { summarizeReviewLog, type ReviewLogSummary } from '../../../shared/reviewLog';
import { localDueForecast, type LocalDueForecast } from '../../../shared/reviewForecast';
import { getActiveProfile, onProfileChanged } from '../../profileState';
import { syncKnowledgeFromAnki } from '../../ankiSync';
import { LevelMeter } from '../LevelMeter';
import {
  getActiveStudyLang,
  getLevelEstimate,
  getTargetProgress,
  onLevelChange,
  type TargetProgress,
} from '../../levelService';
import { loadFamiliarity, onFamiliarityChanged } from '../../grammarFamiliarity';
import {
  getLoadedGrammarCorpus,
  grammarLevelProgress,
  grammarReviewedSince,
  loadGrammarCorpus,
  reviewWindows,
} from '../../grammarProgress';
import type { NormalizedGrammarPoint } from '../../data/grammar/normalize';
import type { StudyLang } from '../../../shared/levelScale';
import { badgeKeyForTier, type LevelEstimate } from '../../../shared/levelEstimate';
import { useT } from '../../i18n';
import { readingCharsPerMinute } from '../../../shared/readingTime';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
import { useWatchTitles } from '../../useWatchTitles';
import {
  groupShowsByLibraryTitle,
  libraryTitlesByResumeKey,
  type MediaPathRef,
  type ShowStatRow,
} from '../../../shared/statsShowTitles';

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
  /**
   * `summary.shows` folded to one row per Watch-library title and named with the
   * library's title (see shared/statsShowTitles.ts). Use this, not
   * `summary.shows`, wherever shows are listed or counted.
   */
  shows: ShowStatRow[];
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

  // The library's view of which files belong to which title — only fetched
  // once there is watch time to name.
  const watched = summary.shows.length > 0;
  const { titles } = useWatchTitles(watched);
  const [media, setMedia] = useState<MediaPathRef[]>([]);
  useEffect(() => {
    if (!watched) return undefined;
    let alive = true;
    const api = typeof window !== 'undefined' ? window.api : undefined;
    void Promise.resolve(api?.listMedia?.())
      .then((items) => {
        if (alive && Array.isArray(items)) setMedia(items);
      })
      .catch(() => undefined);
    const off = api?.onMediaChanged?.((items) => {
      if (Array.isArray(items)) setMedia(items);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [watched]);
  const shows = useMemo(
    () => groupShowsByLibraryTitle(summary.shows, libraryTitlesByResumeKey(titles, media)),
    [summary.shows, titles, media],
  );

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
    shows,
    // The bar is stacked since slice 8, so the scale is the taller of the two channels
    // combined — peaking on reading alone would let a heavy watching day overflow it.
    peak: Math.max(1, ...summary.recent.map((d) => d.seconds + d.watchSeconds)),
    hasData:
      summary.totalSeconds > 0
      || summary.totalChars > 0
      || summary.totalWatchSeconds > 0
      || summary.totalStudySeconds > 0
      || summary.totalReviews > 0,
    refresh,
    resetAllStats,
  };
}

export function EstimatedLevelBadge() {
  const { t } = useT();
  const [estimate, setEstimate] = useState<LevelEstimate>(() => getLevelEstimate());
  // The study profile's JLPT goal (deckParams.jlptTarget) — validated by the
  // profile editor and, until now, shown nowhere.
  const [target, setTarget] = useState(() => getActiveProfile().deckParams.jlptTarget);
  useEffect(() => onProfileChanged(() => setTarget(getActiveProfile().deckParams.jlptTarget)), []);

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
        {target && estimate.lang === 'ja' && (
          <>
            <span className="stats-level-hint muted">{t('stats.level.goal', { level: target })}</span>
            <GoalProgress target={target} />
          </>
        )}
      </div>
    </div>
  );
}

/** The grammar corpus, loaded on demand; null until it arrives. */
function useGrammarCorpus(): NormalizedGrammarPoint[] | null {
  const [corpus, setCorpus] = useState<NormalizedGrammarPoint[] | null>(() => getLoadedGrammarCorpus());
  useEffect(() => {
    if (corpus) return undefined;
    let alive = true;
    void loadGrammarCorpus().then(
      (points) => {
        if (alive) setCorpus(points);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [corpus]);
  return corpus;
}

function formatPercent(value: number, lang: UiLang): string {
  return new Intl.NumberFormat(LANG_TAGS[lang], { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

/**
 * How far along the profile's JLPT goal is: vocabulary coverage of that
 * level's word list and the known share of that level's grammar, side by side.
 */
export function GoalProgress({ target }: { target: 'N5' | 'N4' | 'N3' | 'N2' | 'N1' }) {
  const { t, lang } = useT();
  const corpus = useGrammarCorpus();
  const [progress, setProgress] = useState<TargetProgress>(() => getTargetProgress(target, corpus));
  useEffect(() => {
    const refresh = (): void => setProgress(getTargetProgress(target, corpus));
    refresh();
    return onLevelChange(refresh);
  }, [target, corpus]);

  const vocab = progress.vocabulary.total > 0
    ? t('stats.level.goalVocab', {
      pct: formatPercent(progress.vocabulary.pct / 100, lang),
      learned: formatNumber(progress.vocabulary.learned),
      total: formatNumber(progress.vocabulary.total),
    })
    : t('stats.level.goalVocabNoList', { level: target });
  const grammar = progress.grammar && progress.grammar.total > 0
    ? t('stats.level.goalGrammar', {
      pct: formatPercent(progress.grammar.pct / 100, lang),
      known: formatNumber(progress.grammar.known),
      total: formatNumber(progress.grammar.total),
    })
    : null;

  return (
    <span className="stats-level-hint stats-level-goal">
      <span>{vocab}</span>
      {grammar && <span>{grammar}</span>}
    </span>
  );
}

function useStudyLang(): StudyLang {
  const [studyLang, setStudyLang] = useState<StudyLang>(() => getActiveStudyLang());
  useEffect(() => {
    const h = (): void => setStudyLang(getActiveStudyLang());
    window.addEventListener('study-lang-changed', h);
    return () => window.removeEventListener('study-lang-changed', h);
  }, []);
  return studyLang;
}

/**
 * Grammar: points known and being learned at each JLPT (or HSK) level, and how
 * many were reviewed today and over the last seven days. Familiarity comes
 * from `grammarFamiliarity.ts`; answer counts from the review log.
 */
export function StatsGrammar() {
  const { t } = useT();
  const studyLang = useStudyLang();
  const corpus = useGrammarCorpus();
  const [familiarity, setFamiliarity] = useState(() => loadFamiliarity());
  const [log, setLog] = useState<ReviewLogSummary | null>(null);

  useEffect(() => onFamiliarityChanged(() => setFamiliarity(loadFamiliarity())), []);
  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void loadReviewLog().then((entries) => {
        if (alive) setLog(summarizeReviewLog(entries, 30));
      });
    };
    refresh();
    const off = onReviewLogChanged(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const rows = useMemo(
    () => (corpus ? grammarLevelProgress(corpus, familiarity, studyLang) : null),
    [corpus, familiarity, studyLang],
  );
  const windows = reviewWindows();
  const today = grammarReviewedSince(corpus, familiarity, windows.today, studyLang);
  const week = grammarReviewedSince(corpus, familiarity, windows.week, studyLang);
  const known = rows?.reduce((sum, row) => sum + row.known, 0) ?? 0;

  return (
    <section className="stats-section stats-grammar" aria-label={t('stats.grammar.title')}>
      <h2>{t('stats.grammar.title')}</h2>
      <div className="stats-cards">
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(today)}</span>
          <span className="stats-card-lbl">{t('stats.grammar.reviewedToday')}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(week)}</span>
          <span className="stats-card-lbl">{t('stats.grammar.reviewedWeek')}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{rows ? formatNumber(known) : '—'}</span>
          <span className="stats-card-lbl">{t('stats.grammar.known')}</span>
        </div>
      </div>
      {rows ? (
        <div className="stats-grammar-levels" role="list">
          {rows.map((row) => {
            const name = row.level.replace(/^HSK/, 'HSK ');
            const label = t('stats.grammar.levelCount', {
              known: formatNumber(row.known),
              learning: formatNumber(row.learning),
              total: formatNumber(row.total),
            });
            const knownPct = row.total ? (row.known / row.total) * 100 : 0;
            const learningPct = row.total ? (row.learning / row.total) * 100 : 0;
            return (
              <div key={row.level} className="stats-grammar-level" role="listitem" aria-label={`${name}: ${label}`}>
                <span className="stats-grammar-name">{name}</span>
                <div className="stats-grammar-track" aria-hidden="true">
                  <div className="stats-grammar-known" style={{ width: `${knownPct}%` }} />
                  <div className="stats-grammar-learning" style={{ width: `${learningPct}%` }} />
                </div>
                <span className="stats-grammar-count muted">{label}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted stats-reviews-note">{t('stats.grammar.loading')}</p>
      )}
      <p className="muted stats-reviews-note">
        {log && log.grammarAnswers > 0
          ? t('stats.grammar.answers', { count: log.grammarAnswers, correct: log.grammarCorrect })
          : t('stats.grammar.note')}
      </p>
    </section>
  );
}

/**
 * Flashcard reviews: how many, how well remembered, and what is coming.
 *
 * Reviews are the study this app is built around, and Statistics used to know
 * nothing about them — reading and watching time only. Counts come from the
 * review log (renderer/reviewLog.ts); the forecast reads each local card's own
 * due date, with today's new-card allowance applied to what is due now.
 */
export function StatsReviews() {
  const { t, lang } = useT();
  const [log, setLog] = useState<ReviewLogSummary | null>(null);
  const [forecast, setForecast] = useState<{ dueNow: number; days: LocalDueForecast } | null>(null);

  useEffect(() => {
    let alive = true;
    const refreshLog = (): void => {
      void loadReviewLog().then((entries) => {
        if (alive) setLog(summarizeReviewLog(entries, 30));
      });
    };
    const refreshDeck = (): void => {
      const deck = loadDeck();
      setForecast({ dueNow: dueDeckCards(deck).length, days: localDueForecast(deck, 7) });
    };
    refreshLog();
    refreshDeck();
    const offLog = onReviewLogChanged(refreshLog);
    const offDeck = onDeckChanged(() => {
      refreshDeck();
    });
    return () => {
      alive = false;
      offLog();
      offDeck();
    };
  }, []);

  const today = log?.perDay[log.perDay.length - 1]?.reviews ?? 0;
  const retention = log?.retention;
  const peak = Math.max(1, ...(forecast?.days.days.map((d) => d.due) ?? [0]));

  return (
    <section className="stats-section stats-reviews" aria-label={t('stats.reviews.title')}>
      <h2>{t('stats.reviews.title')}</h2>
      <div className="stats-cards">
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(today)}</span>
          <span className="stats-card-lbl">{t('stats.reviews.today')}</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">
            {log ? log.dailyAverage.toLocaleString(LANG_TAGS[lang]) : '—'}
          </span>
          <span className="stats-card-lbl">{t('stats.reviews.perDay')}</span>
        </div>
        <div className="stats-card" title={t('stats.reviews.retentionHint')}>
          <span className="stats-card-val">
            {retention == null
              ? '—'
              : new Intl.NumberFormat(LANG_TAGS[lang], { style: 'percent', maximumFractionDigits: 0 }).format(retention)}
          </span>
          <span className="stats-card-lbl">
            {log && log.retentionSample > 0
              ? t('stats.reviews.retentionOf', { count: log.retentionSample })
              : t('stats.reviews.retention')}
          </span>
        </div>
        <div className="stats-card">
          <span className="stats-card-val">{formatNumber(forecast?.dueNow ?? 0)}</span>
          <span className="stats-card-lbl">{t('stats.reviews.dueNow')}</span>
        </div>
      </div>
      {forecast && (
        <div className="stats-forecast" role="list" aria-label={t('stats.reviews.forecast')}>
          {forecast.days.days.map((day) => {
            const date = new Date();
            date.setDate(date.getDate() + day.offsetDays);
            const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const label = t('stats.reviews.forecastDay', { date: chartDayLabel(iso, lang), count: day.due });
            return (
              <div key={day.offsetDays} className="stats-forecast-col" role="listitem" aria-label={label} title={label}>
                <div className="stats-forecast-track">
                  {day.due > 0 && (
                    <div className="stats-forecast-fill" style={{ height: `${(day.due / peak) * 100}%` }} />
                  )}
                </div>
                <span className="stats-bar-lbl">{weekdayInitial(iso, lang)}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted stats-reviews-note">
        {log && log.practiceAnswers > 0
          ? t('stats.reviews.practice', { count: log.practiceAnswers, correct: log.practiceCorrect })
          : t('stats.reviews.note')}
      </p>
      {log && log.gameAnswers > 0 && (
        <p className="muted stats-reviews-note">
          {t('stats.reviews.games', { count: log.gameAnswers, correct: log.gameCorrect })}
        </p>
      )}
    </section>
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
            <span className="stats-card-val">{state.shows.length}</span>
            <span className="stats-card-lbl">{t('stats.card.showsWatched')}</span>
          </div>
        </>
      )}
      {/* Games and player study mode: study time that is neither reading nor watching. */}
      {s.totalStudySeconds > 0 && (
        <>
          <div className="stats-card">
            <span className="stats-card-val">{formatDuration(s.todayStudySeconds)}</span>
            <span className="stats-card-lbl">{t('stats.card.studiedToday')}</span>
          </div>
          <div className="stats-card">
            <span className="stats-card-val">{formatDuration(s.totalStudySeconds)}</span>
            <span className="stats-card-lbl">{t('stats.card.totalStudied')}</span>
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
  /** One day's figures as a sentence — the same string the tooltip carries. */
  const dayLabel = (d: DayStat): string =>
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
      });

  return (
    <>
      <div className="stats-chart">
        {state.summary.recent.map((d) => (
          <div
            key={d.date}
            className="stats-bar-col"
            /* The bar heights are the only OTHER representation of this series,
               so a title alone put every per-day figure behind a mouse hover: a
               plain div takes no accessible name from `title` and has no focus
               stop to reveal it from. `role="img"` names the column without
               adding fourteen tab stops to a chart nobody navigates through. */
            role="img"
            aria-label={dayLabel(d)}
            title={dayLabel(d)}
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
      <ReadingSpeedChart recent={state.summary.recent} />
    </>
  );
}

function ReadingSpeedChart({ recent }: { recent: DayStat[] }) {
  const { t, lang } = useT();
  const days = recent.map(day => ({ ...day, speed: readingCharsPerMinute([day]) }));
  const peak = Math.max(1, ...days.map(day => day.speed ?? 0));
  return (
    <section className="stats-reading-speed" aria-label={t('stats.readingSpeed.title')}>
      <h3>{t('stats.readingSpeed.title')}</h3>
      <p className="muted">{t('stats.readingSpeed.hint')}</p>
      <div className="stats-chart">
        {days.map(day => {
          const label = `${chartDayLabel(day.date, lang)}: ${day.speed === null
            ? t('stats.readingSpeed.noSample')
            : t('stats.readingSpeed.value', { speed: formatNumber(Math.round(day.speed)) })}`;
          return (
            <div className="stats-bar-col" key={day.date} role="img" aria-label={label} title={label}>
              <div className="stats-bar-track">
                <div className="stats-bar-stack">
                  {day.speed !== null && <div className="stats-bar-fill" style={{ height: `${day.speed / peak * 100}%` }} />}
                </div>
              </div>
              <span className="stats-bar-lbl">{weekdayInitial(day.date, lang)}</span>
            </div>
          );
        })}
      </div>
    </section>
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
  }, [state.shows.length]);

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
      {state.shows.map((show) => {
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
