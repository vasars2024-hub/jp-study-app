/**
 * Notification center grouping (shell2).
 *
 * Two things a flat list of a hundred notices did badly: telling "today" from
 * "last week", and showing the same notice ten times in a row (a failing
 * sync, a watched folder that keeps announcing). Entries are bucketed by the
 * local calendar day they arrived on, and consecutive identical notices within
 * a bucket collapse into one row that carries a count and every id it stands
 * for — so dismissing that row dismisses all of them.
 */
import type { ShellNotification } from '../../notificationStore';

export type NotificationBucket = 'today' | 'yesterday' | 'earlier';

export interface NotificationRow {
  item: ShellNotification;
  /** Every notification this row stands for, newest first. */
  ids: number[];
  count: number;
}

export interface NotificationGroup {
  bucket: NotificationBucket;
  rows: NotificationRow[];
  /** All ids in the bucket, for "clear this group". */
  ids: number[];
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function bucketOf(ts: number, now = Date.now()): NotificationBucket {
  const today = startOfDay(now);
  if (ts >= today) return 'today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (ts >= yesterday.getTime()) return 'yesterday';
  return 'earlier';
}

/** Two notices are "the same" when they would render the same row. */
export function sameNotice(a: ShellNotification, b: ShellNotification): boolean {
  if (a.kind !== b.kind || (a.source ?? '') !== (b.source ?? '')) return false;
  if (a.actionUrl !== b.actionUrl || a.clientAction !== b.clientAction) return false;
  if (a.i18n || b.i18n) {
    return (
      a.i18n?.message === b.i18n?.message &&
      a.i18n?.title === b.i18n?.title &&
      JSON.stringify(a.i18n?.vars ?? {}) === JSON.stringify(b.i18n?.vars ?? {})
    );
  }
  return a.message === b.message && (a.title ?? '') === (b.title ?? '');
}

const ORDER: NotificationBucket[] = ['today', 'yesterday', 'earlier'];

export function groupNotifications(items: readonly ShellNotification[], now = Date.now()): NotificationGroup[] {
  const sorted = [...items].sort((a, b) => b.ts - a.ts || b.id - a.id);
  const byBucket = new Map<NotificationBucket, NotificationGroup>();
  for (const item of sorted) {
    const bucket = bucketOf(item.ts, now);
    let group = byBucket.get(bucket);
    if (!group) {
      group = { bucket, rows: [], ids: [] };
      byBucket.set(bucket, group);
    }
    group.ids.push(item.id);
    const last = group.rows[group.rows.length - 1];
    if (last && sameNotice(last.item, item)) {
      last.ids.push(item.id);
      last.count += 1;
    } else {
      group.rows.push({ item, ids: [item.id], count: 1 });
    }
  }
  return ORDER.map((bucket) => byBucket.get(bucket)).filter((g): g is NotificationGroup => Boolean(g));
}
