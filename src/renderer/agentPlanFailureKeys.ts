import type { LocalAgentPlanFailureCode } from '../shared/localAgentRuntime';

/**
 * Main's planner refusals (`localAgent:plan`'s `code`, `localAgent:status`'s `lastErrorCode`) as
 * the keys a surface shows. The `error` text beside a code is English diagnostic text that can
 * name a local model path, so no surface renders it (F3). Spelled out, not built from the code,
 * so the orphan-key gate sees every key in use. The strings live in the lazy AI pack.
 */
const AGENT_PLAN_FAILURE_KEYS: Readonly<Record<LocalAgentPlanFailureCode, string>> = {
  'invalid-request': 'aiAgent.planError.invalidRequest',
  'ai-off': 'aiAgent.planError.aiOff',
  'agent-disabled': 'aiAgent.planError.agentDisabled',
  'model-missing': 'aiAgent.planError.modelMissing',
  'cloud-key-missing': 'aiAgent.planError.cloudKeyMissing',
  'spend-budget': 'aiAgent.planError.spendBudget',
  'cloud-disabled': 'aiAgent.planError.cloudDisabled',
  'objective-too-long': 'aiAgent.planError.objectiveTooLong',
  'context-overflow': 'aiAgent.planError.contextOverflow',
  timeout: 'aiAgent.planError.timeout',
  'plan-invalid': 'aiAgent.planError.planInvalid',
  'planner-failed': 'aiAgent.planError.plannerFailed',
};

export function agentPlanFailureKey(code: LocalAgentPlanFailureCode | undefined): string {
  return (code && AGENT_PLAN_FAILURE_KEYS[code]) || AGENT_PLAN_FAILURE_KEYS['planner-failed'];
}
