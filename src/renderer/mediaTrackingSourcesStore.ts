import { createEmptyMediaTrackingSourcesDocument, normalizeMediaTrackingSourcesDocument, reorderMediaTrackingSources, setMediaTrackingSourceEnabled, updateTrackingSourceHealth, type MediaTrackingSourcesDocument, type TrackingSourceHealthPatch } from '../shared/mediaTrackingSources';

export const MEDIA_TRACKING_SOURCES_STORAGE_KEY = 'jp-media-tracking-sources-v1';
export const MEDIA_TRACKING_SOURCES_AUDIT_STORAGE_KEY = 'jp-media-tracking-sources-audit-v1';
export const MEDIA_TRACKING_SOURCES_AUDIT_RETENTION_STORAGE_KEY = 'jp-media-tracking-sources-audit-retention-v1';
const DEFAULT_AUDIT_RETENTION = 20;
const MAX_AUDIT_RETENTION = 200;

export interface TrackingSourceAuditEntry {
  sequence: number;
  identityId: string;
  sourceId: string;
  sourceName: string;
  changedAt: string;
  patch: TrackingSourceHealthPatch;
  before: TrackingSourceHealthPatch;
  after: TrackingSourceHealthPatch;
}

type StoredTrackingSourceAuditEntry = Partial<TrackingSourceAuditEntry> & Pick<TrackingSourceAuditEntry, 'identityId' | 'sourceId' | 'sourceName' | 'changedAt' | 'patch' | 'before' | 'after'>;

const byAuditOrder = (left: TrackingSourceAuditEntry, right: TrackingSourceAuditEntry) => right.sequence - left.sequence || right.changedAt.localeCompare(left.changedAt) || left.identityId.localeCompare(right.identityId) || left.sourceId.localeCompare(right.sourceId);
const compactPatch = (patch: TrackingSourceHealthPatch): TrackingSourceHealthPatch => ({ status: patch.status, lastCheckedAt: patch.lastCheckedAt ?? null, reliabilityScore: patch.reliabilityScore ?? null, newEpisodeDetected: patch.newEpisodeDetected, nextEpisodeNumber: patch.nextEpisodeNumber ?? null });
const toFiniteRetention = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(MAX_AUDIT_RETENTION, Math.trunc(value))) : DEFAULT_AUDIT_RETENTION;

export function loadMediaTrackingSourcesDocument(): MediaTrackingSourcesDocument {
  try {
    const raw = localStorage.getItem(MEDIA_TRACKING_SOURCES_STORAGE_KEY);
    return raw ? normalizeMediaTrackingSourcesDocument(JSON.parse(raw)) : createEmptyMediaTrackingSourcesDocument();
  } catch {
    return createEmptyMediaTrackingSourcesDocument();
  }
}

export function saveMediaTrackingSourcesDocument(input: unknown): MediaTrackingSourcesDocument {
  const value = normalizeMediaTrackingSourcesDocument(input);
  try {
    localStorage.setItem(MEDIA_TRACKING_SOURCES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* local fallback is the normalized return value */
  }
  return value;
}

function normalizeAuditEntry(entry: StoredTrackingSourceAuditEntry, sequence: number): TrackingSourceAuditEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const auditSequence = typeof entry.sequence === 'number' && Number.isFinite(entry.sequence) ? Math.max(1, Math.trunc(entry.sequence)) : sequence;
  return {
    sequence: auditSequence,
    identityId: entry.identityId,
    sourceId: entry.sourceId,
    sourceName: entry.sourceName,
    changedAt: new Date(entry.changedAt).toISOString(),
    patch: compactPatch(entry.patch),
    before: compactPatch(entry.before),
    after: compactPatch(entry.after),
  };
}

function readAuditRetention(): number {
  try {
    return toFiniteRetention(localStorage.getItem(MEDIA_TRACKING_SOURCES_AUDIT_RETENTION_STORAGE_KEY) ? JSON.parse(localStorage.getItem(MEDIA_TRACKING_SOURCES_AUDIT_RETENTION_STORAGE_KEY) as string) : DEFAULT_AUDIT_RETENTION);
  } catch {
    return DEFAULT_AUDIT_RETENTION;
  }
}

export function loadTrackingSourceAuditRetention(): number {
  return readAuditRetention();
}

export function saveTrackingSourceAuditRetention(retention: number): number {
  const normalized = toFiniteRetention(retention);
  try {
    localStorage.setItem(MEDIA_TRACKING_SOURCES_AUDIT_RETENTION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* best-effort local preference */
  }
  return normalized;
}

export function loadTrackingSourceAudit(): TrackingSourceAuditEntry[] {
  try {
    const raw = localStorage.getItem(MEDIA_TRACKING_SOURCES_AUDIT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(parsed) ? parsed.flatMap((entry, index) => {
      const normalized = normalizeAuditEntry(entry as StoredTrackingSourceAuditEntry, index + 1);
      return normalized ? [normalized] : [];
    }) : [];
    return entries.sort(byAuditOrder);
  } catch {
    return [];
  }
}

function saveTrackingSourceAudit(entries: TrackingSourceAuditEntry[], retention = readAuditRetention()): void {
  const normalized = [...entries].sort(byAuditOrder).slice(0, retention);
  try {
    localStorage.setItem(MEDIA_TRACKING_SOURCES_AUDIT_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* audit history is a best-effort local convenience */
  }
}

export function clearTrackingSourceAudit(): void {
  try {
    localStorage.removeItem(MEDIA_TRACKING_SOURCES_AUDIT_STORAGE_KEY);
  } catch {
    /* best-effort local cleanup */
  }
}

export function exportTrackingSourceAudit(): string {
  const payload = { version: 1, exportedAt: new Date().toISOString(), retention: loadTrackingSourceAuditRetention(), entries: loadTrackingSourceAudit() };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function getTrackingSourceAuditSummary() {
  const entries = loadTrackingSourceAudit();
  return { entries, count: entries.length, retention: loadTrackingSourceAuditRetention(), latestChangedAt: entries[0]?.changedAt ?? null };
}

export function setTrackingSourceEnabled(sourceId: string, enabled: boolean): MediaTrackingSourcesDocument {
  const value = setMediaTrackingSourceEnabled(loadMediaTrackingSourcesDocument(), sourceId, enabled);
  return saveMediaTrackingSourcesDocument(value);
}

export function setTrackingSourceOrder(sourceIds: string[]): MediaTrackingSourcesDocument {
  return saveMediaTrackingSourcesDocument(reorderMediaTrackingSources(loadMediaTrackingSourcesDocument(), sourceIds));
}

export function updateTrackingSource(identityId: string, sourceId: string, patch: TrackingSourceHealthPatch): MediaTrackingSourcesDocument {
  const current = loadMediaTrackingSourcesDocument();
  const target = current.rows.find((row) => row.identityId === identityId && row.sourceId === sourceId);
  const value = saveMediaTrackingSourcesDocument(updateTrackingSourceHealth(current, identityId, sourceId, patch));
  if (target) {
    const next = value.rows.find((row) => row.identityId === identityId && row.sourceId === sourceId);
    const history = loadTrackingSourceAudit();
    const sequence = history.reduce((max, entry) => Math.max(max, entry.sequence), 0) + 1;
    saveTrackingSourceAudit([{ sequence, identityId, sourceId, sourceName: target.sourceName, changedAt: new Date().toISOString(), patch: compactPatch(patch), before: compactPatch(target), after: compactPatch(next ?? target) }, ...history]);
  }
  return value;
}
