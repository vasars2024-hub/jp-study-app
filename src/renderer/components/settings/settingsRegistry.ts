import type { SettingsNavPage, SettingsPageId, SettingsRegistryEntry } from './types';
import { en } from '../../../shared/i18n/catalogs';

// Labels and descriptions here are i18n catalog keys (see shared/i18n/catalogs.ts,
// 'settings.nav.*'), not display text — every consumer must resolve them with
// t() at render time. `en` is imported only to seed search keywords below,
// since the search index still matches on English feature names regardless of
// the active UI language (see the SETTINGS_REGISTRY comment).

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
  },
  {
    id: 'aero-gadget-lab',
    titleKey: 'search.aeroGadgets',
    descKey: 'search.aeroGadgets.desc',
    keywords: ['aero gadget lab', 'xp', 'vista', 'windows media player', 'msn', 'cmd', 'legacy'],
    pageId: 'special',
    group: 'System',
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
];

export function searchSettings(
  query: string,
  t: (key: string) => string,
  opts?: { advanced?: boolean },
): SettingsRegistryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const advanced = opts?.advanced ?? false;
  const words = q.split(/\s+/).filter(Boolean);
  const scored: { e: SettingsRegistryEntry; score: number; title: string }[] = [];
  for (const e of SETTINGS_REGISTRY) {
    if (e.advanced && !advanced) continue;
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
