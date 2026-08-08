import {
  AGENT_TOOL_OPERATIONS,
  createAgentTask,
  evaluateAgentToolAccess,
  missingAgentToolArguments,
  type AgentPermissionLevel,
  type AgentTask,
  type AgentToolOperationId,
} from './localAgent';
import type { AgentMemoryEntry } from './localAgentMemory';
import type { AgentProfile } from './localAgentProfiles';

export interface LocalAgentPromptContext {
  permission: AgentPermissionLevel;
  profile?: AgentProfile;
  availableOperations?: readonly AgentToolOperationId[];
  memories?: readonly AgentMemoryEntry[];
  applicationState?: Readonly<Record<string, unknown>>;
}

const MAX_PROMPT_CONTEXT_CHARACTERS = 16_000;
const MAX_MODEL_RESPONSE_CHARACTERS = 128_000;

function boundedJson(value: unknown, limit: number): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length <= limit
      ? serialized
      : `${serialized.slice(0, limit)}\n[context truncated]`;
  } catch {
    return '{}';
  }
}

export function selectLocalAgentApprovedOperations(
  context: LocalAgentPromptContext,
): AgentToolOperationId[] {
  const installed = context.availableOperations
    ? new Set(context.availableOperations)
    : null;
  return AGENT_TOOL_OPERATIONS.filter((definition) => {
    if (installed && !installed.has(definition.id)) return false;
    if (context.profile && !context.profile.enabledOperations.includes(definition.id)) return false;
    const access = evaluateAgentToolAccess({
      callId: 'prompt-capability-check',
      operation: definition.id,
      arguments: {},
      confirmed: true,
    }, context.permission);
    return access.status === 'allowed';
  }).map((definition) => definition.id);
}

export function buildLocalAgentSystemPrompt(context: LocalAgentPromptContext): string {
  const approved = new Set(selectLocalAgentApprovedOperations(context));
  const available = AGENT_TOOL_OPERATIONS.filter((definition) => approved.has(definition.id))
    .map((definition) => ({
    operation: definition.id,
    label: definition.label,
    confirmation: definition.confirmation ?? 'none',
    }));
  const promptContext = boundedJson({
    memories: context.memories ?? [],
    applicationState: context.applicationState ?? {},
  }, MAX_PROMPT_CONTEXT_CHARACTERS);
  return [
    'You are the offline planning model for Japanese Study OS.',
    'Return a concise plan, not hidden chain-of-thought. Never claim an action already happened.',
    'You cannot access files, databases, the network, or applications directly.',
    'Use only operation identifiers in the approved operations list below.',
    'Sensitive operations will be confirmed by the controller. Never invent confirmation.',
    'If the request cannot be completed with approved operations, return an empty steps array and explain why in summary.',
    'Return JSON only in this exact shape:',
    '{"summary":"short user-visible plan summary","steps":[{"label":"user-visible step","operation":"approved.operation","arguments":{}}]}',
    `Configured permission: ${context.permission}`,
    ...(context.profile ? [
      `Assistant profile: ${context.profile.name} (${context.profile.role})`,
      `Communication: ${context.profile.responseLength} responses, ${context.profile.explanationDepth} explanations, ${context.profile.language} language, ${context.profile.teachingStyle} teaching style, ${context.profile.correctionStyle} corrections`,
    ] : []),
    `Approved operations:\n${boundedJson(available, MAX_PROMPT_CONTEXT_CHARACTERS)}`,
    `Local context:\n${promptContext}`,
  ].join('\n\n');
}

interface RawModelStep {
  label?: unknown;
  operation?: unknown;
  arguments?: unknown;
}

interface RawModelPlan {
  summary?: unknown;
  steps?: unknown;
}

export interface ParsedLocalAgentPlan {
  summary: string;
  task: AgentTask | null;
}

function unwrapJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseLocalAgentModelPlan(
  response: string,
  taskId: string,
  objective: string,
  permission: AgentPermissionLevel,
  now = Date.now(),
  allowedOperations?: readonly AgentToolOperationId[],
): ParsedLocalAgentPlan {
  if (response.length > MAX_MODEL_RESPONSE_CHARACTERS) {
    throw new Error('The local model response is too large.');
  }
  let raw: RawModelPlan;
  try {
    raw = JSON.parse(unwrapJson(response)) as RawModelPlan;
  } catch {
    throw new Error('The local model returned invalid plan JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The local model plan must be an object.');
  }
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : '';
  if (!summary) throw new Error('The local model plan needs a summary.');
  if (!Array.isArray(raw.steps)) throw new Error('The local model plan needs a steps array.');
  if (!raw.steps.length) return { summary, task: null };
  const steps = raw.steps.map((rawStep, index) => {
    if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) {
      throw new Error(`Local model step ${index + 1} is invalid.`);
    }
    const step = rawStep as RawModelStep;
    const operation = typeof step.operation === 'string'
      ? step.operation as AgentToolOperationId
      : '' as AgentToolOperationId;
    // One rule, not two. `evaluateAgentToolAccess` takes the profile allow-list itself now,
    // so plan time and execution time cannot drift apart — which they had, with the allow-list
    // enforced only here and the persisted task carrying its authorization past a profile edit.
    const access = evaluateAgentToolAccess({
      callId: `${taskId}-call-${index + 1}`,
      operation,
      arguments: {},
      confirmed: true,
    }, permission, allowedOperations);
    if (access.status !== 'allowed') {
      throw new Error(`Local model step ${index + 1} requested an unavailable operation.`);
    }
    // Two different questions, which used to be one. Authorization is settled above and is not
    // reopened here; what is left is whether the step is COMPLETE — and that depends on the
    // operation, which is why the old unconditional demand for an `arguments` object was wrong.
    // A 1.7B model omits the field precisely when the operation needs nothing (6 live rejections
    // out of 6 on `flashcard.list-decks` and `calendar.list`, slice 53), so for a zero-argument
    // operation an absent `arguments` is not a defect in the plan — it is the plan.
    //
    // `null` counts as absent: a model that writes it is saying the same thing as one that omits
    // the key. A string, a number or an ARRAY does not — that is a structurally different plan,
    // and quietly replacing it with `{}` would discard arguments the model did mean to pass.
    const supplied = step.arguments;
    if (supplied !== undefined && supplied !== null
      && (typeof supplied !== 'object' || Array.isArray(supplied))) {
      throw new Error(`Local model step ${index + 1} needs an arguments object.`);
    }
    const stepArguments = (supplied ?? {}) as Record<string, unknown>;
    // The other half of the rule: defaulting to `{}` for an operation that DOES take arguments
    // would trade a plan-time refusal for a handler-time one. Slice 53 watched that happen live —
    // `dictionary.search-knowledge` parsed with an empty `arguments:{}` and died in its own
    // adapter with `The operation needs query.` Refuse it here, and name the field.
    const missing = missingAgentToolArguments(operation, stepArguments);
    if (missing.length) {
      // The operation is named here and deliberately NOT in the `unavailable operation` message
      // above: this one has already been authorized, so naming it costs nothing and tells the
      // user which field to supply, while the other would echo a denied operation back.
      throw new Error(
        `Local model step ${index + 1} (${operation}) needs a ${missing.join(' and a ')} argument.`,
      );
    }
    return {
      id: `${taskId}-step-${index + 1}`,
      label: typeof step.label === 'string' ? step.label : '',
      request: {
        callId: `${taskId}-call-${index + 1}`,
        operation,
        arguments: stepArguments,
      },
    };
  });
  return {
    summary,
    task: createAgentTask(taskId, objective, steps, now),
  };
}
