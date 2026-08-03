// The Notifications settings group, turned into something that interrupts you.
//
// Until this module existed, `notifications.*` was stored, validated and read by
// nobody: a run that finished while the window was behind something else finished
// silently, whatever the eight fields said.
//
// Five events, and each one is a thing this backend can genuinely observe:
//
//   complete      — a run reached 'done'.
//   error         — a run threw. `subject` is the failure message, not a mood.
//   new-episode   — this run's episode ids include ids the previous stored run
//                   for the same series did not have. Compared by id rather than
//                   by count, so a run that finds one new episode and drops one
//                   filler is still a new episode.
//   schedule-run  — the scheduler started an entry, from its timer or "Run now".
//   study-ready   — a resolved stream carries a real subtitle track. Deliberately
//                   *not* `EpisodeRow.subtitles`, which is what a torrent index
//                   advertises about a release: "a release claims Japanese subs"
//                   and "there is a subtitle file the app can study" are not the
//                   same statement, and only the second one is worth waking
//                   someone for.
//
// Delivery is split from the decision so the whole decision half is testable
// without Electron: `notifyScraper` decides, and hands a finished notice to
// whichever channels the profile asked for.

import { Notification } from 'electron';
import type { ScraperNotificationSettings } from '../../shared/scraperOutputSettings';
import {
  describeDigest,
  describeNotice,
  isNoticeEnabled,
  type ScraperNotice,
  type ScraperNoticeFacts,
  type ScraperNoticeKind,
} from '../../shared/scraperNotices';
import { scraperLog } from './logBus';

/** Where an in-app notice goes. Set by index.ts; null in tests until attached. */
export type ScraperNoticeSink = (notice: ScraperNotice) => void;

let sink: ScraperNoticeSink | null = null;

export function setScraperNoticeSink(next: ScraperNoticeSink | null): void {
  sink = next;
}

interface PendingDigest {
  items: { kind: ScraperNoticeKind; facts: ScraperNoticeFacts }[];
  timer: NodeJS.Timeout | null;
  /**
   * The settings the window opened under.
   *
   * A digest can span jobs run under different profiles. Re-reading the channel
   * per item would let one notice arrive as a toast and another as a system
   * banner from the same box, so the window commits to the profile that opened
   * it and says so here rather than in a bug report later.
   */
  settings: ScraperNotificationSettings;
  correlationId: string;
}

let digest: PendingDigest | null = null;
let sequence = 0;

function noticeId(): string {
  sequence += 1;
  return `notice-${Date.now().toString(36)}-${sequence}`;
}

/**
 * Hands a finished notice to the profile's channels.
 *
 * A system notification on a platform that has none is a log line rather than a
 * throw: losing a notification must never fail the run that produced it.
 */
function deliver(notice: ScraperNotice, settings: ScraperNotificationSettings): void {
  const wantsToast = settings.channel === 'toast' || settings.channel === 'both';
  const wantsSystem = settings.channel === 'system' || settings.channel === 'both';

  if (wantsToast) {
    if (sink) sink(notice);
    else scraperLog('debug', 'notify', `No window to show "${notice.title}" in.`);
  }

  if (wantsSystem) {
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: notice.title,
          body: notice.body,
          // `soundEnabled` off must be quiet, not merely quieter.
          silent: !notice.sound,
        }).show();
      } else {
        scraperLog('debug', 'notify', 'This platform has no system notifications.');
      }
    } catch (error) {
      scraperLog('warn', 'notify', `Could not raise a system notification: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }
}

function flushDigest(): void {
  const window = digest;
  digest = null;
  if (!window) return;
  if (window.timer) clearTimeout(window.timer);
  if (!window.items.length) return;

  const { title, body } = describeDigest(window.items);
  deliver(
    {
      id: noticeId(),
      kind: 'digest',
      title,
      body,
      sound: window.settings.soundEnabled,
      correlationId: window.correlationId,
      at: Date.now(),
    },
    window.settings,
  );
}

/** Test seam, and the shutdown path — delivers whatever the window is holding. */
export function flushScraperNoticeDigest(): void {
  flushDigest();
}

export interface NotifyInput extends ScraperNoticeFacts {
  correlationId?: string;
}

/**
 * Raises one event against a profile's notification settings.
 *
 * Returns whether anything was queued or delivered, which is what a test can
 * assert on when the channel is 'none' and there is nothing else to observe.
 */
export function notifyScraper(
  kind: Exclude<ScraperNoticeKind, 'digest'>,
  settings: ScraperNotificationSettings,
  input: NotifyInput,
): boolean {
  if (!isNoticeEnabled(kind, settings)) return false;
  // 'none' is checked after the per-event toggle deliberately: both are "no",
  // and neither should depend on the other's position to mean it.
  if (settings.channel === 'none') return false;

  const facts: ScraperNoticeFacts = { subject: input.subject, count: input.count };
  const correlationId = input.correlationId ?? '';

  if (settings.digestMinutes > 0) {
    if (!digest) {
      digest = {
        items: [],
        timer: null,
        settings: { ...settings },
        correlationId,
      };
      // `unref` so a pending digest cannot hold the process open at quit; the
      // shutdown path flushes explicitly.
      const timer = setTimeout(flushDigest, settings.digestMinutes * 60_000);
      timer.unref?.();
      digest.timer = timer;
    }
    digest.items.push({ kind, facts });
    return true;
  }

  const { title, body } = describeNotice(kind, facts);
  deliver(
    {
      id: noticeId(),
      kind,
      title,
      body,
      sound: settings.soundEnabled,
      correlationId,
      at: Date.now(),
    },
    settings,
  );
  return true;
}

/** Test seam — drops the sink, any open digest window and the id counter. */
export function resetScraperNotifications(): void {
  if (digest?.timer) clearTimeout(digest.timer);
  digest = null;
  sink = null;
  sequence = 0;
}
