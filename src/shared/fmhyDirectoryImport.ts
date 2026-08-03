import type { VerifiedSiteRecord, VerifiedSitesDocument } from './verifiedSites';
import { upsertVerifiedSite } from './verifiedSites';

export const FMHY_VIDEO_DIRECTORY_URL = 'https://fmhy.net/video';

export interface FmhyDirectoryEntry {
  name: string;
  category: string;
  url: string;
}

export interface FmhyDirectoryImportResult {
  entries: FmhyDirectoryEntry[];
  skippedEncoded: number;
  skippedDuplicate: number;
}

export interface FmhyDirectoryReconciliation {
  added: FmhyDirectoryEntry[];
  changed: { entry: FmhyDirectoryEntry; siteId: string; previousName: string; previousCategory: string | null }[];
  unchanged: FmhyDirectoryEntry[];
  absent: { siteId: string; name: string; url: string }[];
}

type ElementLike = {
  tagName: string;
  textContent: string | null;
  children: Iterable<ElementLike>;
  childNodes: Iterable<{ nodeType: number; textContent: string | null; tagName?: string; getAttribute?(name: string): string | null; querySelectorAll?(selectors: string): Iterable<ElementLike> }>;
  previousElementSibling: ElementLike | null;
  parentElement: ElementLike | null;
  querySelectorAll(selectors: string): Iterable<ElementLike>;
  getAttribute(name: string): string | null;
};

function cleanText(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function isEncodedLink(anchor: ElementLike, href: string): boolean {
  if (anchor.getAttribute('data-base64') !== null || anchor.getAttribute('data-encoded') !== null) return true;
  const markers = [anchor.getAttribute('data-base64'), anchor.getAttribute('data-encoded'), anchor.getAttribute('class')]
    .filter(Boolean).join(' ').toLowerCase();
  return markers.includes('base64') || markers.includes('encoded')
    || /(?:^|[/?#_-])base64(?:[/?#_-]|$)/i.test(href) || /\/fmhyb64(?:[/?#]|$)/i.test(href);
}

function categoryFor(listItem: ElementLike): string {
  let cursor: ElementLike | null = listItem;
  while (cursor) {
    let sibling = cursor.previousElementSibling;
    while (sibling) {
      if (/^H[23]$/.test(sibling.tagName)) return cleanText(sibling.textContent);
      const headings = [...sibling.querySelectorAll('h2, h3')];
      if (headings.length) return cleanText(headings[headings.length - 1].textContent);
      sibling = sibling.previousElementSibling;
    }
    cursor = cursor.parentElement;
  }
  return 'Movies / TV / Anime';
}

export function parseFmhyVideoDirectory(root: ElementLike): FmhyDirectoryImportResult {
  const entries: FmhyDirectoryEntry[] = [];
  const seen = new Set<string>();
  let skippedEncoded = 0;
  let skippedDuplicate = 0;

  for (const listItem of root.querySelectorAll('.VPDoc li')) {
    const category = categoryFor(listItem);
    for (const node of listItem.childNodes) {
      if (node.nodeType === 3 && /\s[-–—]\s/.test(node.textContent ?? '')) break;
      const anchors = node.tagName === 'A'
        ? [node as unknown as ElementLike]
        : [...(node.querySelectorAll?.('a') ?? [])];
      for (const child of anchors) {
        const href = child.getAttribute('href')?.trim() ?? '';
        if (isEncodedLink(child, href)) { skippedEncoded += 1; continue; }
        let parsed: URL;
        try { parsed = new URL(href); } catch { continue; }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
        parsed.hash = '';
        const url = parsed.toString().replace(/\/$/, '');
        const key = url.toLowerCase();
        if (seen.has(key)) { skippedDuplicate += 1; continue; }
        const name = cleanText(child.textContent);
        if (!name) continue;
        seen.add(key);
        entries.push({ name, category, url });
      }
    }
  }
  return { entries, skippedEncoded, skippedDuplicate };
}

function idFor(entry: FmhyDirectoryEntry): string {
  const host = new URL(entry.url).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `fmhy-${host}`.slice(0, 64);
}

function asUnverifiedSite(entry: FmhyDirectoryEntry, now: string): Partial<VerifiedSiteRecord> {
  return {
    id: idFor(entry), name: entry.name, baseUrl: entry.url, category: 'mixed', status: 'unverified',
    active: false, source: 'fmhy', sourceCategory: entry.category, sourcePageUrl: FMHY_VIDEO_DIRECTORY_URL,
    promotionEligibility: 'not-reviewed', promotionReviewedAt: null, promotionNote: '',
    description: `Public directory entry imported from FMHY category: ${entry.category}.`,
    notes: 'Directory metadata only. This entry has not been tested or verified by the app.',
    supportedContent: [], reliabilityScore: 0, tags: ['fmhy'], createdAt: now, updatedAt: now,
  };
}

export function mergeFmhyDirectoryEntries(document: VerifiedSitesDocument, entries: FmhyDirectoryEntry[], now = new Date().toISOString()) {
  let value = document;
  let imported = 0;
  let duplicates = 0;
  for (const entry of entries) {
    if (value.sites.some((site) => site.source === 'fmhy' && site.baseUrl.toLowerCase() === entry.url.toLowerCase())) { duplicates += 1; continue; }
    const result = upsertVerifiedSite(value, asUnverifiedSite(entry, now), now);
    if (result.value.sites.length === value.sites.length) continue;
    value = result.value;
    imported += 1;
  }
  return { value, imported, duplicates };
}

export function reconcileFmhyDirectoryEntries(
  document: VerifiedSitesDocument,
  entries: FmhyDirectoryEntry[],
): FmhyDirectoryReconciliation {
  const fmhySites = document.sites.filter((site) => site.source === 'fmhy');
  const byUrl = new Map(document.sites.map((site) => [site.baseUrl.toLowerCase(), site]));
  const suppliedUrls = new Set(entries.map((entry) => entry.url.toLowerCase()));
  const result: FmhyDirectoryReconciliation = { added: [], changed: [], unchanged: [], absent: [] };

  for (const entry of entries) {
    const existing = byUrl.get(entry.url.toLowerCase());
    if (!existing) result.added.push(entry);
    else if (existing.source === 'fmhy' && (existing.name !== entry.name || existing.sourceCategory !== entry.category)) {
      result.changed.push({
        entry,
        siteId: existing.id,
        previousName: existing.name,
        previousCategory: existing.sourceCategory,
      });
    } else result.unchanged.push(entry);
  }
  for (const site of fmhySites) {
    if (!suppliedUrls.has(site.baseUrl.toLowerCase())) result.absent.push({ siteId: site.id, name: site.name, url: site.baseUrl });
  }
  return result;
}

export function applyFmhyDirectoryReconciliation(
  document: VerifiedSitesDocument,
  reconciliation: FmhyDirectoryReconciliation,
  now = new Date().toISOString(),
) {
  const merged = mergeFmhyDirectoryEntries(document, reconciliation.added, now);
  const changes = new Map(reconciliation.changed.map((change) => [change.siteId, change.entry]));
  const sites = merged.value.sites.map((site) => {
    const entry = changes.get(site.id);
    if (!entry) return site;
    return {
      ...site,
      name: entry.name,
      sourceCategory: entry.category,
      description: `Public directory entry imported from FMHY category: ${entry.category}.`,
      updatedAt: now,
    };
  });
  return { value: { ...merged.value, sites }, added: merged.imported, updated: changes.size };
}
