/**
 * The settings drawer's DOM id, shared by the region and the control that
 * reveals it.
 *
 * It lives in its own leaf module rather than in `settings/ScraperSettingsDrawer`
 * because that component is `lazy()`-loaded from `ScraperApp`, and importing the
 * constant from it would pull the whole settings chunk into the top bar's graph
 * and undo the split. A literal repeated at both call sites would drift silently;
 * `scraperSettingsDisclosure.test.tsx` proves the two still agree.
 */
export const SCRAPER_SETTINGS_DRAWER_ID = 'scr-settings-drawer';
