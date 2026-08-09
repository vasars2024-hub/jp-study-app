/**
 * The renderer half of the `save` gate: what the Agent surface reads to ask the
 * question, and the one write it performs once the user has answered.
 *
 * The gate itself is `shared/agentSave.ts` and is pure. This module supplies the
 * three live inputs it needs — the effective permission, the profile's enabled
 * operations, and the words the deck already holds — and performs the single
 * side effect a confirmation authorizes.
 *
 * The deck is read here rather than inside the gate for the same reason the task
 * queue is passed into the approval gate: `shared/` must not reach into renderer
 * storage, and a gate that read its own inputs could not be tested without one.
 */

import { addDeckCards, loadDeck } from './flashcardDeck';
import { loadLocalAgentProfiles } from './localAgentProfilesStore';
import { loadLocalAgentSettings } from './localAgentSettingsStore';
import {
  effectiveAgentPermission,
  getActiveAgentProfile,
} from '../shared/localAgentProfiles';
import {
  availableAgentToolOperationIds,
  createCentralAgentToolRegistry,
  type AgentToolRegistryTranslate,
} from './agentToolRegistry';
import type { AgentPermissionLevel, AgentToolOperationId } from '../shared/localAgent';
import type { AgentSaveFailureCode, AgentSaveTarget } from '../shared/agentSave';

export interface AgentSaveContext {
  permission: AgentPermissionLevel;
  allowedOperations: readonly AgentToolOperationId[];
  /** Trimmed words the deck already holds, for the duplicate rule. */
  savedWords: ReadonlySet<string>;
}

/**
 * Reads every live input the gate needs, at the moment it is asked.
 *
 * Deliberately not cached and not a hook. The deck can gain the same word from
 * a reader or a mining pass while this card sits on screen, and the profile can
 * be narrowed; a value captured when the message rendered would let the user
 * save against a state that no longer exists.
 */
export function readAgentSaveContext(t: AgentToolRegistryTranslate): AgentSaveContext {
  const profile = getActiveAgentProfile(loadLocalAgentProfiles());
  const available = availableAgentToolOperationIds(createCentralAgentToolRegistry(t));
  const enabled = new Set(profile?.enabledOperations ?? []);
  return {
    permission: effectiveAgentPermission(loadLocalAgentSettings().permission, profile),
    allowedOperations: profile ? available.filter((id) => enabled.has(id)) : available,
    savedWords: new Set(loadDeck().map((card) => card.word.trim()).filter(Boolean)),
  };
}

export type AgentSaveResult = { ok: true } | { ok: false; code: AgentSaveFailureCode };

/**
 * Writes the one row the confirmation authorized.
 *
 * The deck is re-read first: the review may have been open for a while, and a
 * word that arrived meanwhile must refuse rather than duplicate. `addDeckCards`
 * returns the whole deck, so a row that did not appear is reported as a failure
 * instead of a save the user never got.
 */
export function saveAgentEntity(target: AgentSaveTarget): AgentSaveResult {
  let before: ReturnType<typeof loadDeck>;
  try {
    before = loadDeck();
  } catch {
    return { ok: false, code: 'store-failed' };
  }
  const word = target.word.trim();
  if (before.some((card) => card.word.trim() === word)) {
    return { ok: false, code: 'already-saved' };
  }

  try {
    const after = addDeckCards([{
      word,
      reading: '',
      meaning: target.meaning,
      // `import` is the existing provenance for a row the user did not type by
      // hand. Inventing an `agent` source would mean touching every consumer of
      // `FlashcardSource` for a row that behaves exactly like an import.
      source: 'import',
    }]);
    if (!after.some((card) => card.word.trim() === word)) {
      return { ok: false, code: 'save-failed' };
    }
  } catch {
    return { ok: false, code: 'save-failed' };
  }
  return { ok: true };
}
