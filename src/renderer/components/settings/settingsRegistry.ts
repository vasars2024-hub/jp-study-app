import type { SettingsNavPage, SettingsPageId, SettingsRegistryEntry } from './types';

/** Sidebar pages in display order, grouped for the rail. */
export const SETTINGS_NAV: SettingsNavPage[] = [
  { id: 'home', label: 'Home', icon: 'settings', group: '', description: 'Quick actions and status' },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: 'sparkle',
    group: 'Personalization',
    description: 'Themes, colors, fonts',
  },
  {
    id: 'wallpaper',
    label: 'Wallpaper',
    icon: 'image',
    group: 'Personalization',
    description: 'Desktop background',
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    icon: 'flame',
    group: 'Personalization',
    description: 'Living layer, particles, lighting',
  },
  {
    id: 'companions',
    label: 'Companions',
    icon: 'heart',
    group: 'Personalization',
    description: 'Desktop pets',
  },
  {
    id: 'desktop-layout',
    label: 'Desktop layout',
    icon: 'app',
    group: 'Desktop',
    description: 'Icons, taskbar, session',
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: 'command',
    group: 'Desktop',
    description: 'Keyboard and mouse bindings',
  },
  {
    id: 'study',
    label: 'Profile & dictionary',
    icon: 'dictionary',
    group: 'Study',
    description: 'Profiles and dictionaries',
  },
  {
    id: 'reading',
    label: 'Reading',
    icon: 'novels',
    group: 'Study',
    description: 'Reader typography',
  },
  {
    id: 'transcription',
    label: 'Transcription',
    icon: 'caption',
    group: 'Study',
    description: 'Whisper device',
  },
  {
    id: 'visualizer',
    label: 'Visualizer',
    icon: 'monitor',
    group: 'Media',
    description: 'Music visuals and lyrics',
  },
  {
    id: 'display',
    label: 'Display',
    icon: 'eye',
    group: 'System',
    description: 'Zoom and motion',
  },
  {
    id: 'memory',
    label: 'Memory & storage',
    icon: 'folder',
    group: 'System',
    description: 'Usage, inventory, backups, and clear tools',
  },
];

export const SETTINGS_SEARCH_SUGGESTIONS = [
  'wallpaper',
  'theme',
  'shortcuts',
  'particles',
  'companions',
  'zoom',
  'dictionary',
  'custom css',
];

/** Searchable index — maps queries to pages and cards. */
export const SETTINGS_REGISTRY: SettingsRegistryEntry[] = [
  // Pages
  ...SETTINGS_NAV.filter((p) => p.id !== 'home').map((p) => ({
    id: `page-${p.id}`,
    title: p.label,
    description: p.description ?? '',
    keywords: [p.label, p.group, p.description ?? '', p.id].filter(Boolean),
    pageId: p.id,
    group: p.group || 'Settings',
  })),

  // Appearance
  {
    id: 'theme',
    title: 'Theme',
    description: 'Light, dark, and classic color themes',
    keywords: ['theme', 'dark', 'light', 'appearance', 'color scheme'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'accent',
    title: 'Accent colour',
    description: 'Accent color presets and custom accent',
    keywords: ['accent', 'color', 'colour', 'red', 'personalization'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'typography',
    title: 'Typography & density',
    description: 'Font family, density, and corner radius',
    keywords: ['font', 'density', 'corners', 'typography', 'spacing'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'materials',
    title: 'Shape & materials',
    description: 'Chrome material and window shadows',
    keywords: ['chrome', 'frosted', 'shadow', 'materials', 'glass'],
    pageId: 'appearance',
    group: 'Personalization',
  },
  {
    id: 'custom-css',
    title: 'Custom CSS',
    description: 'User CSS sandbox and reset look',
    keywords: ['css', 'custom css', 'advanced', 'sandbox', 'style'],
    pageId: 'appearance',
    group: 'Personalization',
  },

  // Wallpaper
  {
    id: 'wallpaper',
    title: 'Wallpaper',
    description: 'Preset, image, video, or folder slideshow',
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
    title: 'Wallpaper dim',
    description: 'Dim the desktop background',
    keywords: ['dim', 'brightness', 'wallpaper'],
    pageId: 'wallpaper',
    group: 'Personalization',
  },

  // Atmosphere
  {
    id: 'living-layer',
    title: 'Living desktop layer',
    description: 'Master switch for environment effects',
    keywords: ['living', 'atmosphere', 'environment', 'layer'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'rotation',
    title: 'Wallpaper rotation',
    description: 'Playlist and time-of-day wall rotation',
    keywords: ['rotation', 'playlist', 'schedule', 'day cycle', 'calendar walls'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'particles',
    title: 'Particles',
    description: 'Fireflies, snow, rain, density, intensity, and size',
    keywords: ['particles', 'fireflies', 'snow', 'rain', 'dust', 'intensity', 'density', 'size'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'particle-size',
    title: 'Particle size',
    description: 'Radius of flakes, motes, and glows',
    keywords: ['particle size', 'size', 'radius', 'flake size', 'scale'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'snow-accumulation',
    title: 'Snow accumulation',
    description: 'Snow piles on the desk edge',
    keywords: ['snow', 'accumulation', 'piles', 'winter'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'lighting',
    title: 'Day-cycle lighting',
    description: 'Ambient light wash from dawn to night',
    keywords: ['lighting', 'ambient', 'dawn', 'night', 'wash'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },
  {
    id: 'achievements',
    title: 'Achievements',
    description: 'Celebrate streaks and reading milestones',
    keywords: ['achievements', 'streak', 'celebration', 'milestone'],
    pageId: 'atmosphere',
    group: 'Personalization',
  },

  // Companions
  {
    id: 'companions',
    title: 'Companions',
    description: 'Desktop pets that react to study',
    keywords: ['companions', 'pets', 'critter', 'noctis', 'buddy'],
    pageId: 'companions',
    group: 'Personalization',
  },
  {
    id: 'buddy-programmer',
    title: 'Buddy programmer',
    description: 'Programmable click routines and command chains for companions',
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
    title: 'Windows desktop pets',
    description: 'Show companions on the real Windows desktop',
    keywords: ['os desktop', 'overlay', 'host', 'multi-monitor', 'monitors'],
    pageId: 'companions',
    group: 'Personalization',
  },

  // Desktop layout
  {
    id: 'icons',
    title: 'Icons',
    description: 'Icon size, labels, snap grid, lock',
    keywords: ['icons', 'snap', 'grid', 'label', 'desktop'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'taskbar',
    title: 'Taskbar',
    description: 'Taskbar size and clock format',
    keywords: ['taskbar', 'clock', '24h', 'time'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'start-menu',
    title: 'Start menu',
    description: 'Start menu columns',
    keywords: ['start', 'menu', 'columns'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },
  {
    id: 'session',
    title: 'Session restore',
    description: 'Restore open windows on launch',
    keywords: ['session', 'restore', 'windows', 'launch'],
    pageId: 'desktop-layout',
    group: 'Desktop',
  },

  // Shortcuts
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    description: 'Rebind keys, mouse buttons, and profiles',
    keywords: ['shortcut', 'keybind', 'hotkey', 'keyboard', 'mouse', 'ctrl', 'binding'],
    pageId: 'shortcuts',
    group: 'Desktop',
  },

  // Study
  {
    id: 'profile',
    title: 'Study profile',
    description: 'Active profile and profile management',
    keywords: ['profile', 'study', 'jlpt'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'dictionary',
    title: 'Dictionary',
    description: 'Yomitan packs and dictionary settings',
    keywords: ['dictionary', 'yomitan', 'lookup'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'reading',
    title: 'Reading settings',
    description: 'Reader typography and layout',
    keywords: ['reading', 'font size', 'epub', 'novel', 'typography'],
    pageId: 'reading',
    group: 'Study',
  },
  {
    id: 'whisper',
    title: 'Transcription device',
    description: 'GPU or CPU for Whisper subtitles',
    keywords: ['whisper', 'transcription', 'gpu', 'cpu', 'subtitles'],
    pageId: 'transcription',
    group: 'Study',
  },

  // Media
  {
    id: 'visualizer',
    title: 'Music visualizer',
    description: 'Spectrum, waveform, and colors',
    keywords: ['visualizer', 'spectrum', 'music', 'fft'],
    pageId: 'visualizer',
    group: 'Media',
  },
  {
    id: 'lyrics',
    title: 'Lyrics lookup',
    description: 'Use album names in lyrics search',
    keywords: ['lyrics', 'album', 'search'],
    pageId: 'visualizer',
    group: 'Media',
  },

  // System
  {
    id: 'zoom',
    title: 'App zoom',
    description: 'Scale the entire interface',
    keywords: ['zoom', 'scale', 'size', 'accessibility', 'display'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'base-font',
    title: 'Base text size',
    description: 'Root font size and bold UI text',
    keywords: ['font', 'text size', 'bold', 'display', 'typography'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'contrast',
    title: 'Contrast & spacing',
    description: 'UI contrast and letter spacing',
    keywords: ['contrast', 'letter spacing', 'underline', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'night-light',
    title: 'Night light',
    description: 'Warm screen filter for evening use',
    keywords: ['night', 'warm', 'blue light', 'evening', 'display'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'brightness-sat',
    title: 'Brightness & saturation',
    description: 'Screen brightness and color intensity',
    keywords: ['brightness', 'saturation', 'color', 'display'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'color-filter',
    title: 'Color filter',
    description: 'Warm, cool, grayscale, high contrast filters',
    keywords: ['grayscale', 'filter', 'color blind', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'transparency',
    title: 'Transparency effects',
    description: 'Frosted glass and backdrop blur',
    keywords: ['transparency', 'blur', 'frosted', 'acrylic', 'performance'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'focus-ring',
    title: 'Focus indicator',
    description: 'Keyboard focus outline strength',
    keywords: ['focus', 'keyboard', 'outline', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'scrollbars',
    title: 'Scrollbars',
    description: 'Auto-hide, always, or hidden scrollbars',
    keywords: ['scrollbar', 'scroll', 'smooth'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'pointer',
    title: 'Pointer & targets',
    description: 'Larger click targets',
    keywords: ['pointer', 'cursor', 'touch', 'targets'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'animation-level',
    title: 'Motion',
    description: 'Animation level and flash reduction',
    keywords: ['motion', 'animation', 'reduce', 'flashes', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'reduce-motion',
    title: 'Reduce motion',
    description: 'Pause animated wallpaper and effects',
    keywords: ['motion', 'animation', 'reduce', 'accessibility'],
    pageId: 'display',
    group: 'System',
  },
  {
    id: 'focus-mode',
    title: 'Focus mode',
    description: 'Library, reader, dictionary, Anki, mini music — no desktop',
    keywords: ['focus', 'reader', 'distraction', 'study', 'minimal', 'epub'],
    pageId: 'study',
    group: 'Study',
  },
  {
    id: 'memory',
    title: 'Memory & storage',
    description: 'RAM, settings inventory, export all configs',
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
    title: 'System memory',
    description: 'Live RAM and CPU load on this PC',
    keywords: ['ram', 'memory', 'cpu', 'uptime', 'system'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'storage-usage',
    title: 'App storage',
    description: 'How much browser storage this app uses',
    keywords: ['usage', 'quota', 'disk', 'space', 'used', 'app storage'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'storage-inventory',
    title: 'Data inventory',
    description: 'List of decks, drafts, caches, and settings sizes',
    keywords: ['inventory', 'list', 'size', 'indexeddb', 'localstorage'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'backup',
    title: 'Backup & restore',
    description: 'Export or import a full JSON backup',
    keywords: ['backup', 'export', 'import', 'restore', 'json'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'clear-data',
    title: 'Clear data',
    description: 'Delete decks, CSV draft, clipboard, lyrics, or calendar',
    keywords: ['clear', 'delete', 'decks', 'csv', 'clipboard', 'lyrics', 'calendar', 'cache'],
    pageId: 'memory',
    group: 'System',
  },
  {
    id: 'factory-reset',
    title: 'Factory reset',
    description: 'Wipe all local data and restart',
    keywords: ['factory', 'reset', 'wipe', 'erase', 'fresh'],
    pageId: 'memory',
    group: 'System',
  },
];

export function searchSettings(query: string): SettingsRegistryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const scored: { e: SettingsRegistryEntry; score: number }[] = [];
  for (const e of SETTINGS_REGISTRY) {
    const hay = [e.title, e.description, e.group, e.pageId, ...e.keywords].join(' ').toLowerCase();
    let score = 0;
    if (e.title.toLowerCase().includes(q)) score += 40;
    if (hay.includes(q)) score += 20;
    for (const w of words) {
      if (e.title.toLowerCase().includes(w)) score += 12;
      else if (hay.includes(w)) score += 6;
    }
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title));
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
