/**
 * Mirror Writing's API evaluator must not depend on a renderer `fetch`.
 *
 * The packaged CSP's `connect-src` names loopback `127.0.0.1` and HuggingFace only, so a
 * renderer `fetch` to the endpoint a user configures (`https://api.openai.com/...`, or a
 * local server such as `http://localhost:11434/v1`) is refused before it leaves the page —
 * "Failed to fetch", in packaged builds only. Here the renderer `fetch` behaves exactly like
 * that CSP refusal, and the evaluation must still arrive: through main's bridge.
 *
 * Since 2026-10-11 (audit E11): the request carries a `model`, the key is read by main from
 * the credential vault (it never crosses the bridge and is no longer kept in localStorage),
 * a fenced reply parses, and an "app AI" backend grades through Settings > AI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { MIRROR_TEXTS } from '../../renderer/data/mirrorTexts';
import { DEFAULT_GAME_ARENA_SETTINGS } from '../../renderer/games/settings';
import { evaluateMirrorWriting, resolveMirrorBackend } from '../../renderer/games/mirrorWriting/evaluator';
import { evaluateMirrorWithAppAi, postMirrorEvaluation, type MirrorAppAiDeps } from '../../main/mirrorEvaluatorProxy';
import { AiProviderRuntimeError } from '../../main/providerRuntime';
import { setAiCloudFeatureReader, setAiFeaturesReader } from '../../main/aiFeatureGate';
import { cspDirectiveSources } from '../contentSecurityPolicy';
import { mirrorChatCompletionsUrl, type MirrorAppAiRequest, type MirrorEvaluateRequest } from '../mirrorEvaluatorIpc';

const axis = { score: 82, tips: [] };
const evaluationJson = { total: 82, axes: { grammar: axis, vocabulary: axis, flow: axis, fidelity: axis }, summary: 'Good.' };
const completion = { choices: [{ message: { content: JSON.stringify(evaluationJson) } }] };
const settings = {
  ...DEFAULT_GAME_ARENA_SETTINGS,
  mirrorBackend: 'api' as const,
  mirrorBackendChosen: true,
  mirrorApiUrl: 'https://api.openai.com/v1/chat/completions',
  mirrorApiModel: 'gpt-5-mini',
};
const draft = '今日は友だちと公園へ行きました。とても楽しかったです。';

/** A renderer fetch that behaves like the packaged CSP: nothing leaves the page. */
function cspRefusingFetch(url: string): Promise<Response> {
  const origin = new URL(url).origin;
  const allowed = (cspDirectiveSources('connect-src') ?? []).some((s) => s.replace(':*', '') === origin.replace(/:\d+$/, ''));
  return allowed ? Promise.reject(new Error('unexpected network in test')) : Promise.reject(new TypeError('Failed to fetch'));
}

describe('Mirror Writing API evaluator in a packaged renderer', () => {
  const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch; localStorage?: Storage };
  const realFetch = g.fetch;
  let sent: MirrorEvaluateRequest[];
  let replyBody: unknown;

  beforeEach(() => {
    sent = [];
    replyBody = completion;
    g.fetch = vi.fn(cspRefusingFetch) as unknown as typeof fetch;
    const mainFetch = vi.fn(async () => new Response(JSON.stringify(replyBody), { status: 200 }));
    g.window = {
      api: {
        gamesMirrorEvaluate: (req: MirrorEvaluateRequest) => {
          sent.push(req);
          return postMirrorEvaluation(req, mainFetch, undefined, () => 'vault-key');
        },
      },
    };
  });
  afterEach(() => {
    g.fetch = realFetch;
    delete g.window;
  });

  it('the endpoint a user configures is refused by connect-src (why the bridge exists)', async () => {
    await expect(g.fetch(settings.mirrorApiUrl)).rejects.toThrow('Failed to fetch');
    await expect(g.fetch('https://localhost:8000/v1/chat/completions')).rejects.toThrow('Failed to fetch');
  });

  it('scores the draft through main, sends a model, and never sends the key from the renderer', async () => {
    const result = await evaluateMirrorWriting(settings, MIRROR_TEXTS[0], draft);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.total).toBe(82);
    expect(g.fetch).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(settings.mirrorApiUrl);
    expect(sent[0]).not.toHaveProperty('apiKey');
    expect((sent[0].body as { model?: string }).model).toBe('gpt-5-mini');
  });

  it('parses a reply whose JSON is wrapped in a code fence', async () => {
    replyBody = { choices: [{ message: { content: `Here you go:\n\`\`\`json\n${JSON.stringify(evaluationJson)}\n\`\`\`` } }] };
    const result = await evaluateMirrorWriting(settings, MIRROR_TEXTS[0], draft);
    expect(result.ok).toBe(true);
  });

  it('turns an Ollama / LM Studio base URL into the chat-completions endpoint', async () => {
    const local = { ...settings, mirrorApiUrl: 'http://localhost:11434/v1', mirrorApiModel: 'qwen3:8b' };
    await evaluateMirrorWriting(local, MIRROR_TEXTS[0], draft);
    expect(sent[0].url).toBe('http://localhost:11434/v1/chat/completions');
    expect(mirrorChatCompletionsUrl('http://localhost:1234/v1/')).toBe('http://localhost:1234/v1/chat/completions');
    expect(mirrorChatCompletionsUrl('https://h/custom/grade')).toBe('https://h/custom/grade');
  });

  it('needs only a URL: a local server takes no key', async () => {
    const noUrl = await evaluateMirrorWriting({ ...settings, mirrorApiUrl: '' }, MIRROR_TEXTS[0], draft);
    expect(noUrl.ok).toBe(false);
    if (!noUrl.ok) expect(noUrl.reason).toBe('api-missing');
  });

  it('reports an endpoint error status with its catalog key', async () => {
    (g.window as { api: Record<string, unknown> }).api.gamesMirrorEvaluate = (req: MirrorEvaluateRequest) =>
      postMirrorEvaluation(req, async () => new Response('nope', { status: 401 }), undefined, () => '');
    const result = await evaluateMirrorWriting(settings, MIRROR_TEXTS[0], draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messageKey).toBe('games.mirror.error.network');
      expect(result.messageVars).toEqual({ status: 401 });
    }
  });
});

describe('main-side Mirror Writing request', () => {
  it('POSTs the JSON body with the vault key as a bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(completion), { status: 200 }));
    const out = await postMirrorEvaluation(
      { url: 'http://localhost:8000/v1/chat/completions', body: { a: 1 } },
      fetchImpl,
      undefined,
      () => 'k',
    );
    expect(out).toEqual({ ok: true, status: 200, data: completion });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(init.body).toBe('{"a":1}');
  });

  it('sends no Authorization header when no key is saved (Ollama, LM Studio)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(completion), { status: 200 }));
    await postMirrorEvaluation({ url: 'http://localhost:1234/v1/chat/completions', body: {} }, fetchImpl, undefined, () => '');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers as Record<string, string>).not.toHaveProperty('Authorization');
  });

  it('refuses anything that is not a plain http(s) endpoint, without sending', async () => {
    const fetchImpl = vi.fn();
    for (const url of ['file:///C:/x', 'app://bundle/index.html', 'https://user:pw@host/v1', 'not a url']) {
      expect(await postMirrorEvaluation({ url, body: {} }, fetchImpl, undefined, () => 'k')).toEqual({ ok: false, reason: 'bad-request' });
    }
    expect(await postMirrorEvaluation({ url: 'https://h/v1', body: 'x'.repeat(300 * 1024) }, fetchImpl, undefined, () => 'k'))
      .toEqual({ ok: false, reason: 'bad-request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('distinguishes a timeout, a network failure and a non-JSON answer', async () => {
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const key = () => 'k';
    expect(await postMirrorEvaluation({ url: 'https://h/v1', body: {} }, hang, 20, key)).toEqual({ ok: false, reason: 'timeout' });
    expect(await postMirrorEvaluation({ url: 'https://h/v1', body: {} }, async () => { throw new Error('getaddrinfo ENOTFOUND h'); }, undefined, key))
      .toEqual({ ok: false, reason: 'network', detail: 'getaddrinfo ENOTFOUND h' });
    expect(await postMirrorEvaluation({ url: 'https://h/v1', body: {} }, async () => new Response('<html>', { status: 200 }), undefined, key))
      .toEqual({ ok: false, reason: 'not-json', status: 200 });
  });
});

describe('Mirror Writing "app AI" backend', () => {
  const request: MirrorAppAiRequest = { prompt: 'Grade this Japanese draft.', lang: 'ja' };

  afterEach(() => {
    setAiFeaturesReader(null);
    setAiCloudFeatureReader(null);
  });

  function deps(over: Partial<MirrorAppAiDeps> = {}): () => Promise<MirrorAppAiDeps> {
    return async () => ({
      engine: () => 'cloud',
      provider: () => ({ providerId: 'claude-haiku-5-5', apiKey: 'k' }),
      callCloud: (async () => evaluationJson) as unknown as MirrorAppAiDeps['callCloud'],
      runLocal: async () => JSON.stringify(evaluationJson),
      ...over,
    });
  }

  it('grades through the central client with the evaluation schema and the mirror opt-in', async () => {
    const callCloud = vi.fn(async () => evaluationJson);
    const out = await evaluateMirrorWithAppAi(request, deps({ callCloud: callCloud as unknown as MirrorAppAiDeps['callCloud'] }));
    expect(out).toEqual({ ok: true, data: evaluationJson });
    const call = callCloud.mock.calls[0] as unknown as [string, string, string, { required: string[] }, unknown, { feature: string }];
    expect(call[0]).toBe('claude-haiku-5-5');
    expect(call[3].required).toEqual(['total', 'axes', 'summary']);
    expect(call[5].feature).toBe('mirror');
  });

  it('uses the offline model when the engine is Offline, and tolerates a fenced reply', async () => {
    const runLocal = vi.fn(async () => `\`\`\`json\n${JSON.stringify(evaluationJson)}\n\`\`\``);
    const callCloud = vi.fn();
    const out = await evaluateMirrorWithAppAi(
      request,
      deps({ engine: () => 'local-qwen', runLocal, callCloud: callCloud as unknown as MirrorAppAiDeps['callCloud'] }),
    );
    expect(out.ok).toBe(true);
    expect(callCloud).not.toHaveBeenCalled();
  });

  it('refuses with ai-off when AI is switched off, for the offline engine too', async () => {
    setAiFeaturesReader(() => false);
    const runLocal = vi.fn();
    expect(await evaluateMirrorWithAppAi(request, deps({ engine: () => 'local-qwen', runLocal }))).toEqual({ ok: false, code: 'ai-off' });
    expect(runLocal).not.toHaveBeenCalled();
  });

  it('refuses the cloud when Mirror Writing is not allowed to use it', async () => {
    setAiCloudFeatureReader(() => false);
    const callCloud = vi.fn();
    expect(await evaluateMirrorWithAppAi(request, deps({ callCloud: callCloud as unknown as MirrorAppAiDeps['callCloud'] })))
      .toEqual({ ok: false, code: 'cloud-disabled' });
    expect(callCloud).not.toHaveBeenCalled();
  });

  it('returns a provider failure as its code, never as prose', async () => {
    const callCloud = async () => {
      throw new AiProviderRuntimeError('Anthropic rejected the API key.', 'authentication', false, 401);
    };
    expect(await evaluateMirrorWithAppAi(request, deps({ callCloud: callCloud as unknown as MirrorAppAiDeps['callCloud'] })))
      .toEqual({ ok: false, code: 'authentication' });
  });

  it('the renderer falls back to the quick check while AI is not set up', async () => {
    const appAi = { ...DEFAULT_GAME_ARENA_SETTINGS };
    expect(appAi.mirrorBackend).toBe('app-ai');
    expect(resolveMirrorBackend(appAi, false)).toBe('local');
    expect(resolveMirrorBackend(appAi, true)).toBe('app-ai');
    const result = await evaluateMirrorWriting(appAi, MIRROR_TEXTS[0], draft, { appAiReady: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.evaluatorVersion).toBe('quick-check-v2');
  });

  it('the renderer sends the app-AI request through main and translates a failure code', async () => {
    const g = globalThis as unknown as { window?: unknown };
    const seen: MirrorAppAiRequest[] = [];
    g.window = {
      api: {
        gamesMirrorEvaluateAppAi: async (req: MirrorAppAiRequest) => {
          seen.push(req);
          return seen.length === 1 ? { ok: true, data: evaluationJson } : { ok: false, code: 'rate-limit' };
        },
      },
    };
    try {
      const appAi = { ...DEFAULT_GAME_ARENA_SETTINGS };
      const ok = await evaluateMirrorWriting(appAi, MIRROR_TEXTS[0], draft, { appAiReady: true });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.evaluation.evaluatorVersion).toBe('app-ai-v1');
      expect(seen[0].prompt).toContain(draft);
      const failed = await evaluateMirrorWriting(appAi, MIRROR_TEXTS[0], draft, { appAiReady: true });
      expect(failed.ok).toBe(false);
      if (!failed.ok) expect(failed.messageKey).toBe('aiProv.error.rate-limit');
    } finally {
      delete g.window;
    }
  });
});
