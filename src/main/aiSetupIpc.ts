/**
 * IPC for Settings > AI: the "Use AI features" switch and one status reply that
 * every AI surface derives its readiness from (`shared/aiSetup.ts`).
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
import { DEFAULT_AI_PROVIDER_ID, type AiProviderId } from '../shared/aiProviders';
import { DEFAULT_LOCAL_MODEL_ASSET_ID } from '../shared/localAgentModels';
import type { AiEngineChoice, AiSetupStatus } from '../shared/aiSetup';
import { readAiProviderSecret } from './credentials/ai';
import { setAiFeaturesReader } from './aiFeatureGate';
import { getAiSetupStore, type AiSetupStore } from './aiSetupStore';
import { listLocalModelFiles, resolveQwenSmallModelPath } from './localModelFiles';

export const AI_SETUP_CHANNELS = {
  status: 'aiSetup:status',
  setEnabled: 'aiSetup:setEnabled',
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

function safeSecretSet(bucket: 'gemini' | 'deepseek'): boolean {
  try {
    return Boolean(readAiProviderSecret(bucket).trim());
  } catch {
    return false;
  }
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
  return {
    enabled: store.read().enabled,
    engine,
    providerId,
    apiKeysSet: { gemini: safeSecretSet('gemini'), deepseek: safeSecretSet('deepseek') },
    localModelInstalled: resolveQwenSmallModelPath() !== null,
    models: listLocalModelFiles().map(({ fileName, sizeBytes, location }) => ({ fileName, sizeBytes, location })),
  };
}

function broadcast(status: AiSetupStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send('aiSetup:changed', status);
  }
}

export function registerAiSetupIpc(resolveStore: () => AiSetupStore = getAiSetupStore): void {
  // Main's own AI entry points consult the same switch the page writes.
  setAiFeaturesReader(() => resolveStore().read().enabled);

  ipcMain.handle('aiSetup:status', () => readAiSetupStatus(resolveStore()));

  ipcMain.handle('aiSetup:setEnabled', async (_event, raw: unknown) => {
    if (typeof raw !== 'boolean') return readAiSetupStatus(resolveStore());
    resolveStore().setEnabled(raw);
    const status = await readAiSetupStatus(resolveStore());
    // Every window, the sender included: its AI buttons appear or vanish with the rest.
    broadcast(status);
    return status;
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
