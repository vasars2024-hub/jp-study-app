// One Contextual Explain run: cache, prompt, provider, parse, store.
//
// Every dependency is injected, so the whole flow is testable without Electron,
// without SQLite and without a provider — which matters here more than usual,
// because the interesting states are the failures and none of them can be
// reached by actually calling a model in a test.

import type { AgentProviderPolicy } from '../../shared/agentWorkspace';
import {
  buildExplanationPrompt,
  parseExplanationReply,
  type LexiconExplainGrounding,
} from '../../shared/lexiconExplainPrompt';
import type {
  LexiconExplanation,
  LexiconExplanationInput,
  LexiconExplanationKey,
} from '../../shared/lexiconExplanations';

export type LexiconExplainError =
  | 'invalid-request'
  /** The provider refused or failed. `code` carries the runtime's own reason. */
  | 'provider-failed'
  /** The model answered, but not with an explanation this app can read. */
  | 'unparsable'
  /** The answer was good and the database would not keep it. */
  | 'not-stored';

export interface LexiconExplainResult {
  ok: boolean;
  /** True when nothing was sent anywhere — the answer was already on disk. */
  cached: boolean;
  explanation: LexiconExplanation | null;
  error?: LexiconExplainError;
  /** The provider runtime's error code, when the failure came from it. */
  code?: string;
}

export interface LexiconExplainRequest {
  key: LexiconExplanationKey;
  grounding: LexiconExplainGrounding;
  policy: AgentProviderPolicy;
  /**
   * Ask again even though an answer is cached.
   *
   * The surface's "explain again" control. It bypasses the read, not the write:
   * a refresh that produces a worse answer still replaces the old one, which is
   * what the user asked for, and the old one is not recoverable either way.
   *
   * It bypasses *both* caches. There are two, and only one of them is this
   * module's: `defaultAgentExecutionPolicy` runs Explain at `cache: 'session'`,
   * and the provider runtime keys that on the assembled prompt
   * (`providerRuntime.ts:727`). The explain prompt is deterministic for a word,
   * so the second click inside one app session was answered from process memory
   * in about 4 ms with the byte-identical reply, re-parsed and re-stored over
   * itself, and nothing on screen changed — an "Explain again" that cannot
   * produce a different answer is a dead control. See `providerCache` below.
   */
  refresh?: boolean;
}

export interface LexiconExplainDeps {
  readCached(key: LexiconExplanationKey): LexiconExplanation | null;
  store(key: LexiconExplanationKey, input: LexiconExplanationInput): LexiconExplanation | null;
  runProvider(
    policy: AgentProviderPolicy,
    prompt: string,
    options: { allowLocalFallback: boolean },
  ): Promise<{ text: string }>;
}

function providerErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * The policy this run hands the provider, with the session cache off for a refresh.
 *
 * Narrowed here rather than at the IPC handler because `refresh` is this
 * module's contract and the two caches have to be turned off by the same
 * decision, or the outer one is bypassed and the inner one silently answers.
 * Nothing else about the policy moves: the target, the budgets and the privacy
 * flags are the ones the caller froze, so a refresh cannot become a request the
 * user did not authorise.
 *
 * A policy already at `'off'` is returned unchanged — identity, not a copy — so
 * callers that compare the forwarded policy against the one they passed still do.
 */
function policyForRun(policy: AgentProviderPolicy, refresh: boolean): AgentProviderPolicy {
  if (!refresh || policy.cache === 'off') return policy;
  return { ...policy, cache: 'off' };
}

/**
 * Explain one word, reusing the stored answer when there is one.
 *
 * `allowLocalFallback` is hard `false`, and that is a decision rather than an
 * omission. The cache is keyed on the model, so an answer that quietly came from
 * the local model instead would be stored — and later served — under the name of
 * a model that never saw the word. Refusing is the honest failure: the surface
 * says the cloud provider is unavailable, which is true, instead of showing a
 * different model's answer under the selected one's label.
 */
export async function runLexiconExplain(
  deps: LexiconExplainDeps,
  request: LexiconExplainRequest,
): Promise<LexiconExplainResult> {
  if (!request.key.text.trim() || !request.key.model.trim()) {
    return { ok: false, cached: false, explanation: null, error: 'invalid-request' };
  }
  if (!request.refresh) {
    const cached = deps.readCached(request.key);
    if (cached) return { ok: true, cached: true, explanation: cached };
  }
  const prompt = buildExplanationPrompt(
    request.key.text,
    request.key.reading,
    request.key.glossLang,
    request.grounding,
  );
  let reply: { text: string };
  try {
    reply = await deps.runProvider(
      policyForRun(request.policy, request.refresh === true),
      prompt,
      { allowLocalFallback: false },
    );
  } catch (error) {
    return {
      ok: false,
      cached: false,
      explanation: null,
      error: 'provider-failed',
      ...(providerErrorCode(error) ? { code: providerErrorCode(error) } : {}),
    };
  }
  const input = parseExplanationReply(reply.text);
  // Nothing is stored for an unreadable reply. Caching the failure would serve an
  // instant blank to every later reader with nothing saying why, and the retry
  // that would fix it would never run.
  if (!input) return { ok: false, cached: false, explanation: null, error: 'unparsable' };
  const stored = deps.store(request.key, input);
  if (!stored) return { ok: false, cached: false, explanation: null, error: 'not-stored' };
  return { ok: true, cached: false, explanation: stored };
}
