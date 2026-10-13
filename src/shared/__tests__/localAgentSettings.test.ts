import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCAL_AGENT_SETTINGS,
  LOCAL_AGENT_CHAT_HISTORY_TURNS,
  memoriesInAgentScope,
  normalizeLocalAgentSettings,
} from '../localAgentSettings';
import { AGENT_HISTORY_TURN_CEILING } from '../agentWorkspace';
import type { AgentMemoryCategory, AgentMemoryEntry } from '../localAgentMemory';

function memory(id: string, category: AgentMemoryCategory): AgentMemoryEntry {
  return { id, category, key: id, value: id, createdAt: 0, updatedAt: 0 };
}

const MEMORIES = [
  memory('pref', 'user-preference'),
  memory('study', 'learning'),
  memory('usage', 'application'),
];

describe('local agent settings', () => {
  it('defaults to a disabled, local, private, read-only agent', () => {
    expect(normalizeLocalAgentSettings(null)).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
  });

  it('falls back to each field’s default for a partial or mistyped document', () => {
    // An absent backend is the default backend, not `disabled` — which would
    // force `enabled` off for a document that asked for it on.
    expect(normalizeLocalAgentSettings({ enabled: true })).toEqual({
      ...DEFAULT_LOCAL_AGENT_SETTINGS,
      enabled: true,
    });
    expect(normalizeLocalAgentSettings({
      memoryEnabled: 'no',
      privacyMode: 0,
      debugMode: 'yes',
      permission: 'root',
      contextSize: 'big',
    })).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
    expect(normalizeLocalAgentSettings([])).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
    // An explicit `disabled` backend is still honoured and still keeps the Agent off.
    expect(normalizeLocalAgentSettings({ enabled: true, backend: 'disabled' })).toMatchObject({
      enabled: false,
      backend: 'disabled',
    });
    // An unknown backend is a request this build cannot honour, not a gap: still refused.
    expect(normalizeLocalAgentSettings({ enabled: true, backend: 'quantum' })).toMatchObject({
      enabled: false,
      backend: 'disabled',
    });
    // Explicit booleans win over their defaults in both directions.
    expect(normalizeLocalAgentSettings({ memoryEnabled: false, privacyMode: false, debugMode: true }))
      .toMatchObject({ memoryEnabled: false, privacyMode: false, debugMode: true });
  });

  it('bounds resources and accepts explicit safe settings', () => {
    expect(normalizeLocalAgentSettings({
      enabled: true,
      backend: 'local-gguf',
      modelFileName: 'Qwen3-14B-Q4.gguf',
      modelMode: 'power',
      acceleration: 'gpu',
      contextSize: 100_000,
      memoryLimitMb: 10,
      resourceMode: 'maximum-intelligence',
      cpuLimitPct: 1000,
      gpuLimitPct: 1,
      maxConcurrentTasks: 10,
      backgroundProcessing: true,
      permission: 'limited-actions',
      privacyMode: false,
      debugMode: true,
    })).toMatchObject({
      enabled: true,
      modelFileName: 'Qwen3-14B-Q4.gguf',
      modelMode: 'power',
      acceleration: 'gpu',
      contextSize: 32_768,
      memoryLimitMb: 256,
      resourceMode: 'maximum-intelligence',
      cpuLimitPct: 100,
      gpuLimitPct: 10,
      maxConcurrentTasks: 3,
      backgroundProcessing: true,
      permission: 'limited-actions',
      privacyMode: false,
      debugMode: true,
    });
  });

  /**
   * Absent and empty must not collapse into each other.
   *
   * A settings document written before the scope existed has no field, and
   * reading that as "no categories" would silently stop attaching the memories
   * the user was already getting. A user who unticks every box has an empty
   * array, and restoring the full set from that would be a privacy control that
   * quietly undoes itself.
   */
  it('separates an absent memory scope from one the user emptied', () => {
    expect(normalizeLocalAgentSettings({ version: 1 }).memoryScope)
      .toEqual(['user-preference', 'learning', 'application']);
    expect(normalizeLocalAgentSettings({ memoryScope: [] }).memoryScope).toEqual([]);
  });

  it('drops unknown categories and stores the scope in canonical order', () => {
    expect(normalizeLocalAgentSettings({
      memoryScope: ['application', 'nonsense', 'user-preference', 'application'],
    }).memoryScope).toEqual(['user-preference', 'application']);
  });

  it('falls back to the full retained-chat policy for an unknown value', () => {
    expect(normalizeLocalAgentSettings({ chatHistory: 'everything' }).chatHistory).toBe('full');
    expect(normalizeLocalAgentSettings({ chatHistory: 'off' }).chatHistory).toBe('off');
  });

  it('defaults old settings to excluding sensitive cloud context and preserves an explicit opt-out', () => {
    expect(normalizeLocalAgentSettings({ version: 1 }).excludeSensitiveContext).toBe(true);
    expect(normalizeLocalAgentSettings({
      version: 1,
      excludeSensitiveContext: false,
    }).excludeSensitiveContext).toBe(false);
  });

  /**
   * The `full` policy is the router's ceiling itself, not a second copy of it.
   * A literal 12 here would be the thing that drifts the first time the router's
   * limit moves, leaving a control that claims to send more than it sends.
   */
  it('prices the full retained-chat policy at the router ceiling', () => {
    expect(LOCAL_AGENT_CHAT_HISTORY_TURNS.full).toBe(AGENT_HISTORY_TURN_CEILING);
    expect(LOCAL_AGENT_CHAT_HISTORY_TURNS.off).toBe(0);
    expect(LOCAL_AGENT_CHAT_HISTORY_TURNS.recent).toBeLessThan(AGENT_HISTORY_TURN_CEILING);
  });

  describe('memoriesInAgentScope', () => {
    const settings = (patch: Record<string, unknown>) => normalizeLocalAgentSettings({
      ...DEFAULT_LOCAL_AGENT_SETTINGS,
      ...patch,
    });

    it('keeps only the categories in scope', () => {
      expect(memoriesInAgentScope(settings({ memoryScope: ['learning'] }), MEMORIES)
        .map((entry) => entry.id)).toEqual(['study']);
    });

    it('returns nothing when the scope is empty, exactly as the switch being off does', () => {
      expect(memoriesInAgentScope(settings({ memoryScope: [] }), MEMORIES)).toEqual([]);
      expect(memoriesInAgentScope(settings({ memoryEnabled: false }), MEMORIES)).toEqual([]);
    });

    it('passes every category through when the scope is untouched', () => {
      expect(memoriesInAgentScope(settings({}), MEMORIES)).toHaveLength(3);
    });
  });

  it('rejects model paths and unknown backends', () => {
    expect(normalizeLocalAgentSettings({
      enabled: true,
      backend: 'cloud',
      modelFileName: '../outside.gguf',
    })).toMatchObject({
      enabled: false,
      backend: 'disabled',
      modelFileName: '',
    });
  });
});
