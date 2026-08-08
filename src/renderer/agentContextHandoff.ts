/**
 * "Ask the Agent about this" — the hand-off from a study surface into the Agent
 * conversation, with what the user was looking at attached.
 *
 * This is the first producer of `AgentContextItem`. Track 3 of the completion
 * plan is explicit that contextual AI buttons must "open or hand off to the same
 * Agent conversation with context attached" and must not "maintain separate
 * hidden chat histories", which is exactly what this does: there is no second
 * conversation model here, only a write into the one main-owned workspace that
 * `AgentWorkspaceShell` already reads and `main/agentExecutionIpc.ts` already
 * feeds to the provider.
 *
 * Attaching and opening are deliberately separate steps, and the attach happens
 * first. If the route never opens — a Blanc window has no Study OS desktop to
 * route — the context is still on the shelf and the user finds it waiting the
 * next time they open the Agent, rather than the gesture having done nothing.
 */

import { createAgentContextItem, type AgentContextInput } from '../shared/agentContext';
import type { AgentContextItem } from '../shared/agentWorkspace';
import { agentWorkspaceWithContextAttached } from './agentShellModel';
import { loadAgentWorkspace, saveAgentWorkspace } from './agentWorkspaceClient';
import { isBlancWindow } from './blancMode';

export type AgentHandoffOutcome =
  | 'attached'
  | 'unchanged'
  | 'invalid-context'
  | 'bridge-unavailable'
  | 'save-failed';

/**
 * Nothing here announces the change any more.
 *
 * A hand-off into an already-open Agent used to leave the shell showing what it
 * read at mount, and this module dispatched a window event to wake it. That
 * covered the same-window case only; an Agent pop-out is a separate
 * BrowserWindow and never saw it. Main now broadcasts every committed workspace
 * on `agentWorkspace:changed`, to every window including the writer, so the save
 * below is the announcement and there is one mechanism instead of two.
 */

function newConversationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `agent-${uuid}`;
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Attaches one context item to the active conversation, creating one when there
 * is none.
 *
 * `conversationTitle` arrives translated from the caller: this module has no
 * `t()`, matching the rule `agentShellModel.ts` follows, so a title never has to
 * be assembled from fragments a catalog cannot reorder.
 */
export async function attachAgentContextFromSurface(
  input: AgentContextInput,
  conversationTitle: string,
): Promise<AgentHandoffOutcome> {
  const item = createAgentContextItem(input);
  if (!item) return 'invalid-context';

  const loaded = await loadAgentWorkspace();
  if (!loaded.ok) return loaded.code === 'bridge-unavailable' ? 'bridge-unavailable' : 'save-failed';

  const next = agentWorkspaceWithContextAttached(loaded.state, item, {
    newConversation: { id: newConversationId(), title: conversationTitle },
    now: input.now,
  });
  // Already the front item of the active conversation: the shelf is correct, so
  // the save is skipped and the caller still opens the Agent.
  if (!next) return 'unchanged';

  const saved = await saveAgentWorkspace(next);
  return saved.ok ? 'attached' : 'save-failed';
}

/**
 * Routes to the Agent surface, when this window has one.
 *
 * `os:open` takes a bare section id — `agent` is a real `DesktopWinSection`, see
 * `POPOUT_LABEL_KEYS` in `App.tsx`. The Blanc window is a different entry point
 * with no desktop router, so it is skipped rather than dispatching an event
 * nothing listens for.
 */
export function openAgentSurface(): boolean {
  if (typeof window === 'undefined' || isBlancWindow()) return false;
  window.dispatchEvent(new CustomEvent('os:open', { detail: 'agent' }));
  return true;
}

/** The whole gesture: attach, then open. */
export async function handOffToAgent(
  input: AgentContextInput,
  conversationTitle: string,
): Promise<AgentHandoffOutcome> {
  const outcome = await attachAgentContextFromSurface(input, conversationTitle);
  if (outcome === 'attached' || outcome === 'unchanged') openAgentSurface();
  return outcome;
}

/**
 * The dictionary's shape of that gesture. Kept here rather than in the popup so
 * the identity rule — one shelf entry per term, not one per lookup — lives with
 * the other context rules instead of in a component.
 *
 * `retained: true` here is a statement about durability, not a workaround. A
 * dictionary entry is reference data at the `ordinary` floor, so retaining it is
 * both allowed by `createAgentContextItem` and the honest thing to do — the user
 * asked about this word and will still be asking about it after a restart.
 *
 * It used to be load-bearing for a different reason, and that reason is gone: the
 * hand-off's only route to the shell ran through the persisted store, whose save
 * filter drops everything non-retained, so a non-retained item was stripped by
 * the very save meant to deliver it and producers above `ordinary` could not
 * reach the shelf at all. `main/agentSessionContext.ts` now holds the
 * non-retained half in memory and the store merges it back on read, so
 * `selected-text`, `reading-passage` and `media-cue` producers work over this
 * same route without anything reaching disk. Do not add `retained: true` to a
 * personal or sensitive producer to "make it show up" — `createAgentContextItem`
 * refuses it anyway, and it no longer needs it.
 */
export function dictionaryAgentContext(
  term: string,
  preview: string,
  now = Date.now(),
): AgentContextInput {
  return {
    kind: 'dictionary-entry',
    label: term,
    preview,
    source: { app: 'dictionary', entityId: term },
    identity: term,
    retained: true,
    now,
  };
}

export type { AgentContextItem };
