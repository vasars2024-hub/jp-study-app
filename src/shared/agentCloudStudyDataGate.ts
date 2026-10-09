import type { AgentToolOperationId } from './localAgent';

/**
 * Whether the cloud planner may see the tools that read the user's study data.
 *
 * `unset` is the state before the user has answered the one-time notice. It is
 * treated exactly like `local-only`: nothing about study statistics, known
 * words or library titles leaves the machine until the user says so.
 */
export type AgentCloudShareStudyData = 'unset' | 'allow' | 'local-only';

export const AGENT_CLOUD_SHARE_STUDY_DATA_VALUES: readonly AgentCloudShareStudyData[] = [
  'unset',
  'allow',
  'local-only',
];

/**
 * The read-only tools whose output is the user's own study record: statistics
 * (which also carry recent book titles), known-word counts and levels, and the
 * knowledge search over the deck, library and media titles.
 */
export const AGENT_STUDY_DATA_OPERATIONS: ReadonlySet<AgentToolOperationId> = new Set<AgentToolOperationId>([
  'study.stats-summary',
  'study.known-words',
  'dictionary.search-knowledge',
  // The study coach reads the same record: the deck's queue and today's mined words, the
  // review log and statistics, and (for a text or a sentence) which words are known.
  'study.recommend-next',
  'study.cards-from-text',
  'study.quiz-mined-today',
  'study.plan-week',
  'dictionary.analyze-sentence',
]);

/** Replaces a withheld tool's output if one is ever bound for a cloud request. */
export const AGENT_STUDY_DATA_REDACTION_NOTE =
  '[Withheld: study statistics, known words and library titles stay on this device. The user can allow sharing them in Agent settings.]';

export function normalizeAgentCloudShareStudyData(value: unknown): AgentCloudShareStudyData {
  return value === 'allow' || value === 'local-only' ? value : 'unset';
}

export function cloudMayReceiveStudyData(value: unknown): boolean {
  return normalizeAgentCloudShareStudyData(value) === 'allow';
}

export function isAgentStudyDataOperation(operationId: string): boolean {
  return AGENT_STUDY_DATA_OPERATIONS.has(operationId as AgentToolOperationId);
}

/**
 * The operations a planner may be offered. A local planner gets them all; a
 * cloud planner loses the study-data tools unless the user allowed sharing.
 */
export function operationsForPlanner<T extends string>(
  operations: readonly T[] | undefined,
  planner: 'local' | 'cloud',
  share: unknown,
): T[] | undefined {
  if (operations === undefined) return undefined;
  if (planner === 'local' || cloudMayReceiveStudyData(share)) return [...operations];
  return operations.filter((operation) => !isAgentStudyDataOperation(operation));
}

/**
 * A tool's output as a cloud request may carry it: unchanged for a local
 * planner, for an ordinary tool, or after consent; the redaction note otherwise.
 */
export function toolOutputForPlanner(
  operationId: string,
  output: unknown,
  planner: 'local' | 'cloud',
  share: unknown,
): unknown {
  if (planner === 'local' || !isAgentStudyDataOperation(operationId)) return output;
  return cloudMayReceiveStudyData(share) ? output : AGENT_STUDY_DATA_REDACTION_NOTE;
}

/** The one-time notice shows only for a cloud-capable setup the user has not answered yet. */
export function shouldAskCloudStudyDataConsent(value: unknown, cloudConfigured: boolean): boolean {
  return cloudConfigured && normalizeAgentCloudShareStudyData(value) === 'unset';
}
