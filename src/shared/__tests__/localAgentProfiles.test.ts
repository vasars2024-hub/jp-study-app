import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_PROFILES,
  effectiveAgentPermission,
  getActiveAgentProfile,
  normalizeAgentProfiles,
} from '../localAgentProfiles';

describe('local agent profiles', () => {
  it('ships distinct offline profiles with bounded operation allowlists', () => {
    expect(DEFAULT_AGENT_PROFILES.map((profile) => profile.role)).toEqual([
      'tutor', 'media', 'research', 'automation',
    ]);
    expect(DEFAULT_AGENT_PROFILES.every((profile) => profile.enabledOperations.length > 0)).toBe(true);
    expect(DEFAULT_AGENT_PROFILES.find((profile) => profile.id === 'study-tutor')?.language).toBe('mixed');
  });

  it('preserves built-ins, normalizes custom profiles, and fails closed on unknown tools', () => {
    const store = normalizeAgentProfiles({
      activeProfileId: 'custom',
      profiles: [{
        id: 'custom',
        name: 'My tutor',
        role: 'custom',
        enabledOperations: ['dictionary.lookup', 'system.shell', 'dictionary.search-knowledge'],
        permission: 'full-automation',
        responseLength: 'detailed',
      }],
    });
    expect(store.profiles).toHaveLength(5);
    expect(getActiveAgentProfile(store)).toMatchObject({
      id: 'custom',
      permission: 'full-automation',
      enabledOperations: ['dictionary.lookup', 'dictionary.search-knowledge'],
    });
    expect(store.profiles.filter((profile) => profile.builtIn)).toHaveLength(4);
  });

  it('uses the stricter of global and profile permissions', () => {
    expect(effectiveAgentPermission('full-automation', DEFAULT_AGENT_PROFILES[0])).toBe('limited-actions');
    expect(effectiveAgentPermission('read-only', DEFAULT_AGENT_PROFILES[3])).toBe('read-only');
  });
});
