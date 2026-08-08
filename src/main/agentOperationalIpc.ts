/**
 * IPC for the main-owned Agent operational store.
 *
 * Three handlers and one push. Registration hangs off `registerLocalAgentIpc()`
 * rather than `src/main.ts`, for the reason recorded in `agentWorkspaceIpc.ts`:
 * that function is already the production Agent main boundary and is already
 * called once at boot, so the bridge arrives without editing the shared entry
 * point another track is currently rewriting.
 *
 * The push (`agentOperational:changed`) deliberately skips the window that
 * caused the write. That window already has the authoritative state as the
 * handler's return value and has usually rendered it optimistically; echoing it
 * back would re-enter its own reducer for no reason and, if a consumer ever
 * responded to an incoming state by saving, would close a loop.
 */

import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import {
  agentOperationalFailure,
  agentOperationalSuccess,
  isAgentOperationalSavePayload,
  isLegacyAgentOperationalPayload,
  type AgentOperationalResult,
} from '../shared/agentOperationalBridge';
import type { AgentOperationalState } from '../shared/agentOperationalState';
import {
  getAgentOperationalStore,
  type AgentOperationalStore,
} from './agentOperationalStore';

function broadcast(state: AgentOperationalState, origin: WebContents | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    if (origin && window.webContents.id === origin.id) continue;
    window.webContents.send('agentOperational:changed', state);
  }
}

/**
 * The store is resolved per call, not captured at registration: `getPath` is
 * only meaningful after Electron is ready, and a test needs to point the same
 * handlers at a temporary root.
 */
export function registerAgentOperationalIpc(
  resolveStore: () => AgentOperationalStore = getAgentOperationalStore,
): void {
  ipcMain.handle('agentOperational:load', (): AgentOperationalResult => {
    try {
      return agentOperationalSuccess(resolveStore().read());
    } catch {
      // The message could name the user-data path, so only the code crosses.
      return agentOperationalFailure('read-failed');
    }
  });

  ipcMain.handle('agentOperational:save', (event, raw: unknown): AgentOperationalResult => {
    // Refused rather than normalized: normalization of an unknown version yields
    // the empty document and the write would erase the real queue, memory and
    // schedule. See `isAgentOperationalSavePayload`.
    if (!isAgentOperationalSavePayload(raw)) return agentOperationalFailure('invalid-request');
    try {
      const state = resolveStore().write(raw);
      broadcast(state, event.sender);
      return agentOperationalSuccess(state);
    } catch {
      return agentOperationalFailure('write-failed');
    }
  });

  ipcMain.handle('agentOperational:migrateLegacy', (event, raw: unknown): AgentOperationalResult => {
    if (!isLegacyAgentOperationalPayload(raw)) return agentOperationalFailure('invalid-request');
    try {
      const state = resolveStore().migrateLegacy(raw);
      broadcast(state, event.sender);
      return agentOperationalSuccess(state);
    } catch {
      return agentOperationalFailure('write-failed');
    }
  });
}
