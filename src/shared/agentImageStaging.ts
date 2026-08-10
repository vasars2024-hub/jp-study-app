/**
 * The transport that lets a *capture* become an Agent image attachment.
 *
 * The vision lane (`agentExecutionBridge.ts`) accepts an image, but nothing
 * could produce one except the composer's own file picker, because a hand-off
 * from a capturing surface into the Agent window has no route a payload may
 * travel. The three routes that already exist are each wrong for it:
 *
 * - the **persisted workspace store** is the hand-off's route for context, and
 *   an image payload may not enter it — `AgentAttachment` is metadata only and
 *   an attachment is `retained: false` by contract, so the store is the one
 *   place a picture of the user's screen must never reach;
 * - **`main/agentSessionContext.ts`** is in memory and session-only, which is
 *   right, but it is *derived from the workspace document* — it absorbs what a
 *   save passes through it. A payload would have to travel through the persisted
 *   document to get in, which is the thing being avoided;
 * - a **renderer-held copy** does not reach a pop-out, and the Agent window is
 *   routinely a separate `BrowserWindow` from the one that captured. That is the
 *   exact defect the `agentWorkspace:changed` broadcast was added to fix.
 *
 * So this is the fourth route, and it is deliberately narrow: main-process
 * memory, keyed by conversation, bounded, expiring, and **single-use**. Nothing
 * here touches `fs`. A staged image that is never claimed is dropped by its TTL,
 * and a claimed one is gone from main the moment it is handed over — the
 * strongest lifetime the contract can offer for material the user only ever
 * meant one question to see.
 *
 * Keyed by conversation rather than by window: the image belongs to the
 * conversation the hand-off attached its context to, so the Agent shell claims
 * it by selecting that conversation and no window has to be named or addressed.
 */

import {
  AGENT_EXECUTION_ATTACHMENT_LIMIT,
  AGENT_EXECUTION_IMAGE_BYTES_LIMIT,
  AGENT_EXECUTION_IMAGE_LIMIT,
  AGENT_EXECUTION_IMAGE_MIME_TYPES,
  decodedBase64Bytes,
  hasForbiddenAttachmentField,
  type AgentExecutionAttachment,
  type AgentExecutionImageMimeType,
} from './agentExecutionBridge';

export const AGENT_IMAGE_STAGING_CHANNELS = {
  stage: 'agentImageStaging:stage',
  take: 'agentImageStaging:take',
  /**
   * Main → every window, after a capture is accepted.
   *
   * Without it the lane loses to its own ordering. A hand-off saves the context
   * first and stages the capture second, because the conversation id is what the
   * save decides — so the `agentWorkspace:changed` push reaches an Agent that is
   * *already open* before the image exists, it claims nothing, and the capture
   * sits in main until its TTL drops it. Announcing the stage itself is what
   * makes the second half of the gesture arrive at all.
   */
  staged: 'agentImageStaging:staged',
} as const;

/**
 * How long an unclaimed capture survives in main.
 *
 * Long enough that opening the Agent, reading the shelf and deciding what to ask
 * is comfortable; short enough that a screenshot the user walked away from is
 * not still resident an hour later. It is not a security boundary — the process
 * memory is the user's own — it is a promise about how long the app keeps
 * something the user did not ask it to keep.
 */
export const AGENT_IMAGE_STAGING_TTL_MS = 10 * 60_000;
/**
 * Per conversation, deliberately the same bound the execution request enforces.
 * Staging more than one request may carry would only be able to produce an
 * attachment set main is about to refuse.
 */
export const AGENT_IMAGE_STAGING_PER_CONVERSATION_LIMIT = AGENT_EXECUTION_IMAGE_LIMIT;
/** Process-wide backstops, so a surface that stages in a loop cannot grow without end. */
export const AGENT_IMAGE_STAGING_CONVERSATION_LIMIT = 16;
export const AGENT_IMAGE_STAGING_TOTAL_BYTES_LIMIT = 32 * 1024 * 1024;

const CONVERSATION_ID_MAX = 180;
const NAME_MAX = 500;

export type AgentImageStagingFailureCode =
  | 'invalid-request'
  | 'too-large'
  | 'too-many'
  | 'bridge-unavailable';

/** What main holds, and what a claim hands back. */
export interface AgentStagedImage {
  id: string;
  name: string;
  mimeType: AgentExecutionImageMimeType;
  imageBase64: string;
  sizeBytes: number;
}

export interface AgentImageStageRequest {
  conversationId: string;
  name: string;
  mimeType: AgentExecutionImageMimeType;
  imageBase64: string;
}

export type AgentImageStageResult =
  | { ok: true; sizeBytes: number }
  | { ok: false; code: AgentImageStagingFailureCode };

export type AgentImageTakeResult =
  | { ok: true; images: AgentStagedImage[] }
  | { ok: false; code: AgentImageStagingFailureCode };

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Splits a `data:` URL into the two fields this contract carries.
 *
 * Capture surfaces already hold their screenshot as a data URL — `screenOcr.ts`
 * returns one and `shared/readingLens.ts` validates one — while both the staging
 * contract and `AgentExecutionAttachment` forbid the prefix, because a declared
 * `mimeType` that disagrees with an embedded one is two claims about the same
 * bytes. Doing the split in one shared place is what keeps a producer from
 * inventing a third spelling of it.
 *
 * The format is taken from the URL rather than guessed, and refused unless it is
 * one of the three the lane accepts, so a producer cannot widen the set by
 * relabelling.
 */
export function splitImageDataUrl(
  value: unknown,
): { mimeType: AgentExecutionImageMimeType; imageBase64: string } | null {
  if (typeof value !== 'string') return null;
  const match = /^data:([a-z0-9+/.-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value.trim());
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (!(AGENT_EXECUTION_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  return { mimeType: mimeType as AgentExecutionImageMimeType, imageBase64: match[2] };
}

export function normalizeAgentImageStageRequest(value: unknown): AgentImageStageRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  // The same refusal the execution normalizer makes, because this is the second
  // door into the attachment world and the boundary has to hold at both.
  if (hasForbiddenAttachmentField(raw)) return null;
  const conversationId = boundedText(raw.conversationId, CONVERSATION_ID_MAX);
  const name = boundedText(raw.name, NAME_MAX);
  const mimeType = boundedText(raw.mimeType, 200).toLowerCase();
  if (!conversationId || !name) return null;
  if (!(AGENT_EXECUTION_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  if (typeof raw.imageBase64 !== 'string') return null;
  // The same arithmetic check the execution normalizer runs, for the same
  // reason: this is renderer input arriving in main, and a string that is about
  // to be rejected must not be decoded into megabytes first.
  const sizeBytes = decodedBase64Bytes(raw.imageBase64);
  if (sizeBytes === null || sizeBytes === 0) return null;
  if (sizeBytes > AGENT_EXECUTION_IMAGE_BYTES_LIMIT) return null;
  return {
    conversationId,
    name,
    mimeType: mimeType as AgentExecutionImageMimeType,
    imageBase64: raw.imageBase64,
  };
}

export function normalizeAgentImageTakeRequest(value: unknown): string | null {
  return boundedText(value, CONVERSATION_ID_MAX) || null;
}

/**
 * A claimed image as a composer attachment.
 *
 * Built here rather than in the shell so the size the composer shows and the
 * size main re-derives come from one place — the execution normalizer refuses an
 * image whose `sizeBytes` disagrees with its payload, so a second implementation
 * of this shape is a rejected request waiting to happen.
 *
 * `contentText` is empty and that is not an omission. A capture's OCR text
 * reaches the same conversation as a `reading-passage` context item, which the
 * prompt builder already renders; repeating it here would put the passage in the
 * request twice.
 */
export function stagedImageAttachment(image: AgentStagedImage): AgentExecutionAttachment {
  return {
    id: image.id,
    kind: 'image',
    name: image.name,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    sensitivity: 'sensitive',
    retained: false,
    contentText: '',
    imageBase64: image.imageBase64,
  };
}

/** What a claim could actually put in the composer, and what would not fit. */
export interface AgentStagedImageMerge {
  attachments: AgentExecutionAttachment[];
  /** Claimed captures the composer had no room for. Never silently zero-ed. */
  dropped: number;
}

/**
 * Adds claimed captures to whatever the composer is already holding.
 *
 * The two bounds are the request's own — five attachments and two images — so a
 * claim can never build a composer state that `normalizeAgentExecutionRequest`
 * is about to refuse. That matters more here than in the file picker: the user
 * did not choose this moment, the capture simply arrived, and an attachment list
 * that cannot be sent would be a dead Send button with no explanation.
 *
 * Anything that does not fit is **counted, not dropped quietly**. The claim has
 * already removed it from main — staging is single-use — so there is no second
 * chance at it, and the caller has to say so rather than let the user ask about
 * a screenshot the composer discarded on the way in.
 *
 * Ids already present are skipped rather than counted as dropped: that is a
 * re-delivery of something the composer holds, not a loss.
 */
export function mergeStagedImageAttachments(
  current: readonly AgentExecutionAttachment[],
  claimed: readonly AgentStagedImage[],
): AgentStagedImageMerge {
  const attachments = [...current];
  const present = new Set(attachments.map((attachment) => attachment.id));
  let images = attachments.filter((attachment) => attachment.kind === 'image').length;
  let dropped = 0;
  for (const image of claimed) {
    if (present.has(image.id)) continue;
    if (attachments.length >= AGENT_EXECUTION_ATTACHMENT_LIMIT
      || images >= AGENT_EXECUTION_IMAGE_LIMIT) {
      dropped += 1;
      continue;
    }
    attachments.push(stagedImageAttachment(image));
    present.add(image.id);
    images += 1;
  }
  return { attachments, dropped };
}

function normalizeStagedImage(value: unknown): AgentStagedImage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = boundedText(raw.id, CONVERSATION_ID_MAX);
  const name = boundedText(raw.name, NAME_MAX);
  const mimeType = boundedText(raw.mimeType, 200).toLowerCase();
  if (!id || !name) return null;
  if (!(AGENT_EXECUTION_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  if (typeof raw.imageBase64 !== 'string') return null;
  const sizeBytes = decodedBase64Bytes(raw.imageBase64);
  if (sizeBytes === null || sizeBytes === 0 || sizeBytes > AGENT_EXECUTION_IMAGE_BYTES_LIMIT) {
    return null;
  }
  return {
    id,
    name,
    mimeType: mimeType as AgentExecutionImageMimeType,
    imageBase64: raw.imageBase64,
    sizeBytes,
  };
}

/**
 * Renderer-side validation of what main handed back.
 *
 * Symmetrical with every other bridge in this area: the renderer does not trust
 * a payload just because it arrived over IPC, and re-deriving `sizeBytes` here
 * means a claimed image that would be refused by the execution normalizer is
 * dropped before it can reach the composer as an attachment that can never send.
 */
export function normalizeAgentImageTakeResult(value: unknown): AgentImageTakeResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'bridge-unavailable' };
  }
  const raw = value as Record<string, unknown>;
  if (raw.ok === true && Array.isArray(raw.images)) {
    const images: AgentStagedImage[] = [];
    const ids = new Set<string>();
    for (const entry of raw.images) {
      const image = normalizeStagedImage(entry);
      if (!image || ids.has(image.id)) continue;
      ids.add(image.id);
      images.push(image);
      if (images.length >= AGENT_IMAGE_STAGING_PER_CONVERSATION_LIMIT) break;
    }
    return { ok: true, images };
  }
  const code = raw.code;
  return {
    ok: false,
    code: code === 'invalid-request' || code === 'too-large' || code === 'too-many'
      ? code
      : 'bridge-unavailable',
  };
}

export function normalizeAgentImageStageResult(value: unknown): AgentImageStageResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'bridge-unavailable' };
  }
  const raw = value as Record<string, unknown>;
  if (raw.ok === true && typeof raw.sizeBytes === 'number' && Number.isSafeInteger(raw.sizeBytes)) {
    return { ok: true, sizeBytes: raw.sizeBytes };
  }
  const code = raw.code;
  return {
    ok: false,
    code: code === 'invalid-request' || code === 'too-large' || code === 'too-many'
      ? code
      : 'bridge-unavailable',
  };
}
