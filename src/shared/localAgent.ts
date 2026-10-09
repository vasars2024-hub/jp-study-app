export type AgentPermissionLevel = 'read-only' | 'limited-actions' | 'full-automation';

export type AgentToolId =
  | 'media'
  | 'anime'
  | 'visual-novel'
  | 'flashcard'
  | 'study'
  | 'dictionary'
  | 'calendar'
  | 'settings';

export type AgentConfirmationReason =
  | 'delete-data'
  | 'external-connection'
  | 'organize-files'
  | 'major-change';

export type AgentToolOperationId =
  | 'media.search'
  | 'media.add-item'
  | 'media.analyze-subtitles'
  | 'media.generate-profile'
  | 'media.organize-files'
  | 'media.delete-item'
  | 'anime.search'
  | 'anime.track'
  | 'anime.check-releases'
  | 'anime.update-metadata'
  | 'anime.analyze-difficulty'
  | 'anime.fetch-external-metadata'
  | 'visual-novel.search'
  | 'visual-novel.add'
  | 'visual-novel.track-route'
  | 'visual-novel.extract-text'
  | 'visual-novel.generate-vocabulary'
  | 'flashcard.list-decks'
  | 'flashcard.create-deck'
  | 'flashcard.add-cards'
  | 'flashcard.delete-cards'
  | 'flashcard.modify-cards'
  | 'flashcard.schedule-reviews'
  | 'flashcard.delete-deck'
  | 'flashcard.list-card-presets'
  | 'flashcard.generate-cards'
  | 'study.get-context'
  | 'study.list-opportunities'
  | 'study.prepare-media'
  | 'study.filter-vocabulary'
  | 'study.undo-filter'
  | 'study.preview-cards'
  | 'study.create-cards'
  | 'study.preview-anki'
  | 'study.export-anki'
  | 'study.resume-session'
  | 'study.open-context'
  | 'study.stats-summary'
  | 'study.known-words'
  | 'study.recommend-next'
  | 'study.cards-from-text'
  | 'study.quiz-mined-today'
  | 'study.plan-week'
  | 'dictionary.lookup'
  | 'dictionary.explain-grammar'
  | 'dictionary.analyze-sentence'
  | 'dictionary.search-knowledge'
  | 'calendar.list'
  | 'calendar.schedule-session'
  | 'calendar.schedule-sessions'
  | 'calendar.create-reminder'
  | 'calendar.delete-event'
  | 'settings.read'
  | 'settings.change-preference'
  | 'settings.configure-module'
  | 'settings.reset'
  | 'settings.preview-theme'
  | 'settings.apply-theme'
  | 'settings.reset-theme'
  | 'settings.undo-theme'
  | 'settings.preview-css'
  | 'settings.apply-css'
  | 'settings.reset-css';

export interface AgentToolOperationDefinition {
  id: AgentToolOperationId;
  tool: AgentToolId;
  label: string;
  minimumPermission: AgentPermissionLevel;
  confirmation?: AgentConfirmationReason;
  /**
   * The argument names the installed adapter cannot run without. An empty list means the
   * operation is runnable with `{}` — either it reads no arguments at all, or every argument
   * it reads is optional.
   *
   * This exists because Phase 7's plan parser had no way to tell those apart. It demanded an
   * `arguments` object from EVERY step and threw the whole plan away when one was missing,
   * so a local model that omitted the field for `flashcard.list-decks` — an operation whose
   * handler is `() => ({ folders: loadDeckFolders(), … })` and reads nothing — took the plan
   * down with a message about a field the operation does not use (slice 53, 6 live rejections
   * out of 6 across two zero-argument operations).
   *
   * It is a RUNNABILITY contract, not an authorization one. Nothing here can make an operation
   * available that `evaluateAgentToolAccess` would refuse; it only decides whether a step that
   * has ALREADY cleared authorization is complete enough to run. Every entry below is read off
   * the adapter that actually executes it (`BlancReadyToolPanels.tsx` `handlers`,
   * `studyAgentHandlers.ts`) — an operation with no adapter installed declares none, because
   * inventing a contract for a handler that does not exist would be guessing.
   */
  requiredArguments: readonly string[];
  /**
   * What the OPTIONAL arguments mean, for the planning prompt.
   *
   * `requiredArguments` answers "is this step complete enough to run"; it says nothing about
   * the arguments an operation merely *accepts*. The prompt used to list only the operation id,
   * its label and its confirmation reason, so an argument that was not required was an argument
   * the model had no way to discover — it could route `flashcard.generate-cards` but not learn
   * that `source: 'book'` and a chapter range exist, which made a shipped capability
   * unreachable in practice.
   *
   * Same discipline as `REQUIRED_ARGUMENTS`: an entry is written only where the adapter that
   * executes it has actually been read. Inventing a hint would be worse than omitting one,
   * because the model believes it.
   */
  argumentHints?: Readonly<Record<string, string>>;
}

const REQUIRED_ARGUMENTS: Partial<Record<AgentToolOperationId, readonly string[]>> = {
  'media.add-item': ['paths'],
  'media.delete-item': ['id'],
  'flashcard.create-deck': ['name'],
  'flashcard.add-cards': ['cards'],
  'flashcard.delete-cards': ['ids'],
  'flashcard.modify-cards': ['id', 'patch'],
  'flashcard.delete-deck': ['name'],
  'study.prepare-media': ['mediaId'],
  'study.open-context': ['context'],
  'dictionary.lookup': ['term'],
  'dictionary.explain-grammar': ['term'],
  'dictionary.analyze-sentence': ['term'],
  'dictionary.search-knowledge': ['query'],
  'calendar.schedule-session': ['title', 'date'],
  'calendar.schedule-sessions': ['sessions'],
  'study.cards-from-text': ['text'],
  'calendar.create-reminder': ['title', 'date'],
  'calendar.delete-event': ['id'],
  'settings.change-preference': ['key', 'value'],
  'settings.configure-module': ['key', 'value'],
  'settings.preview-css': ['css'],
  'settings.apply-css': ['css'],
  'anime.track': ['identityId'],
  'anime.update-metadata': ['identityId'],
  'anime.analyze-difficulty': ['identityId'],
  'media.analyze-subtitles': ['id'],
  'media.generate-profile': ['id'],
  'media.organize-files': ['id', 'root'],
  'visual-novel.add': ['title'],
  'visual-novel.track-route': ['id', 'name'],
  'visual-novel.extract-text': ['id'],
  'visual-novel.generate-vocabulary': ['id'],
};

/**
 * Optional-argument documentation, read off the adapter in each case.
 *
 * Only `cardStudioAgentHandlers.ts` is covered so far, because it is the only adapter whose
 * every branch has been read end to end. The rest are absent rather than guessed — see
 * `AgentToolOperationDefinition.argumentHints`.
 */
const ARGUMENT_HINTS: Partial<Record<AgentToolOperationId, Readonly<Record<string, string>>>> = {
  'flashcard.generate-cards': {
    source:
      "'preset' invents new words; 'dictionary' uses the terms you pass or the user's starred words; 'book' mines a chapter range from a library EPUB. Defaults to 'preset'.",
    itemId: "Library item id of the EPUB. Required when source is 'book'.",
    chapterFrom:
      "First chapter, 1-based and inclusive. Omit both bounds to mine the whole book. Out-of-range values are clamped, not refused.",
    chapterTo: 'Last chapter, 1-based and inclusive. A single bound means that one chapter.',
    terms:
      "[{ term, reading, sentence }] to build cards from when source is 'dictionary'. Falls back to the user's starred words when omitted.",
    wordCount: "How many words to invent when source is 'preset'. Capped at 25.",
    cardCount: 'Cards per word. Capped at 10.',
    termLimit: "Most terms to enrich for a 'book' run. Capped at 25; each one is a paid call.",
    presetId: 'Preset id from flashcard.list-card-presets. Defaults to the saved preset.',
    formatId: 'Format id from flashcard.list-card-presets. Defaults to the saved format.',
  },
  'study.known-words': {
    word: 'A word to look up (any inflection; it is reduced to its dictionary form). Omit for counts only.',
  },
  'calendar.create-reminder': {
    reminder: "When to notify: 'at' (default), '5m', '15m', '30m', '1h', '1d' before, or 'none'.",
    startTime: 'HH:MM local time. Without it the reminder is all-day.',
  },
  'calendar.schedule-session': {
    reminder: "Optional notification: 'at', '5m', '15m', '30m', '1h', '1d' before. Default 'none'.",
  },
  'calendar.schedule-sessions': {
    sessions: '[{ title, date: YYYY-MM-DD, startTime: HH:MM, endTime: HH:MM }], up to 14. Usually the output of study.plan-week.',
  },
  'study.cards-from-text': {
    text: 'The study-language text to find unknown words in (up to 2000 characters).',
    limit: 'Most words to propose. Default 12, capped at 25.',
  },
  'study.plan-week': {
    startTime: "HH:MM to start each session. Default '19:00'.",
  },
  'dictionary.analyze-sentence': {
    term: 'One sentence in the study language.',
  },
  'dictionary.explain-grammar': {
    term: 'A grammar pattern (e.g. 〜ている) or a sentence that uses it.',
  },
};

const operation = (
  id: AgentToolOperationId,
  tool: AgentToolId,
  label: string,
  minimumPermission: AgentPermissionLevel,
  confirmation?: AgentConfirmationReason,
): AgentToolOperationDefinition => ({
  id,
  tool,
  label,
  minimumPermission,
  ...(confirmation ? { confirmation } : {}),
  ...(ARGUMENT_HINTS[id] ? { argumentHints: ARGUMENT_HINTS[id] } : {}),
  requiredArguments: REQUIRED_ARGUMENTS[id] ?? [],
});

export const AGENT_TOOL_OPERATIONS: readonly AgentToolOperationDefinition[] = [
  operation('media.search', 'media', 'Search media', 'read-only'),
  operation('media.add-item', 'media', 'Add a library item', 'limited-actions'),
  operation('media.analyze-subtitles', 'media', 'Analyze subtitles', 'limited-actions'),
  operation('media.generate-profile', 'media', 'Generate a media profile', 'limited-actions'),
  operation('media.organize-files', 'media', 'Organize media files', 'full-automation', 'organize-files'),
  operation('media.delete-item', 'media', 'Delete a media item', 'full-automation', 'delete-data'),
  operation('anime.search', 'anime', 'Search tracked anime', 'read-only'),
  operation('anime.track', 'anime', 'Track anime', 'limited-actions'),
  operation('anime.check-releases', 'anime', 'Check cached release data', 'read-only'),
  operation('anime.update-metadata', 'anime', 'Update anime metadata', 'limited-actions'),
  operation('anime.analyze-difficulty', 'anime', 'Analyze anime difficulty', 'limited-actions'),
  operation(
    'anime.fetch-external-metadata',
    'anime',
    'Fetch external anime metadata',
    'limited-actions',
    'external-connection',
  ),
  operation('visual-novel.search', 'visual-novel', 'Search visual novels', 'read-only'),
  operation('visual-novel.add', 'visual-novel', 'Add a visual novel', 'limited-actions'),
  operation('visual-novel.track-route', 'visual-novel', 'Track a visual novel route', 'limited-actions'),
  operation('visual-novel.extract-text', 'visual-novel', 'Extract visual novel text', 'limited-actions'),
  operation(
    'visual-novel.generate-vocabulary',
    'visual-novel',
    'Generate visual novel vocabulary',
    'limited-actions',
  ),
  operation('flashcard.list-decks', 'flashcard', 'List flashcard decks', 'read-only'),
  operation('flashcard.create-deck', 'flashcard', 'Create a flashcard deck', 'limited-actions'),
  operation('flashcard.add-cards', 'flashcard', 'Add flashcards', 'limited-actions'),
  operation('flashcard.delete-cards', 'flashcard', 'Delete flashcards', 'limited-actions', 'delete-data'),
  operation('flashcard.modify-cards', 'flashcard', 'Modify flashcards', 'limited-actions'),
  operation('flashcard.schedule-reviews', 'flashcard', 'Schedule reviews', 'limited-actions'),
  operation('flashcard.delete-deck', 'flashcard', 'Delete a flashcard deck', 'full-automation', 'delete-data'),
  operation('flashcard.list-card-presets', 'flashcard', 'List AI card presets', 'read-only'),
  // `external-connection` even though the local-qwen engine sends nothing outward:
  // the confirmation reason is a property of the OPERATION, not of the engine the
  // config happens to hold when the plan is built, and the engine can change
  // between planning and execution. The conservative reason is the only one that
  // is true in both states. Which provider actually received the text is reported
  // per run, in the adapter's `sentToProvider`.
  operation(
    'flashcard.generate-cards',
    'flashcard',
    'Generate AI cards',
    'limited-actions',
    'external-connection',
  ),
  operation('study.get-context', 'study', 'Read the active Study context', 'read-only'),
  operation('study.list-opportunities', 'study', 'List Study opportunities', 'read-only'),
  operation('study.prepare-media', 'study', 'Prepare media for Study Mode', 'limited-actions'),
  operation('study.filter-vocabulary', 'study', 'Filter a Study vocabulary set', 'limited-actions'),
  operation('study.undo-filter', 'study', 'Undo the last Study filter', 'limited-actions'),
  operation('study.preview-cards', 'study', 'Preview Study cards', 'read-only'),
  operation('study.create-cards', 'study', 'Create Study cards', 'full-automation', 'major-change'),
  operation('study.preview-anki', 'study', 'Preview an Anki export', 'read-only'),
  operation('study.export-anki', 'study', 'Export Study cards to Anki', 'full-automation', 'external-connection'),
  operation('study.resume-session', 'study', 'Resume a Study session', 'limited-actions'),
  operation('study.open-context', 'study', 'Open the media Study context', 'limited-actions'),
  operation('study.stats-summary', 'study', 'Read study statistics', 'read-only'),
  operation('study.known-words', 'study', 'Read known-word counts or one word\'s level', 'read-only'),
  operation('study.recommend-next', 'study', 'Recommend what to study now', 'read-only'),
  operation('study.cards-from-text', 'study', 'Find unknown words in a text to make cards', 'read-only'),
  operation('study.quiz-mined-today', 'study', 'Quiz the words mined today in the Game Arena', 'limited-actions'),
  operation('study.plan-week', 'study', 'Plan a week of study sessions', 'read-only'),
  operation('dictionary.lookup', 'dictionary', 'Look up a word', 'read-only'),
  operation('dictionary.explain-grammar', 'dictionary', 'Explain grammar', 'read-only'),
  operation('dictionary.analyze-sentence', 'dictionary', 'Analyze a sentence', 'read-only'),
  operation('dictionary.search-knowledge', 'dictionary', 'Search local knowledge', 'read-only'),
  operation('calendar.list', 'calendar', 'List calendar entries', 'read-only'),
  operation('calendar.schedule-session', 'calendar', 'Schedule a study session', 'limited-actions'),
  // Several events in one step: confirmed on its own, so a week of sessions is never added
  // by the same click that ran the step before it.
  operation('calendar.schedule-sessions', 'calendar', 'Schedule several study sessions', 'limited-actions', 'major-change'),
  operation('calendar.create-reminder', 'calendar', 'Create a reminder', 'limited-actions'),
  operation('calendar.delete-event', 'calendar', 'Delete a calendar event', 'full-automation', 'delete-data'),
  operation('settings.read', 'settings', 'Read settings', 'read-only'),
  operation(
    'settings.change-preference',
    'settings',
    'Change a preference',
    'full-automation',
    'major-change',
  ),
  operation(
    'settings.configure-module',
    'settings',
    'Configure a module',
    'full-automation',
    'major-change',
  ),
  operation('settings.reset', 'settings', 'Reset settings', 'full-automation', 'delete-data'),
  operation('settings.preview-theme', 'settings', 'Preview a safe theme', 'read-only'),
  operation('settings.apply-theme', 'settings', 'Apply a theme', 'full-automation', 'major-change'),
  operation('settings.reset-theme', 'settings', 'Reset the theme', 'full-automation', 'major-change'),
  operation('settings.undo-theme', 'settings', 'Undo the last theme change', 'full-automation', 'major-change'),
  operation('settings.preview-css', 'settings', 'Preview scoped custom CSS', 'read-only'),
  operation('settings.apply-css', 'settings', 'Apply scoped custom CSS', 'full-automation', 'major-change'),
  operation('settings.reset-css', 'settings', 'Reset custom CSS', 'full-automation', 'major-change'),
] as const;

const OPERATION_BY_ID = new Map(
  AGENT_TOOL_OPERATIONS.map((definition) => [definition.id, definition]),
);

export interface AgentToolRequest {
  callId: string;
  operation: AgentToolOperationId;
  arguments: Record<string, unknown>;
  confirmed?: boolean;
}

export type AgentAccessDecision =
  | { status: 'allowed'; definition: AgentToolOperationDefinition }
  | { status: 'confirmation-required'; definition: AgentToolOperationDefinition; reason: AgentConfirmationReason }
  | { status: 'denied'; reason: string };

const PERMISSION_RANK: Record<AgentPermissionLevel, number> = {
  'read-only': 0,
  'limited-actions': 1,
  'full-automation': 2,
};

/** The strictest level. What an unrecognised permission is worth, everywhere. */
export const STRICTEST_AGENT_PERMISSION: AgentPermissionLevel = 'read-only';

/**
 * Is this one of the three levels the product actually defines?
 *
 * The type says yes at every call site and means nothing at three of them: a profile
 * crossing IPC, a stored automation read back off disk, and settings sent by a renderer
 * are all `AgentPermissionLevel` by declaration and arbitrary strings in fact.
 */
export function isAgentPermissionLevel(value: unknown): value is AgentPermissionLevel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PERMISSION_RANK, value);
}

/**
 * Rank a permission level, resolving anything unrecognised to the strictest.
 *
 * The bare `PERMISSION_RANK[level]` lookup this replaces returned `undefined` for an
 * unknown level, and every comparison built on it then failed OPEN: `undefined < 0` is
 * `false`, so an authorization check read "has enough permission"; `0 <= undefined` is
 * also `false`, so a narrowing returned the *other* operand. Both inversions come from
 * the same `undefined`, which is why the ranking — not each call site — is what is fixed.
 */
export function agentPermissionRank(level: AgentPermissionLevel): number {
  return isAgentPermissionLevel(level) ? PERMISSION_RANK[level] : PERMISSION_RANK[STRICTEST_AGENT_PERMISSION];
}

export function getAgentToolOperation(
  id: AgentToolOperationId,
): AgentToolOperationDefinition | undefined {
  return OPERATION_BY_ID.get(id);
}

/** Present, and carrying something — an empty string or an empty list is a missing argument. */
function isSuppliedArgument(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Which of an operation's `requiredArguments` the given object does not supply.
 *
 * Runnability only — see `AgentToolOperationDefinition.requiredArguments`. Callers must have
 * cleared `evaluateAgentToolAccess` first; an empty result here means "complete enough to run",
 * never "permitted to run". An unknown operation returns no missing arguments precisely because
 * authorization, not this, is what refuses it.
 */
export function missingAgentToolArguments(
  operationId: AgentToolOperationId,
  arguments_: Readonly<Record<string, unknown>>,
): string[] {
  const definition = getAgentToolOperation(operationId);
  if (!definition) return [];
  return definition.requiredArguments.filter((name) => !isSuppliedArgument(arguments_[name]));
}

/**
 * The single authorization rule, applied at BOTH boundaries — planning and execution.
 *
 * `allowedOperations` is the active profile's `enabledOperations`. Until Phase 7 it was
 * checked only in `parseLocalAgentModelPlan`, i.e. once, at plan time. That is the wrong
 * boundary on its own: `AgentTask`s are persisted in `AgentTaskQueue` (up to 100 items, with
 * paused/resumed states), so a task planned while a profile enabled `flashcard.delete-deck`
 * stayed executable after the user removed that operation from the profile — the permission
 * LEVEL was re-checked at execution and the per-operation allow-list was not.
 *
 * Passing it here means the narrowing a user performs takes effect on work already queued,
 * and it means there is one rule rather than two that can drift apart. Omitting it keeps the
 * old behaviour for callers that genuinely have no profile (the global permission level is
 * then the only authority), which is why it is optional rather than required.
 */
export function evaluateAgentToolAccess(
  request: AgentToolRequest,
  permission: AgentPermissionLevel,
  allowedOperations?: readonly AgentToolOperationId[],
): AgentAccessDecision {
  const definition = getAgentToolOperation(request.operation);
  if (!definition) return { status: 'denied', reason: 'The requested operation is not approved.' };
  if (allowedOperations && !allowedOperations.includes(request.operation)) {
    return {
      status: 'denied',
      reason: `${definition.label} is not enabled for the active agent profile.`,
    };
  }
  // A level this build does not define is refused outright rather than ranked as strict.
  // Ranking it would be safe, but it would also be silent: the caller handed us a value
  // from outside the product's vocabulary, and saying so is the honest answer.
  if (!isAgentPermissionLevel(permission)) {
    return {
      status: 'denied',
      reason: `${definition.label} was requested at an unrecognized permission level.`,
    };
  }
  if (agentPermissionRank(permission) < agentPermissionRank(definition.minimumPermission)) {
    return {
      status: 'denied',
      reason: `${definition.label} requires ${definition.minimumPermission} permission.`,
    };
  }
  if (definition.confirmation && request.confirmed !== true) {
    return {
      status: 'confirmation-required',
      definition,
      reason: definition.confirmation,
    };
  }
  return { status: 'allowed', definition };
}

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting-confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentTaskStepStatus =
  | 'pending'
  | 'running'
  | 'waiting-confirmation'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface AgentTaskStep {
  id: string;
  label: string;
  request: AgentToolRequest;
  status: AgentTaskStepStatus;
  result?: unknown;
  error?: string;
}

export interface AgentTask {
  id: string;
  objective: string;
  status: AgentTaskStatus;
  steps: AgentTaskStep[];
  currentStepId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentTaskStepInput {
  id: string;
  label: string;
  request: AgentToolRequest;
}

const MAX_AGENT_STEPS = 32;
const MAX_TEXT_LENGTH = 500;
const MAX_ARGUMENT_BYTES = 64 * 1024;

function boundedText(value: string, field: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${field} is required.`);
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`${field} is too long.`);
  return text;
}

function validateRequest(request: AgentToolRequest): void {
  boundedText(request.callId, 'Tool call ID');
  if (!getAgentToolOperation(request.operation)) {
    throw new Error(`Unknown agent operation: ${request.operation as string}.`);
  }
  if (!request.arguments || Array.isArray(request.arguments) || typeof request.arguments !== 'object') {
    throw new Error('Tool arguments must be an object.');
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(request.arguments);
  } catch {
    throw new Error('Tool arguments must be serializable.');
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > MAX_ARGUMENT_BYTES) {
    throw new Error('Tool arguments are too large.');
  }
}

export function createAgentTask(
  id: string,
  objective: string,
  stepInputs: readonly AgentTaskStepInput[],
  now = Date.now(),
): AgentTask {
  const taskId = boundedText(id, 'Task ID');
  const taskObjective = boundedText(objective, 'Task objective');
  if (!stepInputs.length) throw new Error('An agent task needs at least one step.');
  if (stepInputs.length > MAX_AGENT_STEPS) {
    throw new Error(`An agent task cannot exceed ${MAX_AGENT_STEPS} steps.`);
  }
  const ids = new Set<string>();
  const callIds = new Set<string>();
  const steps = stepInputs.map((input) => {
    const stepId = boundedText(input.id, 'Step ID');
    if (ids.has(stepId)) throw new Error(`Duplicate agent step ID: ${stepId}.`);
    ids.add(stepId);
    validateRequest(input.request);
    if (callIds.has(input.request.callId)) {
      throw new Error(`Duplicate agent tool call ID: ${input.request.callId}.`);
    }
    callIds.add(input.request.callId);
    return {
      id: stepId,
      label: boundedText(input.label, 'Step label'),
      request: input.request,
      status: 'pending' as const,
    };
  });
  return {
    id: taskId,
    objective: taskObjective,
    status: 'queued',
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

export type AgentTaskEvent =
  | { type: 'start-step'; stepId: string }
  | { type: 'request-confirmation'; stepId: string }
  | { type: 'complete-step'; stepId: string; result?: unknown }
  | { type: 'fail-step'; stepId: string; error: string }
  | { type: 'cancel' };

export function updateAgentTask(
  task: AgentTask,
  event: AgentTaskEvent,
  now = Date.now(),
): AgentTask {
  if (['completed', 'failed', 'cancelled'].includes(task.status)) {
    throw new Error(`Cannot update a ${task.status} agent task.`);
  }
  if (event.type === 'cancel') {
    return {
      ...task,
      status: 'cancelled',
      currentStepId: undefined,
      steps: task.steps.map((step) =>
        step.status === 'pending' || step.status === 'waiting-confirmation'
          ? { ...step, status: 'skipped' }
          : step,
      ),
      updatedAt: now,
    };
  }
  const index = task.steps.findIndex((step) => step.id === event.stepId);
  if (index < 0) throw new Error(`Unknown agent step: ${event.stepId}.`);
  const step = task.steps[index];
  const steps = [...task.steps];
  if (event.type === 'start-step') {
    if (step.status !== 'pending' && step.status !== 'waiting-confirmation') {
      throw new Error(`Cannot start a ${step.status} step.`);
    }
    const earlierIncomplete = steps.slice(0, index).some((candidate) => candidate.status !== 'completed');
    if (earlierIncomplete) throw new Error('Agent steps must run in plan order.');
    if (task.currentStepId && task.currentStepId !== step.id) {
      throw new Error('Another agent step is already running.');
    }
    steps[index] = { ...step, status: 'running', error: undefined };
    return { ...task, status: 'running', currentStepId: step.id, steps, updatedAt: now };
  }
  if (event.type === 'request-confirmation') {
    if (step.status !== 'pending' && step.status !== 'running') {
      throw new Error(`A ${step.status} step cannot request confirmation.`);
    }
    steps[index] = { ...step, status: 'waiting-confirmation' };
    return {
      ...task,
      status: 'waiting-confirmation',
      currentStepId: step.id,
      steps,
      updatedAt: now,
    };
  }
  if (event.type === 'fail-step') {
    if (step.status !== 'running') throw new Error('Only a running step can fail.');
    steps[index] = {
      ...step,
      status: 'failed',
      error: boundedText(event.error, 'Step error'),
    };
    return { ...task, status: 'failed', currentStepId: undefined, steps, updatedAt: now };
  }
  if (step.status !== 'running') throw new Error('Only a running step can complete.');
  steps[index] = { ...step, status: 'completed', result: event.result, error: undefined };
  const completed = steps.every((candidate) => candidate.status === 'completed');
  return {
    ...task,
    status: completed ? 'completed' : 'running',
    currentStepId: undefined,
    steps,
    updatedAt: now,
  };
}

export type AgentToolHandler = (
  arguments_: Readonly<Record<string, unknown>>,
) => Promise<unknown> | unknown;

export type AgentToolHandlers = Partial<Record<AgentToolOperationId, AgentToolHandler>>;

export interface AgentExecutionEvent {
  type: 'tool-started' | 'confirmation-required' | 'tool-completed' | 'tool-failed';
  taskId: string;
  stepId: string;
  callId: string;
  operation: AgentToolOperationId;
  timestamp: number;
  durationMs?: number;
  confirmationReason?: AgentConfirmationReason;
  error?: string;
}

export interface AgentExecutionResult {
  task: AgentTask;
  events: AgentExecutionEvent[];
  /**
   * Authorization declined before the step started.
   *
   * This is deliberately not represented as a failed task. A queued plan can
   * outlive the profile that created it; narrowing that profile declines the
   * next attempted step, but it does not mean the tool ran and failed. Keeping
   * the original task and an empty event list also prevents a refusal from
   * manufacturing `tool-started` audit history.
   */
  refusal?: {
    code: 'operation-denied';
    reason: string;
  };
}

export interface AgentExecutionOptions {
  permission: AgentPermissionLevel;
  handlers: AgentToolHandlers;
  /**
   * The active profile's `enabledOperations`, re-checked HERE and not only at plan time.
   * A queued task outlives the profile that authorized it — see `evaluateAgentToolAccess`.
   */
  allowedOperations?: readonly AgentToolOperationId[];
  confirmedCallIds?: ReadonlySet<string>;
  now?: () => number;
}

export async function executeAgentTaskStep(
  task: AgentTask,
  stepId: string,
  options: AgentExecutionOptions,
): Promise<AgentExecutionResult> {
  const step = task.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Unknown agent step: ${stepId}.`);
  const now = options.now ?? Date.now;
  const request = {
    ...step.request,
    confirmed: options.confirmedCallIds?.has(step.request.callId) === true,
  };
  const access = evaluateAgentToolAccess(request, options.permission, options.allowedOperations);
  const eventBase = {
    taskId: task.id,
    stepId: step.id,
    callId: step.request.callId,
    operation: step.request.operation,
  };
  if (access.status === 'confirmation-required') {
    const updatedTask = step.status === 'waiting-confirmation'
      ? task
      : updateAgentTask(task, { type: 'request-confirmation', stepId }, now());
    return {
      task: updatedTask,
      events: [{
        ...eventBase,
        type: 'confirmation-required',
        confirmationReason: access.reason,
        timestamp: updatedTask.updatedAt,
      }],
    };
  }

  if (access.status === 'denied') {
    return {
      task,
      events: [],
      refusal: {
        code: 'operation-denied',
        reason: access.reason,
      },
    };
  }

  const startedAt = now();
  const runningTask = updateAgentTask(task, { type: 'start-step', stepId }, startedAt);
  const startedEvent: AgentExecutionEvent = {
    ...eventBase,
    type: 'tool-started',
    timestamp: startedAt,
  };
  const handler = options.handlers[step.request.operation];
  if (!handler) {
    const failedAt = now();
    const error = `No approved adapter is installed for ${step.request.operation}.`;
    return {
      task: updateAgentTask(
        runningTask,
        { type: 'fail-step', stepId, error },
        failedAt,
      ),
      events: [
        startedEvent,
        {
          ...eventBase,
          type: 'tool-failed',
          timestamp: failedAt,
          durationMs: Math.max(0, failedAt - startedAt),
          error,
        },
      ],
    };
  }

  try {
    const result = await handler(step.request.arguments);
    const completedAt = now();
    return {
      task: updateAgentTask(
        runningTask,
        { type: 'complete-step', stepId, result },
        completedAt,
      ),
      events: [
        startedEvent,
        {
          ...eventBase,
          type: 'tool-completed',
          timestamp: completedAt,
          durationMs: Math.max(0, completedAt - startedAt),
        },
      ],
    };
  } catch (error) {
    const failedAt = now();
    const message = error instanceof Error ? error.message : 'The approved tool failed.';
    return {
      task: updateAgentTask(
        runningTask,
        { type: 'fail-step', stepId, error: message },
        failedAt,
      ),
      events: [
        startedEvent,
        {
          ...eventBase,
          type: 'tool-failed',
          timestamp: failedAt,
          durationMs: Math.max(0, failedAt - startedAt),
          error: message,
        },
      ],
    };
  }
}
