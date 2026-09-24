import { ipcMain } from 'electron';
import path from 'node:path';
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
import { AI_PROVIDERS, type AiProviderId } from '../shared/aiProviders';
import type {
  LocalAgentPlanFailureCode,
  LocalAgentPlanRequest,
  LocalAgentPlanResponse,
  LocalAgentModelInfo,
  LocalAgentRuntimeStatus,
} from '../shared/localAgentRuntime';
import { acquireLlamaSession, type LlamaSessionHandle } from './llamaHost';
import { registerAgentExecutionIpc } from './agentExecutionIpc';
import { registerAgentImageStagingIpc } from './agentImageStaging';
import { registerAgentCardBatchStagingIpc } from './agentCardBatchStaging';
import { registerAgentNavigationIpc } from './agentNavigationIpc';
import { registerAgentWorkspaceIpc } from './agentWorkspaceIpc';
import { registerAgentOperationalIpc } from './agentOperationalIpc';
import { getAgentSpendStore } from './agentSpendStore';
import { broadcastAgentSpend, registerAgentSpendIpc } from './agentSpendIpc';
import {
  AiProviderRuntimeError,
  getAiProviderHealth,
  runCloudAiRequest,
  setAgentPricingResolver,
  setAgentSpendGuard,
} from './providerRuntime';
import { getAgentPricingStore } from './agentPricingStore';
import { listLocalModelFiles, resolveLocalModelForRole } from './localModelFiles';
import { AI_FEATURES_OFF_MESSAGE, aiFeaturesEnabled } from './aiFeatureGate';
import { registerAiSetupIpc } from './aiSetupIpc';
import { errorDetail, logDiagnostic } from './errorLog';
export { getAgentWorkspaceStore } from './agentWorkspaceStore';
export { runAgentProviderPrompt } from './agentProviderRouter';

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
  /**
   * Borrowed from the local-model host — the weights, because `translate.ts` resolves the same
   * GGUF, and the KV cache, because rebuilding it on every idle unload is the larger half of what
   * a cycle costs. One handle covers both; releasing it lets the host keep either resident, and
   * nothing native is reachable from this process. See `llamaHost.ts`.
   */
  session: LlamaSessionHandle;
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

/**
 * The planner's model: the user's pick, or the per-role choice from what is installed. Shared with
 * `translate.ts` through `localModelFiles.ts`, so both agree on what "installed" means.
 */
function resolveModelPath(settings: LocalAgentSettings, preferredModelFileName?: string): string | null {
  return resolveLocalModelForRole('agent', settings.modelMode, preferredModelFileName || settings.modelFileName);
}

/**
 * Clears the chat history without waiting for the host to confirm it. Same reasoning as
 * `translate.ts`'s: the request is posted synchronously, the channel is FIFO and the host applies a
 * reset without yielding, so the next prompt is still handled after it.
 */
function resetSessionHistory(session: LlamaSessionHandle): void {
  void session.resetHistory().catch(() => undefined);
}

async function disposeRuntime(value: LoadedAgentRuntime | null): Promise<void> {
  if (!value) return;
  try {
    // RELEASED, not disposed, and that covers the context too: `translate.ts` may still be holding
    // the same file, and a user coming back inside the grace window should not rebuild a KV cache
    // that is still resident. The host owns the innermost-first teardown order, and it ends its own
    // process once both pools go empty — which is what finally reclaims the native addon.
    await value.session.release();
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
  // The path stays in main: the picker needs names, and a path would put the user's profile
  // directory in the renderer for nothing.
  return listLocalModelFiles().map(({ fileName, sizeBytes, location }) => ({ fileName, sizeBytes, location }));
}

async function loadRuntime(settings: LocalAgentSettings, modelPath: string): Promise<LoadedAgentRuntime> {
  const keyMatches = runtime?.modelPath === modelPath && runtime.contextSize === settings.contextSize;
  if (keyMatches && runtime) return runtime;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await disposeRuntime(runtime);
    runtime = null;
    // Shared with `translate.ts` — one native addon between the two modules, one copy of the
    // weights since both resolve their GGUF from the same roots and usually land on the same file,
    // and a KV cache that survives an idle unload, all of it in the model host.
    // A load that dies after the acquire still holds a session, and nothing downstream would ever
    // see it — the same shape of retention this guard exists to close.
    let session: LlamaSessionHandle | null = null;
    try {
      session = await acquireLlamaSession(modelPath, settings.contextSize);
      const loaded: LoadedAgentRuntime = {
        modelPath,
        contextSize: settings.contextSize,
        session,
      };
      runtime = loaded;
      return loaded;
    } catch (err) {
      try {
        await session?.release();
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
async function countPromptTokens(session: LlamaSessionHandle, prompt: string): Promise<number> {
  try {
    // Asynchronous only because the tokenizer answers from the model host; it is still the exact
    // tokenizer the generation will use.
    return await session.countTokens(prompt);
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
  const promptTokens = await countPromptTokens(current.session, prompt);
  const room = current.contextSize - promptTokens - CHAT_TEMPLATE_RESERVE_TOKENS;
  if (room < MIN_USABLE_OUTPUT_TOKENS) {
    throw new Error(
      `This request does not fit the local agent's context: the prompt alone is about ` +
        `${promptTokens} of the ${current.contextSize} tokens available. Raise the context size in ` +
        `Settings, or shorten the request and the context attached to it.`,
    );
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PLAN_TIMEOUT_MS);
  try {
    return await current.session.prompt(prompt, {
      maxTokens: Math.min(PLAN_MAX_OUTPUT_TOKENS, room),
      signal: controller.signal,
    });
  } catch (err) {
    // Reachable only since the handle stopped resolving aborted generations with their partial
    // text: this function is named after a deadline that, until then, could not produce a message
    // saying so — the truncated plan went to `parseLocalAgentModelPlan` and failed there instead.
    // `lastError` is surfaced verbatim to the user, so it names the deadline rather than the abort.
    if (timedOut && err instanceof Error && err.name === 'AbortError') {
      throw new Error(`The local agent timed out after ${Math.round(PLAN_TIMEOUT_MS / 1000)}s.`);
    }
    throw err;
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

const CLOUD_PROVIDER_IDS: ReadonlySet<string> = new Set(AI_PROVIDERS.map((provider) => provider.id));

function cloudProvider(value: unknown): AiProviderId | null {
  return typeof value === 'string' && CLOUD_PROVIDER_IDS.has(value) ? value as AiProviderId : null;
}

function refusal(
  code: LocalAgentPlanFailureCode,
  error: string,
  startedAt: number,
): LocalAgentPlanResponse {
  return { ok: false, code, error, elapsedMs: Date.now() - startedAt };
}

/**
 * The cloud planner: the same system prompt, the same JSON plan schema and the same validation as the
 * local one, sent through `runCloudAiRequest` so the monthly spending limit and the rates apply.
 *
 * Nothing about governance is relaxed on this path. The approved-operation set, the permission
 * ceiling and the profile allow-list go into the prompt exactly as they do locally, and
 * `parseLocalAgentModelPlan` refuses any step outside them; every step still waits in the queue for
 * the user's approval. What changes is what leaves the machine: while "keep sensitive context out of
 * cloud requests" is on (the default), memories and the attached application state stay home.
 */
async function planWithCloud(
  providerId: AiProviderId,
  objective: string,
  settings: LocalAgentSettings,
  request: LocalAgentPlanRequest,
  startedAt: number,
): Promise<LocalAgentPlanResponse> {
  if (!getAiProviderHealth(providerId).configured) {
    return refusal('cloud-key-missing', 'No API key is saved for the cloud planner.', startedAt);
  }
  const permission = effectiveAgentPermission(settings.permission, request.profile);
  const sendPrivate = !settings.excludeSensitiveContext;
  const promptContext = {
    permission,
    profile: request.profile,
    availableOperations: normalizeAvailableOperations(request.availableOperations),
    memories: sendPrivate ? memoriesInAgentScope(settings, request.memories) : [],
    applicationState: settings.privacyMode || !sendPrivate ? {} : request.applicationState,
  };
  const approvedOperations = selectLocalAgentApprovedOperations(promptContext);
  const system = buildLocalAgentSystemPrompt(promptContext);
  activeInferenceCount += 1;
  try {
    const result = await runCloudAiRequest({
      providerId,
      systemPrompt: system,
      prompt: `User request:\n${objective}`,
      responseMimeType: 'application/json',
      // Room for a thinking model's thoughts on top of the plan itself.
      maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS * 3,
      timeoutMs: PLAN_TIMEOUT_MS,
      retryAttempts: 1,
    });
    const parsed = parseLocalAgentModelPlan(
      result.text,
      `agent-${startedAt}`,
      objective,
      permission,
      startedAt,
      approvedOperations,
    );
    lastError = '';
    return {
      ok: true,
      summary: parsed.summary,
      task: parsed.task,
      planner: 'cloud',
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'The cloud planner failed.';
    if (error instanceof AiProviderRuntimeError) {
      if (error.code === 'missing-credential') return refusal('cloud-key-missing', lastError, startedAt);
      if (error.code === 'spend-budget') return refusal('spend-budget', lastError, startedAt);
    }
    return refusal('planner-failed', lastError, startedAt);
  } finally {
    activeInferenceCount = Math.max(0, activeInferenceCount - 1);
  }
}

async function plan(request: LocalAgentPlanRequest): Promise<LocalAgentPlanResponse> {
  const startedAt = Date.now();
  const objective = cleanObjective(request.objective);
  const settings = normalizeLocalAgentSettings(request.settings);
  // Before anything else: the switch covers scheduled automations, which plan with no window open.
  if (!aiFeaturesEnabled()) return refusal('ai-off', AI_FEATURES_OFF_MESSAGE, startedAt);
  if (!settings.enabled || settings.backend === 'disabled') {
    return refusal('agent-disabled', 'The Agent is turned off in Settings > AI.', startedAt);
  }
  const target = request.target === undefined || request.target === 'local'
    ? 'local'
    : cloudProvider(request.target);
  if (target === null) return refusal('invalid-request', 'Unknown planner target.', startedAt);
  if (target !== 'local') return planWithCloud(target, objective, settings, request, startedAt);
  const modelPath = resolveModelPath(settings, request.profile?.preferredModelFileName);
  if (!modelPath) {
    // A cloud-only user used to get chat and none of the tools. With a key for the configured
    // provider, the plan is made there instead — still governed, still approved step by step.
    const fallback = cloudProvider(request.cloudProviderId);
    if (fallback && getAiProviderHealth(fallback).configured) {
      return planWithCloud(fallback, objective, settings, request, startedAt);
    }
    return refusal(
      'model-missing',
      'No offline AI model is installed. Install one in Settings > AI, or add a cloud API key there.',
      startedAt,
    );
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
      planner: 'local',
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
        code: 'planner-failed',
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
  // Rates live beside the ledger and are consulted by the same runtime: a request
  // whose caller supplied no pricing is priced from here (the user's figure, or
  // the built-in estimate), so every cloud caller in the app counts against the
  // limit — not only the Agent composer, which was the one caller that priced.
  const pricingStore = getAgentPricingStore();
  setAgentPricingResolver((providerId) => pricingStore.priceFor(providerId));
  registerAgentSpendIpc(() => spendStore, () => pricingStore);
  // The "Use AI features" switch and the one-reply setup status every AI
  // surface reads.
  registerAiSetupIpc();
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
