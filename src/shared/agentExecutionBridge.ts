import type { AiProviderId } from './aiProviders';
import {
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
 */
export interface AgentExecutionAttachment {
  id: string;
  kind: 'text' | 'document';
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  sensitivity: 'sensitive';
  retained: false;
  contentText: string;
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
  'bridge-unavailable',
]);

const ID_MAX = 180;
const PROMPT_MAX = 20_000;
export const AGENT_EXECUTION_ATTACHMENT_LIMIT = 5;
export const AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT = 100_000;
export const AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT = 200_000;
const ATTACHMENT_ID_MAX = 240;
const ATTACHMENT_NAME_MAX = 500;
const ATTACHMENT_MIME_MAX = 200;
const FORBIDDEN_ATTACHMENT_FIELDS = new Set([
  'localPath',
  'path',
  'bytes',
  'contentBytes',
  'data',
  'base64',
  'buffer',
]);

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
  if ([...FORBIDDEN_ATTACHMENT_FIELDS].some((field) => Object.hasOwn(raw, field))) return null;
  if (raw.kind !== 'text' && raw.kind !== 'document') return null;
  const id = boundedText(raw.id, ATTACHMENT_ID_MAX);
  const name = boundedText(raw.name, ATTACHMENT_NAME_MAX);
  if (!id || !name || typeof raw.contentText !== 'string') return null;
  if (
    raw.contentText.trim().length === 0
    || raw.contentText.length > AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT
  ) return null;
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
  for (const valueEntry of value) {
    const attachment = normalizeExecutionAttachment(valueEntry);
    if (!attachment || ids.has(attachment.id)) return null;
    totalChars += attachment.contentText.length;
    if (totalChars > AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT) return null;
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
  const maxEstimatedCostUsd = typeof raw.maxEstimatedCostUsd === 'number'
    && Number.isFinite(raw.maxEstimatedCostUsd)
    && raw.maxEstimatedCostUsd >= 0
    ? raw.maxEstimatedCostUsd
    : undefined;
  return {
    target: normalizedTarget,
    allowCloud: raw.allowCloud === true,
    allowSensitiveContext: raw.allowSensitiveContext === true,
    maxInputChars: boundedInteger(raw.maxInputChars, 50_000, 1, 200_000),
    maxOutputTokens: boundedInteger(raw.maxOutputTokens, 1_500, 1, 16_384),
    ...(maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd } : {}),
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
    allowSensitiveContext: false,
    maxInputChars: 50_000,
    maxOutputTokens: 1_500,
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
