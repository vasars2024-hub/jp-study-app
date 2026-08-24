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

export type LlamaHostResponse =
  | { id: number; ok: true; kind: 'acquire'; session: LlamaSessionId; warm: boolean }
  | { id: number; ok: true; kind: 'prompt'; text: string }
  | { id: number; ok: true; kind: 'countTokens'; tokens: number }
  | { id: number; ok: true; kind: 'ok' }
  | { id: number; ok: true; kind: 'stats'; models: LlamaModelPoolRow[]; contexts: LlamaContextPoolRow[] }
  /** Streamed generation. Not a settlement: the `prompt` reply still follows. */
  | { id: number; kind: 'chunk'; text: string }
  /**
   * `name` is carried because `translate.ts` distinguishes a user cancel from a timeout by
   * `err.name === 'AbortError'`, and an Error rebuilt in main from a message alone loses that.
   */
  | { id: number; ok: false; error: string; name?: string };

/** Sent once, unprompted, when the child is about to exit because its pools went empty. */
export interface LlamaHostFarewell {
  kind: 'bye';
  reason: 'idle';
}

export function isLlamaHostFarewell(value: unknown): value is LlamaHostFarewell {
  return Boolean(value) && (value as LlamaHostFarewell).kind === 'bye';
}
