import type { AiProviderId } from './aiProviders';
import { normalizeAgentProviderPrice } from './agentProviderPricing';
import {
  AGENT_HISTORY_TURN_CEILING,
  AGENT_WORKSPACE_SCHEMA_VERSION,
  normalizeAgentWorkspaceState,
  type AgentProviderPolicy,
  type AgentWorkspaceState,
} from './agentWorkspace';

export const AGENT_EXECUTION_CHANNELS = {
  run: 'agentExecution:run',
  cancel: 'agentExecution:cancel',
  event: 'agentExecution:event',
} as const;

export type AgentExecutionFailureCode =
  | 'invalid-request'
  | 'conversation-not-found'
  | 'busy'
  | 'store-failed'
  | 'cancelled'
  | 'timeout'
  | 'missing-credential'
  | 'persistent-cache-unavailable'
  | 'cloud-disabled'
  | 'sensitive-context'
  | 'input-budget'
  | 'cost-budget'
  | 'authentication'
  | 'rate-limit'
  | 'upstream'
  | 'network'
  | 'invalid-response'
  | 'provider-failed'
  | 'vision-unsupported'
  | 'bridge-unavailable';

export interface AgentExecutionRequest {
  requestId: string;
  conversationId: string;
  prompt: string;
  policy: AgentProviderPolicy;
  allowLocalFallback: boolean;
  attachments: AgentExecutionAttachment[];
}

/**
 * File content exists only for the lifetime of one execution request. The
 * workspace stores the matching AgentAttachment metadata, never this payload.
 *
 * `image` is the vision lane. It is the ONE kind allowed to carry bytes on this
 * channel, it carries them in `imageBase64` and nowhere else, and it is bounded
 * separately from the character budgets because a screenshot's cost to the user
 * is measured in megabytes, not in characters. See `FORBIDDEN_ATTACHMENT_FIELDS`
 * for what is still refused, and `providerAcceptsImageInput` for who may receive
 * one.
 *
 * `contentText` on an `image` is the OCR/description text that came with the
 * capture, and may be empty — an image attached from the file picker has none.
 * It is reference text ABOUT the image, never a substitute for it: a provider
 * that cannot take the image is refused rather than being sent this instead.
 */
export interface AgentExecutionAttachment {
  id: string;
  kind: 'text' | 'document' | 'image';
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  sensitivity: 'sensitive';
  retained: false;
  contentText: string;
  /**
   * Raw standard-alphabet base64, no `data:` prefix and no whitespace. Present
   * if and only if `kind` is `image`; the normalizer rejects both halves of that
   * biconditional being broken.
   */
  imageBase64?: string;
}

export interface AgentExecutionChunkEvent {
  type: 'chunk';
  requestId: string;
  assistantMessageId: string;
  text: string;
}

export type AgentExecutionEvent = AgentExecutionChunkEvent;

/**
 * Stable ids for the two persisted rows owned by one execution.
 * Main creates them and renderers use the same definition to reconcile streamed
 * text with the placeholder announced through the workspace broadcast.
 */
export function agentExecutionMessageIds(requestId: string): {
  user: string;
  assistant: string;
} {
  return {
    user: `request-${requestId}-user`,
    assistant: `request-${requestId}-assistant`,
  };
}

export interface AgentExecutionSuccess {
  ok: true;
  requestId: string;
  assistantMessageId: string;
  delivery: 'streamed' | 'buffered';
  state: AgentWorkspaceState;
}

export interface AgentExecutionFailure {
  ok: false;
  code: AgentExecutionFailureCode;
  requestId?: string;
  state?: AgentWorkspaceState;
}

export type AgentExecutionResult = AgentExecutionSuccess | AgentExecutionFailure;

export interface AgentExecutionCancelResult {
  ok: true;
  cancelled: boolean;
}

/** Renderer-visible bounds for the two request budgets enforced again by main. */
export const AGENT_EXECUTION_INPUT_BUDGET_MIN = 1;
export const AGENT_EXECUTION_INPUT_BUDGET_MAX = 200_000;
export const AGENT_EXECUTION_OUTPUT_BUDGET_MIN = 1;
export const AGENT_EXECUTION_OUTPUT_BUDGET_MAX = 16_384;
export const AGENT_EXECUTION_DEFAULT_INPUT_BUDGET = 50_000;
export const AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET = 1_500;

const CLOUD_PROVIDERS = new Set<AiProviderId>([
  'gemini-2.5-flash',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
]);

const FAILURE_CODES = new Set<AgentExecutionFailureCode>([
  'invalid-request',
  'conversation-not-found',
  'busy',
  'store-failed',
  'cancelled',
  'timeout',
  'missing-credential',
  'persistent-cache-unavailable',
  'cloud-disabled',
  'sensitive-context',
  'input-budget',
  'cost-budget',
  'authentication',
  'rate-limit',
  'upstream',
  'network',
  'invalid-response',
  'provider-failed',
  'vision-unsupported',
  'bridge-unavailable',
]);

const ID_MAX = 180;
const PROMPT_MAX = 20_000;
export const AGENT_EXECUTION_ATTACHMENT_LIMIT = 5;
export const AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT = 100_000;
export const AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT = 200_000;

/**
 * The vision bounds. Separate from the character budgets on purpose: those
 * measure what the prompt costs in tokens, and these measure what leaves the
 * machine as a picture of the user's screen.
 *
 * 4 MiB decoded is a full-resolution PNG of a 4K display with room to spare and
 * roughly a fifth of Gemini's 20 MB inline-request ceiling, so two of them plus
 * a large text prompt still fit in one request. Two images per request is the
 * bound on *how much screen* one question can disclose; the existing
 * five-attachment limit still applies on top of it.
 */
export const AGENT_EXECUTION_IMAGE_LIMIT = 2;
export const AGENT_EXECUTION_IMAGE_BYTES_LIMIT = 4 * 1024 * 1024;
/** The three formats both Electron's capture path and Gemini's inline data agree on. */
export const AGENT_EXECUTION_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export type AgentExecutionImageMimeType = typeof AGENT_EXECUTION_IMAGE_MIME_TYPES[number];

const ATTACHMENT_ID_MAX = 240;
const ATTACHMENT_NAME_MAX = 500;
const ATTACHMENT_MIME_MAX = 200;
/**
 * Field names that may never appear on an attachment object, whatever its kind.
 *
 * Every one of these is a way of smuggling something the caller has not
 * declared: a `path`/`localPath` makes the attachment a reference into the
 * user's filesystem that main would have to resolve, and `bytes`/`data`/
 * `base64`/`buffer`/`contentBytes` are untyped binary with no size bound, no
 * format and no kind to check them against.
 *
 * The vision lane did not weaken this set — it did not touch it. `imageBase64`
 * is a *new* declared field, admitted only for `kind: 'image'`, and it is
 * checked for format, alphabet and decoded size before it is accepted. That is
 * the difference between extending the boundary and going around it: a caller
 * still cannot hand this channel bytes without saying what they are.
 */
const FORBIDDEN_ATTACHMENT_FIELDS = new Set([
  'localPath',
  'path',
  'bytes',
  'contentBytes',
  'data',
  'base64',
  'buffer',
]);
/**
 * Whether an object carries any of the fields above.
 *
 * Exported because the vision lane gave attachments a **second** entry point:
 * `shared/agentImageStaging.ts` accepts a capture from a renderer and turns it
 * into an attachment later, without this normalizer ever seeing the request. A
 * boundary enforced at one of two doors is not a boundary, and a driven probe
 * caught exactly that — a stage request carrying `bytes` was answered `ok`
 * because the staging normalizer only read the fields it knew about.
 *
 * Dropping the unknown field silently would have been the wrong repair even
 * though nothing untyped could reach the attachment: a caller who sent it
 * believed it meant something, and answering `ok` tells them it did.
 */
export function hasForbiddenAttachmentField(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return [...FORBIDDEN_ATTACHMENT_FIELDS].some((field) => Object.hasOwn(raw, field));
}

/** Standard alphabet only, correctly padded, no whitespace and no `data:` prefix. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Decoded byte length of a base64 string, or `null` if it is not valid base64.
 *
 * Computed arithmetically rather than by decoding: this runs on renderer input
 * in main, and `Buffer.from(value, 'base64')` would happily allocate megabytes
 * for a string that is about to be rejected, as well as silently ignoring the
 * invalid characters that are the reason to reject it.
 */
export function decodedBase64Bytes(value: string): number | null {
  if (!value || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return null;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function normalizeExecutionAttachment(value: unknown): AgentExecutionAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (hasForbiddenAttachmentField(raw)) return null;
  if (raw.kind !== 'text' && raw.kind !== 'document' && raw.kind !== 'image') return null;
  const image = raw.kind === 'image';
  const id = boundedText(raw.id, ATTACHMENT_ID_MAX);
  const name = boundedText(raw.name, ATTACHMENT_NAME_MAX);
  if (!id || !name || typeof raw.contentText !== 'string') return null;
  // A text or document attachment with nothing in it is a no-op that still costs
  // a section in the prompt. An image's `contentText` is optional OCR text about
  // a payload that is carried elsewhere, so empty is its normal case.
  if (!image && raw.contentText.trim().length === 0) return null;
  if (raw.contentText.length > AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT) return null;
  if (raw.mimeType !== undefined && typeof raw.mimeType !== 'string') return null;
  const mimeType = boundedText(raw.mimeType, ATTACHMENT_MIME_MAX);
  if (raw.mimeType !== undefined && !mimeType) return null;
  if (
    raw.sizeBytes !== undefined
    && (
      typeof raw.sizeBytes !== 'number'
      || !Number.isSafeInteger(raw.sizeBytes)
      || raw.sizeBytes < 0
    )
  ) return null;

  // `imageBase64` and `kind: 'image'` imply each other. A payload on a text
  // attachment is a caller trying to reach the vision lane without declaring it,
  // and an image kind with no payload is an attachment claiming to show
  // something it does not carry — the provider would answer about a picture that
  // was never sent.
  if (raw.imageBase64 !== undefined && !image) return null;
  let imageBase64: string | undefined;
  if (image) {
    if (typeof raw.imageBase64 !== 'string') return null;
    imageBase64 = raw.imageBase64;
    const decodedBytes = decodedBase64Bytes(imageBase64);
    if (decodedBytes === null || decodedBytes > AGENT_EXECUTION_IMAGE_BYTES_LIMIT) return null;
    // The format has to be declared, because the provider is told it verbatim.
    // Guessing it from the bytes here would put an unverified claim on the wire.
    if (!(AGENT_EXECUTION_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
    // `sizeBytes` is the user-facing figure; letting it disagree with the payload
    // would make the size shown in the composer a different number from the one
    // actually sent.
    if (raw.sizeBytes !== undefined && raw.sizeBytes !== decodedBytes) return null;
    return {
      id,
      kind: 'image',
      name,
      mimeType,
      sizeBytes: decodedBytes,
      sensitivity: 'sensitive',
      retained: false,
      contentText: raw.contentText,
      imageBase64,
    };
  }

  return {
    id,
    kind: raw.kind,
    name,
    ...(mimeType ? { mimeType } : {}),
    ...(typeof raw.sizeBytes === 'number' ? { sizeBytes: raw.sizeBytes } : {}),
    sensitivity: 'sensitive',
    retained: false,
    contentText: raw.contentText,
  };
}

function normalizeExecutionAttachments(value: unknown): AgentExecutionAttachment[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > AGENT_EXECUTION_ATTACHMENT_LIMIT) return null;
  const attachments: AgentExecutionAttachment[] = [];
  const ids = new Set<string>();
  let totalChars = 0;
  let images = 0;
  for (const valueEntry of value) {
    const attachment = normalizeExecutionAttachment(valueEntry);
    if (!attachment || ids.has(attachment.id)) return null;
    totalChars += attachment.contentText.length;
    if (totalChars > AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT) return null;
    if (attachment.kind === 'image') {
      images += 1;
      if (images > AGENT_EXECUTION_IMAGE_LIMIT) return null;
    }
    ids.add(attachment.id);
    attachments.push(attachment);
  }
  return attachments;
}

function normalizePolicy(value: unknown): AgentProviderPolicy | null {
  const raw = record(value);
  const target = record(raw.target);
  let normalizedTarget: AgentProviderPolicy['target'] | null = null;
  if (target.kind === 'local' && target.backend === 'local-qwen') {
    const model = boundedText(target.model, 240);
    normalizedTarget = {
      kind: 'local',
      backend: 'local-qwen',
      ...(model ? { model } : {}),
    };
  } else if (target.kind === 'cloud' && CLOUD_PROVIDERS.has(target.providerId as AiProviderId)) {
    const model = boundedText(target.model, 240);
    normalizedTarget = {
      kind: 'cloud',
      providerId: target.providerId as AiProviderId,
      ...(model ? { model } : {}),
    };
  }
  if (!normalizedTarget || raw.cache === 'persistent') return null;
  const cache = raw.cache === 'session' ? 'session' : 'off';
  // A local target has no dollar price, so neither a rate nor a cap survives it.
  const pricing = normalizedTarget.kind === 'cloud'
    ? normalizeAgentProviderPrice(raw.pricing)
    : undefined;
  const requestedCostBudget = typeof raw.maxEstimatedCostUsd === 'number'
    && Number.isFinite(raw.maxEstimatedCostUsd)
    && raw.maxEstimatedCostUsd >= 0
    ? raw.maxEstimatedCostUsd
    : undefined;
  // The cap is only carried when there is a price to evaluate it against. The
  // runtime skips its preflight refusal when the estimate is `undefined`, so
  // forwarding a cap without pricing would put a control in front of the user
  // that silently refuses nothing — the exact false assurance this lane was held
  // back for. Dropped here, in shared code, so both ends and a test agree.
  const maxEstimatedCostUsd = pricing ? requestedCostBudget : undefined;
  // Carried only when the sender actually stated a policy. Absent stays absent
  // rather than becoming a number, because the router reads absence as "no user
  // policy, use the ceiling" — and a value invented here would be indistinguishable
  // from one the user chose. Clamped so this field can never widen the ceiling.
  const historyTurns = typeof raw.historyTurns === 'number' && Number.isFinite(raw.historyTurns)
    ? Math.min(AGENT_HISTORY_TURN_CEILING, Math.max(0, Math.floor(raw.historyTurns)))
    : undefined;
  return {
    target: normalizedTarget,
    allowCloud: raw.allowCloud === true,
    // This is a privacy floor, so an older or malformed sender cannot omit the
    // field to make sensitive material cloud-eligible.
    excludeSensitiveContext: raw.excludeSensitiveContext !== false,
    allowSensitiveContext: raw.allowSensitiveContext === true,
    ...(historyTurns !== undefined ? { historyTurns } : {}),
    maxInputChars: boundedInteger(
      raw.maxInputChars,
      AGENT_EXECUTION_DEFAULT_INPUT_BUDGET,
      AGENT_EXECUTION_INPUT_BUDGET_MIN,
      AGENT_EXECUTION_INPUT_BUDGET_MAX,
    ),
    maxOutputTokens: boundedInteger(
      raw.maxOutputTokens,
      AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET,
      AGENT_EXECUTION_OUTPUT_BUDGET_MIN,
      AGENT_EXECUTION_OUTPUT_BUDGET_MAX,
    ),
    ...(maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd } : {}),
    ...(pricing ? { pricing } : {}),
    cache,
    retryAttempts: boundedInteger(raw.retryAttempts, 1, 0, 3),
    timeoutMs: boundedInteger(raw.timeoutMs, 120_000, 1_000, 600_000),
    streaming: raw.streaming !== false,
  };
}

export function defaultAgentExecutionPolicy(
  target: 'local' | AiProviderId = 'local',
): AgentProviderPolicy {
  const local = target === 'local';
  return {
    target: local
      ? { kind: 'local', backend: 'local-qwen' }
      : { kind: 'cloud', providerId: target },
    allowCloud: !local,
    excludeSensitiveContext: true,
    allowSensitiveContext: false,
    maxInputChars: AGENT_EXECUTION_DEFAULT_INPUT_BUDGET,
    maxOutputTokens: AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET,
    cache: 'off',
    retryAttempts: 1,
    timeoutMs: 120_000,
    streaming: true,
  };
}

export function normalizeAgentExecutionId(value: unknown): string | null {
  const id = boundedText(value, ID_MAX);
  return id || null;
}

export function normalizeAgentExecutionRequest(value: unknown): AgentExecutionRequest | null {
  const raw = record(value);
  const requestId = normalizeAgentExecutionId(raw.requestId);
  const conversationId = normalizeAgentExecutionId(raw.conversationId);
  const prompt = boundedText(raw.prompt, PROMPT_MAX);
  const policy = normalizePolicy(raw.policy);
  const attachments = normalizeExecutionAttachments(raw.attachments);
  if (!requestId || !conversationId || !prompt || !policy || !attachments) return null;
  if (policy.target.kind === 'cloud' && !policy.allowCloud) return null;
  return {
    requestId,
    conversationId,
    prompt,
    policy,
    allowLocalFallback: raw.allowLocalFallback === true,
    attachments,
  };
}

export function normalizeAgentExecutionEvent(value: unknown): AgentExecutionEvent | null {
  const raw = record(value);
  const requestId = normalizeAgentExecutionId(raw.requestId);
  const assistantMessageId = normalizeAgentExecutionId(raw.assistantMessageId);
  if (raw.type !== 'chunk' || !requestId || !assistantMessageId || typeof raw.text !== 'string') {
    return null;
  }
  return {
    type: 'chunk',
    requestId,
    assistantMessageId,
    text: raw.text.slice(0, 64_000),
  };
}

export function agentExecutionFailure(
  code: AgentExecutionFailureCode,
  requestId?: string,
  state?: AgentWorkspaceState,
): AgentExecutionFailure {
  return {
    ok: false,
    code,
    ...(requestId ? { requestId } : {}),
    ...(state ? { state } : {}),
  };
}

export function normalizeAgentExecutionResult(value: unknown): AgentExecutionResult {
  const raw = record(value);
  const requestId = normalizeAgentExecutionId(raw.requestId);
  if (raw.ok === true && requestId) {
    const assistantMessageId = normalizeAgentExecutionId(raw.assistantMessageId);
    const stateRaw = record(raw.state);
    if (
      assistantMessageId
      && stateRaw.version === AGENT_WORKSPACE_SCHEMA_VERSION
      && (raw.delivery === 'streamed' || raw.delivery === 'buffered')
    ) {
      return {
        ok: true,
        requestId,
        assistantMessageId,
        delivery: raw.delivery,
        state: normalizeAgentWorkspaceState(raw.state),
      };
    }
  }
  if (raw.ok === false && FAILURE_CODES.has(raw.code as AgentExecutionFailureCode)) {
    const stateRaw = record(raw.state);
    return agentExecutionFailure(
      raw.code as AgentExecutionFailureCode,
      requestId ?? undefined,
      stateRaw.version === AGENT_WORKSPACE_SCHEMA_VERSION
        ? normalizeAgentWorkspaceState(raw.state)
        : undefined,
    );
  }
  return agentExecutionFailure('provider-failed', requestId ?? undefined);
}

export function normalizeAgentExecutionCancelResult(value: unknown): AgentExecutionCancelResult {
  const raw = record(value);
  return { ok: true, cancelled: raw.ok === true && raw.cancelled === true };
}
