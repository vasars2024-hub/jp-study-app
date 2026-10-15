/**
 * Main's planner refusals reach Blanc's Agent panel as codes, translated in the lazy AI pack —
 * never as the English `error` / `lastError` text, which can name a local model path (F3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentPlanFailureKey } from '../agentPlanFailureKeys';
import type { LocalAgentPlanFailureCode } from '../../shared/localAgentRuntime';
import { AI_AGENT_UI_EN } from '../../shared/i18n/aiAgentUi/en';
import { AI_AGENT_UI_JA } from '../../shared/i18n/aiAgentUi/ja';
import { AI_AGENT_UI_ZH } from '../../shared/i18n/aiAgentUi/zh';
import { AI_AGENT_UI_RU } from '../../shared/i18n/aiAgentUi/ru';

const CODES: LocalAgentPlanFailureCode[] = [
  'invalid-request',
  'ai-off',
  'agent-disabled',
  'model-missing',
  'cloud-key-missing',
  'spend-budget',
  'cloud-disabled',
  'objective-too-long',
  'context-overflow',
  'timeout',
  'plan-invalid',
  'planner-failed',
];

describe('agent plan failure codes', () => {
  it('gives every code its own sentence in all four languages', () => {
    const keys = CODES.map(agentPlanFailureKey);
    expect(new Set(keys).size).toBe(CODES.length);
    for (const pack of [AI_AGENT_UI_EN, AI_AGENT_UI_JA, AI_AGENT_UI_ZH, AI_AGENT_UI_RU]) {
      for (const key of keys) expect(pack[key], key).toBeTruthy();
    }
    for (const key of keys) expect(AI_AGENT_UI_JA[key]).not.toBe(AI_AGENT_UI_EN[key]);
  });

  it('falls back to the generic sentence for a missing or unknown code', () => {
    expect(agentPlanFailureKey(undefined)).toBe('aiAgent.planError.plannerFailed');
    expect(agentPlanFailureKey('nonsense' as LocalAgentPlanFailureCode)).toBe('aiAgent.planError.plannerFailed');
  });

  it('Blanc shows the translated code, never main\'s English error text', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'blanc', 'BlancReadyToolPanels.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/response\.error/);
    expect(source).not.toMatch(/runtimeStatus\.lastError\b(?!Code)/);
    expect(source).toContain('agentPlanFailureKey(response.code)');
    expect(source).toContain('agentPlanFailureKey(runtimeStatus.lastErrorCode)');
  });
});
