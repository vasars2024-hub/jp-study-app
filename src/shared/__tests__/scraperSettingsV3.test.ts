// Guards the v2 → v3 widening: twelve new groups, no migration step, and no
// shared references between profiles. Kept beside the original suite rather
// than inside it so the pre-v3 assertions stay readable as a unit.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRAPER_SETTINGS,
  SCRAPER_SETTINGS_VERSION,
  createDefaultScraperSettingsDocument,
  createScraperProfile,
  getScraperPreset,
  mergeScraperSettings,
  normalizeScraperSettingsDocument,
  patchScraperProfile,
  validateScraperSettings,
} from '../scraperSettings';

const V3_GROUPS = [
  'sources',
  'torrents',
  'qbittorrent',
  'images',
  'metadata',
  'performance',
  'logging',
  'validation',
  'export',
  'scheduler',
  'notifications',
  'developer',
] as const;

describe('scraper settings v3', () => {
  it('declares version 3', () => {
    expect(SCRAPER_SETTINGS_VERSION).toBe(3);
  });

  it('gives every new group a default', () => {
    for (const group of V3_GROUPS) {
      expect(DEFAULT_SCRAPER_SETTINGS[group], group).toBeDefined();
    }
  });

  it('reads a v2 document without a migration step and without complaining', () => {
    // The whole point of per-field fallback: a document written before these
    // groups existed is not an error, it is just a document with defaults.
    const v2Document = {
      version: 2,
      activeProfileId: 'balanced',
      profiles: [
        {
          id: 'balanced',
          name: 'Balanced',
          description: '',
          preset: 'balanced',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          settings: {
            network: { retryAttempts: 4 },
            browser: { headless: false },
          },
          history: [],
        },
      ],
      siteOverrides: {},
    };

    const { value, issues } = normalizeScraperSettingsDocument(v2Document);
    const profile = value.profiles.find((p) => p.id === 'balanced');

    expect(value.version).toBe(3);
    // The pre-v3 values the document did carry survive untouched.
    expect(profile?.settings.network.retryAttempts).toBe(4);
    expect(profile?.settings.browser.headless).toBe(false);

    for (const group of V3_GROUPS) {
      expect(profile?.settings[group], group).toEqual(DEFAULT_SCRAPER_SETTINGS[group]);
    }
    // Absent groups are not a defect, so they must not raise issues.
    expect(issues.filter((i) => V3_GROUPS.some((g) => i.path.startsWith(g)))).toEqual([]);
  });

  it('normalizes a future version down rather than throwing', () => {
    // The refusal to accept a newer document lives in the store's import path
    // (renderer/scraperSettingsStore.ts, covered by its own test), not here —
    // this function is also the recovery path for a half-written document, so
    // throwing would turn a repairable file into a dead app.
    expect(normalizeScraperSettingsDocument({ version: 99 }).value.version).toBe(
      SCRAPER_SETTINGS_VERSION,
    );
  });

  it('does not alias nested v3 data between two profiles', () => {
    // The failure this catches: a shallow spread in cloneSettings, which lets
    // an edit in one profile silently rewrite another.
    let document = createDefaultScraperSettingsDocument('2026-01-01T00:00:00.000Z');
    document = createScraperProfile(document, 'Second', '2026-01-02T00:00:00.000Z');

    document = patchScraperProfile(
      document,
      'balanced',
      {
        torrents: { preferredReleaseGroups: ['SubsPlease'] },
        qbittorrent: { tags: ['anime'] },
        developer: { experimentFlags: { fastPath: true } },
        logging: { channels: ['qbit'] },
        scheduler: {
          entries: [
            {
              id: 'nightly',
              label: 'Nightly',
              cron: '0 3 * * *',
              targetUrl: '',
              profileId: 'balanced',
              enabled: true,
              lastRunAt: null,
              nextRunAt: null,
            },
          ],
        },
      },
      '2026-01-03T00:00:00.000Z',
    );

    const other = document.profiles.find((p) => p.id !== 'balanced');
    expect(other?.settings.torrents.preferredReleaseGroups).toEqual([]);
    expect(other?.settings.qbittorrent.tags).toEqual([]);
    expect(other?.settings.developer.experimentFlags).toEqual({});
    expect(other?.settings.scheduler.entries).toEqual([]);
    expect(other?.settings.logging.channels).toEqual(
      DEFAULT_SCRAPER_SETTINGS.logging.channels,
    );
  });

  it('copies rather than shares arrays when merging a patch', () => {
    const patch = { torrents: { preferredReleaseGroups: ['Erai-raws'] } };
    const merged = mergeScraperSettings(DEFAULT_SCRAPER_SETTINGS, patch);
    merged.torrents.preferredReleaseGroups.push('mutated');
    expect(patch.torrents.preferredReleaseGroups).toEqual(['Erai-raws']);
    expect(DEFAULT_SCRAPER_SETTINGS.torrents.preferredReleaseGroups).toEqual([]);
  });

  it('keeps every pre-v3 field of the balanced preset unchanged', () => {
    // Presets are distinguished by pacing; v3 must not have shifted a value
    // the existing preset tests depend on.
    const balanced = getScraperPreset('balanced');
    expect(balanced.network.retryAttempts).toBe(3);
    expect(balanced.network.concurrentRequests).toBe(4);
    expect(balanced.browser.javascriptWaitMs).toBe(15_000);
    expect(balanced.episodeProcessing.audioPreference).toBe('subbed');
  });

  it('separates the presets on the new performance and logging axes too', () => {
    expect(getScraperPreset('fast').performance.maxParallelJobs).toBe(8);
    expect(getScraperPreset('balanced').performance.maxParallelJobs).toBe(4);
    expect(getScraperPreset('thorough').performance.maxParallelJobs).toBe(2);
    expect(getScraperPreset('fast').logging.level).toBe('warn');
    expect(getScraperPreset('thorough').logging.level).toBe('debug');
  });

  it('never lets a plaintext qBittorrent password through the top-level validator', () => {
    const { value, issues } = validateScraperSettings({
      qbittorrent: { password: 'hunter2', username: 'admin' },
    });
    expect(JSON.stringify(value)).not.toContain('hunter2');
    expect(value.qbittorrent.username).toBe('admin');
    expect(issues.some((i) => i.path === 'qbittorrent.password')).toBe(true);
  });

  it('validates the new groups through the top-level entry point', () => {
    const { value } = validateScraperSettings({
      sources: { mode: 'torrent', maxFallbackDepth: 999 },
      performance: { maxParallelJobs: 0 },
      scheduler: { quietHoursStart: 'nope' },
    });
    expect(value.sources.mode).toBe('torrent');
    expect(value.sources.maxFallbackDepth).toBe(10);
    expect(value.performance.maxParallelJobs).toBe(1);
    expect(value.scheduler.quietHoursStart).toBe('');
  });
});
