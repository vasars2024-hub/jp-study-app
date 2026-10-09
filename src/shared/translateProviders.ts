/**
 * Which engine translates a passage, and what the user has agreed to.
 *
 * The interactive Translate surface used to have exactly one engine: the small
 * offline Qwen3 model. This module is the pure half of the provider layer that
 * sits in front of it — the provider table, the per-language-pair choice, the
 * per-provider consent record, the cloud prompt and its streaming parser, and
 * DeepL's wire details. `main/translateRouter.ts` is the half that does I/O.
 *
 * Three rules are decided here so main, the renderer and the eval tool cannot
 * disagree about them:
 *
 * - **Local is the default and needs nothing.** A pair with no saved choice,
 *   or a saved choice this build no longer knows, translates offline.
 * - **A cloud provider needs its own consent.** Consent for Gemini is not
 *   consent for DeepL: each one is a different company receiving the text.
 *   Revoking consent also moves every pair that used the provider back to
 *   local, so a stale pair can never be the reason text leaves the device.
 * - **Brand names are data, not catalog keys.** "DeepL" reads the same in all
 *   four UI languages (the `credentialRegistry.ts` rule); everything a
 *   translator can translate is an `xlate2.` key.
 */
import type { AiProviderId } from './aiProviders';
import { langLabel } from './langs';
import type { TranslateSenseHint, TranslateStyle } from './translateCore';

export type TranslateCloudProviderId = 'deepl' | AiProviderId;
export type TranslateProviderId = 'local' | 'local-large' | TranslateCloudProviderId;

export interface TranslateProviderDefinition {
  id: TranslateProviderId;
  kind: 'local' | 'cloud';
  /** `mt` is a dedicated translation API; `llm` is a prompted language model. */
  engine: 'mt' | 'llm';
  /** The provider's own name for cloud rows (rendered as-is); absent for local rows. */
  brand?: string;
  /** i18n key for local rows, whose names are app chrome rather than brands. */
  labelKey?: string;
  /** Host the passage is sent to, named in the privacy note. Never fetched from here. */
  host?: string;
  /** Vault credential id that holds the key. */
  credentialId?: 'deepl' | 'gemini' | 'deepseek';
}

export const TRANSLATE_PROVIDERS: readonly TranslateProviderDefinition[] = [
  { id: 'local', kind: 'local', engine: 'llm', labelKey: 'xlate2.provider.local' },
  { id: 'local-large', kind: 'local', engine: 'llm', labelKey: 'xlate2.provider.localLarge' },
  {
    id: 'deepl',
    kind: 'cloud',
    engine: 'mt',
    brand: 'DeepL API',
    host: 'api.deepl.com',
    credentialId: 'deepl',
  },
  {
    id: 'gemini-2.5-flash',
    kind: 'cloud',
    engine: 'llm',
    brand: 'Google Gemini 2.5 Flash',
    host: 'generativelanguage.googleapis.com',
    credentialId: 'gemini',
  },
  {
    id: 'deepseek-v4-flash',
    kind: 'cloud',
    engine: 'llm',
    brand: 'DeepSeek V4 Flash',
    host: 'api.deepseek.com',
    credentialId: 'deepseek',
  },
  {
    id: 'deepseek-v4-pro',
    kind: 'cloud',
    engine: 'llm',
    brand: 'DeepSeek V4 Pro',
    host: 'api.deepseek.com',
    credentialId: 'deepseek',
  },
];

const PROVIDER_IDS: ReadonlySet<string> = new Set(TRANSLATE_PROVIDERS.map((provider) => provider.id));

export function isTranslateProviderId(value: unknown): value is TranslateProviderId {
  return typeof value === 'string' && PROVIDER_IDS.has(value);
}

export function translateProviderDefinition(id: TranslateProviderId): TranslateProviderDefinition {
  return TRANSLATE_PROVIDERS.find((provider) => provider.id === id) ?? TRANSLATE_PROVIDERS[0];
}

/** Fails closed: an unknown id is never cloud, because it is never sent anywhere. */
export function isCloudTranslateProvider(id: unknown): id is TranslateCloudProviderId {
  return TRANSLATE_PROVIDERS.some((provider) => provider.id === id && provider.kind === 'cloud');
}

/** The name to show for a provider. `t` resolves the local rows' catalog keys. */
export function translateProviderLabel(id: TranslateProviderId, t: (key: string) => string): string {
  const def = translateProviderDefinition(id);
  return def.brand ?? t(def.labelKey ?? 'xlate2.provider.local');
}

// ---------------------------------------------------------------------------
// Settings: per-pair choice, per-provider consent, offline fallback
// ---------------------------------------------------------------------------

export interface TranslateProviderSettings {
  version: 1;
  /** `"ja>en"` → provider. A pair with no entry translates offline. */
  pairs: Record<string, TranslateProviderId>;
  /** Cloud provider → epoch ms the user agreed to send text to it. Absent = never asked or revoked. */
  consent: Partial<Record<TranslateCloudProviderId, number>>;
  /** When a cloud provider fails, translate with the offline model instead of failing. */
  fallbackToLocal: boolean;
}

export function defaultTranslateProviderSettings(): TranslateProviderSettings {
  return { version: 1, pairs: {}, consent: {}, fallbackToLocal: true };
}

const PAIR_KEY = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?>[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/;

export function translatePairKey(source: string, target: string): string {
  return `${String(source).trim().toLowerCase()}>${String(target).trim().toLowerCase()}`;
}

/** Coerces whatever was on disk (or crossed IPC) into settings the router can trust. */
export function normalizeTranslateProviderSettings(value: unknown): TranslateProviderSettings {
  const out = defaultTranslateProviderSettings();
  if (!value || typeof value !== 'object') return out;
  const raw = value as Record<string, unknown>;
  if (raw.pairs && typeof raw.pairs === 'object') {
    for (const [key, provider] of Object.entries(raw.pairs as Record<string, unknown>)) {
      if (Object.keys(out.pairs).length >= 64) break;
      if (PAIR_KEY.test(key) && isTranslateProviderId(provider) && provider !== 'local') out.pairs[key] = provider;
    }
  }
  if (raw.consent && typeof raw.consent === 'object') {
    for (const [id, at] of Object.entries(raw.consent as Record<string, unknown>)) {
      if (isCloudTranslateProvider(id) && typeof at === 'number' && Number.isFinite(at) && at > 0) {
        out.consent[id] = at;
      }
    }
  }
  if (raw.fallbackToLocal === false) out.fallbackToLocal = false;
  return out;
}

/**
 * What a request sends to mean "the engine this pair is set to". Only the
 * Translate workbench sends it. A request with no engine at all — the reader
 * popups, dictionary, subtitles, lexicon — is translated offline, as it always
 * was: choosing DeepL in the workbench is not consent to every surface in the
 * app quietly sending its text too.
 */
export const TRANSLATE_PAIR_CHOICE = 'pair' as const;
export type TranslateEngineRequest = TranslateProviderId | typeof TRANSLATE_PAIR_CHOICE;

export function providerForPair(settings: TranslateProviderSettings, source: string, target: string): TranslateProviderId {
  return settings.pairs[translatePairKey(source, target)] ?? 'local';
}

/** Local engines never need consent; a cloud engine needs its own. */
export function hasTranslateConsent(settings: TranslateProviderSettings, id: TranslateProviderId): boolean {
  if (!isCloudTranslateProvider(id)) return true;
  return typeof settings.consent[id] === 'number';
}

export function withPairProvider(
  settings: TranslateProviderSettings,
  source: string,
  target: string,
  id: TranslateProviderId,
): TranslateProviderSettings {
  const pairs = { ...settings.pairs };
  const key = translatePairKey(source, target);
  if (id === 'local') delete pairs[key];
  else pairs[key] = id;
  return { ...settings, pairs };
}

/**
 * Grant or revoke one provider's consent. Revoking also returns every pair that
 * used the provider to the offline model: a pair still pointing at a provider
 * the user withdrew from would be one setting away from sending text again.
 */
export function withTranslateConsent(
  settings: TranslateProviderSettings,
  id: TranslateCloudProviderId,
  granted: boolean,
  now: number,
): TranslateProviderSettings {
  const consent = { ...settings.consent };
  const pairs = { ...settings.pairs };
  if (granted) {
    consent[id] = now;
  } else {
    delete consent[id];
    for (const [key, provider] of Object.entries(pairs)) if (provider === id) delete pairs[key];
  }
  return { ...settings, consent, pairs };
}

// ---------------------------------------------------------------------------
// What main reports about each provider
// ---------------------------------------------------------------------------

export interface TranslateProviderAvailability {
  id: TranslateProviderId;
  /** A key is stored, or a model file is on disk. Not a claim that the service answers. */
  ready: boolean;
  reason?: 'no-key' | 'not-installed';
  consented: boolean;
  /** For the local tiers: the model file that would run. */
  modelFileName?: string;
}

export interface TranslateProviderSnapshot {
  settings: TranslateProviderSettings;
  providers: TranslateProviderAvailability[];
}

/**
 * The larger local models the app's catalog already names, preferred in this
 * order: 8B is the one an ordinary machine can run at reading speed, 32B the
 * one only a workstation can. Ids from `LOCAL_AGENT_MODEL_CATALOG`.
 */
export const LARGE_TRANSLATE_MODEL_IDS: readonly string[] = ['qwen3-8b', 'qwen3-14b', 'qwen3-32b'];

// ---------------------------------------------------------------------------
// Result metadata
// ---------------------------------------------------------------------------

/** Why the offline model stood in for a cloud provider. One catalog key per code. */
export type TranslateFallbackCode =
  | 'consent'
  | 'no-key'
  | 'auth'
  | 'rate-limit'
  | 'quota'
  | 'spend'
  | 'network'
  | 'timeout'
  | 'invalid'
  | 'too-long'
  | 'not-installed'
  | 'unsupported'
  | 'other';

const FALLBACK_CODES: readonly TranslateFallbackCode[] = [
  'consent', 'no-key', 'auth', 'rate-limit', 'quota', 'spend', 'network', 'timeout', 'invalid', 'too-long',
  'not-installed', 'unsupported', 'other',
];

export function isTranslateFallbackCode(value: unknown): value is TranslateFallbackCode {
  return FALLBACK_CODES.includes(value as TranslateFallbackCode);
}

/** Catalog key for a fallback code, spelled out so every key is a literal the i18n gates can see. */
export const TRANSLATE_FALLBACK_KEYS: Record<TranslateFallbackCode, string> = {
  consent: 'xlate2.fallback.consent',
  'no-key': 'xlate2.fallback.noKey',
  auth: 'xlate2.fallback.auth',
  'rate-limit': 'xlate2.fallback.rateLimit',
  quota: 'xlate2.fallback.quota',
  spend: 'xlate2.fallback.spend',
  network: 'xlate2.fallback.network',
  timeout: 'xlate2.fallback.timeout',
  invalid: 'xlate2.fallback.invalid',
  'too-long': 'xlate2.fallback.tooLong',
  'not-installed': 'xlate2.fallback.notInstalled',
  unsupported: 'xlate2.fallback.unsupported',
  other: 'xlate2.fallback.other',
};

/** Maps a provider-runtime error code (or the router's own) to a fallback code. */
export function translateFallbackCodeFor(code: string | undefined): TranslateFallbackCode {
  switch (code) {
    case 'consent':
      return 'consent';
    case 'missing-credential':
    case 'no-key':
      return 'no-key';
    case 'authentication':
      return 'auth';
    case 'rate-limit':
      return 'rate-limit';
    case 'quota':
      return 'quota';
    case 'spend-budget':
    case 'cost-budget':
      return 'spend';
    case 'network':
    case 'upstream':
      return 'network';
    case 'timeout':
      return 'timeout';
    case 'invalid-response':
    case 'output-truncated':
    case 'invalid':
      return 'invalid';
    case 'input-budget':
    case 'too-long':
      return 'too-long';
    case 'local-model-missing':
    case 'not-installed':
      return 'not-installed';
    case 'vision-unsupported':
    case 'unsupported':
      return 'unsupported';
    default:
      return 'other';
  }
}

export interface TranslateGlossaryReport {
  applied: string[];
  missing: string[];
}

export interface TranslateResultMeta {
  /** The engine that produced the text on screen. */
  provider: TranslateProviderId;
  /** The engine that was asked for and could not answer, when the offline model stood in. */
  fallbackFrom?: TranslateProviderId;
  fallbackCode?: TranslateFallbackCode;
  /** Which glossary terms the result honours. Absent when no glossary term occurs in the text. */
  glossary?: TranslateGlossaryReport;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 64) : [];
}

export function sanitizeTranslateResultMeta(value: unknown): TranslateResultMeta | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!isTranslateProviderId(raw.provider)) return null;
  const meta: TranslateResultMeta = { provider: raw.provider };
  if (isTranslateProviderId(raw.fallbackFrom)) meta.fallbackFrom = raw.fallbackFrom;
  if (isTranslateFallbackCode(raw.fallbackCode)) meta.fallbackCode = raw.fallbackCode;
  if (raw.glossary && typeof raw.glossary === 'object') {
    const glossary = raw.glossary as Record<string, unknown>;
    meta.glossary = { applied: stringList(glossary.applied), missing: stringList(glossary.missing) };
  }
  return meta;
}

/** A translation that failed outright (no fallback ran): who failed and why. */
export interface TranslateRouteFailure {
  provider: TranslateProviderId;
  code: TranslateFallbackCode;
}

export function sanitizeTranslateRouteFailure(value: unknown): TranslateRouteFailure | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!isTranslateProviderId(raw.provider) || !isTranslateFallbackCode(raw.code)) return null;
  return { provider: raw.provider, code: raw.code };
}

// ---------------------------------------------------------------------------
// Cloud LLM prompt, and the line format it streams back in
// ---------------------------------------------------------------------------

export const CLOUD_TRANSLATE_SYSTEM_PROMPT =
  'You are a professional literary translator. You translate faithfully and idiomatically, '
  + 'and you never add commentary, notes, romanization or quotation marks of your own.';

/** A passage longer than this is refused before it is sent rather than truncated by the provider. */
export const CLOUD_TRANSLATE_MAX_CHARS = 6_000;

/**
 * One request for the whole passage, sentence-numbered.
 *
 * The whole passage in one prompt is the point of a stronger model: Japanese
 * drops subjects and objects that only the neighbouring sentences supply, and
 * keigo, counters and onomatopoeia are read off context a sentence-at-a-time
 * prompt never sees. The numbering keeps the sentence alignment the workbench
 * shows, and the one-line-per-sentence answer is what lets a streamed reply be
 * displayed sentence by sentence as it arrives.
 */
export function buildCloudTranslatePrompt(
  sentences: readonly string[],
  source: string,
  target: string,
  style: TranslateStyle = 'natural',
  hints?: readonly TranslateSenseHint[],
): string {
  const src = langLabel(source);
  const tgt = langLabel(target);
  const how = style === 'literal'
    ? `Translate as literally as ${tgt} allows, keeping the original structure and word order where possible.`
    : `Translate naturally, as a fluent ${tgt} writer would put it.`;
  const terms = hints?.length
    ? `Use exactly these renderings for these terms: ${hints.map((h) => `${h.text} -> ${h.gloss}`).join('; ')}.\n`
    : '';
  return (
    `Translate this ${src} passage into ${tgt}. Read the whole passage first: recover omitted subjects and `
    + 'objects from context, keep the speaker\'s politeness level (keigo, casual speech), render counters, idioms '
    + `and onomatopoeia by meaning rather than word for word. ${how}\n`
    + terms
    + `Answer with exactly one line per numbered sentence, in the form [n] translation, keeping the numbers, `
    + 'and nothing else.\n\n'
    + sentences.map((sentence, index) => `[${index + 1}] ${sentence.replace(/\s*\n\s*/g, ' ')}`).join('\n')
  );
}

const LINE = /^\s*\[(\d{1,4})\]\s*(.*?)\s*$/;

/** Parses a complete reply into sentence index (0-based) → translation. */
export function parseCloudTranslateLines(text: string, count: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const match = LINE.exec(line);
    if (!match) continue;
    const index = Number(match[1]) - 1;
    const body = match[2].replace(/^["'«「]|["'»」]$/g, '').trim();
    if (index >= 0 && index < count && body && !out.has(index)) out.set(index, body);
  }
  return out;
}

/**
 * Incremental version of `parseCloudTranslateLines` for a streamed reply: each
 * line is reported the moment its newline arrives, once. `flush` reports a last
 * line that ended without one.
 */
export function createCloudLineStream(
  count: number,
  onLine: (index: number, text: string) => void,
): { push: (chunk: string) => void; flush: () => void } {
  let buffer = '';
  const seen = new Set<number>();
  const emit = (line: string): void => {
    const parsed = parseCloudTranslateLines(line, count);
    for (const [index, text] of parsed) {
      if (seen.has(index)) continue;
      seen.add(index);
      onLine(index, text);
    }
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) emit(line);
    },
    flush() {
      if (buffer.trim()) emit(buffer);
      buffer = '';
    },
  };
}

// ---------------------------------------------------------------------------
// DeepL
// ---------------------------------------------------------------------------

/** DeepL's documented Pro character price; a Free key (`…:fx`) is not billed. */
export const DEEPL_USD_PER_CHAR = 25 / 1_000_000;

export function deeplApiBase(apiKey: string): string {
  return apiKey.trim().endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

export function deeplEstimatedCostUsd(apiKey: string, chars: number): number {
  if (apiKey.trim().endsWith(':fx')) return 0;
  return Math.max(0, chars) * DEEPL_USD_PER_CHAR;
}

const DEEPL_SOURCE = new Set(['ja', 'zh', 'en', 'ru', 'ko', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'uk']);

/**
 * DeepL's language code for an app code, or null when DeepL does not take it.
 * Targets need a variant where DeepL deprecated the bare code (`EN`, `PT`) and
 * Chinese is sent as Simplified, which is what the app's `zh` means.
 */
export function deeplLangCode(code: string, role: 'source' | 'target'): string | null {
  const base = String(code).toLowerCase().split('-')[0];
  if (!DEEPL_SOURCE.has(base)) return null;
  if (role === 'target') {
    if (base === 'en') return 'EN-US';
    if (base === 'pt') return 'PT-BR';
    if (base === 'zh') return 'ZH-HANS';
  }
  return base.toUpperCase();
}

/** The translations from a `/v2/translate` reply, in request order, or null when it is not one. */
export function parseDeeplTranslations(json: unknown, count: number): string[] | null {
  if (!json || typeof json !== 'object') return null;
  const list = (json as { translations?: unknown }).translations;
  if (!Array.isArray(list) || list.length !== count) return null;
  const out: string[] = [];
  for (const item of list) {
    const text = item && typeof item === 'object' ? (item as { text?: unknown }).text : undefined;
    if (typeof text !== 'string') return null;
    out.push(text);
  }
  return out;
}

/** How a pair's translations join into one passage: no spaces between CJK sentences. */
export function joinTranslatedSentences(parts: readonly string[], target: string): string {
  const base = String(target).toLowerCase().split('-')[0];
  return parts.filter(Boolean).join(base === 'ja' || base === 'zh' ? '' : ' ');
}
