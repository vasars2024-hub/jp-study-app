// Review forecast: what the coming week's study load looks like.
//
// Study-native track item 7. The honest data picture matters more here than the
// feature, so it is worth stating plainly:
//
// Local decks have their own persisted two-rating schedule (`localSrs.ts`). The
// Anki interval snapshot (intervals.ts), however, records how long a card's
// current interval is — NOT when it is next due. An interval length cannot be
// turned into a due date without knowing when the card was last reviewed, so
// this module never tries to derive an Anki date from it.
//
// The Anki forecast in this module therefore comes from Anki's own scheduler,
// queried through AnkiConnect with `prop:due=N` searches. Anki decides what is
// due when; we only count. When Anki is not connected there is no Anki forecast
// — the panel says so rather than fabricating one from interval lengths.
//
// This file holds the pure parts (bucketing, summary, local backlog) so they test
// without Electron or a live collection.

/** One day of the forecast. `offsetDays` 0 = today. */
export interface ForecastDay {
  offsetDays: number;
  /** Cards Anki reports due on that day. */
  due: number;
}

/** Result of an Anki due-forecast query. */
export interface DueForecast {
  ok: boolean;
  /** Present when ok is false — shown verbatim, never swallowed. */
  error?: string;
  /** Cards already past due (Anki `prop:due<0`), i.e. the backlog. */
  overdue: number;
  /** Exactly FORECAST_DAYS entries, offset 0..FORECAST_DAYS-1. */
  days: ForecastDay[];
  /**
   * Unseen cards waiting in the collection.
   *
   * These are NOT part of the forecast: `prop:due` does not match new cards,
   * because they have no scheduled date until they are first studied. But they
   * are unambiguously study load — a collection with 151k new cards and 10
   * reviews due today is not "a quiet week" — so the count is reported
   * alongside rather than silently dropped.
   *
   * Optional so a main process without this field cannot fail the shape guard.
   */
  newCards?: number;
  generatedAt: number;
}

export const FORECAST_DAYS = 7;

export function emptyForecast(error?: string): DueForecast {
  return {
    ok: !error,
    error,
    overdue: 0,
    days: Array.from({ length: FORECAST_DAYS }, (_, i) => ({ offsetDays: i, due: 0 })),
    generatedAt: Date.now(),
  };
}

/**
 * Validate an IPC response before trusting it.
 *
 * The declared return type says `DueForecast`, but a renderer can receive
 * something else in practice: the Blanc harness's preload stub resolves
 * `undefined`, and a main process without the `anki:dueForecast` handler would
 * do the same. Without this guard the panel set `forecast` to a falsy value and
 * rendered *neither* the chart nor the error — a blank section with no
 * explanation, which is the one outcome this feature must never produce.
 */
export function isDueForecast(value: unknown): value is DueForecast {
  if (!value || typeof value !== 'object') return false;
  const f = value as Partial<DueForecast>;
  if (typeof f.ok !== 'boolean' || typeof f.overdue !== 'number') return false;
  if (!Array.isArray(f.days)) return false;
  return f.days.every(
    (d) => d && typeof d.offsetDays === 'number' && typeof d.due === 'number',
  );
}

/**
 * How the week reads at a glance.
 *
 * `verdict` is an explicitly heuristic label, and the thresholds below are
 * judgement calls rather than research: they exist so the panel can say
 * something useful, and the panel shows the underlying numbers alongside so a
 * user can disagree with them. `spikeDay` is the more defensible signal, since
 * it is relative to the user's own average rather than an absolute cutoff.
 */
export interface ForecastSummary {
  total: number;
  overdue: number;
  peakDay: number;
  peakCount: number;
  /** Mean cards/day across the forecast window, rounded to one decimal. */
  dailyAverage: number;
  /** Offset of a day more than 2x the average and at least SPIKE_FLOOR — else null. */
  spikeDay: number | null;
  verdict: 'clear' | 'light' | 'steady' | 'heavy';
}

/** A day must clear this many cards before a relative spike is worth flagging. */
const SPIKE_FLOOR = 20;
/** Peak-day thresholds for the verdict label. */
const HEAVY_PEAK = 150;
const STEADY_PEAK = 50;

export function summarizeForecast(forecast: DueForecast): ForecastSummary {
  const days = forecast.days;
  const total = days.reduce((n, d) => n + d.due, 0);
  let peakDay = 0;
  let peakCount = 0;
  for (const d of days) {
    if (d.due > peakCount) {
      peakCount = d.due;
      peakDay = d.offsetDays;
    }
  }
  const dailyAverage = days.length ? Math.round((total / days.length) * 10) / 10 : 0;
  const spikeDay =
    peakCount >= SPIKE_FLOOR && dailyAverage > 0 && peakCount > dailyAverage * 2 ? peakDay : null;

  let verdict: ForecastSummary['verdict'] = 'clear';
  if (peakCount >= HEAVY_PEAK || forecast.overdue >= HEAVY_PEAK) verdict = 'heavy';
  else if (peakCount >= STEADY_PEAK || forecast.overdue >= STEADY_PEAK) verdict = 'steady';
  else if (total > 0 || forecast.overdue > 0) verdict = 'light';

  return {
    total,
    overdue: forecast.overdue,
    peakDay,
    peakCount,
    dailyAverage,
    spikeDay,
    verdict,
  };
}

/** Minimal shape this module needs from a local deck card. */
export interface BacklogCard {
  known?: boolean;
  folder?: string | null;
}

export interface BacklogGroup {
  folder: string;
  total: number;
  unknown: number;
}

export interface LocalBacklog {
  total: number;
  known: number;
  unknown: number;
  /** Per-folder counts, largest unknown first. Unfiled cards group under ''. */
  groups: BacklogGroup[];
}

/**
 * Local deck knowledge rollup. This older panel groups the last review result;
 * Flashcards itself uses the persisted local SRS due time. It remains separate
 * from the Anki forecast because the two schedulers own different cards.
 */
export function localBacklog(cards: BacklogCard[]): LocalBacklog {
  let known = 0;
  const byFolder = new Map<string, BacklogGroup>();
  for (const c of cards) {
    const folder = c.folder ?? '';
    const g = byFolder.get(folder) ?? { folder, total: 0, unknown: 0 };
    g.total += 1;
    if (c.known) known += 1;
    else g.unknown += 1;
    byFolder.set(folder, g);
  }
  const groups = [...byFolder.values()].sort(
    (a, b) => b.unknown - a.unknown || b.total - a.total || a.folder.localeCompare(b.folder),
  );
  return { total: cards.length, known, unknown: cards.length - known, groups };
}

/**
 * Day label for an offset: Today, Tomorrow, then the weekday name.
 *
 * KNOWN ISSUE — this renders in the OS locale, and the first two labels are
 * hardcoded English besides. Its only consumer is `BlancStudyNativePanels.tsx`,
 * and Blanc is deferred and out of scope for the C1 run that found this; the
 * fix also needs catalog keys, which `shared/` cannot reach through `useT()`.
 * Recorded in docs/KNOWN_ISSUES.md rather than half-fixed here.
 */
export function dayLabel(offsetDays: number, from: Date = new Date()): string {
  if (offsetDays === 0) return 'Today';
  if (offsetDays === 1) return 'Tomorrow';
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  // i18n-locale-arg-ignore: Blanc-only consumer, deferred — see doc comment above.
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}
