import {
  createEmptyVideoServerProfilesDocument,
  normalizeVideoServerProfilesDocument,
  type VideoServerProfilesDocument,
  type VideoServerProfilesValidationResult,
} from '../shared/videoServerProfiles';

export const VIDEO_SERVER_PROFILES_STORAGE_KEY = 'jp-video-server-profiles-v3';
export const LEGACY_VIDEO_SERVER_PROFILES_STORAGE_KEYS = ['jp-video-server-profiles-v2', 'jp-video-server-profiles-v1'] as const;

let memoryFallback: VideoServerProfilesDocument | null = null;

export function loadVideoServerProfilesDocument(): VideoServerProfilesDocument {
  try {
    const current = localStorage.getItem(VIDEO_SERVER_PROFILES_STORAGE_KEY);
    const legacyKey = current ? null : LEGACY_VIDEO_SERVER_PROFILES_STORAGE_KEYS.find((key) => localStorage.getItem(key));
    const legacy = legacyKey ? localStorage.getItem(legacyKey) : null;
    const raw = current ?? legacy;
    if (raw) {
      const document = normalizeVideoServerProfilesDocument(JSON.parse(raw)).value;
      memoryFallback = document;
      if (legacy) localStorage.setItem(VIDEO_SERVER_PROFILES_STORAGE_KEY, JSON.stringify(document));
      return document;
    }
  } catch { /* keep the last validated in-memory value */ }
  return memoryFallback ?? createEmptyVideoServerProfilesDocument();
}

export function saveVideoServerProfilesDocument(input: unknown): VideoServerProfilesValidationResult {
  const result = normalizeVideoServerProfilesDocument(input);
  memoryFallback = result.value;
  try { localStorage.setItem(VIDEO_SERVER_PROFILES_STORAGE_KEY, JSON.stringify(result.value)); } catch { /* retain in memory */ }
  return result;
}

export function exportVideoServerProfilesDocument(document = loadVideoServerProfilesDocument()): string {
  return JSON.stringify(normalizeVideoServerProfilesDocument(document).value, null, 2);
}

export function importVideoServerProfilesDocument(json: string): VideoServerProfilesValidationResult {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Video Server Profiles JSON is not valid.'); }
  const validated = normalizeVideoServerProfilesDocument(parsed);
  const fatalIssue = validated.issues.find((issue) => issue.path === '' || issue.path === 'version');
  if (fatalIssue) throw new Error(`Video Server Profiles import was rejected: ${fatalIssue.message}`);
  return saveVideoServerProfilesDocument(validated.value);
}
