/** Offline §11 source-monitoring contracts and deterministic projections. */
export const MEDIA_TRACKING_SOURCES_VERSION = 1;
export type TrackingSourceStatus = 'unknown' | 'working' | 'slow' | 'failed' | 'disabled';
export interface TrackingSourceRow { identityId: string; sourceId: string; sourceName: string; enabled: boolean; lastCheckedAt: string | null; status: TrackingSourceStatus; reliabilityScore: number | null; newEpisodeDetected: boolean; nextEpisodeNumber: number | null; }
export interface MediaTrackingSourcesDocument { version: typeof MEDIA_TRACKING_SOURCES_VERSION; sourceOrder: string[]; disabledSourceIds: string[]; rows: TrackingSourceRow[]; }
export interface MediaTrackingSourceProjection extends TrackingSourceRow { priority: number; }
export interface TrackingSourceCatalogueEntry { sourceId: string; sourceName: string; kind: 'verified-site' | 'media-provider'; enabled: boolean; reliabilityScore: number | null; }
export interface MediaTrackingAggregate { identityId: string; monitoredCount: number; availableCount: number; newEpisodeCount: number; confidenceScore: number | null; sourceIds: string[]; }
type Obj = Record<string, unknown>;
const STATUSES: TrackingSourceStatus[] = ['unknown', 'working', 'slow', 'failed', 'disabled'];
const text = (v: unknown, fallback = '', max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : fallback;
const id = (v: unknown) => text(v, '', 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
const date = (v: unknown): string | null => typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
const number = (v: unknown, max = 100_000_000): number | null => typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.min(max, Math.trunc(v))) : null;
export function createEmptyMediaTrackingSourcesDocument(): MediaTrackingSourcesDocument { return { version: MEDIA_TRACKING_SOURCES_VERSION, sourceOrder: [], disabledSourceIds: [], rows: [] }; }
export function normalizeMediaTrackingSourcesDocument(input: unknown): MediaTrackingSourcesDocument {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Obj : {};
  const sourceOrder = Array.isArray(raw.sourceOrder) ? [...new Set(raw.sourceOrder.map(id).filter(Boolean))] : [];
  const disabledSourceIds = Array.isArray(raw.disabledSourceIds) ? [...new Set(raw.disabledSourceIds.map(id).filter(Boolean))] : [];
  const rows: TrackingSourceRow[] = Array.isArray(raw.rows) ? raw.rows.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const row = value as Obj; const identityId = id(row.identityId); const sourceId = id(row.sourceId);
    if (!identityId || !sourceId) return [];
    const status = STATUSES.includes(row.status as TrackingSourceStatus) ? row.status as TrackingSourceStatus : 'unknown';
    return [{ identityId, sourceId, sourceName: text(row.sourceName, sourceId), enabled: row.enabled !== false && !disabledSourceIds.includes(sourceId), lastCheckedAt: date(row.lastCheckedAt), status, reliabilityScore: typeof row.reliabilityScore === 'number' && Number.isFinite(row.reliabilityScore) ? Math.max(0, Math.min(100, row.reliabilityScore)) : null, newEpisodeDetected: row.newEpisodeDetected === true, nextEpisodeNumber: number(row.nextEpisodeNumber) }];
  }) : [];
  return { version: MEDIA_TRACKING_SOURCES_VERSION, sourceOrder, disabledSourceIds, rows };
}
export function projectMediaTrackingSources(document: MediaTrackingSourcesDocument, identityId?: string): MediaTrackingSourceProjection[] {
  const normalized = normalizeMediaTrackingSourcesDocument(document); const order = new Map(normalized.sourceOrder.map((value, index) => [value, index]));
  return normalized.rows.filter((row) => !identityId || row.identityId === identityId).map((row) => ({ ...row, priority: order.get(row.sourceId) ?? normalized.sourceOrder.length + 1000 })).sort((a, b) => a.priority - b.priority || a.sourceName.localeCompare(b.sourceName) || a.sourceId.localeCompare(b.sourceId));
}
export function setMediaTrackingSourceEnabled(document: MediaTrackingSourcesDocument, sourceId: string, enabled: boolean): MediaTrackingSourcesDocument { const idValue = id(sourceId); const disabled = document.disabledSourceIds.filter((value) => value !== idValue); if (!enabled && !disabled.includes(idValue)) disabled.push(idValue); return normalizeMediaTrackingSourcesDocument({ ...document, disabledSourceIds: disabled, rows: document.rows.map((row) => row.sourceId === idValue ? { ...row, enabled } : row) }); }
export function reorderMediaTrackingSources(document: MediaTrackingSourcesDocument, sourceIds: string[]): MediaTrackingSourcesDocument { return normalizeMediaTrackingSourcesDocument({ ...document, sourceOrder: sourceIds }); }

/** Joins the two existing local catalogues into inert source-assignment choices. */
export function buildTrackingSourceCatalogue(verifiedSites: Array<{ id: string; name: string; active: boolean; reliabilityScore: number | null }>, providers: Array<{ id: string; name: string; enabled: boolean; reliabilityScore: number | null }>): TrackingSourceCatalogueEntry[] {
  return [...verifiedSites.map((site) => ({ sourceId: site.id, sourceName: site.name, kind: 'verified-site' as const, enabled: site.active, reliabilityScore: site.reliabilityScore })), ...providers.map((provider) => ({ sourceId: provider.id, sourceName: provider.name, kind: 'media-provider' as const, enabled: provider.enabled, reliabilityScore: provider.reliabilityScore }))].sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.sourceId.localeCompare(b.sourceId));
}

export function assignTrackingSource(document: MediaTrackingSourcesDocument, identityId: string, source: TrackingSourceCatalogueEntry): MediaTrackingSourcesDocument {
  const rows = document.rows.some((row) => row.identityId === identityId && row.sourceId === source.sourceId) ? document.rows : [...document.rows, { identityId, sourceId: source.sourceId, sourceName: source.sourceName, enabled: source.enabled, lastCheckedAt: null, status: source.enabled ? 'unknown' as const : 'disabled' as const, reliabilityScore: source.reliabilityScore, newEpisodeDetected: false, nextEpisodeNumber: null }];
  return normalizeMediaTrackingSourcesDocument({ ...document, rows, sourceOrder: document.sourceOrder.includes(source.sourceId) ? document.sourceOrder : [...document.sourceOrder, source.sourceId] });
}

export type TrackingSourceHealthPatch = Partial<Pick<TrackingSourceRow, 'status' | 'lastCheckedAt' | 'reliabilityScore' | 'newEpisodeDetected' | 'nextEpisodeNumber'>>;
export function updateTrackingSourceHealth(document: MediaTrackingSourcesDocument, identityId: string, sourceId: string, patch: TrackingSourceHealthPatch): MediaTrackingSourcesDocument {
  return normalizeMediaTrackingSourcesDocument({ ...document, rows: document.rows.map((row) => row.identityId === id(identityId) && row.sourceId === id(sourceId) ? { ...row, ...patch } : row) });
}

export function projectMediaTrackingAggregates(document: MediaTrackingSourcesDocument): MediaTrackingAggregate[] {
  const grouped = new Map<string, TrackingSourceRow[]>();
  normalizeMediaTrackingSourcesDocument(document).rows.forEach((row) => { const existing = grouped.get(row.identityId); if (existing) existing.push(row); else grouped.set(row.identityId, [row]); });
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([identityId, rows]) => { const monitored = rows.filter((row) => row.enabled); const knownReliability = monitored.map((row) => row.reliabilityScore).filter((value): value is number => value !== null); return { identityId, monitoredCount: monitored.length, availableCount: monitored.filter((row) => row.status === 'working').length, newEpisodeCount: monitored.filter((row) => row.newEpisodeDetected).length, confidenceScore: knownReliability.length ? Math.round(knownReliability.reduce((sum, value) => sum + value, 0) / knownReliability.length) : null, sourceIds: monitored.map((row) => row.sourceId).sort() }; });
}
