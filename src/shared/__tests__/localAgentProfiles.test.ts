import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_PROFILES,
  effectiveAgentPermission,
  getActiveAgentProfile,
  normalizeAgentProfiles,
  underPermissionCeiling,
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

describe('the settings a plan is built from carry the task ceiling', () => {
  const live = { permission: 'full-automation' as const, memoryEnabled: true, contextSize: 4096 };

  it('narrows the live permission the planner is handed', () => {
    expect(underPermissionCeiling(live, 'read-only')).toEqual({
      permission: 'read-only',
      memoryEnabled: true,
      contextSize: 4096,
    });
  });

  it('never widens: a stored full-automation ceiling leaves a read-only setting alone', () => {
    const readOnly = { ...live, permission: 'read-only' as const };
    expect(underPermissionCeiling(readOnly, 'full-automation').permission).toBe('read-only');
  });

  it('returns the same object when no ceiling is stated, so an unbounded plan is unchanged', () => {
    expect(underPermissionCeiling(live, undefined)).toBe(live);
  });

  it('returns the same object when the ceiling is already the live level', () => {
    expect(underPermissionCeiling(live, 'full-automation')).toBe(live);
  });

  it('carries every unrelated setting through untouched', () => {
    const narrowed = underPermissionCeiling(live, 'limited-actions');
    expect(narrowed.permission).toBe('limited-actions');
    expect(narrowed.memoryEnabled).toBe(true);
    expect(narrowed.contextSize).toBe(4096);
    expect(live.permission).toBe('full-automation');
  });
});
