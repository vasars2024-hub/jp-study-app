/**
 * Where manga provider extensions are managed, reachable from any window.
 *
 * Chapter providers are extensions installed in the media server (Seanime);
 * the app lists them read-only in Scraper > Source Manager > "Seanime provider
 * extensions". A dialog that says "no provider is installed" has to take the
 * reader there, not leave them to find it.
 */
import { openSectionSurface } from '../../sectionSurface';

export function openMangaProviderInventory(): void {
  openSectionSurface('scraper');
  // The Scraper mounts lazily; its `scraper:navigate` listener is live a beat
  // after the window opens — the same hand-off `openVisualizerSettings` uses.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('scraper:navigate', {
      detail: { page: 'sources', settingId: 'provider-inventory' },
    }));
  }, 80);
}
