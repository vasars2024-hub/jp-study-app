import { AGENT_HISTORY_TURN_CEILING } from './agentWorkspace';
import type { AgentPermissionLevel } from './localAgent';
import type { AgentMemoryCategory, AgentMemoryEntry } from './localAgentMemory';
import type { LocalAgentModelMode } from './localAgentModels';

export type LocalAgentBackend = 'local-gguf' | 'disabled';
export type LocalAgentAcceleration = 'auto' | 'cpu' | 'gpu';
export type LocalAgentResourceMode = 'battery-saver' | 'balanced' | 'maximum-intelligence';

/** The user's retained-chat policy, named rather than numeric so the UI can explain it. */
export type LocalAgentChatHistory = 'off' | 'recent' | 'full';

/**
 * How many prior turns each policy replays.
 *
 * `full` is the ceiling itself rather than a copy of it, so widening the router
 * widens this setting and never the other way round.
 */
export const LOCAL_AGENT_CHAT_HISTORY_TURNS: Record<LocalAgentChatHistory, number> = {
  off: 0,
  recent: 4,
  full: AGENT_HISTORY_TURN_CEILING,
};

/** The scope a memory switch set to "everything" covers, in the order the picker offers it. */
export const LOCAL_AGENT_MEMORY_CATEGORIES: readonly AgentMemoryCategory[] = [
  'user-preference',
  'learning',
  'application',
];

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
  /**
   * Which memory categories a request may draw on. `memoryEnabled` is the
   * master switch; this is the scope underneath it, so "remember my
   * preferences but not what I have been studying" is expressible.
   *
   * An empty scope is a real user choice and means the same thing as the switch
   * being off. It is distinguishable from an absent field, which means a
   * document written before this setting existed and restores every category.
   */
  memoryScope: AgentMemoryCategory[];
  /** How much of the conversation may be replayed to a provider. */
  chatHistory: LocalAgentChatHistory;
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
  memoryScope: [...LOCAL_AGENT_MEMORY_CATEGORIES],
  chatHistory: 'full',
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
const MEMORY_CATEGORIES = new Set<AgentMemoryCategory>(LOCAL_AGENT_MEMORY_CATEGORIES);
const CHAT_HISTORIES = new Set<LocalAgentChatHistory>(['off', 'recent', 'full']);

/**
 * Absent restores every category; an array is taken as written, including empty.
 *
 * The distinction is the whole point. A document saved before this setting
 * existed must not silently lose the memories it was already using, and a user
 * who deselects every category must not silently get all of them back.
 */
function memoryScope(value: unknown): AgentMemoryCategory[] {
  if (!Array.isArray(value)) return [...LOCAL_AGENT_MEMORY_CATEGORIES];
  const chosen = new Set(
    value.filter((entry): entry is AgentMemoryCategory => (
      MEMORY_CATEGORIES.has(entry as AgentMemoryCategory)
    )),
  );
  return LOCAL_AGENT_MEMORY_CATEGORIES.filter((category) => chosen.has(category));
}

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
    memoryScope: memoryScope(raw.memoryScope),
    chatHistory: CHAT_HISTORIES.has(raw.chatHistory as LocalAgentChatHistory)
      ? raw.chatHistory as LocalAgentChatHistory
      : DEFAULT_LOCAL_AGENT_SETTINGS.chatHistory,
    privacyMode: raw.privacyMode !== false,
    debugMode: raw.debugMode === true,
  };
}

/**
 * The memories a request is actually allowed to carry, given the switch and the scope.
 *
 * Lives in shared rather than beside its caller so main can apply it at the one
 * choke point every renderer producer passes through — the central Agent's
 * planner and Blanc's separate shell both arrive at the same plan handler. A
 * scope enforced only where its control lives is a privacy setting with a second
 * door standing open.
 *
 * An empty scope returns nothing, exactly as the switch being off does. That
 * equivalence is deliberate and is what the panel's note tells the user.
 */
export function memoriesInAgentScope(
  settings: LocalAgentSettings,
  memories: readonly AgentMemoryEntry[] | undefined,
): readonly AgentMemoryEntry[] {
  if (!settings.memoryEnabled || settings.memoryScope.length === 0) return [];
  const scope = new Set(settings.memoryScope);
  return (memories ?? []).filter((entry) => scope.has(entry.category));
}
