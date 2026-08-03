export const VIDEO_SERVER_PROFILES_VERSION = 3;

export type VideoServerProfileStatus = 'active' | 'experimental' | 'inactive' | 'deprecated';

export interface VideoServerCapabilities {
  streamDiscovery: boolean;
  multipleQualities: boolean;
  subtitles: boolean;
  multipleAudioTracks: boolean;
  episodeSwitching: boolean;
  mirrors: boolean;
  resumePlayback: boolean;
  authorizedDownloads: boolean;
  thumbnails: boolean;
  chapters: boolean;
}

export interface VideoServerWebsiteCompatibility {
  websiteId: string;
  reliabilityScore: number | null;
  lastVerifiedAt: string | null;
  preferredByDefault: boolean;
  detectionSuccessRate: number | null;
  averageExtractionTimeMs: number | null;
  notes: string;
}

/** Inert connector configuration. This phase stores these values but never executes them. */
export interface VideoServerDefinition {
  detectionRules: string[];
  domSelectors: Record<string, string[]>;
  apiEndpoints: string[];
  metadataRules: string[];
  streamRules: string[];
  subtitleRules: string[];
  audioTrackRules: string[];
  qualityRules: string[];
  fallbackStrategy: string | null;
  timeoutMs: number;
  retryAttempts: number;
  customHeaders: Record<string, string>;
  javascriptRequired: boolean;
}

export interface VideoServerProfile {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string;
  provider: string;
  supportedWebsiteIds: string[];
  profileVersion: number;
  lastVerifiedAt: string | null;
  reliabilityScore: number;
  averageResponseTimeMs: number | null;
  status: VideoServerProfileStatus;
  notes: string;
  capabilities: VideoServerCapabilities;
  websiteCompatibility: VideoServerWebsiteCompatibility[];
  definition: VideoServerDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface VideoServerProfilesDocument {
  version: typeof VIDEO_SERVER_PROFILES_VERSION;
  profiles: VideoServerProfile[];
  preferences: VideoServerPreferences;
}

export interface VideoServerPreferences {
  globalOrder: string[];
  websiteOrders: Record<string, string[]>;
}

export interface VideoServerProfileIssue { path: string; message: string }
export interface VideoServerProfilesValidationResult {
  value: VideoServerProfilesDocument;
  issues: VideoServerProfileIssue[];
}

type UnknownRecord = Record<string, unknown>;
const STATUSES: VideoServerProfileStatus[] = ['active', 'experimental', 'inactive', 'deprecated'];
const CAPABILITY_KEYS = ['streamDiscovery', 'multipleQualities', 'subtitles', 'multipleAudioTracks', 'episodeSwitching', 'mirrors', 'resumePlayback', 'authorizedDownloads', 'thumbnails', 'chapters'] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number, path: string, issues: VideoServerProfileIssue[]): string {
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) issues.push({ path, message: `Trimmed to ${max} characters.` });
  return trimmed.slice(0, max);
}

function boundedNumber(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: VideoServerProfileIssue[]): number | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'Expected a finite number.' });
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, value));
  if (bounded !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return bounded;
}

function isoDate(value: unknown, path: string, issues: VideoServerProfileIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  issues.push({ path, message: 'Expected an ISO date or null.' });
  return null;
}

function httpUrl(value: unknown, path: string, issues: VideoServerProfileIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch { /* report below */ }
  }
  issues.push({ path, message: 'Expected an HTTP(S) URL or null.' });
  return null;
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function stringMap(value: unknown, path: string, issues: VideoServerProfileIssue[]): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push({ path, message: 'Expected a text map.' });
    return {};
  }
  const blockedHeaders = new Set(['authorization', 'cookie', 'proxy-authorization']);
  return Object.fromEntries(Object.entries(value).slice(0, 50).flatMap(([key, item]) => {
    const safeKey = key.trim().slice(0, 100);
    if (blockedHeaders.has(safeKey.toLowerCase())) {
      issues.push({ path: `${path}.${safeKey}`, message: 'Credential-bearing headers are not stored in server profiles.' });
      return [];
    }
    return safeKey && typeof item === 'string' ? [[safeKey, item.trim().slice(0, 2_000)]] : [];
  }));
}

function selectorMap(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 50).flatMap(([key, item]) => {
    const safeKey = key.trim().slice(0, 100);
    const selectors = stringList(item, 20, 500);
    return safeKey && selectors.length ? [[safeKey, selectors]] : [];
  }));
}

export function createEmptyVideoServerProfilesDocument(): VideoServerProfilesDocument {
  return { version: VIDEO_SERVER_PROFILES_VERSION, profiles: [], preferences: { globalOrder: [], websiteOrders: {} } };
}

function normalizePreferences(value: unknown, profileIds: Set<string>, issues: VideoServerProfileIssue[]): VideoServerPreferences {
  const source = isRecord(value) ? value : {};
  const normalizeOrder = (input: unknown, path: string) => stringList(input, 500, 64)
    .map((id) => id.toLowerCase())
    .filter((id) => {
      if (profileIds.has(id)) return true;
      issues.push({ path, message: `Removed unknown server profile ID "${id}".` });
      return false;
    });
  const websiteOrders = isRecord(source.websiteOrders) ? Object.fromEntries(Object.entries(source.websiteOrders).slice(0, 500).flatMap(([websiteId, order]) => {
    const safeWebsiteId = websiteId.trim().toLowerCase().slice(0, 64);
    return safeWebsiteId ? [[safeWebsiteId, normalizeOrder(order, `preferences.websiteOrders.${safeWebsiteId}`)]] : [];
  })) : {};
  return { globalOrder: normalizeOrder(source.globalOrder, 'preferences.globalOrder'), websiteOrders };
}

function normalizeCompatibility(value: unknown, prefix: string, issues: VideoServerProfileIssue[]): VideoServerWebsiteCompatibility | null {
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid website compatibility.' });
    return null;
  }
  const websiteId = text(value.websiteId ?? value.siteId, '', 64, `${prefix}.websiteId`, issues).toLowerCase();
  if (!websiteId) {
    issues.push({ path: prefix, message: 'Website compatibility requires a website ID.' });
    return null;
  }
  return {
    websiteId,
    reliabilityScore: boundedNumber(value.reliabilityScore, null, 0, 100, `${prefix}.reliabilityScore`, issues),
    lastVerifiedAt: isoDate(value.lastVerifiedAt ?? value.lastVerified, `${prefix}.lastVerifiedAt`, issues),
    preferredByDefault: value.preferredByDefault === true,
    detectionSuccessRate: boundedNumber(value.detectionSuccessRate, null, 0, 100, `${prefix}.detectionSuccessRate`, issues),
    averageExtractionTimeMs: boundedNumber(value.averageExtractionTimeMs, null, 0, 3_600_000, `${prefix}.averageExtractionTimeMs`, issues),
    notes: text(value.notes, '', 1_000, `${prefix}.notes`, issues),
  };
}

function normalizeProfile(value: unknown, index: number, now: string, issues: VideoServerProfileIssue[]): VideoServerProfile | null {
  const prefix = `profiles.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid server profile.' });
    return null;
  }
  const id = text(value.id ?? value.serverId, '', 64, `${prefix}.id`, issues).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  const name = text(value.name ?? value.serverName, '', 100, `${prefix}.name`, issues);
  if (!id || !name) {
    issues.push({ path: prefix, message: 'A server profile requires an ID and name.' });
    return null;
  }
  const rawCapabilities = isRecord(value.capabilities) ? value.capabilities : {};
  const capabilities = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, rawCapabilities[key] === true])) as unknown as VideoServerCapabilities;
  const rawDefinition = isRecord(value.definition) ? value.definition : value;
  const rawCompatibility = Array.isArray(value.websiteCompatibility) ? value.websiteCompatibility : [];
  const compatibility = rawCompatibility.map((item, compatibilityIndex) => normalizeCompatibility(item, `${prefix}.websiteCompatibility.${compatibilityIndex}`, issues))
    .filter((item): item is VideoServerWebsiteCompatibility => item !== null);
  const uniqueCompatibility = compatibility.filter((item, compatibilityIndex) => {
    const duplicate = compatibility.findIndex((candidate) => candidate.websiteId === item.websiteId) !== compatibilityIndex;
    if (duplicate) issues.push({ path: `${prefix}.websiteCompatibility.${compatibilityIndex}`, message: 'Ignored duplicate website compatibility.' });
    return !duplicate;
  });
  const status = STATUSES.includes(value.status as VideoServerProfileStatus) ? value.status as VideoServerProfileStatus : 'experimental';
  const supportedWebsiteIds = stringList(value.supportedWebsiteIds ?? value.supportedWebsites, 100, 64).map((item) => item.toLowerCase());
  for (const item of uniqueCompatibility) if (!supportedWebsiteIds.includes(item.websiteId)) supportedWebsiteIds.push(item.websiteId);
  return {
    id, name,
    iconUrl: httpUrl(value.iconUrl ?? value.icon, `${prefix}.iconUrl`, issues),
    description: text(value.description, '', 1_000, `${prefix}.description`, issues),
    provider: text(value.provider, '', 100, `${prefix}.provider`, issues),
    supportedWebsiteIds,
    profileVersion: boundedNumber(value.profileVersion ?? value.currentProfileVersion, 1, 1, 1_000_000, `${prefix}.profileVersion`, issues) ?? 1,
    lastVerifiedAt: isoDate(value.lastVerifiedAt ?? value.lastVerified, `${prefix}.lastVerifiedAt`, issues),
    reliabilityScore: boundedNumber(value.reliabilityScore, 0, 0, 100, `${prefix}.reliabilityScore`, issues) ?? 0,
    averageResponseTimeMs: boundedNumber(value.averageResponseTimeMs, null, 0, 3_600_000, `${prefix}.averageResponseTimeMs`, issues),
    status,
    notes: text(value.notes, '', 2_000, `${prefix}.notes`, issues),
    capabilities,
    websiteCompatibility: uniqueCompatibility,
    definition: {
      detectionRules: stringList(rawDefinition.detectionRules, 50, 2_000),
      domSelectors: selectorMap(rawDefinition.domSelectors),
      apiEndpoints: stringList(rawDefinition.apiEndpoints, 50, 2_000),
      metadataRules: stringList(rawDefinition.metadataRules, 50, 2_000),
      streamRules: stringList(rawDefinition.streamRules, 50, 2_000),
      subtitleRules: stringList(rawDefinition.subtitleRules, 50, 2_000),
      audioTrackRules: stringList(rawDefinition.audioTrackRules, 50, 2_000),
      qualityRules: stringList(rawDefinition.qualityRules, 50, 2_000),
      fallbackStrategy: text(rawDefinition.fallbackStrategy, '', 2_000, `${prefix}.definition.fallbackStrategy`, issues) || null,
      timeoutMs: boundedNumber(rawDefinition.timeoutMs, 15_000, 100, 300_000, `${prefix}.definition.timeoutMs`, issues) ?? 15_000,
      retryAttempts: boundedNumber(rawDefinition.retryAttempts, 2, 0, 10, `${prefix}.definition.retryAttempts`, issues) ?? 2,
      customHeaders: stringMap(rawDefinition.customHeaders, `${prefix}.definition.customHeaders`, issues),
      javascriptRequired: rawDefinition.javascriptRequired === true,
    },
    createdAt: isoDate(value.createdAt, `${prefix}.createdAt`, issues) ?? now,
    updatedAt: isoDate(value.updatedAt, `${prefix}.updatedAt`, issues) ?? now,
  };
}

export function normalizeVideoServerProfilesDocument(input: unknown, now = new Date().toISOString()): VideoServerProfilesValidationResult {
  const issues: VideoServerProfileIssue[] = [];
  if (!isRecord(input)) return { value: createEmptyVideoServerProfilesDocument(), issues: [{ path: '', message: 'Expected a video-server-profiles document.' }] };
  if (typeof input.version === 'number' && input.version > VIDEO_SERVER_PROFILES_VERSION) {
    return { value: createEmptyVideoServerProfilesDocument(), issues: [{ path: 'version', message: 'Document was created by a newer app version.' }] };
  }
  // v1 used `servers` and kept definition fields directly on each server record.
  const source = Array.isArray(input.profiles) ? input.profiles : Array.isArray(input.servers) ? input.servers : [];
  const profiles = source.map((item, index) => normalizeProfile(item, index, now, issues)).filter((item): item is VideoServerProfile => item !== null);
  const seen = new Set<string>();
  const unique = profiles.filter((profile, index) => {
    if (seen.has(profile.id)) {
      issues.push({ path: `profiles.${index}.id`, message: 'Ignored duplicate server profile ID.' });
      return false;
    }
    seen.add(profile.id);
    return true;
  });
  const preferences = normalizePreferences(input.preferences, new Set(unique.map((profile) => profile.id)), issues);
  return { value: { version: VIDEO_SERVER_PROFILES_VERSION, profiles: unique, preferences }, issues };
}

export function upsertVideoServerProfile(document: VideoServerProfilesDocument, input: unknown, now = new Date().toISOString()): VideoServerProfilesValidationResult {
  const normalized = normalizeVideoServerProfilesDocument({ profiles: [input] }, now);
  const profile = normalized.value.profiles[0];
  const current = normalizeVideoServerProfilesDocument(document, now).value;
  if (!profile) return { value: current, issues: normalized.issues };
  const existing = current.profiles.find((item) => item.id === profile.id);
  const saved = existing ? { ...profile, createdAt: existing.createdAt, updatedAt: now } : profile;
  return { value: { ...current, profiles: [...current.profiles.filter((item) => item.id !== saved.id), saved] }, issues: normalized.issues };
}

export function removeVideoServerProfile(document: VideoServerProfilesDocument, id: string): VideoServerProfilesDocument {
  return normalizeVideoServerProfilesDocument({
    ...document,
    profiles: document.profiles.filter((profile) => profile.id !== id),
  }).value;
}

/** Persists a complete explicit order. Missing profiles are appended in their current document order. */
export function setVideoServerPreferenceOrder(document: VideoServerProfilesDocument, order: string[], websiteId?: string): VideoServerProfilesDocument {
  const current = normalizeVideoServerProfilesDocument(document).value;
  const known = new Set(current.profiles.map((profile) => profile.id));
  const explicit = [...new Set(order.map((id) => id.trim().toLowerCase()))].filter((id) => known.has(id));
  const complete = [...explicit, ...current.profiles.map((profile) => profile.id).filter((id) => !explicit.includes(id))];
  const site = websiteId?.trim().toLowerCase().slice(0, 64);
  return site
    ? { ...current, preferences: { ...current.preferences, websiteOrders: { ...current.preferences.websiteOrders, [site]: complete } } }
    : { ...current, preferences: { ...current.preferences, globalOrder: complete } };
}

export function getVideoServerPreferenceOrder(document: VideoServerProfilesDocument, websiteId?: string): string[] {
  const current = normalizeVideoServerProfilesDocument(document).value;
  const site = websiteId?.trim().toLowerCase();
  const saved = site ? current.preferences.websiteOrders[site] : current.preferences.globalOrder;
  const known = current.profiles.map((profile) => profile.id);
  return [...(saved ?? []), ...known.filter((id) => !(saved ?? []).includes(id))];
}
