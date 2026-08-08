import { afterEach, describe, expect, it, vi } from 'vitest';
import { runApiTranslationBatch } from '../translateApi';

function providerResponse(url: string, init: RequestInit): Response {
  const body = JSON.parse(String(init.body)) as {
    messages?: Array<{ role: string; content: string }>;
    contents?: Array<{ parts?: Array<{ text?: string }> }>;
  };
  const prompt = url.includes('deepseek')
    ? body.messages?.find((message) => message.role === 'user')?.content ?? ''
    : body.contents?.[0]?.parts?.[0]?.text ?? '';
  const ids = [...prompt.matchAll(/^\[([^\]]+)\]/gm)].map((match) => match[1]);
  const text = JSON.stringify(ids.map((id) => ({ id, text: `translation ${id}` })));
  return new Response(JSON.stringify(url.includes('deepseek')
    ? { choices: [{ message: { content: text } }] }
    : { candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cloud translation compatibility through provider runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves 40-item chunking, six-worker ceiling, progress, and Gemini temperature', async () => {
    const nonce = `${Date.now()}-${Math.random()}`;
    const fetchMock = vi.fn((url: string, init: RequestInit) =>
      Promise.resolve(providerResponse(url, init)));
    vi.stubGlobal('fetch', fetchMock);
    const progress: Array<[number, number]> = [];
    const items = Array.from({ length: 81 }, (_, index) => ({
      id: `golden-${index}`,
      text: `猫テスト${nonce}-${index}`,
      source: 'ja',
      target: 'en',
    }));

    const results = await runApiTranslationBatch(
      items,
      'gemini-2.5-flash',
      'gemini-key',
      { onProgress: (done, total) => progress.push([done, total]) },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(81);
    expect(new Set(results.map((item) => item.id))).toEqual(new Set(items.map((item) => item.id)));
    expect(progress).toHaveLength(3);
    expect(progress.at(-1)).toEqual([81, 81]);
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      const body = JSON.parse(String(init.body)) as {
        generationConfig: { responseMimeType: string; temperature: number; maxOutputTokens: number };
      };
      expect(body.generationConfig).toMatchObject({
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192,
      });
    }
  });

  it('preserves DeepSeek JSON mode, translation system prompt, and model selection', async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) =>
      Promise.resolve(providerResponse(url, init)));
    vi.stubGlobal('fetch', fetchMock);
    const nonce = `${Date.now()}-${Math.random()}`;

    const results = await runApiTranslationBatch([{
      id: 'deepseek-one',
      text: `犬テスト${nonce}`,
      source: 'ja',
      target: 'en',
    }], 'deepseek-v4-pro', 'deepseek-key');

    expect(results).toEqual([{ id: 'deepseek-one', text: 'translation deepseek-one' }]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer deepseek-key');
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string };
      max_tokens: number;
      temperature: number;
      stream: boolean;
    };
    expect(body).toMatchObject({
      model: 'deepseek-v4-pro',
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      temperature: 0.1,
      stream: false,
    });
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[0].content).toContain('translation assistant');
  });

  it('keeps the existing cancellation gate ahead of provider calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const progress = vi.fn();

    const results = await runApiTranslationBatch([{
      id: 'cancelled',
      text: '猫',
      source: 'ja',
      target: 'en',
    }], 'gemini-2.5-flash', 'gemini-key', {
      shouldCancel: () => true,
      onProgress: progress,
    });

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  });
});
