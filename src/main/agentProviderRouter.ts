import {
  evaluateAgentProviderPrivacy,
  type AgentAttachment,
  type AgentContextItem,
  type AgentProviderDisclosure,
  type AgentProviderPolicy,
  type AgentWorkspaceMode,
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
  /** The conversation's workflow preset. Absent or `ask` sends the prompt unchanged. */
  mode?: AgentWorkspaceMode;
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

/**
 * What each mode adds to the request.
 *
 * "Modes are lightweight workflow presets, not separate bots" — Track 3. So a
 * mode is one instruction folded into the prompt, not a second runtime, a second
 * history or a different provider. Everything else about the request is
 * unchanged by the mode.
 *
 * **`ask` deliberately has no preset.** It is the mode every conversation
 * normalizes to, so a preset here would be boilerplate on every request the app
 * has ever sent — paid for in tokens on the cloud path and in latency on the
 * local one. Its absence is also what makes this slice unable to regress the
 * existing default: an `ask` conversation sends exactly the bytes it sent
 * before.
 *
 * **These strings are not translated, and that is on purpose.** They are
 * instructions to a model, not app chrome, so they follow the same rule as study
 * content in `CLAUDE.md`'s i18n scope section. The mode's *label* in the picker
 * is chrome and is translated; this is not.
 *
 * **Two of them state a limit rather than a capability.** This execution path
 * runs one prompt and returns text: there is no tool loop, so the agent cannot
 * open a window and cannot run an automation. `navigate` and `automate` are
 * exactly the modes whose names imply otherwise, so each says plainly what it
 * cannot do. Track 3 requires that the Agent "never claim an action completed
 * when only a plan was generated", and a preset that let the model narrate
 * having opened a surface would be that claim, produced by us rather than by it.
 */
const MODE_PRESETS: Partial<Record<AgentWorkspaceMode, string>> = {
  navigate: 'Answer as Study OS navigation help. Name the exact app, page and control the user needs, and give the steps to reach it in order. You cannot open surfaces yourself, so describe the route rather than claiming to have opened anything.',
  study: 'Answer as a Japanese study assistant. Explain the language in the material — readings, grammar and usage — and keep explanations concrete enough to act on rather than general advice.',
  analyze: 'Break the material down before answering: identify its parts, what each one does, and only then give the conclusion. Say which parts of the material you are drawing on, and say plainly when the material does not settle the question.',
  create: 'Produce the requested material itself rather than describing how it might be written. Match any format, length or style the request names, and mark anything you had to invent where the request left it unspecified.',
  automate: 'Produce a numbered plan the user can carry out, with each step naming the surface it happens on and what a successful result looks like. You cannot execute any of it, so write the plan as instructions for the user and never report a step as done.',
};

export function agentModePreset(mode: AgentWorkspaceMode | undefined): string {
  return (mode && MODE_PRESETS[mode]) || '';
}

/**
 * Assembles what the provider actually receives: the mode's preset, the user's
 * prompt, then the context shelf.
 *
 * The preset leads because it frames how the rest is read, and the context
 * trails for the reason it always has — it is reference material for the
 * question, not part of it. `inputChars` is measured on the result of this, so
 * the disclosure and the input-budget check both count the preset rather than
 * quietly excluding it.
 */
function promptWithContext(
  prompt: string,
  context: readonly AgentContextItem[],
  mode?: AgentWorkspaceMode,
): string {
  const preset = agentModePreset(mode);
  const head = preset ? `${preset}\n\n${prompt}` : prompt;
  if (context.length === 0) return head;
  const rows = context.map((item, index) => (
    `[Context ${index + 1}: ${item.label}]\n${item.preview}`
  ));
  return `${head}\n\nSelected Study OS context:\n${rows.join('\n\n')}`;
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
  const providerPrompt = promptWithContext(prompt, privacy.context, options.mode);
  if (providerPrompt.length > policy.maxInputChars) {
    throw new AiProviderRuntimeError(
      'Agent provider request exceeds the configured input budget.',
      'input-budget',
    );
  }
  const inputChars = providerPrompt.length;

  if (policy.target.kind === 'local') {
    return runLocal(
      policy,
      providerPrompt,
      privacy.context,
      privacy.attachments,
      inputChars,
      options,
    );
  }

  const runtime = agentCloudRuntimeOptions(policy);
  if (!runtime) throw new AiProviderRuntimeError('Cloud execution is disabled.', 'cloud-disabled');
  try {
    const result = await runCloudAiRequest({
      ...runtime,
      apiKey: options.apiKey,
      prompt: providerPrompt,
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
        inputChars,
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
        providerPrompt,
        privacy.context,
        privacy.attachments,
        inputChars,
        options,
        'missing-cloud-credential',
      );
    }
    throw error;
  }
}
