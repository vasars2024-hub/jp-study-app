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

import { BrowserWindow, ipcMain } from 'electron';
import {
  agentWorkspaceFailure,
  agentWorkspaceSuccess,
  isAgentWorkspaceSavePayload,
  normalizeAgentConversationId,
  type AgentWorkspaceResult,
} from '../shared/agentWorkspaceBridge';
import type { AgentWorkspaceState } from '../shared/agentWorkspace';
import { getAgentWorkspaceStore, type AgentWorkspaceStore } from './agentWorkspaceStore';

/**
 * Announces a committed workspace to every window, the writer included.
 *
 * See `AGENT_WORKSPACE_CHANNELS.changed` for why the sender is not excluded: the
 * hand-off that made this push necessary happens in the *same* window as the
 * shell it has to refresh.
 *
 * Only successful mutations broadcast. A refused or failed write did not change
 * the file, and telling every window to re-read after it would be announcing a
 * change that never happened.
 *
 * Exported because these four handlers are **not** the only writers: running a
 * prompt mutates the same workspace three times from `agentExecutionIpc.ts`
 * (begin, complete, fail). Those went unannounced when the push first shipped, so
 * a pop-out saw neither the user's message nor the streamed reply — the same
 * staleness this channel exists to fix. It stays the single `webContents.send`
 * for the channel, which `agentWorkspaceBridge.test.ts` asserts by counting.
 */
export function broadcastAgentWorkspace(state: AgentWorkspaceState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    try {
      window.webContents.send('agentWorkspace:changed', state);
    } catch {
      // Observers are best-effort after the atomic write committed. A window can
      // close between `isDestroyed` and `send`; that must not turn a successful
      // store mutation into `write-failed` or strand an execution placeholder.
    }
  }
}

/** Local alias, so the handlers below read as they did before it was exported. */
const broadcast = broadcastAgentWorkspace;

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
      const result = resolveStore().compareAndWrite(raw);
      if (!result.ok) return agentWorkspaceFailure('conflict', result.state);
      broadcast(result.state);
      return agentWorkspaceSuccess(result.state);
    } catch {
      return agentWorkspaceFailure('write-failed');
    }
  });

  ipcMain.handle('agentWorkspace:deleteConversation', (_event, raw: unknown): AgentWorkspaceResult => {
    const conversationId = normalizeAgentConversationId(raw);
    if (!conversationId) return agentWorkspaceFailure('invalid-request');
    try {
      const state = resolveStore().deleteConversation(conversationId);
      broadcast(state);
      return agentWorkspaceSuccess(state);
    } catch {
      return agentWorkspaceFailure('write-failed');
    }
  });

  ipcMain.handle('agentWorkspace:clear', (): AgentWorkspaceResult => {
    try {
      const state = resolveStore().clear();
      broadcast(state);
      return agentWorkspaceSuccess(state);
    } catch {
      return agentWorkspaceFailure('write-failed');
    }
  });
}
