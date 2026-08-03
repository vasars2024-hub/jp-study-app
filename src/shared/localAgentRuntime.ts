import type { AgentMemoryEntry } from './localAgentMemory';
import type { AgentTask } from './localAgent';
import type { LocalAgentSettings } from './localAgentSettings';
import type { AgentProfile } from './localAgentProfiles';

export interface LocalAgentPlanRequest {
  objective: string;
  settings: LocalAgentSettings;
  profile?: AgentProfile;
  memories?: readonly AgentMemoryEntry[];
  applicationState?: Readonly<Record<string, unknown>>;
}

export interface LocalAgentPlanResponse {
  ok: boolean;
  summary?: string;
  task?: AgentTask | null;
  modelFileName?: string;
  elapsedMs?: number;
  error?: string;
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
