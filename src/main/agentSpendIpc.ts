/**
 * IPC for the main-owned Agent spend ledger.
 *
 * Three handlers and one push, registered from `registerLocalAgentIpc()` rather
 * than `src/main.ts`, for the reason recorded in `agentOperationalIpc.ts`: that
 * function is already the production Agent main boundary and is already called
 * once at boot.
 *
 * There is deliberately no `save`. See `shared/agentSpendBridge.ts` — the
 * renderer may set the ceiling and erase the record, and nothing else. A window
 * that wrote a whole document back would refund every request made since it
 * loaded.
 *
 * The push carries the *whole* snapshot rather than a "changed" signal, so a
 * second window renders the new total without a round trip, and it skips the
 * window that caused the write, which already has the handler's return value.
 * A recorded request pushes too: that is the case the operational store never
 * had — main writes on its own, with no renderer involved at all, and a total
 * that only refreshed when a window happened to reload would be a stale number
 * sitting under a limit the user set.
 */

import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import {
  agentSpendFailure,
  agentSpendSuccess,
  isAgentPricingSetRequest,
  isAgentSpendBudgetRequest,
  type AgentPricingResult,
  type AgentSpendResult,
  type AgentSpendSnapshotPayload,
} from '../shared/agentSpendBridge';
import { getAgentSpendStore, type AgentSpendStore } from './agentSpendStore';
import { getAgentPricingStore, type AgentPricingStore } from './agentPricingStore';

function broadcastPricing(result: AgentPricingResult, origin: WebContents | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    if (origin && window.webContents.id === origin.id) continue;
    window.webContents.send('agentPricing:changed', result);
  }
}

function broadcast(snapshot: AgentSpendSnapshotPayload, origin: WebContents | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    if (origin && window.webContents.id === origin.id) continue;
    window.webContents.send('agentSpend:changed', snapshot);
  }
}

/**
 * The store is resolved per call, not captured at registration: `getPath` is
 * only meaningful after Electron is ready, and a test needs to point the same
 * handlers at a temporary root.
 */
export function registerAgentSpendIpc(
  resolveStore: () => AgentSpendStore = getAgentSpendStore,
  resolvePricing: () => AgentPricingStore = getAgentPricingStore,
): void {
  // Rates: only what the user entered crosses. Failures are codes, never a path.
  ipcMain.handle('agentPricing:load', (): AgentPricingResult => {
    try {
      return { ok: true, rates: resolvePricing().read().rates };
    } catch {
      return { ok: false, code: 'read-failed' };
    }
  });

  ipcMain.handle('agentPricing:set', (event, raw: unknown): AgentPricingResult => {
    if (!isAgentPricingSetRequest(raw)) return { ok: false, code: 'invalid-request' };
    try {
      const result: AgentPricingResult = { ok: true, rates: resolvePricing().setPrice(raw.providerId, raw.price).rates };
      broadcastPricing(result, event.sender);
      return result;
    } catch {
      return { ok: false, code: 'write-failed' };
    }
  });

  // One-time adoption of the rates the renderer used to keep in localStorage.
  ipcMain.handle('agentPricing:migrate', (event, raw: unknown): AgentPricingResult => {
    try {
      const store = resolvePricing();
      const wasMigrated = store.read().migrated;
      const result: AgentPricingResult = { ok: true, rates: store.migrateLegacy(raw).rates };
      if (!wasMigrated) broadcastPricing(result, event.sender);
      return result;
    } catch {
      return { ok: false, code: 'write-failed' };
    }
  });

  ipcMain.handle('agentSpend:load', (): AgentSpendResult => {
    try {
      return agentSpendSuccess(resolveStore().read());
    } catch {
      // The message could name the user-data path, so only the code crosses.
      return agentSpendFailure('read-failed');
    }
  });

  ipcMain.handle('agentSpend:setBudget', (event, raw: unknown): AgentSpendResult => {
    if (!isAgentSpendBudgetRequest(raw)) return agentSpendFailure('invalid-request');
    try {
      const snapshot = resolveStore().setBudget(raw.budgetUsd);
      broadcast(snapshot, event.sender);
      return agentSpendSuccess(snapshot);
    } catch {
      return agentSpendFailure('write-failed');
    }
  });

  ipcMain.handle('agentSpend:clear', (event): AgentSpendResult => {
    try {
      const snapshot = resolveStore().clear();
      broadcast(snapshot, event.sender);
      return agentSpendSuccess(snapshot);
    } catch {
      return agentSpendFailure('write-failed');
    }
  });
}

/**
 * Announces a total main wrote by itself, with no renderer to return it to.
 *
 * Separate from the handlers because its origin is `null`: every window is a
 * recipient, since none of them made the request.
 */
export function broadcastAgentSpend(snapshot: AgentSpendSnapshotPayload): void {
  broadcast(snapshot, null);
}
