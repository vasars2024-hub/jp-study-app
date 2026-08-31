import type { AiProviderId } from './aiProviders';
import type { AgentProviderPrice } from './agentProviderPricing';

export const AGENT_WORKSPACE_SCHEMA_VERSION = 1 as const;

export type AgentWorkspaceMode = 'ask' | 'navigate' | 'study' | 'analyze' | 'create' | 'automate';

/**
 * Main-owned location of the persisted workspace document, relative to
 * Electron userData. Consumers that only index the store must share this
 * contract with its writer instead of guessing a second filename.
 */
export const AGENT_WORKSPACE_RELATIVE_PATH = ['agent', 'workspace-v1.json'] as const;

export interface AgentReusablePrompt {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}
export type AgentMessageRole = 'user' | 'assistant' | 'tool' | 'system';
export type AgentMessageStatus = 'pending' | 'streaming' | 'complete' | 'failed' | 'cancelled';
export type AgentSensitivity = 'ordinary' | 'personal' | 'sensitive';
export type AgentContextKind =
  | 'route'
  | 'selected-text'
  | 'dictionary-entry'
  | 'reading-passage'
  | 'media-cue'
  | 'study-session'
  | 'saved-words'
  | 'file';

export interface AgentContextSource {
  app: string;
  route?: string;
  entityId?: string;
  /** Exact control coordinate for a guided route, when the surface exposes one. */
  controlId?: string;
  /** Guided controls are only actionable when the surface can visibly identify them. */
  highlight?: true;
}

export interface AgentContextItem {
  id: string;
  kind: AgentContextKind;
  label: string;
  preview: string;
  source: AgentContextSource;
  sensitivity: AgentSensitivity;
  retained: boolean;
  createdAt: number;
}

export type AgentAttachmentKind = 'text' | 'image' | 'document' | 'audio' | 'video' | 'other';

export interface AgentAttachment {
  id: string;
  kind: AgentAttachmentKind;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  localPath?: string;
  sensitivity: AgentSensitivity;
  retained: boolean;
}

export type AgentProviderTarget =
  | { kind: 'local'; backend: 'local-qwen'; model?: string }
  | { kind: 'cloud'; providerId: AiProviderId; model?: string };

/**
 * The most prior turns any request may replay, whatever a policy asks for.
 *
 * The router owned this number privately. It is shared now because the
 * retained-chat control has to describe the ceiling it is narrowing, and a
 * second hand-written 12 in the settings module is the thing that would drift.
 */
export const AGENT_HISTORY_TURN_CEILING = 12;

export interface AgentProviderPolicy {
  target: AgentProviderTarget;
  allowCloud: boolean;
  /**
   * Persistent privacy floor. Absent is treated as enabled for callers written
   * before the setting existed. It outranks per-request consent by removing
   * sensitive material before `allowSensitiveContext` is evaluated.
   */
  excludeSensitiveContext?: boolean;
  allowSensitiveContext: boolean;
  maxInputChars: number;
  maxOutputTokens: number;
  maxEstimatedCostUsd?: number;
  /**
   * The user's retained-chat policy: how many prior turns this request may
   * replay to the provider. Absent means the user expressed no policy and the
   * built-in ceiling applies.
   *
   * **It can only narrow.** The router takes the LOWER of this and
   * `AGENT_HISTORY_TURN_CEILING`, so a renderer — or anything that reaches the
   * IPC surface — cannot use a privacy control as a way to send *more* of the
   * conversation than the app has ever sent.
   */
  historyTurns?: number;
  /**
   * The user's own per-million-token rates for this target. Absent for a local
   * target and for a cloud target the user has not priced; `maxEstimatedCostUsd`
   * is dropped alongside it, because a cap that can never be evaluated is a
   * control that claims to protect a budget it does not read.
   */
  pricing?: AgentProviderPrice;
  cache: 'off' | 'session' | 'persistent';
  retryAttempts: number;
  timeoutMs: number;
  streaming: boolean;
}

export interface AgentProviderDisclosure {
  target: AgentProviderTarget;
  cloud: boolean;
  contextIds: string[];
  attachmentIds: string[];
  /** Prior persisted turns included in this provider request, in sent order. */
  historyMessageIds?: string[];
  inputChars: number;
  startedAt: number;
  completedAt?: number;
  estimatedCostUsd?: number;
}

export type AgentNavigationEffect = {
  type: 'navigate';
  section: string;
  page?: string;
  controlId?: string;
  highlight?: boolean;
  /**
   * The question this destination was looked up from, for a card that has no
   * route context to re-derive against. Present only on an index-resolved
   * suggestion; `resolveAgentNavigation` re-runs the lookup on it and refuses
   * unless the static index still answers with these exact coordinates.
   */
  query?: string;
};

export type AgentResultEffect =
  | AgentNavigationEffect
  | { type: 'open-context'; contextId: string }
  | { type: 'approve-step'; taskId: string; stepId: string }
  | { type: 'undo'; operationId: string }
  | { type: 'save'; entityType: string; entityId: string };

export interface AgentResultCardAction {
  id: string;
  label: string;
  effect: AgentResultEffect;
  destructive?: boolean;
}

export interface AgentResultCard {
  id: string;
  kind: 'navigation' | 'dictionary' | 'reading' | 'media' | 'flashcards' | 'plan' | 'generic';
  title: string;
  summary?: string;
  sourceContextIds: string[];
  actions: AgentResultCardAction[];
}

/**
 * Whether a card's provenance is the question it stores rather than the shelf.
 *
 * Retention normally drops a card the moment one of its source context items
 * goes, because a card's title and summary can repeat that item's material and
 * would otherwise outlive it. An index-resolved navigation card has no such
 * material: its text is the user's own prompt, already persisted verbatim as the
 * message above it, and its destination is re-derived from a static table rather
 * than from anything that can be removed.
 *
 * Deliberately all-or-nothing. A card mixing a query action with any other kind
 * fails this and falls back to the ordinary provenance rule, so this cannot
 * become a way to keep an unrelated derived card alive.
 */
export function isAgentQueryProvenancedCard(card: AgentResultCard): boolean {
  if (card.sourceContextIds.length > 0 || card.actions.length === 0) return false;
  return card.actions.every((action) => (
    action.effect.type === 'navigate' && Boolean(action.effect.query)
  ));
}

export interface AgentMessage {
  id: string;
  conversationId: string;
  role: AgentMessageRole;
  status: AgentMessageStatus;
  text: string;
  createdAt: number;
  updatedAt: number;
  contextIds: string[];
  attachments: AgentAttachment[];
  cards: AgentResultCard[];
  provider?: AgentProviderDisclosure;
  error?: string;
}

export interface AgentConversation {
  id: string;
  title: string;
  mode: AgentWorkspaceMode;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  context: AgentContextItem[];
  messages: AgentMessage[];
}

export interface AgentWorkspaceState {
  version: typeof AGENT_WORKSPACE_SCHEMA_VERSION;
  /**
   * Monotonic compare-and-swap token owned by the main-process store.
   * Renderers return the revision they read; a stale whole-document save is
   * refused instead of erasing a newer message, context hand-off or window edit.
   */
  revision: number;
  activeConversationId: string | null;
  conversations: AgentConversation[];
  /**
   * User-authored composer presets. Optional keeps schema-v1 documents and
   * hand-built test fixtures source-compatible; normalization preserves the
   * field whenever a producer supplies it.
   */
  prompts?: AgentReusablePrompt[];
}

export interface AgentCardActionCoordinate {
  message: AgentMessage;
  card: AgentResultCard;
  action: AgentResultCardAction;
}

/**
 * Finds one persisted interactive coordinate only when every id is unique in
 * its own scope. Runtime state normally crossed the normalizer below, but the
 * gates are public pure functions and also receive hand-built typed state from
 * tests and future producers. A chained `find` would let array order choose
 * which duplicate effect executes; ambiguity is therefore the same as absence.
 */
export function findUnambiguousAgentCardAction(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
): AgentCardActionCoordinate | null {
  const messages = conversation.messages.filter((entry) => entry.id === messageId);
  if (messages.length !== 1) return null;
  const cards = messages[0].cards.filter((entry) => entry.id === cardId);
  if (cards.length !== 1) return null;
  const actions = cards[0].actions.filter((entry) => entry.id === actionId);
  if (actions.length !== 1) return null;
  return { message: messages[0], card: cards[0], action: actions[0] };
}

export interface AgentProviderPrivacyDecision {
  allowed: boolean;
  reason?: 'cloud-disabled' | 'sensitive-context' | 'input-budget';
  context: AgentContextItem[];
  attachments: AgentAttachment[];
  inputChars: number;
}

/**
 * The modes, in the order a picker offers them, with `ask` first because it is
 * the default every conversation normalizes to.
 *
 * Exported as an ordered list rather than left as a private `Set`: the shell's
 * picker, the prompt presets in `main/agentProviderRouter.ts` and this
 * normalizer must agree on exactly six modes, and a second hand-written list
 * would be the thing that silently drifts.
 */
export const AGENT_WORKSPACE_MODES: readonly AgentWorkspaceMode[] = [
  'ask',
  'navigate',
  'study',
  'analyze',
  'create',
  'automate',
];

const MODES = new Set<AgentWorkspaceMode>(AGENT_WORKSPACE_MODES);
const ROLES = new Set<AgentMessageRole>(['user', 'assistant', 'tool', 'system']);
const STATUSES = new Set<AgentMessageStatus>(['pending', 'streaming', 'complete', 'failed', 'cancelled']);
const SENSITIVITIES = new Set<AgentSensitivity>(['ordinary', 'personal', 'sensitive']);
const CONTEXT_KINDS = new Set<AgentContextKind>([
  'route',
  'selected-text',
  'dictionary-entry',
  'reading-passage',
  'media-cue',
  'study-session',
  'saved-words',
  'file',
]);
const ATTACHMENT_KINDS = new Set<AgentAttachmentKind>([
  'text', 'image', 'document', 'audio', 'video', 'other',
]);
const CLOUD_PROVIDERS = new Set<AiProviderId>([
  'gemini-2.5-flash', 'deepseek-v4-flash', 'deepseek-v4-pro',
]);
const CARD_KINDS = new Set<AgentResultCard['kind']>([
  'navigation', 'dictionary', 'reading', 'media', 'flashcards', 'plan', 'generic',
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function timestamp(value: unknown, fallback = Date.now()): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function stringList(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry, 240)).filter(Boolean))].slice(0, max);
}

function normalizeAttachment(value: unknown): AgentAttachment | null {
  const raw = record(value);
  const id = text(raw.id, 240);
  const name = text(raw.name, 500);
  if (!id || !name) return null;
  const kind = ATTACHMENT_KINDS.has(raw.kind as AgentAttachmentKind)
    ? raw.kind as AgentAttachmentKind
    : 'other';
  const sensitivity = SENSITIVITIES.has(raw.sensitivity as AgentSensitivity)
    ? raw.sensitivity as AgentSensitivity
    : 'sensitive';
  const sizeBytes = typeof raw.sizeBytes === 'number' && Number.isFinite(raw.sizeBytes)
    ? Math.max(0, Math.round(raw.sizeBytes))
    : undefined;
  return {
    id,
    kind,
    name,
    ...(text(raw.mimeType, 200) ? { mimeType: text(raw.mimeType, 200) } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(text(raw.localPath, 2_000) ? { localPath: text(raw.localPath, 2_000) } : {}),
    sensitivity,
    retained: raw.retained === true,
  };
}

function normalizeContext(value: unknown): AgentContextItem | null {
  const raw = record(value);
  const id = text(raw.id, 240);
  const label = text(raw.label, 500);
  if (!id || !label || !CONTEXT_KINDS.has(raw.kind as AgentContextKind)) return null;
  const source = record(raw.source);
  const app = text(source.app, 120);
  if (!app) return null;
  return {
    id,
    kind: raw.kind as AgentContextKind,
    label,
    preview: text(raw.preview, 8_000),
    source: {
      app,
      ...(text(source.route, 500) ? { route: text(source.route, 500) } : {}),
      ...(text(source.entityId, 500) ? { entityId: text(source.entityId, 500) } : {}),
      ...(text(source.controlId, 240) ? { controlId: text(source.controlId, 240) } : {}),
      ...(source.highlight === true ? { highlight: true as const } : {}),
    },
    sensitivity: SENSITIVITIES.has(raw.sensitivity as AgentSensitivity)
      ? raw.sensitivity as AgentSensitivity
      : 'sensitive',
    retained: raw.retained === true,
    createdAt: timestamp(raw.createdAt),
  };
}

function normalizeProviderTarget(value: unknown): AgentProviderTarget | null {
  const raw = record(value);
  if (raw.kind === 'local' && raw.backend === 'local-qwen') {
    return {
      kind: 'local',
      backend: 'local-qwen',
      ...(text(raw.model, 240) ? { model: text(raw.model, 240) } : {}),
    };
  }
  if (raw.kind === 'cloud' && CLOUD_PROVIDERS.has(raw.providerId as AiProviderId)) {
    return {
      kind: 'cloud',
      providerId: raw.providerId as AiProviderId,
      ...(text(raw.model, 240) ? { model: text(raw.model, 240) } : {}),
    };
  }
  return null;
}

function normalizeProviderDisclosure(value: unknown): AgentProviderDisclosure | null {
  const raw = record(value);
  const target = normalizeProviderTarget(raw.target);
  if (!target) return null;
  const startedAt = timestamp(raw.startedAt);
  const estimatedCostUsd = typeof raw.estimatedCostUsd === 'number'
    && Number.isFinite(raw.estimatedCostUsd)
    && raw.estimatedCostUsd >= 0
    ? raw.estimatedCostUsd
    : undefined;
  return {
    target,
    cloud: target.kind === 'cloud',
    contextIds: stringList(raw.contextIds),
    attachmentIds: stringList(raw.attachmentIds, 50),
    historyMessageIds: stringList(raw.historyMessageIds, 50),
    inputChars: typeof raw.inputChars === 'number' && Number.isFinite(raw.inputChars)
      ? Math.max(0, Math.round(raw.inputChars))
      : 0,
    startedAt,
    ...(typeof raw.completedAt === 'number' ? { completedAt: timestamp(raw.completedAt, startedAt) } : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
  };
}

function normalizeEffect(value: unknown): AgentResultEffect | null {
  const raw = record(value);
  if (raw.type === 'navigate') {
    const section = text(raw.section, 120);
    if (!section) return null;
    return {
      type: 'navigate',
      section,
      ...(text(raw.page, 240) ? { page: text(raw.page, 240) } : {}),
      ...(text(raw.controlId, 240) ? { controlId: text(raw.controlId, 240) } : {}),
      ...(raw.highlight === true ? { highlight: true } : {}),
      ...(text(raw.query, 400) ? { query: text(raw.query, 400) } : {}),
    };
  }
  if (raw.type === 'open-context' && text(raw.contextId, 240)) {
    return { type: 'open-context', contextId: text(raw.contextId, 240) };
  }
  if (raw.type === 'approve-step' && text(raw.taskId, 240) && text(raw.stepId, 240)) {
    return { type: 'approve-step', taskId: text(raw.taskId, 240), stepId: text(raw.stepId, 240) };
  }
  if (raw.type === 'undo' && text(raw.operationId, 240)) {
    return { type: 'undo', operationId: text(raw.operationId, 240) };
  }
  if (raw.type === 'save' && text(raw.entityType, 120) && text(raw.entityId, 240)) {
    return {
      type: 'save',
      entityType: text(raw.entityType, 120),
      entityId: text(raw.entityId, 240),
    };
  }
  return null;
}

/** Remove every member of an ambiguous normalized-id group, not just later ones. */
function unambiguousIdEntries<T extends { id: string }>(entries: readonly T[]): T[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  return entries.filter((entry) => counts.get(entry.id) === 1);
}

function normalizeCard(value: unknown): AgentResultCard | null {
  const raw = record(value);
  const id = text(raw.id, 240);
  const title = text(raw.title, 500);
  if (!id || !title) return null;
  const actions: AgentResultCardAction[] = [];
  for (const value_ of Array.isArray(raw.actions) ? raw.actions : []) {
    const action = record(value_);
    const effect = normalizeEffect(action.effect);
    const actionId = text(action.id, 240);
    const label = text(action.label, 240);
    if (!effect || !actionId || !label) continue;
    actions.push({
      id: actionId,
      label,
      effect,
      ...(action.destructive === true ? { destructive: true } : {}),
    });
    if (actions.length >= 20) break;
  }
  return {
    id,
    kind: CARD_KINDS.has(raw.kind as AgentResultCard['kind'])
      ? raw.kind as AgentResultCard['kind']
      : 'generic',
    title,
    ...(text(raw.summary, 8_000) ? { summary: text(raw.summary, 8_000) } : {}),
    sourceContextIds: stringList(raw.sourceContextIds),
    actions: unambiguousIdEntries(actions),
  };
}

function normalizeMessage(value: unknown, conversationId: string): AgentMessage | null {
  const raw = record(value);
  const id = text(raw.id, 240);
  if (!id || !ROLES.has(raw.role as AgentMessageRole)) return null;
  const createdAt = timestamp(raw.createdAt);
  const provider = normalizeProviderDisclosure(raw.provider);
  const attachments = (Array.isArray(raw.attachments) ? raw.attachments : [])
    .map(normalizeAttachment)
    .filter((entry): entry is AgentAttachment => entry !== null)
    .slice(0, 50);
  const cards = (Array.isArray(raw.cards) ? raw.cards : [])
    .map(normalizeCard)
    .filter((entry): entry is AgentResultCard => entry !== null)
    .slice(0, 100);
  return {
    id,
    conversationId,
    role: raw.role as AgentMessageRole,
    status: STATUSES.has(raw.status as AgentMessageStatus)
      ? raw.status as AgentMessageStatus
      : 'complete',
    text: text(raw.text, 200_000),
    createdAt,
    updatedAt: timestamp(raw.updatedAt, createdAt),
    contextIds: stringList(raw.contextIds),
    attachments,
    cards: unambiguousIdEntries(cards),
    ...(provider ? { provider } : {}),
    ...(text(raw.error, 2_000) ? { error: text(raw.error, 2_000) } : {}),
  };
}

function normalizeConversation(value: unknown): AgentConversation | null {
  const raw = record(value);
  const id = text(raw.id, 240);
  if (!id) return null;
  const createdAt = timestamp(raw.createdAt);
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .map((message) => normalizeMessage(message, id))
    .filter((entry): entry is AgentMessage => entry !== null)
    .slice(-2_000);
  return {
    id,
    title: text(raw.title, 500) || 'Conversation',
    mode: MODES.has(raw.mode as AgentWorkspaceMode) ? raw.mode as AgentWorkspaceMode : 'ask',
    createdAt,
    updatedAt: timestamp(raw.updatedAt, createdAt),
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    context: (Array.isArray(raw.context) ? raw.context : [])
      .map(normalizeContext)
      .filter((entry): entry is AgentContextItem => entry !== null)
      .slice(0, 100),
    messages: unambiguousIdEntries(messages),
  };
}

function normalizeReusablePrompt(value: unknown): AgentReusablePrompt | null {
  const raw = record(value);
  const id = text(raw.id, 240);
  const title = text(raw.title, 120);
  const promptText = text(raw.text, 12_000);
  if (!id || !title || !promptText) return null;
  const createdAt = timestamp(raw.createdAt);
  return {
    id,
    title,
    text: promptText,
    createdAt,
    updatedAt: timestamp(raw.updatedAt, createdAt),
  };
}

export function emptyAgentWorkspaceState(): AgentWorkspaceState {
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    revision: 0,
    activeConversationId: null,
    conversations: [],
  };
}

/** Normalizes persisted renderer/main input and rejects unknown future schemas. */
export function normalizeAgentWorkspaceState(value: unknown): AgentWorkspaceState {
  const raw = record(value);
  if (raw.version !== AGENT_WORKSPACE_SCHEMA_VERSION) return emptyAgentWorkspaceState();
  const conversations = (Array.isArray(raw.conversations) ? raw.conversations : [])
    .map(normalizeConversation)
    .filter((entry): entry is AgentConversation => entry !== null)
    .slice(0, 500);
  const active = text(raw.activeConversationId, 240);
  const prompts = Array.isArray(raw.prompts)
    ? unambiguousIdEntries(raw.prompts
      .map(normalizeReusablePrompt)
      .filter((entry): entry is AgentReusablePrompt => entry !== null)
      .slice(0, 100))
    : undefined;
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    revision: typeof raw.revision === 'number' && Number.isFinite(raw.revision)
      ? Math.max(0, Math.floor(raw.revision))
      : 0,
    activeConversationId: active && conversations.some((entry) => entry.id === active) ? active : null,
    conversations,
    ...(prompts ? { prompts } : {}),
  };
}

/**
 * An item is worth disclosing when it carries something the model can act on.
 * For most kinds that is the preview text. A `route` names *where the user is*
 * and has no content to preview by construction — filtering on preview alone
 * dropped every place item before the provider ever saw it, so the navigation
 * card the shelf existed to enable could never be produced.
 */
function carriesDisclosableContext(entry: AgentContextItem): boolean {
  if (entry.kind === 'route') return entry.label.length > 0;
  return entry.preview.length > 0;
}

/**
 * Applies the cloud/local boundary before a provider sees context. Sensitive
 * inputs default to denied, and an over-budget request is never silently cut.
 */
export function evaluateAgentProviderPrivacy(
  policy: AgentProviderPolicy,
  prompt: string,
  context: readonly AgentContextItem[],
  attachments: readonly AgentAttachment[],
): AgentProviderPrivacyDecision {
  const cloud = policy.target.kind === 'cloud';
  const excludeSensitiveContext = cloud && policy.excludeSensitiveContext !== false;
  const selectedContext = context.filter((entry) => (
    carriesDisclosableContext(entry)
    && (!excludeSensitiveContext || entry.sensitivity !== 'sensitive')
  ));
  const selectedAttachments = attachments.filter((entry) => (
    !excludeSensitiveContext || entry.sensitivity !== 'sensitive'
  ));
  const inputChars = prompt.length
    + selectedContext.reduce((sum, entry) => sum + entry.preview.length, 0);

  if (cloud && !policy.allowCloud) {
    return { allowed: false, reason: 'cloud-disabled', context: [], attachments: [], inputChars };
  }
  if (
    cloud
    && !policy.allowSensitiveContext
    && [...selectedContext, ...selectedAttachments].some((entry) => entry.sensitivity === 'sensitive')
  ) {
    return { allowed: false, reason: 'sensitive-context', context: [], attachments: [], inputChars };
  }
  if (inputChars > policy.maxInputChars) {
    return { allowed: false, reason: 'input-budget', context: [], attachments: [], inputChars };
  }
  return {
    allowed: true,
    context: selectedContext,
    attachments: selectedAttachments,
    inputChars,
  };
}
