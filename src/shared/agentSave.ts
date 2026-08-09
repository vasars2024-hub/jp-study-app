/**
 * Permission-gated saving: the resolver, the failure codes and the lifecycle for
 * the `save` effect.
 *
 * `save` is the second of the three inert effects to acquire a gate, and it is
 * built the same way `agentStepApproval.ts` is — the two are the same problem,
 * and a third shape of permission gate would be a third thing to audit.
 *
 * What is different is worth stating, because it decides the whole design.
 * `approve-step` authorizes work a planner already described; `save` creates a
 * durable row from **context the user themselves put on the shelf**. So there is
 * no plan to consult and nothing a model wrote to trust: the word, the reading
 * and the meaning are read out of the live context item named by the effect, and
 * the effect stores that item's id and nothing else.
 *
 * The rules that carry it:
 *
 * 1. **Only reference-grade context can be saved.** A `dictionary-entry` is
 *    `ordinary`-floor reference data the workspace already retains across
 *    restarts. A `reading-passage`, a `selected-text` or a `media-cue` is the
 *    user's own material, deliberately session-only and deliberately never
 *    written to disk — turning one into a flashcard row would be the persistence
 *    boundary leaking through a button. Those refuse with `not-savable-kind`.
 * 2. **Re-authorized at the moment of saving.** The row is created by the same
 *    `flashcard.add-cards` operation the tool registry exposes, so it is subject
 *    to the same profile check, evaluated against the profile as it is *now*.
 * 3. **Saving twice is not saving twice.** The deck is keyed by word, and a
 *    second save of the same entry refuses with `already-saved` rather than
 *    quietly creating a duplicate the user has to find and delete.
 */

import type { AgentConversation, AgentContextItem } from './agentWorkspace';
import {
  evaluateAgentToolAccess,
  type AgentPermissionLevel,
  type AgentToolOperationId,
} from './localAgent';

/**
 * The operation a save actually performs. Named once, here, so the permission
 * check and the side effect cannot come to disagree about what is being
 * authorized.
 */
export const AGENT_SAVE_OPERATION: AgentToolOperationId = 'flashcard.add-cards';

/**
 * The entity types a `save` effect may name. `entityType` is a free-form string
 * on the persisted effect, so this is the allowlist that keeps a stored string
 * from widening what a save can create — the same job `AGENT_NAVIGABLE_SECTIONS`
 * does for a destination.
 */
export const AGENT_SAVABLE_ENTITY_TYPES: readonly string[] = ['flashcard'];

/**
 * The context kinds a save may read from. Reference data only — see rule 1 in
 * the file header. Widening this without widening the retention rules beside it
 * is how session-only material reaches disk.
 */
const SAVABLE_CONTEXT_KINDS: ReadonlySet<AgentContextItem['kind']> =
  new Set<AgentContextItem['kind']>(['dictionary-entry']);

export type AgentSaveFailureCode =
  | 'invalid-request'
  | 'conversation-not-found'
  | 'action-not-found'
  | 'not-savable'
  | 'unknown-entity-type'
  | 'stale-provenance'
  | 'entity-not-found'
  | 'not-savable-kind'
  | 'entity-incomplete'
  | 'operation-denied'
  | 'already-saved'
  | 'busy'
  | 'save-failed'
  | 'store-failed'
  | 'bridge-unavailable';

/**
 * What the user is asked to save, built entirely from the live context item.
 *
 * `word` and `meaning` are study content, not chrome: they are shown verbatim
 * and never translated. The surrounding labels are.
 */
export interface AgentSaveTarget {
  entityType: string;
  entityId: string;
  word: string;
  meaning: string;
}

export type AgentSaveResolution =
  | { ok: true; target: AgentSaveTarget }
  | { ok: false; code: AgentSaveFailureCode };

function saveEffect(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
): { entityType: string; entityId: string } | AgentSaveFailureCode {
  const message = conversation.messages.find((entry) => entry.id === messageId);
  const card = message?.cards.find((entry) => entry.id === cardId);
  const action = card?.actions.find((entry) => entry.id === actionId);
  if (!message || !card || !action) return 'action-not-found';
  if (action.effect.type !== 'save') return 'not-savable';
  if (!AGENT_SAVABLE_ENTITY_TYPES.includes(action.effect.entityType)) {
    return 'unknown-entity-type';
  }
  // Provenance is the card's, and an empty list is not a pass — the same
  // fail-closed rule the navigation and approval gates use.
  if (card.sourceContextIds.length === 0) return 'stale-provenance';
  if (!card.sourceContextIds.some((contextId) => (
    conversation.context.some((item) => item.id === contextId)
  ))) {
    return 'stale-provenance';
  }
  return { entityType: action.effect.entityType, entityId: action.effect.entityId };
}

/**
 * Resolves one stored `save` action against the conversation and the deck as
 * they are *now*.
 *
 * Pure and side-effect free; the review step and the confirmed save both call
 * it. `savedWords` is the set of words the deck already holds, supplied by the
 * caller rather than read here, because this module must stay free of renderer
 * storage — the same reason the queue is passed into the approval gate.
 */
export function resolveAgentSave(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
  permission: AgentPermissionLevel,
  savedWords: ReadonlySet<string>,
  allowedOperations?: readonly AgentToolOperationId[],
): AgentSaveResolution {
  const effect = saveEffect(conversation, messageId, cardId, actionId);
  if (typeof effect === 'string') return { ok: false, code: effect };

  const item = conversation.context.find((entry) => entry.id === effect.entityId);
  if (!item) return { ok: false, code: 'entity-not-found' };
  if (!SAVABLE_CONTEXT_KINDS.has(item.kind)) return { ok: false, code: 'not-savable-kind' };

  const word = item.label.trim();
  // A card with no front is not a card. Refusing here rather than writing an
  // empty row is the difference between a save that failed and a deck that
  // quietly acquired a blank entry.
  if (!word) return { ok: false, code: 'entity-incomplete' };

  const decision = evaluateAgentToolAccess(
    { callId: `save-${effect.entityId}`, operation: AGENT_SAVE_OPERATION, arguments: {} },
    permission,
    allowedOperations,
  );
  if (decision.status === 'denied') return { ok: false, code: 'operation-denied' };

  if (savedWords.has(word)) return { ok: false, code: 'already-saved' };

  return {
    ok: true,
    target: {
      entityType: effect.entityType,
      entityId: effect.entityId,
      word,
      // The gloss is optional; a word with no meaning is still worth saving,
      // and an empty string is what `addDeckCards` already expects for one.
      meaning: (item.preview ?? '').trim(),
    },
  };
}

/* ---------- Lifecycle ----------------------------------------------------- */

export type AgentSaveStatus = 'idle' | 'review' | 'saved' | 'failed' | 'cancelled';

export interface AgentSaveRun {
  status: AgentSaveStatus;
  /** Saves performed so far. A retry is a second decision, not a free redo. */
  attempts: number;
  target?: AgentSaveTarget;
  code?: AgentSaveFailureCode;
}

export type AgentSaveEvent =
  | { type: 'review'; target: AgentSaveTarget }
  | { type: 'refused'; code: AgentSaveFailureCode }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'failed'; code: AgentSaveFailureCode }
  | { type: 'retry' }
  | { type: 'dismiss' };

export const AGENT_SAVE_IDLE: AgentSaveRun = { status: 'idle', attempts: 0 };

/**
 * The whole permitted lifecycle, as one total function.
 *
 * `saved` spans the confirmation and the write it authorizes, and accepts
 * `failed`, for the same reason `granted` does in the approval gate: a write
 * that failed after the user confirmed must be able to say so, or the card
 * would read "saved" over a deck that gained nothing.
 */
export function agentSaveReduce(run: AgentSaveRun, event: AgentSaveEvent): AgentSaveRun {
  switch (event.type) {
    case 'review':
      return { status: 'review', attempts: run.attempts, target: event.target };
    case 'refused':
      return { status: 'failed', attempts: run.attempts, code: event.code };
    case 'confirm':
      return run.status === 'review' && run.target
        ? { status: 'saved', attempts: run.attempts + 1, target: run.target }
        : run;
    case 'cancel':
      return run.status === 'review' ? { status: 'cancelled', attempts: run.attempts } : run;
    case 'failed':
      return run.status === 'review' || run.status === 'saved'
        ? { status: 'failed', attempts: run.attempts, code: event.code }
        : run;
    case 'retry':
      // Back to idle: the next attempt re-resolves against the live deck, so a
      // retry cannot reuse a decision made before the word was already there.
      return run.status === 'failed' || run.status === 'cancelled'
        ? { status: 'idle', attempts: run.attempts }
        : run;
    case 'dismiss':
      return run.status === 'saved' ? { status: 'idle', attempts: run.attempts } : run;
    default:
      return run;
  }
}
