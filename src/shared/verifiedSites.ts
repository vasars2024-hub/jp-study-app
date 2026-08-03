export const VERIFIED_SITES_VERSION = 4;

export type VerifiedSiteStatus = 'unverified' | 'verified' | 'experimental' | 'community-tested' | 'broken' | 'deprecated';
export type VerifiedSiteSource = 'built-in' | 'fmhy' | 'user-imported' | 'community';
export type PromotionEligibility = 'not-reviewed' | 'eligible' | 'ineligible';
export type VerifiedSiteCategory = 'streaming' | 'metadata' | 'subtitles' | 'mixed';
export type VerifiedSiteContent = 'anime' | 'movies' | 'tv' | 'ovas' | 'specials';

export interface VerifiedSiteCompatibility {
  episodeLists: boolean;
  metadata: boolean;
  thumbnails: boolean;
  synopsis: boolean;
  genres: boolean;
  ratings: boolean;
  streamLinks: boolean;
  multipleSeasons: boolean;
  search: boolean;
  pagination: boolean;
  infiniteScroll: boolean;
  javascriptRequired: boolean;
  loginRequired: boolean;
  cloudflareDetected: boolean;
  captchaDetected: boolean;
}

export interface VerifiedSiteRecord {
  id: string;
  name: string;
  baseUrl: string;
  iconUrl: string | null;
  description: string;
  languages: string[];
  countryCode: string | null;
  category: VerifiedSiteCategory;
  supportedContent: VerifiedSiteContent[];
  scraperVersion: string;
  lastVerifiedAt: string | null;
  lastSuccessfulScrapeAt: string | null;
  averageScrapeTimeMs: number | null;
  successRate: number | null;
  reliabilityScore: number;
  active: boolean;
  status: VerifiedSiteStatus;
  notes: string;
  tags: string[];
  source: VerifiedSiteSource;
  sourceCategory: string | null;
  sourcePageUrl: string | null;
  promotionEligibility: PromotionEligibility;
  promotionReviewedAt: string | null;
  promotionNote: string;
  compatibility: VerifiedSiteCompatibility;
  createdAt: string;
  updatedAt: string;
}

export interface VerifiedSitesDocument {
  version: typeof VERIFIED_SITES_VERSION;
  sites: VerifiedSiteRecord[];
}

export interface VerifiedSiteIssue { path: string; message: string }
export interface VerifiedSitesValidationResult {
  value: VerifiedSitesDocument;
  issues: VerifiedSiteIssue[];
}

type UnknownRecord = Record<string, unknown>;
const STATUS: VerifiedSiteStatus[] = ['unverified', 'verified', 'experimental', 'community-tested', 'broken', 'deprecated'];
const SOURCE: VerifiedSiteSource[] = ['built-in', 'fmhy', 'user-imported', 'community'];
const PROMOTION_ELIGIBILITY: PromotionEligibility[] = ['not-reviewed', 'eligible', 'ineligible'];
const CATEGORY: VerifiedSiteCategory[] = ['streaming', 'metadata', 'subtitles', 'mixed'];
const CONTENT: VerifiedSiteContent[] = ['anime', 'movies', 'tv', 'ovas', 'specials'];
const COMPATIBILITY_KEYS = [
  'episodeLists', 'metadata', 'thumbnails', 'synopsis', 'genres', 'ratings', 'streamLinks',
  'multipleSeasons', 'search', 'pagination', 'infiniteScroll', 'javascriptRequired',
  'loginRequired', 'cloudflareDetected', 'captchaDetected',
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number, path: string, issues: VerifiedSiteIssue[]): string {
  if (typeof value !== 'string') {
    if (value !== undefined) issues.push({ path, message: 'Expected text.' });
    return fallback;
  }
  const result = value.trim().slice(0, max);
  if (value.trim().length > max) issues.push({ path, message: `Trimmed to ${max} characters.` });
  return result;
}

function date(value: unknown, path: string, issues: VerifiedSiteIssue[]): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  issues.push({ path, message: 'Expected an ISO date or null.' });
  return null;
}

function number(value: unknown, min: number, max: number, path: string, issues: VerifiedSiteIssue[]): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'Expected a finite number or null.' });
    return null;
  }
  const result = Math.min(max, Math.max(min, value));
  if (result !== value) issues.push({ path, message: `Clamped to ${min}-${max}.` });
  return result;
}

function url(value: unknown, nullable: boolean, path: string, issues: VerifiedSiteIssue[]): string | null {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  if (typeof value === 'string') {
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
      }
    } catch { /* validation below */ }
  }
  issues.push({ path, message: 'Expected an HTTP(S) URL.' });
  return nullable ? null : '';
}

function list(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}

export function createEmptyVerifiedSitesDocument(): VerifiedSitesDocument {
  return { version: VERIFIED_SITES_VERSION, sites: [] };
}

function normalizeSite(raw: unknown, index: number, now: string, issues: VerifiedSiteIssue[]): VerifiedSiteRecord | null {
  const prefix = `sites.${index}`;
  if (!isRecord(raw)) {
    issues.push({ path: prefix, message: 'Ignored invalid site record.' });
    return null;
  }
  const baseUrl = url(raw.baseUrl ?? raw.url, false, `${prefix}.baseUrl`, issues);
  const name = text(raw.name, '', 100, `${prefix}.name`, issues);
  if (!baseUrl || !name) {
    issues.push({ path: prefix, message: 'A site requires a name and valid base URL.' });
    return null;
  }
  const rawCompatibility = isRecord(raw.compatibility) ? raw.compatibility : {};
  const compatibility = Object.fromEntries(COMPATIBILITY_KEYS.map((key) => [key, rawCompatibility[key] === true])) as unknown as VerifiedSiteCompatibility;
  const status = STATUS.includes(raw.status as VerifiedSiteStatus) ? raw.status as VerifiedSiteStatus : 'experimental';
  const category = CATEGORY.includes(raw.category as VerifiedSiteCategory) ? raw.category as VerifiedSiteCategory : 'mixed';
  const supportedContent = list(raw.supportedContent, CONTENT.length, 20)
    .filter((item): item is VerifiedSiteContent => CONTENT.includes(item as VerifiedSiteContent));
  const reliabilityScore = number(raw.reliabilityScore, 0, 100, `${prefix}.reliabilityScore`, issues) ?? 0;
  const country = text(raw.countryCode, '', 2, `${prefix}.countryCode`, issues).toUpperCase();
  const rawId = text(raw.id, '', 64, `${prefix}.id`, issues).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  const sourceType = SOURCE.includes(raw.source as VerifiedSiteSource) ? raw.source as VerifiedSiteSource : 'user-imported';
  const promotionEligibility = PROMOTION_ELIGIBILITY.includes(raw.promotionEligibility as PromotionEligibility)
    ? raw.promotionEligibility as PromotionEligibility
    // Preserve already-verified legacy imports while requiring review for new ones.
    : sourceType === 'built-in' || status === 'verified' ? 'eligible' : 'not-reviewed';
  return {
    id: rawId || `site-${index + 1}`,
    name,
    baseUrl,
    iconUrl: url(raw.iconUrl, true, `${prefix}.iconUrl`, issues),
    description: text(raw.description, '', 500, `${prefix}.description`, issues),
    languages: list(raw.languages ?? raw.language, 20, 35),
    countryCode: /^[A-Z]{2}$/.test(country) ? country : null,
    category,
    supportedContent,
    scraperVersion: text(raw.scraperVersion, '', 50, `${prefix}.scraperVersion`, issues),
    lastVerifiedAt: date(raw.lastVerifiedAt ?? raw.lastVerified, `${prefix}.lastVerifiedAt`, issues),
    lastSuccessfulScrapeAt: date(raw.lastSuccessfulScrapeAt ?? raw.lastSuccessfulScrape, `${prefix}.lastSuccessfulScrapeAt`, issues),
    averageScrapeTimeMs: number(raw.averageScrapeTimeMs ?? raw.averageScrapeTime, 0, 3_600_000, `${prefix}.averageScrapeTimeMs`, issues),
    successRate: number(raw.successRate, 0, 100, `${prefix}.successRate`, issues),
    reliabilityScore,
    active: typeof raw.active === 'boolean' ? raw.active : status !== 'broken' && status !== 'deprecated',
    status,
    notes: text(raw.notes, '', 2_000, `${prefix}.notes`, issues),
    tags: list(raw.tags, 50, 40),
    source: sourceType,
    sourceCategory: text(raw.sourceCategory, '', 120, `${prefix}.sourceCategory`, issues) || null,
    sourcePageUrl: url(raw.sourcePageUrl, true, `${prefix}.sourcePageUrl`, issues),
    promotionEligibility,
    promotionReviewedAt: date(raw.promotionReviewedAt, `${prefix}.promotionReviewedAt`, issues),
    promotionNote: text(raw.promotionNote, '', 500, `${prefix}.promotionNote`, issues),
    compatibility,
    createdAt: date(raw.createdAt, `${prefix}.createdAt`, issues) ?? now,
    updatedAt: date(raw.updatedAt, `${prefix}.updatedAt`, issues) ?? now,
  };
}

export function normalizeVerifiedSitesDocument(input: unknown, now = new Date().toISOString()): VerifiedSitesValidationResult {
  const issues: VerifiedSiteIssue[] = [];
  if (!isRecord(input)) return { value: createEmptyVerifiedSitesDocument(), issues: [{ path: '', message: 'Expected a verified-sites document.' }] };
  if (typeof input.version === 'number' && input.version > VERIFIED_SITES_VERSION) {
    return { value: createEmptyVerifiedSitesDocument(), issues: [{ path: 'version', message: 'Document was created by a newer app version.' }] };
  }
  // v1 used `records`; v2 lacked explicit community-source provenance.
  const source = Array.isArray(input.sites) ? input.sites : Array.isArray(input.records) ? input.records : [];
  const sites = source.map((site, index) => normalizeSite(site, index, now, issues))
    .filter((site): site is VerifiedSiteRecord => site !== null);
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const unique = sites.filter((site, index) => {
    const sourceUrl = `${site.source}:${site.baseUrl.toLowerCase()}`;
    if (seenIds.has(site.id) || seenUrls.has(sourceUrl)) {
      issues.push({ path: `sites.${index}`, message: 'Ignored duplicate site ID or base URL.' });
      return false;
    }
    seenIds.add(site.id); seenUrls.add(sourceUrl); return true;
  });
  return { value: { version: VERIFIED_SITES_VERSION, sites: unique }, issues };
}

export function upsertVerifiedSite(document: VerifiedSitesDocument, input: unknown, now = new Date().toISOString()): VerifiedSitesValidationResult {
  const normalized = normalizeVerifiedSitesDocument({ version: VERIFIED_SITES_VERSION, sites: [input] }, now);
  const site = normalized.value.sites[0];
  if (!site) return { value: normalizeVerifiedSitesDocument(document, now).value, issues: normalized.issues };
  const current = normalizeVerifiedSitesDocument(document, now).value;
  const conflict = current.sites.find((item) => item.baseUrl.toLowerCase() === site.baseUrl.toLowerCase()
    && item.source === site.source && item.id !== site.id);
  if (conflict) return { value: current, issues: [...normalized.issues, { path: 'sites.0.baseUrl', message: 'Base URL already belongs to another site.' }] };
  const existing = current.sites.find((item) => item.id === site.id);
  const saved = existing ? { ...site, createdAt: existing.createdAt, updatedAt: now } : site;
  return { value: { ...current, sites: [...current.sites.filter((item) => item.id !== saved.id), saved] }, issues: normalized.issues };
}

export function removeVerifiedSite(document: VerifiedSitesDocument, id: string): VerifiedSitesDocument {
  return { ...document, sites: document.sites.filter((site) => site.id !== id) };
}

export interface VerifiedSiteDuplicateGroup {
  origin: string;
  sites: VerifiedSiteRecord[];
}

export function findVerifiedSiteDuplicateGroups(document: VerifiedSitesDocument): VerifiedSiteDuplicateGroup[] {
  const groups = new Map<string, VerifiedSiteRecord[]>();
  for (const site of document.sites) {
    const parsed = new URL(site.baseUrl);
    const origin = `${parsed.protocol}//${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}`;
    groups.set(origin, [...(groups.get(origin) ?? []), site]);
  }
  return [...groups.entries()]
    .filter(([, sites]) => sites.length > 1 && new Set(sites.map((site) => site.source)).size > 1)
    .map(([origin, sites]) => ({ origin, sites }));
}

export function reconcileVerifiedSiteDuplicates(
  document: VerifiedSitesDocument,
  keepId: string,
  duplicateIds: string[],
): VerifiedSitesDocument {
  const group = findVerifiedSiteDuplicateGroups(document).find(({ sites }) => sites.some((site) => site.id === keepId));
  if (!group) return document;
  const allowed = new Set(group.sites.map((site) => site.id).filter((id) => id !== keepId));
  const remove = new Set(duplicateIds.filter((id) => allowed.has(id)));
  if (!remove.size) return document;
  return { ...document, sites: document.sites.filter((site) => !remove.has(site.id)) };
}

export function reviewPromotionEligibility(
  document: VerifiedSitesDocument,
  id: string,
  eligibility: Exclude<PromotionEligibility, 'not-reviewed'>,
  note = '',
  now = new Date().toISOString(),
): VerifiedSitesDocument {
  return {
    ...document,
    sites: document.sites.map((site) => site.id === id ? {
      ...site,
      promotionEligibility: site.source === 'built-in' ? 'eligible' : eligibility,
      promotionReviewedAt: now,
      promotionNote: note.trim().slice(0, 500),
      status: eligibility === 'ineligible' && site.status === 'verified' ? 'unverified' : site.status,
      updatedAt: now,
    } : site),
  };
}

export function promoteVerifiedSite(document: VerifiedSitesDocument, id: string, now = new Date().toISOString()): VerifiedSitesValidationResult {
  const site = document.sites.find((item) => item.id === id);
  if (!site) return { value: document, issues: [{ path: 'id', message: 'Site was not found.' }] };
  if (site.source !== 'built-in' && site.promotionEligibility !== 'eligible') {
    return { value: document, issues: [{ path: `sites.${id}.promotionEligibility`, message: 'Imported sites require an eligible manual promotion review.' }] };
  }
  return {
    value: { ...document, sites: document.sites.map((item) => item.id === id ? { ...item, status: 'verified', active: true, updatedAt: now } : item) },
    issues: [],
  };
}
