/**
 * Streaming and Cancel for the request/reply AI features (docs/AI_AUDIT.md F9):
 * Explain, the sentence and translate analyses, the study and speaking helpers,
 * Card Studio and the media assistant.
 *
 * The providers already stream (`providerRuntime.ts` `onTextChunk`, the local
 * model's `onTextChunk`); what these features lacked was a way back to the window
 * that asked. Each request carries the id the renderer made up for it, and every
 * chunk goes to THAT window only, on one channel, tagged with the id:
 *
 *   main  ── 'ai:streamChunk' { requestId, text } ──▶  the asking window
 *
 * The reply itself still comes back as the invoke's result and is parsed and
 * validated exactly as before; the chunks are a preview and change nothing that is
 * kept (`shared/aiStreamPreview.ts` turns them into readable text).
 *
 * `AiRequestRegistry` is the matching cancel map: a feature's `*:cancel` channel
 * aborts its request by id, and only the window that started it can.
 */
import type { WebContents } from 'electron';
import { normalizeAiStudyRequestId } from '../shared/aiStudyCommon';

export const AI_STREAM_CHUNK_CHANNEL = 'ai:streamChunk';

export interface AiStreamChunk {
  requestId: string;
  text: string;
  /**
   * A new reply starts under the same id (Card Studio asks once per word or
   * batch): the preview so far is over, and the chunks after this one are the
   * next reply's.
   */
  reset?: boolean;
}

type ChunkTarget = Pick<WebContents, 'send' | 'isDestroyed'>;

/** The request id a renderer request carries, when it is a well-formed one. */
export function aiStreamRequestId(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  return normalizeAiStudyRequestId((input as { requestId?: unknown }).requestId);
}

/**
 * A chunk callback that forwards to `sender`, or `undefined` (no streaming) when
 * there is no window or no id to tag the chunks with. Never throws: a window
 * closed mid-reply must not fail or cancel the request.
 */
export function aiStreamSink(
  sender: ChunkTarget | null | undefined,
  requestId: string | undefined,
): ((text: string) => void) | undefined {
  if (!sender || !requestId) return undefined;
  return (text: string) => {
    if (!text) return;
    try {
      if (!sender.isDestroyed()) sender.send(AI_STREAM_CHUNK_CHANNEL, { requestId, text } satisfies AiStreamChunk);
    } catch {
      // Presentation only.
    }
  };
}

/** Tells the asking window that the next chunks belong to a new reply (see `AiStreamChunk.reset`). */
export function aiStreamReset(sender: ChunkTarget | null | undefined, requestId: string | undefined): void {
  if (!sender || !requestId) return;
  try {
    if (!sender.isDestroyed()) sender.send(AI_STREAM_CHUNK_CHANNEL, { requestId, text: '', reset: true } satisfies AiStreamChunk);
  } catch {
    // Presentation only.
  }
}

/** The sink for an IPC invoke: its sender, and the id inside its request. */
export function aiStreamSinkFor(
  event: { sender?: ChunkTarget | null } | null | undefined,
  input: unknown,
): ((text: string) => void) | undefined {
  return aiStreamSink(event?.sender, aiStreamRequestId(input));
}

interface Running {
  controller: AbortController;
  senderId: number | undefined;
}

/** In-flight requests by id, for one feature's cancel channel. */
export class AiRequestRegistry {
  private readonly running = new Map<string, Running>();

  /**
   * The controller for a new request. A request already running under the same id
   * (the renderer reusing one) is aborted first: only the newest is wanted.
   */
  begin(requestId: string | undefined, senderId?: number): AbortController {
    const controller = new AbortController();
    if (!requestId) return controller;
    this.running.get(requestId)?.controller.abort();
    this.running.set(requestId, { controller, senderId });
    return controller;
  }

  /** Forgets the request, unless a newer one has taken its id. */
  end(requestId: string | undefined, controller: AbortController): void {
    if (requestId && this.running.get(requestId)?.controller === controller) this.running.delete(requestId);
  }

  /**
   * Aborts the request `raw` names. Another window's request is left alone, and
   * an unknown id is a no-op (`false`).
   */
  cancel(raw: unknown, senderId?: number): boolean {
    const id = normalizeAiStudyRequestId(raw);
    const entry = id ? this.running.get(id) : undefined;
    if (!entry) return false;
    if (senderId !== undefined && entry.senderId !== undefined && entry.senderId !== senderId) return false;
    entry.controller.abort();
    return true;
  }

  get size(): number {
    return this.running.size;
  }
}
