/**
 * Renderer-side store for MASTER_PLAN.md §2 — Connection Profiles.
 *
 * The impure boundary: `shared/connectionProfiles.ts` is pure and takes `now` / ids as
 * arguments, so this file is the only place that reads the clock, mints ids, or touches
 * localStorage. Same shape and failure behaviour as `scraperSettingsStore.ts`.
 */

import {
  CONNECTION_PROFILES_VERSION,
  createDefaultConnectionProfilesDocument,
  exportConnectionProfiles,
  importConnectionProfiles,
  normalizeConnectionProfilesDocument,
  resolveConnectionSettingsForSite,
  type ConnectionProfilesDocument,
} from '../shared/connectionProfiles';
import { nextLocalId, nowIso } from './storeIds';
import type { ScraperSettings } from '../shared/scraperSettings';
import type { ScraperSettingsIssue } from '../shared/scraperSettingsPrimitives';

export const CONNECTION_PROFILES_STORAGE_KEY = 'jp-connection-profiles-v1';
const CHANGED_EVENT = 'jp-connection-profiles-changed';

let memoryFallback: ConnectionProfilesDocument | null = null;

export interface ConnectionProfilesImportResult {
  document: ConnectionProfilesDocument;
  issues: ScraperSettingsIssue[];
}

export const nextConnectionId = nextLocalId;
export { nowIso };

function dispatchChanged(document: ConnectionProfilesDocument): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ConnectionProfilesDocument>(CHANGED_EVENT, { detail: document }));
}

export function loadConnectionProfilesDocument(): ConnectionProfilesDocument {
  try {
    const raw = localStorage.getItem(CONNECTION_PROFILES_STORAGE_KEY);
    if (raw) {
      const normalized = normalizeConnectionProfilesDocument(JSON.parse(raw));
      memoryFallback = normalized.value;
      return normalized.value;
    }
  } catch {
    // Corrupt or unavailable browser storage falls through to the last known valid
    // in-memory value, then to defaults — never to a thrown boot error.
  }
  if (memoryFallback) return normalizeConnectionProfilesDocument(memoryFallback).value;
  memoryFallback = createDefaultConnectionProfilesDocument();
  return memoryFallback;
}

export function saveConnectionProfilesDocument(input: unknown): ConnectionProfilesDocument {
  const document = normalizeConnectionProfilesDocument(input).value;
  memoryFallback = document;
  try {
    localStorage.setItem(CONNECTION_PROFILES_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // Keep the validated value in memory when storage is unavailable or full.
  }
  dispatchChanged(document);
  return document;
}

/** The settings a request to `site` should use, after §2 inheritance. */
export function getConnectionSettings(site?: string, base?: ScraperSettings): ScraperSettings {
  return resolveConnectionSettingsForSite(loadConnectionProfilesDocument(), site, base);
}

export function exportConnectionProfilesJson(
  document = loadConnectionProfilesDocument(),
): string {
  return JSON.stringify(exportConnectionProfiles(document), null, 2);
}

export function importConnectionProfilesJson(json: string): ConnectionProfilesImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The import is not valid JSON.');
  }
  const result = importConnectionProfiles(loadConnectionProfilesDocument(), parsed, nowIso());
  return { document: saveConnectionProfilesDocument(result.value), issues: result.issues };
}

export function onConnectionProfilesChanged(
  listener: (document: ConnectionProfilesDocument) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handle = (event: Event) => {
    listener((event as CustomEvent<ConnectionProfilesDocument>).detail);
  };
  window.addEventListener(CHANGED_EVENT, handle);
  return () => window.removeEventListener(CHANGED_EVENT, handle);
}

export { CONNECTION_PROFILES_VERSION };
