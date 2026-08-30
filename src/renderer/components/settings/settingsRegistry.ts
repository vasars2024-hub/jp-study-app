import type { SettingsNavPage, SettingsPageId, SettingsRegistryEntry } from './types';
import { en } from '../../../shared/i18n/catalogs';

// Labels and descriptions here are i18n catalog keys (see shared/i18n/catalogs.ts,
// 'settings.nav.*'), not display text — every consumer must resolve them with
// t() at render time. `en` is imported only to seed search keywords below,
// since the search index still matches on English feature names regardless of
// the active UI language (see the SETTINGS_REGISTRY comment).

/**
 * The two secret shells, as plain ids rather than an import of
 * `theme/frutiger-aero` + `theme/wired-archive`. Those modules register their
 * theme on import and drag in sound packs, wallpaper packs and an icon pack;
 * this file is a data table that the search box, the agent navigation index and
 * several node-side tests all read, so it stays free of side effects.
 * `settingsSearchThemeGate.test.ts` asserts these two strings still equal
 * `AERO_THEME_ID` / `WIRED_ARCHIVE_THEME_ID`, which is where the drift would
 * otherwise hide.
 */
export const AERO_SHELL_THEME = 'frutiger-aero';
export const WIRED_SHELL_THEME = 'wired-archive';
export const SECRET_SHELL_THEMES = [AERO_SHELL_THEME, WIRED_SHELL_THEME];

/** Sidebar pages in display order, grouped for the rail. */
export const SETTINGS_NAV: SettingsNavPage[] = [
  { id: 'home', labelKey: 'settings.nav.home', icon: 'settings', group: '', descKey: 'settings.nav.home.desc' },
  {
    id: 'appearance',
    labelKey: 'settings.nav.appearance',
    icon: 'sparkle',
    group: 'Personalization',
    descKey: 'settings.nav.appearance.desc',
  },
  {
    id: 'wallpaper',
    labelKey: 'settings.nav.wallpaper',
    icon: 'image',
    group: 'Personalization',
    descKey: 'settings.nav.wallpaper.desc',
  },
  {
    id: 'atmosphere',
    labelKey: 'settings.nav.atmosphere',
    icon: 'flame',
    group: 'Personalization',
    descKey: 'settings.nav.atmosphere.desc',
    advanced: true,
  },
  {
    id: 'companions',
    labelKey: 'settings.nav.companions',
    icon: 'heart',
    group: 'Personalization',
    descKey: 'settings.nav.companions.desc',
  },
  {
    id: 'desktop-layout',
    labelKey: 'settings.nav.desktopLayout',
    icon: 'app',
    group: 'Desktop',
    descKey: 'settings.nav.desktopLayout.desc',
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.nav.shortcuts',
    icon: 'command',
    group: 'Desktop',
    descKey: 'settings.nav.shortcuts.desc',
  },
  {
    id: 'mini',
    labelKey: 'settings.nav.mini',
    icon: 'widgets',
    group: 'Desktop',
    descKey: 'settings.nav.mini.desc',
  },
  {
    id: 'lockscreen',
    labelKey: 'settings.nav.lockscreen',
    icon: 'lock',
    group: 'Desktop',
    descKey: 'settings.nav.lockscreen.desc',
  },
  {
    id: 'study',
    labelKey: 'settings.nav.study',
    icon: 'dictionary',
    group: 'Study',
    descKey: 'settings.nav.study.desc',
  },
  {
    id: 'profile-rules',
    labelKey: 'settings.nav.profileRules',
    icon: 'anki',
    group: 'Study',
    descKey: 'settings.nav.profileRules.desc',
  },
  {
    id: 'reading',
    labelKey: 'settings.nav.reading',
    icon: 'novels',
    group: 'Study',
    descKey: 'settings.nav.reading.desc',
  },
  {
    id: 'transcription',
    labelKey: 'settings.nav.transcription',
    icon: 'caption',
    group: 'Study',
    descKey: 'settings.nav.transcription.desc',
    advanced: true,
  },
  {
    id: 'scraper',
    labelKey: 'settings.nav.scraper',
    icon: 'globe',
    group: 'Media',
    descKey: 'settings.nav.scraper.desc',
    advanced: true,
  },
  {
    id: 'visualizer',
    labelKey: 'settings.nav.visualizer',
    icon: 'monitor',
    group: 'Media',
    descKey: 'settings.nav.visualizer.desc',
    advanced: true,
  },
  {
    id: 'special',
    labelKey: 'settings.nav.special',
    icon: 'sparkle',
    group: 'System',
    descKey: 'settings.nav.special.desc',
    // v1.0 audit 5.5 — WIRED and Aero are easter-egg modules, and this was the
    // only System page without the flag its neighbours (`scraper`, `visualizer`)
    // already carry, so it showed in the normal study view.
    advanced: true,
  },
  {
    id: 'monitors',
    labelKey: 'settings.nav.monitors',
    icon: 'monitor',
    group: 'System',
    descKey: 'settings.nav.monitors.desc',
  },
  {
    id: 'file-drops',
    labelKey: 'settings.nav.fileDrops',
    icon: 'download',
    group: 'System',
    descKey: 'settings.nav.fileDrops.desc',
  },
  {
    id: 'api-keys',
    labelKey: 'settings.nav.apiKeys',
    icon: 'lock',
    group: 'System',
    descKey: 'settings.nav.apiKeys.desc',
  },
  {
    id: 'display',
    labelKey: 'settings.nav.display',
    icon: 'eye',
    group: 'System',
    descKey: 'settings.nav.display.desc',
  },
  {
    id: 'motion',
    labelKey: 'settings.nav.motion',
    icon: 'sparkle',
    group: 'System',
    descKey: 'settings.nav.motion.desc',
  },
  {
    id: 'storage',
    labelKey: 'settings.nav.storage',
    icon: 'download',
    group: 'System',
    descKey: 'settings.nav.storage.desc',
  },
  {
    id: 'memory',
    labelKey: 'settings.nav.memory',
    icon: 'folder',
    group: 'System',
    descKey: 'settings.nav.memory.desc',
  },
  // Audit T1: the plan's own file list names a Help section here, as the home
  // for "Replay tour". Without it the tour is unrepeatable once dismissed.
  {
    id: 'help',
    labelKey: 'settings.nav.help',
    icon: 'info',
    group: 'System',
    descKey: 'settings.nav.help.desc',
  },
];

/**
 * Suggestion chips shown when the search box is empty. Reuses each entry's own
 * `titleKey` — clicking a chip sets the query to that translated text, which
 * `searchSettings` then matches against the very same translated title.
 */
export const SETTINGS_SEARCH_SUGGESTIONS = [
  'search.blancMode',
  'search.wallpaper',
  'search.theme',
  'search.language',
  'search.shortcuts',
  'search.particles',
  'search.companions',
  'search.zoom',
  'search.dictionary',
  'search.gameArena',
  'search.customCss',
];

/** Searchable index — maps queries to pages and cards. */
export const SETTINGS_REGISTRY: SettingsRegistryEntry[] = [
  // Pages — reuse SETTINGS_NAV's own keys directly, so a page's search entry
  // and its nav-rail label can never drift apart. Keywords are still seeded
  // from the `en` catalog (literal text), since search keywords stay English
  // regardless of UI language — see the SettingsRegistryEntry comment.
  ...SETTINGS_NAV.filter((p) => p.id !== 'home').map((p) => {
    const label = en[p.labelKey] as string;
    const desc = (p.descKey ? (en[p.descKey] as string) : '') ?? '';
    return {
      id: `page-${p.id}`,
      titleKey: p.labelKey,
      descKey: p.descKey,
      keywords: [label, p.group, desc, p.id].filter(Boolean),
      pageId: p.id,
      group: p.group || 'Settings',
    };
  }),

  // Appearance
  {
    id: 'ui-language',
    titleKey: 'search.language',
    descKey: 'search.language.desc',
    keywords: ['language', 'locale', 'i18n', 'english', 'japanese', 'chinese', 'russian', 'interface', 'ui'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    // v1.0 audit §2.4 — the Appearance draft preview.
    id: 'appearance-preview',
    titleKey: 'settings.preview.card.heading',
    descKey: 'settings.preview.card.description',
    keywords: ['preview', 'try', 'draft', 'before', 'appearance', 'look'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'theme',
    titleKey: 'search.theme',
    descKey: 'search.theme.desc',
    keywords: ['theme', 'dark', 'light', 'appearance', 'color scheme'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'accent',
    titleKey: 'search.accent',
    descKey: 'search.accent.desc',
    keywords: ['accent', 'color', 'colour', 'red', 'personalization'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'typography',
    titleKey: 'search.typography',
    descKey: 'search.typography.desc',
    keywords: ['font', 'density', 'corners', 'typography', 'spacing'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'materials',
    titleKey: 'search.materials',
    descKey: 'search.materials.desc',
    keywords: ['chrome', 'frosted', 'shadow', 'materials', 'glass'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'custom-css',
    titleKey: 'search.customCss',
    descKey: 'search.customCss.desc',
    keywords: ['css', 'custom css', 'advanced', 'sandbox', 'style'],
    pageId: 'appearance',
    group: 'Personalization',
    advanced: true,
  },

  // Special
  {
    id: 'blanc-mode',
    titleKey: 'search.blancMode',
    descKey: 'search.blancMode.desc',
    keywords: [
      'blanc',
      'blanc mode',
      'toolbox',
      'toolbox os',
      'minimal',
      'plain mode',
      'white mode',
      'simple shell',
      'mode',
      'side agent',
    ],
    pageId: 'special',
    group: 'System',
  },
  {
    id: 'special-modules',
    titleKey: 'search.special',
    descKey: 'search.special.desc',
    keywords: ['special', 'secret', 'wired', 'aero', 'terminal', 'navi', 'gadgets', 'lain', 'bonzi', 'fateburn'],
    pageId: 'special',
    group: 'System',
  },
  {
    // Deliberately ungated. Its card renders under `(wired || isWiredDiscovered)`
    // and `wired` is `useWiredMaterials()` — a `data-materials` attribute, not a
    // theme id, so it cannot be resolved to a theme list from source. Gating it
    // on discovery alone would hide it from someone running a WIRED-material
    // shell who has not tripped the lyrics discovery, which is a live user.
    // `l8-searchability.cjs` names it under `conditionalOtherAxis` rather than
    // counting it covered.
    id: 'wired-archive',
    titleKey: 'search.wiredArchive',
    descKey: 'search.wiredArchive.desc',
    keywords: ['wired archive', 'crt', 'boot replay', 'static', 'terminal ambient'],
    pageId: 'special',
    group: 'System',
  },
  {
    id: 'wired-finding-terminal',
    titleKey: 'search.wiredFinding',
    descKey: 'search.wiredFinding.desc',
    keywords: ['wired finding', 'navi terminal', 'lyrics', 'shimeji', 'radar', 'surveillance', 'hacker terminal', 'fateburn'],
    pageId: 'special',
    group: 'System',
    discovered: 'wired',
  },
  {
    id: 'aero-gadget-lab',
    titleKey: 'search.aeroGadgets',
    descKey: 'search.aeroGadgets.desc',
    keywords: ['aero gadget lab', 'xp', 'vista', 'windows media player', 'msn', 'cmd', 'legacy'],
    pageId: 'special',
    group: 'System',
    discovered: 'aero',
  },

  // Wallpaper
  {
    id: 'wallpaper',
    titleKey: 'search.wallpaper',
    descKey: 'search.wallpaper.desc',
    keywords: [
      'wallpaper',
      'background',
      'image',
      'video',
      'live',
      'slideshow',
      'folder',
      'cycle',
      'shuffle',
    ],
    pageId: 'wallpaper',
    group: 'Personalization',
  },
  {
    id: 'wallpaper-dim',
    titleKey: 'search.wallpaperDim',
    descKey: 'search.wallpaperDim.desc',
    keywords: ['dim', 'brightness', 'wallpaper'],
    pageId: 'wallpaper',
    group: 'Personalization',
  },

  // Atmosphere
  {
    id: 'living-layer',
    titleKey: 'search.livingLayer',
    descKey: 'search.livingLayer.desc',
    keywords: ['living', 'atmosphere', 'environment', 'layer'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  // v1.0 audit 1.2 / 1.3: rotation and the Mini backdrop are wallpaper controls
  // and now live on the Wallpaper page, so search must land there too.
  {
    id: 'rotation',
    titleKey: 'search.rotation',
    descKey: 'search.rotation.desc',
    keywords: ['rotation', 'playlist', 'schedule', 'day cycle', 'calendar walls'],
    pageId: 'wallpaper',
    group: 'Personalization',
  },
  {
    id: 'mini-wallpaper',
    titleKey: 'settings.mini.wall.title',
    descKey: 'settings.mini.wall.desc',
    keywords: ['mini wallpaper', 'mini backdrop', 'craft window', 'app icons', 'mosaic', 'blur'],
    pageId: 'wallpaper',
    group: 'Personalization',
  },
  {
    id: 'particles',
    titleKey: 'search.particles',
    descKey: 'search.particles.desc',
    keywords: ['particles', 'fireflies', 'snow', 'rain', 'dust', 'intensity', 'density', 'size'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'particle-size',
    titleKey: 'search.particleSize',
    descKey: 'search.particleSize.desc',
    keywords: ['particle size', 'size', 'radius', 'flake size', 'scale'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'snow-accumulation',
    titleKey: 'search.snowAccumulation',
    descKey: 'search.snowAccumulation.desc',
    keywords: ['snow', 'accumulation', 'piles', 'winter'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'lighting',
    titleKey: 'search.lighting',
    descKey: 'search.lighting.desc',
    keywords: ['lighting', 'ambient', 'dawn', 'night', 'wash'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'achievements',
    titleKey: 'search.achievements',
    descKey: 'search.achievements.desc',
    keywords: ['achievements', 'streak', 'celebration', 'milestone'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },

  // Companions
  {
    id: 'companions',
    titleKey: 'search.companions',
    descKey: 'search.companions.desc',
    keywords: ['companions', 'pets', 'critter', 'buddy', 'shimeji'],
    pageId: 'companions',
    group: 'Personalization',
  },
  {
    id: 'companion-activeness',
    titleKey: 'search.companionActiveness',
    descKey: 'search.companionActiveness.desc',
    keywords: ['speed', 'activeness', 'animation', 'walk', 'shimeji', 'pace'],
    pageId: 'companions',
    group: 'Personalization',
  },
  {
    id: 'buddy-programmer',
    titleKey: 'search.buddyProgrammer',
    descKey: 'search.buddyProgrammer.desc',
    keywords: [
      'buddy',
      'routine',
      'macro',
      'command chain',
      'program',
      'automate',
      'companion script',
    ],
    pageId: 'companions',
    group: 'Personalization',
  },
  {
    id: 'os-pets',
    titleKey: 'search.osPets',
    descKey: 'search.osPets.desc',
    keywords: ['os desktop', 'overlay', 'host', 'multi-monitor', 'monitors'],
    pageId: 'companions',
    group: 'Personalization',
  },

  // Desktop layout
  {
    id: 'icons',
    titleKey: 'search.icons',
    descKey: 'search.icons.desc',
    keywords: ['icons', 'snap', 'grid', 'label', 'desktop'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'icon-recommended',
    titleKey: 'settings.desktop.preset.title',
    descKey: 'settings.desktop.preset.desc',
    keywords: ['recommended', 'preset', 'layout', 'arrange', 'placement', 'icons', 'desktop'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'taskbar',
    titleKey: 'search.taskbar',
    descKey: 'search.taskbar.desc',
    keywords: ['taskbar', 'clock', '24h', 'time'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'start-menu',
    titleKey: 'search.startMenu',
    descKey: 'search.startMenu.desc',
    keywords: ['start', 'menu', 'columns'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'session',
    titleKey: 'search.session',
    descKey: 'search.session.desc',
    keywords: ['session', 'restore', 'windows', 'launch'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },

  // Shortcuts
  {
    id: 'shortcuts',
    titleKey: 'search.shortcuts',
    descKey: 'search.shortcuts.desc',
    keywords: ['shortcut', 'keybind', 'hotkey', 'keyboard', 'mouse', 'ctrl', 'binding'],
    pageId: 'shortcuts',
    group: 'Desktop',
  },

  // Lockscreen
  {
    id: 'lockscreen-enable',
    titleKey: 'search.lockscreen',
    descKey: 'search.lockscreen.desc',
    keywords: ['lock', 'lockscreen', 'pin', 'passcode', 'password', 'security', 'login'],
    pageId: 'lockscreen',
    group: 'Desktop',
  },
  {
    id: 'lockscreen-pin',
    titleKey: 'search.lockscreenPin',
    descKey: 'search.lockscreenPin.desc',
    keywords: ['pin', 'passcode', 'password', '4 digit', 'lock'],
    pageId: 'lockscreen',
    group: 'Desktop',
  },
  {
    id: 'lockscreen-tint',
    titleKey: 'search.lockscreenTint',
    descKey: 'search.lockscreenTint.desc',
    keywords: ['lockscreen', 'tint', 'look', 'theme'],
    pageId: 'lockscreen',
    group: 'Desktop',
  },

  // Study
  {
    id: 'profile',
    titleKey: 'search.profile',
    descKey: 'search.profile.desc',
    keywords: ['profile', 'study', 'jlpt'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'dictionary',
    titleKey: 'search.dictionary',
    descKey: 'search.dictionary.desc',
    keywords: ['dictionary', 'yomitan', 'lookup'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'system-dictionary',
    titleKey: 'settings.sysDict.title',
    descKey: 'settings.sysDict.desc',
    keywords: [
      'popup dictionary',
      'system wide',
      'global',
      'hotkey',
      'shortcut',
      'overlay',
      'anywhere',
      'windows',
      'lookup',
      'selection',
      'clipboard',
      'tray',
    ],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'ai-analysis',
    titleKey: 'settings.analysis.title',
    descKey: 'settings.analysis.desc',
    keywords: [
      'ai',
      'ai ocr',
      'analysis',
      'annotate',
      'grammar',
      'explanation',
      'formality',
      'register',
      'translation',
      'snapshot',
      'notebook',
      'deck',
      'flashcard',
      'anki',
      'highlight',
    ],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'reading-lens',
    titleKey: 'settings.lens.title',
    descKey: 'settings.lens.desc',
    keywords: [
      'reading lens',
      'ocr',
      'screen',
      'capture',
      'region',
      'manga',
      'game',
      'visual novel',
      'subtitle',
      'overlay',
      'in place',
      'hotkey',
      'anywhere',
    ],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'game-arena',
    titleKey: 'search.gameArena',
    descKey: 'search.gameArena.desc',
    keywords: ['game arena', 'minigames', 'mirror writing', 'source language', 'badges', 'xp'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'reading',
    titleKey: 'search.reading',
    descKey: 'search.reading.desc',
    keywords: ['reading', 'font size', 'epub', 'novel', 'typography'],
    pageId: 'reading',
    group: 'Study',
  },
  {
    id: 'whisper',
    titleKey: 'search.whisper',
    descKey: 'search.whisper.desc',
    keywords: ['whisper', 'transcription', 'gpu', 'cpu', 'subtitles'],
    pageId: 'transcription',
    group: 'Study',
  },

  {
    id: 'unified-search',
    titleKey: 'unifiedSearch.title',
    descKey: 'unifiedSearch.desc',
    keywords: [
      'unified search',
      'multi source',
      'multi-source',
      'tachiyomi',
      'search bar',
      'providers',
      'parallel',
      'sources',
      'coordinator',
    ],
    pageId: 'scraper',
    group: 'Media',
    advanced: true,
  },
  {
    id: 'media-providers',
    titleKey: 'mediaProvider.title',
    descKey: 'mediaProvider.desc',
    keywords: [
      'media providers',
      'identity',
      'tracking',
      'drama',
      'movie',
      'capability',
      'library',
      'offline',
      'metadata',
    ],
    pageId: 'scraper',
    group: 'Media',
    advanced: true,
  },
  {
    id: 'subtitle-providers',
    titleKey: 'subtitle.title',
    descKey: 'subtitle.desc',
    keywords: ['subtitles', 'subtitle provider', 'language', 'quality', 'timing', 'offline'],
    pageId: 'scraper',
    group: 'Media',
    advanced: true,
  },
  {
    id: 'connection-profiles',
    titleKey: 'connection.title',
    descKey: 'connection.desc',
    keywords: [
      'connection profiles',
      'inheritance',
      'presets',
      'monitoring',
      'logging',
      'diagnostics',
      'queue',
      'health check',
      'comparison',
      'per-site',
    ],
    pageId: 'scraper',
    group: 'Media',
    advanced: true,
  },
  {
    id: 'scraper-network',
    titleKey: 'settings.nav.scraper',
    descKey: 'settings.nav.scraper.desc',
    keywords: [
      'scraper',
      'network',
      'user agent',
      'headers',
      'cookies',
      'proxy',
      'retry',
      'timeout',
      'concurrency',
      'browser',
      'chromium',
      'firefox',
      'session',
      'preset',
      'import',
      'export',
    ],
    pageId: 'scraper',
    group: 'Media',
    advanced: true,
  },
  {
    // The panel itself lives on the scraper page (`ScraperPage.tsx`), but the
    // only registry entry carrying `mal`/`myanimelist` used to be `api-keys` —
    // a page that does not render it. A user searching "mal sync" landed on a
    // page without the panel and concluded the feature was missing. The id
    // matches the panel's `SettingsCard id="mal-sync"`, so following the result
    // scrolls to and highlights the card rather than the top of a long page.
    id: 'mal-sync',
    titleKey: 'malSync.title',
    descKey: 'malSync.desc',
    keywords: [
      'mal',
      'mal sync',
      'myanimelist',
      'my anime list',
      'anime list',
      'manga list',
      'account',
      'oauth',
      'connect',
      'completed',
      'sync',
    ],
    pageId: 'scraper',
    group: 'Media',
    advanced: true,
  },

  // Media
  {
    id: 'visualizer',
    titleKey: 'search.visualizer',
    descKey: 'search.visualizer.desc',
    keywords: ['visualizer', 'spectrum', 'music', 'fft'],
    pageId: 'visualizer',
    group: 'Media',
  },
  {
    id: 'lyrics',
    titleKey: 'search.lyrics',
    descKey: 'search.lyrics.desc',
    keywords: ['lyrics', 'album', 'search'],
    pageId: 'visualizer',
    group: 'Media',
  },

  // System
  {
    id: 'api-keys',
    titleKey: 'settings.nav.apiKeys',
    descKey: 'settings.nav.apiKeys.desc',
    keywords: [
      'api key',
      'api keys',
      'credentials',
      'vault',
      'secret',
      'token',
      'gemini',
      'deepseek',
      'jimaku',
      'opensubtitles',
      'jiten',
      'myanimelist',
      'mal',
      'provider',
      'revoke',
    ],
    pageId: 'api-keys',
    group: 'System',
  },
  {
    id: 'zoom',
    titleKey: 'search.zoom',
    descKey: 'search.zoom.desc',
    keywords: ['zoom', 'scale', 'size', 'accessibility', 'display'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'window-chrome',
    titleKey: 'search.windowChrome',
    descKey: 'search.windowChrome.desc',
    keywords: ['borderless', 'frameless', 'title bar', 'window', 'chrome', 'fullscreen', 'standard'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'base-font',
    titleKey: 'search.baseFont',
    descKey: 'search.baseFont.desc',
    keywords: ['font', 'text size', 'bold', 'display', 'typography'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'contrast',
    titleKey: 'search.contrast',
    descKey: 'search.contrast.desc',
    keywords: ['contrast', 'letter spacing', 'underline', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'night-light',
    titleKey: 'search.nightLight',
    descKey: 'search.nightLight.desc',
    keywords: ['night', 'warm', 'blue light', 'evening', 'display'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'brightness-sat',
    titleKey: 'search.brightnessSat',
    descKey: 'search.brightnessSat.desc',
    keywords: ['brightness', 'saturation', 'color', 'display'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'color-filter',
    titleKey: 'search.colorFilter',
    descKey: 'search.colorFilter.desc',
    keywords: ['grayscale', 'filter', 'color blind', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'transparency',
    titleKey: 'search.transparency',
    descKey: 'search.transparency.desc',
    keywords: ['transparency', 'blur', 'frosted', 'acrylic', 'performance'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'focus-ring',
    titleKey: 'search.focusRing',
    descKey: 'search.focusRing.desc',
    keywords: ['focus', 'keyboard', 'outline', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'scrollbars',
    titleKey: 'search.scrollbars',
    descKey: 'search.scrollbars.desc',
    keywords: ['scrollbar', 'scroll', 'smooth'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'pointer',
    titleKey: 'search.pointer',
    descKey: 'search.pointer.desc',
    keywords: ['pointer', 'cursor', 'touch', 'targets'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'animation-level',
    titleKey: 'search.animationLevel',
    descKey: 'search.animationLevel.desc',
    keywords: ['motion', 'animation', 'reduce', 'flashes', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'motion-mode',
    titleKey: 'search.motionMode',
    descKey: 'search.motionMode.desc',
    keywords: ['motion', 'animation', 'performance', 'disabled', 'accessibility', 'reduce'],
    pageId: 'motion',
    group: 'System',
  },
  {
    id: 'motion-velocity',
    titleKey: 'search.motionVelocity',
    descKey: 'search.motionVelocity.desc',
    keywords: ['animation', 'speed', 'velocity', 'duration', 'slow', 'fast', 'instant'],
    pageId: 'motion',
    group: 'System',
  },
  {
    id: 'motion-particles',
    titleKey: 'search.motionParticles',
    descKey: 'search.motionParticles.desc',
    keywords: ['particles', 'confetti', 'reward', 'celebration', 'badge', 'density'],
    pageId: 'motion',
    group: 'System',
  },
  {
    id: 'motion-companion-weight',
    titleKey: 'search.motionCompanionWeight',
    descKey: 'search.motionCompanionWeight.desc',
    keywords: ['companion', 'shimeji', 'physics', 'gravity', 'weight', 'drag'],
    pageId: 'motion',
    group: 'System',
  },
  {
    id: 'reduce-motion',
    titleKey: 'search.reduceMotion',
    descKey: 'search.reduceMotion.desc',
    keywords: ['motion', 'animation', 'reduce', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'focus-mode',
    titleKey: 'search.focusMode',
    descKey: 'search.focusMode.desc',
    keywords: ['focus', 'reader', 'distraction', 'study', 'minimal', 'epub'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'focus-lock',
    titleKey: 'search.focusLock',
    descKey: 'search.focusLock.desc',
    keywords: ['focus', 'lock', 'timer', 'pomodoro', 'commit', 'distraction', 'exit'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'focus-default-tab',
    titleKey: 'search.focusDefaultTab',
    descKey: 'search.focusDefaultTab.desc',
    keywords: ['focus', 'tab', 'library', 'dictionary', 'anki', 'default'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'focus-distractions',
    titleKey: 'search.focusDistractions',
    descKey: 'search.focusDistractions.desc',
    keywords: ['focus', 'music', 'chrome', 'minimal', 'hide', 'distraction'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'focus-auto-enter',
    titleKey: 'search.focusAutoEnter',
    descKey: 'search.focusAutoEnter.desc',
    keywords: ['focus', 'launch', 'startup', 'auto', 'enter', 'boot'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'study-language',
    titleKey: 'settings.study.lang.title',
    descKey: 'settings.study.lang.desc',
    keywords: ['study', 'language', 'japanese', 'chinese', 'environment', 'dictionary', 'zh', 'ja'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'study-language-setup',
    titleKey: 'settings.study.setup.title',
    descKey: 'settings.study.setup.desc',
    keywords: ['setup', 'download', 'cedict', 'chinese', 'dictionary', 'assets'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'extension-bridge',
    titleKey: 'settings.extension.title',
    descKey: 'settings.extension.desc',
    keywords: ['chrome', 'extension', 'install', 'pair', 'token', 'bridge', 'load unpacked'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'profile-rules',
    titleKey: 'settings.profileRules.title',
    descKey: 'settings.profileRules.desc',
    keywords: [
      'profile rules',
      'mining rules',
      'anki profile',
      'route',
      'match',
      'extension',
      'epub',
      'audio',
      'mine',
    ],
    pageId: 'profile-rules',
    group: 'Study',
  },
  {
    id: 'storage-models',
    titleKey: 'search.storageModels',
    descKey: 'search.storageModels.desc',
    keywords: [
      'download',
      'model',
      'models',
      'whisper',
      'ocr',
      'manga ocr',
      'tesseract',
      'dictionary',
      'jmdict',
      'cedict',
      'pitch accent',
      'tatoeba',
      'install',
      'remove',
      'storage',
      'disk space',
    ],
    pageId: 'storage',
    group: 'System',
  },
  {
    id: 'memory',
    titleKey: 'search.memory',
    descKey: 'search.memory.desc',
    keywords: [
      'memory',
      'storage',
      'backup',
      'export',
      'import',
      'clear',
      'data',
      'quota',
      'disk',
      'ram',
      'particles',
      'companions',
      'wallpaper',
      'settings inventory',
    ],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'system-memory',
    titleKey: 'search.systemMemory',
    descKey: 'search.systemMemory.desc',
    keywords: ['ram', 'memory', 'cpu', 'uptime', 'system'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'storage-usage',
    titleKey: 'search.storageUsage',
    descKey: 'search.storageUsage.desc',
    keywords: ['usage', 'quota', 'disk', 'space', 'used', 'app storage'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'storage-inventory',
    titleKey: 'search.storageInventory',
    descKey: 'search.storageInventory.desc',
    keywords: ['inventory', 'list', 'size', 'indexeddb', 'localstorage'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'backup',
    titleKey: 'search.backup',
    descKey: 'search.backup.desc',
    keywords: ['backup', 'export', 'import', 'restore', 'json'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'clear-data',
    titleKey: 'search.clearData',
    descKey: 'search.clearData.desc',
    keywords: ['clear', 'delete', 'decks', 'csv', 'clipboard', 'lyrics', 'calendar', 'cache'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'factory-reset',
    titleKey: 'search.factoryReset',
    descKey: 'search.factoryReset.desc',
    keywords: ['factory', 'reset', 'wipe', 'erase', 'fresh'],
    pageId: 'memory',
    group: 'System',
  },

  // ---------------------------------------------------------------------
  // Guided targets the search box could not reach.
  //
  // `AGENT_SETTINGS_GUIDED_TARGETS` (shared/agentNavigation.ts) declares 107
  // page/control pairs that Settings scrolls to and highlights on request. The
  // 26 cards below were declared there and rendered on their page, but had no
  // entry here at all — so typing their own name into this search box returned
  // nothing. That is a Settings defect in its own right; the Agent's navigation
  // index is only what surfaced it.
  //
  // Keywords are words those cards already use in their heading, body or
  // options — `agentNavigationIndexMirror.test.ts` rejects any search term the
  // index matches on that is not one of them, so inventing vocabulary here would
  // widen the Agent's reach past what Settings itself calls these things.
  //
  // `advanced` marks a card that only renders once the user has reached a state
  // of their own (the Aero / WIRED secret shells): offering the row to everyone
  // else would scroll to nothing and give the secret away in the same click.
  // `advanced` alone never actually did that, though — Advanced Mode is a
  // preference, not a shell, so a Study OS user who turned it on still got the
  // row and still scrolled to nothing. `themes` is the gate that means what this
  // paragraph says; `settingsSearchThemeGate.test.ts` derives it from the card's
  // own render guard so a moved card cannot quietly lose it.
  // ---------------------------------------------------------------------
  {
    id: 'app-border',
    titleKey: 'settings.appearance.border.title',
    descKey: 'settings.appearance.border.desc',
    keywords: ['app borders', 'border', 'window frame', 'frame', 'aero', 'secret os', 'style', 'width'],
    pageId: 'appearance',
    group: 'Personalization',
    advanced: true,
    themes: [AERO_SHELL_THEME],
  },
  {
    id: 'pillarbox',
    titleKey: 'settings.appearance.pillarbox.title',
    descKey: 'settings.appearance.pillarbox.desc',
    keywords: ['pillarbox style', 'pillarbox', 'letterbox', 'outer border', 'background', 'aero', 'secret os'],
    pageId: 'appearance',
    group: 'Personalization',
    advanced: true,
    themes: [AERO_SHELL_THEME],
  },
  {
    id: 'environment-preset',
    titleKey: 'settings.atmosphere.environment.title',
    descKey: 'settings.atmosphere.environment.desc',
    keywords: ['environment', 'environment preset', 'preset', 'place', 'scene', 'atmosphere'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'weather',
    titleKey: 'settings.atmosphere.weather.title',
    descKey: 'settings.atmosphere.weather.desc',
    keywords: ['weather', 'fog', 'clouds', 'rain', 'snow', 'precipitation'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'ambient-audio',
    titleKey: 'settings.atmosphere.ambientAudio.title',
    descKey: 'settings.atmosphere.ambientAudio.desc',
    keywords: ['ambient audio', 'ambience', 'soundscape', 'sound', 'volume', 'loop'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    // The same action also renders as `special/secret-os-leave`. Only this one is
    // registered: the Special page is Advanced-only, so a user who wants out of a
    // secret shell can reach the Companions copy and not that one.
    id: 'companions-leave-secret',
    titleKey: 'special.leave.title',
    descKey: 'special.leave.desc',
    keywords: ['leave secret os', 'leave', 'exit', 'secret os', 'aero', 'wired', 'restore theme'],
    pageId: 'companions',
    group: 'Personalization',
    advanced: true,
    // CompanionsPage renders this card only under a secret shell. Without the
    // gate a Study OS user searching "leave secret os" lands on Companions with
    // nothing highlighted — and the way out of a shell they are not in is not a
    // setting they need.
    themes: SECRET_SHELL_THEMES,
  },
  {
    id: 'trinkets',
    titleKey: 'companion.trinket.section.title',
    descKey: 'companion.trinket.section.desc',
    keywords: ['trinkets', 'trinket', 'keepsake', 'collectible', 'streak', 'unlock'],
    pageId: 'companions',
    group: 'Personalization',
  },
  {
    id: 'os-hotkey',
    titleKey: 'settings.osHotkey.title',
    descKey: 'settings.osHotkey.desc',
    keywords: ['os hotkey', 'startup helper', 'global hotkey', 'windows', 'startup', 'autostart', 'helper'],
    pageId: 'shortcuts',
    group: 'Desktop',
  },
  {
    id: 'global-lookup',
    titleKey: 'settings.dict.globalLookup',
    descKey: 'settings.dict.globalLookupHint',
    keywords: ['app wide lookup', 'app wide', 'lookup', 'popup', 'trigger', 'shift click'],
    pageId: 'shortcuts',
    group: 'Desktop',
  },
  {
    id: 'mini-enable',
    titleKey: 'settings.mini.enable.title',
    descKey: 'settings.mini.enable.desc',
    keywords: ['mini view', 'mini', 'craft window', 'pop out', 'launcher'],
    pageId: 'mini',
    group: 'Desktop',
  },
  {
    id: 'mini-apps',
    titleKey: 'search.miniApps',
    descKey: 'search.miniApps.desc',
    keywords: ['pinned apps', 'mini apps', 'pin', 'slots', 'grid', 'add app'],
    pageId: 'mini',
    group: 'Desktop',
  },
  {
    id: 'mini-routines',
    titleKey: 'search.miniRoutines',
    descKey: 'search.miniRoutines.desc',
    keywords: ['mini routines', 'routines', 'buddy routines', 'one click', 'widget'],
    pageId: 'mini',
    group: 'Desktop',
  },
  {
    id: 'mini-look',
    titleKey: 'settings.mini.look.title',
    descKey: 'settings.mini.look.desc',
    keywords: ['mini look', 'density', 'tint', 'clock', 'auto open', 'mono'],
    pageId: 'mini',
    group: 'Desktop',
  },
  {
    id: 'level',
    titleKey: 'settings.study.level.title',
    descKey: 'settings.study.level.desc',
    keywords: ['level', 'proficiency', 'jlpt', 'hsk', 'known words', 'apkg'],
    pageId: 'study',
    group: 'Study',
  },
  {
    // Deliberately ungated, and this one is a product call rather than a limit
    // of the derivation. The card is the placeholder that says "nothing here
    // yet"; it renders only for a user who has discovered nothing. Sending a
    // discoverer who searches "secret" to the Special page shows them the
    // modules they unlocked, which is a better answer than no result — the
    // opposite of the misroute this gate exists for.
    id: 'special-locked',
    titleKey: 'search.specialLocked',
    descKey: 'search.specialLocked.desc',
    keywords: ['special modules locked', 'modules locked', 'locked', 'secret', 'discover'],
    pageId: 'special',
    group: 'System',
  },
  {
    id: 'wired-arcade',
    titleKey: 'search.wiredArcade',
    descKey: 'search.wiredArcade.desc',
    keywords: ['wired games', 'wired arcade', 'micro games', 'minigames', 'arcade'],
    pageId: 'special',
    group: 'System',
    discovered: 'wired',
  },
  {
    id: 'aero-arcade',
    titleKey: 'search.aeroArcade',
    descKey: 'search.aeroArcade.desc',
    keywords: ['aero games', 'aero arcade', 'xp', 'vista', 'arcade', 'launcher'],
    pageId: 'special',
    group: 'System',
    discovered: 'aero',
  },
  {
    id: 'monitors-list',
    titleKey: 'settings.monitors.displays',
    descKey: 'settings.monitors.displays.desc',
    keywords: ['connected displays', 'displays', 'screens', 'monitors', 'second monitor', 'per screen'],
    pageId: 'monitors',
    group: 'System',
  },
  {
    id: 'monitors-layout-remap',
    titleKey: 'settings.monitors.remap',
    descKey: 'settings.monitors.remap.desc',
    keywords: ['remap', 'other screens', 'layouts on other screens', 'rescale', 'resize'],
    pageId: 'monitors',
    group: 'System',
  },
  {
    id: 'monitors-simulated',
    titleKey: 'settings.monitors.simulated',
    descKey: 'settings.monitors.simulated.desc',
    keywords: ['simulated displays', 'simulated', 'fake screens', 'virtual display', 'test'],
    pageId: 'monitors',
    group: 'System',
  },
  {
    id: 'monitors-reset',
    titleKey: 'settings.monitors.reset',
    descKey: 'settings.monitors.reset.desc',
    keywords: ['reset display setup', 'forget screens', 'reset', 'clear screen settings'],
    pageId: 'monitors',
    group: 'System',
  },
  {
    id: 'filedrop-auto',
    titleKey: 'settings.fileDrops.auto',
    descKey: 'settings.fileDrops.auto.desc',
    keywords: ['automatic routing', 'routing', 'dropped files', 'drag and drop', 'always ask'],
    pageId: 'file-drops',
    group: 'System',
  },
  {
    id: 'filedrop-overrides',
    titleKey: 'settings.fileDrops.overrides',
    descKey: 'settings.fileDrops.overrides.desc',
    keywords: ['per type destinations', 'overrides', 'file type', 'destination'],
    pageId: 'file-drops',
    group: 'System',
  },
  {
    id: 'filedrop-undo',
    titleKey: 'settings.fileDrops.undo',
    descKey: 'settings.fileDrops.undo.desc',
    keywords: ['undo history', 'undo', 'reverse', 'toast'],
    pageId: 'file-drops',
    group: 'System',
  },
  {
    id: 'filedrop-reset',
    titleKey: 'settings.fileDrops.reset',
    descKey: 'settings.fileDrops.reset.desc',
    keywords: ['reset drop settings', 'drop settings', 'reset', 'defaults'],
    pageId: 'file-drops',
    group: 'System',
  },
  {
    id: 'agent-memory',
    titleKey: 'search.agentMemory',
    descKey: 'search.agentMemory.desc',
    keywords: ['agent memory', 'local agent memory', 'assistant', 'remembers', 'forget', 'offline'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'agent-history',
    titleKey: 'search.agentHistory',
    descKey: 'search.agentHistory.desc',
    keywords: ['agent history', 'operation history', 'what the agent did', 'audit', 'delete history', 'activity'],
    pageId: 'memory',
    group: 'System',
  },

  // ---- Panel-owned cards ---------------------------------------------------
  // Everything above was written entry-first. These were written card-first:
  // probes/l8-searchability.cjs reported 130 SettingsCard destinations against
  // 106 registry ids, so 23 panels existed only for a user who already knew
  // which page hides them. Each reuses its own card's title/description key, so
  // no new strings and no new translations. SettingsCard derives `is-highlight`
  // from its own id, so matching the id is the whole wiring.
  {
    id: 'api-keys-overview',
    titleKey: 'apiKeys.overview.title',
    // No descKey: `apiKeys.overview.desc` interpolates {configured}/{total},
    // and the search popover resolves without vars.
    keywords: ['credentials', 'api keys', 'overview', 'configured', 'providers', 'vault'],
    pageId: 'api-keys',
    group: 'System',
  },
  {
    id: 'connection-compare',
    titleKey: 'connection.compare',
    descKey: 'connection.compareDesc',
    keywords: ['compare profiles', 'difference', 'inheritance', 'connection'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'connection-history',
    titleKey: 'connection.versions',
    descKey: 'connection.versionsDesc',
    keywords: ['version history', 'snapshot', 'restore', 'revert', 'connection'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'connection-logs',
    titleKey: 'connection.logs',
    descKey: 'connection.logsDesc',
    keywords: ['logs', 'network log', 'errors', 'ring buffer', 'connection'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'connection-monitoring',
    titleKey: 'connection.monitoring',
    descKey: 'connection.monitoringDesc',
    keywords: ['monitoring', 'diagnostics', 'request outcomes', 'health', 'connection'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'connection-portability',
    titleKey: 'connection.portability',
    descKey: 'connection.portabilityDesc',
    keywords: ['import', 'export', 'backup', 'portable json', 'connection profile'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'connection-queue',
    titleKey: 'connection.queue',
    descKey: 'connection.queueDesc',
    keywords: ['batch queue', 'pause', 'resume', 'priority', 'jobs', 'connection'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'connection-sites',
    titleKey: 'connection.sites',
    descKey: 'connection.sitesDesc',
    keywords: ['per-site profile', 'hostname', 'assign', 'override', 'connection'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'external-players',
    titleKey: 'externalPlayer.title',
    descKey: 'externalPlayer.description',
    keywords: ['external player', 'mpv', 'vlc', 'open in', 'playback app'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'media-tracking-manager',
    titleKey: 'trackingMgmt.title',
    descKey: 'trackingMgmt.description',
    keywords: ['tracking', 'progress', 'watched', 'anilist', 'myanimelist', 'sync'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'verified-sites',
    titleKey: 'verifiedSites.title',
    descKey: 'verifiedSites.description',
    keywords: ['verified sites', 'curated', 'compatibility', 'site database', 'status'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'video-server-profiles',
    titleKey: 'videoServer.title',
    descKey: 'videoServer.description',
    keywords: ['video server', 'jellyfin', 'plex', 'server profile', 'streaming host'],
    pageId: 'scraper',
    group: 'Media',
  },
  {
    id: 'theme-studio-profiles',
    titleKey: 'theme.profiles',
    descKey: 'theme.profilesDesc',
    keywords: ['theme profiles', 'saved look', 'duplicate theme', 'theme studio'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'theme-studio-tokens',
    titleKey: 'theme.tokens',
    descKey: 'theme.tokensDesc',
    keywords: ['design tokens', 'colour', 'spacing', 'typography values', 'theme studio'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'theme-studio-components',
    titleKey: 'theme.components',
    descKey: 'theme.componentsDesc',
    keywords: ['component settings', 'per-component', 'theme studio'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'theme-studio-css',
    titleKey: 'theme.customCss',
    descKey: 'theme.customCssDesc',
    keywords: ['custom css', 'stylesheet', 'advanced styling', 'theme studio'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'theme-studio-assistant',
    titleKey: 'theme.assistant',
    descKey: 'theme.assistantDesc',
    keywords: ['theme assistant', 'describe the look', 'plain language', 'generate theme'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'theme-studio-developer',
    titleKey: 'theme.developer',
    descKey: 'theme.developerDesc',
    keywords: ['theme developer', 'inspect theme', 'move theme', 'export theme'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'storage-dictionary-import',
    titleKey: 'storage.dictionaryImport.title',
    descKey: 'storage.dictionaryImport.desc',
    keywords: ['import dictionary', 'jmdict', 'kanjidic', 'add dictionary', 'dictionary file'],
    pageId: 'storage',
    group: 'System',
  },
  {
    id: 'whisper-models',
    titleKey: 'storage.group.whisper',
    descKey: 'settings.transcription.modelsDesc',
    keywords: ['whisper', 'transcription models', 'download model', 'asr', 'speech'],
    pageId: 'transcription',
    group: 'Study',
  },
  {
    id: 'desktop-reset',
    titleKey: 'settings.desktop.reset.title',
    descKey: 'settings.desktop.reset.desc',
    keywords: ['reset desktop', 'clear icons', 'clear widgets', 'clear notes'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'display-reset',
    titleKey: 'settings.display.reset.title',
    descKey: 'settings.display.reset.desc',
    keywords: ['reset display', 'restore defaults', 'zoom', 'contrast', 'scrollbars'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'motion-reset',
    titleKey: 'settings.motion.reset.title',
    descKey: 'settings.motion.reset.desc',
    keywords: ['reset motion', 'restore defaults', 'animation', 'particles', 'velocity'],
    pageId: 'motion',
    group: 'System',
  },
];

/**
 * `themeId` is the theme the searching window is actually running and
 * `discovered` is which secret shells this profile has found; together they gate
 * entries whose cards do not render for everyone. Omitting them drops every
 * gated entry rather than admitting them all: a gated card renders for a
 * minority, so the unknown-state guess that is right more often is "not
 * rendered", and a missing result costs a user less than one that navigates to a
 * page and highlights nothing.
 *
 * Declared gates are OR-ed, because the guards they model are.
 */
export function searchSettings(
  query: string,
  t: (key: string) => string,
  opts?: { advanced?: boolean; themeId?: string; discovered?: { aero?: boolean; wired?: boolean } },
): SettingsRegistryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const advanced = opts?.advanced ?? false;
  const themeId = opts?.themeId;
  const discovered = opts?.discovered;
  const words = q.split(/\s+/).filter(Boolean);
  const scored: { e: SettingsRegistryEntry; score: number; title: string }[] = [];
  for (const e of SETTINGS_REGISTRY) {
    if (e.advanced && !advanced) continue;
    if (e.themes || e.discovered) {
      const renders =
        (e.themes ? !!themeId && e.themes.includes(themeId) : false) ||
        (e.discovered ? !!discovered?.[e.discovered] : false);
      if (!renders) continue;
    }
    const page = SETTINGS_NAV.find((p) => p.id === e.pageId);
    if (page?.advanced && !advanced) continue;
    const title = e.titleKey ? t(e.titleKey) : '';
    const desc = e.descKey ? t(e.descKey) : '';
    const hay = [title, desc, e.group, e.pageId, ...e.keywords].join(' ').toLowerCase();
    const titleLower = title.toLowerCase();
    let score = 0;
    if (titleLower.includes(q)) score += 40;
    if (hay.includes(q)) score += 20;
    for (const w of words) {
      if (titleLower.includes(w)) score += 12;
      else if (hay.includes(w)) score += 6;
    }
    if (score > 0) scored.push({ e, score, title });
  }
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  // Dedupe by id
  const seen = new Set<string>();
  const out: SettingsRegistryEntry[] = [];
  for (const { e } of scored) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length >= 24) break;
  }
  return out;
}

export function pageMeta(id: SettingsPageId): SettingsNavPage | undefined {
  return SETTINGS_NAV.find((p) => p.id === id);
}

export function groupOrder(): string[] {
  const order: string[] = [];
  for (const p of SETTINGS_NAV) {
    if (!p.group) continue;
    if (!order.includes(p.group)) order.push(p.group);
  }
  return order;
}

/** Stable English group id (e.g. 'Personalization') → its i18n catalog key. */
const GROUP_LABEL_KEY: Record<string, string> = {
  Personalization: 'settings.group.personalization',
  Desktop: 'settings.group.desktop',
  Study: 'settings.group.study',
  Media: 'settings.group.media',
  System: 'settings.group.system',
};

export function groupLabelKey(group: string): string {
  return GROUP_LABEL_KEY[group] ?? group;
}
