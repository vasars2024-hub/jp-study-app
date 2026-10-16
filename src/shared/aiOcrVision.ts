/**
 * "Read text with AI": a vision model, on the learner's own key, as an OCR
 * engine for Snip to cards, the manga reader, the Reading Lens, VN capture and
 * book OCR. Shared by main (`main/ocrAiVisionProvider.ts` reads,
 * `main/aiOcrVisionStore.ts` keeps the settings) and the surfaces that set it
 * up or offer "Check with AI".
 *
 * Off by default, and two separate yeses before a picture leaves the PC: a mode
 * other than Off here, and the `ocrVision` cloud opt-in (Settings > AI > "What
 * may use the cloud"), which `callAiProvider` enforces in main. The modes:
 *
 * - **Off**: the local engines only. "Check with AI" on a snip is still offered
 *   once a provider that reads pictures is set up, and asks for the opt-in.
 * - **Only when unsure**: the local engines read first; when the router still
 *   reports unsure characters, a low confidence or nothing at all, the same
 *   picture goes to the model once and its read wins where they disagree.
 * - **Always**: the model reads every picture (the local engines read only when
 *   it fails).
 *
 * Pure: no Electron, no DOM.
 */
import {
  AI_PROVIDERS,
  parseAiProviderId,
  providerAcceptsImageInput,
  providerById,
  type AiProviderId,
} from './aiProviders';

export type AiOcrVisionMode = 'off' | 'unsure' | 'always';
export const AI_OCR_VISION_MODES: readonly AiOcrVisionMode[] = ['off', 'unsure', 'always'];

/** Main-owned (`userData/ai/ocr-vision-v1.json`). No key is ever here. */
export interface AiOcrVisionSettings {
  version: 1;
  mode: AiOcrVisionMode;
  /** The provider entry (one model) that reads; `''` follows the provider chosen in Settings > AI. */
  providerId: AiProviderId | '';
  /**
   * The model behind the OpenAI-compatible server reads pictures (llava,
   * qwen2.5-vl, gemma3, …). Only the user knows, so the user says so.
   */
  compatVision: boolean;
}

export const DEFAULT_AI_OCR_VISION_SETTINGS: AiOcrVisionSettings = {
  version: 1,
  mode: 'off',
  providerId: '',
  compatVision: false,
};

function normalizeMode(value: unknown): AiOcrVisionMode {
  return AI_OCR_VISION_MODES.includes(value as AiOcrVisionMode) ? (value as AiOcrVisionMode) : 'off';
}

/** Settings from disk or IPC, repaired: anything unknown is the default (Off). */
export function normalizeAiOcrVisionSettings(value: unknown): AiOcrVisionSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<string, unknown>>;
  return {
    version: 1,
    mode: normalizeMode(raw.mode),
    providerId: parseAiProviderId(raw.providerId) ?? '',
    compatVision: raw.compatVision === true,
  };
}

export type AiOcrVisionPatch = Partial<Omit<AiOcrVisionSettings, 'version'>>;

/** A patch that crossed the bridge, applied field by field; a malformed field is dropped. */
export function applyAiOcrVisionPatch(current: AiOcrVisionSettings, patch: unknown): AiOcrVisionSettings {
  if (!patch || typeof patch !== 'object') return current;
  const raw = patch as Partial<Record<string, unknown>>;
  const next = { ...current };
  if (AI_OCR_VISION_MODES.includes(raw.mode as AiOcrVisionMode)) next.mode = raw.mode as AiOcrVisionMode;
  if (raw.providerId === '') next.providerId = '';
  else if (parseAiProviderId(raw.providerId)) next.providerId = raw.providerId as AiProviderId;
  if (typeof raw.compatVision === 'boolean') next.compatVision = raw.compatVision;
  return next;
}

/** Whether an entry can be sent a picture, given what the user said about their local server. */
export function aiOcrProviderReadsImages(providerId: AiProviderId, compatVision: boolean): boolean {
  return providerAcceptsImageInput(providerId) || (providerId === 'openai-compatible' && compatVision);
}

// ---------------------------------------------------------------------------
// Status (main → the settings and Snips surfaces)

/** Why AI cannot read now, the first reason that applies (what the learner fixes first). */
export type AiOcrVisionBlock = 'ai-off' | 'no-vision' | 'not-configured' | 'no-consent';

export interface AiOcrVisionProviderOption {
  id: AiProviderId;
  /** Reads pictures (for the local server: the user said its model does). */
  vision: boolean;
  /** Its key is saved (the local server: its URL and model are set). */
  configured: boolean;
}

export interface AiOcrVisionStatus extends Omit<AiOcrVisionSettings, 'version'> {
  /** The entry that reads: the one chosen here, else the provider chosen in Settings > AI. */
  effectiveProviderId: AiProviderId;
  /** Where the pictures go: the vendor's API host, or the local server's host:port. */
  host: string;
  /** The local server is on this computer (nothing leaves it). */
  local: boolean;
  providers: AiOcrVisionProviderOption[];
  /** The `ocrVision` cloud opt-in. */
  consent: boolean;
  /** "Use AI features" is on and the provider reads pictures and is set up: "Check with AI" can be offered. */
  available: boolean;
  /** …and pictures may be sent (the opt-in): it can run. */
  ready: boolean;
  blocked?: AiOcrVisionBlock;
}

const BLOCKS: readonly AiOcrVisionBlock[] = ['ai-off', 'no-vision', 'not-configured', 'no-consent'];

/** A status that crossed the bridge; `null` when it is not one (no answer yet). */
export function normalizeAiOcrVisionStatus(value: unknown): AiOcrVisionStatus | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<string, unknown>>;
  const effective = parseAiProviderId(raw.effectiveProviderId);
  if (!effective) return null;
  const settings = normalizeAiOcrVisionSettings(raw);
  const providers = Array.isArray(raw.providers)
    ? raw.providers.flatMap((entry): AiOcrVisionProviderOption[] => {
      const e = (entry && typeof entry === 'object' ? entry : {}) as Partial<Record<string, unknown>>;
      const id = parseAiProviderId(e.id);
      return id ? [{ id, vision: e.vision === true, configured: e.configured === true }] : [];
    })
    : [];
  return {
    mode: settings.mode,
    providerId: settings.providerId,
    compatVision: settings.compatVision,
    effectiveProviderId: effective,
    host: typeof raw.host === 'string' ? raw.host.slice(0, 200) : '',
    local: raw.local === true,
    providers,
    consent: raw.consent === true,
    available: raw.available === true,
    ready: raw.ready === true && raw.available === true,
    ...(BLOCKS.includes(raw.blocked as AiOcrVisionBlock) ? { blocked: raw.blocked as AiOcrVisionBlock } : {}),
  };
}

/** Every entry, in Settings > AI's order, for the provider picker (vision first is the UI's job). */
export function aiOcrProviderIds(): AiProviderId[] {
  return AI_PROVIDERS.map((provider) => provider.id);
}

// ---------------------------------------------------------------------------
// Engine ids: `ai:<provider entry>` on a read, its lines and a snip

export const AI_OCR_ENGINE_PREFIX = 'ai:';

export function aiOcrEngineId(providerId: AiProviderId): string {
  return `${AI_OCR_ENGINE_PREFIX}${providerId}`;
}

/** The provider entry an engine id names, or `null` for a local engine. */
export function aiOcrProviderOfEngine(engine: string | undefined | null): AiProviderId | null {
  if (!engine || !engine.startsWith(AI_OCR_ENGINE_PREFIX)) return null;
  return parseAiProviderId(engine.slice(AI_OCR_ENGINE_PREFIX.length));
}

/**
 * How an AI engine is named to the learner ("Read by Claude Sonnet 5.5"): the
 * vendor's product name as-is, or the catalog key of the local server's name.
 */
export function aiOcrEngineLabel(engine: string | undefined | null): { name?: string; key?: string } | null {
  const id = aiOcrProviderOfEngine(engine);
  if (!id) return null;
  return id === 'openai-compatible' ? { key: 'aiProv.vendor.local' } : { name: providerById(id).label };
}

// ---------------------------------------------------------------------------
// "Only when unsure"

/** A local read below this mean confidence is checked by AI (the router's own line fallback bar). */
export const AI_OCR_UNSURE_CONFIDENCE = 0.8;

/** Whether a local read earns AI's look: nothing read, unsure characters, or a low confidence. */
export function aiOcrCheckWanted(read: {
  ok: boolean;
  text: string;
  confidence?: number;
  unsure?: readonly unknown[];
}): boolean {
  if (!read.ok || !read.text.trim()) return true;
  if ((read.unsure?.length ?? 0) > 0) return true;
  return typeof read.confidence === 'number' && read.confidence < AI_OCR_UNSURE_CONFIDENCE;
}

/**
 * Whether a stored snip is one to offer "Check with AI" on: read by a local
 * engine (or not read at all) and unsure — characters in doubt, a low
 * confidence, words held for review because of it, or the bundled recognizer.
 */
export function snipAiCheckWanted(entry: {
  status: string;
  engine?: string;
  text: string;
  confidence?: number;
  unsure?: readonly unknown[];
  review?: string;
  error?: string;
}): boolean {
  if (entry.status === 'processing' || aiOcrProviderOfEngine(entry.engine)) return false;
  if (entry.error === 'models-missing' && entry.text) return true;
  // A picture the local engines could not make sense of; not one that was cancelled.
  if (entry.status === 'error') return ['ocr-failed', 'no-text', 'garbage', 'low-confidence'].includes(entry.error ?? '');
  if (entry.engine === 'basic' || entry.review === 'uncertain') return true;
  return aiOcrCheckWanted({ ok: Boolean(entry.text.trim()), text: entry.text, confidence: entry.confidence, unsure: entry.unsure });
}
