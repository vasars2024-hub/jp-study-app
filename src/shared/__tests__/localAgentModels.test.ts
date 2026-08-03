import { describe, expect, it } from 'vitest';
import { recommendedLocalAgentModels, resolveLocalAgentModel } from '../localAgentModels';

describe('local agent model stack', () => {
  it('keeps lite mode small and on-demand', () => {
    expect(recommendedLocalAgentModels('lite').map((model) => model.id)).toEqual(['qwen3-1.7b']);
  });

  it('routes a role to an installed preferred model', () => {
    expect(resolveLocalAgentModel('tutor', 'power', 'Qwen3-14B.gguf', ['Qwen3-14B.gguf'])?.id).toBe('qwen3-14b');
    expect(resolveLocalAgentModel('coding', 'standard', undefined, ['DeepSeek-Coder-V2.gguf'])).toBeNull();
  });
});
