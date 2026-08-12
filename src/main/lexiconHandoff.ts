/**
 * The main-owned slot holding a lookup on its way from the lens to Lexicon.
 *
 * See `shared/lexiconHandoff.ts` for why a fourth route was needed at all. This
 * is the store half, and it is one variable: a single staged handoff, or none.
 * It imports no `fs`, it is never serialized, and it is gone when the process
 * exits.
 *
 * Three properties do the work:
 *
 * - **single-use** — `take` clears what it returns, so the Dictionary receives a
 *   lookup exactly once. Re-opening the window later shows the search the user
 *   left behind, not a word main quietly kept handing back.
 * - **expiring** — anything past the TTL is dropped on the next access, whether
 *   or not it is ever claimed. Checked on access rather than on a timer, for the
 *   reason the image lane records: the contents only matter when something reads
 *   them, and a timer would keep the process busy over a slot that is empty
 *   almost all the time.
 * - **bounded** — one entry, whose text the shared normalizer already caps at
 *   lookup scale. There is nothing here to grow.
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  LEXICON_HANDOFF_CHANNELS,
  LEXICON_HANDOFF_TTL_MS,
  lexiconHandoffRejection,
  normalizeLexiconHandoffRequest,
  type LexiconHandoff,
  type LexiconHandoffStageResult,
  type LexiconHandoffTakeRequest,
  type LexiconHandoffTakeResult,
} from '../shared/lexiconHandoff';

export interface LexiconHandoffStore {
  stage(request: unknown, now?: number): LexiconHandoffStageResult;
  take(request: LexiconHandoffTakeRequest, now?: number): LexiconHandoffTakeResult;
  /** Test seam: whether a live handoff is currently resident. */
  pending(now?: number): boolean;
}

export function createLexiconHandoffStore(): LexiconHandoffStore {
  let staged: LexiconHandoff | null = null;

  const expire = (now: number): void => {
    if (staged && now - staged.stagedAt >= LEXICON_HANDOFF_TTL_MS) staged = null;
  };

  const stage = (request: unknown, now = Date.now()): LexiconHandoffStageResult => {
    const normalized = normalizeLexiconHandoffRequest(request, now);
    if (!normalized) return { ok: false, code: lexiconHandoffRejection(request) };
    // Newest wins, deliberately. An unclaimed handoff is one nobody navigated
    // to; keeping it would make the *older* word win the race to a search box.
    staged = normalized;
    return { ok: true, kind: normalized.kind, lens: normalized.lens };
  };

  const take = (request: LexiconHandoffTakeRequest, now = Date.now()): LexiconHandoffTakeResult => {
    expire(now);
    if (!staged || staged.lens !== request.lens) return { ok: true, handoff: null };
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
 * One store per process. Resolved lazily and injectable for the same reason
 * `agentImageStaging.ts` is: a test needs its own instance rather than state
 * left behind by the last one.
 */
let defaultStore: LexiconHandoffStore | null = null;

export function getLexiconHandoffStore(): LexiconHandoffStore {
  if (!defaultStore) defaultStore = createLexiconHandoffStore();
  return defaultStore;
}

/**
 * Tells every window a lookup is waiting.
 *
 * The payload is deliberately empty — the text stays in main until a window
 * claims it, so a broadcast can never be the thing that copies what the user
 * captured into a renderer that was not asking for one. The sender is not
 * excluded, matching the image lane: the lens overlay is its own window and does
 * not consume this, but a producer and a consumer sharing a window is a shape
 * this app has repeatedly.
 */
function broadcastStaged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    try {
      window.webContents.send(LEXICON_HANDOFF_CHANNELS.staged);
    } catch {
      // Best-effort once the lookup is already resident. A window closing
      // between `isDestroyed` and `send` must not turn an accepted stage into a
      // failure the lens reports to the user.
    }
  }
}

export function registerLexiconHandoffIpc(
  resolveStore: () => LexiconHandoffStore = getLexiconHandoffStore,
): void {
  ipcMain.handle(
    LEXICON_HANDOFF_CHANNELS.stage,
    (_event, raw: unknown): LexiconHandoffStageResult => {
      const result = resolveStore().stage(raw);
      if (result.ok) broadcastStaged();
      return result;
    },
  );
  ipcMain.handle(
    LEXICON_HANDOFF_CHANNELS.take,
    (_event, raw: unknown): LexiconHandoffTakeResult => {
      const lens = (raw as { lens?: unknown } | null)?.lens;
      if (lens !== 'lookup' && lens !== 'translate') {
        return { ok: false, code: 'invalid-request' };
      }
      return resolveStore().take({ lens });
    },
  );
}
