import { describe, expect, it } from 'vitest';
import type { AgentContextItem } from '../../shared/agentWorkspace';
import {
  agentKnownInputChars,
  agentPriceFromRateDraft,
  agentRateDraftFromPrice,
  agentSensitiveContextKey,
  clampAgentCostBudgetUsd,
  clampAgentExecutionBudget,
} from '../agentExecutionPolicyDraft';
import {
  AGENT_COST_BUDGET_DEFAULT_USD,
  AGENT_COST_BUDGET_MAX_USD,
  AGENT_COST_BUDGET_MIN_USD,
} from '../../shared/agentProviderPricing';

describe('Agent execution policy draft', () => {
  it('clamps finite budgets and restores the default for an invalid number', () => {
    expect(clampAgentExecutionBudget(2_500.6, 1_500, 1, 16_384)).toBe(2_501);
    expect(clampAgentExecutionBudget(-4, 1_500, 1, 16_384)).toBe(1);
    expect(clampAgentExecutionBudget(99_999, 1_500, 1, 16_384)).toBe(16_384);
    expect(clampAgentExecutionBudget(Number.NaN, 1_500, 1, 16_384)).toBe(1_500);
  });

  /**
   * The rate fields hold text while they are being typed, so the interesting
   * cases are the ones between "empty" and "a complete price". A draft that is
   * half filled in has to read as *no* price rather than as a cheap one: the
   * store would otherwise keep a rate the estimate silently under-reports from,
   * and the cost cap built on that estimate would pass requests it should have
   * refused.
   */
  it('reads a price out of a rate draft only once both halves parse', () => {
    expect(agentPriceFromRateDraft({ input: '0.3', output: '2.5' })).toEqual({
      inputPerMillionTokens: 0.3,
      outputPerMillionTokens: 2.5,
    });
    // A free tier is a real price, and must not be mistaken for an empty field.
    expect(agentPriceFromRateDraft({ input: '0', output: '0' })).toEqual({
      inputPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    });
    expect(agentPriceFromRateDraft({ input: '0.3', output: '' })).toBeNull();
    expect(agentPriceFromRateDraft({ input: '', output: '' })).toBeNull();
    expect(agentPriceFromRateDraft({ input: '0.3', output: 'free' })).toBeNull();
    expect(agentPriceFromRateDraft({ input: '0.3', output: '-1' })).toBeNull();
  });

  it('round-trips a stored price back into the fields, and an absent one into blanks', () => {
    const price = { inputPerMillionTokens: 0.27, outputPerMillionTokens: 1.1 };
    expect(agentPriceFromRateDraft(agentRateDraftFromPrice(price))).toEqual(price);
    expect(agentRateDraftFromPrice(undefined)).toEqual({ input: '', output: '' });
  });

  it('never clamps the cost cap to zero, which would refuse every request', () => {
    expect(clampAgentCostBudgetUsd(0.5)).toBe(0.5);
    expect(clampAgentCostBudgetUsd(0)).toBe(AGENT_COST_BUDGET_MIN_USD);
    expect(clampAgentCostBudgetUsd(-5)).toBe(AGENT_COST_BUDGET_MIN_USD);
    expect(clampAgentCostBudgetUsd(10_000)).toBe(AGENT_COST_BUDGET_MAX_USD);
    // An emptied number input reports `NaN`, which is "no figure typed yet"
    // rather than "spend nothing".
    expect(clampAgentCostBudgetUsd(Number.NaN)).toBe(AGENT_COST_BUDGET_DEFAULT_USD);
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
