import { openSectionSurface } from './sectionSurface';
import { navigateScraperShell, patchScraperShellState } from './scraperShellStore';

/**
 * Opens the Scraper app at a destination, from Settings.
 *
 * The shell state is written FIRST and the section opened second. That order is
 * load-bearing: `ScraperApp` reads `loadScraperShellState()` when it mounts, and
 * its chunk is lazy, so a hand-rolled `os:open` + `setTimeout` races the chunk
 * and loses the destination on first use — audit F22, which cost a working link
 * in the visual-novel panel before it was found. Writing the durable state up
 * front means there is no window in which the target can be missed, whether the
 * Scraper is already mounted or is about to be.
 *
 * The already-mounted case needs no separate route: `patchScraperShellState`
 * dispatches the store's own change event, and `ScraperApp` subscribes to it —
 * so one write covers both a cold mount and a live shell.
 */
export function openScraperSettings(destination: 'profiles' | 'drawer'): void {
  if (destination === 'profiles') {
    navigateScraperShell('profiles');
    patchScraperShellState({ drawerOpen: false });
  } else {
    patchScraperShellState({ drawerOpen: true, drawerCategory: 'network' });
  }
  // Settings can itself be a pop-out, with no desktop os:open listener.
  openSectionSurface('scraper');
}
