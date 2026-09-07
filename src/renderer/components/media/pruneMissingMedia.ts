import { confirmDialog } from '../ui/dialogService';
import type { MediaItem } from '../../../shared/types';
import type { TVars } from '../../../shared/i18n/core';

type Translate = (key: string, vars?: TVars) => string;

export type PruneMissingResult = { removed: number; items: MediaItem[] };

/**
 * The one guarded entry point to `media:pruneMissing`, for every host.
 *
 * The handler (`main/media.ts:475`) keeps only the items whose `path` passes
 * `fs.existsSync` and writes the database back, then `rmSync`s their covers and
 * every cached transcode the surviving paths no longer hash to. Notes, watch
 * position and the language profile go with the row, and none of it is
 * recoverable — there is no Recycle Bin on this route and no undo.
 *
 * The reason this needs a confirm rather than a tooltip is that "missing" is not
 * only "deleted". A disconnected external drive, an unmounted share or a renamed
 * folder makes `existsSync` false for every item on it at once, so the single
 * most likely moment for a user to see a large "Missing files" count is exactly
 * the moment the entries are still fine. The confirm says so.
 *
 * Both hosts route through here on purpose. `MediaLibraryActions` and the Media
 * Hub dashboard each called `pruneMedia()` directly and neither asked, which is
 * the per-host drift D137 was: a guard on one surface is not a guard on the
 * action. Returns `null` when the user declines, so callers can tell a refusal
 * apart from a run that removed nothing.
 *
 * `missingCount` is optional because only the dashboard has already probed each
 * path; without it the message names what is destroyed but not how much, which
 * is still a truthful guard.
 */
export function confirmPruneMissingMedia(
  t: Translate,
  missingCount?: number,
): Promise<boolean> {
  return confirmDialog({
    title: t('mediaLib.prune.confirm.title'),
    message: typeof missingCount === 'number'
      ? t('mediaLib.prune.confirm.message', { count: missingCount })
      : t('mediaLib.prune.confirm.messageUnknown'),
    confirmLabel: t('mediaLib.prune.confirm.action'),
    danger: true,
  });
}

/**
 * Ask, then prune. Returns `null` when the user declines, so a refusal is
 * distinguishable from a run that removed nothing.
 *
 * Hosts that need to report their own failure text should call
 * `confirmPruneMissingMedia` and keep `window.api.pruneMedia()` inside their own
 * `try`, so the rejection still reaches their error branch.
 */
export async function confirmAndPruneMissingMedia(
  t: Translate,
  missingCount?: number,
): Promise<PruneMissingResult | null> {
  if (!await confirmPruneMissingMedia(t, missingCount)) return null;
  return window.api.pruneMedia();
}
