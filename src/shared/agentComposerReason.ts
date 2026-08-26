/**
 * Why the Agent composer's two buttons are disabled — as ordered rules rather
 * than a constant.
 *
 * `Send` disables on seven ORed conditions and `Create action plan` on six, so
 * the shell had them greyed out with no `title`, no `aria-describedby` and
 * nothing beside them: the category-8 sweep scored both as mute pairs. A single
 * sentence would be wrong in six of the seven cases, which is the whole reason
 * this is a function.
 *
 * It lives here rather than inline in `AgentWorkspaceShell.tsx` so the PRIORITY
 * can be tested. The order is what makes the answer useful — "write a prompt"
 * has to win over "the input is over budget", because an empty draft cannot be
 * over budget and reporting the later rule would send the user looking for a
 * problem they do not have. Returning i18n KEYS keeps this file free of English.
 */

export interface AgentComposerState {
  busy: boolean;
  planning: boolean;
  attachmentReading: boolean;
  attachmentCount: number;
  draft: string;
  planObjectiveTooLong: boolean;
  knownInputOverBudget: boolean;
  visionUnsupported: boolean;
  sensitiveConsentRequired: boolean;
  cloudSensitiveConsent: boolean;
}

/**
 * `busy` and `planning` are folded together deliberately: from the composer's
 * side they are one state — "a request is in flight, wait for it" — and telling
 * the user which kind of request is in flight does not change what they do.
 */
const inFlight = (s: AgentComposerState) => s.busy || s.planning;

/**
 * `undefined` means the button is ENABLED. The shell derives `disabled` from
 * this rather than repeating the condition list, so the two can never disagree —
 * a button that is greyed out with no reason is not expressible.
 */
export function agentPlanDisabledReason(s: AgentComposerState): string | undefined {
  if (inFlight(s)) return 'agent.execute.reason.busy';
  if (s.attachmentReading) return 'agent.execute.reason.attachmentReading';
  // Ahead of the empty-draft rule on purpose: attached files block plan creation
  // whatever the objective says, so clearing them is the first move either way.
  if (s.attachmentCount > 0) return 'agent.plan.attachmentsUnsupported';
  if (s.draft.trim().length === 0) return 'agent.plan.reason.emptyObjective';
  if (s.planObjectiveTooLong) return 'agent.plan.error.invalid-objective';
  return undefined;
}

export function agentSendDisabledReason(s: AgentComposerState): string | undefined {
  if (inFlight(s)) return 'agent.execute.reason.busy';
  if (s.attachmentReading) return 'agent.execute.reason.attachmentReading';
  if (s.draft.trim().length === 0) return 'agent.execute.reason.emptyDraft';
  if (s.knownInputOverBudget) return 'agent.execute.inputOverBudget';
  if (s.visionUnsupported) return 'agent.attachment.visionUnsupported';
  if (s.sensitiveConsentRequired && !s.cloudSensitiveConsent) {
    return 'agent.execute.reason.needsConsent';
  }
  return undefined;
}

/** The keys either rule can return, so a catalog test can assert all of them. */
export const AGENT_COMPOSER_REASON_KEYS = [
  'agent.execute.reason.busy',
  'agent.execute.reason.attachmentReading',
  'agent.execute.reason.emptyDraft',
  'agent.execute.reason.needsConsent',
  'agent.plan.reason.emptyObjective',
  'agent.plan.attachmentsUnsupported',
  'agent.plan.error.invalid-objective',
  'agent.execute.inputOverBudget',
  'agent.attachment.visionUnsupported',
] as const;
