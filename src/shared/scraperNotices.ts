// What the Notifications settings group can actually announce.
//
// The wire shape and the text both live in shared/ for one reason: a system
// notification is rendered by Electron *in main*, and a toast is rendered in the
// renderer. Two surfaces, one process boundary between them — so the text has to
// sit somewhere both can import. `renderer/components/scraper/strings.ts` cannot
// be that place, because src/main must never reach into src/renderer.
//
// The renderer therefore renders `notice.title` / `notice.body` straight off the
// payload rather than composing its own, which keeps the Scraper's "no literal
// in JSX" rule intact and leaves one place for the eventual i18n sweep to find.
//
// `subject` is study content — a series name, a schedule's label. It is never
// translated (CLAUDE.md i18n rule 4) and is passed through verbatim.

import type { ScraperNotificationSettings } from './scraperOutputSettings';
import type { ScrapeJobSummary, ScrapeResult } from './scraperResults';

export type ScraperNoticeKind =
  | 'complete'
  | 'error'
  | 'new-episode'
  | 'schedule-run'
  | 'study-ready'
  /** Only ever produced by the digest window; never asked for directly. */
  | 'digest';

export interface ScraperNotice {
  id: string;
  kind: ScraperNoticeKind;
  title: string;
  body: string;
  /** `notifications.soundEnabled` — whether the surface should make a sound. */
  sound: boolean;
  /** The job or schedule this came from. Empty when there is neither. */
  correlationId: string;
  at: number;
}

/**
 * Which toggle gates which event.
 *
 * Data rather than a switch statement so the mapping itself can be asserted: a
 * notice that fires under the wrong toggle is exactly the failure a user reports
 * as "I turned that off".
 */
export const NOTICE_TOGGLE: Record<
  Exclude<ScraperNoticeKind, 'digest'>,
  keyof ScraperNotificationSettings
> = {
  complete: 'onComplete',
  error: 'onError',
  'new-episode': 'onNewEpisode',
  'schedule-run': 'onScheduleRun',
  'study-ready': 'onStudyReady',
};

export function isNoticeEnabled(
  kind: ScraperNoticeKind,
  settings: ScraperNotificationSettings,
): boolean {
  if (kind === 'digest') return true;
  return settings[NOTICE_TOGGLE[kind]] === true;
}

export interface ScraperNoticeFacts {
  /** Series title, schedule label, or the failure message. Never translated. */
  subject: string;
  /** Episodes found, new episodes, studiable streams. 0 when the kind has none. */
  count: number;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The two lines a notice renders as, on either surface.
 *
 * Deliberately factual: the count is what the run produced, not an adjective
 * about it. A notification that says "Great news!" is a notification a user
 * turns off.
 */
export function describeNotice(
  kind: ScraperNoticeKind,
  facts: ScraperNoticeFacts,
): { title: string; body: string } {
  switch (kind) {
    case 'complete':
      return {
        title: 'Scrape complete',
        body: `${facts.subject} — ${plural(facts.count, 'episode', 'episodes')}.`,
      };
    case 'error':
      return { title: 'Scrape failed', body: facts.subject };
    case 'new-episode':
      return {
        title: 'New episode found',
        body: `${facts.subject} — ${plural(facts.count, 'new episode', 'new episodes')}.`,
      };
    case 'schedule-run':
      return { title: 'Scheduled run started', body: facts.subject };
    case 'study-ready':
      return {
        title: 'Subtitles ready to study',
        body: `${facts.subject} — ${plural(facts.count, 'episode', 'episodes')} with a subtitle track.`,
      };
    default:
      return { title: 'Scraper', body: facts.subject };
  }
}

/**
 * How many of a run's episodes have a subtitle track something could open.
 *
 * A resolved stream's `playback.subtitles` carries real URLs. `EpisodeRow.
 * subtitles` does not — it is what a torrent index advertises about a release,
 * which is evidence that subtitles probably exist somewhere, not a file. Only
 * the first is worth calling "ready to study", and counting the second would
 * make the notification fire on almost every run.
 *
 * Counted per episode rather than per stream: three servers for one episode is
 * one episode you can study.
 */
export function studiableEpisodeCount(result: ScrapeResult): number {
  const episodes = new Set<string>();
  for (const stream of result.streams) {
    const tracks = stream.playback?.subtitles ?? [];
    if (tracks.some((track) => Boolean(track.url))) episodes.add(stream.episodeId);
  }
  return episodes.size;
}

/**
 * Which notices a finished run has earned.
 *
 * Pure, and separate from delivery, so the question "should this have fired?"
 * can be asked of a stored result without a window, a profile or Electron.
 *
 * `previousEpisodeIds` is null when the series has never been scraped before —
 * see `previousEpisodeIds` in main/scraper/history.ts for why that is not the
 * same as an empty set.
 */
export function noticesForFinishedJob(
  summary: ScrapeJobSummary,
  result: ScrapeResult,
  previousEpisodeIds: Set<string> | null,
): { kind: Exclude<ScraperNoticeKind, 'digest'>; facts: ScraperNoticeFacts }[] {
  const subject = summary.titleEn || summary.titleJa || summary.provider;
  const notices: { kind: Exclude<ScraperNoticeKind, 'digest'>; facts: ScraperNoticeFacts }[] = [
    { kind: 'complete', facts: { subject, count: summary.found } },
  ];

  if (previousEpisodeIds) {
    const fresh = result.episodes.filter((episode) => !previousEpisodeIds.has(episode.id)).length;
    if (fresh > 0) notices.push({ kind: 'new-episode', facts: { subject, count: fresh } });
  }

  const studiable = studiableEpisodeCount(result);
  if (studiable > 0) notices.push({ kind: 'study-ready', facts: { subject, count: studiable } });

  return notices;
}

/**
 * One notice for a whole digest window.
 *
 * Grouped by kind rather than listed one per line: the point of a digest is that
 * six finished scrapes are one interruption, and a six-line body is six
 * interruptions in one box.
 */
export function describeDigest(
  items: { kind: ScraperNoticeKind; facts: ScraperNoticeFacts }[],
): { title: string; body: string } {
  const order: ScraperNoticeKind[] = [
    'complete',
    'new-episode',
    'study-ready',
    'schedule-run',
    'error',
  ];
  const counts = new Map<ScraperNoticeKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);

  const parts: string[] = [];
  for (const kind of order) {
    const n = counts.get(kind);
    if (!n) continue;
    switch (kind) {
      case 'complete': parts.push(plural(n, 'scrape complete', 'scrapes complete')); break;
      case 'new-episode': parts.push(plural(n, 'series with new episodes', 'series with new episodes')); break;
      case 'study-ready': parts.push(plural(n, 'series ready to study', 'series ready to study')); break;
      case 'schedule-run': parts.push(plural(n, 'scheduled run', 'scheduled runs')); break;
      case 'error': parts.push(plural(n, 'failure', 'failures')); break;
      default: break;
    }
  }

  return {
    title: `Scraper — ${plural(items.length, 'update', 'updates')}`,
    body: parts.join(' · '),
  };
}
