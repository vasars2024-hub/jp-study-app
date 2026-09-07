import { useEffect, useState } from 'react';
import type { WidgetProps } from './types';
import {
  getSummary,
  formatDuration,
  formatNumber,
  onStatsChanged,
  type StatsSummary,
} from '../stats';
import { loadSaved, onSavedChanged, type SavedWord } from '../savedWords';
import { knowledgeCounts } from '../knownWords';
import { useT } from '../i18n';

/**
 * Live stats summary — refreshes whenever the reader **or the media player** records
 * activity. The shared subscription also handles resets, language changes, midnight,
 * and writes from a separate reader/player window without polling the whole store.
 */
function useStatsSummary(): StatsSummary {
  const [s, setS] = useState<StatsSummary>(() => getSummary());
  useEffect(() => {
    const refresh = () => setS(getSummary());
    return onStatsChanged(refresh);
  }, []);
  return s;
}

// ---------- Study streak ----------
export function StudyStreak() {
  const { t } = useT();
  const s = useStatsSummary();
  return (
    <div className="wgt wgt-stat">
      <div className="wgt-stat-value">{s.streak}</div>
      <div className="wgt-stat-label">{t('widgets.studyStreak.dayStreak')}</div>
      <div className="wgt-stat-sub">{t('widgets.studyStreak.daysStudiedTotal', { count: s.daysActive })}</div>
    </div>
  );
}

/**
 * Below this content height the split layout cannot show a headline, a label, the bar and
 * a legend at once. Measured, not chosen: 34px value + 16px label + 6px bar + 17px legend
 * line + three 6px gaps = 91, plus `.widget-body`'s own 20px of padding. `WidgetFrame`
 * passes `widget.h - 30` for its title bar but **not** that padding — the fact slice 7
 * recorded and this is the second widget to need.
 */
const TODAY_FULL_SPLIT_H = 113;

/**
 * Below this width the two legend entries do not fit on one line and wrap to two, which
 * costs 17px the frame may not have. Measured at the app's own font: "30m read" is 58px,
 * "15m watched" is 77px, plus the 12px gap and 24px of body padding = 171; 200 leaves
 * room for the longer durations a real day produces ("1h 23m watched").
 */
const TODAY_FULL_SPLIT_W = 200;

/**
 * Today's study time — both channels.
 *
 * This widget is named for study time and, until slice 8, showed reading time: an evening
 * mining an episode in the media player left it reading `0s`. The headline is now the sum,
 * which is the number its own label has always promised, and the split bar underneath is
 * what makes the sum honest rather than a merge — you can always see which half it came
 * from. A channel with no time contributes no segment and no legend entry, so a user who
 * only reads sees one bar and one number, not a permanent empty half.
 *
 * At the registry's minimum frame the split drops to durations-only and gives up the
 * label, because the legend is then what explains the headline. The alternative was to
 * raise the widget's minimum size to fit the full layout, which would have made the
 * minimum equal to the default — a widget that cannot be made small is not a small widget.
 */
export function TodayStudyTime({ size }: WidgetProps) {
  const { t } = useT();
  const s = useStatsSummary();
  const read = Math.max(0, s.todaySeconds);
  const watched = Math.max(0, s.todayWatchSeconds);
  const total = read + watched;
  const split = watched > 0;
  const compact =
    split && (size.h < TODAY_FULL_SPLIT_H || size.w < TODAY_FULL_SPLIT_W);

  return (
    <div className="wgt wgt-stat wgt-today">
      <div className="wgt-stat-value">{formatDuration(total)}</div>
      {!compact && (
        <div className="wgt-stat-label">{t('widgets.todayStudyTime.studiedToday')}</div>
      )}
      {/* The split replaces the character line only once the watch channel has something
          to say. A reading-only day keeps the widget exactly as it has always looked. */}
      {split ? (
        <>
          <div
            className="wgt-split"
            role="img"
            aria-label={t('widgets.todayStudyTime.splitAria', {
              read: formatDuration(read),
              watched: formatDuration(watched),
            })}
          >
            {read > 0 && <span className="wgt-split-seg" style={{ flexGrow: read }} />}
            <span className="wgt-split-seg watch" style={{ flexGrow: watched }} />
          </div>
          <div className="wgt-split-legend">
            {read > 0 && (
              <span
                className="wgt-split-key"
                title={t('widgets.todayStudyTime.readValue', {
                  duration: formatDuration(read),
                })}
              >
                <i className="wgt-split-dot" aria-hidden="true" />
                {compact
                  ? formatDuration(read)
                  : t('widgets.todayStudyTime.readValue', { duration: formatDuration(read) })}
              </span>
            )}
            <span
              className="wgt-split-key"
              title={t('widgets.todayStudyTime.watchedValue', {
                duration: formatDuration(watched),
              })}
            >
              <i className="wgt-split-dot watch" aria-hidden="true" />
              {compact
                ? formatDuration(watched)
                : t('widgets.todayStudyTime.watchedValue', {
                    duration: formatDuration(watched),
                  })}
            </span>
          </div>
        </>
      ) : (
        <div className="wgt-stat-sub">
          {t('widgets.todayStudyTime.characters', { count: formatNumber(s.todayChars) })}
        </div>
      )}
    </div>
  );
}

// ---------- Reading progress (14-day sparkline) ----------
export function ReadingProgress() {
  const { t } = useT();
  const s = useStatsSummary();
  const max = Math.max(1, ...s.recent.map((d) => d.seconds));
  return (
    <div className="wgt wgt-reading">
      <div className="wgt-reading-top">
        <span className="wgt-stat-value sm">{formatDuration(s.totalSeconds)}</span>
        <span className="wgt-stat-label">{t('widgets.readingProgress.totalReading')}</span>
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
  const { t } = useT();
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
    { label: t('widgets.vocabProgress.known'), n: counts[3], cls: 'k3' },
    { label: t('widgets.vocabProgress.familiar'), n: counts[2], cls: 'k2' },
    { label: t('widgets.vocabProgress.learning'), n: counts[1], cls: 'k1' },
  ];
  return (
    <div className="wgt wgt-vocab">
      <div className="wgt-reading-top">
        <span className="wgt-stat-value sm">{learned}</span>
        <span className="wgt-stat-label">{t('widgets.vocabProgress.familiarPlusWords')}</span>
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
  const { t } = useT();
  const [saved, setSaved] = useState<SavedWord[]>(() => loadSaved());
  useEffect(() => onSavedChanged(() => setSaved(loadSaved())), []);
  if (saved.length === 0) {
    return (
      <div className="wgt wgt-wotd">
        <div className="wgt-empty">{t('widgets.wordOfTheDay.emptyHint')}</div>
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
