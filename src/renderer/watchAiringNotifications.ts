/**
 * "A new episode aired" — the airing-schedule job (`main/watchAiring.ts`) says
 * so once per episode of a title being watched; this puts it in the
 * notification centre. Keyed per title and episode, so a second window or a
 * repeat delivery replaces rather than duplicates.
 */

import { notify } from './notificationStore';
import { t } from './i18n';

let installed = false;

export function installWatchAiringNotifications(): void {
  if (installed || typeof window === 'undefined' || !window.api?.onWatchAiringAired) return;
  installed = true;
  window.api.onWatchAiringAired((episodes) => {
    for (const episode of episodes) {
      notify({
        id: `watch-airing:${episode.titleId}:${episode.episode}`,
        title: t('watchAiring.notify.title', { title: episode.title }),
        message: t('watchAiring.notify.body', { episode: episode.episode }),
        kind: 'info',
        source: t('watchAiring.notify.source'),
      });
    }
  });
}
