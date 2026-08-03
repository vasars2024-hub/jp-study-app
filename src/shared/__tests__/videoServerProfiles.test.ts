import { describe, expect, it } from 'vitest';
import {
  normalizeVideoServerProfilesDocument,
  getVideoServerPreferenceOrder,
  removeVideoServerProfile,
  setVideoServerPreferenceOrder,
  upsertVideoServerProfile,
  VIDEO_SERVER_PROFILES_VERSION,
} from '../videoServerProfiles';

const NOW = '2026-07-22T00:00:00.000Z';
const valid = { id: 'server-a', name: 'Server A', provider: 'Provider', reliabilityScore: 95 };

describe('video server profile model', () => {
  it('migrates v1 servers and top-level definition fields to the current schema', () => {
    const result = normalizeVideoServerProfilesDocument({ version: 1, servers: [{ ...valid, serverId: 'legacy', id: undefined, detectionRules: ['iframe[src]'], timeoutMs: 5000 }] }, NOW);
    expect(result.value.version).toBe(VIDEO_SERVER_PROFILES_VERSION);
    expect(result.value.profiles[0]).toMatchObject({ id: 'legacy', status: 'experimental', definition: { detectionRules: ['iframe[src]'], timeoutMs: 5000 } });
  });

  it('provides complete safe defaults for capability and definition fields', () => {
    const profile = normalizeVideoServerProfilesDocument({ profiles: [valid] }, NOW).value.profiles[0];
    expect(profile.capabilities).toMatchObject({ streamDiscovery: false, authorizedDownloads: false, chapters: false });
    expect(profile.definition).toMatchObject({ timeoutMs: 15000, retryAttempts: 2, customHeaders: {}, javascriptRequired: false });
  });

  it('does not persist authentication material in custom headers', () => {
    const result = normalizeVideoServerProfilesDocument({ profiles: [{ ...valid, definition: { customHeaders: {
      Accept: 'application/json', Authorization: 'Bearer secret', Cookie: 'session=secret',
    } } }] }, NOW);
    expect(result.value.profiles[0].definition.customHeaders).toEqual({ Accept: 'application/json' });
    expect(result.issues.filter((issue) => issue.message.includes('Credential-bearing'))).toHaveLength(2);
  });

  it('rejects invalid records and duplicates while bounding metrics and settings', () => {
    const result = normalizeVideoServerProfilesDocument({ profiles: [
      { ...valid, reliabilityScore: 120, definition: { retryAttempts: 99 } },
      { ...valid, name: 'Duplicate' },
      { id: 'missing-name' },
    ] }, NOW);
    expect(result.value.profiles).toHaveLength(1);
    expect(result.value.profiles[0].reliabilityScore).toBe(100);
    expect(result.value.profiles[0].definition.retryAttempts).toBe(10);
    expect(result.issues.some((issue) => issue.message.includes('duplicate'))).toBe(true);
  });

  it('normalizes per-website compatibility and merges its IDs into supported websites', () => {
    const profile = normalizeVideoServerProfilesDocument({ profiles: [{ ...valid, supportedWebsites: ['SITE-A'], websiteCompatibility: [
      { siteId: 'site-b', reliabilityScore: -1, preferredByDefault: true, lastVerified: '2026-07-20' },
      { websiteId: 'site-b' },
    ] }] }, NOW).value.profiles[0];
    expect(profile.supportedWebsiteIds).toEqual(['site-a', 'site-b']);
    expect(profile.websiteCompatibility).toHaveLength(1);
    expect(profile.websiteCompatibility[0]).toMatchObject({ websiteId: 'site-b', reliabilityScore: 0, preferredByDefault: true, lastVerifiedAt: '2026-07-20T00:00:00.000Z' });
  });

  it('round-trips capability flags and complete manually recorded compatibility metadata', () => {
    const profile = normalizeVideoServerProfilesDocument({ profiles: [{
      ...valid,
      capabilities: { streamDiscovery: true, subtitles: true, chapters: true },
      websiteCompatibility: [{
        websiteId: 'site-a', reliabilityScore: 91, lastVerifiedAt: '2026-07-21',
        preferredByDefault: true, detectionSuccessRate: 87.5,
        averageExtractionTimeMs: 1420, notes: 'Manually verified metadata.',
      }],
    }] }, NOW).value.profiles[0];

    expect(profile.capabilities).toMatchObject({ streamDiscovery: true, subtitles: true, chapters: true, mirrors: false });
    expect(profile.websiteCompatibility[0]).toEqual({
      websiteId: 'site-a', reliabilityScore: 91,
      lastVerifiedAt: '2026-07-21T00:00:00.000Z', preferredByDefault: true,
      detectionSuccessRate: 87.5, averageExtractionTimeMs: 1420,
      notes: 'Manually verified metadata.',
    });
  });

  it('upserts without changing creation time and removes by ID', () => {
    const initial = normalizeVideoServerProfilesDocument({ profiles: [valid] }, NOW).value;
    const updated = upsertVideoServerProfile(initial, { ...valid, name: 'Updated' }, '2026-07-23T00:00:00.000Z').value;
    expect(updated.profiles[0]).toMatchObject({ name: 'Updated', createdAt: NOW, updatedAt: '2026-07-23T00:00:00.000Z' });
    expect(removeVideoServerProfile(updated, 'server-a').profiles).toEqual([]);
  });

  it('rejects documents from a newer schema version', () => {
    const result = normalizeVideoServerProfilesDocument({ version: 999, profiles: [valid] }, NOW);
    expect(result.value.profiles).toEqual([]);
    expect(result.issues[0].path).toBe('version');
  });

  it('persists independent global and per-website preferred orders', () => {
    const initial = normalizeVideoServerProfilesDocument({ profiles: [valid, { ...valid, id: 'server-b', name: 'Server B' }] }, NOW).value;
    const global = setVideoServerPreferenceOrder(initial, ['server-b', 'server-a']);
    const perSite = setVideoServerPreferenceOrder(global, ['server-a', 'server-b'], 'SITE-X');
    expect(getVideoServerPreferenceOrder(perSite)).toEqual(['server-b', 'server-a']);
    expect(getVideoServerPreferenceOrder(perSite, 'site-x')).toEqual(['server-a', 'server-b']);
  });

  it('removes stale preference IDs and appends newly added profiles', () => {
    const result = normalizeVideoServerProfilesDocument({ profiles: [valid], preferences: { globalOrder: ['missing'], websiteOrders: { 'SITE-A': ['server-a', 'missing'] } } }, NOW);
    expect(result.value.preferences).toEqual({ globalOrder: [], websiteOrders: { 'site-a': ['server-a'] } });
    expect(result.issues.some((issue) => issue.message.includes('unknown server'))).toBe(true);
    expect(getVideoServerPreferenceOrder(result.value)).toEqual(['server-a']);
  });
});
