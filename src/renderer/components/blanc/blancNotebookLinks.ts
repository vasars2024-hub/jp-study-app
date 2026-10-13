/**
 * Where a Notebook / note href goes inside Blanc.
 *
 * Study OS's `os:open` bus does not move Blanc's tabs, so hrefs are translated
 * onto the `toolbox:open-tool` / `blanc:select-tab` buses the shell already
 * listens to. Shared by the Notebook panel and Quick Notes; kept in its own
 * tiny module so neither lazy panel pulls in the other.
 */
export const NOTEBOOK_HREF_TO_BLANC_TOOL: Record<string, string> = {
  dictionary: 'dictionary',
  grammar: 'grammar',
  clipboard: 'clipboard',
  resources: 'resources',
  calendar: 'calendar',
  notebook: 'notebook',
  immersion: 'immersion-tracker',
  translate: 'translate',
  notes: 'quick-notes',
};

export const NOTEBOOK_HREF_TO_BLANC_TAB: Record<string, string> = {
  flashcards: 'flashcards',
  anki: 'deck',
  'anki-deck': 'deck',
  statistics: 'stats',
  stats: 'stats',
  media: 'media',
  player: 'media',
  video: 'media',
  'epub-mining': 'mine',
  library: 'read',
  novels: 'read',
};

/** Open `href` in Blanc. False when Blanc has no surface for it (the caller says so). */
export function openBlancHref(href: string): boolean {
  const tool = NOTEBOOK_HREF_TO_BLANC_TOOL[href];
  if (tool) {
    window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: tool }));
    return true;
  }
  const tab = NOTEBOOK_HREF_TO_BLANC_TAB[href];
  if (tab) {
    window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: tab }));
    return true;
  }
  return false;
}
