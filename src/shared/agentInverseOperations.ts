/**
 * Which operation takes back which: the inverse table of the Agent's operation
 * log (`agentOperationLog.ts`, rule 2), split out so the profile rules
 * (`localAgentProfiles.ts`, `agentUndoAuthority`) can read it without loading
 * the log at startup. `agentOperationLog.ts` re-exports both names.
 */
import type { AgentToolOperationId } from './localAgent';

/**
 * Forward operation to the reverse operation the tool registry already exposes.
 *
 * Every value here is a real `AgentToolOperationId` with its own permission
 * floor and its own confirmation rule. An operation absent from this table has
 * no inverse — see rule 2 in the file header. In particular there is no entry
 * for a delete: the registry has no "restore" for anything, and inventing one
 * out of a log that stores ids only would be a lie about what can be recovered.
 */
export const AGENT_INVERSE_OPERATIONS: Readonly<
  Partial<Record<AgentToolOperationId, AgentToolOperationId>>
> = {
  'flashcard.create-deck': 'flashcard.delete-deck',
  'flashcard.add-cards': 'flashcard.delete-cards',
  'media.add-item': 'media.delete-item',
  'calendar.schedule-session': 'calendar.delete-event',
  'calendar.create-reminder': 'calendar.delete-event',
  'calendar.schedule-sessions': 'calendar.delete-event',
  'study.filter-vocabulary': 'study.undo-filter',
  'settings.apply-theme': 'settings.undo-theme',
  'settings.apply-css': 'settings.reset-css',
  // A move is undone by the same operation, aimed back (see `inverseArguments`).
  'calendar.reschedule-event': 'calendar.reschedule-event',
  'flashcard.schedule-reviews': 'flashcard.schedule-reviews',
};

/** The reverse operation, or `null` when the forward one cannot be undone. */
export function agentInverseOperation(
  operation: AgentToolOperationId,
): AgentToolOperationId | null {
  return AGENT_INVERSE_OPERATIONS[operation] ?? null;
}
