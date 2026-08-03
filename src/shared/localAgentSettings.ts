import type { AgentPermissionLevel } from './localAgent';
import type { LocalAgentModelMode } from './localAgentModels';

export type LocalAgentBackend = 'local-gguf' | 'disabled';
export type LocalAgentAcceleration = 'auto' | 'cpu' | 'gpu';
export type LocalAgentResourceMode = 'battery-saver' | 'balanced' | 'maximum-intelligence';

export interface LocalAgentSettings {
  version: 1;
  enabled: boolean;
  backend: LocalAgentBackend;
  modelFileName: string;
  modelMode: LocalAgentModelMode;
  acceleration: LocalAgentAcceleration;
  contextSize: number;
  memoryLimitMb: number;
  resourceMode: LocalAgentResourceMode;
  cpuLimitPct: number;
  gpuLimitPct: number;
  maxConcurrentTasks: number;
  backgroundProcessing: boolean;
  permission: AgentPermissionLevel;
  memoryEnabled: boolean;
  privacyMode: boolean;
  debugMode: boolean;
}

export const DEFAULT_LOCAL_AGENT_SETTINGS: LocalAgentSettings = {
  version: 1,
  enabled: false,
  backend: 'local-gguf',
  modelFileName: '',
  modelMode: 'standard',
  acceleration: 'auto',
  contextSize: 8_192,
  memoryLimitMb: 2_048,
  resourceMode: 'balanced',
  cpuLimitPct: 80,
  gpuLimitPct: 80,
  maxConcurrentTasks: 1,
  backgroundProcessing: false,
  permission: 'read-only',
  memoryEnabled: true,
  privacyMode: true,
  debugMode: false,
};

const BACKENDS = new Set<LocalAgentBackend>(['local-gguf', 'disabled']);
const ACCELERATIONS = new Set<LocalAgentAcceleration>(['auto', 'cpu', 'gpu']);
const RESOURCE_MODES = new Set<LocalAgentResourceMode>(['battery-saver', 'balanced', 'maximum-intelligence']);
const MODEL_MODES = new Set<LocalAgentModelMode>(['lite', 'standard', 'power']);
const PERMISSIONS = new Set<AgentPermissionLevel>([
  'read-only',
  'limited-actions',
  'full-automation',
]);

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function safeModelFileName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const name = value.trim().slice(0, 240);
  if (!name.toLocaleLowerCase().endsWith('.gguf')) return '';
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return '';
  return name;
}

export function normalizeLocalAgentSettings(input: unknown): LocalAgentSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_LOCAL_AGENT_SETTINGS };
  const raw = input as Partial<LocalAgentSettings>;
  const backend = BACKENDS.has(raw.backend as LocalAgentBackend)
    ? raw.backend as LocalAgentBackend
    : 'disabled';
  return {
    version: 1,
    enabled: raw.enabled === true && backend !== 'disabled',
    backend,
    modelFileName: safeModelFileName(raw.modelFileName),
    modelMode: MODEL_MODES.has(raw.modelMode as LocalAgentModelMode)
      ? raw.modelMode as LocalAgentModelMode
      : DEFAULT_LOCAL_AGENT_SETTINGS.modelMode,
    acceleration: ACCELERATIONS.has(raw.acceleration as LocalAgentAcceleration)
      ? raw.acceleration as LocalAgentAcceleration
      : DEFAULT_LOCAL_AGENT_SETTINGS.acceleration,
    contextSize: boundedInteger(raw.contextSize, DEFAULT_LOCAL_AGENT_SETTINGS.contextSize, 2_048, 32_768),
    memoryLimitMb: boundedInteger(
      raw.memoryLimitMb,
      DEFAULT_LOCAL_AGENT_SETTINGS.memoryLimitMb,
      256,
      16_384,
    ),
    resourceMode: RESOURCE_MODES.has(raw.resourceMode as LocalAgentResourceMode)
      ? raw.resourceMode as LocalAgentResourceMode
      : DEFAULT_LOCAL_AGENT_SETTINGS.resourceMode,
    cpuLimitPct: boundedInteger(raw.cpuLimitPct, DEFAULT_LOCAL_AGENT_SETTINGS.cpuLimitPct, 10, 100),
    gpuLimitPct: boundedInteger(raw.gpuLimitPct, DEFAULT_LOCAL_AGENT_SETTINGS.gpuLimitPct, 10, 100),
    maxConcurrentTasks: boundedInteger(raw.maxConcurrentTasks, DEFAULT_LOCAL_AGENT_SETTINGS.maxConcurrentTasks, 1, 3),
    backgroundProcessing: raw.backgroundProcessing === true,
    permission: PERMISSIONS.has(raw.permission as AgentPermissionLevel)
      ? raw.permission as AgentPermissionLevel
      : DEFAULT_LOCAL_AGENT_SETTINGS.permission,
    memoryEnabled: raw.memoryEnabled !== false,
    privacyMode: raw.privacyMode !== false,
    debugMode: raw.debugMode === true,
  };
}
