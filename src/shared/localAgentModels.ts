export type LocalAgentModelRole = 'agent' | 'tutor' | 'coding' | 'speech';
export type LocalAgentModelMode = 'lite' | 'standard' | 'power';

export interface LocalAgentModelSpec {
  id: string;
  name: string;
  fileName: string;
  /**
   * Other names the same weights are commonly saved under. The first is what
   * the app's own installer writes; the rest are the names a user who fetched
   * the file by hand most likely has. Matching is case-insensitive.
   */
  aliases?: readonly string[];
  roles: LocalAgentModelRole[];
  modes: LocalAgentModelMode[];
  memoryRequirementMb: number;
  speed: 'fast' | 'balanced' | 'slow';
  quality: 'good' | 'very-good' | 'excellent';
  capabilities: string[];
}

/**
 * The asset id of the one model the app can install by itself
 * (`shared/assetRegistry.ts`). Every offline AI feature — translation, AI cards,
 * sentence analysis and the Agent — works with it.
 */
export const DEFAULT_LOCAL_MODEL_ASSET_ID = 'qwen3-1.7b';

/**
 * Every file name that is Qwen3-1.7B. One list, read by `translate.ts` and
 * `localAgent.ts` alike, so "is the offline model installed" has one answer.
 * The installer's own name (`Qwen3-1.7B-Q8_0.gguf`, the quantisation Qwen
 * publishes) leads; the rest are the names people download by hand.
 */
export const QWEN3_1_7B_FILE_NAMES: readonly string[] = [
  'Qwen3-1.7B-Q8_0.gguf',
  'Qwen3-1.7B.gguf',
  'Qwen_Qwen3-1.7B-Q4_K_M.gguf',
  'Qwen3-1.7B-Q4_K_M.gguf',
];

export const LOCAL_AGENT_MODEL_CATALOG: readonly LocalAgentModelSpec[] = [
  {
    id: 'qwen3-1.7b', name: 'Qwen3 1.7B', fileName: 'Qwen3-1.7B.gguf',
    aliases: QWEN3_1_7B_FILE_NAMES,
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
    id: 'qwen3-32b', name: 'Qwen3 32B', fileName: 'Qwen3-32B.gguf',
    roles: ['agent', 'tutor'], modes: ['power'], memoryRequirementMb: 24_576,
    speed: 'slow', quality: 'excellent', capabilities: ['Japanese', 'reasoning', 'nuance', 'tool planning'],
  },
  {
    id: 'deepseek-coder', name: 'DeepSeek Coder', fileName: 'DeepSeek-Coder-V2.gguf',
    roles: ['coding'], modes: ['power'], memoryRequirementMb: 16_384,
    speed: 'slow', quality: 'excellent', capabilities: ['coding', 'debugging'],
  },
  // No embedding row. `bge-m3` sat here for months with nothing that could load
  // an ONNX encoder or query a vector index behind it, so recommending it named
  // a capability the app does not have.
  {
    id: 'whisper-small', name: 'Whisper Small', fileName: 'ggml-small.bin',
    roles: ['speech'], modes: ['standard', 'power'], memoryRequirementMb: 1_024,
    speed: 'balanced', quality: 'very-good', capabilities: ['Japanese transcription', 'listening practice'],
  },
];

export function recommendedLocalAgentModels(mode: LocalAgentModelMode): LocalAgentModelSpec[] {
  return LOCAL_AGENT_MODEL_CATALOG.filter((model) => model.modes.includes(mode));
}

/** Every name a spec answers to, lower-cased. */
function specNames(model: LocalAgentModelSpec): string[] {
  return [model.fileName, ...(model.aliases ?? [])].map((name) => name.toLocaleLowerCase());
}

/** The installed file that holds `model`, in the installed list's own spelling, if any. */
export function installedFileNameFor(
  model: LocalAgentModelSpec,
  installedFileNames: readonly string[],
): string | null {
  const names = new Set(specNames(model));
  return installedFileNames.find((name) => names.has(name.toLocaleLowerCase())) ?? null;
}

/**
 * The model that should serve `role`, chosen from what is actually installed.
 *
 * A preferred file wins when it is installed and belongs to a model that can
 * serve the role. Otherwise the mode's own recommendations are tried in catalog
 * order, and then — rather than reporting "no model" while a capable one sits
 * on disk — any installed model with the role at all. A user in Power mode with
 * only the small model installed still gets an answer from the small model.
 */
export function resolveLocalAgentModel(
  role: LocalAgentModelRole,
  mode: LocalAgentModelMode,
  preferredFileName: string | undefined,
  installedFileNames: readonly string[],
): LocalAgentModelSpec | null {
  const withRole = LOCAL_AGENT_MODEL_CATALOG.filter((model) => model.roles.includes(role));
  const inMode = withRole.filter((model) => model.modes.includes(mode));
  const installed = (model: LocalAgentModelSpec): boolean => installedFileNameFor(model, installedFileNames) !== null;
  const preferred = preferredFileName?.trim().toLocaleLowerCase();
  return withRole.find((model) => preferred && specNames(model).includes(preferred) && installed(model))
    ?? inMode.find(installed)
    ?? withRole.find(installed)
    ?? null;
}
