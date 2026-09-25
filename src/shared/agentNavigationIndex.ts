/**
 * The deterministic help/settings/command index behind a *fresh* "where is X?".
 *
 * Navigation until now could only answer a question the user had already
 * answered themselves: `resolveAgentNavigation` re-derives its destination from
 * a live `route` context item, so a suggestion existed only when a hand-off had
 * already attached the place. Ask the Agent "where do I change the interface
 * language?" from a cold conversation and there was nothing to resolve.
 *
 * This module is the missing half, and it is deliberately *not* a model call:
 *
 * 1. **The index is a static table.** Every destination below is a section the
 *    allowlist already permits, a Settings page, or a Settings control that is
 *    already a registered guided target. Nothing here can name a place
 *    `agentNavigation.ts` would refuse.
 * 2. **Matching is exact-token, never fuzzy.** A term matches only when every
 *    one of its tokens is present in the query. There is no edit distance, so
 *    "ai" cannot match "said" and the same question always produces the same
 *    answer — which is what lets approval re-run the lookup later and require
 *    the identical result. The one place a substring test is used is a Japanese
 *    or Chinese title, and only there; see "Asking in another language" below.
 * 3. **Ambiguity refuses.** Two equally-good destinations in the same precedence
 *    band return `null` rather than a guess. A wrong window that opens confidently
 *    is worse than no suggestion.
 *
 * ## Asking in another language
 *
 * `terms` are English, exactly like `SETTINGS_REGISTRY.keywords` in the Settings
 * surface this mirrors. They are not the whole story any more, because they could
 * not be: `tokenize` strips every non-ASCII character, so a Russian or Japanese
 * question used to reduce to *no tokens at all* and resolve nothing — adding
 * translated terms alone would not have changed that.
 *
 * So each entry also carries `titleKey`, and a caller may pass the translated
 * catalogs. A non-English query is then matched against the title the UI already
 * renders for that destination, which cannot drift from it by construction. Two
 * rules keep this honest:
 *
 * - **English is never scored this way.** The translated lane skips `en`, so an
 *   English question resolves through the hand-tuned `terms` exactly as before,
 *   byte for byte — asserted in the tests rather than assumed.
 * - **Substring matching is confined to Japanese and Chinese**, which have no
 *   word boundaries to tokenize on. A Cyrillic or Latin title still has to match
 *   whole tokens, so the "ai" ⊄ "said" property survives everywhere it can.
 *
 * `agentNavigationIndex.test.ts` asserts every entry against that registry and
 * against the guided-target allowlist, and the mirror gate holds each `titleKey`
 * to the one its `SETTINGS_REGISTRY` entry uses — so a control that is renamed or
 * removed fails a test instead of silently routing the user somewhere that no
 * longer exists.
 */

import type { DesktopWinSection } from './desktop';
import { FILES_TREE, type FilesCategoryId } from './filesApp/catalog';

export interface AgentNavigationIndexEntry {
  /** An allowlisted section; `settings` for every page and control target. */
  section: DesktopWinSection;
  /** Settings page id — required for a control, optional on its own. */
  page?: string;
  /** Registered guided control id. Always resolves with a visible highlight. */
  controlId?: string;
  /**
   * A Files app category the window opens scoped to (FILES_APP_PLAN, "the
   * Files app registers its categories there"). Only on `section: 'files'`.
   */
  filesScope?: FilesCategoryId;
  /**
   * The i18n key of this destination's own title, copied from the coordinate's
   * `SETTINGS_REGISTRY` entry and held to it by the mirror gate.
   *
   * It exists because `shared` cannot import `renderer`, and it is what lets a
   * question asked in Russian, Japanese or Chinese resolve at all: the index
   * matches a non-English query against the *translated* title the UI already
   * renders, rather than against a second set of hand-written names that would
   * be free to drift from it. Section entries have no key here — their titles
   * come from `AGENT_NAVIGATION_SECTION_LABEL_KEYS`, which already exists.
   */
  titleKey?: string;
  /**
   * Search terms. `terms[0]` is the destination's own English name and scores an
   * extra point, so naming a thing outranks merely mentioning one of its
   * keywords. Multi-word terms match only when every word is present.
   *
   * English only, and deliberately so. These are hand-tuned, and every other
   * language is answered by `titleKey` above instead.
   */
  terms: readonly string[];
}

export interface AgentNavigationIndexResult {
  section: DesktopWinSection;
  page?: string;
  controlId?: string;
  highlight?: true;
  filesScope?: FilesCategoryId;
}

/**
 * Every app window the Agent may route a bare feature name to.
 *
 * Terms are the section's own English command-palette label plus its section id
 * — no invented synonyms. Anything richer belongs in the palette itself, where
 * the whole app can benefit from it rather than only this index.
 */
const SECTION_ENTRIES: readonly AgentNavigationIndexEntry[] = [
  { section: 'agent', titleKey: 'palette.section.agent', terms: ['agent'] },
  { section: 'library', titleKey: 'palette.section.library', terms: ['library'] },
  { section: 'novels', titleKey: 'palette.section.novels', terms: ['novels'] },
  // `terms[0]` is the name a user actually types, which is not always the full
  // palette label: nobody asks for "Reading Finder" by its surname.
  { section: 'reading', titleKey: 'palette.section.reading', terms: ['reading', 'reading finder'] },
  { section: 'dictionary', titleKey: 'palette.section.dictionary', terms: ['dictionary'] },
  { section: 'grammar', titleKey: 'palette.section.grammar', terms: ['grammar'] },
  { section: 'translate', titleKey: 'palette.section.translate', terms: ['translate'] },
  { section: 'player', titleKey: 'palette.section.player', terms: ['media', 'player'] },
  { section: 'video', titleKey: 'palette.section.video', terms: ['video'] },
  { section: 'music', titleKey: 'palette.section.music', terms: ['music'] },
  { section: 'anki', titleKey: 'palette.section.anki', terms: ['anki'] },
  { section: 'flashcards', titleKey: 'palette.section.flashcards', terms: ['flashcards'] },
  { section: 'games', titleKey: 'appShell.popout.games', terms: ['game arena', 'games'] },
  { section: 'stats', titleKey: 'palette.section.stats', terms: ['statistics', 'stats'] },
  { section: 'resources', titleKey: 'palette.section.resources', terms: ['resources'] },
  { section: 'city', titleKey: 'palette.section.city', terms: ['mooncap garden', 'city'] },
  { section: 'musicwidget', titleKey: 'settings.mini.app.musicwidget', terms: ['music widget', 'musicwidget'] },
  { section: 'immersion', titleKey: 'palette.section.immersion', terms: ['immersion'] },
  { section: 'visualnovels', titleKey: 'palette.section.visualnovels', terms: ['visual novels', 'visualnovels'] },
  { section: 'calendar', titleKey: 'palette.section.calendar', terms: ['calendar'] },
  // No bare `settings` section entry: `isAgentNavigationDestination` requires a
  // page for that one section, so "settings" resolves to the Home page below.
  { section: 'youtube', titleKey: 'palette.section.youtube', terms: ['youtube'] },
  { section: 'scraper', titleKey: 'palette.section.scraper', terms: ['scraper'] },
  // The Files app registers here rather than growing a bespoke resolver, so a
  // request for it reaches it through the mechanism every other destination
  // already uses (FILES_APP_PLAN gate 13).
  //
  // `terms` is deliberately just the destination's own word. The richer list
  // this started with — "folders", "explorer", "transcripts", "library files" —
  // is what `agentNavigationIndexMirror` refuses, and it is right to: "library"
  // belongs to the book library and "transcripts" to the surfaces that own
  // them, and an entry that matched those would quietly outscore an established
  // destination. A finder that hijacks the word for the thing being found is
  // worse than one that answers only to its own name.
  // `notebook` is here rather than on a section of its own: gate 7b deleted the
  // Notebook and the Files app absorbed it, so a user who still asks for the
  // notebook by name must land where their material actually is. Dropping the
  // term would have turned a working request into `unknown-section`.
  { section: 'files', titleKey: 'palette.section.files', terms: ['files', 'notebook'] },
];

/** Settings pages, named by their own sidebar label and description. */
const PAGE_ENTRIES: readonly AgentNavigationIndexEntry[] = [
  { section: 'settings', page: 'home', titleKey: 'settings.nav.home', terms: ['settings', 'home', 'quick actions', 'status'] },
  { section: 'settings', page: 'appearance', titleKey: 'settings.nav.appearance', terms: ['appearance', 'themes', 'colors', 'fonts'] },
  { section: 'settings', page: 'wallpaper', titleKey: 'settings.nav.wallpaper', terms: ['wallpaper', 'desktop background'] },
  { section: 'settings', page: 'atmosphere', titleKey: 'settings.nav.atmosphere', terms: ['atmosphere', 'living layer', 'particles', 'lighting'] },
  { section: 'settings', page: 'companions', titleKey: 'settings.nav.companions', terms: ['companions', 'desktop pets'] },
  { section: 'settings', page: 'desktop-layout', titleKey: 'settings.nav.desktopLayout', terms: ['desktop layout', 'icons', 'taskbar', 'session'] },
  { section: 'settings', page: 'shortcuts', titleKey: 'settings.nav.shortcuts', terms: ['shortcuts', 'keyboard', 'mouse', 'bindings'] },
  { section: 'settings', page: 'mini', titleKey: 'settings.nav.mini', terms: ['mini view', 'launcher', 'pop out apps'] },
  { section: 'settings', page: 'lockscreen', titleKey: 'settings.nav.lockscreen', terms: ['lockscreen', 'pin gate'] },
  { section: 'settings', page: 'study', titleKey: 'settings.nav.study', terms: ['profile dictionary', 'profiles', 'dictionaries'] },
  { section: 'settings', page: 'profile-rules', titleKey: 'settings.nav.profileRules', terms: ['mining rules', 'anki profiles'] },
  { section: 'settings', page: 'reading', titleKey: 'settings.nav.reading', terms: ['reading', 'reader typography'] },
  { section: 'settings', page: 'transcription', titleKey: 'settings.nav.transcription', terms: ['transcription', 'whisper device'] },
  { section: 'settings', page: 'scraper', titleKey: 'settings.nav.scraper', terms: ['scraper', 'providers', 'tracking', 'players', 'subtitles'] },
  { section: 'settings', page: 'visualizer', titleKey: 'settings.nav.visualizer', terms: ['visualizer', 'music visuals', 'lyrics'] },
  { section: 'settings', page: 'special', titleKey: 'settings.nav.special', terms: ['special', 'wired', 'aero', 'secret modules'] },
    { section: 'settings', page: 'file-drops', titleKey: 'settings.nav.fileDrops', terms: ['file drops', 'dropped files'] },
  { section: 'settings', page: 'api-keys', titleKey: 'settings.nav.apiKeys', terms: ['api keys', 'keys'] },
  { section: 'settings', page: 'ai', titleKey: 'settings.nav.ai', terms: ['ai settings', 'offline or cloud ai', 'ai limits'] },
  // v1.0 audit 5.2 — `monitors` merged into `display`, so this one row answers
  // for both. The monitor terms are kept rather than dropped: they are how a
  // user asks for this page, and `settings.nav.display(.desc)` names screens and
  // desktops so the mirror test's "words the destination already uses" holds.
  { section: 'settings', page: 'display', titleKey: 'settings.nav.display', terms: ['display', 'zoom', 'motion', 'monitors', 'screens', 'desktops'] },
  { section: 'settings', page: 'motion', titleKey: 'settings.nav.motion', terms: ['motion', 'animation speed', 'effects'] },
  { section: 'settings', page: 'storage', titleKey: 'settings.nav.storage', terms: ['models dictionaries', 'download', 'update', 'remove models'] },
  { section: 'settings', page: 'memory', titleKey: 'settings.nav.memory', terms: ['memory storage', 'usage', 'inventory', 'backups'] },
  { section: 'settings', page: 'help', titleKey: 'settings.nav.help', terms: ['help', 'guided tour'] },
];

/**
 * Every registered guided control, with the terms its own Settings search entry
 * already uses. `terms[0]` is that entry's English title; the rest are its
 * `keywords`, verbatim — the mirror test refuses anything invented here.
 *
 * Three of the 107 declared guided pairs are deliberately absent, and
 * `agentNavigationIndexMirror.test.ts` holds that list so it cannot quietly grow:
 * `display/borderless` is a second id for the `window-chrome` card (already
 * indexed, and it highlights on either id), while `appearance/blanc-mode` and
 * `special/secret-os-leave` are second renderings of a card indexed on its other
 * page. Indexing a duplicate would make every term it shares with the original
 * ambiguous, and ambiguity refuses — so adding them would *remove* answers.
 */
const CONTROL_ENTRIES: readonly AgentNavigationIndexEntry[] = [
  { section: 'settings', page: 'appearance', controlId: 'appearance-preview', titleKey: 'settings.preview.card.heading', terms: ['preview', 'try', 'draft', 'before', 'appearance', 'look'] },
  { section: 'settings', page: 'appearance', controlId: 'ui-language', titleKey: 'search.language', terms: ['language', 'locale', 'i18n', 'english', 'japanese', 'chinese', 'russian', 'interface', 'ui'] },
  { section: 'settings', page: 'appearance', controlId: 'theme', titleKey: 'search.theme', terms: ['theme', 'dark', 'light', 'appearance', 'color scheme'] },
  { section: 'settings', page: 'appearance', controlId: 'accent', titleKey: 'search.accent', terms: ['accent colour', 'accent', 'color', 'colour', 'red', 'personalization'] },
  { section: 'settings', page: 'appearance', controlId: 'typography', titleKey: 'search.typography', terms: ['typography density', 'font', 'density', 'corners', 'typography', 'spacing'] },
  { section: 'settings', page: 'appearance', controlId: 'materials', titleKey: 'search.materials', terms: ['shape materials', 'chrome', 'frosted', 'shadow', 'materials', 'glass'] },
  // Aero-only cards. `aero` is a term of the Special *page*, so it stays out of
  // both of these: two controls claiming it would tie, and a tie refuses.
  { section: 'settings', page: 'appearance', controlId: 'app-border', titleKey: 'settings.appearance.border.title', terms: ['app borders', 'border'] },
  { section: 'settings', page: 'appearance', controlId: 'pillarbox', titleKey: 'settings.appearance.pillarbox.title', terms: ['pillarbox style', 'pillarbox'] },
  { section: 'settings', page: 'appearance', controlId: 'custom-css', titleKey: 'search.customCss', terms: ['custom css', 'css', 'advanced', 'sandbox', 'style'] },
  { section: 'settings', page: 'wallpaper', controlId: 'wallpaper', titleKey: 'search.wallpaper', terms: ['wallpaper', 'background', 'image', 'video', 'live', 'slideshow', 'folder', 'cycle', 'shuffle'] },
  { section: 'settings', page: 'wallpaper', controlId: 'wallpaper-dim', titleKey: 'search.wallpaperDim', terms: ['wallpaper dim', 'dim', 'brightness'] },
  { section: 'settings', page: 'wallpaper', controlId: 'rotation', titleKey: 'search.rotation', terms: ['wallpaper rotation', 'rotation', 'playlist', 'schedule', 'day cycle', 'calendar walls'] },
  { section: 'settings', page: 'wallpaper', controlId: 'mini-wallpaper', titleKey: 'settings.mini.wall.title', terms: ['mini wallpaper', 'mini backdrop', 'craft window', 'app icons', 'mosaic', 'blur'] },
  { section: 'settings', page: 'atmosphere', controlId: 'living-layer', titleKey: 'search.livingLayer', terms: ['living desktop layer', 'living', 'atmosphere', 'environment', 'layer'] },
  // `environment` is a keyword on three entries; only this one is *named* it, so
  // the position-0 bonus is what decides the word rather than an arbitrary tie.
  { section: 'settings', page: 'atmosphere', controlId: 'environment-preset', titleKey: 'settings.atmosphere.environment.title', terms: ['environment', 'environment preset'] },
  { section: 'settings', page: 'atmosphere', controlId: 'lighting', titleKey: 'search.lighting', terms: ['day cycle lighting', 'lighting', 'ambient', 'dawn', 'night', 'wash'] },
  { section: 'settings', page: 'atmosphere', controlId: 'particles', titleKey: 'search.particles', terms: ['particles', 'fireflies', 'snow', 'rain', 'dust', 'intensity', 'density', 'size'] },
  { section: 'settings', page: 'atmosphere', controlId: 'particle-size', titleKey: 'search.particleSize', terms: ['particle size', 'size', 'radius', 'flake size', 'scale'] },
  { section: 'settings', page: 'atmosphere', controlId: 'snow-accumulation', titleKey: 'search.snowAccumulation', terms: ['snow accumulation', 'snow', 'accumulation', 'piles', 'winter'] },
  // `rain` and `snow` are Particles' words and stay there; weather is reached by
  // the two forms only it has.
  { section: 'settings', page: 'atmosphere', controlId: 'weather', titleKey: 'settings.atmosphere.weather.title', terms: ['weather', 'fog', 'clouds'] },
  // `ambient` alone belongs to Lighting, and `audio` to the mining profile rules.
  { section: 'settings', page: 'atmosphere', controlId: 'ambient-audio', titleKey: 'settings.atmosphere.ambientAudio.title', terms: ['ambient audio', 'soundscape', 'ambience'] },
  { section: 'settings', page: 'atmosphere', controlId: 'achievements', titleKey: 'search.achievements', terms: ['achievements', 'streak', 'celebration', 'milestone'] },
  // The Companions copy of "Leave secret OS", not the Special one: the Special
  // page is Advanced-only, so this is the card a user in that state can reach.
  { section: 'settings', page: 'companions', controlId: 'companions-leave-secret', titleKey: 'special.leave.title', terms: ['leave secret os', 'leave secret'] },
  { section: 'settings', page: 'companions', controlId: 'companions', titleKey: 'search.companions', terms: ['companions', 'pets', 'critter', 'buddy', 'shimeji'] },
  { section: 'settings', page: 'companions', controlId: 'companion-activeness', titleKey: 'search.companionActiveness', terms: ['companion speed', 'speed', 'activeness', 'animation', 'walk', 'shimeji', 'pace'] },
  { section: 'settings', page: 'companions', controlId: 'buddy-programmer', titleKey: 'search.buddyProgrammer', terms: ['buddy programmer', 'buddy', 'routine', 'macro', 'command chain', 'program', 'automate', 'companion script'] },
  { section: 'settings', page: 'companions', controlId: 'os-pets', titleKey: 'search.osPets', terms: ['windows desktop pets', 'os desktop', 'overlay', 'host', 'multi-monitor', 'monitors'] },
  { section: 'settings', page: 'companions', controlId: 'trinkets', titleKey: 'companion.trinket.section.title', terms: ['trinkets', 'keepsake', 'collectible'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'icons', titleKey: 'search.icons', terms: ['icons', 'snap', 'grid', 'label', 'desktop'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'icon-recommended', titleKey: 'settings.desktop.preset.title', terms: ['recommended', 'preset', 'layout', 'arrange', 'placement', 'icons', 'desktop'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'taskbar', titleKey: 'search.taskbar', terms: ['taskbar', 'clock', '24h', 'time'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'start-menu', titleKey: 'search.startMenu', terms: ['start menu', 'start', 'menu', 'columns'] },
  { section: 'settings', page: 'desktop-layout', controlId: 'session', titleKey: 'search.session', terms: ['session restore', 'session', 'restore', 'windows', 'launch'] },
  // Bare `hotkey` is already a three-way tie and stays refused; these two are
  // reached by the compound each of them alone owns.
  { section: 'settings', page: 'shortcuts', controlId: 'os-hotkey', titleKey: 'settings.osHotkey.title', terms: ['os hotkey', 'startup helper'] },
  { section: 'settings', page: 'shortcuts', controlId: 'global-lookup', titleKey: 'settings.dict.globalLookup', terms: ['app wide lookup', 'app wide'] },
  { section: 'settings', page: 'shortcuts', controlId: 'shortcuts', titleKey: 'search.shortcuts', terms: ['keyboard shortcuts', 'shortcut', 'keybind', 'hotkey', 'keyboard', 'mouse', 'ctrl', 'binding'] },
  { section: 'settings', page: 'mini', controlId: 'mini-enable', titleKey: 'settings.mini.enable.title', terms: ['mini view', 'mini'] },
  { section: 'settings', page: 'mini', controlId: 'mini-apps', titleKey: 'search.miniApps', terms: ['pinned apps', 'mini apps'] },
  // `routine` belongs to the buddy programmer; only the two-word form is ours.
  { section: 'settings', page: 'mini', controlId: 'mini-routines', titleKey: 'search.miniRoutines', terms: ['mini routines'] },
  { section: 'settings', page: 'mini', controlId: 'mini-look', titleKey: 'settings.mini.look.title', terms: ['mini look'] },
  { section: 'settings', page: 'lockscreen', controlId: 'lockscreen-enable', titleKey: 'search.lockscreen', terms: ['lockscreen', 'lock', 'pin', 'passcode', 'password', 'security', 'login'] },
  { section: 'settings', page: 'lockscreen', controlId: 'lockscreen-pin', titleKey: 'search.lockscreenPin', terms: ['lockscreen passcode', 'pin', 'passcode', 'password', '4 digit', 'lock'] },
  { section: 'settings', page: 'lockscreen', controlId: 'lockscreen-tint', titleKey: 'search.lockscreenTint', terms: ['lockscreen look', 'lockscreen', 'tint', 'look', 'theme'] },
  { section: 'settings', page: 'study', controlId: 'focus-mode', titleKey: 'search.focusMode', terms: ['focus mode', 'focus', 'reader', 'distraction', 'study', 'minimal', 'epub'] },
  { section: 'settings', page: 'study', controlId: 'focus-lock', titleKey: 'search.focusLock', terms: ['focus lock timer', 'focus', 'lock', 'timer', 'pomodoro', 'commit', 'distraction', 'exit'] },
  { section: 'settings', page: 'study', controlId: 'focus-default-tab', titleKey: 'search.focusDefaultTab', terms: ['focus default tab', 'focus', 'tab', 'library', 'dictionary', 'anki', 'default'] },
  { section: 'settings', page: 'study', controlId: 'focus-distractions', titleKey: 'search.focusDistractions', terms: ['focus distractions', 'focus', 'music', 'chrome', 'minimal', 'hide', 'distraction'] },
  { section: 'settings', page: 'study', controlId: 'focus-auto-enter', titleKey: 'search.focusAutoEnter', terms: ['auto enter focus', 'focus', 'launch', 'startup', 'auto', 'enter', 'boot'] },
  // `jlpt` is the study profile's word; `level` and `hsk` are only this card's.
  { section: 'settings', page: 'study', controlId: 'level', titleKey: 'settings.study.level.title', terms: ['level', 'proficiency', 'hsk'] },
  { section: 'settings', page: 'study', controlId: 'game-arena', titleKey: 'search.gameArena', terms: ['game arena', 'minigames', 'mirror writing', 'source language', 'badges', 'xp'] },
  { section: 'settings', page: 'study', controlId: 'profile', titleKey: 'search.profile', terms: ['study profile', 'profile', 'study', 'jlpt'] },
  { section: 'settings', page: 'study', controlId: 'dictionary', titleKey: 'search.dictionary', terms: ['dictionary', 'yomitan', 'lookup'] },
  { section: 'settings', page: 'study', controlId: 'system-dictionary', titleKey: 'settings.sysDict.title', terms: ['popup dictionary everywhere', 'popup dictionary', 'system wide', 'global', 'hotkey', 'shortcut', 'overlay', 'anywhere', 'windows', 'lookup', 'selection', 'clipboard', 'tray'] },
  { section: 'settings', page: 'study', controlId: 'ai-analysis', titleKey: 'settings.analysis.title', terms: ['ai analysis', 'ai', 'ai ocr', 'analysis', 'annotate', 'grammar', 'explanation', 'formality', 'register', 'translation', 'snapshot', 'notebook', 'deck', 'flashcard', 'anki', 'highlight'] },
  { section: 'settings', page: 'study', controlId: 'reading-lens', titleKey: 'settings.lens.title', terms: ['reading lens', 'ocr', 'screen', 'capture', 'region', 'manga', 'game', 'visual novel', 'subtitle', 'overlay', 'in place', 'hotkey', 'anywhere'] },
  { section: 'settings', page: 'study', controlId: 'study-language', titleKey: 'settings.study.lang.title', terms: ['study language', 'study', 'language', 'japanese', 'chinese', 'environment', 'dictionary', 'zh', 'ja'] },
  { section: 'settings', page: 'study', controlId: 'study-language-setup', titleKey: 'settings.study.setup.title', terms: ['setup', 'download', 'cedict', 'chinese', 'dictionary', 'assets'] },
  { section: 'settings', page: 'study', controlId: 'extension-bridge', titleKey: 'settings.extension.title', terms: ['chrome extension', 'chrome', 'extension', 'install', 'pair', 'token', 'bridge', 'load unpacked'] },
  { section: 'settings', page: 'profile-rules', controlId: 'profile-rules', titleKey: 'settings.profileRules.title', terms: ['mining profile rules', 'profile rules', 'mining rules', 'anki profile', 'route', 'match', 'extension', 'epub', 'audio', 'mine'] },
  { section: 'settings', page: 'reading', controlId: 'reading', titleKey: 'search.reading', terms: ['reading settings', 'reading', 'font size', 'epub', 'novel', 'typography'] },
  { section: 'settings', page: 'transcription', controlId: 'whisper', titleKey: 'search.whisper', terms: ['transcription device', 'whisper', 'transcription', 'gpu', 'cpu', 'subtitles'] },
  { section: 'settings', page: 'visualizer', controlId: 'visualizer', titleKey: 'search.visualizer', terms: ['music visualizer', 'visualizer', 'spectrum', 'music', 'fft'] },
  { section: 'settings', page: 'visualizer', controlId: 'lyrics', titleKey: 'search.lyrics', terms: ['lyrics lookup', 'lyrics', 'album', 'search'] },
  { section: 'settings', page: 'special', controlId: 'blanc-mode', titleKey: 'search.blancMode', terms: ['blanc mode', 'blanc', 'toolbox', 'toolbox os', 'minimal', 'plain mode', 'white mode', 'simple shell', 'mode', 'side agent'] },
  { section: 'settings', page: 'special', controlId: 'special-locked', titleKey: 'search.specialLocked', terms: ['special modules locked', 'modules locked'] },
  { section: 'settings', page: 'special', controlId: 'wired-archive', titleKey: 'search.wiredArchive', terms: ['wired archive', 'crt', 'boot replay', 'static', 'terminal ambient'] },
  { section: 'settings', page: 'special', controlId: 'wired-finding-terminal', titleKey: 'search.wiredFinding', terms: ['navi terminal', 'wired finding', 'lyrics', 'shimeji', 'radar', 'surveillance', 'hacker terminal', 'fateburn'] },
  { section: 'settings', page: 'special', controlId: 'wired-arcade', titleKey: 'search.wiredArcade', terms: ['wired games', 'wired arcade'] },
  { section: 'settings', page: 'special', controlId: 'aero-gadget-lab', titleKey: 'search.aeroGadgets', terms: ['aero gadget lab', 'xp', 'vista', 'windows media player', 'msn', 'cmd', 'legacy'] },
  { section: 'settings', page: 'special', controlId: 'aero-arcade', titleKey: 'search.aeroArcade', terms: ['aero games', 'aero arcade'] },
  // `monitors` itself resolves to the Display page (audit 5.2), which is where
  // all four of these now live; each control is named by the phrase only it uses.
  { section: 'settings', page: 'display', controlId: 'monitors-list', titleKey: 'settings.monitors.displays', terms: ['connected displays', 'second monitor'] },
  { section: 'settings', page: 'display', controlId: 'monitors-layout-remap', titleKey: 'settings.monitors.remap', terms: ['remap', 'other screens'] },
  { section: 'settings', page: 'display', controlId: 'monitors-simulated', titleKey: 'settings.monitors.simulated', terms: ['simulated displays', 'simulated', 'fake screens'] },
  { section: 'settings', page: 'display', controlId: 'monitors-reset', titleKey: 'settings.monitors.reset', terms: ['reset display setup', 'forget screens'] },
  // `dropped files` stays with the File drops page: it names the page, not the
  // one card on it that decides where they go.
  { section: 'settings', page: 'file-drops', controlId: 'filedrop-auto', titleKey: 'settings.fileDrops.auto', terms: ['automatic routing', 'routing'] },
  { section: 'settings', page: 'file-drops', controlId: 'filedrop-overrides', titleKey: 'settings.fileDrops.overrides', terms: ['per type destinations', 'overrides', 'file type'] },
  { section: 'settings', page: 'file-drops', controlId: 'filedrop-undo', titleKey: 'settings.fileDrops.undo', terms: ['undo history', 'undo'] },
  { section: 'settings', page: 'file-drops', controlId: 'filedrop-reset', titleKey: 'settings.fileDrops.reset', terms: ['reset drop settings', 'drop settings'] },
  // `borderless` is this same card's second guided id; it highlights on either,
  // so the term below is the whole of that coordinate's coverage.
  { section: 'settings', page: 'display', controlId: 'window-chrome', titleKey: 'search.windowChrome', terms: ['window chrome', 'borderless', 'frameless', 'title bar', 'window', 'chrome', 'fullscreen', 'standard'] },
  { section: 'settings', page: 'display', controlId: 'zoom', titleKey: 'search.zoom', terms: ['app zoom', 'zoom', 'scale', 'size', 'accessibility', 'display'] },
  { section: 'settings', page: 'display', controlId: 'base-font', titleKey: 'search.baseFont', terms: ['base text size', 'font', 'text size', 'bold', 'display', 'typography'] },
  { section: 'settings', page: 'display', controlId: 'contrast', titleKey: 'search.contrast', terms: ['contrast spacing', 'contrast', 'letter spacing', 'underline', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'night-light', titleKey: 'search.nightLight', terms: ['night light', 'night', 'warm', 'blue light', 'evening', 'display'] },
  { section: 'settings', page: 'display', controlId: 'brightness-sat', titleKey: 'search.brightnessSat', terms: ['brightness saturation', 'brightness', 'saturation', 'color', 'display'] },
  { section: 'settings', page: 'display', controlId: 'color-filter', titleKey: 'search.colorFilter', terms: ['color filter', 'grayscale', 'filter', 'color blind', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'transparency', titleKey: 'search.transparency', terms: ['transparency effects', 'transparency', 'blur', 'frosted', 'acrylic', 'performance'] },
  { section: 'settings', page: 'display', controlId: 'focus-ring', titleKey: 'search.focusRing', terms: ['focus indicator', 'focus', 'keyboard', 'outline', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'scrollbars', titleKey: 'search.scrollbars', terms: ['scrollbars', 'scrollbar', 'scroll', 'smooth'] },
  { section: 'settings', page: 'display', controlId: 'pointer', titleKey: 'search.pointer', terms: ['pointer targets', 'pointer', 'cursor', 'touch', 'targets'] },
  { section: 'settings', page: 'display', controlId: 'animation-level', titleKey: 'search.animationLevel', terms: ['motion', 'animation', 'reduce', 'flashes', 'accessibility'] },
  { section: 'settings', page: 'display', controlId: 'reduce-motion', titleKey: 'search.reduceMotion', terms: ['reduce motion', 'motion', 'animation', 'reduce', 'accessibility'] },
  { section: 'settings', page: 'motion', controlId: 'motion-mode', titleKey: 'search.motionMode', terms: ['motion mode', 'motion', 'animation', 'performance', 'disabled', 'accessibility', 'reduce'] },
  { section: 'settings', page: 'motion', controlId: 'motion-velocity', titleKey: 'search.motionVelocity', terms: ['animation velocity', 'animation', 'speed', 'velocity', 'duration', 'slow', 'fast', 'instant'] },
  { section: 'settings', page: 'motion', controlId: 'motion-particles', titleKey: 'search.motionParticles', terms: ['reward particles', 'particles', 'confetti', 'reward', 'celebration', 'badge', 'density'] },
  { section: 'settings', page: 'motion', controlId: 'motion-companion-weight', titleKey: 'search.motionCompanionWeight', terms: ['companion physics weight', 'companion', 'shimeji', 'physics', 'gravity', 'weight', 'drag'] },
  { section: 'settings', page: 'storage', controlId: 'storage-models', titleKey: 'search.storageModels', terms: ['models dictionaries', 'download', 'model', 'models', 'whisper', 'ocr', 'manga ocr', 'tesseract', 'dictionary', 'jmdict', 'cedict', 'pitch accent', 'tatoeba', 'install', 'remove', 'storage', 'disk space'] },
  { section: 'settings', page: 'ai', controlId: 'ai-enabled', titleKey: 'settings.ai.enabled.title', terms: ['use ai features', 'turn off ai', 'disable ai'] },
  { section: 'settings', page: 'ai', controlId: 'ai-engine', titleKey: 'settings.ai.engine.title', terms: ['ai engine', 'offline ai engine', 'cloud ai engine'] },
  { section: 'settings', page: 'ai', controlId: 'ai-provider', titleKey: 'settings.ai.provider.title', terms: ['ai provider', 'cloud provider', 'cloud ai provider'] },
  { section: 'settings', page: 'ai', controlId: 'ai-model', titleKey: 'settings.ai.model.title', terms: ['install ai model', 'offline ai model', 'qwen'] },
  { section: 'settings', page: 'ai', controlId: 'ai-agent', titleKey: 'settings.ai.agent.title', terms: ['enable agent', 'agent model'] },
  { section: 'settings', page: 'ai', controlId: 'ai-schedules', titleKey: 'settings.ai.schedules.title', terms: ['agent schedule', 'scheduled agent tasks', 'automation'] },
  { section: 'settings', page: 'ai', controlId: 'ai-spend', titleKey: 'settings.ai.spend.title', terms: ['spending limit', 'cloud spending', 'monthly limit'] },
  { section: 'settings', page: 'memory', controlId: 'memory', titleKey: 'search.memory', terms: ['memory storage', 'memory', 'storage', 'backup', 'export', 'import', 'clear', 'data', 'quota', 'disk', 'ram', 'particles', 'companions', 'wallpaper', 'settings inventory'] },
  { section: 'settings', page: 'memory', controlId: 'system-memory', titleKey: 'search.systemMemory', terms: ['system memory', 'ram', 'memory', 'cpu', 'uptime', 'system'] },
  { section: 'settings', page: 'memory', controlId: 'storage-usage', titleKey: 'search.storageUsage', terms: ['app storage', 'usage', 'quota', 'disk', 'space', 'used'] },
  { section: 'settings', page: 'memory', controlId: 'storage-inventory', titleKey: 'search.storageInventory', terms: ['data inventory', 'inventory', 'list', 'size', 'indexeddb', 'localstorage'] },
  // Bare `agent` still opens the Agent window: neither term below matches it.
  { section: 'settings', page: 'memory', controlId: 'agent-memory', titleKey: 'search.agentMemory', terms: ['agent memory', 'local agent memory'] },
  { section: 'settings', page: 'memory', controlId: 'agent-history', titleKey: 'search.agentHistory', terms: ['agent history', 'operation history', 'agent operation history', 'what the agent did'] },
  { section: 'settings', page: 'memory', controlId: 'backup', titleKey: 'search.backup', terms: ['backup restore', 'backup', 'export', 'import', 'restore', 'json'] },
  { section: 'settings', page: 'memory', controlId: 'clear-data', titleKey: 'search.clearData', terms: ['clear data', 'clear', 'delete', 'decks', 'csv', 'clipboard', 'lyrics', 'calendar', 'cache'] },
  { section: 'settings', page: 'memory', controlId: 'factory-reset', titleKey: 'search.factoryReset', terms: ['factory reset', 'factory', 'reset', 'wipe', 'erase', 'fresh'] },
];

/**
 * The Files app's categories (audit r2 #7), so "show my books in files" opens
 * the Files window on Books rather than at the root.
 *
 * Every term is the category's own label PLUS "files", as one multi-word term:
 * a bare "books" or "dictionaries" still belongs to the app that owns them (the
 * comment on the `files` section entry above explains why a finder must not
 * hijack the word for the thing being found), and a phrase that names both is
 * unambiguous. The title key is the phrase "<Category> in Files", translated,
 * so a question in another language needs both halves as well.
 */
const FILES_LABEL_WORDS: Readonly<Record<string, string>> = {
  'sources/books': 'books',
  'sources/manga': 'manga',
  'sources/visual-novels': 'visual novels',
  'sources/video': 'video',
  'sources/audio': 'audio',
  'sources/text': 'text',
  'outputs/decks': 'decks',
  'outputs/mined': 'mined cards',
  'outputs/packages': 'packages',
  'outputs/exports': 'exports',
  'outputs/notes': 'notes',
  'outputs/highlights': 'highlights',
  'outputs/drafts': 'drafts',
  'reference/dictionaries': 'dictionaries',
  'reference/models': 'models',
  'reference/artwork': 'artwork',
  'system/memory': 'memory',
  'system/statistics': 'statistics',
  'system/profiles': 'profiles',
  'workspaces/studies': 'study workspaces',
  'workspaces/queue': 'queue',
  'workspaces/acquisitions': 'acquisitions',
};

const FILES_SCOPE_ENTRIES: readonly AgentNavigationIndexEntry[] = FILES_TREE.filter(
  (node) => node.isLeaf && FILES_LABEL_WORDS[node.id],
).map((node) => ({
  section: 'files' as const,
  filesScope: node.id,
  titleKey: `filesApp.agentScope.${node.id.replace('/', '.')}`,
  terms: [`${FILES_LABEL_WORDS[node.id]} files`],
}));

export const AGENT_NAVIGATION_INDEX: readonly AgentNavigationIndexEntry[] = [
  ...SECTION_ENTRIES,
  ...PAGE_ENTRIES,
  ...CONTROL_ENTRIES,
  ...FILES_SCOPE_ENTRIES,
];

/**
 * Pure function words only. Anything that could name a feature — "settings",
 * "motion", "focus", even verbs like "reset" — stays in the query, because the
 * index is full of entries whose real name contains exactly those words.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do',
  'does', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my',
  'of', 'on', 'or', 'please', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'you', 'your',
]);

const MAX_QUERY_CHARS = 400;
const MAX_QUERY_TOKENS = 40;

function tokenize(value: string): string[] {
  return value
    .slice(0, MAX_QUERY_CHARS)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function queryTokens(value: string): Set<string> {
  const out = new Set<string>();
  for (const token of tokenize(value)) {
    if (out.size >= MAX_QUERY_TOKENS) break;
    if (STOPWORDS.has(token)) continue;
    out.add(token);
  }
  return out;
}

/**
 * One token matches another exactly, or across a single trailing plural `s`.
 * Both sides must be long enough for that fold to mean anything — without the
 * length floor, "cs" would match "css" and "a" would match "as".
 */
function tokenMatches(queryToken: string, termToken: string): boolean {
  if (queryToken === termToken) return true;
  if (queryToken.length < 4 && termToken.length < 4) return false;
  return queryToken === `${termToken}s` || termToken === `${queryToken}s`;
}

function termMatches(tokens: ReadonlySet<string>, term: string): boolean {
  const termTokens = tokenize(term);
  if (termTokens.length === 0) return false;
  return termTokens.every((termToken) => {
    for (const token of tokens) if (tokenMatches(token, termToken)) return true;
    return false;
  });
}

/**
 * Section beats control beats page when the evidence is otherwise identical.
 *
 * A bare feature name — "dictionary", "music" — almost always means "take me to
 * that app", and a control is a more specific answer than the page holding it.
 * Ties *inside* a band stay ambiguous; this ladder only separates bands, and it
 * is declared here rather than emerging from the scores so that the ordering is
 * something the tests can state outright.
 */
/**
 * Translated destination titles, keyed by `titleKey`, for every language except
 * English. Supplying `en` here is refused rather than ignored: it would score
 * English questions through a second, un-tuned lane and quietly change answers
 * this index has assertions pinning in place.
 */
export type AgentNavigationTranslatedTitles = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

/** Kana, and the CJK ideograph blocks the four UI languages actually use. */
const CJK = /[぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿]/;

/**
 * Unicode-aware split. Deliberately a second function rather than a loosening of
 * `tokenize`: that one is what every English answer is scored through, and its
 * ASCII-only behaviour is load-bearing for results the tests pin exactly.
 */
function localeTokens(value: string): string[] {
  return value
    .slice(0, MAX_QUERY_CHARS)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Score one translated title against the query, or 0.
 *
 * Japanese and Chinese are matched as a substring because they have no spaces to
 * tokenize on — 「テーマはどこ」 contains 「テーマ」 and no word-splitting rule
 * available here would find that. A two-character floor keeps that from becoming
 * a wildcard. Every other script keeps whole-token matching.
 */
function scoreTitle(
  tokens: readonly string[],
  dense: string,
  title: string,
): number {
  const titleTokens = localeTokens(title);
  if (titleTokens.length === 0) return 0;
  if (CJK.test(title)) {
    const titleDense = titleTokens.join('');
    if (titleDense.length < 2 || !dense.includes(titleDense)) return 0;
    // A CJK title packs roughly a morpheme per character, so length stands in
    // for the word count the English lane squares.
    const units = Math.max(1, Math.ceil(titleDense.length / 2));
    return 2 * units * units + 2;
  }
  const all = titleTokens.every(
    (titleToken) => tokens.some((token) => tokenMatches(token, titleToken)),
  );
  if (!all) return 0;
  // The `+ 2` is the same bonus `terms[0]` earns: a title *is* the destination's
  // own name, never merely one of its keywords.
  return 2 * titleTokens.length * titleTokens.length + 2;
}

function scoreTranslated(
  tokens: readonly string[],
  dense: string,
  entry: AgentNavigationIndexEntry,
  titles: AgentNavigationTranslatedTitles,
): number {
  if (!entry.titleKey) return 0;
  let best = 0;
  for (const lang of Object.keys(titles)) {
    if (lang === 'en') continue;
    const title = titles[lang]?.[entry.titleKey];
    if (typeof title !== 'string' || !title) continue;
    const score = scoreTitle(tokens, dense, title);
    if (score > best) best = score;
  }
  return best;
}

function precedence(entry: AgentNavigationIndexEntry): number {
  if (!entry.page) return 2;
  return entry.controlId ? 1 : 0;
}

function scoreEntry(tokens: ReadonlySet<string>, entry: AgentNavigationIndexEntry): number {
  const seen = new Set<string>();
  let score = 0;
  let namedIt = false;
  for (const [position, term] of entry.terms.entries()) {
    const normalized = tokenize(term).join(' ');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (!termMatches(tokens, term)) continue;
    // Squared, so "popup dictionary" outweighs two unrelated single words that
    // happen to both appear. A longer exact phrase is much stronger evidence.
    const words = normalized.split(' ').length;
    score += 2 * words * words;
    if (position === 0) namedIt = true;
  }
  return score > 0 && namedIt ? score + 2 : score;
}

function destinationOf(entry: AgentNavigationIndexEntry): AgentNavigationIndexResult {
  return {
    section: entry.section,
    ...(entry.page ? { page: entry.page } : {}),
    ...(entry.controlId ? { controlId: entry.controlId, highlight: true as const } : {}),
    ...(entry.filesScope ? { filesScope: entry.filesScope } : {}),
  };
}

function sameDestination(
  left: AgentNavigationIndexResult,
  right: AgentNavigationIndexResult,
): boolean {
  return left.section === right.section
    && left.page === right.page
    && left.controlId === right.controlId
    && left.filesScope === right.filesScope;
}

/**
 * Resolves a free-text question to exactly one destination, or to `null`.
 *
 * `null` is the answer for a query that matches nothing *and* for one that
 * matches two things equally well — the caller cannot tell those apart on
 * purpose, because neither is a destination it may offer.
 */
export function resolveAgentNavigationQuery(
  query: string,
  index: readonly AgentNavigationIndexEntry[] = AGENT_NAVIGATION_INDEX,
  titles?: AgentNavigationTranslatedTitles,
): AgentNavigationIndexResult | null {
  if (typeof query !== 'string') return null;
  const tokens = queryTokens(query);
  // The English lane needs ASCII tokens; the translated lane needs the Unicode
  // ones, and a question in Russian or Japanese produces none of the former. So
  // an empty ASCII tokenization is only a refusal when there is nothing else to
  // try — which is exactly the condition that used to make every non-English
  // question resolve to nothing.
  const localised = titles ? localeTokens(query) : [];
  const dense = localised.join('');
  if (tokens.size === 0 && localised.length === 0) return null;

  const scored: { entry: AgentNavigationIndexEntry; score: number }[] = [];
  for (const entry of index) {
    const score = Math.max(
      scoreEntry(tokens, entry),
      titles ? scoreTranslated(localised, dense, entry, titles) : 0,
    );
    if (score > 0) scored.push({ entry, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score || precedence(b.entry) - precedence(a.entry));

  const [best, runnerUp] = scored;
  const destination = destinationOf(best.entry);
  if (
    runnerUp
    && runnerUp.score === best.score
    && precedence(runnerUp.entry) === precedence(best.entry)
    && !sameDestination(destination, destinationOf(runnerUp.entry))
  ) {
    return null;
  }
  return destination;
}
