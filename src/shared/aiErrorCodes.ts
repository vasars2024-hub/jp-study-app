/**
 * AI failures as codes, not prose.
 *
 * Main used to hand the renderer the provider runtime's English message ("AI
 * request timed out after 60s…"), and the Lens, the video grammar panel, the
 * translate analysis, the media assistant and the Deck Workbench printed it
 * verbatim inside a Japanese, Chinese or Russian interface. Main now returns one
 * of these codes and each surface says it in the UI language through
 * `aiErrorKey`. The English message may still travel alongside for logs; it is
 * never what the user reads when a code is present.
 */

export const AI_ERROR_CODES = [
  'ai-off',
  'no-key',
  'consent',
  'auth',
  'rate-limit',
  'spend',
  'too-long',
  'offline',
  'network',
  'timeout',
  'invalid',
  'truncated',
  'no-local-model',
  'refused',
  'empty-input',
  'no-answer',
  'ipc-failed',
  'cancelled',
  'other',
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === 'string' && (AI_ERROR_CODES as readonly string[]).includes(value);
}

/** Provider-runtime codes (`AiProviderErrorCode` in main) → the codes above. */
const RUNTIME_CODES: Readonly<Record<string, AiErrorCode>> = {
  cancelled: 'cancelled',
  timeout: 'timeout',
  'missing-credential': 'no-key',
  'cloud-disabled': 'ai-off',
  'ai-off': 'ai-off',
  'sensitive-context': 'refused',
  'input-budget': 'too-long',
  'cost-budget': 'spend',
  'spend-budget': 'spend',
  authentication: 'auth',
  'rate-limit': 'rate-limit',
  upstream: 'network',
  network: 'network',
  'local-model-missing': 'no-local-model',
  'invalid-response': 'invalid',
  'output-truncated': 'truncated',
};

/**
 * The code for anything thrown by an AI call: the provider runtime's typed
 * error, a timeout or abort, or a fetch that never got an answer. Duck-typed on
 * `code`/`name` so shared code can classify main's errors without importing main.
 */
export function aiErrorCodeOf(error: unknown): AiErrorCode {
  if (!error || typeof error !== 'object') return 'other';
  const { code, name } = error as { code?: unknown; name?: unknown };
  if (typeof code === 'string') {
    if (isAiErrorCode(code)) return code;
    const mapped = RUNTIME_CODES[code];
    if (mapped) return mapped;
  }
  if (name === 'TimeoutError') return 'timeout';
  if (name === 'AbortError') return 'cancelled';
  if (name === 'SyntaxError') return 'invalid';
  if (error instanceof TypeError) return 'network';
  return 'other';
}

/** The catalog key that says `code` in the UI language. */
export function aiErrorKey(code: AiErrorCode): string {
  return `aiError.${code}`;
}
