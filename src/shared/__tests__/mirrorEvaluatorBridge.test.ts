/**
 * Mirror Writing's API evaluator must not depend on a renderer `fetch`.
 *
 * The packaged CSP's `connect-src` names loopback `127.0.0.1` and HuggingFace only, so a
 * renderer `fetch` to the endpoint a user configures (`https://api.openai.com/...`, or the
 * settings placeholder's `https://localhost:8000/...`) is refused before it leaves the page —
 * "Failed to fetch", in packaged builds only. Here the renderer `fetch` behaves exactly like
 * that CSP refusal, and the evaluation must still arrive: through main's bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { MIRROR_TEXTS } from '../../renderer/data/mirrorTexts';
import { DEFAULT_GAME_ARENA_SETTINGS } from '../../renderer/games/settings';
import { evaluateMirrorWriting } from '../../renderer/games/mirrorWriting/evaluator';
import { postMirrorEvaluation } from '../../main/mirrorEvaluatorProxy';
import { cspDirectiveSources } from '../contentSecurityPolicy';
import type { MirrorEvaluateRequest } from '../mirrorEvaluatorIpc';

const axis = { score: 82, tips: [] };
const evaluationJson = { total: 82, axes: { grammar: axis, vocabulary: axis, flow: axis, fidelity: axis }, summary: 'Good.' };
const completion = { choices: [{ message: { content: JSON.stringify(evaluationJson) } }] };
const settings = {
  ...DEFAULT_GAME_ARENA_SETTINGS,
  mirrorBackend: 'api' as const,
  mirrorApiUrl: 'https://api.openai.com/v1/chat/completions',
  mirrorApiKey: 'sk-test',
};
const draft = '今日は友だちと公園へ行きました。とても楽しかったです。';

/** A renderer fetch that behaves like the packaged CSP: nothing leaves the page. */
function cspRefusingFetch(url: string): Promise<Response> {
  const origin = new URL(url).origin;
  const allowed = (cspDirectiveSources('connect-src') ?? []).some((s) => s.replace(':*', '') === origin.replace(/:\d+$/, ''));
  return allowed ? Promise.reject(new Error('unexpected network in test')) : Promise.reject(new TypeError('Failed to fetch'));
}

describe('Mirror Writing API evaluator in a packaged renderer', () => {
  const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch };
  const realFetch = g.fetch;
  let sent: MirrorEvaluateRequest[];

  beforeEach(() => {
    sent = [];
    g.fetch = vi.fn(cspRefusingFetch) as unknown as typeof fetch;
    const mainFetch = vi.fn(async () => new Response(JSON.stringify(completion), { status: 200 }));
    g.window = {
      api: {
        gamesMirrorEvaluate: (req: MirrorEvaluateRequest) => {
          sent.push(req);
          return postMirrorEvaluation(req, mainFetch);
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

  it('scores the draft through main, never through the renderer fetch', async () => {
    const result = await evaluateMirrorWriting(settings, MIRROR_TEXTS[0], draft);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evaluation.total).toBe(82);
    expect(g.fetch).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(settings.mirrorApiUrl);
    expect(sent[0].apiKey).toBe('sk-test');
  });

  it('reports an endpoint error status with its catalog key', async () => {
    (g.window as { api: Record<string, unknown> }).api.gamesMirrorEvaluate = (req: MirrorEvaluateRequest) =>
      postMirrorEvaluation(req, async () => new Response('nope', { status: 401 }));
    const result = await evaluateMirrorWriting(settings, MIRROR_TEXTS[0], draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messageKey).toBe('games.mirror.error.network');
      expect(result.messageVars).toEqual({ status: 401 });
    }
  });
});

describe('main-side Mirror Writing request', () => {
  it('POSTs the JSON body with the key as a bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(completion), { status: 200 }));
    const out = await postMirrorEvaluation({ url: 'http://localhost:8000/v1/chat/completions', apiKey: ' k ', body: { a: 1 } }, fetchImpl);
    expect(out).toEqual({ ok: true, status: 200, data: completion });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(init.body).toBe('{"a":1}');
  });

  it('refuses anything that is not a plain http(s) endpoint, without sending', async () => {
    const fetchImpl = vi.fn();
    for (const url of ['file:///C:/x', 'app://bundle/index.html', 'https://user:pw@host/v1', 'not a url']) {
      expect(await postMirrorEvaluation({ url, apiKey: 'k', body: {} }, fetchImpl)).toEqual({ ok: false, reason: 'bad-request' });
    }
    expect(await postMirrorEvaluation({ url: 'https://h/v1', apiKey: 'a\r\nX-Evil: 1', body: {} }, fetchImpl)).toEqual({ ok: false, reason: 'bad-request' });
    expect(await postMirrorEvaluation({ url: 'https://h/v1', apiKey: 'k', body: 'x'.repeat(300 * 1024) }, fetchImpl)).toEqual({ ok: false, reason: 'bad-request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('distinguishes a timeout, a network failure and a non-JSON answer', async () => {
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    expect(await postMirrorEvaluation({ url: 'https://h/v1', apiKey: 'k', body: {} }, hang, 20)).toEqual({ ok: false, reason: 'timeout' });
    expect(await postMirrorEvaluation({ url: 'https://h/v1', apiKey: 'k', body: {} }, async () => { throw new Error('getaddrinfo ENOTFOUND h'); }))
      .toEqual({ ok: false, reason: 'network', detail: 'getaddrinfo ENOTFOUND h' });
    expect(await postMirrorEvaluation({ url: 'https://h/v1', apiKey: 'k', body: {} }, async () => new Response('<html>', { status: 200 })))
      .toEqual({ ok: false, reason: 'not-json', status: 200 });
  });
});
