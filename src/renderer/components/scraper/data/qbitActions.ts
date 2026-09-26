// What a qBittorrent action is reported as, in one place.
//
// The Downloads page and the Torrent Manager both act on transfers; phrasing
// the outcome here keeps "paused" meaning the same thing on both, and makes a
// refusal read as a refusal rather than as the success line it used to be.

import type {
  ScraperQbitActionReport,
  ScraperQbitTorrentAction,
} from '../../../../shared/scraperIpc';
import { sxs, type ScraperTextKey } from '../strings';

export interface ActionNotice {
  text: string;
  bad: boolean;
}

const DONE_KEY: Record<ScraperQbitTorrentAction, ScraperTextKey> = {
  pause: 'transfer.paused',
  resume: 'transfer.resumed',
  recheck: 'transfer.rechecking',
  retry: 'transfer.retrying',
  delete: 'transfer.removedKept',
};

/** A thrown error as one readable line. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The i18n key for a transfer list that could not be read, from the
 * `qbit-list-failed:<code>` main throws (it survives the IPC boundary inside
 * the message). Null for any other error.
 */
export function qbitListFailureKey(error: unknown): string | null {
  const match = /qbit-list-failed:([a-z-]+)/.exec(errorText(error));
  if (!match) return null;
  if (match[1] === 'auth') return 'scrApp.qbitList.auth';
  if (match[1] === 'offline') return 'scrApp.qbitList.offline';
  return 'scrApp.qbitList.service';
}

/** The line a screen shows after `port.qbitAction(...)` answered. */
export function qbitActionNotice(
  action: ScraperQbitTorrentAction,
  report: ScraperQbitActionReport,
  subject: string,
  deleteFiles = false,
): ActionNotice {
  if (!report.ok) {
    const reason = report.failures.map((failure) => failure.reason).filter(Boolean).join(' ');
    return { text: sxs('transfer.failed', reason || subject), bad: true };
  }
  const key = action === 'delete' && deleteFiles ? 'transfer.removedDeleted' : DONE_KEY[action];
  return { text: sxs(key, subject), bad: false };
}
