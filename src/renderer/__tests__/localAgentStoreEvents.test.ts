// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCAL_AGENT_SETTINGS } from '../../shared/localAgentSettings';

const PROFILES_KEY = 'jp-study-local-agent-profiles-v1';
const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';

let cleanups: Array<() => void> = [];

function dispatchStorage(key: string, newValue: string | null): void {
  if (newValue === null) localStorage.removeItem(key);
  else localStorage.setItem(key, newValue);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  cleanups = [];
});

afterEach(() => {
  cleanups.forEach((off) => off());
});

describe('local agent profile store events', () => {
  it('publishes a normalized same-window save through the custom event', async () => {
    const store = await import('../localAgentProfilesStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentProfilesChanged(listener));
    const current = store.loadLocalAgentProfiles();

    const saved = store.saveLocalAgentProfiles({
      ...current,
      activeProfileId: 'media-assistant',
    });

    expect(saved.activeProfileId).toBe('media-assistant');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(saved);
  });

  it('normalizes a sibling-window storage update and refreshes the synchronous cache', async () => {
    const store = await import('../localAgentProfilesStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentProfilesChanged(listener));
    const serialized = JSON.stringify({
      version: 1,
      activeProfileId: 'automation-assistant',
      profiles: [],
    });

    dispatchStorage(PROFILES_KEY, serialized);

    const published = listener.mock.calls[0]?.[0];
    expect(published).toMatchObject({
      version: 1,
      activeProfileId: 'automation-assistant',
    });
    expect(published.profiles.length).toBeGreaterThan(0);
    expect(store.loadLocalAgentProfiles()).toEqual(published);
  });

  it('falls back safely for malformed payloads and deletion', async () => {
    const store = await import('../localAgentProfilesStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentProfilesChanged(listener));

    dispatchStorage(PROFILES_KEY, '{not json');
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({
      version: 1,
      activeProfileId: 'study-tutor',
    });
    expect(store.loadLocalAgentProfiles().activeProfileId).toBe('study-tutor');

    dispatchStorage(PROFILES_KEY, JSON.stringify({
      version: 1,
      activeProfileId: 'media-assistant',
      profiles: [],
    }));
    expect(store.loadLocalAgentProfiles().activeProfileId).toBe('media-assistant');

    dispatchStorage(PROFILES_KEY, null);
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({
      version: 1,
      activeProfileId: 'study-tutor',
    });
    expect(store.loadLocalAgentProfiles().activeProfileId).toBe('study-tutor');
  });

  it('removes both event paths when unsubscribed', async () => {
    const store = await import('../localAgentProfilesStore');
    const listener = vi.fn();
    const off = store.onLocalAgentProfilesChanged(listener);
    off();

    const current = store.loadLocalAgentProfiles();
    store.saveLocalAgentProfiles({ ...current, activeProfileId: 'media-assistant' });
    dispatchStorage(PROFILES_KEY, JSON.stringify({
      version: 1,
      activeProfileId: 'automation-assistant',
      profiles: [],
    }));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('local agent settings store events', () => {
  it('publishes a normalized same-window save through the custom event', async () => {
    const store = await import('../localAgentSettingsStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentSettingsChanged(listener));

    const saved = store.saveLocalAgentSettings({
      permission: 'limited-actions',
      cpuLimitPct: 500,
    });

    expect(saved).toMatchObject({ permission: 'limited-actions', cpuLimitPct: 100 });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(saved);
  });

  it('normalizes a sibling-window storage update and refreshes the synchronous cache', async () => {
    const store = await import('../localAgentSettingsStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentSettingsChanged(listener));
    const serialized = JSON.stringify({
      version: 1,
      backend: 'local-gguf',
      enabled: true,
      permission: 'full-automation',
      cpuLimitPct: 500,
    });

    dispatchStorage(SETTINGS_KEY, serialized);

    const published = listener.mock.calls[0]?.[0];
    expect(published).toMatchObject({
      version: 1,
      enabled: true,
      permission: 'full-automation',
      cpuLimitPct: 100,
    });
    expect(store.loadLocalAgentSettings()).toEqual(published);
  });

  it('falls back safely for malformed payloads and deletion', async () => {
    const store = await import('../localAgentSettingsStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentSettingsChanged(listener));

    dispatchStorage(SETTINGS_KEY, '{not json');
    expect(listener.mock.calls.at(-1)?.[0]).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
    expect(store.loadLocalAgentSettings()).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);

    dispatchStorage(SETTINGS_KEY, JSON.stringify({
      version: 1,
      backend: 'local-gguf',
      permission: 'limited-actions',
    }));
    expect(store.loadLocalAgentSettings().permission).toBe('limited-actions');

    dispatchStorage(SETTINGS_KEY, null);
    expect(listener.mock.calls.at(-1)?.[0]).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
    expect(store.loadLocalAgentSettings()).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
  });

  it('removes both event paths when unsubscribed', async () => {
    const store = await import('../localAgentSettingsStore');
    const listener = vi.fn();
    const off = store.onLocalAgentSettingsChanged(listener);
    off();

    store.saveLocalAgentSettings({ permission: 'limited-actions' });
    dispatchStorage(SETTINGS_KEY, JSON.stringify({
      version: 1,
      backend: 'local-gguf',
      permission: 'full-automation',
    }));

    expect(listener).not.toHaveBeenCalled();
  });

  /**
   * The regression: a key removed in this window (a reset, a test harness, a
   * flow restoring "no settings yet") fires no `storage` event here, and the
   * store used to keep answering with its last value — so an Agent that had
   * been switched off stayed off after its settings were gone.
   */
  it('re-reads a key removed in this window instead of keeping the last value', async () => {
    const store = await import('../localAgentSettingsStore');
    store.saveLocalAgentSettings({ backend: 'disabled', permission: 'full-automation' });
    expect(store.loadLocalAgentSettings().backend).toBe('disabled');

    localStorage.removeItem(SETTINGS_KEY);

    expect(store.loadLocalAgentSettings()).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
  });

  it('tells this window’s subscribers when a load notices an out-of-band removal', async () => {
    const store = await import('../localAgentSettingsStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentSettingsChanged(listener));
    store.saveLocalAgentSettings({ backend: 'disabled' });
    listener.mockClear();

    localStorage.removeItem(SETTINGS_KEY);
    store.loadLocalAgentSettings();
    // Deferred: loads run inside React render.
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(DEFAULT_LOCAL_AGENT_SETTINGS);
    // A second load of the same (absent) key is not a change.
    store.loadLocalAgentSettings();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('resets to the defaults and publishes through resetLocalAgentSettings', async () => {
    const store = await import('../localAgentSettingsStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentSettingsChanged(listener));
    store.saveLocalAgentSettings({ backend: 'disabled', permission: 'limited-actions' });

    expect(store.resetLocalAgentSettings()).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);

    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(listener.mock.calls.at(-1)?.[0]).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
    expect(store.loadLocalAgentSettings()).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
  });

  it('treats a sibling window’s localStorage.clear() (key null) as a removal', async () => {
    const store = await import('../localAgentSettingsStore');
    const listener = vi.fn();
    cleanups.push(store.onLocalAgentSettingsChanged(listener));
    store.saveLocalAgentSettings({ permission: 'limited-actions' });

    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }));

    expect(listener.mock.calls.at(-1)?.[0]).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
    expect(store.loadLocalAgentSettings()).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
  });

  it('fills a partial stored entry from the defaults field by field', async () => {
    const store = await import('../localAgentSettingsStore');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: true, permission: 'limited-actions' }));

    expect(store.loadLocalAgentSettings()).toEqual({
      ...DEFAULT_LOCAL_AGENT_SETTINGS,
      enabled: true,
      permission: 'limited-actions',
    });
  });

  it('keeps the in-memory value when storage itself is unavailable', async () => {
    const store = await import('../localAgentSettingsStore');
    store.saveLocalAgentSettings({ permission: 'limited-actions' });
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    try {
      expect(store.loadLocalAgentSettings().permission).toBe('limited-actions');
    } finally {
      spy.mockRestore();
    }
  });
});
