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
  /**
   * The draft is one of the everyday study requests (`shared/agentStudyCoach.ts`), which are
   * planned without a model. It lifts only the "no planner" rule: a request the coach can
   * plan needs no model on disk and no cloud key.
   */
  recipeReady?: boolean;
  /**
   * AI readiness for the selected target (`shared/aiSetup.ts`). Absent until
   * main has answered, and absent blocks nothing: a composer must not flash
   * "set up AI" at a user who is set up while the status is in flight.
   */
  setup?: AgentComposerSetupState;
}

export interface AgentComposerSetupState {
  /** "Use AI features". */
  aiEnabled: boolean;
  targetIsLocal: boolean;
  /** Local: an Agent model is on disk. Cloud: a key is saved for the chosen provider. */
  targetReady: boolean;
  agentEnabled: boolean;
  /** A plan can be made: a local model, or a key for the planner's cloud provider. */
  plannerReady: boolean;
  /**
   * Anything at all can run: an Agent model on disk, or a key for any cloud
   * provider. False is a fresh install, and it gets the neutral setup reason
   * with both ways in, rather than whichever side the default target happens
   * to be on — the engine defaults to the cloud, so a new user used to be told
   * "No API key is saved for this cloud provider" and never that an offline
   * model exists.
   */
  anythingReady: boolean;
}

/**
 * `busy` and `planning` are folded together deliberately: from the composer's
 * side they are one state — "a request is in flight, wait for it" — and telling
 * the user which kind of request is in flight does not change what they do.
 */
const inFlight = (s: AgentComposerState) => s.busy || s.planning;

/**
 * Nothing is set up at all. The same sentence Settings > AI uses ("install the
 * offline model or add a cloud key"), and the composer offers both as buttons.
 */
export const AGENT_SETUP_NEEDED_REASON = 'settings.ai.setup.notReady';

/**
 * `undefined` means the button is ENABLED. The shell derives `disabled` from
 * this rather than repeating the condition list, so the two can never disagree —
 * a button that is greyed out with no reason is not expressible.
 */
export function agentPlanDisabledReason(s: AgentComposerState): string | undefined {
  if (inFlight(s)) return 'agent.execute.reason.busy';
  // Setup outranks everything the user could type: no draft fixes a missing
  // model, and saying "write an objective" first sends them the wrong way.
  if (s.setup && !s.setup.aiEnabled) return 'agent.execute.reason.aiOff';
  if (s.setup && !s.setup.agentEnabled) return 'agent.plan.reason.agentDisabled';
  if (s.setup && !s.setup.plannerReady && !s.recipeReady) {
    return s.setup.anythingReady ? 'agent.plan.reason.noPlanner' : AGENT_SETUP_NEEDED_REASON;
  }
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
  if (s.setup && !s.setup.aiEnabled) return 'agent.execute.reason.aiOff';
  if (s.setup && !s.setup.targetReady) {
    if (!s.setup.anythingReady) return AGENT_SETUP_NEEDED_REASON;
    return s.setup.targetIsLocal
      ? 'agent.execute.reason.localModelMissing'
      : 'agent.execute.reason.cloudKeyMissing';
  }
  if (s.attachmentReading) return 'agent.execute.reason.attachmentReading';
  if (s.draft.trim().length === 0) return 'agent.execute.reason.emptyDraft';
  if (s.knownInputOverBudget) return 'agent.execute.inputOverBudget';
  if (s.visionUnsupported) return 'agent.attachment.visionUnsupported';
  if (s.sensitiveConsentRequired && !s.cloudSensitiveConsent) {
    return 'agent.execute.reason.needsConsent';
  }
  return undefined;
}

/**
 * The reasons whose remedy is in Settings > AI. The composer shows the one
 * "Set up AI" link beside exactly these.
 */
export const AGENT_COMPOSER_SETUP_REASON_KEYS: ReadonlySet<string> = new Set([
  'agent.execute.reason.aiOff',
  AGENT_SETUP_NEEDED_REASON,
  'agent.execute.reason.localModelMissing',
  'agent.execute.reason.cloudKeyMissing',
  'agent.plan.reason.agentDisabled',
  'agent.plan.reason.noPlanner',
]);

/** The keys either rule can return, so a catalog test can assert all of them. */
export const AGENT_COMPOSER_REASON_KEYS = [
  ...AGENT_COMPOSER_SETUP_REASON_KEYS,
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
