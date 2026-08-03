import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCAL_AGENT_SETTINGS,
  normalizeLocalAgentSettings,
} from '../localAgentSettings';

describe('local agent settings', () => {
  it('defaults to a disabled, local, private, read-only agent', () => {
    expect(normalizeLocalAgentSettings(null)).toEqual(DEFAULT_LOCAL_AGENT_SETTINGS);
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
