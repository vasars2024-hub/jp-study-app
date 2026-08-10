import { describe, expect, it } from 'vitest';
import type { AgentContextItem } from '../../shared/agentWorkspace';
import {
  agentKnownInputChars,
  agentSensitiveContextKey,
  clampAgentExecutionBudget,
} from '../agentExecutionPolicyDraft';

describe('Agent execution policy draft', () => {
  it('clamps finite budgets and restores the default for an invalid number', () => {
    expect(clampAgentExecutionBudget(2_500.6, 1_500, 1, 16_384)).toBe(2_501);
    expect(clampAgentExecutionBudget(-4, 1_500, 1, 16_384)).toBe(1);
    expect(clampAgentExecutionBudget(99_999, 1_500, 1, 16_384)).toBe(16_384);
    expect(clampAgentExecutionBudget(Number.NaN, 1_500, 1, 16_384)).toBe(1_500);
  });

  it('counts only the prompt and transient file content visible to the composer', () => {
    expect(agentKnownInputChars('  Ask this  ', [{
      id: 'attachment-1',
      kind: 'text',
      name: 'notes.txt',
      sensitivity: 'sensitive',
      retained: false,
      contentText: '12345',
    }])).toBe(13);
  });

  it('binds consent to the conversation and exact sensitive context ids', () => {
    const context = (id: string, sensitivity: AgentContextItem['sensitivity']): AgentContextItem => ({
      id,
      kind: 'selected-text',
      label: id,
      preview: id,
      source: { app: 'reading' },
      sensitivity,
      retained: false,
      createdAt: 1,
    });
    const key = agentSensitiveContextKey('chat-1', [
      context('ordinary', 'ordinary'),
      context('private-b', 'sensitive'),
      context('private-a', 'sensitive'),
    ]);
    expect(key).toBe(agentSensitiveContextKey('chat-1', [
      context('private-a', 'sensitive'),
      context('private-b', 'sensitive'),
    ]));
    expect(agentSensitiveContextKey('chat-2', [context('private-a', 'sensitive')]))
      .not.toBe(agentSensitiveContextKey('chat-1', [context('private-a', 'sensitive')]));
    expect(agentSensitiveContextKey('chat-1', [{
      ...context('private-a', 'sensitive'),
      preview: 'changed disclosure',
    }])).not.toBe(agentSensitiveContextKey('chat-1', [context('private-a', 'sensitive')]));
  });
});
