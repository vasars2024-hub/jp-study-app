import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_PROFILES,
  effectiveAgentPermission,
  getActiveAgentProfile,
  narrowAgentPermission,
  normalizeAgentProfiles,
  underPermissionCeiling,
} from '../localAgentProfiles';
import { selectLocalAgentApprovedOperations } from '../localAgentPrompt';
import type { AgentPermissionLevel } from '../localAgent';

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

/**
 * A permission level this build does not define is `AgentPermissionLevel` by declaration
 * only — it reaches these functions from a profile crossing IPC, a stored automation, or a
 * renderer's settings payload. The three tables that used to rank it independently all
 * ranked it `undefined`, and every comparison built on `undefined` failed OPEN.
 */
describe('a permission level outside the product vocabulary resolves to the strictest', () => {
  const unranked = 'wide-open' as unknown as AgentPermissionLevel;

  it('narrows rather than widens when the ceiling is a level this build does not define', () => {
    expect(narrowAgentPermission('read-only', unranked)).toBe('read-only');
    expect(narrowAgentPermission(unranked, 'read-only')).toBe('read-only');
    expect(underPermissionCeiling({ permission: 'read-only' as const }, unranked).permission)
      .toBe('read-only');
  });

  it('collapses to read-only when BOTH sides are unrecognized, rather than returning either', () => {
    expect(narrowAgentPermission(unranked, 'anything-else' as unknown as AgentPermissionLevel))
      .toBe('read-only');
  });

  it('does not widen the level a profile contributes to the effective permission', () => {
    const profile = { ...DEFAULT_AGENT_PROFILES[0], permission: unranked };
    expect(effectiveAgentPermission('read-only', profile)).toBe('read-only');
  });

  it('grants an unrecognized level no more operations than read-only, not the full set', () => {
    const readOnly = selectLocalAgentApprovedOperations({ permission: 'read-only' });
    const unknown = selectLocalAgentApprovedOperations({ permission: unranked });
    // The measured escalation this closes: 18 operations at read-only, 56 for the unranked
    // level — the whole full-automation set, including every delete and `settings.reset`.
    expect(unknown.length).toBeLessThanOrEqual(readOnly.length);
    expect(unknown).not.toContain('flashcard.delete-deck');
    expect(unknown).not.toContain('settings.reset');
  });
});
