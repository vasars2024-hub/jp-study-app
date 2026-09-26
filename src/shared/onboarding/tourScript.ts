/**
 * The guided tour — declarative script.
 *
 * Phase 9.5 of `docs/IMPLEMENTATION_PLAN_V1.01.md`, audit `T1`, grown into a
 * tour of the app as it is now (round-4 journeys audit). The first version was
 * eight steps about the shell; everything the app has gained since — the study
 * player, sentence decks, the companion, live captions, sprite packs, the
 * browser extension — was only discoverable by stumbling on it.
 *
 * ## Chapters, so it is never one endless tour
 *
 * `basics` runs on a first boot (the desktop, Start, search, the taskbar,
 * shortcuts). When it ends the overlay shows the chapter menu: every other
 * chapter is optional, can be taken in any order, and ends back at the menu.
 * The menu, Settings → Help and the Start menu can all start any chapter again.
 *
 * ## Anchors
 *
 * `anchor` is a CSS selector for a **live** element, and `surface` is what the
 * overlay puts on screen before looking for it: a section window, a Settings
 * card or a Shortcuts row. Every anchor is pinned by `tourAnchors.test.tsx`,
 * which renders the surface the step names and requires the selector to match
 * there — adding a step with a speculative selector fails that test instead of
 * shipping a bubble that points at nothing.
 *
 * A step whose anchor is still missing when the overlay gives up waiting (the
 * surface is popped out into its own window, say) centres the bubble rather
 * than spotlighting empty space, so no step can strand the user.
 *
 * Pure data, in `shared/` on purpose: the step list is the thing worth testing
 * (ordering, i18n key coverage, anchor discipline) and none of that needs a DOM.
 */

/** What the user must do before the step advances. */
export type TourAdvance =
  /** The bubble's own "Next" button — the default, and always available. */
  | 'next'
  /** Advance as soon as the anchored element is clicked, as well as via Next. */
  | 'anchor-click';

/**
 * What the overlay opens before the step shows. Section ids are the desktop's
 * own (`os:open`); Settings pages and card ids are the Settings registry's.
 */
export type TourSurface =
  /** The bare desktop: the Start menu is closed so the taskbar is not covered. */
  | { kind: 'desktop' }
  /** The Start menu, opened. */
  | { kind: 'start' }
  /** An app window, opened (or focused) on the desktop. */
  | { kind: 'section'; section: string }
  /** Settings, on a page, scrolled to a card. */
  | { kind: 'settings'; page: string; settingId?: string }
  /** Settings → Shortcuts with one row's group expanded and the row in view. */
  | { kind: 'shortcut'; id: string };

export type TourChapterId =
  | 'basics'
  | 'watch'
  | 'flashcards'
  | 'reading'
  | 'grammar'
  | 'games'
  | 'files'
  | 'captions'
  | 'companion'
  | 'pets'
  | 'extension'
  | 'settings';

export interface TourChapter {
  id: TourChapterId;
  titleKey: string;
  /** One line under the title in the chapter menu. */
  descKey: string;
  /** An icon name from `renderer/components/Icons.tsx`. */
  icon: string;
}

export interface TourStep {
  /** Stable id. Persisted in progress state, so never renumber — add new ids. */
  id: string;
  chapter: TourChapterId;
  /** CSS selector for the element to spotlight, or `null` for a centred bubble. */
  anchor: string | null;
  /** i18n key for the bubble heading. */
  titleKey: string;
  /** i18n key for the bubble body. */
  bodyKey: string;
  advance: TourAdvance;
  /** Put on screen before the anchor is looked for. */
  surface?: TourSurface;
  /**
   * Settings pages the body names, as `{placeholder}: pageId`. The body text says
   * "Settings → {study}" and the overlay fills it with that page's REAL nav label
   * (`settings.nav.<pageId>`), so the tour can never again name a page that does
   * not exist — it said "Settings → Study" and "Settings → Storage" for pages
   * called "Profile & dictionary" and "Models & dictionaries".
   */
  settingsPages?: Readonly<Record<string, string>>;
  /**
   * Shortcut command ids (Settings → Shortcuts) the step teaches. The overlay
   * shows each one's LIVE chord, so a rebound hotkey is never misreported, and
   * says so when a command has no chord yet.
   */
  hotkeys?: readonly string[];
}

export const TOUR_CHAPTERS: readonly TourChapter[] = [
  { id: 'basics', titleKey: 'tour.chapter.basics', descKey: 'tour.chapter.basics.desc', icon: 'window' },
  { id: 'watch', titleKey: 'tour.chapter.watch', descKey: 'tour.chapter.watch.desc', icon: 'video' },
  { id: 'flashcards', titleKey: 'tour.chapter.flashcards', descKey: 'tour.chapter.flashcards.desc', icon: 'flashcards' },
  { id: 'reading', titleKey: 'tour.chapter.reading', descKey: 'tour.chapter.reading.desc', icon: 'library' },
  { id: 'grammar', titleKey: 'tour.chapter.grammar', descKey: 'tour.chapter.grammar.desc', icon: 'grammar' },
  { id: 'games', titleKey: 'tour.chapter.games', descKey: 'tour.chapter.games.desc', icon: 'dice' },
  { id: 'files', titleKey: 'tour.chapter.files', descKey: 'tour.chapter.files.desc', icon: 'folder' },
  { id: 'captions', titleKey: 'tour.chapter.captions', descKey: 'tour.chapter.captions.desc', icon: 'caption' },
  { id: 'companion', titleKey: 'tour.chapter.companion', descKey: 'tour.chapter.companion.desc', icon: 'keyboard' },
  { id: 'pets', titleKey: 'tour.chapter.pets', descKey: 'tour.chapter.pets.desc', icon: 'heart' },
  { id: 'extension', titleKey: 'tour.chapter.extension', descKey: 'tour.chapter.extension.desc', icon: 'globe' },
  { id: 'settings', titleKey: 'tour.chapter.settings', descKey: 'tour.chapter.settings.desc', icon: 'settings' },
];

const win = (section: string, inner = ''): string =>
  `.fwin[data-section="${section}"]${inner ? ` ${inner}` : ''}`;
const card = (settingId: string): string => `[data-setting-id="${settingId}"]`;
const shortcutRow = (id: string): string => `[data-shortcut-id="${id}"]`;

/**
 * The tour, in order, chapter by chapter.
 *
 * The Reading Lens is taught twice on purpose — once in the basics, because it
 * is a finished system-wide feature bound to a global hotkey that a user who is
 * never told the accelerator cannot find, and again in the companion chapter
 * alongside the other over-any-app actions.
 *
 * The guide is deliberately not a licensed character (the plan's pitfall note:
 * Hatsune Miku is Crypton IP under the Piapro license and must not ship); the
 * tour speaks as the app's own guide and the pets chapter points at the
 * companion packs a user brings themselves.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  // ── Basics: the desktop ─────────────────────────────────────────────────────
  {
    id: 'welcome',
    chapter: 'basics',
    anchor: null,
    titleKey: 'tour.welcome.title',
    bodyKey: 'tour.welcome.body',
    advance: 'next',
    settingsPages: { help: 'help' },
  },
  {
    id: 'start',
    chapter: 'basics',
    anchor: '.os-start-btn',
    titleKey: 'tour.start.title',
    bodyKey: 'tour.start.body',
    advance: 'anchor-click',
    surface: { kind: 'desktop' },
  },
  {
    id: 'start-search',
    chapter: 'basics',
    // The Aero shell's Start menu carries its own search button; either one is the anchor.
    anchor: '.os-start-search, .os-start-aero-search',
    titleKey: 'tour.startSearch.title',
    bodyKey: 'tour.startSearch.body',
    advance: 'next',
    surface: { kind: 'start' },
    hotkeys: ['nav.search', 'nav.palette'],
  },
  {
    id: 'taskbar',
    chapter: 'basics',
    anchor: '.os-taskbar',
    titleKey: 'tour.taskbar.title',
    bodyKey: 'tour.taskbar.body',
    advance: 'next',
    surface: { kind: 'desktop' },
  },
  {
    id: 'desktops',
    chapter: 'basics',
    anchor: '.os-desktop-switches',
    titleKey: 'tour.desktops.title',
    bodyKey: 'tour.desktops.body',
    advance: 'next',
    surface: { kind: 'desktop' },
  },
  {
    id: 'shortcuts',
    chapter: 'basics',
    anchor: card('shortcuts'),
    titleKey: 'tour.shortcuts.title',
    bodyKey: 'tour.shortcuts.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'shortcuts', settingId: 'shortcuts' },
  },
  {
    id: 'lens',
    chapter: 'basics',
    anchor: null,
    titleKey: 'tour.lens.title',
    bodyKey: 'tour.lens.body',
    advance: 'next',
    surface: { kind: 'desktop' },
    hotkeys: ['lens.region'],
  },

  // ── Watch and the study player ─────────────────────────────────────────────
  {
    id: 'watch-import',
    chapter: 'watch',
    anchor: win('player', '.gum-topnav__import'),
    titleKey: 'tour.watch.import.title',
    bodyKey: 'tour.watch.import.body',
    advance: 'next',
    surface: { kind: 'section', section: 'player' },
  },
  {
    id: 'watch-library',
    chapter: 'watch',
    anchor: win('player', '.gum-nav'),
    titleKey: 'tour.watch.library.title',
    bodyKey: 'tour.watch.library.body',
    advance: 'next',
    surface: { kind: 'section', section: 'player' },
  },
  {
    id: 'watch-player',
    chapter: 'watch',
    anchor: win('player', '.gum-content'),
    titleKey: 'tour.watch.player.title',
    bodyKey: 'tour.watch.player.body',
    advance: 'next',
    surface: { kind: 'section', section: 'player' },
    hotkeys: ['video.toggleDualSubs', 'video.mineCurrentLine'],
  },
  {
    id: 'watch-deck',
    chapter: 'watch',
    anchor: win('player', '.gum-content'),
    titleKey: 'tour.watch.deck.title',
    bodyKey: 'tour.watch.deck.body',
    advance: 'next',
    surface: { kind: 'section', section: 'player' },
  },

  // ── Flashcards ──────────────────────────────────────────────────────────────
  {
    id: 'flash-review',
    chapter: 'flashcards',
    anchor: win('flashcards', '.flash-review-setup'),
    titleKey: 'tour.flash.review.title',
    bodyKey: 'tour.flash.review.body',
    advance: 'next',
    surface: { kind: 'section', section: 'flashcards' },
  },
  {
    id: 'flash-practice',
    chapter: 'flashcards',
    anchor: win('flashcards', '.flash-practice'),
    titleKey: 'tour.flash.practice.title',
    bodyKey: 'tour.flash.practice.body',
    advance: 'next',
    surface: { kind: 'section', section: 'flashcards' },
  },
  {
    id: 'flash-import',
    chapter: 'flashcards',
    anchor: win('flashcards', '.deck-import-panel'),
    titleKey: 'tour.flash.import.title',
    bodyKey: 'tour.flash.import.body',
    advance: 'next',
    surface: { kind: 'section', section: 'flashcards' },
  },

  // ── Books, the reader and the dictionary ───────────────────────────────────
  {
    id: 'read-import',
    chapter: 'reading',
    anchor: win('library', '.library .view-head .actions'),
    titleKey: 'tour.read.import.title',
    bodyKey: 'tour.read.import.body',
    advance: 'next',
    surface: { kind: 'section', section: 'library' },
  },
  {
    id: 'read-popup',
    chapter: 'reading',
    anchor: win('library', '.reading-workspace-panel'),
    titleKey: 'tour.read.popup.title',
    bodyKey: 'tour.read.popup.body',
    advance: 'next',
    surface: { kind: 'section', section: 'library' },
  },
  {
    id: 'read-workspace',
    chapter: 'reading',
    anchor: win('library', '.reading-workspace-nav'),
    titleKey: 'tour.read.workspace.title',
    bodyKey: 'tour.read.workspace.body',
    advance: 'next',
    surface: { kind: 'section', section: 'library' },
  },
  {
    id: 'read-dictionary',
    chapter: 'reading',
    anchor: win('dictionary', '.dict-search'),
    titleKey: 'tour.read.dictionary.title',
    bodyKey: 'tour.read.dictionary.body',
    advance: 'next',
    surface: { kind: 'section', section: 'dictionary' },
  },

  // ── Grammar ─────────────────────────────────────────────────────────────────
  {
    id: 'grammar-explorer',
    chapter: 'grammar',
    anchor: win('grammar', '.gram-x'),
    titleKey: 'tour.grammar.explorer.title',
    bodyKey: 'tour.grammar.explorer.body',
    advance: 'next',
    surface: { kind: 'section', section: 'grammar' },
  },
  {
    id: 'grammar-review',
    chapter: 'grammar',
    anchor: win('grammar', '.gram-mode-toggle'),
    titleKey: 'tour.grammar.review.title',
    bodyKey: 'tour.grammar.review.body',
    advance: 'next',
    surface: { kind: 'section', section: 'grammar' },
  },

  // ── Game Arena ──────────────────────────────────────────────────────────────
  {
    id: 'games-list',
    chapter: 'games',
    anchor: win('games', '.game-list'),
    titleKey: 'tour.games.list.title',
    bodyKey: 'tour.games.list.body',
    advance: 'next',
    surface: { kind: 'section', section: 'games' },
  },
  {
    id: 'games-progress',
    chapter: 'games',
    anchor: win('games', '.game-arena-progress'),
    titleKey: 'tour.games.progress.title',
    bodyKey: 'tour.games.progress.body',
    advance: 'next',
    surface: { kind: 'section', section: 'games' },
  },

  // ── Files ───────────────────────────────────────────────────────────────────
  {
    id: 'files-tree',
    chapter: 'files',
    anchor: win('files', '.fa-tree'),
    titleKey: 'tour.files.tree.title',
    bodyKey: 'tour.files.tree.body',
    advance: 'next',
    surface: { kind: 'section', section: 'files' },
  },
  {
    id: 'files-scan',
    chapter: 'files',
    anchor: win('files', '.fa-scan-open'),
    titleKey: 'tour.files.scan.title',
    bodyKey: 'tour.files.scan.body',
    advance: 'next',
    surface: { kind: 'section', section: 'files' },
  },

  // ── Live captions and system audio ─────────────────────────────────────────
  {
    id: 'captions-intro',
    chapter: 'captions',
    anchor: card('live-captions'),
    titleKey: 'tour.captions.intro.title',
    bodyKey: 'tour.captions.intro.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'transcription', settingId: 'live-captions' },
  },
  {
    id: 'captions-mine',
    chapter: 'captions',
    anchor: card('live-captions'),
    titleKey: 'tour.captions.mine.title',
    bodyKey: 'tour.captions.mine.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'transcription', settingId: 'live-captions' },
    hotkeys: ['captions.toggleOverlay', 'captions.mineLine', 'captions.mineRecent'],
  },

  // ── The companion: Gum over any app ─────────────────────────────────────────
  {
    id: 'companion-wheel',
    chapter: 'companion',
    anchor: shortcutRow('companion.wheel'),
    titleKey: 'tour.companion.wheel.title',
    bodyKey: 'tour.companion.wheel.body',
    advance: 'next',
    surface: { kind: 'shortcut', id: 'companion.wheel' },
    hotkeys: ['companion.wheel'],
  },
  {
    id: 'companion-lookup',
    chapter: 'companion',
    anchor: shortcutRow('lens.atCursor'),
    titleKey: 'tour.companion.lookup.title',
    bodyKey: 'tour.companion.lookup.body',
    advance: 'next',
    surface: { kind: 'shortcut', id: 'lens.atCursor' },
    hotkeys: ['lens.atCursor', 'companion.lookupSelection'],
  },
  {
    id: 'companion-card',
    chapter: 'companion',
    anchor: shortcutRow('companion.cardPreview'),
    titleKey: 'tour.companion.card.title',
    bodyKey: 'tour.companion.card.body',
    advance: 'next',
    surface: { kind: 'shortcut', id: 'companion.cardPreview' },
    hotkeys: ['companion.cardPreview', 'companion.mineLast'],
  },
  {
    id: 'companion-lens',
    chapter: 'companion',
    anchor: shortcutRow('lens.region'),
    titleKey: 'tour.companion.lens.title',
    bodyKey: 'tour.companion.lens.body',
    advance: 'next',
    surface: { kind: 'shortcut', id: 'lens.region' },
    hotkeys: ['lens.region', 'lens.repeat'],
  },

  // ── Companions on the desktop ──────────────────────────────────────────────
  {
    id: 'pets-pick',
    chapter: 'pets',
    anchor: card('companions'),
    titleKey: 'tour.pets.pick.title',
    bodyKey: 'tour.pets.pick.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'companions', settingId: 'companions' },
  },
  {
    id: 'pets-import',
    chapter: 'pets',
    anchor: card('companion-packs'),
    titleKey: 'tour.pets.import.title',
    bodyKey: 'tour.pets.import.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'companions', settingId: 'companion-packs' },
  },

  // ── The browser extension ──────────────────────────────────────────────────
  {
    id: 'extension-what',
    chapter: 'extension',
    anchor: card('extension-bridge'),
    titleKey: 'tour.extension.what.title',
    bodyKey: 'tour.extension.what.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'study', settingId: 'extension-bridge' },
  },
  {
    id: 'extension-pair',
    chapter: 'extension',
    anchor: card('extension-bridge'),
    titleKey: 'tour.extension.pair.title',
    bodyKey: 'tour.extension.pair.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'study', settingId: 'extension-bridge' },
  },

  // ── Make it yours ───────────────────────────────────────────────────────────
  {
    id: 'settings-study',
    chapter: 'settings',
    anchor: card('study-language'),
    titleKey: 'tour.settings.study.title',
    bodyKey: 'tour.settings.study.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'study', settingId: 'study-language' },
  },
  {
    id: 'settings-ui',
    chapter: 'settings',
    anchor: card('ui-language'),
    titleKey: 'tour.settings.ui.title',
    bodyKey: 'tour.settings.ui.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'appearance', settingId: 'ui-language' },
  },
  {
    id: 'settings-looks',
    chapter: 'settings',
    anchor: card('theme'),
    titleKey: 'tour.settings.looks.title',
    bodyKey: 'tour.settings.looks.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'appearance', settingId: 'theme' },
  },
  {
    id: 'settings-liquid',
    chapter: 'settings',
    anchor: win('settings', '.fwin-b-liquid'),
    titleKey: 'tour.settings.liquid.title',
    bodyKey: 'tour.settings.liquid.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'appearance', settingId: 'theme' },
  },
  {
    id: 'settings-help',
    chapter: 'settings',
    anchor: card('guided-tour'),
    titleKey: 'tour.settings.help.title',
    bodyKey: 'tour.settings.help.body',
    advance: 'next',
    surface: { kind: 'settings', page: 'help', settingId: 'guided-tour' },
  },
];

/**
 * The chapter menu's place in the persisted progress (`lastStepId`). Not a step:
 * no step may use this id.
 */
export const TOUR_MENU_ID = 'chapters';

/** The chapter's steps, in order. */
export function chapterSteps(chapter: TourChapterId): TourStep[] {
  return TOUR_STEPS.filter((step) => step.chapter === chapter);
}

/** The id of a chapter's first step, or `null` for an unknown chapter. */
export function firstStepOf(chapter: string): string | null {
  return TOUR_STEPS.find((step) => step.chapter === chapter)?.id ?? null;
}

export function isTourChapter(value: unknown): value is TourChapterId {
  return typeof value === 'string' && TOUR_CHAPTERS.some((c) => c.id === value);
}

/** The nav label key of a Settings page — the name the Settings sidebar shows. */
export function settingsPageNameKey(pageId: string): string {
  return `settings.nav.${pageId}`;
}

/** Every i18n key the tour renders — used by the catalog-coverage test. */
export function tourI18nKeys(): string[] {
  const keys: string[] = [];
  for (const chapter of TOUR_CHAPTERS) keys.push(chapter.titleKey, chapter.descKey);
  for (const step of TOUR_STEPS) {
    keys.push(step.titleKey, step.bodyKey);
    for (const page of Object.values(step.settingsPages ?? {})) keys.push(settingsPageNameKey(page));
  }
  keys.push(
    'tour.progressChapter',
    'tour.next',
    'tour.back',
    'tour.skip',
    'tour.chapterDone',
    'tour.done',
    'tour.hotkey.unset',
    'tour.menu.title',
    'tour.menu.body',
    'tour.menu.done',
    'desktop.startMenu.tour',
  );
  return keys;
}
