/**
 * IPC for Settings > AI: the "Use AI features" switch, the per-feature cloud
 * opt-ins and provider options, a "Test connection" probe, and one status reply
 * that every AI surface derives its readiness from (`shared/aiSetup.ts`).
 *
 * The engine, the provider and the keys keep their existing owners — the AI
 * config in `mining.ts` and the encrypted vault in `credentials/ai.ts` — and are
 * only READ here, so there is still one place each of them is written.
 *
 * Registered from `registerLocalAgentIpc()` for the reason the spend channels
 * are: that function is the production Agent boundary and main already calls it
 * once at boot.
 */
import { BrowserWindow, ipcMain } from 'electron';
import { DEFAULT_AI_PROVIDER_ID, parseAiProviderId, type AiProviderId } from '../shared/aiProviders';
import { DEFAULT_LOCAL_MODEL_ASSET_ID } from '../shared/localAgentModels';
import type { AiEngineChoice, AiSetupStatus } from '../shared/aiSetup';
import type { AiConnectionTestResult } from '../shared/aiConnectionTest';
import { aiCredentialsUsable } from './credentials/ai';
import { setAiCloudFeatureReader, setAiFeaturesReader, setConfiguredAiProviderReader } from './aiFeatureGate';
import { getAiSetupStore, type AiSetupStore } from './aiSetupStore';
import { registerAiOcrVisionIpc } from './aiOcrVisionStore';
import { listLocalModelFiles, resolveQwenSmallModelPath } from './localModelFiles';
import { AiProviderRuntimeError, runCloudAiRequest, setAiProviderOptionsReader } from './providerRuntime';

export const AI_SETUP_CHANNELS = {
  status: 'aiSetup:status',
  setEnabled: 'aiSetup:setEnabled',
  update: 'aiSetup:update',
  testConnection: 'aiSetup:testConnection',
  changed: 'aiSetup:changed',
} as const;

interface EngineSource {
  engine(): AiEngineChoice;
  providerId(): AiProviderId;
}

/**
 * The engine and provider live in the mining config file. Imported lazily: the
 * mining module is large, and this status is asked for from windows that never
 * mine anything.
 */
async function miningEngineSource(): Promise<EngineSource> {
  const mining = await import('./mining');
  return {
    engine: () => mining.getConfiguredAiEngine(),
    providerId: () => mining.getConfiguredAiProvider().providerId,
  };
}

export async function readAiSetupStatus(
  store: AiSetupStore = getAiSetupStore(),
  engines: () => Promise<EngineSource> = miningEngineSource,
): Promise<AiSetupStatus> {
  let engine: AiEngineChoice = 'cloud';
  let providerId: AiProviderId = DEFAULT_AI_PROVIDER_ID;
  try {
    const source = await engines();
    engine = source.engine() === 'local-qwen' ? 'local-qwen' : 'cloud';
    providerId = source.providerId();
  } catch {
    // An unreadable config is the documented default, not a failed status.
  }
  const settings = store.read();
  return {
    enabled: settings.enabled,
    engine,
    providerId,
    apiKeysSet: aiCredentialsUsable(settings),
    localModelInstalled: resolveQwenSmallModelPath() !== null,
    models: listLocalModelFiles().map(({ fileName, sizeBytes, location }) => ({ fileName, sizeBytes, location })),
    cloudFeatures: { ...settings.cloudFeatures },
    openaiModel: settings.openaiModel,
    compatBaseUrl: settings.compatBaseUrl,
    compatModel: settings.compatModel,
  };
}

function broadcast(status: AiSetupStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send('aiSetup:changed', status);
  }
}

/**
 * One cheap request to the chosen provider: does the key work, is the server
 * up, does the model exist. The prompt is a fixed word — no user data is sent —
 * and the answer is capped at a few tokens. A reply cut at that cap still proves
 * the connection, so `output-truncated` counts as success.
 */
export async function testAiConnection(
  raw: unknown,
  run: typeof runCloudAiRequest = runCloudAiRequest,
): Promise<AiConnectionTestResult> {
  const providerId = parseAiProviderId(raw);
  if (!providerId) return { ok: false, code: 'unknown-provider' };
  const startedAt = Date.now();
  try {
    const result = await run({
      providerId,
      prompt: 'Reply with the single word: OK',
      maxOutputTokens: 24,
      temperature: 0,
      timeoutMs: 20_000,
      retryAttempts: 0,
    });
    return { ok: true, model: result.model, latencyMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof AiProviderRuntimeError) {
      if (error.code === 'output-truncated') return { ok: true, latencyMs: Date.now() - startedAt };
      return { ok: false, code: error.code, ...(error.status !== undefined ? { status: error.status } : {}) };
    }
    return { ok: false, code: 'network' };
  }
}

export function registerAiSetupIpc(resolveStore: () => AiSetupStore = getAiSetupStore): void {
  // Main's own AI entry points consult the same switch and opt-ins the page writes.
  setAiFeaturesReader(() => resolveStore().read().enabled);
  setAiCloudFeatureReader((feature) => resolveStore().read().cloudFeatures[feature] === true);
  setAiProviderOptionsReader(() => {
    const settings = resolveStore().read();
    return {
      openaiModel: settings.openaiModel,
      compatBaseUrl: settings.compatBaseUrl,
      compatModel: settings.compatModel,
    };
  });

  void import('./mining')
    .then((mining) => setConfiguredAiProviderReader(() => mining.getConfiguredAiProvider().providerId))
    .catch(() => undefined);
  // "Read text with AI" (Settings > AI and the Snips settings): its mode, provider and
  // whether the local server's model reads pictures, beside the switch and opt-ins above.
  registerAiOcrVisionIpc();

  ipcMain.handle('aiSetup:status', () => readAiSetupStatus(resolveStore()));

  ipcMain.handle('aiSetup:setEnabled', async (_event, raw: unknown) => {
    if (typeof raw !== 'boolean') return readAiSetupStatus(resolveStore());
    resolveStore().setEnabled(raw);
    const status = await readAiSetupStatus(resolveStore());
    // Every window, the sender included: its AI buttons appear or vanish with the rest.
    broadcast(status);
    return status;
  });

  ipcMain.handle('aiSetup:update', async (_event, patch: unknown) => {
    resolveStore().update(patch);
    const status = await readAiSetupStatus(resolveStore());
    broadcast(status);
    return status;
  });

  ipcMain.handle('aiSetup:testConnection', async (_event, providerId: unknown): Promise<AiConnectionTestResult> => {
    if (!resolveStore().read().enabled) return { ok: false, code: 'ai-off' };
    return testAiConnection(providerId);
  });

  // Deleting the model from Settings > AI or Storage has to let go of it first: Windows refuses to
  // unlink a mapped file. Lazy so this registration does not pull the download manager into every
  // test that boots the Agent.
  void Promise.all([import('./downloads'), import('./translate'), import('./localAgent')])
    .then(([downloads, translate, localAgent]) => {
      downloads.registerAssetUnloadHandler(DEFAULT_LOCAL_MODEL_ASSET_ID, async () => {
        localAgent.stopLocalAgentRuntime();
        await translate.unloadTranslationModel();
      });
    })
    .catch(() => undefined);
}
