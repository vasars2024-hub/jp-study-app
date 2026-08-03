/**
 * MASTER_PLAN §7 — Media Identity Engine (deterministic, offline matcher).
 *
 * Groups {@link MediaDescriptor} records that refer to the *same title* across
 * providers, so §6 smart result merging and §10 Media Hub de-duplication have a
 * single, shared "is this the same thing?" answer. Every descriptor belongs to
 * exactly one {@link MediaIdentity}; a title that no one else carries is its own
 * singleton identity.
 *
 * Matching signals (both offline, both deterministic):
 *   1. A **shared external identifier** (same namespace + value) — authoritative.
 *   2. A **shared normalized title key** (title / original / ja / zh / ko / romaji
 *      / alternatives), guarded by year so two same-named-but-different-year titles
 *      are never fused by title alone. An identifier match overrides the year guard.
 *
 * The engine is **partition-aware**: by default descriptors of different content
 * types never match (a TMDB movie id and a TMDB tv id share a numeric space but are
 * different works), keeping identifier links inside one content type.
 *
 * Deliberately out of scope for this phase (do NOT add here):
 *   - result merging — the identity records which descriptors/ids/title-keys belong
 *     together; it never fuses descriptive fields (synopsis, cast, ...) into a single
 *     canonical payload. That is §6 result merging's job.
 *   - networking, scraping, playback/downloads, authentication, provider execution.
 * Everything below is pure, synchronous, and deterministic. Nothing here does I/O.
 */

import {
  normalizeMediaProvidersDocument,
  type MediaContentType,
  type MediaDescriptor,
  type MediaIdentifierRef,
  type MediaProvidersDocument,
} from './mediaProviders';

export interface MediaIdentityMatchEvidence {
  /** Identifiers carried by two or more members — the strong links. */
  sharedIdentifiers: MediaIdentifierRef[];
  /** Normalized title keys carried by two or more members — the title links. */
  sharedTitleKeys: string[];
}

/**
 * One resolved identity: a group of descriptors judged to be the same title. It
 * references its members and the signals that linked them; it does not merge their
 * descriptive fields.
 */
export interface MediaIdentity {
  /** Content-addressed, stable across input ordering (see {@link fnv1a}). */
  id: string;
  /** Partition the identity lives in (a content type, or 'all' when un-partitioned). */
  partition: string;
  /** Content type of the representative member. */
  contentType: MediaContentType;
  /** Member descriptor IDs, sorted. */
  memberDescriptorIds: string[];
  /** Distinct providers that carry this title, sorted — the "source coverage". */
  providerIds: string[];
  /** Union of every member's identifiers, de-duplicated and sorted. */
  identifiers: MediaIdentifierRef[];
  /** Union of every member's normalized title keys, sorted. */
  titleKeys: string[];
  /** A deterministic member chosen for display; the engine merges no fields. */
  representativeDescriptorId: string;
  evidence: MediaIdentityMatchEvidence;
  size: number;
}

export interface MediaIdentityResolution {
  identities: MediaIdentity[];
  /** Descriptor ID → the ID of the identity it belongs to. */
  descriptorIdentityById: Record<string, string>;
}

export interface MediaIdentityOptions {
  /**
   * When true (default, recommended) descriptors only match within their own
   * content type. Set false to match across content types — riskier because
   * external-id spaces (e.g. TMDB movie vs tv) can then collide.
   */
  partitionByContentType?: boolean;
}

// Combining marks (folded away) and the set of code points a title key keeps: ASCII
// alphanumerics, kana, CJK ideographs (+ compatibility + half-width kana), and Hangul.
// Anything else — punctuation, symbols, any whitespace — becomes a single separator.
const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_TITLE_CHARS = /[^0-9a-z぀-ヿ㐀-鿿가-힣豈-﫿ｦ-ﾟ]+/g;

/**
 * Folds a raw title into a comparison key: NFKC (full-width to ASCII), Latin
 * diacritics/macrons stripped (Tokyo-with-macrons -> tokyo), lower-cased, everything
 * that is not a letter/digit/CJK/kana/Hangul collapsed to single spaces. Returns ''
 * for anything with no comparable content, treated as "no title key".
 */
export function normalizeMediaTitleKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const folded = raw.normalize('NFKC').normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
  return folded.replace(NON_TITLE_CHARS, ' ').trim();
}

/** Every distinct, non-empty normalized title key a descriptor exposes. */
export function mediaDescriptorTitleKeys(descriptor: MediaDescriptor): string[] {
  const raw = [
    descriptor.title,
    descriptor.originalTitle,
    descriptor.japaneseTitle,
    descriptor.chineseTitle,
    descriptor.koreanTitle,
    descriptor.romajiTitle,
    ...descriptor.alternativeTitles,
  ];
  const keys = new Set<string>();
  raw.forEach((entry) => {
    const key = normalizeMediaTitleKey(entry);
    if (key) keys.add(key);
  });
  return [...keys].sort();
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const identifierKey = (ref: MediaIdentifierRef): string => `${ref.namespace} ${ref.value.toLowerCase()}`;

const compareIdentifiers = (a: MediaIdentifierRef, b: MediaIdentifierRef): number =>
  a.namespace.localeCompare(b.namespace) || a.value.localeCompare(b.value);

/** Union-find over one partition, tracking each set's concrete years for the guard. */
class Partition {
  private readonly parent: number[];
  private readonly rank: number[];
  private readonly years: Array<Set<number>>;

  constructor(size: number, yearOf: (index: number) => number | null) {
    this.parent = Array.from({ length: size }, (_unused, index) => index);
    this.rank = new Array(size).fill(0);
    this.years = Array.from({ length: size }, (_unused, index) => {
      const year = yearOf(index);
      return year === null ? new Set<number>() : new Set<number>([year]);
    });
  }

  find(node: number): number {
    let root = node;
    while (this.parent[root] !== root) root = this.parent[root];
    let cursor = node;
    while (this.parent[cursor] !== root) {
      const next = this.parent[cursor];
      this.parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  /** Union a into b. When `guarded`, refuse a merge that would collect two concrete years. */
  union(a: number, b: number, guarded: boolean): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    if (guarded) {
      const combined = new Set([...this.years[rootA], ...this.years[rootB]]);
      if (combined.size > 1) return;
    }
    const [small, large] = this.rank[rootA] < this.rank[rootB] ? [rootA, rootB] : [rootB, rootA];
    this.parent[small] = large;
    this.years[small].forEach((year) => this.years[large].add(year));
    if (this.rank[rootA] === this.rank[rootB]) this.rank[large] += 1;
  }
}

function buildIdentity(partition: string, members: MediaDescriptor[]): MediaIdentity {
  const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
  const memberDescriptorIds = ordered.map((member) => member.id);

  const identifierCounts = new Map<string, { ref: MediaIdentifierRef; members: number }>();
  const titleKeyCounts = new Map<string, number>();
  const providerIds = new Set<string>();
  ordered.forEach((member) => {
    providerIds.add(member.providerId);
    const seenIds = new Set<string>();
    member.identifiers.forEach((ref) => {
      const key = identifierKey(ref);
      if (seenIds.has(key)) return;
      seenIds.add(key);
      const existing = identifierCounts.get(key);
      if (existing) existing.members += 1;
      else identifierCounts.set(key, { ref, members: 1 });
    });
    mediaDescriptorTitleKeys(member).forEach((key) => {
      titleKeyCounts.set(key, (titleKeyCounts.get(key) ?? 0) + 1);
    });
  });

  const identifiers = [...identifierCounts.values()].map((entry) => entry.ref).sort(compareIdentifiers);
  const titleKeys = [...titleKeyCounts.keys()].sort();
  const sharedIdentifiers = [...identifierCounts.values()]
    .filter((entry) => entry.members > 1).map((entry) => entry.ref).sort(compareIdentifiers);
  const sharedTitleKeys = [...titleKeyCounts.entries()]
    .filter(([, count]) => count > 1).map(([key]) => key).sort();

  // Representative: richest in identifiers, ties broken by ID — stable and inputs-order-free.
  const representative = [...ordered]
    .sort((a, b) => b.identifiers.length - a.identifiers.length || a.id.localeCompare(b.id))[0];

  return {
    id: `mid-${fnv1a(`${partition} ${memberDescriptorIds.join(' ')}`)}`,
    partition,
    contentType: representative.contentType,
    memberDescriptorIds,
    providerIds: [...providerIds].sort(),
    identifiers,
    titleKeys,
    representativeDescriptorId: representative.id,
    evidence: { sharedIdentifiers, sharedTitleKeys },
    size: ordered.length,
  };
}

/**
 * Resolves every descriptor in a document into content-addressed identities. Pure and
 * deterministic: the same descriptors produce the same identities regardless of input
 * ordering. It resolves nothing over the network and merges no descriptive fields.
 */
export function resolveMediaIdentities(
  document: MediaProvidersDocument,
  options: MediaIdentityOptions = {},
): MediaIdentityResolution {
  const partitionByContentType = options.partitionByContentType !== false;
  const descriptors = normalizeMediaProvidersDocument(document).value.descriptors;

  // Partition, preserving document order within each partition for stable unioning.
  const partitions = new Map<string, MediaDescriptor[]>();
  descriptors.forEach((descriptor) => {
    const key = partitionByContentType ? descriptor.contentType : 'all';
    const bucket = partitions.get(key);
    if (bucket) bucket.push(descriptor);
    else partitions.set(key, [descriptor]);
  });

  const identities: MediaIdentity[] = [];
  const descriptorIdentityById: Record<string, string> = {};

  [...partitions.keys()].sort().forEach((partitionKey) => {
    const members = partitions.get(partitionKey) ?? [];
    const dsu = new Partition(members.length, (index) => members[index].year);

    // Pass 1 — identifiers, authoritative (unguarded). Sorted keys → deterministic.
    const byIdentifier = new Map<string, number[]>();
    members.forEach((member, index) => {
      const seen = new Set<string>();
      member.identifiers.forEach((ref) => {
        const key = identifierKey(ref);
        if (seen.has(key)) return;
        seen.add(key);
        const bucket = byIdentifier.get(key);
        if (bucket) bucket.push(index);
        else byIdentifier.set(key, [index]);
      });
    });
    [...byIdentifier.keys()].sort().forEach((key) => {
      const group = byIdentifier.get(key) ?? [];
      for (let i = 1; i < group.length; i += 1) dsu.union(group[0], group[i], false);
    });

    // Pass 2 — title keys, guarded by year so conflicting years never fuse by title.
    const byTitleKey = new Map<string, number[]>();
    members.forEach((member, index) => {
      mediaDescriptorTitleKeys(member).forEach((key) => {
        const bucket = byTitleKey.get(key);
        if (bucket) bucket.push(index);
        else byTitleKey.set(key, [index]);
      });
    });
    [...byTitleKey.keys()].sort().forEach((key) => {
      const group = byTitleKey.get(key) ?? [];
      for (let i = 1; i < group.length; i += 1) dsu.union(group[0], group[i], true);
    });

    // Gather components (root → members) and materialize identities.
    const components = new Map<number, MediaDescriptor[]>();
    members.forEach((member, index) => {
      const root = dsu.find(index);
      const bucket = components.get(root);
      if (bucket) bucket.push(member);
      else components.set(root, [member]);
    });
    components.forEach((componentMembers) => {
      const identity = buildIdentity(partitionKey, componentMembers);
      identities.push(identity);
      identity.memberDescriptorIds.forEach((descriptorId) => {
        descriptorIdentityById[descriptorId] = identity.id;
      });
    });
  });

  identities.sort((a, b) => a.partition.localeCompare(b.partition)
    || b.size - a.size
    || a.representativeDescriptorId.localeCompare(b.representativeDescriptorId)
    || a.id.localeCompare(b.id));

  return { identities, descriptorIdentityById };
}
