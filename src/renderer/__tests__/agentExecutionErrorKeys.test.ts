/**
 * Every Agent execution failure maps to a message that names its remedy, in all four
 * UI languages: offline, rate-limited and timed-out are three different things to do.
 */
import { describe, expect, it } from 'vitest';
import {
  agentOfflinePreflight,
  executionErrorKey,
  executionErrorNeedsSetup,
  localizeAgentStepError,
} from '../components/agent/agentExecutionTargets';
import type { AgentExecutionFailureCode } from '../../shared/agentExecutionBridge';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';

const CODES: AgentExecutionFailureCode[] = [
  'invalid-request', 'conversation-not-found', 'busy', 'store-failed', 'cancelled', 'timeout',
  'missing-credential', 'persistent-cache-unavailable', 'cloud-disabled', 'sensitive-context',
  'input-budget', 'cost-budget', 'spend-budget', 'authentication', 'rate-limit', 'upstream',
  'network', 'invalid-response', 'provider-failed', 'vision-unsupported', 'local-model-missing',
  'ai-off', 'bridge-unavailable',
];

describe('Agent execution error messages', () => {
  it('gives offline, rate limit and timeout their own message', () => {
    expect(executionErrorKey('network')).toBe('agent.execute.error.offline');
    expect(executionErrorKey('rate-limit')).toBe('agent.execute.error.rateLimit');
    expect(executionErrorKey('timeout')).toBe('agent.execute.error.timeout');
    expect(executionErrorKey('upstream')).toBe('agent.execute.error.transient');
  });

  it('offers setup for a missing key, a missing model and AI switched off', () => {
    expect(executionErrorNeedsSetup('missing-credential')).toBe(true);
    expect(executionErrorNeedsSetup('local-model-missing')).toBe(true);
    expect(executionErrorNeedsSetup('ai-off')).toBe(true);
    expect(executionErrorNeedsSetup('network')).toBe(false);
  });

  it('refuses a cloud send at once when offline, unless the offline model may answer', () => {
    expect(agentOfflinePreflight('gemini-2.5-flash', false, false)).toBe('network');
    expect(agentOfflinePreflight('gemini-2.5-flash', false, true)).toBeNull();
    expect(agentOfflinePreflight('gemini-2.5-flash', true, false)).toBeNull();
    expect(agentOfflinePreflight('local', false, false)).toBeNull();
  });

  it('says the executor\'s refusals in the UI language, and leaves other errors alone', () => {
    const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
    expect(localizeAgentStepError('Search local knowledge is not enabled for the active agent profile.', t))
      .toBe('agent.refusal.notEnabled{"operation":"agent.capabilities.operation.dictionary.search-knowledge"}');
    expect(localizeAgentStepError('Delete a calendar event requires full-automation permission.', t))
      .toBe('agent.refusal.needsPermission{"operation":"agent.capabilities.operation.calendar.delete-event","level":"agent.capabilities.permission.full-automation"}');
    expect(localizeAgentStepError('No approved adapter is installed for flashcard.schedule-reviews.', t))
      .toBe('agent.refusal.noAdapter{"operation":"agent.capabilities.operation.flashcard.schedule-reviews"}');
    expect(localizeAgentStepError('The approved tool failed.', t)).toBe('agent.refusal.toolFailed');
    expect(localizeAgentStepError('The requested operation is not approved.', t)).toBe('agent.refusal.notApproved');
    expect(localizeAgentStepError('Move a calendar event was requested at an unrecognized permission level.', t))
      .toBe('agent.refusal.unknownPermission{"operation":"agent.capabilities.operation.calendar.reschedule-event"}');
    expect(localizeAgentStepError('planner.agent.error.eventNotFound', t)).toBe('planner.agent.error.eventNotFound');
    for (const key of ['agent.refusal.notEnabled', 'agent.refusal.needsPermission', 'agent.refusal.noAdapter', 'agent.refusal.toolFailed', 'agent.refusal.notApproved', 'agent.refusal.unknownPermission', 'agent.execute.offlineNow']) {
      for (const catalog of [en, ja, zh, ru]) expect(catalog[key], key).toBeTruthy();
    }
  });

  it('has a translated message for every failure code', () => {
    for (const code of CODES) {
      const key = executionErrorKey(code);
      for (const catalog of [en, ja, zh, ru]) {
        expect(catalog[key], `${code} → ${key}`).toBeTruthy();
      }
    }
  });
});
