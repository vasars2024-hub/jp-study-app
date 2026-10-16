/**
 * "Read text with AI" — main's half of its settings: the mode, the provider
 * entry that reads, and whether the local server's model reads pictures
 * (`shared/aiOcrVision.ts` has the rules). Kept beside Settings > AI's own file
 * (`userData/ai/`), written only here, atomically.
 *
 * Also the one answer to "may a picture go to a model now": `resolveAiOcrVisionPlan`
 * is what `ocrAiVisionProvider.ts` asks before every read, and the status the
 * settings and Snips surfaces show is built from the same facts, so a button is
 * never offered for a read main would refuse.
 *
 * IPC (`aiOcrVision:*`) is registered from `registerAiSetupIpc`, main's AI
 * settings boundary, so it needs no line of its own in `main.ts`.
 */
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import {
  AI_PROVIDER_BASE_URLS,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_ID,
  isLoopbackUrl,
  requireAiProvider,
  type AiProviderId,
} from '../shared/aiProviders';
import {
  aiOcrProviderReadsImages,
  applyAiOcrVisionPatch,
  normalizeAiOcrVisionSettings,
  type AiOcrVisionBlock,
  type AiOcrVisionMode,
  type AiOcrVisionSettings,
  type AiOcrVisionStatus,
} from '../shared/aiOcrVision';
import { aiCloudAllowedFor, aiFeaturesEnabled, configuredAiProviderId } from './aiFeatureGate';
import { getAiSetupStore } from './aiSetupStore';
import { getAiProviderHealth, setCompatibleVisionReader } from './providerRuntime';

const SETTINGS_FILE = 'ocr-vision-v1.json';

export interface AiOcrVisionStore {
  readonly filePath: string;
  read(): AiOcrVisionSettings;
  update(patch: unknown): AiOcrVisionSettings;
}

export function createAiOcrVisionStore(rootDirectory: string): AiOcrVisionStore {
  const filePath = path.join(rootDirectory, 'ai', SETTINGS_FILE);
  let cached: AiOcrVisionSettings | null = null;
  const read = (): AiOcrVisionSettings => {
    if (cached) return cached;
    try {
      cached = normalizeAiOcrVisionSettings(readJsonSync<unknown>(filePath, null));
    } catch {
      cached = normalizeAiOcrVisionSettings(null);
    }
    return cached;
  };
  return {
    filePath,
    read,
    update(patch) {
      const next = applyAiOcrVisionPatch(read(), patch);
      writeJsonAtomicSync(filePath, next, { mode: 0o600 });
      cached = next;
      return next;
    },
  };
}

let defaultStore: AiOcrVisionStore | null = null;

export function getAiOcrVisionStore(): AiOcrVisionStore {
  if (!defaultStore) defaultStore = createAiOcrVisionStore(app.getPath('userData'));
  return defaultStore;
}

/** What the status is built from; injectable so the rules are testable without a vault. */
export interface AiOcrVisionFacts {
  settings(): AiOcrVisionSettings;
  aiEnabled(): boolean;
  consent(): boolean;
  /** The provider chosen in Settings > AI. */
  configuredProvider(): AiProviderId | null;
  /** A key is saved (the local server: its URL and model are set). */
  configured(providerId: AiProviderId): boolean;
  /** The local server's base URL (Settings > AI). */
  compatBaseUrl(): string;
}

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export function defaultAiOcrVisionFacts(store: AiOcrVisionStore = getAiOcrVisionStore()): AiOcrVisionFacts {
  return {
    settings: () => store.read(),
    aiEnabled: aiFeaturesEnabled,
    consent: () => aiCloudAllowedFor('ocrVision'),
    configuredProvider: configuredAiProviderId,
    configured: (providerId) => safe(() => getAiProviderHealth(providerId).configured, false),
    compatBaseUrl: () => safe(() => getAiSetupStore().read().compatBaseUrl, ''),
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Everything the "Read text with AI" section and "Check with AI" need to know. */
export function readAiOcrVisionStatus(facts: AiOcrVisionFacts = defaultAiOcrVisionFacts()): AiOcrVisionStatus {
  const settings = facts.settings();
  const effectiveProviderId = settings.providerId || facts.configuredProvider() || DEFAULT_AI_PROVIDER_ID;
  const def = requireAiProvider(effectiveProviderId);
  const compatUrl = def.keyBucket === 'openai-compatible' ? facts.compatBaseUrl() : '';
  const host = def.keyBucket === 'openai-compatible' ? hostOf(compatUrl) : hostOf(AI_PROVIDER_BASE_URLS[def.keyBucket]);
  const consent = facts.consent();
  const vision = aiOcrProviderReadsImages(effectiveProviderId, settings.compatVision);
  const configured = facts.configured(effectiveProviderId);
  const aiEnabled = facts.aiEnabled();
  let blocked: AiOcrVisionBlock | undefined;
  if (!aiEnabled) blocked = 'ai-off';
  else if (!vision) blocked = 'no-vision';
  else if (!configured) blocked = 'not-configured';
  else if (!consent) blocked = 'no-consent';
  const available = aiEnabled && vision && configured;
  return {
    mode: settings.mode,
    providerId: settings.providerId,
    compatVision: settings.compatVision,
    effectiveProviderId,
    host,
    local: Boolean(compatUrl) && isLoopbackUrl(compatUrl),
    providers: AI_PROVIDERS.map((provider) => ({
      id: provider.id,
      vision: aiOcrProviderReadsImages(provider.id, settings.compatVision),
      configured: provider.id === effectiveProviderId ? configured : facts.configured(provider.id),
    })),
    consent,
    available,
    ready: available && consent,
    ...(blocked ? { blocked } : {}),
  };
}

/** One read's go-ahead: which entry reads, and why it was asked. */
export interface AiOcrVisionPlan {
  /** `check`: the learner pressed "Check with AI" (any mode, the opt-in still applies). */
  mode: Exclude<AiOcrVisionMode, 'off'> | 'check';
  providerId: AiProviderId;
}

/**
 * Whether a picture may go to a model now, and to which. `null` while the mode
 * is Off (unless the learner asked for this one picture), AI is off, the
 * provider does not read pictures or is not set up, or pictures may not be sent.
 */
export function resolveAiOcrVisionPlan(
  opts: { check?: boolean } = {},
  facts: AiOcrVisionFacts = defaultAiOcrVisionFacts(),
): AiOcrVisionPlan | null {
  const mode = facts.settings().mode;
  if (mode === 'off' && !opts.check) return null;
  const status = readAiOcrVisionStatus(facts);
  if (!status.ready) return null;
  return { mode: opts.check ? 'check' : (mode as Exclude<AiOcrVisionMode, 'off'>), providerId: status.effectiveProviderId };
}

function broadcast(status: AiOcrVisionStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send('aiOcrVision:changed', status);
  }
}

let registered = false;

export function registerAiOcrVisionIpc(resolveStore: () => AiOcrVisionStore = getAiOcrVisionStore): void {
  // The runtime sends a picture to the local server only when its model reads them.
  setCompatibleVisionReader(() => resolveStore().read().compatVision);
  if (registered) return;
  registered = true;
  ipcMain.handle('aiOcrVision:status', () => readAiOcrVisionStatus(defaultAiOcrVisionFacts(resolveStore())));
  ipcMain.handle('aiOcrVision:update', (_event, patch: unknown) => {
    resolveStore().update(patch);
    const status = readAiOcrVisionStatus(defaultAiOcrVisionFacts(resolveStore()));
    broadcast(status);
    return status;
  });
}
