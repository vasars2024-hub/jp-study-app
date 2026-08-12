/**
 * Settings domain catalog — maps every meaningful app preference group to
 * localStorage keys / IndexedDB stores / host (main-process) blobs so Memory
 * & storage can inventory, clear, and backup/restore them cleanly.
 */

import { DEFAULT_ENVIRONMENT } from '../environment/types';

export type SettingsDomainCategory =
  | 'Personalization'
  | 'Desktop'
  | 'Study'
  | 'Media'
  | 'System'
  | 'Data';

export type HostBlobKey = 'mining' | 'ai' | 'desktopLayout' | 'profiles';

export interface SettingsDomainDef {
  id: string;
  label: string;
  description: string;
  category: SettingsDomainCategory;
  /** Exact localStorage keys. */
  lsKeys?: string[];
  /** localStorage key prefixes (inclusive). */
  lsPrefixes?: string[];
  /** IndexedDB kv keys. */
  idbKeys?: string[];
  /** Main-process config included in full backup. */
  hostKey?: HostBlobKey;
  /** Whether Clear is offered in Memory UI. */
  clearable: boolean;
  /** Safer label when confirm is needed. */
  clearConfirm?: string;
}

/** Canonical domains — order is UI order on Memory & storage. */
export const SETTINGS_DOMAINS: SettingsDomainDef[] = [
  {
    id: 'environment',
    label: 'Living layer (particles, companions, lighting)',
    description:
      'Master living desktop: particles, density/intensity/size, snow, companions, buddy routines, day-cycle lighting, achievements, companion trinkets.',
    category: 'Personalization',
    lsKeys: ['jp-os-environment-v1', 'jp-os-achievements-v1', 'jp-os-trinkets-v1'],
    clearable: true,
    clearConfirm:
      'Reset living layer settings (particles, companions, playlists, lighting) to defaults?',
  },
  {
    id: 'wallpaper-rotation',
    label: 'Wallpaper rotation & playlists',
    description:
      'Stored inside the living-layer blob: playlists, rotation rules, calendar walls, active playlist.',
    category: 'Personalization',
    lsKeys: ['jp-os-environment-v1'],
    clearable: false, // cleared with environment
  },
  {
    id: 'appearance',
    label: 'Theme & appearance',
    description: 'Theme id, accent, personalization density, custom CSS.',
    category: 'Personalization',
    lsKeys: [
      'jp-os-theme',
      'jp-os-accent',
      'jp-os-personalization-v1',
      'jp-os-custom-css-v1',
    ],
    clearable: true,
    clearConfirm: 'Reset theme, accent, personalization, and custom CSS?',
  },
  {
    id: 'secret-lore',
    label: 'Secret OS history & easter eggs',
    description:
      'Progress through the Aero/WIRED terminal "history" log, and whether the small typed easter egg has been found.',
    category: 'Personalization',
    lsKeys: ['jp-os-secret-history-v1', 'jp-os-secret-leaf-v1'],
    clearable: true,
    clearConfirm: 'Reset the secret history log and easter egg back to undiscovered?',
  },
  {
    id: 'display',
    label: 'Display & zoom',
    description: 'Zoom, motion, scrollbars, contrast, and other display prefs.',
    category: 'System',
    lsKeys: ['jp-os-display-prefs-v1', 'jp-app-zoom', 'jp-os-reduce-motion'],
    clearable: true,
    clearConfirm: 'Reset display preferences and zoom to defaults?',
  },
  {
    id: 'desktop-prefs',
    label: 'Desktop prefs (icons, taskbar, session)',
    description: 'Icon size, snap grid, taskbar, session restore, companion host displays.',
    category: 'Desktop',
    lsKeys: ['jp-os-desktop-prefs-v1'],
    clearable: true,
    clearConfirm: 'Reset desktop layout preferences?',
  },
  {
    id: 'file-drop-prefs',
    label: 'File drop routing',
    description:
      'Auto-route on drop, triage-sheet behaviour, per-extension destinations, undo depth.',
    category: 'System',
    lsKeys: ['jp-os-filedrop-prefs-v1'],
    clearable: true,
    clearConfirm: 'Reset file drop routing to defaults?',
  },
  {
    id: 'desktop-layout-host',
    label: 'Desktop layout (windows, icons, wall)',
    description: 'Host desktop layout snapshot: windows, icons, notes, wallpaper, widgets.',
    category: 'Desktop',
    hostKey: 'desktopLayout',
    lsKeys: ['jp-os-wins', 'jp-os-icons', 'jp-desktop-notes', 'jp-os-wall'],
    lsPrefixes: ['jp-os-wins', 'jp-os-icons'],
    clearable: false,
  },
  {
    id: 'shortcuts',
    label: 'Keyboard & mouse shortcuts',
    description: 'Custom keybind store.',
    category: 'Desktop',
    lsKeys: ['jp-shortcuts-v1'],
    clearable: true,
    clearConfirm: 'Reset all keyboard and mouse shortcuts to defaults?',
  },
  {
    id: 'visualizer',
    label: 'Music visualizer',
    description: 'Visualizer mode and options.',
    category: 'Media',
    lsKeys: ['jp-os-visualizer'],
    clearable: true,
    clearConfirm: 'Reset visualizer settings?',
  },
  {
    id: 'music',
    label: 'Music widget & likes',
    description: 'Liked songs, sort, music widget lyrics toggle, lyrics search prefs.',
    category: 'Media',
    lsKeys: [
      'jp-music-liked',
      'jp-music-sort',
      'jp-music-collapsed',
      'jp-music-player',
      'jp-os-music-widget',
      'jp-lyrics-settings',
      'jp-media-collapsed',
    ],
    clearable: true,
    clearConfirm: 'Clear music likes and widget settings?',
  },
  {
    id: 'lyrics-cache',
    label: 'Lyrics cache',
    description: 'Cached lyric lookups per media id.',
    category: 'Media',
    lsPrefixes: ['jp-lyrics-'],
    clearable: true,
    clearConfirm: 'Clear cached lyrics?',
  },
  {
    id: 'reading',
    label: 'Reading settings',
    description: 'Reader typography and layout defaults.',
    category: 'Study',
    lsKeys: ['jp-reader-settings'],
    clearable: true,
    clearConfirm: 'Reset reading typography settings?',
  },
  {
    id: 'transcription',
    label: 'Transcription (Whisper)',
    description: 'Whisper device and language preferences.',
    category: 'Study',
    lsKeys: ['jp-study-whisper-device', 'jp-study-whisper-lang'],
    clearable: true,
    clearConfirm: 'Reset transcription device settings?',
  },
  {
    id: 'media-study',
    label: 'Media language profiles and study history',
    description: 'Subtitle language profiles, mined vocabulary summaries, and media study sessions.',
    category: 'Study',
    lsKeys: ['jp-media-study-database-v1'],
    idbKeys: ['media-study-database'],
    clearable: true,
    clearConfirm: 'Delete all media language profiles and media study history?',
  },
  {
    id: 'dictionary',
    label: 'Dictionary prefs',
    description: 'Dictionary language, example display, translate source/target.',
    category: 'Study',
    lsKeys: [
      'jp-study-dict-lang',
      'jp-study-ex-display',
      'jp-study-ex-langs',
      'jp-study-translate-source',
      'jp-study-translate-target',
    ],
    clearable: true,
    clearConfirm: 'Reset dictionary and translate language prefs?',
  },
  {
    id: 'study-progress',
    label: 'Study progress',
    description: 'Known words, level lists, saved words, study stats, planned novels.',
    category: 'Study',
    lsKeys: [
      'jp-word-knowledge',
      'jp-word-knowledge-ja',
      'jp-word-knowledge-zh',
      'jp-level-lists',
      'jp-saved-words',
      'jp-saved-words-ja',
      'jp-saved-words-zh',
      'jp-study-stats-v1',
      'jp-study-stats-v1-ja',
      'jp-study-stats-v1-zh',
      'jp-novels-planned',
    ],
    idbKeys: ['level-lists'],
    clearable: true,
    clearConfirm: 'Delete known words, levels, saved words, and study stats?',
  },
  {
    id: 'flashcards',
    label: 'Flashcard decks',
    description: 'Cards and folders (local cache + durable store).',
    category: 'Data',
    lsKeys: ['jp-flashcard-deck'],
    idbKeys: ['flashcard-deck'],
    clearable: true,
    clearConfirm: 'Delete ALL flashcard decks? This cannot be undone.',
  },
  {
    id: 'csv',
    label: 'CSV editor draft',
    description: 'Spreadsheet grid draft.',
    category: 'Data',
    lsKeys: ['jp-study-csv-editor-v1'],
    idbKeys: ['csv-editor'],
    clearable: true,
    clearConfirm: 'Delete the CSV editor draft?',
  },
  {
    id: 'clipboard',
    label: 'Clipboard history',
    description: 'Clipboard history and panel settings.',
    category: 'Data',
    lsKeys: ['jp-clipboard-history', 'jp-clipboard-settings'],
    idbKeys: ['clipboard-history'],
    clearable: true,
    clearConfirm: 'Clear clipboard history?',
  },
  {
    id: 'calendar',
    label: 'Calendar events',
    description: 'Study calendar events.',
    category: 'Data',
    lsKeys: ['jp-calendar-events'],
    idbKeys: ['calendar-events'],
    clearable: true,
    clearConfirm: 'Delete all calendar events?',
  },
  {
    id: 'bookmarks',
    label: 'Bookmarks',
    description: 'Explicit reader bookmarks per book — saved and included in full backup.',
    category: 'Study',
    lsPrefixes: ['jp-bookmarks-'],
    idbKeys: ['reading-bookmarks'],
    clearable: true,
    clearConfirm: 'Delete all bookmarks?',
  },
  {
    id: 'annotations',
    label: 'Reading highlights (H key)',
    description: 'Personal in-book color marks — saved per book, included in full backup.',
    category: 'Study',
    lsPrefixes: ['jp-annotations:'],
    idbKeys: ['reading-annotations'],
    clearable: true,
    clearConfirm: 'Delete all personal reading highlights?',
  },
  {
    id: 'lookups',
    label: 'Lookup history',
    description: 'Recent dictionary lookups widget.',
    category: 'Study',
    lsKeys: ['jp-lookup-history'],
    clearable: true,
  },
  {
    id: 'widget-gallery',
    label: 'Widget gallery prefs',
    description: 'Home widget gallery layout prefs.',
    category: 'Desktop',
    lsKeys: ['jp-widget-gallery'],
    lsPrefixes: ['jp-widget-'],
    clearable: true,
    clearConfirm: 'Reset widget gallery preferences?',
  },
  {
    id: 'settings-ui',
    label: 'Settings UI state',
    description: 'Recent settings pages and search chrome.',
    category: 'System',
    lsPrefixes: ['jp-settings-'],
    clearable: true,
  },
  {
    id: 'mining',
    label: 'EPUB mining presets',
    description: 'Mining filters, templates, export options (host config).',
    category: 'Study',
    hostKey: 'mining',
    clearable: true,
    clearConfirm: 'Reset EPUB mining settings to defaults?',
  },
  {
    id: 'ai',
    label: 'AI mining config',
    description: 'AI provider selection and mining formats (API keys stay on host; not re-exported as secrets).',
    category: 'Study',
    hostKey: 'ai',
    clearable: false,
  },
  {
    id: 'profiles',
    label: 'Study profiles',
    description: 'Multi-language study profiles (Anki deck/model mapping).',
    category: 'Study',
    hostKey: 'profiles',
    clearable: false,
  },
  {
    id: 'blanc-toolbox',
    label: 'Blanc Toolbox (local)',
    description:
      'Blanc-only launcher/tab state, quick notes, and toolbox settings — shared storage engine, but not treated as study memory.',
    category: 'Data',
    lsPrefixes: ['jp-study.blanc.', 'jp-blanc-'],
    lsKeys: ['jp-study.toolbox.settings.v1'],
    clearable: true,
    clearConfirm: 'Clear Blanc Toolbox local state (quick notes, tabs, layout)?',
  },
  {
    id: 'game-arena-progress',
    label: 'Game Arena progress',
    description:
      'XP, streaks, high scores, and per-game seen-item coverage — intentionally separate from study memory; not shared between Blanc and Study OS beyond being the same install.',
    category: 'Data',
    lsPrefixes: ['jp-game-'],
    clearable: true,
    clearConfirm: 'Reset all Game Arena progress and high scores?',
  },
];

export interface DomainInventoryItem {
  id: string;
  label: string;
  description: string;
  category: SettingsDomainCategory;
  /** Estimated serialized size. */
  bytes: number;
  /** Keys/entries counted. */
  count: number;
  /** Present when any data is stored. */
  present: boolean;
  /** Human summary (e.g. particle presets, companion count). */
  detail: string;
  clearable: boolean;
  clearConfirm?: string;
  tier: 'local' | 'durable' | 'host' | 'mixed';
}

function estimateStringBytes(raw: string): number {
  try {
    return new Blob([raw]).size;
  } catch {
    return raw.length;
  }
}

function estimateBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value) ?? '']).size;
  } catch {
    return 0;
  }
}

function lsKeysMatching(def: SettingsDomainDef): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (def.lsKeys?.includes(k)) {
        out.push(k);
        continue;
      }
      if (def.lsPrefixes?.some((p) => k.startsWith(p))) {
        // Avoid double-counting jp-lyrics-settings under lyrics-cache if prefix is jp-lyrics-
        if (def.id === 'lyrics-cache' && k === 'jp-lyrics-settings') continue;
        out.push(k);
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function summarizeEnvironment(raw: string | null): string {
  if (!raw) return 'Not configured (defaults)';
  try {
    const e = JSON.parse(raw) as Partial<typeof DEFAULT_ENVIRONMENT> & {
      particlePresets?: string[];
      companions?: unknown[];
      buddyRoutines?: unknown[];
      playlists?: unknown[];
      rotationEnabled?: boolean;
      particlesEnabled?: boolean;
      companionsEnabled?: boolean;
      particleDensity?: number;
      particleIntensity?: number;
      particleSize?: number;
      dayCycleLighting?: boolean;
    };
    const parts: string[] = [];
    parts.push(e.enabled ? 'Layer on' : 'Layer off');
    if (e.particlesEnabled) {
      const presets = Array.isArray(e.particlePresets) ? e.particlePresets.join(', ') : '—';
      const d = Math.round((e.particleDensity ?? 0) * 100);
      const i = Math.round((e.particleIntensity ?? 0) * 100);
      const s = Math.round((e.particleSize ?? 0) * 100);
      parts.push(`Particles ${presets || 'none'} · D${d}% I${i}% S${s}%`);
    } else {
      parts.push('Particles off');
    }
    if (e.companionsEnabled) {
      const n = Array.isArray(e.companions) ? e.companions.length : 0;
      const r = Array.isArray(e.buddyRoutines) ? e.buddyRoutines.length : 0;
      parts.push(`Companions ${n} · ${r} routines`);
    } else {
      parts.push('Companions off');
    }
    if (e.rotationEnabled) {
      const pl = Array.isArray(e.playlists) ? e.playlists.length : 0;
      parts.push(`Wall rotation · ${pl} playlist(s)`);
    } else {
      parts.push('Wall rotation off');
    }
    if (e.dayCycleLighting) parts.push('Lighting on');
    return parts.join(' · ');
  } catch {
    return 'Stored (unreadable)';
  }
}

function summarizeDomain(def: SettingsDomainDef, keys: string[]): string {
  if (def.id === 'environment' || def.id === 'wallpaper-rotation') {
    try {
      return summarizeEnvironment(localStorage.getItem('jp-os-environment-v1'));
    } catch {
      return keys.length ? `${keys.length} key(s)` : 'Empty';
    }
  }
  if (def.id === 'appearance') {
    try {
      const theme = localStorage.getItem('jp-os-theme') ?? 'default';
      return `Theme: ${theme}`;
    } catch {
      /* fall through */
    }
  }
  if (def.id === 'display') {
    try {
      const z = localStorage.getItem('jp-app-zoom');
      return z ? `Zoom ${Math.round(Number(z) * 100)}%` : keys.length ? 'Custom display prefs' : 'Defaults';
    } catch {
      /* fall through */
    }
  }
  if (def.id === 'flashcards' && keys.length) {
    try {
      const raw = localStorage.getItem('jp-flashcard-deck');
      if (raw) {
        const store = JSON.parse(raw) as { cards?: unknown[] };
        if (Array.isArray(store.cards)) return `${store.cards.length} cards`;
      }
    } catch {
      /* fall through */
    }
  }
  if (def.id === 'annotations') {
    let marks = 0;
    for (const k of keys) {
      try {
        const list = JSON.parse(localStorage.getItem(k) ?? '[]') as unknown[];
        if (Array.isArray(list)) marks += list.length;
      } catch {
        /* ignore */
      }
    }
    if (marks || keys.length) return `${marks} mark(s) in ${keys.length} book(s)`;
  }
  if (def.id === 'bookmarks') {
    let marks = 0;
    for (const k of keys) {
      try {
        const list = JSON.parse(localStorage.getItem(k) ?? '[]') as unknown[];
        if (Array.isArray(list)) marks += list.length;
      } catch {
        /* ignore */
      }
    }
    if (marks || keys.length) return `${marks} bookmark(s) in ${keys.length} book(s)`;
  }
  if (!keys.length && !def.hostKey) return 'Empty';
  if (keys.length === 1) return keys[0];
  if (keys.length) return `${keys.length} keys`;
  if (def.hostKey) return 'Host config';
  return 'Empty';
}

export function listDomainInventoryLocal(): DomainInventoryItem[] {
  return SETTINGS_DOMAINS.filter((d) => d.id !== 'wallpaper-rotation').map((def) => {
    const keys = lsKeysMatching(def);
    let bytes = 0;
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k);
        if (v != null) bytes += estimateStringBytes(v) + estimateStringBytes(k);
      } catch {
        /* ignore */
      }
    }
    const hasIdbHint = Boolean(def.idbKeys?.length);
    const hasHostHint = Boolean(def.hostKey);
    let tier: DomainInventoryItem['tier'] = 'local';
    if (hasHostHint && keys.length) tier = 'mixed';
    else if (hasHostHint) tier = 'host';
    else if (hasIdbHint) tier = 'mixed';

    return {
      id: def.id,
      label: def.label,
      description: def.description,
      category: def.category,
      bytes,
      count: keys.length,
      // Host/IDB presence is filled in by enrichDomainInventory.
      present: keys.length > 0,
      detail: summarizeDomain(def, keys),
      clearable: def.clearable,
      clearConfirm: def.clearConfirm,
      tier,
    };
  });
}

/** Merge durable / host sizes into local inventory rows. */
export async function enrichDomainInventory(
  base: DomainInventoryItem[],
  opts: {
    idb?: Record<string, unknown>;
    host?: Partial<Record<HostBlobKey, unknown>>;
  },
): Promise<DomainInventoryItem[]> {
  const idb = opts.idb ?? {};
  const host = opts.host ?? {};
  return base.map((row) => {
    const def = SETTINGS_DOMAINS.find((d) => d.id === row.id);
    if (!def) return row;
    let bytes = row.bytes;
    let count = row.count;
    let present = row.present;
    let detail = row.detail;
    let tier = row.tier;

    if (def.idbKeys) {
      for (const k of def.idbKeys) {
        if (k in idb) {
          bytes += estimateBytes(idb[k]);
          count += 1;
          present = true;
          tier = row.bytes > 0 ? 'mixed' : 'durable';
        }
      }
    }
    if (def.hostKey && host[def.hostKey] != null) {
      bytes += estimateBytes(host[def.hostKey]);
      present = true;
      if (tier === 'local') tier = 'host';
      else if (tier === 'durable') tier = 'mixed';
      // Host-specific details
      if (def.hostKey === 'desktopLayout') {
        const snap = host.desktopLayout as {
          viewports?: Array<{ icons?: unknown[]; windows?: unknown[]; wallpaper?: unknown }>;
        };
        const vp = snap?.viewports?.[0];
        if (vp) {
          detail = `Icons ${vp.icons?.length ?? 0} · Windows ${vp.windows?.length ?? 0}`;
        }
      } else if (def.hostKey === 'profiles') {
        const list = host.profiles;
        if (Array.isArray(list)) detail = `${list.length} profile(s)`;
      } else if (def.hostKey === 'mining') {
        detail = 'Mining config present';
      } else if (def.hostKey === 'ai') {
        detail = 'AI config present';
      }
    }
    return { ...row, bytes, count, present, detail, tier };
  });
}

export function collectLocalStorageSnapshot(): Record<string, string> {
  const ls: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (value != null) ls[key] = value;
    }
  } catch {
    /* ignore */
  }
  return ls;
}

export function removeKeysForDomain(def: SettingsDomainDef): number {
  const keys = lsKeysMatching(def);
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  return keys.length;
}

export function domainById(id: string): SettingsDomainDef | undefined {
  return SETTINGS_DOMAINS.find((d) => d.id === id);
}
