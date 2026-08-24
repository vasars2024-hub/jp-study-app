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
import {
  memoriesInAgentScope,
  normalizeLocalAgentSettings,
  type LocalAgentSettings,
} from '../shared/localAgentSettings';
import { effectiveAgentPermission } from '../shared/localAgentProfiles';
import { recommendedLocalAgentModels } from '../shared/localAgentModels';
import type {
  LocalAgentPlanRequest,
  LocalAgentPlanResponse,
  LocalAgentModelInfo,
  LocalAgentRuntimeStatus,
} from '../shared/localAgentRuntime';
import { acquireLlamaContext, type LlamaContextLease } from './llamaContextPool';
import { registerAgentExecutionIpc } from './agentExecutionIpc';
import { registerAgentImageStagingIpc } from './agentImageStaging';
import { registerAgentCardBatchStagingIpc } from './agentCardBatchStaging';
import { registerAgentNavigationIpc } from './agentNavigationIpc';
import { registerAgentWorkspaceIpc } from './agentWorkspaceIpc';
import { registerAgentOperationalIpc } from './agentOperationalIpc';
import { getAgentSpendStore } from './agentSpendStore';
import { broadcastAgentSpend, registerAgentSpendIpc } from './agentSpendIpc';
import { setAgentSpendGuard } from './providerRuntime';
import { errorDetail, logDiagnostic } from './errorLog';
export { getAgentWorkspaceStore } from './agentWorkspaceStore';
export { runAgentProviderPrompt } from './agentProviderRouter';

const KNOWN_MODEL_FILENAMES = ['Qwen3-1.7B.gguf', 'Qwen_Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-8B.gguf', 'Qwen3-14B.gguf', 'Qwen3-32B.gguf'];
const PLAN_TIMEOUT_MS = 90_000;
const IDLE_UNLOAD_MS = 5 * 60_000;
/** What a plan is allowed to spend, when the context has room for it. */
const PLAN_MAX_OUTPUT_TOKENS = 1_500;
/**
 * Held back inside the context for what `tokenize()` cannot see — chat-template role markers,
 * BOS/EOS, sampler lookahead. Same value and same reasoning as `translate.ts`.
 */
const CHAT_TEMPLATE_RESERVE_TOKENS = 192;
/** A plan shorter than this is not a plan, so the request is refused rather than truncated. */
const MIN_USABLE_OUTPUT_TOKENS = 256;

interface LoadedAgentRuntime {
  modelPath: string;
  contextSize: number;
  session: LlamaChatSession;
  /**
   * Borrowed from `llamaContextPool.ts` — the weights, because `translate.ts` resolves the same
   * GGUF, and the KV cache, because rebuilding it on every idle unload is the larger half of what
   * a cycle costs. One lease covers both; releasing it lets the pool keep either resident.
   */
  lease: LlamaContextLease;
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
    // RELEASED, not disposed, and that now covers the context too: `translate.ts` may still be
    // holding the same file, and a user coming back inside the grace window should not rebuild a
    // KV cache that is still resident. The pool owns the innermost-first teardown order, and the
    // shared backend outlives all of it by design — `llamaBackend.ts` records the handle counts
    // that ruled out disposing it per cycle.
    await value.lease.release();
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
    const { LlamaChatSession } = await import('node-llama-cpp');
    // Shared with `translate.ts` — one native addon between the two modules, one copy of the
    // weights since both resolve their GGUF from the same roots and usually land on the same file,
    // and a KV cache that survives an idle unload. `llamaContextPool.ts` carries the measurement.
    // A load that dies after the acquire still holds a lease, and nothing downstream would ever
    // see it — the same shape of retention this guard exists to close.
    let lease: LlamaContextLease | null = null;
    try {
      lease = await acquireLlamaContext(modelPath, settings.contextSize);
      const loaded: LoadedAgentRuntime = {
        modelPath,
        contextSize: settings.contextSize,
        session: new LlamaChatSession({ contextSequence: lease.sequence }),
        lease,
      };
      runtime = loaded;
      return loaded;
    } catch (err) {
      try {
        await lease?.release();
      } catch {
        // Best effort, exactly as in disposeRuntime.
      }
      throw err;
    }
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

/**
 * Exact when the weights are loaded — the same tokenizer the generation uses. The character
 * fallback fires only if the native call is unavailable or throws; it over-counts Latin text and
 * sits near the truth on Japanese, which is the safe direction here.
 */
function countPromptTokens(model: LlamaContextLease['model'], prompt: string): number {
  try {
    const tokens = (model as unknown as { tokenize?: (text: string) => unknown }).tokenize?.(prompt);
    if (Array.isArray(tokens)) return tokens.length;
  } catch {
    /* Fall through to the estimate; a tokenizer failure must not fail the plan. */
  }
  return Math.ceil(prompt.length / 1.5);
}

/**
 * `maxTokens` used to be the literal 1,500 and knew nothing about `contextSize`, which the user
 * sets in Settings and which `localAgentSettings.ts:153` bounds at a LOW END of 2,048. A plan
 * prompt is a whole system prompt plus the profile, the permitted operations, the memories in
 * scope, the application state and the objective — thousands of tokens routinely. At 2,048 there
 * was no arrangement in which prompt + 1,500 could fit.
 *
 * node-llama-cpp does not reject that: it CONTEXT SHIFTS, dropping the oldest part of the
 * conversation. `resetSessionHistory` below makes every plan single-turn, so the oldest part is
 * the system prompt and the objective — the agent would plan confidently against text it could no
 * longer see. The failure is now explicit and names the setting that fixes it.
 */
async function promptWithTimeout(current: LoadedAgentRuntime, prompt: string): Promise<string> {
  const promptTokens = countPromptTokens(current.lease.model, prompt);
  const room = current.contextSize - promptTokens - CHAT_TEMPLATE_RESERVE_TOKENS;
  if (room < MIN_USABLE_OUTPUT_TOKENS) {
    throw new Error(
      `This request does not fit the local agent's context: the prompt alone is about ` +
        `${promptTokens} of the ${current.contextSize} tokens available. Raise the context size in ` +
        `Settings, or shorten the request and the context attached to it.`,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLAN_TIMEOUT_MS);
  try {
    return await current.session.prompt(prompt, {
      maxTokens: Math.min(PLAN_MAX_OUTPUT_TOKENS, room),
      signal: controller.signal,
      stopOnAbortSignal: true,
    });
  } finally {
    clearTimeout(timer);
    resetSessionHistory(current.session);
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
        // Applied here, not at the producers: this handler is the choke point
        // the central Agent's planner and Blanc's separate shell both reach.
        memories: memoriesInAgentScope(settings, request.memories),
        applicationState: settings.privacyMode ? {} : request.applicationState,
      };
      const approvedOperations = selectLocalAgentApprovedOperations(promptContext);
      const system = buildLocalAgentSystemPrompt(promptContext);
      const prompt = `${system}\n\nUser request:\n${objective}`;
      const response = await promptWithTimeout(current, prompt);
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
  // The monthly spending ceiling is handed to the provider runtime rather than
  // registered as a channel: it is consulted on the preflight of every cloud
  // request main makes, including the ones no renderer asked for. Registering
  // it here means it is in force from the same boot that brings the Agent up,
  // instead of from whenever a window first happens to read it.
  const spendStore = getAgentSpendStore();
  setAgentSpendGuard({
    verdict: (estimatedCostUsd) => spendStore.verdict(estimatedCostUsd),
    record: (providerId, costUsd) => {
      // The response has already arrived and the user has already been charged
      // by the provider. An unwritable ledger is a bookkeeping loss, and
      // throwing here would turn it into a failed request — discarding an
      // answer that was paid for, to protect a number. Logged, not silent: the
      // total will under-report until the write succeeds, and that is exactly
      // the kind of thing this ledger must not hide.
      try {
        broadcastAgentSpend(spendStore.record(providerId, costUsd));
      } catch (error) {
        logDiagnostic('error', 'agent-spend', 'record', errorDetail(error));
      }
    },
  });
  registerAgentSpendIpc(() => spendStore);
  // Permission-gated navigation reads the same store the two above own, so it
  // registers beside them rather than from `src/main.ts`. Its window opener is
  // handed over separately, from the pop-out wiring that owns those windows.
  registerAgentNavigationIpc();
  // Same reasoning for the operational store (queue, memory, automations).
  registerAgentOperationalIpc();
  // And for the capture staging area, which is how a screenshot taken in one
  // window reaches the Agent composer in another without entering the persisted
  // workspace the other three stores write to.
  registerAgentImageStagingIpc();
  // And for the card-batch staging slot, the same shape one level up: a batch
  // `flashcard.generate-cards` produced in the Agent window reaches AI Card
  // Studio's own preview editor in the Flashcards window, so the user corrects
  // it before anything is written.
  registerAgentCardBatchStagingIpc();
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
