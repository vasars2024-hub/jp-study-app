/**
 * D145 — removing a tracked immersion site, guarded once for every host.
 *
 * The ✕ on a site row called `window.api.immersionRemoveSite(id)` directly, from
 * BOTH hosts (`ImmersionContent.tsx` under Study OS and `views/ImmersionView.tsx`
 * under Frutiger Aero), with no confirmation on either. What goes with the row is
 * not the row: `main/immersion/index.ts:230` filters the site out of the store and
 * saves, and an `ImmersionSite` carries `visitCount`, `streakDays`, `totalSeconds`,
 * `totalChars`, `completionPct`, its tags and its favourite flag
 * (`shared/immersion.ts:18`). Re-adding the same URL later mints a fresh entry at
 * zero, so a streak the user has been keeping ends on a misclick — and the ✕ sits
 * immediately beside the button that OPENS the site, which is the control they
 * actually reach for.
 *
 * The guard lives here rather than in either host, for the reason D137 records: a
 * confirm written into the host you happened to find leaves every other host bare,
 * and the two Immersion hosts are already a demonstration of that. `t` is the
 * module-level accessor from `renderer/i18n`, not the hook, because this is called
 * from an event handler rather than during render.
 */
import type { ImmersionSite } from '../../../shared/immersion';
import { t } from '../../i18n';
import { confirmDialog } from '../ui/dialogService';

/**
 * Ask, then remove. Returns whether the removal actually ran, so a caller that
 * wants to close a panel or clear a selection can do it only on a real removal.
 */
export async function removeImmersionSiteWithConfirm(site: ImmersionSite): Promise<boolean> {
  const ok = await confirmDialog({
    title: t('immersion.removeConfirm.title'),
    // The history figures are in the message on purpose. "Remove this site?" is
    // answerable without knowing that a 40-day streak is the thing being removed.
    message: site.visitCount > 0 || site.streakDays > 0
      ? t('immersion.removeConfirm.message', {
        title: site.title || site.url,
        visits: site.visitCount,
        days: site.streakDays,
      })
      : t('immersion.removeConfirm.messageFresh', { title: site.title || site.url }),
    confirmLabel: t('immersion.remove'),
    danger: true,
  });
  if (!ok) return false;
  await window.api.immersionRemoveSite(site.id);
  return true;
}
