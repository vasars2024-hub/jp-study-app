import {
  SCRAPER_SETTINGS_VERSION,
  applyScraperPreset,
  createDefaultScraperSettingsDocument,
  normalizeScraperSettingsDocument,
  patchScraperProfile,
  resolveScraperSettings,
  type ScraperPresetId,
  type ScraperSettings,
  type ScraperSettingsDocument,
  // Imported rather than restated: the hand-written copy that used to live here
  // covered only the original eight groups and would have silently rejected
  // every v3 patch.
  type ScraperSettingsPatch,
} from '../shared/scraperSettings';
import { syncQbitConfigToMain } from './mediaIngestBridge';
import { syncSchedulerConfigToMain } from './scraperSchedulerBridge';

export const SCRAPER_SETTINGS_STORAGE_KEY = 'jp-scraper-settings-v1';
const CHANGED_EVENT = 'jp-scraper-settings-changed';

let memoryFallback: ScraperSettingsDocument | null = null;

export interface ScraperSettingsImportResult {
  document: ScraperSettingsDocument;
  issues: ScraperSettingsIssue[];
}

function dispatchChanged(document: ScraperSettingsDocument): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ScraperSettingsDocument>(CHANGED_EVENT, { detail: document }));
}

export function loadScraperSettingsDocument(): ScraperSettingsDocument {
  try {
    const raw = localStorage.getItem(SCRAPER_SETTINGS_STORAGE_KEY);
    if (raw) {
      const normalized = normalizeScraperSettingsDocument(JSON.parse(raw));
      memoryFallback = normalized.value;
      return normalized.value;
    }
  } catch {
    // Corrupt or unavailable browser storage falls through to the last known
    // valid in-memory value, then to defaults.
  }
  if (memoryFallback) return normalizeScraperSettingsDocument(memoryFallback).value;
  memoryFallback = createDefaultScraperSettingsDocument();
  return memoryFallback;
}

export function saveScraperSettingsDocument(input: unknown): ScraperSettingsDocument {
  const document = normalizeScraperSettingsDocument(input).value;
  memoryFallback = document;
  try {
    localStorage.setItem(SCRAPER_SETTINGS_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // Keep the validated value in memory when storage is unavailable or full.
  }
  dispatchChanged(document);
  syncQbitConfigToMain(document);
  syncSchedulerConfigToMain(document);
  return document;
}

/**
 * Hands main the active qBittorrent profile at start-up, so finished torrents
 * are imported without the Scraper ever being opened. See `mediaIngestBridge`.
 */
export function syncScraperQbitToMain(): void {
  syncQbitConfigToMain(loadScraperSettingsDocument());
}

/**
 * Hands main the active profile's schedules at start-up, so a scheduled scrape
 * fires after a restart without the Scheduled Tasks page ever being opened.
 */
export function syncScraperSchedulerToMain(): void {
  syncSchedulerConfigToMain(loadScraperSettingsDocument());
}

export function updateActiveScraperSettings(
  patch: ScraperSettingsPatch,
): ScraperSettingsDocument {
  const current = loadScraperSettingsDocument();
  return saveScraperSettingsDocument(
    patchScraperProfile(current, current.activeProfileId, patch),
  );
}

export function chooseScraperPreset(
  preset: Exclude<ScraperPresetId, 'custom'>,
): ScraperSettingsDocument {
  const current = loadScraperSettingsDocument();
  return saveScraperSettingsDocument(
    applyScraperPreset(current, current.activeProfileId, preset),
  );
}

export function getActiveScraperSettings(site?: string): ScraperSettings {
  return resolveScraperSettings(loadScraperSettingsDocument(), site);
}

export function exportScraperSettings(document = loadScraperSettingsDocument()): string {
  return JSON.stringify(normalizeScraperSettingsDocument(document).value, null, 2);
}

export function importScraperSettings(json: string): ScraperSettingsImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The import is not valid JSON.');
  }
  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'version' in parsed
    && typeof parsed.version === 'number'
    && parsed.version > SCRAPER_SETTINGS_VERSION
  ) {
    throw new Error('These settings were created by a newer app version.');
  }
  const normalized = normalizeScraperSettingsDocument(parsed);
  const document = saveScraperSettingsDocument(normalized.value);
  return { document, issues: normalized.issues };
}

export function onScraperSettingsChanged(
  listener: (document: ScraperSettingsDocument) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handle = (event: Event) => {
    listener((event as CustomEvent<ScraperSettingsDocument>).detail);
  };
  window.addEventListener(CHANGED_EVENT, handle);
  return () => window.removeEventListener(CHANGED_EVENT, handle);
}
