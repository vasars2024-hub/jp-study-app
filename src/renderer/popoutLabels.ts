import type { DesktopWinSection } from '../shared/desktop';

/**
 * Sections that may be shown alone in a pop-out window. Mirrors POPOUT_SECTIONS
 * in the main process (src/main.ts). `player`→Media and `city`→Mooncap match the
 * desktop's app labels.
 *
 * The table holds i18n *keys*, not text, and the consumer resolves them at render
 * time (CLAUDE.md §7). Nearly all of them reuse `palette.section.*` — the command
 * palette already names these same sections, and a second set of labels for the
 * same things would be free to drift. `video`/`music` are composed in
 * `popoutLabel` and `musicwidget` is deliberately unlabelled; all three stay as
 * keys of this object because `popoutSection()` uses `in` on it to validate the
 * `?popout=` query.
 *
 * It lives in its own module so the mapping is unit-testable: importing `App.tsx`
 * pulls in the whole desktop shell, so nothing ever tested this table's behaviour.
 */
export const POPOUT_LABEL_KEYS: Partial<Record<DesktopWinSection, string>> = {
  library: 'palette.section.library',
  novels: 'palette.section.novels',
  reading: 'palette.section.reading',
  agent: 'palette.section.agent',
  dictionary: 'palette.section.dictionary',
  grammar: 'palette.section.grammar',
  translate: 'palette.section.translate',
  // Gate 8 deleted the Notebook section, and `notebook: 'Notebook'` went with it —
  // but this object is also `popoutSection()`'s allow-list, so removing the key
  // without adding its successor took the pop-out capability away rather than
  // moving it. `ARGV_OPEN_SECTIONS` (main.ts) already lists 'files', so main would
  // open `?popout=files` and the renderer would refuse to recognise it.
  files: 'palette.section.files',
  visualnovels: 'palette.section.visualnovels',
  // The Watch window's own name (Start, taskbar and title bar all say Watch).
  player: 'palette.section.watch',
  scraper: 'palette.section.scraper',
  // D89: `youtube` was in main's POPOUT_SECTIONS but not here, and this object is the
  // renderer's allow-list — so main opened `?popout=youtube`, `popoutSection()` returned
  // null, and the window rendered the whole desktop again while the original was closed.
  // Exactly the `files` failure the comment above records. `popoutSectionAllowLists.test.ts`
  // keeps the two lists from drifting apart a third time.
  youtube: 'palette.section.youtube',
  video: '',
  music: '',
  musicwidget: '',
  anki: 'palette.section.anki',
  flashcards: 'palette.section.flashcards',
  games: 'appShell.popout.games',
  stats: 'palette.section.stats',
  resources: 'palette.section.resources',
  settings: 'palette.section.settings',
  city: 'palette.section.city',
  immersion: 'palette.section.immersion',
  calendar: 'palette.section.calendar',
};

/** Resolves a pop-out window's title in the active UI language. */
export function popoutLabel(
  translate: (key: string) => string,
  section: DesktopWinSection,
): string {
  if (section === 'video' || section === 'music') {
    return `${translate('mediaCenter.nav.label')} · ${translate(
      section === 'video' ? 'palette.section.video' : 'palette.section.music',
    )}`;
  }
  const key = POPOUT_LABEL_KEYS[section];
  // Three cases, and a `??` fallback used to collapse two of them. An absent
  // entry falls back to the raw id; an entry that is deliberately `''`
  // (musicwidget) must stay empty, because `PopoutChrome` reads a blank label as
  // "icon-only drag strip" and would otherwise title the widget `musicwidget`.
  if (key === undefined) return section;
  return key ? translate(key) : '';
}

/** `?popout=<section>`, validated against the allow-list above. */
export function popoutSectionFromSearch(search: string): DesktopWinSection | null {
  const raw = new URLSearchParams(search).get('popout');
  return raw && raw in POPOUT_LABEL_KEYS ? (raw as DesktopWinSection) : null;
}
