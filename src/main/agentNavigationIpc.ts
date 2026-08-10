/**
 * Main-side execution for permission-gated navigation.
 *
 * This is the only place an Agent result card can cause something to happen
 * outside its own conversation, and it is deliberately narrow: it resolves an
 * action id against the main-owned workspace, and on approval calls the opener
 * with **one allowlisted section name**. No string from the request, the stored
 * card or the provider ever reaches the opener.
 *
 * The opener is injected rather than imported. `createPopoutWindow` lives in
 * `src/main.ts`, which another track is mid-rewrite on; `setAgentNavigationOpener`
 * lets that file hand it over next to its other window wiring without this module
 * importing the entry point, and lets a test drive the whole handler with no
 * Electron windows at all.
 *
 * Registration hangs off `registerLocalAgentIpc()` for the same reason the
 * workspace and execution bridges do — see `agentWorkspaceIpc.ts`.
 */

import { ipcMain } from 'electron';
import {
  resolveAgentNavigation,
  type AgentNavigationDestination,
} from '../shared/agentNavigation';
import {
  AGENT_NAVIGATION_CHANNELS,
  agentNavigationFailure,
  normalizeAgentNavigationRequest,
  type AgentNavigationResult,
} from '../shared/agentNavigationBridge';
import { getAgentWorkspaceStore, type AgentWorkspaceStore } from './agentWorkspaceStore';

/** Returns whether the exact resolved destination was opened and delivered. */
export type AgentNavigationOpener = (
  destination: AgentNavigationDestination,
) => boolean | Promise<boolean>;

let opener: AgentNavigationOpener | null = null;

/**
 * Hands this module the app's real window opener. Called once from `src/main.ts`
 * beside the pop-out IPC that owns the same map of windows.
 */
export function setAgentNavigationOpener(next: AgentNavigationOpener | null): void {
  opener = next;
}

export interface AgentNavigationIpcDependencies {
  resolveStore?: () => AgentWorkspaceStore;
  openSection?: AgentNavigationOpener;
}

function runKey(
  conversationId: string,
  messageId: string,
  cardId: string,
  actionId: string,
): string {
  // JSON rather than a delimiter: ids are opaque store data of bounded length,
  // and a separator that could occur inside one would let two different actions
  // collide on a single key and silently share the duplicate-run guard.
  return JSON.stringify([conversationId, messageId, cardId, actionId]);
}

export function registerAgentNavigationIpc(
  dependencies: AgentNavigationIpcDependencies = {},
): void {
  const resolveStore = dependencies.resolveStore ?? getAgentWorkspaceStore;
  // Read per call, not captured: `setAgentNavigationOpener` may run after this.
  const openSection = (): AgentNavigationOpener | null => dependencies.openSection ?? opener;
  const running = new Set<string>();

  ipcMain.handle(
    AGENT_NAVIGATION_CHANNELS.run,
    async (_event, raw: unknown): Promise<AgentNavigationResult> => {
      const request = normalizeAgentNavigationRequest(raw);
      if (!request) return agentNavigationFailure('invalid-request');

      let destination: AgentNavigationDestination;
      try {
        const state = resolveStore().read();
        const conversation = state.conversations.find(
          (entry) => entry.id === request.conversationId,
        );
        if (!conversation) return agentNavigationFailure('conversation-not-found');
        const resolution = resolveAgentNavigation(
          conversation,
          request.messageId,
          request.cardId,
          request.actionId,
        );
        if (!resolution.ok) return agentNavigationFailure(resolution.code);
        destination = resolution.destination;
      } catch {
        return agentNavigationFailure('store-failed');
      }

      // The review step stops here, having proved the destination is live and
      // allowlisted without opening anything.
      if (!request.approved) return { ok: true, destination, opened: false };

      const key = runKey(
        request.conversationId,
        request.messageId,
        request.cardId,
        request.actionId,
      );
      // A double-click on Approve, or the same card approved from two windows,
      // must not queue two opens. The pop-out map deduplicates by section too,
      // but that is main's own invariant and not this gate's to lean on.
      if (running.has(key)) return agentNavigationFailure('busy');
      running.add(key);
      try {
        const open = openSection();
        if (!open) return agentNavigationFailure('bridge-unavailable');
        const opened = await open(destination);
        // An opener that reports failure fails honestly rather than reporting a
        // window the user will look for and not find.
        if (!opened) return agentNavigationFailure('open-failed');
        return { ok: true, destination, opened: true };
      } catch {
        return agentNavigationFailure('open-failed');
      } finally {
        running.delete(key);
      }
    },
  );
}
