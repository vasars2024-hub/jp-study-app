/**
 * IPC for the main-owned Reading Lists store.
 *
 * Three handlers and one push. The push carries the *whole* snapshot rather than
 * a "changed" signal, and skips the window that caused the write: that window
 * already has the handler's return value, and every other window renders the new
 * document without a round trip. This is `agentSpendIpc.ts`'s shape, chosen for
 * the reason the plan's §0 records — the library window, the reader window and a
 * desktop widget are different renderers, and a list that only refreshed when a
 * window happened to reload is exactly the disagreement `preferredSubtitleId` was
 * moved into main to prevent.
 *
 * `broadcastReadingLists` exists separately because the completion detector (§4)
 * writes from main with no renderer involved at all. Its origin is `null`, so
 * every window is a recipient.
 */

import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import type { ReadingListEvent } from '../shared/readingLists';
import {
  isReadingListsWriteRequest,
  readingListsFailure,
  readingListsSuccess,
  type ReadingListsEventsResult,
  type ReadingListsResult,
  type ReadingListsSnapshot,
} from '../shared/readingListsBridge';
import { getReadingListsStore, type ReadingListsStore } from './readingListsStore';

function broadcast(snapshot: ReadingListsSnapshot, origin: WebContents | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    if (origin && window.webContents.id === origin.id) continue;
    window.webContents.send('readingLists:changed', snapshot);
  }
}

/**
 * The store is resolved per call, not captured at registration: `getPath` is only
 * meaningful after Electron is ready, and a test needs to point the same handlers
 * at a temporary root.
 */
export function registerReadingListsIpc(
  resolveStore: () => ReadingListsStore = getReadingListsStore,
): void {
  ipcMain.handle('readingLists:load', (): ReadingListsResult => {
    try {
      return readingListsSuccess(resolveStore().read());
    } catch {
      // The message could name the user-data path, so only the code crosses.
      return readingListsFailure('read-failed');
    }
  });

  ipcMain.handle('readingLists:write', (event, raw: unknown): ReadingListsResult => {
    if (!isReadingListsWriteRequest(raw)) return readingListsFailure('invalid-request');
    try {
      const events = Array.isArray((raw as { events?: unknown }).events)
        ? ((raw as { events: Omit<ReadingListEvent, 'revision'>[] }).events)
        : [];
      const result = resolveStore().write(raw.baseRevision, raw.document, events);
      // A refused write broadcasts nothing: the document did not move, and pushing
      // the current snapshot to every window would make a conflict look like a
      // change and re-render surfaces that are already correct.
      if (result.applied) broadcast(result.snapshot, event.sender);
      return readingListsSuccess(result.snapshot, result.applied);
    } catch {
      return readingListsFailure('write-failed');
    }
  });

  ipcMain.handle('readingLists:events', (_event, raw: unknown): ReadingListsEventsResult => {
    const limit =
      typeof raw === 'object' && raw !== null && typeof (raw as { limit?: unknown }).limit === 'number'
        ? (raw as { limit: number }).limit
        : 200;
    try {
      return { ok: true, events: resolveStore().events(limit) };
    } catch {
      return readingListsFailure('read-failed');
    }
  });
}

/** Announces a document main wrote by itself, with no renderer to return it to. */
export function broadcastReadingLists(snapshot: ReadingListsSnapshot): void {
  broadcast(snapshot, null);
}
