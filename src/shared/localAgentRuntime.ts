import type { AiProviderId } from './aiProviders';
import type { AgentMemoryEntry } from './localAgentMemory';
import type { AgentTask, AgentToolOperationId } from './localAgent';
import type { LocalAgentSettings } from './localAgentSettings';
import type { AgentProfile } from './localAgentProfiles';

export interface LocalAgentPlanRequest {
  objective: string;
  settings: LocalAgentSettings;
  availableOperations?: readonly AgentToolOperationId[];
  profile?: AgentProfile;
  memories?: readonly AgentMemoryEntry[];
  applicationState?: Readonly<Record<string, unknown>>;
  /**
   * Where the plan should be made: the local model, or a cloud provider. Absent
   * means local. A local request with no model on disk falls back to
   * `cloudProviderId` when that provider has a key, so a cloud-only user gets
   * the Agent's tools too, not only its chat.
   */
  target?: 'local' | AiProviderId;
  cloudProviderId?: AiProviderId;
  /**
   * The tool-result loop: what the steps of the earlier rounds returned, oldest first, so the
   * planner can plan the next steps from real output. Main gates each output for a cloud planner
   * (`toolOutputForPlanner`) and bounds its size; the renderer sends it as the steps recorded it.
   */
  toolResults?: readonly LocalAgentToolResult[];
  /** Which round of the loop this plan is, 1-based. Absent means the first. */
  round?: number;
}

/** One step's outcome, fed back to the planner by the tool-result loop. */
export interface LocalAgentToolResult {
  operation: AgentToolOperationId;
  label?: string;
  ok: boolean;
  output?: unknown;
}

/**
 * Why a plan was not made, as a code the renderer translates. The `error`
 * string beside it is English diagnostic text and may name a local path.
 */
export type LocalAgentPlanFailureCode =
  | 'invalid-request'
  | 'ai-off'
  | 'agent-disabled'
  | 'model-missing'
  | 'cloud-key-missing'
  | 'spend-budget'
  | 'cloud-disabled'
  /** The request is longer than the 500 characters a plan takes. */
  | 'objective-too-long'
  /** The prompt leaves no room for a plan in the configured context size. */
  | 'context-overflow'
  /** The model did not finish within the planner's deadline. */
  | 'timeout'
  /** The model answered with something that is not a valid plan. */
  | 'plan-invalid'
  | 'planner-failed';

export interface LocalAgentPlanResponse {
  ok: boolean;
  summary?: string;
  task?: AgentTask | null;
  modelFileName?: string;
  elapsedMs?: number;
  error?: string;
  code?: LocalAgentPlanFailureCode;
  /** Which planner produced the plan, so the surface can disclose a cloud one. */
  planner?: 'local' | 'cloud';
  /**
   * The planner wants to see what these steps return before it plans the rest: the renderer
   * re-plans with their output once the task has completed (at most `MAX_AGENT_LOOP_ROUNDS`).
   */
  continues?: boolean;
}

export interface LocalAgentRuntimeStatus {
  loaded: boolean;
  busy: boolean;
  modelFileName?: string;
  contextSize?: number;
  /** English diagnostic text, which may name a local path; the UI shows `lastErrorCode` instead. */
  lastError?: string;
  lastErrorCode?: LocalAgentPlanFailureCode;
}

export interface LocalAgentModelInfo {
  fileName: string;
  sizeBytes: number;
  location: 'app-models' | 'downloads';
}
