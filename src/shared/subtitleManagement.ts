/**
 * MASTER_PLAN §8 — Subtitle Management (offline preferences, versions, sync).
 *
 * The management half of §8: what the user *wants* (primary/secondary language,
 * priority order, preferred style, formats, providers and translators), which release
 * they pinned for a given shelf, and what timing correction they saved for a series.
 * It reads the provider/track catalogue from `subtitleProviders.ts` and projects it
 * into the surfaces §8 asks for — the "available subtitles" list, the version list
 * behind *replace subtitles* / *manage subtitle versions*, and a version comparison.
 *
 * Sync tooling is deliberately *offset arithmetic only*: shift by ±ms, detect an
 * offset from timing anchors the caller already has, and store the correction per
 * series (with optional per-season / per-episode overrides). Nothing here opens a
 * subtitle file to re-time it, because nothing in this phase reads files at all.
 *
 * Deliberately out of scope for this phase (do NOT add here):
 *   - downloading, writing, parsing or playing subtitle files,
 *   - provider execution, networking, scraping, authentication,
 *   - handing files to an external player (that is §9),
 *   - clock access: timestamps are stored/validated, never generated here. The store
 *     layer supplies the clock.
 * Everything below is pure, synchronous, and deterministic. Nothing here does I/O.
 */

import {
  normalizeSubtitleLanguage,
  normalizeSubtitleProvidersDocument,
  selectSubtitleTracks,
  subtitleTrackQualityScore,
  SUBTITLE_FORMATS,
  SUBTITLE_STYLES,
  type SubtitleFormat,
  type SubtitleProvidersDocument,
  type SubtitleStyle,
  type SubtitleTrack,
} from './subtitleProviders';
import { compareSubtitleQuality, gradeSubtitleQuality, type SubtitleQualityGrade } from './subtitleQuality';

export const SUBTITLE_MANAGEMENT_MODEL_VERSION = 1;

/** The languages §8 names explicitly. Users may add their own via `customLanguages`. */
export const BUILT_IN_SUBTITLE_LANGUAGES: string[] = ['ja', 'zh', 'ko', 'en', 'es', 'fr', 'de'];

/** Saved corrections are capped at ±1 hour — beyond that it is the wrong subtitle, not a drift. */
export const SUBTITLE_OFFSET_LIMIT_MS = 3_600_000;

export interface SubtitlePreferences {
  primaryLanguage: string | null;
  secondaryLanguage: string | null;
  /** Preferred rendering style: full subtitles / signs and songs / forced. */
  style: SubtitleStyle;
  /** Explicit fallback order after primary and secondary. */
  languagePriority: string[];
  preferredFormats: SubtitleFormat[];
  preferredProviderIds: string[];
  /** Preferred translator or fansub group names, best first. */
  preferredTranslators: string[];
  /** Extra language tags beyond {@link BUILT_IN_SUBTITLE_LANGUAGES}. */
  customLanguages: string[];
  allowHearingImpaired: boolean;
}

/** Which slice of a series an adjustment or lookup applies to. */
export interface SubtitleAdjustmentTarget {
  identityId: string;
  season?: number | null;
  episode?: number | null;
}

export interface SubtitleAdjustment {
  identityId: string;
  /** null = applies to the whole series. */
  season: number | null;
  /** null = applies to the whole season (or series when `season` is null too). */
  episode: number | null;
  offsetMs: number;
  /** ISO-8601, validated/stored only — never generated here. */
  updatedAt: string | null;
}

/** A pinned release for one (identity, language) shelf — the *replace subtitles* choice. */
export interface SubtitleSelection {
  identityId: string;
  language: string;
  trackId: string;
  updatedAt: string | null;
}

export interface SubtitleManagementDocument {
  version: typeof SUBTITLE_MANAGEMENT_MODEL_VERSION;
  preferences: SubtitlePreferences;
  adjustments: SubtitleAdjustment[];
  selections: SubtitleSelection[];
}

export interface SubtitleManagementIssue { path: string; message: string }
export interface SubtitleManagementValidationResult {
  value: SubtitleManagementDocument;
  issues: SubtitleManagementIssue[];
}

/** One language's availability on a shelf — the data behind "English ✓ Japanese ✓". */
export interface SubtitleAvailabilityEntry {
  language: string;
  trackCount: number;
  formats: SubtitleFormat[];
  styles: SubtitleStyle[];
  bestQualityScore: number | null;
  bestQualityGrade: SubtitleQualityGrade;
  /** True when the language is the primary, the secondary, or in the priority list. */
  preferred: boolean;
  /** Position in the resolved preference order; null when unpreferred. */
  preferenceRank: number | null;
}

export interface SubtitleVersion {
  track: SubtitleTrack;
  qualityScore: number | null;
  qualityGrade: SubtitleQualityGrade;
  /** True when this is the user's pinned choice for the shelf. */
  selected: boolean;
  /** 1-based rank under the current preferences. */
  rank: number;
}

export type SubtitleVersionPickReason = 'pinned' | 'ranked' | 'none';

export interface SubtitleVersionPick {
  language: string;
  track: SubtitleTrack | null;
  reason: SubtitleVersionPickReason;
}

export interface SubtitleSlotPlan {
  primary: SubtitleVersionPick;
  secondary: SubtitleVersionPick | null;
  /** Requested languages with no known track. */
  missingLanguages: string[];
}

export interface SubtitleVersionFieldDiff {
  field: string;
  left: string | number | boolean | null;
  right: string | number | boolean | null;
  equal: boolean;
}

export interface SubtitleVersionComparison {
  leftTrackId: string;
  rightTrackId: string;
  fields: SubtitleVersionFieldDiff[];
  differingFields: string[];
  /** left − right composite quality; null when either side is unrated. */
  qualityDelta: number | null;
  identical: boolean;
}

export type SubtitleOffsetScope = 'episode' | 'season' | 'series' | 'none';

export interface SubtitleOffsetResolution {
  offsetMs: number;
  scope: SubtitleOffsetScope;
}

/** One (subtitle time, reference time) pair the caller already measured. */
export interface SubtitleOffsetAnchor {
  subtitleMs: number;
  referenceMs: number;
}

export type SubtitleOffsetConfidence = 'high' | 'medium' | 'low' | 'none';

export interface SubtitleOffsetDetection {
  offsetMs: number | null;
  sampleCount: number;
  /** Max − min anchor delta; 0 for a single sample. */
  spreadMs: number;
  confidence: SubtitleOffsetConfidence;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number, path: string, issues: SubtitleManagementIssue[]): string {
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) issues.push({ path, message: `Trimmed to ${max} characters.` });
  return trimmed.slice(0, max);
}

function id(value: unknown, path: string, issues: SubtitleManagementIssue[]): string {
  return text(value, '', 80, path, issues).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value.trim().toLowerCase())
    ? value.trim().toLowerCase() as T
    : fallback;
}

function enumList<T extends string>(value: unknown, allowed: readonly T[], maxItems: number): T[] {
  if (!Array.isArray(value)) return [];
  const set = new Set(allowed);
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is T => set.has(item as T)))].slice(0, maxItems);
}

function languageList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeSubtitleLanguage(item)).filter(Boolean))].slice(0, maxItems);
}

function nameList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, maxItems);
}

function idList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean))].slice(0, maxItems);
}

function integer(value: unknown, fallback: number | null, min: number, max: number, path: string, issues: SubtitleManagementIssue[]): number | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'Expected a finite number.' });
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, value));
  if (bounded !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return Math.trunc(bounded);
}

function isoDateTime(value: unknown, path: string, issues: SubtitleManagementIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!Number.isNaN(Date.parse(trimmed))) return trimmed;
  }
  issues.push({ path, message: 'Expected an ISO-8601 date-time or null.' });
  return null;
}

export function createDefaultSubtitlePreferences(): SubtitlePreferences {
  return {
    primaryLanguage: null,
    secondaryLanguage: null,
    style: 'full',
    languagePriority: [],
    preferredFormats: [],
    preferredProviderIds: [],
    preferredTranslators: [],
    customLanguages: [],
    allowHearingImpaired: true,
  };
}

export function createEmptySubtitleManagementDocument(): SubtitleManagementDocument {
  return {
    version: SUBTITLE_MANAGEMENT_MODEL_VERSION,
    preferences: createDefaultSubtitlePreferences(),
    adjustments: [],
    selections: [],
  };
}

function normalizePreferences(value: unknown, issues: SubtitleManagementIssue[]): SubtitlePreferences {
  const raw = isRecord(value) ? value : {};
  const primaryLanguage = normalizeSubtitleLanguage(raw.primaryLanguage) || null;
  let secondaryLanguage = normalizeSubtitleLanguage(raw.secondaryLanguage) || null;
  if (secondaryLanguage && secondaryLanguage === primaryLanguage) {
    issues.push({ path: 'preferences.secondaryLanguage', message: 'Secondary language matched the primary; cleared.' });
    secondaryLanguage = null;
  }
  return {
    primaryLanguage,
    secondaryLanguage,
    style: oneOf(raw.style, SUBTITLE_STYLES, 'full'),
    languagePriority: languageList(raw.languagePriority, 20),
    preferredFormats: enumList(raw.preferredFormats, SUBTITLE_FORMATS, SUBTITLE_FORMATS.length),
    preferredProviderIds: idList(raw.preferredProviderIds, 50),
    preferredTranslators: nameList(raw.preferredTranslators, 50, 120),
    customLanguages: languageList(raw.customLanguages, 50),
    allowHearingImpaired: raw.allowHearingImpaired !== false,
  };
}

function normalizeAdjustment(value: unknown, index: number, issues: SubtitleManagementIssue[]): SubtitleAdjustment | null {
  const prefix = `adjustments.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid subtitle adjustment.' });
    return null;
  }
  const identityId = id(value.identityId, `${prefix}.identityId`, issues);
  if (!identityId) {
    issues.push({ path: prefix, message: 'A subtitle adjustment requires an identity ID.' });
    return null;
  }
  const season = integer(value.season, null, 0, 100_000, `${prefix}.season`, issues);
  return {
    identityId,
    season,
    // An episode override is meaningless without a season to hang it on.
    episode: season === null ? null : integer(value.episode, null, 0, 100_000_000, `${prefix}.episode`, issues),
    offsetMs: integer(value.offsetMs, 0, -SUBTITLE_OFFSET_LIMIT_MS, SUBTITLE_OFFSET_LIMIT_MS, `${prefix}.offsetMs`, issues) ?? 0,
    updatedAt: isoDateTime(value.updatedAt, `${prefix}.updatedAt`, issues),
  };
}

function normalizeSelection(value: unknown, index: number, issues: SubtitleManagementIssue[]): SubtitleSelection | null {
  const prefix = `selections.${index}`;
  if (!isRecord(value)) {
    issues.push({ path: prefix, message: 'Ignored invalid subtitle selection.' });
    return null;
  }
  const identityId = id(value.identityId, `${prefix}.identityId`, issues);
  const language = normalizeSubtitleLanguage(value.language);
  const trackId = id(value.trackId, `${prefix}.trackId`, issues);
  if (!identityId || !language || !trackId) {
    issues.push({ path: prefix, message: 'A subtitle selection requires an identity ID, language, and track ID.' });
    return null;
  }
  return { identityId, language, trackId, updatedAt: isoDateTime(value.updatedAt, `${prefix}.updatedAt`, issues) };
}

/** Stable key for an adjustment's scope. */
function adjustmentKey(adjustment: SubtitleAdjustment): string {
  return `${adjustment.identityId}\0${adjustment.season ?? ''}\0${adjustment.episode ?? ''}`;
}

export function normalizeSubtitleManagementDocument(input: unknown): SubtitleManagementValidationResult {
  const issues: SubtitleManagementIssue[] = [];
  if (!isRecord(input)) {
    return {
      value: createEmptySubtitleManagementDocument(),
      issues: [{ path: '', message: 'Expected a subtitle-management document.' }],
    };
  }
  if (typeof input.version === 'number' && input.version > SUBTITLE_MANAGEMENT_MODEL_VERSION) {
    return {
      value: createEmptySubtitleManagementDocument(),
      issues: [{ path: 'version', message: 'Document was created by a newer app version.' }],
    };
  }
  const preferences = normalizePreferences(input.preferences, issues);
  const rawAdjustments = Array.isArray(input.adjustments) ? input.adjustments : [];
  const adjustments = rawAdjustments.map((item, index) => normalizeAdjustment(item, index, issues))
    .filter((item): item is SubtitleAdjustment => item !== null);
  const seenAdjustments = new Set<string>();
  const uniqueAdjustments = adjustments.filter((adjustment, index) => {
    const key = adjustmentKey(adjustment);
    if (seenAdjustments.has(key)) {
      issues.push({ path: `adjustments.${index}`, message: 'Ignored duplicate subtitle adjustment.' });
      return false;
    }
    seenAdjustments.add(key);
    return true;
  });
  const rawSelections = Array.isArray(input.selections) ? input.selections : [];
  const selections = rawSelections.map((item, index) => normalizeSelection(item, index, issues))
    .filter((item): item is SubtitleSelection => item !== null);
  const seenSelections = new Set<string>();
  const uniqueSelections = selections.filter((selection, index) => {
    const key = `${selection.identityId}\0${selection.language}`;
    if (seenSelections.has(key)) {
      issues.push({ path: `selections.${index}`, message: 'Ignored duplicate subtitle selection.' });
      return false;
    }
    seenSelections.add(key);
    return true;
  });
  return {
    value: {
      version: SUBTITLE_MANAGEMENT_MODEL_VERSION,
      preferences,
      adjustments: uniqueAdjustments,
      selections: uniqueSelections,
    },
    issues,
  };
}

/** Replaces the whole preferences block, re-validating every field. */
export function setSubtitlePreferences(
  document: SubtitleManagementDocument,
  patch: Partial<SubtitlePreferences>,
): SubtitleManagementValidationResult {
  const current = normalizeSubtitleManagementDocument(document).value;
  return normalizeSubtitleManagementDocument({ ...current, preferences: { ...current.preferences, ...patch } });
}

/**
 * The resolved language order: primary, then secondary, then the explicit priority
 * list, de-duplicated. Languages with no preference at all resolve to an empty list.
 */
export function resolveSubtitleLanguagePriority(preferences: SubtitlePreferences): string[] {
  const ordered = [preferences.primaryLanguage, preferences.secondaryLanguage, ...preferences.languagePriority];
  return [...new Set(ordered.map((item) => normalizeSubtitleLanguage(item)).filter(Boolean))];
}

/** Every language the UI may offer: the built-ins plus the user's custom tags. */
export function listSupportedSubtitleLanguages(preferences: SubtitlePreferences): string[] {
  return [...new Set([...BUILT_IN_SUBTITLE_LANGUAGES, ...preferences.customLanguages])];
}

/**
 * Which languages a shelf actually has, ordered by the user's preference first and
 * alphabetically after. This is the projection behind §8's "Available subtitles" list.
 */
export function summarizeAvailableSubtitles(
  document: SubtitleProvidersDocument,
  identityId: string,
  preferences: SubtitlePreferences = createDefaultSubtitlePreferences(),
): SubtitleAvailabilityEntry[] {
  const tracks = selectSubtitleTracks(document, identityId);
  const order = resolveSubtitleLanguagePriority(preferences);
  const byLanguage = new Map<string, SubtitleTrack[]>();
  tracks.forEach((track) => {
    const bucket = byLanguage.get(track.language);
    if (bucket) bucket.push(track);
    else byLanguage.set(track.language, [track]);
  });
  const entries: SubtitleAvailabilityEntry[] = [...byLanguage.entries()].map(([language, bucket]) => {
    const best = bucket.reduce<number | null>((carry, track) => {
      const score = subtitleTrackQualityScore(track);
      if (score === null) return carry;
      return carry === null || score > carry ? score : carry;
    }, null);
    const rank = order.indexOf(language);
    return {
      language,
      trackCount: bucket.length,
      formats: [...new Set(bucket.map((track) => track.format))].sort(),
      styles: [...new Set(bucket.map((track) => track.style))].sort(),
      bestQualityScore: best,
      bestQualityGrade: gradeSubtitleQuality(best),
      preferred: rank >= 0,
      preferenceRank: rank >= 0 ? rank : null,
    };
  });
  return entries.sort((left, right) => {
    const leftRank = left.preferenceRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.preferenceRank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.language.localeCompare(right.language);
  });
}

/** Position in a preference list, with unlisted entries sorting last. */
function preferenceIndex(list: string[], value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const index = list.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

/**
 * Ranks the releases available for one (identity, language) shelf. The order is
 * explicit and total: preferred provider, then preferred style, then preferred
 * translator, then preferred format, then composite quality, then track ID.
 * Hearing-impaired releases are excluded when the user disallows them — unless that
 * would empty the shelf, in which case they are kept and ranked last.
 */
export function listSubtitleVersions(
  document: SubtitleProvidersDocument,
  management: SubtitleManagementDocument,
  identityId: string,
  language: string,
): SubtitleVersion[] {
  const settings = normalizeSubtitleManagementDocument(management).value;
  const { preferences } = settings;
  const normalizedIdentity = identityId.trim().toLowerCase();
  const normalizedLanguage = normalizeSubtitleLanguage(language);
  const all = selectSubtitleTracks(document, normalizedIdentity, normalizedLanguage);
  const allowed = preferences.allowHearingImpaired ? all : all.filter((track) => !track.hearingImpaired);
  const pool = allowed.length > 0 ? allowed : all;
  const selection = settings.selections.find((item) => item.identityId === normalizedIdentity
    && item.language === normalizedLanguage);
  const ranked = [...pool].sort((left, right) =>
    preferenceIndex(preferences.preferredProviderIds, left.providerId) - preferenceIndex(preferences.preferredProviderIds, right.providerId)
    || Number(right.style === preferences.style) - Number(left.style === preferences.style)
    || preferenceIndex(preferences.preferredTranslators, left.translator) - preferenceIndex(preferences.preferredTranslators, right.translator)
    || preferenceIndex(preferences.preferredFormats, left.format) - preferenceIndex(preferences.preferredFormats, right.format)
    || compareSubtitleQuality(subtitleTrackQualityScore(left), subtitleTrackQualityScore(right))
    || left.id.localeCompare(right.id));
  return ranked.map((track, index) => {
    const score = subtitleTrackQualityScore(track);
    return {
      track,
      qualityScore: score,
      qualityGrade: gradeSubtitleQuality(score),
      selected: selection?.trackId === track.id,
      rank: index + 1,
    };
  });
}

/** The release to use for a shelf: the pinned one when it still exists, else the top-ranked. */
export function pickSubtitleVersion(
  document: SubtitleProvidersDocument,
  management: SubtitleManagementDocument,
  identityId: string,
  language: string,
): SubtitleVersionPick {
  const normalizedLanguage = normalizeSubtitleLanguage(language);
  const versions = listSubtitleVersions(document, management, identityId, normalizedLanguage);
  const pinned = versions.find((version) => version.selected);
  if (pinned) return { language: normalizedLanguage, track: pinned.track, reason: 'pinned' };
  const top = versions[0];
  return top
    ? { language: normalizedLanguage, track: top.track, reason: 'ranked' }
    : { language: normalizedLanguage, track: null, reason: 'none' };
}

/**
 * Resolves the primary and secondary subtitle slots for a shelf in one pass, which is
 * what a dual-subtitle study setup needs. Returns `null` for the secondary slot when
 * no secondary language is configured.
 */
export function planSubtitleSlots(
  document: SubtitleProvidersDocument,
  management: SubtitleManagementDocument,
  identityId: string,
): SubtitleSlotPlan {
  const settings = normalizeSubtitleManagementDocument(management).value;
  const { primaryLanguage, secondaryLanguage } = settings.preferences;
  const order = resolveSubtitleLanguagePriority(settings.preferences);
  // With no primary configured, fall back to the first language the shelf actually has.
  const available = summarizeAvailableSubtitles(document, identityId, settings.preferences);
  const primaryLang = primaryLanguage ?? order[0] ?? available[0]?.language ?? '';
  const primary = primaryLang
    ? pickSubtitleVersion(document, settings, identityId, primaryLang)
    : { language: '', track: null, reason: 'none' as SubtitleVersionPickReason };
  const secondary = secondaryLanguage
    ? pickSubtitleVersion(document, settings, identityId, secondaryLanguage)
    : null;
  const missingLanguages = [primary, secondary]
    .filter((slot): slot is SubtitleVersionPick => slot !== null && slot.track === null && slot.language !== '')
    .map((slot) => slot.language);
  return { primary, secondary, missingLanguages };
}

/** Pins a release for a shelf. The track must exist and match the shelf's language. */
export function selectSubtitleVersion(
  document: SubtitleProvidersDocument,
  management: SubtitleManagementDocument,
  identityId: string,
  trackId: string,
): SubtitleManagementValidationResult {
  const catalogue = normalizeSubtitleProvidersDocument(document).value;
  const current = normalizeSubtitleManagementDocument(management).value;
  const normalizedIdentity = identityId.trim().toLowerCase();
  const normalizedTrackId = trackId.trim().toLowerCase();
  const track = catalogue.tracks.find((item) => item.id === normalizedTrackId && item.identityId === normalizedIdentity);
  if (!track) {
    return { value: current, issues: [{ path: 'selections', message: 'Unknown subtitle track for this identity.' }] };
  }
  const kept = current.selections.filter((selection) => !(selection.identityId === normalizedIdentity
    && selection.language === track.language));
  return normalizeSubtitleManagementDocument({
    ...current,
    selections: [...kept, { identityId: normalizedIdentity, language: track.language, trackId: track.id, updatedAt: null }],
  });
}

/** Un-pins a shelf, returning it to preference-ranked selection. */
export function clearSubtitleVersionSelection(
  management: SubtitleManagementDocument,
  identityId: string,
  language: string,
): SubtitleManagementDocument {
  const normalizedIdentity = identityId.trim().toLowerCase();
  const normalizedLanguage = normalizeSubtitleLanguage(language);
  return normalizeSubtitleManagementDocument({
    ...management,
    selections: management.selections.filter((selection) => !(selection.identityId === normalizedIdentity
      && selection.language === normalizedLanguage)),
  }).value;
}

const COMPARED_FIELDS: { field: string; read: (track: SubtitleTrack) => string | number | boolean | null }[] = [
  { field: 'providerId', read: (track) => track.providerId },
  { field: 'language', read: (track) => track.language },
  { field: 'format', read: (track) => track.format },
  { field: 'style', read: (track) => track.style },
  { field: 'season', read: (track) => track.season },
  { field: 'episode', read: (track) => track.episode },
  { field: 'year', read: (track) => track.year },
  { field: 'releaseGroup', read: (track) => track.releaseGroup },
  { field: 'translator', read: (track) => track.translator },
  { field: 'durationSeconds', read: (track) => track.durationSeconds },
  { field: 'hearingImpaired', read: (track) => track.hearingImpaired },
  { field: 'qualityScore', read: (track) => subtitleTrackQualityScore(track) },
];

/**
 * Field-by-field comparison of two releases — the data behind §8's "compare
 * subtitles". It compares *release metadata*, not cue text: this phase never reads a
 * subtitle file.
 */
export function compareSubtitleVersions(left: SubtitleTrack, right: SubtitleTrack): SubtitleVersionComparison {
  const fields: SubtitleVersionFieldDiff[] = COMPARED_FIELDS.map(({ field, read }) => {
    const leftValue = read(left);
    const rightValue = read(right);
    return { field, left: leftValue, right: rightValue, equal: leftValue === rightValue };
  });
  const leftScore = subtitleTrackQualityScore(left);
  const rightScore = subtitleTrackQualityScore(right);
  const differingFields = fields.filter((entry) => !entry.equal).map((entry) => entry.field);
  return {
    leftTrackId: left.id,
    rightTrackId: right.id,
    fields,
    differingFields,
    qualityDelta: leftScore === null || rightScore === null ? null : Math.round((leftScore - rightScore) * 10) / 10,
    identical: differingFields.length === 0,
  };
}

/**
 * The saved timing correction for a slice of a series. Lookup narrows from the most
 * specific scope outwards: this episode → this season → the series → none (0 ms).
 */
export function resolveSubtitleOffset(
  management: SubtitleManagementDocument,
  target: SubtitleAdjustmentTarget,
): SubtitleOffsetResolution {
  const current = normalizeSubtitleManagementDocument(management).value;
  const identityId = target.identityId.trim().toLowerCase();
  const season = typeof target.season === 'number' && Number.isFinite(target.season) ? Math.trunc(target.season) : null;
  const episode = typeof target.episode === 'number' && Number.isFinite(target.episode) ? Math.trunc(target.episode) : null;
  const forIdentity = current.adjustments.filter((adjustment) => adjustment.identityId === identityId);
  if (season !== null && episode !== null) {
    const exact = forIdentity.find((adjustment) => adjustment.season === season && adjustment.episode === episode);
    if (exact) return { offsetMs: exact.offsetMs, scope: 'episode' };
  }
  if (season !== null) {
    const seasonWide = forIdentity.find((adjustment) => adjustment.season === season && adjustment.episode === null);
    if (seasonWide) return { offsetMs: seasonWide.offsetMs, scope: 'season' };
  }
  const seriesWide = forIdentity.find((adjustment) => adjustment.season === null && adjustment.episode === null);
  if (seriesWide) return { offsetMs: seriesWide.offsetMs, scope: 'series' };
  return { offsetMs: 0, scope: 'none' };
}

/** Writes an absolute offset for the target's own scope, replacing any previous value. */
export function setSubtitleOffset(
  management: SubtitleManagementDocument,
  target: SubtitleAdjustmentTarget,
  offsetMs: number,
): SubtitleManagementValidationResult {
  const current = normalizeSubtitleManagementDocument(management).value;
  const identityId = target.identityId.trim().toLowerCase();
  if (!identityId) {
    return { value: current, issues: [{ path: 'adjustments', message: 'A subtitle adjustment requires an identity ID.' }] };
  }
  const season = typeof target.season === 'number' && Number.isFinite(target.season) ? Math.trunc(target.season) : null;
  const episode = season === null ? null
    : (typeof target.episode === 'number' && Number.isFinite(target.episode) ? Math.trunc(target.episode) : null);
  const kept = current.adjustments.filter((adjustment) => !(adjustment.identityId === identityId
    && adjustment.season === season
    && adjustment.episode === episode));
  return normalizeSubtitleManagementDocument({
    ...current,
    adjustments: [...kept, { identityId, season, episode, offsetMs, updatedAt: null }],
  });
}

/**
 * Shifts subtitles by ±ms. The delta is applied to the *effective* offset for the
 * target (inherited from the season or series when the episode has no entry of its
 * own), and the result is written at the target's scope.
 */
export function shiftSubtitleOffset(
  management: SubtitleManagementDocument,
  target: SubtitleAdjustmentTarget,
  deltaMs: number,
): SubtitleManagementValidationResult {
  const base = resolveSubtitleOffset(management, target).offsetMs;
  const delta = typeof deltaMs === 'number' && Number.isFinite(deltaMs) ? Math.trunc(deltaMs) : 0;
  return setSubtitleOffset(management, target, base + delta);
}

/** Drops the adjustment stored at exactly this scope, if any. */
export function clearSubtitleOffset(
  management: SubtitleManagementDocument,
  target: SubtitleAdjustmentTarget,
): SubtitleManagementDocument {
  const current = normalizeSubtitleManagementDocument(management).value;
  const identityId = target.identityId.trim().toLowerCase();
  const season = typeof target.season === 'number' && Number.isFinite(target.season) ? Math.trunc(target.season) : null;
  const episode = season === null ? null
    : (typeof target.episode === 'number' && Number.isFinite(target.episode) ? Math.trunc(target.episode) : null);
  return normalizeSubtitleManagementDocument({
    ...current,
    adjustments: current.adjustments.filter((adjustment) => !(adjustment.identityId === identityId
      && adjustment.season === season
      && adjustment.episode === episode)),
  }).value;
}

/**
 * Auto-detects an offset from timing anchors the caller measured elsewhere (a matched
 * line, a chapter mark). The estimate is the **median** delta, so one bad anchor can't
 * drag it, and the spread reports how much the anchors disagree. Deterministic: it
 * reads no files and touches no clock.
 */
export function detectSubtitleOffset(anchors: SubtitleOffsetAnchor[]): SubtitleOffsetDetection {
  const deltas = (Array.isArray(anchors) ? anchors : [])
    .filter((anchor): anchor is SubtitleOffsetAnchor => Boolean(anchor)
      && typeof anchor.subtitleMs === 'number' && Number.isFinite(anchor.subtitleMs)
      && typeof anchor.referenceMs === 'number' && Number.isFinite(anchor.referenceMs))
    .map((anchor) => anchor.referenceMs - anchor.subtitleMs)
    .sort((left, right) => left - right);
  if (deltas.length === 0) {
    return { offsetMs: null, sampleCount: 0, spreadMs: 0, confidence: 'none' };
  }
  const middle = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 === 1 ? deltas[middle] : (deltas[middle - 1] + deltas[middle]) / 2;
  const spread = deltas[deltas.length - 1] - deltas[0];
  let confidence: SubtitleOffsetConfidence = 'low';
  if (deltas.length >= 3 && spread <= 250) confidence = 'high';
  else if (deltas.length >= 2 && spread <= 1_000) confidence = 'medium';
  const bounded = Math.min(SUBTITLE_OFFSET_LIMIT_MS, Math.max(-SUBTITLE_OFFSET_LIMIT_MS, Math.round(median)));
  return { offsetMs: bounded, sampleCount: deltas.length, spreadMs: Math.round(spread), confidence };
}
