/**
 * The Agent's pipeline trace — what the terminal view renders, and the rule that
 * decides whether a step's claim is believed.
 *
 * The Agent already records what a completed operation CLAIMS: `claim`,
 * `entityType` and the entity ids its adapter returned
 * (`AGENT_OPERATION_RECORD_CONTRACTS`). A claim is not evidence, though — the
 * executor is authoritative for "the handler ran", not for "the data is where
 * the handler said it put it". Everything between an adapter returning
 * `{ createdIds: [...] }` and a card actually sitting in the intended deck is
 * unwitnessed.
 *
 * So a trace line pairs the claim with a re-read of the live store, and the
 * verdict is a comparison of the two. This is deliberately the same shape for
 * every operation: the point is that "the AI said it worked" and "it worked" are
 * different statements, and the terminal shows both.
 *
 * `unverifiable` is a first-class verdict rather than a silent pass. An
 * operation with no record contract cannot be checked, and reporting that
 * honestly is the difference between a log and an audit.
 */

import type { AgentOperationClaim } from './agentOperationLog';
import type { AgentToolOperationId } from './localAgent';

export type AgentPipelineVerdict =
  /** Every claimed entity was found. */
  | 'verified'
  /** Some claimed entities were found; the rest were not. */
  | 'partial'
  /** The operation claimed entities and none of them are there. */
  | 'missing'
  /** The operation ran but declares no checkable entities. */
  | 'unverifiable';

export type AgentPipelineStatus = 'running' | 'ok' | 'failed';

export interface AgentPipelineLine {
  /** 1-based position in the run, so the terminal reads top to bottom. */
  seq: number;
  operation: AgentToolOperationId;
  status: AgentPipelineStatus;
  /** Compact rendering of the arguments the step was given. */
  argumentSummary: string;
  claim?: AgentOperationClaim;
  entityType?: string;
  claimedIds: readonly string[];
  /** Ids re-read from the live store. Empty until the step completes. */
  foundIds: readonly string[];
  /**
   * Where the entities actually are, read from the store rather than from the
   * adapter's return value — the deck group a card landed in, for example.
   */
  destination?: string;
  verdict: AgentPipelineVerdict;
  error?: string;
}

/**
 * The verdict rule.
 *
 * A step that declares no contract is `unverifiable`, never `verified` — a
 * missing check must not read as a passed one. A step that claims entities and
 * produces none is `missing` even though the handler returned successfully,
 * because that is precisely the failure the terminal exists to catch: a
 * false success.
 */
export function pipelineVerdict(
  claimedIds: readonly string[],
  foundIds: readonly string[],
  hasContract: boolean,
  claim?: AgentOperationClaim,
): AgentPipelineVerdict {
  if (!hasContract) return 'unverifiable';
  // A contract that yielded no ids describes nothing to look for. Treating that
  // as verified would let an adapter that silently returned an empty list pass.
  if (!claimedIds.length) return 'unverifiable';
  const found = new Set(foundIds);
  const hits = claimedIds.filter((id) => found.has(id)).length;

  // A deletion is verified by ABSENCE. Scoring it the same way as a creation
  // would invert every verdict it produces: a delete that worked perfectly finds
  // nothing, which the created-path rule calls `missing`, and a delete that
  // silently did nothing finds everything and would read as `verified`.
  if (claim === 'deleted') {
    if (hits === 0) return 'verified';
    return hits === claimedIds.length ? 'missing' : 'partial';
  }

  if (hits === claimedIds.length) return 'verified';
  return hits === 0 ? 'missing' : 'partial';
}

/** True when the run contains a step whose claim the store did not support. */
export function pipelineHasDiscrepancy(lines: readonly AgentPipelineLine[]): boolean {
  return lines.some(
    (line) => line.status === 'failed' || line.verdict === 'missing' || line.verdict === 'partial',
  );
}

const MAX_VALUE = 60;

function renderValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value.length <= MAX_VALUE) return `"${value}"`;
    // Don't cut between the halves of a surrogate pair.
    const last = value.charCodeAt(MAX_VALUE - 1);
    return `"${value.slice(0, last >= 0xd800 && last <= 0xdbff ? MAX_VALUE - 1 : MAX_VALUE)}…"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') return '{…}';
  return String(value);
}

/**
 * Arguments as one terminal line.
 *
 * Values are rendered, not hidden: the user is checking that the Agent targeted
 * the right book and the right chapters, and a summary that elided the arguments
 * would defeat the purpose. Long strings are truncated rather than dropped so
 * the key is always visible.
 */
export function summarizeArguments(arguments_: Readonly<Record<string, unknown>> | undefined): string {
  if (!arguments_) return '';
  const parts = Object.entries(arguments_)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${renderValue(value)}`);
  return parts.join(' ');
}

/** `flashcard.add-cards` → `flashcard:add-cards`, so the terminal reads as a command. */
export function pipelineCommandLabel(operation: AgentToolOperationId): string {
  const separator = operation.indexOf('.');
  return separator < 0
    ? operation
    : `${operation.slice(0, separator)}:${operation.slice(separator + 1)}`;
}
