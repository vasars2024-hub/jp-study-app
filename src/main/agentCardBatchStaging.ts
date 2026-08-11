/**
 * The main-owned staging slot for an Agent-generated card batch on its way to
 * AI Card Studio's editor.
 *
 * See `shared/agentCardBatchStaging.ts` for why this route exists and why the
 * studio cannot be addressed by any of the conversation-keyed ones. This is the
 * store half, and it is deliberately smaller than the image lane's: **one slot**,
 * not a map, because there is one AI Card Studio and it claims by being open
 * rather than by naming a conversation.
 *
 * Three properties, the same three the image lane promises:
 *
 * - **single-use** — `take` clears what it returns, so a batch is adopted by
 *   exactly one studio and re-opening Flashcards later shows nothing;
 * - **expiring** — a batch older than the TTL is dropped on the next access,
 *   claimed or not;
 * - **bounded** — by result count, cards per result and total retained bytes,
 *   all enforced by the shared normalizer before anything is held.
 *
 * It imports no `fs`, is never serialized, and is gone when the process exits.
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  AGENT_CARD_BATCH_BYTES_LIMIT,
  AGENT_CARD_BATCH_STAGING_CHANNELS,
  AGENT_CARD_BATCH_STAGING_TTL_MS,
  agentCardBatchBytes,
  agentCardBatchCardCount,
  normalizeAgentCardBatchStageRequest,
  type AgentCardBatchStageResult,
  type AgentCardBatchTakeResult,
  type AgentStagedCardBatch,
} from '../shared/agentCardBatchStaging';

interface StagedBatch extends AgentStagedCardBatch {
  stagedAt: number;
}

export interface AgentCardBatchStagingStore {
  stage(request: unknown, now?: number): AgentCardBatchStageResult;
  take(now?: number): AgentCardBatchTakeResult;
  /** Test seam: whether a batch is currently resident. */
  pending(now?: number): boolean;
}

export function createAgentCardBatchStagingStore(): AgentCardBatchStagingStore {
  let held: StagedBatch | null = null;
  let sequence = 0;

  /**
   * Drops the held batch if it is past its TTL.
   *
   * Run on every access rather than on a timer, exactly as the image lane does:
   * a timer would keep the process working for a slot that is empty almost all
   * the time, and the only moments the contents matter are the reads.
   */
  const expire = (now: number): void => {
    if (held && now - held.stagedAt >= AGENT_CARD_BATCH_STAGING_TTL_MS) held = null;
  };

  const stage = (request: unknown, now = Date.now()): AgentCardBatchStageResult => {
    const normalized = normalizeAgentCardBatchStageRequest(request);
    if (!normalized) return { ok: false, code: 'invalid-request' };
    // Measured on the normalized batch — the bytes that would actually be held —
    // and *before* the slot is touched, so a refused stage cannot be the thing
    // that discarded a batch already waiting for review.
    if (agentCardBatchBytes(normalized) > AGENT_CARD_BATCH_BYTES_LIMIT) {
      return { ok: false, code: 'too-large' };
    }
    expire(now);

    const replacedUnclaimed = held !== null;
    sequence += 1;
    held = {
      id: `agent-card-batch-${now.toString(36)}-${sequence.toString(36)}`,
      deckLabel: normalized.deckLabel,
      // Omitted rather than carried as `''` when the stager did not supply one,
      // so `deckBookId` is absent-or-real and the studio's fallback is a single
      // `??` rather than a truthiness check on a field that is always present.
      ...(normalized.deckBookId ? { deckBookId: normalized.deckBookId } : {}),
      source: normalized.source,
      results: normalized.results,
      stagedAt: now,
    };
    return {
      ok: true,
      results: normalized.results.length,
      cards: agentCardBatchCardCount(normalized.results),
      // Reported rather than silent: "generate again" is a gesture the user
      // makes, and the batch it replaced really is gone.
      replacedUnclaimed,
    };
  };

  const take = (now = Date.now()): AgentCardBatchTakeResult => {
    expire(now);
    if (!held) return { ok: true, batch: null };
    // Rebuilt field by field rather than by rest-destructuring `stagedAt` away:
    // this is the store's own bookkeeping, and an `AgentStagedCardBatch` that
    // carried it would not survive the shared normalizer on the far side.
    const batch: AgentStagedCardBatch = {
      id: held.id,
      deckLabel: held.deckLabel,
      ...(held.deckBookId ? { deckBookId: held.deckBookId } : {}),
      source: held.source,
      results: held.results,
    };
    held = null;
    return { ok: true, batch };
  };

  return {
    stage,
    take,
    pending: (now = Date.now()) => {
      expire(now);
      return held !== null;
    },
  };
}

/**
 * One staging store per process, resolved lazily and injectable for the reason
 * `agentImageStaging.ts` records: a test needs its own instance rather than
 * state left behind by the last one.
 */
let defaultStore: AgentCardBatchStagingStore | null = null;

export function getAgentCardBatchStagingStore(): AgentCardBatchStagingStore {
  if (!defaultStore) defaultStore = createAgentCardBatchStagingStore();
  return defaultStore;
}

/**
 * Tells every window a batch is waiting, so a Flashcards window that is already
 * open can adopt it without waiting to be re-mounted.
 *
 * Only an accepted stage announces, and it carries **nothing**: the cards stay
 * in main until a window claims them, so a broadcast can never be the thing that
 * copies a batch into a renderer that was not asking for one. There is nothing
 * to dedupe against either — the claim is single-use, so a second listener that
 * acts on the same announcement simply finds the slot empty.
 *
 * The sender is not excluded, matching `broadcastAgentWorkspace` and the image
 * lane: the Agent and Flashcards are frequently the same window.
 */
function broadcastStaged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    try {
      window.webContents.send(AGENT_CARD_BATCH_STAGING_CHANNELS.staged);
    } catch {
      // Best-effort after the batch is already resident. A window closing
      // between `isDestroyed` and `send` must not turn an accepted stage into a
      // failure the adapter reports as a failed generation.
    }
  }
}

/**
 * Registration hangs off `registerLocalAgentIpc()`, the same place the image
 * lane and the workspace store register: it is already the production Agent main
 * boundary and is already called once at boot.
 */
export function registerAgentCardBatchStagingIpc(
  resolveStore: () => AgentCardBatchStagingStore = getAgentCardBatchStagingStore,
): void {
  ipcMain.handle(
    AGENT_CARD_BATCH_STAGING_CHANNELS.stage,
    (_event, raw: unknown): AgentCardBatchStageResult => {
      const store = resolveStore();
      const result = store.stage(raw);
      // Announced only on acceptance, and after the slot holds the batch, so a
      // window that claims on the broadcast cannot arrive before the thing it
      // is being told about.
      if (result.ok) broadcastStaged();
      return result;
    },
  );
  ipcMain.handle(
    AGENT_CARD_BATCH_STAGING_CHANNELS.take,
    (): AgentCardBatchTakeResult => resolveStore().take(),
  );
}
