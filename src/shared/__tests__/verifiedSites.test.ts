import { describe, expect, it } from 'vitest';
import {
  findVerifiedSiteDuplicateGroups,
  normalizeVerifiedSitesDocument,
  promoteVerifiedSite,
  reconcileVerifiedSiteDuplicates,
  reviewPromotionEligibility,
  upsertVerifiedSite,
  VERIFIED_SITES_VERSION,
} from '../verifiedSites';

const NOW = '2026-07-22T00:00:00.000Z';
const valid = { id: 'example', name: 'Example', baseUrl: 'https://example.com/', reliabilityScore: 97, languages: ['ja'], supportedContent: ['anime'], compatibility: { search: true } };

describe('verified sites validation and migrations', () => {
  it('migrates a v1 records document and supplies safe typed defaults', () => {
    const result = normalizeVerifiedSitesDocument({ version: 1, records: [{ ...valid, url: valid.baseUrl, baseUrl: undefined, lastVerified: '2026-07-20' }] }, NOW);
    expect(result.value.version).toBe(VERIFIED_SITES_VERSION);
    expect(result.value.sites[0]).toMatchObject({ baseUrl: 'https://example.com', status: 'experimental', lastVerifiedAt: '2026-07-20T00:00:00.000Z' });
    expect(result.value.sites[0].compatibility.search).toBe(true);
    expect(result.value.sites[0].compatibility.cloudflareDetected).toBe(false);
  });

  it('rejects invalid URLs and duplicates while clamping bounded metrics', () => {
    const result = normalizeVerifiedSitesDocument({ sites: [valid, { ...valid, id: 'duplicate' }, { ...valid, id: 'bad', baseUrl: 'file:///tmp/site', reliabilityScore: 500 }] }, NOW);
    expect(result.value.sites).toHaveLength(1);
    expect(result.issues.some((issue) => issue.message.includes('duplicate'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('HTTP(S)'))).toBe(true);
  });

  it('retains exact-URL collisions from different sources for explicit reconciliation', () => {
    const result = normalizeVerifiedSitesDocument({ sites: [
      { ...valid, id: 'built-in', source: 'built-in' },
      { ...valid, id: 'community', source: 'community' },
    ] }, NOW);
    expect(result.value.sites).toHaveLength(2);
    expect(findVerifiedSiteDuplicateGroups(result.value)[0].sites).toHaveLength(2);
  });

  it('upserts by id without allowing a base URL collision', () => {
    const initial = normalizeVerifiedSitesDocument({ sites: [valid] }, NOW).value;
    const updated = upsertVerifiedSite(initial, { ...valid, name: 'Updated' }, '2026-07-23T00:00:00.000Z');
    expect(updated.value.sites).toHaveLength(1);
    expect(updated.value.sites[0].name).toBe('Updated');
    const conflict = upsertVerifiedSite(updated.value, { ...valid, id: 'other' }, NOW);
    expect(conflict.value.sites).toHaveLength(1);
    expect(conflict.issues[0].message).toContain('already belongs');
  });

  it('requires an explicit eligible review before promoting imported sources', () => {
    const initial = normalizeVerifiedSitesDocument({ sites: [{ ...valid, source: 'community', status: 'unverified' }] }, NOW).value;
    expect(initial.sites[0].promotionEligibility).toBe('not-reviewed');
    expect(promoteVerifiedSite(initial, 'example', NOW).issues[0].message).toContain('eligible manual');

    const eligible = reviewPromotionEligibility(initial, 'example', 'eligible', 'Reviewed offline.', NOW);
    const promoted = promoteVerifiedSite(eligible, 'example', '2026-07-23T00:00:00.000Z');
    expect(promoted.issues).toEqual([]);
    expect(promoted.value.sites[0]).toMatchObject({ status: 'verified', active: true, promotionEligibility: 'eligible', promotionNote: 'Reviewed offline.' });

    const ineligible = reviewPromotionEligibility(promoted.value, 'example', 'ineligible', 'Needs more evidence.', '2026-07-24T00:00:00.000Z');
    expect(ineligible.sites[0]).toMatchObject({ status: 'unverified', promotionEligibility: 'ineligible' });
  });

  it('previews same-origin duplicates across sources and reconciles only the selected group', () => {
    const document = normalizeVerifiedSitesDocument({ sites: [
      { ...valid, id: 'built-in', source: 'built-in', baseUrl: 'https://www.example.com/catalog' },
      { ...valid, id: 'fmhy', source: 'fmhy', baseUrl: 'https://example.com/anime' },
      { ...valid, id: 'community', source: 'community', baseUrl: 'https://other.test' },
    ] }, NOW).value;
    const groups = findVerifiedSiteDuplicateGroups(document);
    expect(groups).toHaveLength(1);
    expect(groups[0].sites.map((site) => site.source)).toEqual(['built-in', 'fmhy']);

    const reconciled = reconcileVerifiedSiteDuplicates(document, 'built-in', ['fmhy', 'community']);
    expect(reconciled.sites.map((site) => site.id)).toEqual(['built-in', 'community']);
  });

  it('preserves verified legacy imports as promotion-eligible during migration', () => {
    const migrated = normalizeVerifiedSitesDocument({ version: 3, sites: [{ ...valid, source: 'user-imported', status: 'verified' }] }, NOW).value;
    expect(migrated.sites[0].promotionEligibility).toBe('eligible');
  });
});
