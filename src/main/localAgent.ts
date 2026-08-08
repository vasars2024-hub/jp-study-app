import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LlamaChatSession } from 'node-llama-cpp';
import {
  buildLocalAgentSystemPrompt,
  parseLocalAgentModelPlan,
  selectLocalAgentApprovedOperations,
} from '../shared/localAgentPrompt';
import { AGENT_TOOL_OPERATIONS, type AgentToolOperationId } from '../shared/localAgent';
import { normalizeLocalAgentSettings, type LocalAgentSettings } from '../shared/localAgentSettings';
import { effectiveAgentPermission } from '../shared/localAgentProfiles';
import { recommendedLocalAgentModels } from '../shared/localAgentModels';
import type {
  LocalAgentPlanRequest,
  LocalAgentPlanResponse,
  LocalAgentModelInfo,
  LocalAgentRuntimeStatus,
} from '../shared/localAgentRuntime';
import { registerAgentExecutionIpc } from './agentExecutionIpc';
import { registerAgentWorkspaceIpc } from './agentWorkspaceIpc';
import { registerAgentOperationalIpc } from './agentOperationalIpc';
export { getAgentWorkspaceStore } from './agentWorkspaceStore';
export { runAgentProviderPrompt } from './agentProviderRouter';

const KNOWN_MODEL_FILENAMES = ['Qwen3-1.7B.gguf', 'Qwen_Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-8B.gguf', 'Qwen3-14B.gguf', 'Qwen3-32B.gguf'];
const PLAN_TIMEOUT_MS = 90_000;
const IDLE_UNLOAD_MS = 5 * 60_000;

interface LoadedAgentRuntime {
  modelPath: string;
  contextSize: number;
  session: LlamaChatSession;
  model: { dispose?: () => void | Promise<void> };
  context: { dispose?: () => void | Promise<void> };
}

let runtime: LoadedAgentRuntime | null = null;
let loadPromise: Promise<LoadedAgentRuntime> | null = null;
let inferenceChain: Promise<unknown> = Promise.resolve();
let activeInferenceCount = 0;
let lastError = '';
let idleUnloadTimer: ReturnType<typeof setTimeout> | null = null;

function cleanObjective(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A request is required.');
  const objective = value.trim();
  if (!objective) throw new Error('A request is required.');
  if (objective.length > 500) throw new Error('The request is too long.');
  return objective;
}

function resolveModelPath(settings: LocalAgentSettings, preferredModelFileName?: string): string | null {
  const explicit = preferredModelFileName || settings.modelFileName;
  const names = explicit
    ? [explicit]
    : [...new Set([
      ...recommendedLocalAgentModels(settings.modelMode)
        .filter((model) => model.fileName.toLocaleLowerCase().endsWith('.gguf'))
        .map((model) => model.fileName),
      ...(settings.modelMode === 'standard' ? KNOWN_MODEL_FILENAMES : []),
    ])];
  const roots = [
    path.join(app.getPath('userData'), 'models'),
    path.join(os.homedir(), 'Downloads'),
  ];
  for (const root of roots) {
    for (const name of names) {
      if (!/^[^\\/]+\.gguf$/i.test(name)) continue;
      const candidate = path.join(root, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // A missing model is reported as a user-facing availability error.
      }
    }
  }
  return null;
}

function resetSessionHistory(session: LlamaChatSession): void {
  const mutable = session as LlamaChatSession & {
    resetChatHistory?: () => void;
    setChatHistory?: (history: []) => void;
  };
  if (typeof mutable.resetChatHistory === 'function') mutable.resetChatHistory();
  else if (typeof mutable.setChatHistory === 'function') mutable.setChatHistory([]);
}

async function disposeRuntime(value: LoadedAgentRuntime | null): Promise<void> {
  if (!value) return;
  try {
    await value.context.dispose?.();
    await value.model.dispose?.();
  } catch {
    // Native model cleanup is best effort; the next runtime still loads safely.
  }
}

function scheduleIdleUnload(): void {
  if (idleUnloadTimer) clearTimeout(idleUnloadTimer);
  idleUnloadTimer = setTimeout(() => {
    idleUnloadTimer = null;
    if (activeInferenceCount === 0 && !loadPromise && runtime) {
      const stale = runtime;
      runtime = null;
      void disposeRuntime(stale);
    }
  }, IDLE_UNLOAD_MS);
}

function listAvailableModels(): LocalAgentModelInfo[] {
  const roots: Array<{ root: string; location: LocalAgentModelInfo['location'] }> = [
    { root: path.join(app.getPath('userData'), 'models'), location: 'app-models' },
    { root: path.join(os.homedir(), 'Downloads'), location: 'downloads' },
  ];
  const found: LocalAgentModelInfo[] = [];
  for (const { root, location } of roots) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const directory = entry.isDirectory() ? path.join(root, entry.name) : root;
      const names = entry.isDirectory()
        ? (() => { try { return fs.readdirSync(directory, { withFileTypes: true }); } catch { return []; } })()
        : [entry];
      for (const nested of names) {
        if (!nested.isFile() || !/^[^\\/]+\.gguf$/i.test(nested.name)) continue;
        try {
          found.push({ fileName: nested.name, sizeBytes: fs.statSync(path.join(directory, nested.name)).size, location });
        } catch { /* A model can disappear while the folder is being scanned. */ }
      }
    }
  }
  return found
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .filter((model, index, all) => all.findIndex((candidate) => candidate.fileName.toLocaleLowerCase() === model.fileName.toLocaleLowerCase()) === index)
    .slice(0, 100);
}

async function loadRuntime(settings: LocalAgentSettings, modelPath: string): Promise<LoadedAgentRuntime> {
  const keyMatches = runtime?.modelPath === modelPath && runtime.contextSize === settings.contextSize;
  if (keyMatches && runtime) return runtime;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await disposeRuntime(runtime);
    runtime = null;
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext({ contextSize: settings.contextSize });
    const loaded: LoadedAgentRuntime = {
      modelPath,
      contextSize: settings.contextSize,
      session: new LlamaChatSession({ contextSequence: context.getSequence() }),
      model,
      context,
    };
    runtime = loaded;
    return loaded;
  })();
  loadPromise.catch(() => {
    loadPromise = null;
  });
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

async function promptWithTimeout(session: LlamaChatSession, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLAN_TIMEOUT_MS);
  try {
    return await session.prompt(prompt, {
      maxTokens: 1_500,
      signal: controller.signal,
      stopOnAbortSignal: true,
    });
  } finally {
    clearTimeout(timer);
    resetSessionHistory(session);
  }
}

function queueInference<T>(run: () => Promise<T>): Promise<T> {
  const next = inferenceChain.then(run, run);
  inferenceChain = next.then(() => undefined, () => undefined);
  return next;
}

async function plan(request: LocalAgentPlanRequest): Promise<LocalAgentPlanResponse> {
  const startedAt = Date.now();
  const objective = cleanObjective(request.objective);
  const settings = normalizeLocalAgentSettings(request.settings);
  if (!settings.enabled || settings.backend === 'disabled') {
    return { ok: false, error: 'The local agent is disabled in Settings.', elapsedMs: Date.now() - startedAt };
  }
  const modelPath = resolveModelPath(settings, request.profile?.preferredModelFileName);
  if (!modelPath) {
    return {
      ok: false,
      error: 'No local GGUF model was found. Place a supported Qwen3 model in the app models folder or Downloads.',
      elapsedMs: Date.now() - startedAt,
    };
  }
  activeInferenceCount += 1;
  try {
    const loaded = await queueInference(async () => {
      const current = await loadRuntime(settings, modelPath);
      const permission = effectiveAgentPermission(settings.permission, request.profile);
      const promptContext = {
        permission,
        profile: request.profile,
        availableOperations: normalizeAvailableOperations(request.availableOperations),
        memories: settings.memoryEnabled ? request.memories : [],
        applicationState: settings.privacyMode ? {} : request.applicationState,
      };
      const approvedOperations = selectLocalAgentApprovedOperations(promptContext);
      const system = buildLocalAgentSystemPrompt(promptContext);
      const prompt = `${system}\n\nUser request:\n${objective}`;
      const response = await promptWithTimeout(current.session, prompt);
      return parseLocalAgentModelPlan(
        response,
        `agent-${startedAt}`,
        objective,
        permission,
        startedAt,
        approvedOperations,
      );
    });
    lastError = '';
    return {
      ok: true,
      summary: loaded.summary,
      task: loaded.task,
      modelFileName: path.basename(modelPath),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'The local model failed.';
    throw error;
  } finally {
    activeInferenceCount = Math.max(0, activeInferenceCount - 1);
    if (activeInferenceCount === 0) scheduleIdleUnload();
  }
}

function runtimeStatus(): LocalAgentRuntimeStatus {
  return {
    loaded: runtime !== null,
    busy: activeInferenceCount > 0 || loadPromise !== null,
    ...(runtime ? {
      modelFileName: path.basename(runtime.modelPath),
      contextSize: runtime.contextSize,
    } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

export function registerLocalAgentIpc(): void {
  ipcMain.handle('localAgent:plan', async (_event, raw: unknown): Promise<LocalAgentPlanResponse> => {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Invalid local agent request.');
      }
      return await plan(raw as LocalAgentPlanRequest);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'The local agent could not create a plan.',
      };
    }
  });
  ipcMain.handle('localAgent:status', (): LocalAgentRuntimeStatus => runtimeStatus());
  ipcMain.handle('localAgent:models', (): LocalAgentModelInfo[] => listAvailableModels());
  // The workspace bridge registers from here, not from `src/main.ts`: this is
  // the production Agent main boundary and main.ts already calls it once at
  // boot, so the store's four channels arrive without touching the shared entry
  // point another track is mid-rewrite on.
  registerAgentWorkspaceIpc();
  registerAgentExecutionIpc();
  // Same reasoning for the operational store (queue, memory, automations).
  registerAgentOperationalIpc();
}

const AGENT_OPERATION_IDS = new Set(AGENT_TOOL_OPERATIONS.map((entry) => entry.id));

function normalizeAvailableOperations(value: unknown): AgentToolOperationId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is AgentToolOperationId => (
    typeof entry === 'string' && AGENT_OPERATION_IDS.has(entry as AgentToolOperationId)
  )))];
}

export function stopLocalAgentRuntime(): void {
  if (idleUnloadTimer) clearTimeout(idleUnloadTimer);
  idleUnloadTimer = null;
  const stale = runtime;
  runtime = null;
  void disposeRuntime(stale);
}
