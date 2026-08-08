import {
  evaluateAgentProviderPrivacy,
  type AgentAttachment,
  type AgentContextItem,
  type AgentProviderDisclosure,
  type AgentProviderPolicy,
} from '../shared/agentWorkspace';
import {
  AiProviderRuntimeError,
  agentCloudRuntimeOptions,
  runCloudAiRequest,
  type AiProviderPricing,
  type AiProviderRuntimeEvent,
  type AiProviderUsage,
} from './providerRuntime';
import { runLocalQwenPrompt } from './translate';

export interface AgentProviderExecutionOptions {
  context?: AgentContextItem[];
  attachments?: AgentAttachment[];
  apiKey?: string;
  pricing?: AiProviderPricing;
  signal?: AbortSignal;
  allowLocalFallback?: boolean;
  onTextChunk?: (text: string) => void;
  onCloudEvent?: (event: AiProviderRuntimeEvent) => void;
}

export interface AgentProviderExecutionResult {
  text: string;
  provider: AgentProviderDisclosure;
  usage: AiProviderUsage;
  delivery: 'streamed' | 'buffered';
  fallbackReason?: 'missing-cloud-credential';
}

function disclosure(
  target: AgentProviderDisclosure['target'],
  cloud: boolean,
  inputChars: number,
  context: AgentContextItem[],
  attachments: AgentAttachment[],
  startedAt: number,
  completedAt: number,
  estimatedCostUsd?: number,
): AgentProviderDisclosure {
  return {
    target,
    cloud,
    contextIds: context.map((item) => item.id),
    attachmentIds: attachments.map((item) => item.id),
    inputChars,
    startedAt,
    completedAt,
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
  };
}

async function runLocal(
  policy: AgentProviderPolicy,
  prompt: string,
  context: AgentContextItem[],
  attachments: AgentAttachment[],
  inputChars: number,
  options: AgentProviderExecutionOptions,
  fallbackReason?: AgentProviderExecutionResult['fallbackReason'],
): Promise<AgentProviderExecutionResult> {
  const startedAt = Date.now();
  const stream = policy.streaming ? options.onTextChunk : undefined;
  const text = await runLocalQwenPrompt(prompt, {
    maxTokens: policy.maxOutputTokens,
    timeoutMs: policy.timeoutMs,
    signal: options.signal,
    onTextChunk: stream,
  });
  return {
    text,
    provider: disclosure(
      {
        kind: 'local',
        backend: 'local-qwen',
        ...(policy.target.kind === 'local' && policy.target.model
          ? { model: policy.target.model }
          : {}),
      },
      false,
      inputChars,
      context,
      attachments,
      startedAt,
      Date.now(),
    ),
    usage: {},
    delivery: stream ? 'streamed' : 'buffered',
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

/**
 * Executes the frozen Agent policy without silently changing privacy or
 * provider boundaries. Cloud-to-local fallback is opt-in and occurs only when
 * the configured cloud credential is absent; every result discloses the target
 * that actually received the prompt.
 */
export async function runAgentProviderPrompt(
  policy: AgentProviderPolicy,
  prompt: string,
  options: AgentProviderExecutionOptions = {},
): Promise<AgentProviderExecutionResult> {
  const context = options.context ?? [];
  const attachments = options.attachments ?? [];
  const privacy = evaluateAgentProviderPrivacy(policy, prompt, context, attachments);
  if (!privacy.allowed) {
    const code = privacy.reason === 'sensitive-context'
      ? 'sensitive-context'
      : privacy.reason === 'cloud-disabled'
        ? 'cloud-disabled'
        : 'input-budget';
    throw new AiProviderRuntimeError(`Agent provider request refused: ${privacy.reason ?? 'privacy policy'}.`, code);
  }

  if (policy.target.kind === 'local') {
    return runLocal(
      policy,
      prompt,
      privacy.context,
      privacy.attachments,
      privacy.inputChars,
      options,
    );
  }

  const runtime = agentCloudRuntimeOptions(policy);
  if (!runtime) throw new AiProviderRuntimeError('Cloud execution is disabled.', 'cloud-disabled');
  try {
    const result = await runCloudAiRequest({
      ...runtime,
      apiKey: options.apiKey,
      prompt,
      pricing: options.pricing,
      signal: options.signal,
      onEvent: options.onCloudEvent,
      onTextChunk: policy.streaming ? options.onTextChunk : undefined,
    });
    return {
      text: result.text,
      provider: disclosure(
        policy.target,
        true,
        privacy.inputChars,
        privacy.context,
        privacy.attachments,
        result.startedAt,
        result.completedAt,
        result.usage.estimatedCostUsd,
      ),
      usage: result.usage,
      delivery: result.delivery,
    };
  } catch (error) {
    if (
      error instanceof AiProviderRuntimeError
      && error.code === 'missing-credential'
      && options.allowLocalFallback
    ) {
      return runLocal(
        policy,
        prompt,
        privacy.context,
        privacy.attachments,
        privacy.inputChars,
        options,
        'missing-cloud-credential',
      );
    }
    throw error;
  }
}
