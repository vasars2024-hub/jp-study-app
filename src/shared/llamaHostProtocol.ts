/**
 * The wire between main and the local-model utility process (`jp-llama-host`).
 *
 * Everything llama.cpp owns — the native addon, the weights, the KV cache and every
 * `LlamaChatSession` — lives in that child. Main holds string session ids and these messages, so
 * nothing on this wire is a native object and nothing here can leak one into main's address space.
 *
 * Correlation is a monotonic `id` per request. A `chunk` carries the id of the `prompt` it belongs
 * to and no `ok`, so a streaming reply and its final answer are the same conversation.
 */

/** Opaque handle for one checked-out context plus the chat session built over it. */
export type LlamaSessionId = string;

export interface LlamaModelPoolRow {
  modelPath: string;
  leases: number;
  resident: boolean;
  awaitingRelease: boolean;
  graceMs: number;
}

export interface LlamaContextPoolRow {
  modelPath: string;
  contextSize: number;
  leased: boolean;
  awaitingRelease: boolean;
  graceMs: number;
}

export type LlamaHostRequest =
  | { id: number; kind: 'acquire'; modelPath: string; contextSize: number }
  | {
      id: number;
      kind: 'prompt';
      session: LlamaSessionId;
      prompt: string;
      maxTokens: number;
      /** When true the child posts `chunk` messages as tokens arrive. */
      stream: boolean;
    }
  /** Aborts the in-flight `prompt` whose request id is `target`. Never answered itself. */
  | { id: number; kind: 'abort'; target: number }
  | { id: number; kind: 'countTokens'; session: LlamaSessionId; text: string }
  | { id: number; kind: 'resetHistory'; session: LlamaSessionId }
  | { id: number; kind: 'release'; session: LlamaSessionId }
  | { id: number; kind: 'stats' };

/**
 * Discriminated on `kind` alone, deliberately: an `ok` flag beside it made `chunk` the one variant
 * without the discriminant, and narrowing a union by a property that some members lack does not
 * work — every read of `.text` or `.tokens` was then an error.
 */
export type LlamaHostResponse =
  | { id: number; kind: 'acquire'; session: LlamaSessionId; warm: boolean }
  | { id: number; kind: 'prompt'; text: string }
  | { id: number; kind: 'countTokens'; tokens: number }
  | { id: number; kind: 'ok' }
  | { id: number; kind: 'stats'; models: LlamaModelPoolRow[]; contexts: LlamaContextPoolRow[] }
  /** Streamed generation. Not a settlement: the `prompt` reply still follows. */
  | { id: number; kind: 'chunk'; text: string }
  /**
   * `name` is carried because `translate.ts` distinguishes a user cancel from a timeout by
   * `err.name === 'AbortError'`, and an Error rebuilt in main from a message alone loses that.
   */
  | { id: number; kind: 'error'; error: string; name?: string };

/** Sent once, unprompted, when the child is about to exit because its pools went empty. */
export interface LlamaHostFarewell {
  kind: 'bye';
  reason: 'idle';
}

export function isLlamaHostFarewell(value: unknown): value is LlamaHostFarewell {
  return Boolean(value) && (value as LlamaHostFarewell).kind === 'bye';
}

/**
 * The rejection a generation that was aborted mid-flight settles with.
 *
 * Both prompt paths pass `stopOnAbortSignal: true`, and node-llama-cpp documents what that means:
 * "when a response already started being generated and then the signal is aborted, the generation
 * will stop and **the response will be returned as is instead of throwing an error**". Kept,
 * because stopping cleanly is what leaves the sequence and its KV cache in the consistent state
 * `llamaContextPool` hands back warm — a thrown-through generation does not.
 *
 * But the value must not reach a caller as an answer. Every consumer of `LlamaSessionHandle.prompt`
 * treats what it resolves with as the COMPLETE output: `translate.ts` runs it through
 * `extractJsonish`, and `localAgent.ts` parses it as a plan. Resolving with partial text turns a
 * user cancel or a 90 s timeout into a truncated translation presented as a finished one, which is
 * the dishonest-failure shape CLAUDE.md forbids. Streaming callers still receive everything that
 * was generated through `onTextChunk`; only the return value is refused.
 */
export function llamaAbortedError(): Error {
  const err = new Error('The generation was aborted before it finished.');
  // `name`, not the message, is what `translate.ts` and the host protocol both key on.
  err.name = 'AbortError';
  return err;
}
