/**
 * The main-owned slot holding a passage on its way from the lens to the Reading
 * workspace.
 *
 * See `shared/readingPassageHandoff.ts` for why a route was needed at all. This
 * is the store half, and it is deliberately the same one variable
 * `main/lexiconHandoff.ts` is: a single staged handoff, or none. It imports no
 * `fs`, it is never serialized, and it is gone when the process exits — the
 * durable copy of a capture is the history store, which this lane does not
 * duplicate.
 *
 * Single-use, expiring on access rather than on a timer, and bounded to one
 * entry whose text and line array the shared normalizer already caps.
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  READING_PASSAGE_HANDOFF_CHANNELS,
  READING_PASSAGE_HANDOFF_TTL_MS,
  normalizeReadingPassageHandoffRequest,
  readingPassageHandoffRejection,
  type ReadingPassageHandoff,
  type ReadingPassageHandoffStageResult,
  type ReadingPassageHandoffTakeResult,
} from '../shared/readingPassageHandoff';

export interface ReadingPassageHandoffStore {
  stage(request: unknown, now?: number): ReadingPassageHandoffStageResult;
  take(now?: number): ReadingPassageHandoffTakeResult;
  /** Test seam: whether a live handoff is currently resident. */
  pending(now?: number): boolean;
}

export function createReadingPassageHandoffStore(): ReadingPassageHandoffStore {
  let staged: ReadingPassageHandoff | null = null;

  const expire = (now: number): void => {
    if (staged && now - staged.stagedAt >= READING_PASSAGE_HANDOFF_TTL_MS) staged = null;
  };

  const stage = (request: unknown, now = Date.now()): ReadingPassageHandoffStageResult => {
    const normalized = normalizeReadingPassageHandoffRequest(request, now);
    if (!normalized) return { ok: false, code: readingPassageHandoffRejection(request) };
    // Newest wins, deliberately. An unclaimed passage is one nobody navigated
    // to; keeping it would make the *older* capture win the race to the reader.
    staged = normalized;
    return { ok: true, kind: normalized.kind, captureId: normalized.captureId };
  };

  const take = (now = Date.now()): ReadingPassageHandoffTakeResult => {
    expire(now);
    if (!staged) return { ok: true, handoff: null };
    const claimed = staged;
    staged = null;
    return { ok: true, handoff: claimed };
  };

  return {
    stage,
    take,
    pending: (now = Date.now()): boolean => {
      expire(now);
      return staged !== null;
    },
  };
}

/**
 * One store per process. Resolved lazily and injectable for the same reason the
 * Lexicon lane's is: a test needs its own instance rather than state left behind
 * by the last one.
 */
let defaultStore: ReadingPassageHandoffStore | null = null;

export function getReadingPassageHandoffStore(): ReadingPassageHandoffStore {
  if (!defaultStore) defaultStore = createReadingPassageHandoffStore();
  return defaultStore;
}

/**
 * Tells every window a passage is waiting.
 *
 * The payload is empty — the text stays in main until a window claims it, so a
 * broadcast can never be the thing that copies what the user captured into a
 * renderer that was not asking for one.
 */
function broadcastStaged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    try {
      window.webContents.send(READING_PASSAGE_HANDOFF_CHANNELS.staged);
    } catch {
      // Best-effort once the passage is already resident. A window closing
      // between `isDestroyed` and `send` must not turn an accepted stage into a
      // failure the lens reports to the user.
    }
  }
}

export function registerReadingPassageHandoffIpc(
  resolveStore: () => ReadingPassageHandoffStore = getReadingPassageHandoffStore,
): void {
  ipcMain.handle(
    READING_PASSAGE_HANDOFF_CHANNELS.stage,
    (_event, raw: unknown): ReadingPassageHandoffStageResult => {
      const result = resolveStore().stage(raw);
      if (result.ok) broadcastStaged();
      return result;
    },
  );
  ipcMain.handle(
    READING_PASSAGE_HANDOFF_CHANNELS.take,
    (): ReadingPassageHandoffTakeResult => resolveStore().take(),
  );
}
