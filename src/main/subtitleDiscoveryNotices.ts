/**
 * The handful of fixable conditions subtitle automation runs into, held once.
 *
 * Automation runs per episode, so anything it reports per episode arrives as a
 * storm: "no translation engine" twenty-six times for one season. These are
 * facts about the app's configuration, not about an episode, so they are raised
 * into one set here and the subtitle panel shows each at most once (and never
 * again after the user dismisses it).
 *
 * Kept in its own module because both discovery (which finds OpenSubtitles has no
 * key, or has spent its quota) and the automation queue (which finds no engine)
 * raise them, and the queue already imports discovery.
 */

import {
  SUBTITLE_AUTO_NOTICES,
  type SubtitleAutoNotice,
  type SubtitleAutoNotices,
} from '../shared/subtitleDiscoveryStatus';

const DAY_MS = 24 * 60 * 60 * 1000;

const raised = new Set<SubtitleAutoNotice>();
let quotaResetAt: number | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a listener's failure is its own */
    }
  }
}

export function raiseSubtitleNotice(id: SubtitleAutoNotice): void {
  if (raised.has(id)) return;
  raised.add(id);
  changed();
}

export function clearSubtitleNotice(id: SubtitleAutoNotice): void {
  if (!raised.delete(id)) return;
  changed();
}

/**
 * OpenSubtitles refused a download on its daily allowance. Until the reset, no
 * further download is attempted — each attempt would count against nothing and
 * only repeat the refusal.
 */
export function noteOpenSubtitlesQuota(resetAt: number | null, now = Date.now()): void {
  quotaResetAt = resetAt && resetAt > now ? resetAt : now + DAY_MS;
  raiseSubtitleNotice('opensubtitles-quota');
}

export function openSubtitlesQuotaActive(now = Date.now()): boolean {
  if (quotaResetAt === null) return false;
  if (now < quotaResetAt) return true;
  quotaResetAt = null;
  clearSubtitleNotice('opensubtitles-quota');
  return false;
}

/**
 * The notices worth showing right now. A raised notice whose condition has since
 * been fixed (a key was added, a model was installed) is not shown: the user
 * fixed it, and telling them again would read as the fix not having worked.
 */
export function activeSubtitleNotices(
  dismissed: readonly string[],
  conditions: { hasOpenSubtitlesKey: boolean; translationAvailable: boolean },
  now = Date.now(),
): SubtitleAutoNotices {
  const quota = openSubtitlesQuotaActive(now);
  const active = SUBTITLE_AUTO_NOTICES.filter((id) => {
    if (!raised.has(id) || dismissed.includes(id)) return false;
    if (id === 'opensubtitles-key-missing') return !conditions.hasOpenSubtitlesKey;
    if (id === 'translation-unavailable') return !conditions.translationAvailable;
    if (id === 'opensubtitles-quota') return quota;
    return true;
  });
  return { active, quotaResetAt: quota ? quotaResetAt : null };
}

export function onSubtitleNoticesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget everything raised in this process. */
export function resetSubtitleNoticesForTests(): void {
  raised.clear();
  quotaResetAt = null;
}
