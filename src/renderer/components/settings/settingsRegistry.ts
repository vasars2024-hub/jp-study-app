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
    advanced: true,
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
    labelKey: 'Mini View',
    icon: 'widgets',
    group: 'Desktop',
    descKey: 'Reduced launcher with pop-out apps',
  },
  {
    id: 'lockscreen',
    labelKey: 'Lockscreen',
    icon: 'lock',
    group: 'Desktop',
    descKey: 'PIN gate on app launch',
  },
  {
    id: 'study',
    labelKey: 'settings.nav.study',
    icon: 'dictionary',
    group: 'Study',
    descKey: 'settings.nav.study.desc',
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
    id: 'visualizer',
    labelKey: 'settings.nav.visualizer',
    icon: 'monitor',
    group: 'Media',
    descKey: 'settings.nav.visualizer.desc',
    advanced: true,
  },
  {
    id: 'display',
    labelKey: 'settings.nav.display',
    icon: 'eye',
    group: 'System',
    descKey: 'settings.nav.display.desc',
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
  'search.wallpaper',
  'search.theme',
  'search.shortcuts',
  'search.particles',
  'search.companions',
  'search.zoom',
  'search.dictionary',
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
  {
    id: 'rotation',
    titleKey: 'search.rotation',
    descKey: 'search.rotation.desc',
    keywords: ['rotation', 'playlist', 'schedule', 'day cycle', 'calendar walls'],
    pageId: 'atmosphere',
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
    keywords: ['companions', 'pets', 'critter', 'noctis', 'buddy'],
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
    title: 'Lockscreen',
    description: 'Require a passcode when Study OS launches',
    keywords: ['lock', 'lockscreen', 'pin', 'passcode', 'password', 'security', 'login'],
    pageId: 'lockscreen',
    group: 'Desktop',
  },
  {
    id: 'lockscreen-pin',
    title: 'Lockscreen passcode',
    description: 'Set or change the 4-digit PIN',
    keywords: ['pin', 'passcode', 'password', '4 digit', 'lock'],
    pageId: 'lockscreen',
    group: 'Desktop',
  },
  {
    id: 'lockscreen-tint',
    title: 'Lockscreen look',
    description: 'Tint behind the PIN panel',
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
    const title = t(e.titleKey);
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
