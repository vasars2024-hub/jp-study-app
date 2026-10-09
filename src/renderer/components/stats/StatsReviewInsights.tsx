/**
 * Review insights: the charts Anki's and jpdb's statistics pages are known for,
 * computed from data the app already keeps — the review log, the deck's own
 * schedules and the daily activity totals. Nothing here records anything new.
 *
 * Every chart is a `StatsBarChart`: a spoken summary on the plot, a legend in
 * text, and the exact figures in a table. The pure arithmetic is
 * `shared/reviewStats.ts`, tested on its own.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadDeck, onDeckChanged, UNKNOWN_BOOK_TITLE, type DeckFlashcard } from '../../flashcardDeck';
import { loadReviewLog, onReviewLogChanged } from '../../reviewLog';
import { getStudyDaysByKey, onStatsChanged } from '../../stats';
import type { ReviewLogEntry } from '../../../shared/reviewLog';
import {
  activityMinutesByDay,
  answerTimeSummary,
  dailyReviewStats,
  deckStats,
  hourlyBreakdown,
  INTERVAL_BUCKETS,
  recallEstimate,
  retentionByInterval,
  retentionRate,
  weeklyRetention,
  type RetentionCell,
} from '../../../shared/reviewStats';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';
import type { UiLang } from '../../../shared/i18n/core';
import StatsBarChart from './StatsBarChart';
import './statsInsights.css';

const RANGES = [30, 90, 365] as const;
const RECALL_BAND_KEYS = [
  'stats2.recall.band0',
  'stats2.recall.band1',
  'stats2.recall.band2',
  'stats2.recall.band3',
  'stats2.recall.band4',
] as const;
type Range = (typeof RANGES)[number];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A local YYYY-MM-DD as the tooltip and table say it ("Thu, Oct 8"), the same
 * format the 14-day chart uses. Local rather than imported: `StatsContent`
 * pulls the whole Statistics page (and its bridges) in with it.
 */
function dayLabel(isoDate: string, lang: UiLang): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(LANG_TAGS[lang], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function deckKeyOf(card: DeckFlashcard): string {
  return `${card.bookId || 'unknown'}::${card.bookTitle || UNKNOWN_BOOK_TITLE}`;
}

function sumCells(cells: RetentionCell[]): RetentionCell {
  return cells.reduce((acc, c) => ({ passed: acc.passed + c.passed, total: acc.total + c.total }), { passed: 0, total: 0 });
}

export default function StatsReviewInsights() {
  const { t, lang } = useT();
  const [entries, setEntries] = useState<ReviewLogEntry[] | null>(null);
  const [deck, setDeck] = useState<DeckFlashcard[]>(() => loadDeck());
  const [statsVersion, setStatsVersion] = useState(0);
  const [range, setRange] = useState<Range>(30);
  // One clock per render pass of the data, so every chart agrees about "today".
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void loadReviewLog()
        .then((rows) => {
          if (!alive) return;
          setEntries(rows);
          setNow(Date.now());
        })
        .catch(() => undefined);
    };
    refresh();
    const offLog = onReviewLogChanged(refresh);
    const offDeck = onDeckChanged(() => setDeck(loadDeck()));
    const offStats = onStatsChanged(() => setStatsVersion((v) => v + 1));
    return () => {
      alive = false;
      offLog();
      offDeck();
      offStats();
    };
  }, []);

  const number = useMemo(() => new Intl.NumberFormat(LANG_TAGS[lang], { maximumFractionDigits: 1 }), [lang]);
  const percent = useMemo(
    () => new Intl.NumberFormat(LANG_TAGS[lang], { style: 'percent', maximumFractionDigits: 0 }),
    [lang],
  );
  const since = now - range * DAY_MS;

  const data = useMemo(() => {
    if (!entries) return null;
    const daily = dailyReviewStats(entries, range, now);
    const weeks = weeklyRetention(entries, Math.max(4, Math.round(range / 7)), now);
    return {
      daily,
      weeks,
      intervals: retentionByInterval(entries, since),
      hours: hourlyBreakdown(entries, since),
      time: answerTimeSummary(entries, since),
      activity: activityMinutesByDay(getStudyDaysByKey(), daily, range, now),
      decks: deckStats(
        deck.map((card) => ({ id: card.id, deckKey: deckKeyOf(card), suspended: card.suspended, srs: card.srs })),
        entries,
        since,
        now,
      ),
      recall: recallEstimate(deck, now),
    };
    // `statsVersion` is the change signal for the daily activity store.
  }, [entries, deck, range, now, since, statsVersion]);

  const reviewsInRange = data ? data.daily.reduce((n, d) => n + d.learning + d.young + d.mature, 0) : 0;

  /** A date axis that names every seventh day, so thirty columns are not a picket fence. */
  const axisFor = (date: string, i: number, count: number): string => (
    (count - 1 - i) % 7 === 0
      ? new Intl.DateTimeFormat(LANG_TAGS[lang], { day: 'numeric', month: 'numeric' }).format(new Date(`${date}T00:00:00`))
      : ''
  );
  const rateText = (cell: RetentionCell): string => {
    const rate = retentionRate(cell);
    return rate === null ? t('stats2.none') : percent.format(rate);
  };
  const bucketLabel = (min: number, max: number): string => (
    !Number.isFinite(max)
      ? t('stats2.interval.bucketOpen', { min })
      : min === max
        ? t('stats2.interval.bucketOne', { min })
        : t('stats2.interval.bucket', { min, max })
  );

  if (!data) return null;

  if (reviewsInRange === 0 && data.decks.every((d) => d.reviews === 0)) {
    return (
      <section className="stats-section stats2-insights" aria-label={t('stats2.title')}>
        <h2>{t('stats2.title')}</h2>
        <p className="muted">{t('stats2.empty')}</p>
      </section>
    );
  }

  const totals = data.daily.reduce(
    (acc, d) => ({ learning: acc.learning + d.learning, young: acc.young + d.young, mature: acc.mature + d.mature }),
    { learning: 0, young: 0, mature: 0 },
  );
  const young = sumCells(data.weeks.map((w) => w.young));
  const mature = sumCells(data.weeks.map((w) => w.mature));
  const busiest = data.hours.reduce((best, h) => (h.reviews > best.reviews ? h : best), data.hours[0]);
  const activityTotal = data.activity.reduce(
    (n, d) => n + d.reading + d.watching + d.listening + d.study + d.reviews,
    0,
  );
  const reviewMinutes = data.daily.reduce((n, d) => n + d.seconds / 60, 0);

  return (
    <section className="stats-section stats2-insights" aria-label={t('stats2.title')}>
      <div className="stats2-head">
        <h2>{t('stats2.title')}</h2>
        <label className="stats2-range">
          <span className="muted">{t('stats2.range.label')}</span>
          <select value={range} onChange={(event) => setRange(Number(event.currentTarget.value) as Range)}>
            {RANGES.map((days) => (
              <option key={days} value={days}>{t('stats2.range.days', { count: days })}</option>
            ))}
          </select>
        </label>
      </div>

      <StatsBarChart
        title={t('stats2.reviews.title')}
        summary={t('stats2.reviews.summary', {
          total: number.format(reviewsInRange),
          days: range,
          learning: number.format(totals.learning),
          young: number.format(totals.young),
          mature: number.format(totals.mature),
        })}
        series={[
          { key: 'learning', label: t('stats2.series.learning') },
          { key: 'young', label: t('stats2.series.young') },
          { key: 'mature', label: t('stats2.series.mature') },
        ]}
        rows={data.daily.map((d, i) => ({
          key: d.date,
          axis: axisFor(d.date, i, data.daily.length),
          label: dayLabel(d.date, lang),
          values: [d.learning, d.young, d.mature],
        }))}
        format={(v) => number.format(v)}
      />

      <StatsBarChart
        title={t('stats2.time.title')}
        summary={data.time.timed > 0
          ? t('stats2.time.summary', {
            minutes: number.format(reviewMinutes),
            days: range,
            average: number.format(data.time.averageSeconds ?? 0),
            timed: number.format(data.time.timed),
          })
          : t('stats2.time.untimed')}
        series={[{ key: 'minutes', label: t('stats2.time.series') }]}
        rows={data.daily.map((d, i) => ({
          key: d.date,
          axis: axisFor(d.date, i, data.daily.length),
          label: dayLabel(d.date, lang),
          values: [d.seconds / 60],
        }))}
        format={(v) => number.format(v)}
      />

      <StatsBarChart
        title={t('stats2.retention.title')}
        summary={t('stats2.retention.summary', {
          young: rateText(young),
          mature: rateText(mature),
          count: number.format(young.total + mature.total),
        })}
        series={[{ key: 'retention', label: t('stats2.retention.series') }]}
        rows={data.weeks.map((w) => {
          const cell = sumCells([w.young, w.mature]);
          return {
            key: w.weekStart,
            axis: '',
            label: t('stats2.retention.week', { date: dayLabel(w.weekStart, lang), count: number.format(cell.total) }),
            values: [(retentionRate(cell) ?? 0) * 100],
          };
        })}
        max={100}
        format={(v) => percent.format(v / 100)}
      />

      <StatsBarChart
        title={t('stats2.interval.title')}
        summary={t('stats2.interval.summary')}
        series={[{ key: 'retention', label: t('stats2.retention.series') }]}
        rows={data.intervals.map((b, i) => ({
          key: String(INTERVAL_BUCKETS[i].min),
          axis: bucketLabel(b.min, b.max),
          label: `${bucketLabel(b.min, b.max)} (${number.format(b.total)})`,
          values: [(retentionRate(b) ?? 0) * 100],
        }))}
        max={100}
        format={(v) => percent.format(v / 100)}
      />

      <StatsBarChart
        title={t('stats2.hourly.title')}
        summary={busiest && busiest.reviews > 0
          ? t('stats2.hourly.summary', { hour: busiest.hour, count: number.format(busiest.reviews) })
          : t('stats2.none')}
        series={[{ key: 'reviews', label: t('stats2.hourly.series') }]}
        rows={data.hours.map((h) => ({
          key: String(h.hour),
          axis: h.hour % 6 === 0 ? String(h.hour) : '',
          label: t('stats2.hourly.hour', { hour: h.hour }),
          values: [h.reviews],
        }))}
        format={(v) => number.format(v)}
      />

      {activityTotal > 0 && (
        <StatsBarChart
          title={t('stats2.activity.title')}
          summary={t('stats2.activity.summary', { minutes: number.format(activityTotal), days: range })}
          series={[
            { key: 'reading', label: t('stats2.activity.reading') },
            { key: 'watching', label: t('stats2.activity.watching') },
            { key: 'listening', label: t('stats2.activity.listening') },
            { key: 'study', label: t('stats2.activity.study') },
            { key: 'reviews', label: t('stats2.activity.reviews') },
          ]}
          rows={data.activity.map((d, i) => ({
            key: d.date,
            axis: axisFor(d.date, i, data.activity.length),
            label: dayLabel(d.date, lang),
            values: [d.reading, d.watching, d.listening, d.study, d.reviews],
          }))}
          format={(v) => number.format(v)}
        />
      )}

      {data.recall.cards > 0 && (
        <StatsBarChart
          title={t('stats2.recall.title')}
          summary={t('stats2.recall.summary', {
            cards: number.format(data.recall.cards),
            average: percent.format(data.recall.average ?? 0),
            known: number.format(Math.round(data.recall.expectedKnown)),
          })}
          series={[{ key: 'cards', label: t('stats2.recall.series') }]}
          rows={data.recall.bands.map((count, i) => ({
            key: String(i),
            axis: t(RECALL_BAND_KEYS[i] ?? RECALL_BAND_KEYS[0]),
            label: t(RECALL_BAND_KEYS[i] ?? RECALL_BAND_KEYS[0]),
            values: [count],
          }))}
          format={(v) => number.format(v)}
        />
      )}

      {data.decks.length > 0 && (
        <div className="stats2-decks">
          <table>
            <caption>{t('stats2.decks.caption', { days: range })}</caption>
            <thead>
              <tr>
                <th scope="col">{t('stats2.decks.col.deck')}</th>
                <th scope="col">{t('stats2.decks.col.cards')}</th>
                <th scope="col">{t('stats2.decks.col.new')}</th>
                <th scope="col">{t('stats2.decks.col.learning')}</th>
                <th scope="col">{t('stats2.decks.col.young')}</th>
                <th scope="col">{t('stats2.decks.col.mature')}</th>
                <th scope="col">{t('stats2.decks.col.suspended')}</th>
                <th scope="col">{t('stats2.decks.col.due')}</th>
                <th scope="col">{t('stats2.decks.col.reviews')}</th>
                <th scope="col">{t('stats2.decks.col.retention')}</th>
              </tr>
            </thead>
            <tbody>
              {data.decks.map((row) => {
                const title = row.deckKey.slice(row.deckKey.indexOf('::') + 2);
                return (
                  <tr key={row.deckKey}>
                    <th scope="row" lang={title === UNKNOWN_BOOK_TITLE ? undefined : 'ja'}>
                      {title === UNKNOWN_BOOK_TITLE ? t('flash.unknownSource') : title}
                    </th>
                    <td>{number.format(row.cards)}</td>
                    <td>{number.format(row.newCards)}</td>
                    <td>{number.format(row.learning)}</td>
                    <td>{number.format(row.young)}</td>
                    <td>{number.format(row.mature)}</td>
                    <td>{number.format(row.suspended)}</td>
                    <td>{number.format(row.dueNow)}</td>
                    <td>{number.format(row.reviews)}</td>
                    <td>{rateText(row.retention)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
