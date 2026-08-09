/**
 * The execution timeline — what the Agent actually tried to do, in order.
 *
 * `agentNavigationReduce` already models one action's lifecycle, but it models
 * only the *current* state of *one* control: a retry overwrites the refusal that
 * preceded it, and a second card knows nothing about the first. That is the
 * right shape for a button and the wrong shape for review. A user asked to
 * approve step three of a plan needs to see what steps one and two did, and a
 * user whose action failed needs the failure to still be there after they retry.
 *
 * So this module records *attempts*, not status. Its two load-bearing rules:
 *
 * 1. **A terminal attempt is never mutated.** Retrying appends a new attempt
 *    beside the old one. This is the whole difference between a timeline and a
 *    status field, and it is what makes `approve-step` reviewable later.
 * 2. **An entry names ids, never a destination.** The navigation channel refuses
 *    payloads carrying `section`, `page`, `url` and friends precisely so a stored
 *    string can never widen what gets opened; a timeline that cached the resolved
 *    destination would put that string back and invite a renderer to trust it.
 *    The UI resolves labels from the section's own `palette.section.*` key, the
 *    same way the navigation card does.
 *
 * There is deliberately **no persistence**. An attempt is a record of what this
 * window did while the user was watching; writing it to the shared workspace
 * would sync one window's execution history into every other window, and would
 * outlive the approval that justified it. The shell holds this in component
 * state for the same reason it holds `AgentNavigationRun` there.
 */

/**
 * `idle` is absent on purpose. It is the state where nothing has happened, and a
 * timeline of things that did not happen is noise the user has to read past.
 */
export type AgentTimelineStatus =
  | 'review'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/**
 * The union exists so a second effect gains a timeline by extending a type
 * rather than by copying this module, and so an unconnected effect cannot
 * quietly appear in the record before it has a producer, a permission rule and
 * a failure path of its own.
 *
 * `approve-step` joined when it acquired all three: `agentStepApproval.ts`
 * resolves it against the live task queue, re-authorizes it through
 * `evaluateAgentToolAccess`, and refuses with a typed code. `save` and `undo`
 * are still absent for the same reason `approve-step` was, and adding either
 * here before it has a gate of its own would put a claim in the record that
 * nothing checked.
 */
export type AgentTimelineEffect = 'navigate' | 'approve-step';

export interface AgentTimelineTarget {
  conversationId: string;
  messageId: string;
  cardId: string;
  actionId: string;
  effect: AgentTimelineEffect;
}

export interface AgentTimelineEntry extends AgentTimelineTarget {
  /** Stable within the session; derived, so a test can name one. */
  id: string;
  status: AgentTimelineStatus;
  /** 1-based. A retry is the next attempt, not a re-run of the first. */
  attempt: number;
  startedAt: number;
  updatedAt: number;
  /** Refusal or failure code, absent while the attempt is still live. */
  code?: string;
}

export type AgentTimelineEvent =
  | { type: 'review' }
  | { type: 'refused'; code: string }
  | { type: 'running' }
  | { type: 'succeeded' }
  | { type: 'failed'; code: string }
  | { type: 'cancelled' };

/**
 * A long session must not grow an unbounded array in component state. The oldest
 * attempts are dropped, never the newest — the recent ones are the ones under
 * review.
 */
export const AGENT_TIMELINE_LIMIT = 200;

const TERMINAL: ReadonlySet<AgentTimelineStatus> = new Set<AgentTimelineStatus>([
  'succeeded',
  'failed',
  'cancelled',
]);

/** True once an attempt can no longer change. */
export function isAgentTimelineTerminal(status: AgentTimelineStatus): boolean {
  return TERMINAL.has(status);
}

function sameTarget(entry: AgentTimelineEntry, target: AgentTimelineTarget): boolean {
  return entry.conversationId === target.conversationId
    && entry.messageId === target.messageId
    && entry.cardId === target.cardId
    && entry.actionId === target.actionId
    && entry.effect === target.effect;
}

function entryId(target: AgentTimelineTarget, attempt: number): string {
  return `${target.conversationId}|${target.messageId}|${target.cardId}|${target.actionId}|${attempt}`;
}

/**
 * Records one transition, newest attempt first.
 *
 * `review` opens an attempt. Every other event advances the attempt that is
 * already live, and an event that arrives with no live attempt is **dropped
 * rather than inventing one** — a `succeeded` with nothing in flight would put a
 * completion in the record that no approval preceded, which is exactly the claim
 * this module exists to make impossible.
 */
export function agentTimelineRecord(
  entries: readonly AgentTimelineEntry[],
  target: AgentTimelineTarget,
  event: AgentTimelineEvent,
  now: number,
): AgentTimelineEntry[] {
  const index = entries.findIndex((entry) => sameTarget(entry, target));
  const live = index >= 0 && !isAgentTimelineTerminal(entries[index].status)
    ? entries[index]
    : null;

  if (event.type === 'review') {
    // A second `review` while one is already open is the same attempt being
    // re-resolved, not a new one; only a terminal attempt starts the next.
    if (live) return [...entries];
    const attempt = index >= 0 ? entries[index].attempt + 1 : 1;
    const opened: AgentTimelineEntry = {
      ...target,
      id: entryId(target, attempt),
      status: 'review',
      attempt,
      startedAt: now,
      updatedAt: now,
    };
    return [opened, ...entries].slice(0, AGENT_TIMELINE_LIMIT);
  }

  if (!live) return [...entries];

  const status: AgentTimelineStatus = event.type === 'refused' ? 'failed' : event.type;
  const advanced: AgentTimelineEntry = {
    ...live,
    status,
    updatedAt: now,
    ...(event.type === 'refused' || event.type === 'failed' ? { code: event.code } : {}),
  };
  const next = [...entries];
  next[index] = advanced;
  return next;
}

/** The attempts for one conversation, newest first. */
export function agentTimelineForConversation(
  entries: readonly AgentTimelineEntry[],
  conversationId: string,
): AgentTimelineEntry[] {
  return entries.filter((entry) => entry.conversationId === conversationId);
}
