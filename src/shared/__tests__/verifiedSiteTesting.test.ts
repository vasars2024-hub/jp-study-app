import { describe, expect, it } from 'vitest';
import {
  normalizeVerifiedSitesDocument,
  recordVerifiedSiteTest,
  verifiedSiteForSource,
  type VerifiedSitesDocument,
} from '../verifiedSites';

const NOW = '2026-09-24T10:00:00.000Z';

function doc(sites: Record<string, unknown>[]): VerifiedSitesDocument {
  return normalizeVerifiedSitesDocument({ version: 4, sites }, NOW).value;
}

const SITE = {
  id: 'example', name: 'Example', baseUrl: 'https://www.example.org', source: 'user-imported',
  status: 'experimental', category: 'metadata', reliabilityScore: 0, successRate: null,
};

describe('recordVerifiedSiteTest: measured, not typed', () => {
  it('writes success rate, reliability and last verified from a passing probe', () => {
    const { document, passed } = recordVerifiedSiteTest(
      doc([SITE]), 'example', { health: 'ok', latencyMs: 120, history: [1, 0, 1, 1], note: '' }, NOW,
    );
    const site = document.sites[0];
    expect(passed).toBe(true);
    expect(site.successRate).toBe(75);
    expect(site.reliabilityScore).toBe(75);
    expect(site.lastVerifiedAt).toBe(NOW);
  });

  it('does not move last verified on a failing probe, and marks a verified site broken', () => {
    const before = doc([{ ...SITE, status: 'verified', lastVerifiedAt: '2026-01-01T00:00:00.000Z' }]);
    const { document, passed } = recordVerifiedSiteTest(
      before, 'example', { health: 'offline', latencyMs: 0, history: [0], note: 'No response.' }, NOW,
    );
    expect(passed).toBe(false);
    expect(document.sites[0].lastVerifiedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(document.sites[0].status).toBe('broken');
    expect(document.sites[0].successRate).toBe(0);
  });

  it('records a challenge or an auth wall as a compatibility signal only', () => {
    const blocked = recordVerifiedSiteTest(
      doc([SITE]), 'example', { health: 'blocked', latencyMs: 30, history: [0], note: 'Anti-bot challenge.' }, NOW,
    ).document.sites[0];
    expect(blocked.compatibility.cloudflareDetected).toBe(true);
    const auth = recordVerifiedSiteTest(
      doc([SITE]), 'example', { health: 'blocked', latencyMs: 30, history: [0], note: 'Authentication required.' }, NOW,
    ).document.sites[0];
    expect(auth.compatibility.loginRequired).toBe(true);
  });

  it('leaves every other site alone', () => {
    const two = doc([SITE, { ...SITE, id: 'other', name: 'Other', baseUrl: 'https://other.org' }]);
    const { document } = recordVerifiedSiteTest(two, 'example', { health: 'ok', latencyMs: 1, history: [1] }, NOW);
    expect(document.sites[1]).toEqual(two.sites[1]);
  });
});

describe('verifiedSiteForSource: the source to site link', () => {
  const sites = doc([SITE, { ...SITE, id: 'nyaa', name: 'Nyaa', baseUrl: 'https://nyaa.si' }]);

  it('matches a source to the record on its host, ignoring www.', () => {
    expect(verifiedSiteForSource(sites, { host: 'example.org', verifiedSiteId: '' })?.id).toBe('example');
    expect(verifiedSiteForSource(sites, { host: 'nyaa.si', verifiedSiteId: '' })?.id).toBe('nyaa');
  });

  it('prefers an explicit link, and falls back to the host when the link is stale', () => {
    expect(verifiedSiteForSource(sites, { host: 'example.org', verifiedSiteId: 'nyaa' })?.id).toBe('nyaa');
    expect(verifiedSiteForSource(sites, { host: 'example.org', verifiedSiteId: 'gone' })?.id).toBe('example');
  });

  it('is null for a host no record covers', () => {
    expect(verifiedSiteForSource(sites, { host: 'api.jikan.moe', verifiedSiteId: '' })).toBeNull();
  });
});
