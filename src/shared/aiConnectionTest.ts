/**
 * What Settings > AI's "Test connection" reports, and how any AI error code is
 * named in the user's language.
 *
 * Main returns codes, never prose (audit F8: AI errors used to arrive as English
 * sentences inside a Japanese UI). The renderer turns a code into a catalog key
 * here, so every surface that shows an AI failure says the same thing for it.
 */

export type AiConnectionTestResult =
  | { ok: true; model?: string; latencyMs: number }
  | { ok: false; code: string; status?: number };

/**
 * The codes with their own sentence. Anything else (a code added later, or a
 * platform failure) reads as the generic failure rather than as a raw code.
 */
const KNOWN_ERROR_CODES = new Set([
  'ai-off',
  'cloud-disabled',
  'missing-credential',
  'authentication',
  'rate-limit',
  'upstream',
  'network',
  'timeout',
  'cancelled',
  'invalid-response',
  'output-truncated',
  'spend-budget',
  'cost-budget',
  'vision-unsupported',
  'unknown-provider',
  'local-model-missing',
]);

/** The catalog key for an AI error code (`aiProv.error.*`). */
export function aiErrorMessageKey(code: string | undefined): string {
  return code && KNOWN_ERROR_CODES.has(code) ? `aiProv.error.${code}` : 'aiProv.error.generic';
}

export function normalizeAiConnectionTestResult(value: unknown): AiConnectionTestResult {
  if (!value || typeof value !== 'object') return { ok: false, code: 'generic' };
  const raw = value as Partial<Record<string, unknown>>;
  if (raw.ok === true) {
    return {
      ok: true,
      latencyMs: typeof raw.latencyMs === 'number' && Number.isFinite(raw.latencyMs) ? raw.latencyMs : 0,
      ...(typeof raw.model === 'string' && raw.model ? { model: raw.model } : {}),
    };
  }
  return {
    ok: false,
    code: typeof raw.code === 'string' ? raw.code : 'generic',
    ...(typeof raw.status === 'number' && Number.isFinite(raw.status) ? { status: raw.status } : {}),
  };
}
