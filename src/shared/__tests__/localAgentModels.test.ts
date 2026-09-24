import { describe, expect, it } from 'vitest';
import {
  LOCAL_AGENT_MODEL_CATALOG,
  installedFileNameFor,
  recommendedLocalAgentModels,
  resolveLocalAgentModel,
} from '../localAgentModels';

describe('local agent model stack', () => {
  it('keeps lite mode small and on-demand', () => {
    expect(recommendedLocalAgentModels('lite').map((model) => model.id)).toEqual(['qwen3-1.7b']);
  });

  it('routes a role to an installed preferred model', () => {
    expect(resolveLocalAgentModel('tutor', 'power', 'Qwen3-14B.gguf', ['Qwen3-14B.gguf'])?.id).toBe('qwen3-14b');
    expect(resolveLocalAgentModel('coding', 'standard', undefined, [])).toBeNull();
  });

  it('uses an installed model with the role rather than reporting none because of the mode', () => {
    // Power mode recommends 8B/14B; a user with only the small model still has an Agent.
    expect(resolveLocalAgentModel('agent', 'power', undefined, ['Qwen3-1.7B.gguf'])?.id).toBe('qwen3-1.7b');
  });

  it('recognises the installer file name and hand-downloaded names as the same model', () => {
    const small = LOCAL_AGENT_MODEL_CATALOG.find((model) => model.id === 'qwen3-1.7b')!;
    expect(installedFileNameFor(small, ['qwen3-1.7b-q8_0.gguf'])).toBe('qwen3-1.7b-q8_0.gguf');
    expect(resolveLocalAgentModel('agent', 'standard', undefined, ['Qwen_Qwen3-1.7B-Q4_K_M.gguf'])?.id)
      .toBe('qwen3-1.7b');
  });

  it('no longer recommends an embedding model nothing can load', () => {
    expect(LOCAL_AGENT_MODEL_CATALOG.some((model) => model.id === 'bge-m3')).toBe(false);
  });
});
