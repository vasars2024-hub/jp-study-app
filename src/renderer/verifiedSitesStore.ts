import {
  createEmptyVerifiedSitesDocument,
  normalizeVerifiedSitesDocument,
  type VerifiedSitesDocument,
  type VerifiedSitesValidationResult,
} from '../shared/verifiedSites';
import { writeLocalStorageJson } from './localStorageWrite';

export const VERIFIED_SITES_STORAGE_KEY = 'jp-verified-sites-v4';
export const LEGACY_VERIFIED_SITES_STORAGE_KEYS = ['jp-verified-sites-v3', 'jp-verified-sites-v2', 'jp-verified-sites-v1'] as const;
export const FMHY_SNAPSHOT_STORAGE_KEY = 'jp-fmhy-directory-snapshot-v1';
export interface FmhyDirectorySnapshot {
  version: 1;
  sourceUrl: 'https://fmhy.net/video';
  capturedAt: string;
  html: string;
  entryCount: number;
}
let memoryFallback: VerifiedSitesDocument | null = null;
let fmhySnapshotMemory: FmhyDirectorySnapshot | null = null;

export function loadVerifiedSitesDocument(): VerifiedSitesDocument {
  try {
    const current = localStorage.getItem(VERIFIED_SITES_STORAGE_KEY);
    const legacyKey = current ? null : LEGACY_VERIFIED_SITES_STORAGE_KEYS.find((key) => localStorage.getItem(key));
    const legacy = legacyKey ? localStorage.getItem(legacyKey) : null;
    const raw = current ?? legacy;
    if (raw) {
      const document = normalizeVerifiedSitesDocument(JSON.parse(raw)).value;
      memoryFallback = document;
      if (legacy) writeLocalStorageJson(VERIFIED_SITES_STORAGE_KEY, document);
      return document;
    }
  } catch { /* use the last validated value */ }
  return memoryFallback ?? createEmptyVerifiedSitesDocument();
}

export function saveVerifiedSitesDocument(input: unknown): VerifiedSitesValidationResult {
  const result = normalizeVerifiedSitesDocument(input);
  memoryFallback = result.value;
  // The memory fallback keeps this session working either way; the report is
  // about the NEXT start, where an unwritten document is simply gone.
  writeLocalStorageJson(VERIFIED_SITES_STORAGE_KEY, result.value);
  return result;
}

export function exportVerifiedSitesDocument(document = loadVerifiedSitesDocument()): string {
  return JSON.stringify(normalizeVerifiedSitesDocument(document).value, null, 2);
}

export function importVerifiedSitesDocument(json: string): VerifiedSitesValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Verified Sites JSON is not valid.');
  }
  const validated = normalizeVerifiedSitesDocument(parsed);
  const fatalIssue = validated.issues.find((issue) => issue.path === '' || issue.path === 'version');
  if (fatalIssue) throw new Error(`Verified Sites import was rejected: ${fatalIssue.message}`);
  return saveVerifiedSitesDocument(validated.value);
}

export function loadFmhyDirectorySnapshot(): FmhyDirectorySnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(FMHY_SNAPSHOT_STORAGE_KEY) ?? 'null') as Partial<FmhyDirectorySnapshot> | null;
    if (parsed?.version !== 1 || parsed.sourceUrl !== 'https://fmhy.net/video' || typeof parsed.capturedAt !== 'string'
      || typeof parsed.html !== 'string' || typeof parsed.entryCount !== 'number') return fmhySnapshotMemory;
    fmhySnapshotMemory = parsed as FmhyDirectorySnapshot;
    return fmhySnapshotMemory;
  } catch { return fmhySnapshotMemory; }
}

export function saveFmhyDirectorySnapshot(html: string, entryCount: number, capturedAt = new Date().toISOString()): FmhyDirectorySnapshot {
  const snapshot: FmhyDirectorySnapshot = { version: 1, sourceUrl: 'https://fmhy.net/video', capturedAt, html, entryCount };
  fmhySnapshotMemory = snapshot;
  writeLocalStorageJson(FMHY_SNAPSHOT_STORAGE_KEY, snapshot);
  return snapshot;
}
