// The provider registry's invariants.
//
// Every one of these is a way the nyaa provider could look wired while doing
// nothing, or could do something it must never do. None of them was covered
// before: the registry helpers had no tests at all, which is how a provider
// list managed to exist in two places.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUBTITLE_DISCOVERY_SETTINGS,
  isManualOnlySubtitleProvider,
  isNetworkSubtitleProvider,
  isRemoteSubtitleProvider,
  normalizeSubtitleDiscoverySettings,
  orderedSubtitleProviders,
  SUBTITLE_PROVIDER_IDS,
} from '../subtitleDiscoveryIpc';

describe('provider registry', () => {
  it('has a default entry for every registered provider', () => {
    // The panel renders from the defaults; a provider in the id list with no
    // default never appears and cannot be enabled.
    expect(DEFAULT_SUBTITLE_DISCOVERY_SETTINGS.providers.map((p) => p.id).sort())
      .toEqual([...SUBTITLE_PROVIDER_IDS].sort());
  });

  it('gives every provider a distinct priority', () => {
    const priorities = DEFAULT_SUBTITLE_DISCOVERY_SETTINGS.providers.map((p) => p.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });
});

describe('nyaa', () => {
  it('ships disabled and last', () => {
    // It reaches a torrent index and puts a transfer in the user's own client.
    // Neither should start happening because they updated the app.
    const nyaa = DEFAULT_SUBTITLE_DISCOVERY_SETTINGS.providers.find((p) => p.id === 'nyaa');
    expect(nyaa?.enabled).toBe(false);
    expect(nyaa?.priority).toBe(
      Math.max(...DEFAULT_SUBTITLE_DISCOVERY_SETTINGS.providers.map((p) => p.priority)),
    );
  });

  it('is remote but not network-keyed, so no API-key field renders for it', () => {
    // `SubtitleProviderPanel` derives the key input from
    // `isNetworkSubtitleProvider`. nyaa has no account and no key.
    expect(isRemoteSubtitleProvider('nyaa')).toBe(true);
    expect(isNetworkSubtitleProvider('nyaa')).toBe(false);
  });

  it('is manual-only, so it can never auto-attach', () => {
    expect(isManualOnlySubtitleProvider('nyaa')).toBe(true);
    for (const id of ['embedded', 'sidecar', 'jimaku', 'opensubtitles']) {
      expect(isManualOnlySubtitleProvider(id)).toBe(false);
    }
  });

  it('stays out of the ordered list until it is switched on', () => {
    expect(orderedSubtitleProviders(DEFAULT_SUBTITLE_DISCOVERY_SETTINGS)).not.toContain('nyaa');

    const enabled = normalizeSubtitleDiscoverySettings({
      ...DEFAULT_SUBTITLE_DISCOVERY_SETTINGS,
      providers: DEFAULT_SUBTITLE_DISCOVERY_SETTINGS.providers.map((p) =>
        (p.id === 'nyaa' ? { ...p, enabled: true } : p)),
    });
    expect(orderedSubtitleProviders(enabled)).toContain('nyaa');
  });

  it('is added at its default to a settings blob saved before it existed', () => {
    // The upgrade path: a user on the previous version has four providers
    // stored. nyaa must appear, disabled — not vanish, and not arrive enabled.
    const stored = normalizeSubtitleDiscoverySettings({
      autoDiscover: true,
      autoDownloadLanguages: ['ja'],
      minConfidence: 70,
      providers: [
        { id: 'embedded', enabled: true, priority: 0 },
        { id: 'sidecar', enabled: true, priority: 1 },
        { id: 'jimaku', enabled: true, priority: 2 },
        { id: 'opensubtitles', enabled: true, priority: 3 },
      ],
    });
    const nyaa = stored.providers.find((p) => p.id === 'nyaa');
    expect(nyaa).toBeDefined();
    expect(nyaa?.enabled).toBe(false);
    expect(orderedSubtitleProviders(stored)).not.toContain('nyaa');
  });

  it('keeps a user’s explicit enable across a reload', () => {
    const stored = normalizeSubtitleDiscoverySettings({
      providers: [{ id: 'nyaa', enabled: true, priority: 4 }],
    });
    expect(stored.providers.find((p) => p.id === 'nyaa')?.enabled).toBe(true);
  });
});
