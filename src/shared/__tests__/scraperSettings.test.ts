// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  SCRAPER_SETTINGS_VERSION,
  applyScraperPreset,
  createScraperProfile,
  createDefaultScraperSettingsDocument,
  deleteScraperProfile,
  getScraperPreset,
  normalizeScraperSettingsDocument,
  patchScraperProfile,
  removeScraperSiteOverride,
  resetScraperProfile,
  rollbackScraperProfile,
  resolveScraperSettings,
  setScraperSiteOverride,
  updateScraperProfileDetails,
  validateScraperSettings,
} from '../scraperSettings';

const NOW = '2026-07-22T00:00:00.000Z';

describe('scraper settings', () => {
  it('manages custom profiles without sharing nested settings', () => {
    const initial = createDefaultScraperSettingsDocument(NOW);
    const created = createScraperProfile(initial, 'Living Room', 'thorough', NOW);
    expect(created.activeProfileId).toBe('living-room');
    expect(created.profiles.at(-1)?.settings.network.concurrentRequests).toBe(2);

    const renamed = updateScraperProfileDetails(created, 'living-room', {
      name: 'Evening',
      description: 'Quiet profile',
    }, NOW);
    const patched = patchScraperProfile(renamed, 'living-room', { network: { concurrentRequests: 7 } }, NOW);
    expect(patched.profiles.find((profile) => profile.id === 'living-room')?.name).toBe('Evening');
    expect(patched.profiles.find((profile) => profile.id === 'thorough')?.settings.network.concurrentRequests).toBe(2);

    const reset = resetScraperProfile(patched, 'living-room', NOW);
    expect(reset.profiles.find((profile) => profile.id === 'living-room')?.settings.network.concurrentRequests).toBe(4);
    const deleted = deleteScraperProfile(reset, 'living-room');
    expect(deleted.activeProfileId).toBe('fast');
    expect(deleted.profiles.some((profile) => profile.id === 'living-room')).toBe(false);
  });

  it('keeps profile IDs stable, unique, and protects the final profile', () => {
    const initial = createDefaultScraperSettingsDocument(NOW);
    const first = createScraperProfile(initial, 'My Profile', 'balanced', NOW);
    const second = createScraperProfile(first, 'My Profile', 'balanced', NOW);
    expect(second.profiles.slice(-2).map((profile) => profile.id)).toEqual(['my-profile', 'my-profile-2']);
    expect(() => createScraperProfile(initial, '   ')).toThrow('name is required');
    expect(() => deleteScraperProfile({ ...initial, profiles: [initial.profiles[0]] }, 'fast')).toThrow('must remain');
  });

  it('adds and removes site settings snapshots and clears deleted inheritance', () => {
    const initial = createDefaultScraperSettingsDocument(NOW);
    const withSite = setScraperSiteOverride(initial, 'https://www.example.org/anime', {
      network: { concurrentRequests: 1 },
    }, 'thorough');
    expect(resolveScraperSettings(withSite, 'example.org').network.concurrentRequests).toBe(1);

    const withoutProfile = deleteScraperProfile(withSite, 'thorough');
    expect(withoutProfile.siteOverrides['example.org'].profileId).toBeUndefined();
    const removed = removeScraperSiteOverride(withoutProfile, 'www.example.org');
    expect(removed.siteOverrides).toEqual({});
  });

  it('creates independent built-in profiles with balanced active', () => {
    const document = createDefaultScraperSettingsDocument(NOW);
    expect(document.version).toBe(SCRAPER_SETTINGS_VERSION);
    expect(document.activeProfileId).toBe('balanced');
    expect(document.profiles.map((profile) => profile.id)).toEqual([
      'fast',
      'balanced',
      'thorough',
    ]);

    document.profiles[0].settings.network.headers.Accept = 'text/html';
    expect(document.profiles[1].settings.network.headers).toEqual({});
  });

  it('provides distinct fast, balanced, and thorough pacing', () => {
    const fast = getScraperPreset('fast');
    const balanced = getScraperPreset('balanced');
    const thorough = getScraperPreset('thorough');
    expect(fast.network.concurrentRequests).toBeGreaterThan(balanced.network.concurrentRequests);
    expect(thorough.network.concurrentRequests).toBeLessThan(balanced.network.concurrentRequests);
    expect(thorough.network.randomDelayMinMs).toBeGreaterThan(balanced.network.randomDelayMinMs);
    expect(balanced.extraction.cssSelectors).toEqual(['a[href*="episode"]']);
    expect(balanced.episodeProcessing.audioPreference).toBe('subbed');
  });

  it('validates extraction and processing lists', () => {
    const result = validateScraperSettings({
      extraction: { cssSelectors: ['.episode', '.episode', '  '], regexFlags: 'ix!' },
      episodeProcessing: { languagePriority: ['ja', 'ja', 'en'], resolutionPriority: [1080.4, -2] },
    });
    expect(result.value.extraction.cssSelectors).toEqual(['.episode']);
    expect(result.value.extraction.regexFlags).toBe('i');
    expect(result.value.episodeProcessing.languagePriority).toEqual(['ja', 'en']);
    expect(result.value.episodeProcessing.resolutionPriority).toEqual([1080, 1]);
  });

  it('bounds unsafe input and removes header line breaks', () => {
    const result = validateScraperSettings({
      network: {
        concurrentRequests: 500,
        requestTimeoutMs: -2,
        randomDelayMinMs: 3_000,
        randomDelayMaxMs: 500,
        proxyUrl: 'file:///secret',
        headers: {
          Accept: 'text/html\r\nInjected: yes',
          'bad header': 'ignored',
        },
      },
      browser: {
        engine: 'webkit',
        viewportWidth: 1,
      },
    });

    expect(result.value.network.concurrentRequests).toBe(32);
    expect(result.value.network.requestTimeoutMs).toBe(1_000);
    expect(result.value.network.randomDelayMaxMs).toBe(3_000);
    expect(result.value.network.proxyUrl).toBe('');
    expect(result.value.network.headers).toEqual({ Accept: 'text/html Injected: yes' });
    expect(result.value.browser.engine).toBe('chromium');
    expect(result.value.browser.viewportWidth).toBe(320);
    expect(result.issues.length).toBeGreaterThanOrEqual(6);
  });

  it('migrates the original unversioned single-settings shape into a profile', () => {
    const migrated = normalizeScraperSettingsDocument(
      {
        settings: {
          network: { concurrentRequests: 7 },
          browser: { engine: 'firefox' },
        },
      },
      NOW,
    ).value;

    expect(migrated.version).toBe(SCRAPER_SETTINGS_VERSION);
    expect(migrated.activeProfileId).toBe('migrated');
    expect(migrated.profiles).toHaveLength(1);
    expect(migrated.profiles[0].settings.network.concurrentRequests).toBe(7);
    expect(migrated.profiles[0].settings.browser.engine).toBe('firefox');
  });

  it('marks manual profile changes custom and can restore a preset', () => {
    const initial = createDefaultScraperSettingsDocument(NOW);
    const patched = patchScraperProfile(
      initial,
      'balanced',
      { network: { retryAttempts: 8 } },
      NOW,
    );
    expect(patched.profiles.find((profile) => profile.id === 'balanced')?.preset).toBe('custom');
    expect(resolveScraperSettings(patched).network.retryAttempts).toBe(8);

    const restored = applyScraperPreset(patched, 'balanced', 'balanced', NOW);
    expect(restored.profiles.find((profile) => profile.id === 'balanced')?.preset).toBe('balanced');
    expect(resolveScraperSettings(restored).network.retryAttempts).toBe(3);
  });

  it('normalizes hostnames and resolves a validated per-site override', () => {
    const initial = createDefaultScraperSettingsDocument(NOW);
    const next = setScraperSiteOverride(initial, 'https://www.example.com/anime', {
      network: { concurrentRequests: 1, randomDelayMinMs: 2_000, randomDelayMaxMs: 2_500 },
    });

    expect(Object.keys(next.siteOverrides)).toEqual(['example.com']);
    expect(resolveScraperSettings(next, 'example.com').network.concurrentRequests).toBe(1);
    expect(resolveScraperSettings(next, 'another.example').network.concurrentRequests).toBe(4);
  });

  it('provides validated cache, safety, and authentication/session metadata', () => {
    const result = validateScraperSettings({
      cache: { mode: 'offline', lifetimeMinutes: -10, maxSizeMb: 2 },
      safety: {
        respectRobotsTxt: false,
        maxRequestsPerMinute: 0,
        domainRateLimits: { 'https://www.example.com/path': 12.4, 'bad host': 'fast' },
      },
      session: { sessionLabel: 'Primary', expiresAt: '2026-08-01T12:00:00Z' },
      authentication: {
        loginStatus: 'signed-in',
        accountLabel: 'Personal',
        credentialRef: 'secure-store:example-personal',
        cookieJarRef: 'session:example-personal',
        manualLoginRequired: true,
      },
    });

    expect(result.value.cache).toMatchObject({ mode: 'offline', lifetimeMinutes: 0, maxSizeMb: 16 });
    expect(result.value.safety.maxRequestsPerMinute).toBe(1);
    expect(result.value.safety.domainRateLimits).toEqual({ 'example.com': 12 });
    expect(result.value.session.expiresAt).toBe('2026-08-01T12:00:00.000Z');
    expect(result.value.authentication).toMatchObject({
      loginStatus: 'signed-in',
      credentialRef: 'secure-store:example-personal',
      manualLoginRequired: true,
    });
  });

  it('migrates version 1 profiles and supports bounded rollback snapshots', () => {
    const initial = createDefaultScraperSettingsDocument(NOW);
    const legacy = normalizeScraperSettingsDocument({ ...initial, version: 1 }, NOW).value;
    expect(legacy.version).toBe(SCRAPER_SETTINGS_VERSION);
    expect(legacy.profiles[0].history).toEqual([]);

    const first = patchScraperProfile(legacy, 'balanced', {
      cache: { mode: 'offline' },
      safety: { maxRequestsPerMinute: 15 },
    }, '2026-07-22T01:00:00.000Z');
    const profile = first.profiles.find((candidate) => candidate.id === 'balanced');
    expect(profile?.history).toHaveLength(1);
    expect(profile?.history[0].settings.cache.mode).toBe('standard');

    const rolledBack = rollbackScraperProfile(
      first,
      'balanced',
      profile?.history[0].id ?? '',
      '2026-07-22T02:00:00.000Z',
    );
    const restored = rolledBack.profiles.find((candidate) => candidate.id === 'balanced');
    expect(restored?.settings.cache.mode).toBe('standard');
    expect(restored?.settings.safety.maxRequestsPerMinute).toBe(60);
    expect(restored?.history).toHaveLength(2);
    expect(() => rollbackScraperProfile(first, 'balanced', 'missing')).toThrow('does not exist');

    let bounded = legacy;
    for (let index = 0; index < 22; index += 1) {
      bounded = patchScraperProfile(bounded, 'balanced', {
        cache: { lifetimeMinutes: index },
      }, `2026-07-22T03:${String(index).padStart(2, '0')}:00.000Z`);
    }
    expect(bounded.profiles.find((candidate) => candidate.id === 'balanced')?.history).toHaveLength(20);
  });
});
