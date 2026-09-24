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
}

export interface LocalAgentRuntimeStatus {
  loaded: boolean;
  busy: boolean;
  modelFileName?: string;
  contextSize?: number;
  lastError?: string;
}

export interface LocalAgentModelInfo {
  fileName: string;
  sizeBytes: number;
  location: 'app-models' | 'downloads';
}
