export type LocalAgentModelRole = 'agent' | 'tutor' | 'coding' | 'embedding' | 'speech';
export type LocalAgentModelMode = 'lite' | 'standard' | 'power';

export interface LocalAgentModelSpec {
  id: string;
  name: string;
  fileName: string;
  roles: LocalAgentModelRole[];
  modes: LocalAgentModelMode[];
  memoryRequirementMb: number;
  speed: 'fast' | 'balanced' | 'slow';
  quality: 'good' | 'very-good' | 'excellent';
  capabilities: string[];
}

export const LOCAL_AGENT_MODEL_CATALOG: readonly LocalAgentModelSpec[] = [
  {
    id: 'qwen3-1.7b', name: 'Qwen3 1.7B', fileName: 'Qwen3-1.7B.gguf',
    roles: ['agent', 'tutor'], modes: ['lite', 'standard'], memoryRequirementMb: 2_048,
    speed: 'fast', quality: 'good', capabilities: ['Japanese', 'tool planning', 'explanations'],
  },
  {
    id: 'qwen3-8b', name: 'Qwen3 8B', fileName: 'Qwen3-8B.gguf',
    roles: ['agent', 'tutor'], modes: ['standard', 'power'], memoryRequirementMb: 8_192,
    speed: 'balanced', quality: 'very-good', capabilities: ['Japanese', 'reasoning', 'tool planning'],
  },
  {
    id: 'qwen3-14b', name: 'Qwen3 14B', fileName: 'Qwen3-14B.gguf',
    roles: ['agent', 'tutor'], modes: ['power'], memoryRequirementMb: 14_336,
    speed: 'slow', quality: 'excellent', capabilities: ['Japanese', 'reasoning', 'nuance', 'tool planning'],
  },
  {
    id: 'deepseek-coder', name: 'DeepSeek Coder', fileName: 'DeepSeek-Coder-V2.gguf',
    roles: ['coding'], modes: ['power'], memoryRequirementMb: 16_384,
    speed: 'slow', quality: 'excellent', capabilities: ['coding', 'debugging'],
  },
  {
    id: 'bge-m3', name: 'BGE-M3 Embeddings', fileName: 'bge-m3.onnx',
    roles: ['embedding'], modes: ['standard', 'power'], memoryRequirementMb: 1_024,
    speed: 'fast', quality: 'very-good', capabilities: ['multilingual retrieval', 'semantic search'],
  },
  {
    id: 'whisper-small', name: 'Whisper Small', fileName: 'ggml-small.bin',
    roles: ['speech'], modes: ['standard', 'power'], memoryRequirementMb: 1_024,
    speed: 'balanced', quality: 'very-good', capabilities: ['Japanese transcription', 'listening practice'],
  },
];

export function recommendedLocalAgentModels(mode: LocalAgentModelMode): LocalAgentModelSpec[] {
  return LOCAL_AGENT_MODEL_CATALOG.filter((model) => model.modes.includes(mode));
}

export function resolveLocalAgentModel(
  role: LocalAgentModelRole,
  mode: LocalAgentModelMode,
  preferredFileName: string | undefined,
  installedFileNames: readonly string[],
): LocalAgentModelSpec | null {
  const installed = new Set(installedFileNames.map((name) => name.toLocaleLowerCase()));
  const candidates = LOCAL_AGENT_MODEL_CATALOG.filter((model) => model.roles.includes(role) && model.modes.includes(mode));
  const preferred = preferredFileName?.trim().toLocaleLowerCase();
  return candidates.find((model) => preferred && model.fileName.toLocaleLowerCase() === preferred && installed.has(model.fileName.toLocaleLowerCase()))
    ?? candidates.find((model) => installed.has(model.fileName.toLocaleLowerCase()))
    ?? null;
}
