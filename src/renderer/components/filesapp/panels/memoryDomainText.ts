/**
 * The Memory panel's words for the settings-domain catalogue.
 *
 * `storage/settingsCatalog.ts` names each domain in English (its labels double
 * as backup-manifest names and as the search text of older builds), so the
 * panel used to print them untranslated (audit r2 #8). Each domain, category
 * and clear prompt is mapped to a key here, explicitly rather than built from
 * the id, so the i18n checker can see every key; an id with no entry falls
 * back to the catalogue's own English rather than to a missing-key string.
 */
import type { DomainDetailPart, DomainInventoryItem } from '../../../storage/settingsCatalog';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const LABEL_KEYS: Readonly<Record<string, string>> = {
  environment: 'settings.memory.domain.environment',
  'wallpaper-rotation': 'settings.memory.domain.wallpaperRotation',
  appearance: 'settings.memory.domain.appearance',
  'secret-lore': 'settings.memory.domain.secretLore',
  display: 'settings.memory.domain.display',
  'desktop-prefs': 'settings.memory.domain.desktopPrefs',
  'file-drop-prefs': 'settings.memory.domain.fileDropPrefs',
  'desktop-layout-host': 'settings.memory.domain.desktopLayoutHost',
  shortcuts: 'settings.memory.domain.shortcuts',
  visualizer: 'settings.memory.domain.visualizer',
  music: 'settings.memory.domain.music',
  'media-library-layout': 'settings.memory.domain.mediaLibraryLayout',
  'lyrics-cache': 'settings.memory.domain.lyricsCache',
  reading: 'settings.memory.domain.reading',
  transcription: 'settings.memory.domain.transcription',
  'media-study': 'settings.memory.domain.mediaStudy',
  dictionary: 'settings.memory.domain.dictionary',
  'study-progress': 'settings.memory.domain.studyProgress',
  flashcards: 'settings.memory.domain.flashcards',
  csv: 'settings.memory.domain.csv',
  clipboard: 'settings.memory.domain.clipboard',
  calendar: 'settings.memory.domain.calendar',
  bookmarks: 'settings.memory.domain.bookmarks',
  annotations: 'settings.memory.domain.annotations',
  lookups: 'settings.memory.domain.lookups',
  'widget-gallery': 'settings.memory.domain.widgetGallery',
  'settings-ui': 'settings.memory.domain.settingsUi',
  mining: 'settings.memory.domain.mining',
  ai: 'settings.memory.domain.ai',
  profiles: 'settings.memory.domain.profiles',
  'blanc-toolbox': 'settings.memory.domain.blancToolbox',
  'game-arena-progress': 'settings.memory.domain.gameArenaProgress',
};

const CONFIRM_KEYS: Readonly<Record<string, string>> = {
  environment: 'settings.memory.confirm.environment',
  appearance: 'settings.memory.confirm.appearance',
  'secret-lore': 'settings.memory.confirm.secretLore',
  display: 'settings.memory.confirm.display',
  'desktop-prefs': 'settings.memory.confirm.desktopPrefs',
  'file-drop-prefs': 'settings.memory.confirm.fileDropPrefs',
  shortcuts: 'settings.memory.confirm.shortcuts',
  visualizer: 'settings.memory.confirm.visualizer',
  music: 'settings.memory.confirm.music',
  'media-library-layout': 'settings.memory.confirm.mediaLibraryLayout',
  'lyrics-cache': 'settings.memory.confirm.lyricsCache',
  reading: 'settings.memory.confirm.reading',
  transcription: 'settings.memory.confirm.transcription',
  'media-study': 'settings.memory.confirm.mediaStudy',
  dictionary: 'settings.memory.confirm.dictionary',
  'study-progress': 'settings.memory.confirm.studyProgress',
  flashcards: 'settings.memory.confirm.flashcards',
  csv: 'settings.memory.confirm.csv',
  clipboard: 'settings.memory.confirm.clipboard',
  calendar: 'settings.memory.confirm.calendar',
  bookmarks: 'settings.memory.confirm.bookmarks',
  annotations: 'settings.memory.confirm.annotations',
  'widget-gallery': 'settings.memory.confirm.widgetGallery',
  mining: 'settings.memory.confirm.mining',
  'blanc-toolbox': 'settings.memory.confirm.blancToolbox',
  'game-arena-progress': 'settings.memory.confirm.gameArenaProgress',
};

const CATEGORY_KEYS: Readonly<Record<string, string>> = {
  Personalization: 'settings.memory.category.personalization',
  Desktop: 'settings.memory.category.desktop',
  Study: 'settings.memory.category.study',
  Media: 'settings.memory.category.media',
  System: 'settings.memory.category.system',
  Data: 'settings.memory.category.data',
};

export function domainLabel(d: Pick<DomainInventoryItem, 'id' | 'label'>, t: Translate): string {
  const key = LABEL_KEYS[d.id];
  return key ? t(key) : d.label;
}

export function domainCategory(d: Pick<DomainInventoryItem, 'category'>, t: Translate): string {
  const key = CATEGORY_KEYS[d.category];
  return key ? t(key) : d.category;
}

/** The clear prompt, or `null` where the catalogue gives none (the caller has a generic one). */
export function domainConfirm(
  d: Pick<DomainInventoryItem, 'id' | 'clearConfirm'>,
  t: Translate,
): string | null {
  const key = CONFIRM_KEYS[d.id];
  if (key) return t(key);
  return d.clearConfirm ?? null;
}

function partText(part: DomainDetailPart, t: Translate): string {
  return 'raw' in part ? part.raw : t(part.key, part.values);
}

export function domainDetail(
  d: Pick<DomainInventoryItem, 'detail' | 'detailParts'>,
  t: Translate,
): string {
  if (!d.detailParts?.length) return d.detail;
  return d.detailParts.map((part) => partText(part, t)).join(' · ');
}
