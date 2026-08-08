/**
 * IPC for the main-owned Agent workspace store.
 *
 * There is exactly one store (`agentWorkspaceStore.ts`) and these four handlers
 * are its only bridge. No renderer-side copy of the workspace is persisted, so
 * `localStorage` cannot drift away from the file the way the older renderer-owned
 * Agent queue/memory stores did.
 *
 * Registration hangs off `registerLocalAgentIpc()` rather than `src/main.ts`:
 * that function is already the production Agent main boundary and is already
 * called once at boot, so the bridge arrives without editing the shared entry
 * point another track is currently rewriting.
 *
 * Nothing here caches a response. Persistent response caching stays refused
 * until encrypted retention exists.
 */

import { ipcMain } from 'electron';
import {
  agentWorkspaceFailure,
  agentWorkspaceSuccess,
  isAgentWorkspaceSavePayload,
  normalizeAgentConversationId,
  type AgentWorkspaceResult,
} from '../shared/agentWorkspaceBridge';
import { getAgentWorkspaceStore, type AgentWorkspaceStore } from './agentWorkspaceStore';

/**
 * The store is resolved per call, not captured at registration: `getPath` is
 * only meaningful after Electron is ready, and a test needs to point the same
 * handlers at a temporary root.
 */
export function registerAgentWorkspaceIpc(
  resolveStore: () => AgentWorkspaceStore = getAgentWorkspaceStore,
): void {
  ipcMain.handle('agentWorkspace:load', (): AgentWorkspaceResult => {
    try {
      return agentWorkspaceSuccess(resolveStore().read());
    } catch {
      // The message could name the user-data path, so only the code crosses.
      return agentWorkspaceFailure('read-failed');
    }
  });

  ipcMain.handle('agentWorkspace:save', (_event, raw: unknown): AgentWorkspaceResult => {
    // A payload of the wrong schema is refused instead of normalized, because
    // normalization of an unknown version yields the empty workspace and the
    // write would erase real history. See `isAgentWorkspaceSavePayload`.
    if (!isAgentWorkspaceSavePayload(raw)) return agentWorkspaceFailure('invalid-request');
    try {
      return agentWorkspaceSuccess(resolveStore().write(raw));
    } catch {
      return agentWorkspaceFailure('write-failed');
    }
  });

  ipcMain.handle('agentWorkspace:deleteConversation', (_event, raw: unknown): AgentWorkspaceResult => {
    const conversationId = normalizeAgentConversationId(raw);
    if (!conversationId) return agentWorkspaceFailure('invalid-request');
    try {
      return agentWorkspaceSuccess(resolveStore().deleteConversation(conversationId));
    } catch {
      return agentWorkspaceFailure('write-failed');
    }
  });

  ipcMain.handle('agentWorkspace:clear', (): AgentWorkspaceResult => {
    try {
      return agentWorkspaceSuccess(resolveStore().clear());
    } catch {
      return agentWorkspaceFailure('write-failed');
    }
  });
}
