/**
 * The main-owned staging area for captured images on their way to the Agent.
 *
 * See `shared/agentImageStaging.ts` for why this exists at all and why none of
 * the three existing routes could carry a payload. This is the store half: a
 * `Map` of conversation id to captures, and nothing else. It imports no `fs`, it
 * is never serialized, and it is gone when the process exits.
 *
 * Three properties do the work, and each of them is a promise about material the
 * user did not ask the app to keep:
 *
 * - **single-use** — `take` removes what it returns. A capture reaches exactly
 *   one claimant, so a second Agent window cannot re-read a screenshot the first
 *   one already consumed, and re-opening the Agent later shows nothing.
 * - **expiring** — anything older than the TTL is dropped on the next access,
 *   whether or not it is ever claimed.
 * - **bounded** — per conversation by what one request may carry, and
 *   process-wide by total bytes and conversation count, evicting oldest first.
 *
 * The eviction order is oldest-staged-first rather than least-recently-used: a
 * capture is claimed within seconds of being staged or it is abandoned, so age
 * is a direct measure of how likely it is that nobody is coming for it.
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  AGENT_IMAGE_STAGING_CHANNELS,
  AGENT_IMAGE_STAGING_CONVERSATION_LIMIT,
  AGENT_IMAGE_STAGING_PER_CONVERSATION_LIMIT,
  AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT,
  AGENT_IMAGE_STAGING_TTL_MS,
  normalizeAgentImageStageRequest,
  normalizeAgentImageTakeRequest,
  type AgentImageStageResult,
  type AgentImageTakeResult,
  type AgentStagedImage,
} from '../shared/agentImageStaging';
import { decodedBase64Bytes } from '../shared/agentExecutionBridge';

interface StagedEntry extends AgentStagedImage {
  stagedAt: number;
}

export interface AgentImageStagingStore {
  stage(request: unknown, now?: number): AgentImageStageResult;
  take(conversationId: unknown, now?: number): AgentImageTakeResult;
  /** Test seam: how many captures are currently resident, across all conversations. */
  size(): number;
  /** Test seam: how many bytes are currently resident. */
  bytes(): number;
}

export function createAgentImageStagingStore(): AgentImageStagingStore {
  // Insertion-ordered, and every write re-inserts, so iteration order is
  // oldest-conversation-first and eviction is a `keys().next()` away.
  const byConversation = new Map<string, StagedEntry[]>();
  let sequence = 0;

  const totalBytes = (): number => {
    let total = 0;
    for (const entries of byConversation.values()) {
      for (const entry of entries) total += entry.sizeBytes;
    }
    return total;
  };

  /**
   * Drops everything past its TTL, and any conversation left with nothing.
   *
   * Run on every access rather than on a timer: a timer would keep the process
   * doing work for a store that is empty almost all the time, and the only
   * moments the contents matter are the moments something reads them.
   */
  const expire = (now: number): void => {
    for (const [conversationId, entries] of [...byConversation]) {
      const live = entries.filter((entry) => now - entry.stagedAt < AGENT_IMAGE_STAGING_TTL_MS);
      if (live.length === 0) byConversation.delete(conversationId);
      else if (live.length !== entries.length) byConversation.set(conversationId, live);
    }
  };

  /**
   * Drops the oldest conversation that is not the one being staged into.
   *
   * Excluding the target matters: a conversation is re-inserted on every stage,
   * so without the exclusion a second capture into the *same* conversation could
   * evict the first one it was meant to join.
   */
  const evictOldestConversation = (except: string): boolean => {
    for (const conversationId of byConversation.keys()) {
      if (conversationId === except) continue;
      byConversation.delete(conversationId);
      return true;
    }
    return false;
  };

  const stage = (request: unknown, now = Date.now()): AgentImageStageResult => {
    const normalized = normalizeAgentImageStageRequest(request);
    if (!normalized) return { ok: false, code: 'invalid-request' };
    expire(now);

    const existing = byConversation.get(normalized.conversationId) ?? [];
    if (existing.length >= AGENT_IMAGE_STAGING_PER_CONVERSATION_LIMIT) {
      return { ok: false, code: 'too-many' };
    }

    const sizeBytes = decodedBase64Bytes(normalized.imageBase64);
    // Unreachable through the normalizer, which already measured it; kept so a
    // future direct caller cannot stage an unmeasured payload.
    if (sizeBytes === null) return { ok: false, code: 'invalid-request' };

    // Make room by age before refusing. A single capture larger than the whole
    // budget is impossible — the per-image bound is an eighth of it — so this
    // loop always terminates with either room or nothing left to evict.
    while (
      totalBytes() + sizeBytes > AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT
      && evictOldestConversation(normalized.conversationId)
    ) { /* evict until it fits */ }
    if (totalBytes() + sizeBytes > AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT) {
      return { ok: false, code: 'too-large' };
    }
    while (
      byConversation.size >= AGENT_IMAGE_STAGING_CONVERSATION_LIMIT
      && !byConversation.has(normalized.conversationId)
      && evictOldestConversation(normalized.conversationId)
    ) { /* evict until there is a slot */ }

    sequence += 1;
    const entry: StagedEntry = {
      // Prefixed like the composer's own ids so a claimed capture is indistinguishable
      // from a picked file once it reaches the attachment list, and unique across the
      // process so two conversations cannot collide on an attachment id.
      id: `attachment-capture-${now.toString(36)}-${sequence.toString(36)}`,
      name: normalized.name,
      mimeType: normalized.mimeType,
      imageBase64: normalized.imageBase64,
      sizeBytes,
      stagedAt: now,
    };
    // Delete-then-set so an existing conversation moves to the back of the
    // insertion order; otherwise a conversation that is staged into repeatedly
    // would stay the oldest key and evict itself.
    const next = [...existing, entry];
    byConversation.delete(normalized.conversationId);
    byConversation.set(normalized.conversationId, next);
    return { ok: true, sizeBytes };
  };

  const take = (conversationId: unknown, now = Date.now()): AgentImageTakeResult => {
    const id = normalizeAgentImageTakeRequest(conversationId);
    if (!id) return { ok: false, code: 'invalid-request' };
    expire(now);
    const entries = byConversation.get(id);
    if (!entries || entries.length === 0) return { ok: true, images: [] };
    byConversation.delete(id);
    return {
      ok: true,
      images: entries.map(({ stagedAt: _stagedAt, ...image }) => image),
    };
  };

  return {
    stage,
    take,
    size: () => [...byConversation.values()].reduce((sum, entries) => sum + entries.length, 0),
    bytes: totalBytes,
  };
}

/**
 * One staging store per process, alongside the one workspace store. Resolved
 * lazily and injectable for the same reason `agentSessionContext.ts` is: a test
 * needs its own instance rather than state left by the last one.
 */
let defaultStore: AgentImageStagingStore | null = null;

export function getAgentImageStagingStore(): AgentImageStagingStore {
  if (!defaultStore) defaultStore = createAgentImageStagingStore();
  return defaultStore;
}

/**
 * Tells every window a capture is waiting, so one showing the conversation
 * already can collect it.
 *
 * Only an accepted stage announces, and the conversation id is the whole
 * payload: the picture itself stays in main until a window claims it, so a
 * broadcast can never be the thing that copies a screenshot into a renderer that
 * was not asking for one.
 *
 * The sender is not excluded, matching `broadcastAgentWorkspace`. A capture and
 * the Agent that receives it are frequently in the same window — the shell is
 * mounted in the main window as well as in its pop-out.
 */
function broadcastStaged(conversationId: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    try {
      window.webContents.send(AGENT_IMAGE_STAGING_CHANNELS.staged, conversationId);
    } catch {
      // Best-effort after the capture is already resident. A window closing
      // between `isDestroyed` and `send` must not turn an accepted stage into a
      // failure the capturing surface reports to the user.
    }
  }
}

/**
 * Registration hangs off `registerLocalAgentIpc()` for the reason
 * `agentWorkspaceIpc.ts` records: it is already the production Agent main
 * boundary and is already called once at boot, so no edit to the shared entry
 * point another track is rewriting is needed.
 */
export function registerAgentImageStagingIpc(
  resolveStore: () => AgentImageStagingStore = getAgentImageStagingStore,
): void {
  ipcMain.handle(
    AGENT_IMAGE_STAGING_CHANNELS.stage,
    (_event, raw: unknown): AgentImageStageResult => {
      const result = resolveStore().stage(raw);
      // Re-normalized rather than trusting `raw.conversationId`: the store keys
      // on the *bounded* id, so announcing the raw one could name a conversation
      // no claim will ever match. It is the same pure function the store just
      // ran, on an input it has already accepted, and it decodes nothing.
      if (result.ok) {
        const staged = normalizeAgentImageStageRequest(raw);
        if (staged) broadcastStaged(staged.conversationId);
      }
      return result;
    },
  );
  ipcMain.handle(
    AGENT_IMAGE_STAGING_CHANNELS.take,
    (_event, raw: unknown): AgentImageTakeResult => resolveStore().take(raw),
  );
}
