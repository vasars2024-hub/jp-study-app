/**
 * MASTER_PLAN §6/§7 — deterministic result merging and presentation.
 *
 * This is a pure projection over normalized, stored descriptors. Identity resolution
 * decides which records are the same work; this module only chooses and combines
 * display values. It performs no provider execution, networking, or other I/O.
 */
import { resolveMediaIdentities, type MediaIdentity } from './mediaIdentity';
import {
  normalizeMediaProvidersDocument,
  type MediaContentType,
  type MediaDescriptor,
  type MediaIdentifierRef,
  type MediaProviderAvailability,
  type MediaProvidersDocument,
} from './mediaProviders';

export type MediaResultScalarField =
  | 'title' | 'originalTitle' | 'japaneseTitle' | 'chineseTitle' | 'koreanTitle'
  | 'romajiTitle' | 'year' | 'studio' | 'director' | 'episodeCount'
  | 'broadcastNetwork' | 'episodesPerWeek' | 'country' | 'runtimeMinutes' | 'ageRating';

export interface MediaResultSource {
  descriptorId: string;
  providerId: string;
  providerName: string;
  providerItemId: string;
  priority: number;
  reliabilityScore: number | null;
  availability: MediaProviderAvailability;
}

export interface MergedMediaResult {
  identityId: string;
  partition: string;
  contentType: MediaContentType;
  title: string;
  originalTitle: string | null;
  japaneseTitle: string | null;
  chineseTitle: string | null;
  koreanTitle: string | null;
  romajiTitle: string | null;
  year: number | null;
  studio: string | null;
  director: string | null;
  episodeCount: number | null;
  broadcastNetwork: string | null;
  episodesPerWeek: number | null;
  country: string | null;
  runtimeMinutes: number | null;
  ageRating: string | null;
  alternativeTitles: string[];
  actors: string[];
  languages: string[];
  releaseRegions: string[];
  identifiers: MediaIdentifierRef[];
  availability: MediaProviderAvailability;
  sourceCount: number;
  sources: MediaResultSource[];
  /** Provider/descriptor that supplied each selected scalar display value. */
  provenance: Partial<Record<MediaResultScalarField, string>>;
  /** Distinct non-empty alternatives for scalar fields with disagreement. */
  conflicts: Partial<Record<MediaResultScalarField, Array<string | number>>>;
}

export interface MediaResultPresentationOptions {
  contentTypes?: readonly MediaContentType[];
  availability?: readonly MediaProviderAvailability[];
  query?: string;
  sortBy?: 'relevance' | 'title' | 'year' | 'source-count';
  direction?: 'asc' | 'desc';
}

const scalarFields: readonly MediaResultScalarField[] = [
  'title', 'originalTitle', 'japaneseTitle', 'chineseTitle', 'koreanTitle', 'romajiTitle',
  'year', 'studio', 'director', 'episodeCount', 'broadcastNetwork', 'episodesPerWeek',
  'country', 'runtimeMinutes', 'ageRating',
];
const availabilityRank: Record<MediaProviderAvailability, number> = {
  available: 0, degraded: 1, unknown: 2, unavailable: 3,
};

const present = (value: string | number | null): value is string | number =>
  value !== null && (typeof value !== 'string' || value.trim().length > 0);

const fold = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().trim();

function stableUnion(values: readonly string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.flat().forEach((value) => {
    const key = fold(value);
    if (key && !seen.has(key)) { seen.add(key); result.push(value); }
  });
  return result;
}

function orderedMembers(document: MediaProvidersDocument, identity: MediaIdentity): MediaDescriptor[] {
  const providerById = new Map(document.providers.map((provider) => [provider.id, provider]));
  const memberIds = new Set(identity.memberDescriptorIds);
  return document.descriptors.filter((descriptor) => memberIds.has(descriptor.id)).sort((a, b) => {
    const providerA = providerById.get(a.providerId);
    const providerB = providerById.get(b.providerId);
    return (providerA?.priority ?? 10_000) - (providerB?.priority ?? 10_000)
      || (providerB?.reliabilityScore ?? -1) - (providerA?.reliabilityScore ?? -1)
      || a.providerId.localeCompare(b.providerId)
      || a.id.localeCompare(b.id);
  });
}

function mergeIdentity(document: MediaProvidersDocument, identity: MediaIdentity): MergedMediaResult {
  const members = orderedMembers(document, identity);
  const providerById = new Map(document.providers.map((provider) => [provider.id, provider]));
  const selected: Partial<Record<MediaResultScalarField, string | number | null>> = {};
  const provenance: MergedMediaResult['provenance'] = {};
  const conflicts: MergedMediaResult['conflicts'] = {};

  scalarFields.forEach((field) => {
    const candidates = members.map((member) => ({ descriptorId: member.id, value: member[field] }))
      .filter((candidate): candidate is { descriptorId: string; value: string | number } => present(candidate.value));
    selected[field] = candidates[0]?.value ?? null;
    if (candidates[0]) provenance[field] = candidates[0].descriptorId;
    const distinct = new Map(candidates.map((candidate) => [`${typeof candidate.value}:${fold(String(candidate.value))}`, candidate.value]));
    if (distinct.size > 1) conflicts[field] = [...distinct.values()];
  });

  const availability = [...new Set(members.map((member) => member.availability))]
    .sort((a, b) => availabilityRank[a] - availabilityRank[b])[0] ?? 'unknown';
  const sources = members.map((member) => {
    const provider = providerById.get(member.providerId);
    return {
      descriptorId: member.id, providerId: member.providerId, providerName: provider?.name ?? member.providerId,
      providerItemId: member.providerItemId, priority: provider?.priority ?? 10_000,
      reliabilityScore: provider?.reliabilityScore ?? null, availability: member.availability,
    };
  });

  return {
    identityId: identity.id, partition: identity.partition, contentType: identity.contentType,
    title: String(selected.title ?? members[0]?.title ?? ''),
    originalTitle: selected.originalTitle as string | null,
    japaneseTitle: selected.japaneseTitle as string | null,
    chineseTitle: selected.chineseTitle as string | null,
    koreanTitle: selected.koreanTitle as string | null,
    romajiTitle: selected.romajiTitle as string | null,
    year: selected.year as number | null,
    studio: selected.studio as string | null,
    director: selected.director as string | null,
    episodeCount: selected.episodeCount as number | null,
    broadcastNetwork: selected.broadcastNetwork as string | null,
    episodesPerWeek: selected.episodesPerWeek as number | null,
    country: selected.country as string | null,
    runtimeMinutes: selected.runtimeMinutes as number | null,
    ageRating: selected.ageRating as string | null,
    alternativeTitles: stableUnion(members.map((member) => member.alternativeTitles)),
    actors: stableUnion(members.map((member) => member.actors)),
    languages: stableUnion(members.map((member) => member.languages)),
    releaseRegions: stableUnion(members.map((member) => member.releaseRegions)),
    identifiers: identity.identifiers,
    availability, sourceCount: sources.length, sources, provenance, conflicts,
  };
}

/** Creates one display result per resolved identity, in stable identity order. */
export function mergeStoredMediaResults(document: MediaProvidersDocument): MergedMediaResult[] {
  const normalized = normalizeMediaProvidersDocument(document).value;
  return resolveMediaIdentities(normalized).identities.map((identity) => mergeIdentity(normalized, identity));
}

function searchableText(result: MergedMediaResult): string {
  return fold([result.title, result.originalTitle, result.japaneseTitle, result.chineseTitle,
    result.koreanTitle, result.romajiTitle, ...result.alternativeTitles, ...result.actors,
    result.studio, result.director].filter((value): value is string => typeof value === 'string').join(' '));
}

/** Filters and orders already-merged local results without mutating them. */
export function presentStoredMediaResults(
  results: readonly MergedMediaResult[], options: MediaResultPresentationOptions = {},
): MergedMediaResult[] {
  const contentTypes = options.contentTypes ? new Set(options.contentTypes) : null;
  const availabilities = options.availability ? new Set(options.availability) : null;
  const query = fold(options.query ?? '');
  const terms = query.split(/\s+/).filter(Boolean);
  const sortBy = options.sortBy ?? (terms.length ? 'relevance' : 'title');
  const direction = options.direction === 'desc' ? -1 : 1;
  const filtered = results.filter((result) => (!contentTypes || contentTypes.has(result.contentType))
    && (!availabilities || availabilities.has(result.availability))
    && terms.every((term) => searchableText(result).includes(term)));

  return filtered.map((result, index) => ({ result, index })).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'year') {
      if (a.result.year === null || b.result.year === null) {
        if (a.result.year !== b.result.year) return a.result.year === null ? 1 : -1;
      } else comparison = a.result.year - b.result.year;
    }
    else if (sortBy === 'source-count') comparison = a.result.sourceCount - b.result.sourceCount;
    else if (sortBy === 'relevance') {
      const aTitle = fold(a.result.title); const bTitle = fold(b.result.title);
      const score = (title: string) => title === query ? 0 : title.startsWith(query) ? 1 : 2;
      comparison = score(aTitle) - score(bTitle);
    }
    if (sortBy === 'title' || comparison === 0) comparison = a.result.title.localeCompare(b.result.title);
    return comparison * direction || a.result.identityId.localeCompare(b.result.identityId) || a.index - b.index;
  }).map(({ result }) => result);
}
