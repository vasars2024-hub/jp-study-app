/**
 * The cloud (and OpenAI-compatible) language-model providers the app can call.
 *
 * One entry is one selectable model on one vendor's wire format. Vendors whose
 * model list moves too fast to ship as fixed rows (OpenAI, a local OpenAI-
 * compatible server) have ONE entry whose model the user sets in Settings > AI;
 * the entry's `model` is then only the default.
 *
 * Three things are decided here and nowhere else:
 *
 * - **Which credential an entry uses** (`keyBucket`). A key is only ever sent to
 *   the vendor that issued it, and an unknown id has no bucket at all —
 *   `requireAiProvider` throws rather than borrowing the first row's (audit R1:
 *   the Gemini key used to be sent as a Bearer token to DeepSeek).
 * - **Which wire format it speaks** (`wire`). The runtime builds the request and
 *   parses the reply from this, never from string-matching the id.
 * - **What the request can carry** (`acceptsImageInput`).
 */
export type AiProviderId =
  | 'gemini-2.5-flash'
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'claude-haiku-5-5'
  | 'claude-sonnet-5-5'
  | 'claude-opus-5-5'
  | 'openai'
  | 'openai-compatible';

/** The credential an entry reads. Also the vendor: one bucket per vendor. */
export type AiProviderKeyBucket = 'gemini' | 'deepseek' | 'anthropic' | 'openai' | 'openai-compatible';

/** Every bucket, in the order the settings surfaces list them. */
export const AI_PROVIDER_KEY_BUCKETS: readonly AiProviderKeyBucket[] = [
  'gemini',
  'deepseek',
  'anthropic',
  'openai',
  'openai-compatible',
];

/**
 * The request/response format.
 * - `gemini`: Google `generateContent`, key in the `x-goog-api-key` header.
 * - `openai-chat`: `/chat/completions` (DeepSeek, OpenAI, Ollama, LM Studio, …).
 * - `anthropic`: the Anthropic Messages API, structured output via a forced tool.
 */
export type AiProviderWire = 'gemini' | 'openai-chat' | 'anthropic';

export interface AiProviderDefinition {
  id: AiProviderId;
  /** The vendor's product name, rendered as-is (a proper noun, not app chrome). */
  label: string;
  /** English, for logs and docs only — surfaces render translated text. */
  description: string;
  keyBucket: AiProviderKeyBucket;
  keyUrl: string;
  docsUrl: string;
  wire: AiProviderWire;
  /** The model id sent on the wire (the default, when `modelConfigurable`). */
  model: string;
  /** The user may name another model in Settings > AI (OpenAI, local servers). */
  modelConfigurable: boolean;
  /**
   * A request may go without a key. True only for the OpenAI-compatible entry:
   * Ollama and LM Studio take none. Such an entry is "configured" by its server
   * URL instead.
   */
  keyOptional: boolean;
  /**
   * Whether the provider's request format carries image input at all.
   *
   * A `false` here must produce a refusal rather than a silent drop. An image
   * attachment that vanished on the way to the provider would leave the model
   * answering about a screenshot it never saw.
   */
  acceptsImageInput: boolean;
}

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'gemini-2.5-flash',
    label: 'Google Gemini 2.5 Flash',
    description: 'Fast structured JSON via Google Generative Language API.',
    keyBucket: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/api-key',
    wire: 'gemini',
    model: 'gemini-2.5-flash',
    modelConfigurable: false,
    keyOptional: false,
    acceptsImageInput: true,
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    description: 'Economical 1M-context model with JSON output mode.',
    keyBucket: 'deepseek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    wire: 'openai-chat',
    model: 'deepseek-v4-flash',
    modelConfigurable: false,
    keyOptional: false,
    acceptsImageInput: false,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    description: 'Higher-quality DeepSeek V4 with JSON output mode.',
    keyBucket: 'deepseek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    wire: 'openai-chat',
    model: 'deepseek-v4-pro',
    modelConfigurable: false,
    keyOptional: false,
    acceptsImageInput: false,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    description: 'Anthropic’s fast, inexpensive model — the default for per-line work.',
    keyBucket: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/api/messages',
    wire: 'anthropic',
    model: 'claude-haiku-5-5',
    modelConfigurable: false,
    keyOptional: false,
    acceptsImageInput: true,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    description: 'Anthropic’s balanced model for explanations and card generation.',
    keyBucket: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/api/messages',
    wire: 'anthropic',
    model: 'claude-sonnet-5-5',
    modelConfigurable: false,
    keyOptional: false,
    acceptsImageInput: true,
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    description: 'Anthropic’s most capable model; opt-in for long-form work.',
    keyBucket: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/api/messages',
    wire: 'anthropic',
    model: 'claude-opus-5-5',
    modelConfigurable: false,
    keyOptional: false,
    acceptsImageInput: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI chat completions; the model is set in Settings > AI.',
    keyBucket: 'openai',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    wire: 'openai-chat',
    model: 'gpt-5-mini',
    modelConfigurable: true,
    keyOptional: false,
    acceptsImageInput: true,
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible server (Ollama, LM Studio)',
    description: 'Any /v1/chat/completions server; the URL and model are set in Settings > AI.',
    keyBucket: 'openai-compatible',
    keyUrl: 'https://ollama.com/download',
    docsUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
    wire: 'openai-chat',
    model: '',
    modelConfigurable: true,
    keyOptional: true,
    acceptsImageInput: false,
  },
];

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = 'gemini-2.5-flash';

/** Where each vendor's API lives. The OpenAI-compatible base comes from settings. */
export const AI_PROVIDER_BASE_URLS: Readonly<Record<Exclude<AiProviderKeyBucket, 'openai-compatible'>, string>> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com',
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
};

/** Suggested local servers, shown as presets beside the URL field. */
export const OPENAI_COMPATIBLE_PRESETS: readonly { id: 'ollama' | 'lmstudio'; label: string; baseUrl: string }[] = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
];

/** The exact entry for a known id, or `null`. Never a fallback. */
export function parseAiProviderId(value: unknown): AiProviderId | null {
  return typeof value === 'string' && AI_PROVIDERS.some((provider) => provider.id === value)
    ? (value as AiProviderId)
    : null;
}

/**
 * The entry for an id, failing closed. Every path that is about to READ A KEY or
 * BUILD A REQUEST goes through this: an unknown id is an error, never the first
 * row's credentials.
 */
export function requireAiProvider(id: string | undefined): AiProviderDefinition {
  const found = AI_PROVIDERS.find((provider) => provider.id === id);
  if (!found) throw new Error(`Unknown AI provider "${String(id)}".`);
  return found;
}

/**
 * The entry for an id, falling back to the first row — for a LABEL only.
 * Anything that reads a key or sends a request uses `requireAiProvider`.
 */
export function providerById(id: string | undefined): AiProviderDefinition {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? AI_PROVIDERS[0];
}

/** The credential bucket of a known id. Throws for an unknown one (see `requireAiProvider`). */
export function providerKeyBucket(id: AiProviderId): AiProviderKeyBucket {
  return requireAiProvider(id).keyBucket;
}

/**
 * Whether this provider can be sent an image. Fails closed: an unrecognised id
 * is never handed a screenshot.
 */
export function providerAcceptsImageInput(id: string | undefined): boolean {
  return AI_PROVIDERS.some((provider) => provider.id === id && provider.acceptsImageInput);
}

/**
 * Whether a URL points at this computer. A server there is not "the cloud": no
 * text leaves the machine and nothing is billed, so it skips the spend ledger.
 */
export function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host);
  } catch {
    return false;
  }
}

/**
 * Normalizes an OpenAI-compatible base URL: trims, drops a trailing slash and a
 * pasted `/chat/completions` suffix. `''` for anything that is not plain http(s)
 * or that embeds credentials (a key belongs in the vault, not in a URL).
 */
export function normalizeCompatibleBaseUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.username || url.password || url.search || url.hash) return '';
  return url.toString().replace(/\/+$/u, '').replace(/\/chat\/completions$/u, '').slice(0, 512);
}

/** A model id as a server accepts one: no whitespace, bounded. `''` when unusable. */
export function normalizeAiModelName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:/@+-]{1,128}$/u.test(trimmed) ? trimmed : '';
}

/**
 * Which buckets hold a usable credential. The two original buckets are always
 * present; the newer ones are optional in the TYPE so a record written by an
 * older build (or a test) still reads — a missing bucket means "not set".
 */
export type AiApiKeysSet = Record<'gemini' | 'deepseek', boolean> & Partial<Record<AiProviderKeyBucket, boolean>>;

export function emptyApiKeysSet(): Required<AiApiKeysSet> {
  return { gemini: false, deepseek: false, anthropic: false, openai: false, 'openai-compatible': false };
}

/** Reads a keys-set record that crossed a bridge; anything missing is `false`. */
export function normalizeApiKeysSet(value: unknown): Required<AiApiKeysSet> {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<string, unknown>>;
  const out = emptyApiKeysSet();
  for (const bucket of AI_PROVIDER_KEY_BUCKETS) out[bucket] = raw[bucket] === true;
  return out;
}

/**
 * Whether a provider can be sent a request at all, answered before one is sent.
 *
 * `configured` is a credential-presence fact, not a reachability claim: it says
 * the key bucket holds a non-empty secret (for the OpenAI-compatible entry: a
 * server URL and model are set). A surface that shows this must not word it as
 * "online" or "healthy" — the app has not called the provider.
 */
export interface AiProviderHealth {
  providerId: AiProviderId;
  model: string;
  credentialBucket: AiProviderKeyBucket;
  configured: boolean;
}
