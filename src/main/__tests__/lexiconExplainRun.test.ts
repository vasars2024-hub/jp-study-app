// @vitest-environment node
//
// The claim under test: a cache hit sends nothing, a failure of any kind stores
// nothing, and a refresh asks again. The interesting states here are all failures
// and none of them is reachable by actually calling a model, which is why every
// dependency is injected.
import { describe, expect, it, vi } from 'vitest';
import { runLexiconExplain, type LexiconExplainDeps } from '../dictionary/explainRun';
import { EXPLANATION_PROMPT_VERSION, type LexiconExplanation } from '../../shared/lexiconExplanations';
import type { AgentProviderPolicy } from '../../shared/agentWorkspace';

const POLICY = {
  target: { kind: 'cloud', providerId: 'gemini-2.5-flash', model: 'gemini-2.5-flash' },
  allowCloud: true,
  cache: 'off',
} as AgentProviderPolicy;

const KEY = {
  lang: 'ja',
  text: '猫',
  reading: 'ねこ',
  glossLang: 'en',
  model: 'cloud:gemini-2.5-flash:gemini-2.5-flash',
  promptVersion: EXPLANATION_PROMPT_VERSION,
};

const STORED = (summary: string): LexiconExplanation => ({
  ...KEY,
  summary,
  sections: [{ kind: 'nuance', body: 'Unmarked.' }],
  createdAt: 1,
});

const REPLY = '{"summary":"A cat.","sections":[{"kind":"nuance","body":"Unmarked."}]}';

function deps(over: Partial<LexiconExplainDeps> = {}): LexiconExplainDeps {
  return {
    readCached: vi.fn(() => null),
    store: vi.fn((_key, input) => STORED(input.summary)),
    runProvider: vi.fn(async () => ({ text: REPLY })),
    ...over,
  };
}

const request = (over = {}) => ({ key: KEY, grounding: { glosses: ['cat'] }, policy: POLICY, ...over });

describe('a cache hit', () => {
  it('sends nothing anywhere', async () => {
    const d = deps({ readCached: vi.fn(() => STORED('cached')) });
    const result = await runLexiconExplain(d, request());
    expect(result).toEqual({ ok: true, cached: true, explanation: STORED('cached') });
    expect(d.runProvider).not.toHaveBeenCalled();
    expect(d.store).not.toHaveBeenCalled();
  });

  it('is bypassed by a refresh, which then replaces the stored answer', async () => {
    const d = deps({ readCached: vi.fn(() => STORED('cached')) });
    const result = await runLexiconExplain(d, request({ refresh: true }));
    expect(d.readCached).not.toHaveBeenCalled();
    expect(d.runProvider).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.explanation?.summary).toBe('A cat.');
  });
});

// There are two caches and only one of them belongs to this module. The live
// Explain policy is `cache: 'session'` (`defaultAgentExecutionPolicy`), whose
// key is the assembled prompt — deterministic for a word — so a refresh that
// bypassed only the stored answer got the byte-identical reply back out of
// process memory in ~4 ms and re-stored it over itself. Measured on the
// Dictionary lens: "Explain again" changed nothing on screen, with no error,
// no blocked state and nothing in the error log.
describe('a refresh and the provider session cache', () => {
  const SESSION = { ...POLICY, cache: 'session' } as AgentProviderPolicy;
  const forwardedPolicy = (d: LexiconExplainDeps): AgentProviderPolicy =>
    (d.runProvider as ReturnType<typeof vi.fn>).mock.calls[0][0];

  it('turns the session cache off, keeping every other term of the policy', async () => {
    const d = deps({ readCached: vi.fn(() => STORED('cached')) });
    await runLexiconExplain(d, request({ policy: SESSION, refresh: true }));
    const sent = forwardedPolicy(d);
    expect(sent.cache).toBe('off');
    expect({ ...sent, cache: 'session' }).toEqual(SESSION);
  });

  // The control: without it, a run that forwarded `'off'` unconditionally would
  // pass the assertion above while quietly paying for every first lookup.
  it('leaves the session cache on when nothing asked for a refresh', async () => {
    const d = deps();
    await runLexiconExplain(d, request({ policy: SESSION }));
    expect(forwardedPolicy(d).cache).toBe('session');
  });

  it('forwards a policy already at off unchanged, by identity', async () => {
    const d = deps();
    await runLexiconExplain(d, request({ refresh: true }));
    expect(forwardedPolicy(d)).toBe(POLICY);
  });
});

describe('a miss', () => {
  it('asks once, stores the parsed answer, and refuses a local substitution', async () => {
    const d = deps();
    const result = await runLexiconExplain(d, request());
    expect(result.ok).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.explanation?.summary).toBe('A cat.');
    const [policy, prompt, options] = (d.runProvider as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(policy).toBe(POLICY);
    expect(prompt).toContain('Explain the word 猫 (ねこ)');
    expect(prompt).toContain('- cat');
    // The cache is keyed on the model. A quietly substituted local answer would
    // be stored, and later served, under the name of a model that never saw it.
    expect(options).toEqual({ allowLocalFallback: false });
  });
});

describe('every failure stores nothing', () => {
  it('carries the provider runtime code through', async () => {
    const error = Object.assign(new Error('no key'), { code: 'missing-credential' });
    const d = deps({ runProvider: vi.fn(async () => { throw error; }) });
    const result = await runLexiconExplain(d, request());
    expect(result).toEqual({
      ok: false, cached: false, explanation: null, error: 'provider-failed', code: 'missing-credential',
    });
    expect(d.store).not.toHaveBeenCalled();
  });

  it('omits the code when the throw carries none', async () => {
    const d = deps({ runProvider: vi.fn(async () => { throw new Error('boom'); }) });
    const result = await runLexiconExplain(d, request());
    expect(result.error).toBe('provider-failed');
    expect('code' in result).toBe(false);
  });

  it('reports an unreadable reply rather than caching a blank', async () => {
    const d = deps({ runProvider: vi.fn(async () => ({ text: 'I cannot help with that.' })) });
    const result = await runLexiconExplain(d, request());
    expect(result.error).toBe('unparsable');
    expect(d.store).not.toHaveBeenCalled();
  });

  it('reports a good answer the database would not keep', async () => {
    const d = deps({ store: vi.fn(() => null) });
    const result = await runLexiconExplain(d, request());
    expect(result).toEqual({ ok: false, cached: false, explanation: null, error: 'not-stored' });
  });

  it('refuses a request with no word or no model, without touching the cache', async () => {
    const d = deps();
    expect((await runLexiconExplain(d, request({ key: { ...KEY, text: '  ' } }))).error)
      .toBe('invalid-request');
    expect((await runLexiconExplain(d, request({ key: { ...KEY, model: '' } }))).error)
      .toBe('invalid-request');
    expect(d.readCached).not.toHaveBeenCalled();
    expect(d.runProvider).not.toHaveBeenCalled();
  });
});
