/**
 * EPUB API translation with a keyless local OpenAI-compatible server (Ollama,
 * LM Studio). `fetch` is stubbed: nothing here reaches a real server.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// The vault lives under Electron's userData; a local server needs no key.
vi.mock('../credentials/ai', () => ({
  readAiProviderSecret: () => '',
  writeAiProviderSecret: () => ({ ok: true }),
}));

import { setAiProviderOptionsReader } from '../providerRuntime';
import { isApiTranslationAvailable, runApiTranslationBatch } from '../translateApi';

function chatReply(init: RequestInit): Response {
  const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; content: string }> };
  const prompt = body.messages.find((message) => message.role === 'user')?.content ?? '';
  const ids = [...prompt.matchAll(/^\[([^\]]+)\]/gm)].map((match) => match[1]);
  const text = JSON.stringify(ids.map((id) => ({ id, text: `translation ${id}` })));
  return new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  setAiProviderOptionsReader(null);
  vi.unstubAllGlobals();
});

describe('EPUB API translation on a keyless local server', () => {
  it('is available without a key once the server is configured, and not for a keyed provider', () => {
    expect(isApiTranslationAvailable('openai-compatible', '', () => true)).toBe(true);
    expect(isApiTranslationAvailable('openai-compatible', '', () => false)).toBe(false);
    expect(isApiTranslationAvailable('claude-haiku-5-5', '', () => true)).toBe(false);
    expect(isApiTranslationAvailable('gemini-2.5-flash', 'key')).toBe(true);
  });

  it('translates through the local server one batch at a time, with the JSON instruction and no key', async () => {
    setAiProviderOptionsReader(() => ({
      openaiModel: '',
      compatBaseUrl: 'http://localhost:11434/v1',
      compatModel: 'qwen3:8b',
    }));
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return chatReply(init);
    });
    vi.stubGlobal('fetch', fetchMock);
    const nonce = `${Date.now()}-${Math.random()}`;
    const items = Array.from({ length: 81 }, (_, index) => ({
      id: `local-${index}`,
      text: `猫ローカル${nonce}-${index}`,
      source: 'ja',
      target: 'en',
    }));

    const results = await runApiTranslationBatch(items, 'openai-compatible', '');

    expect(results).toHaveLength(81);
    expect(results.every((entry) => entry.text.startsWith('translation '))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(peak).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
    const body = JSON.parse(String(init.body)) as { model: string; messages: Array<{ role: string; content: string }> };
    expect(body.model).toBe('qwen3:8b');
    expect(body.messages[0]).toMatchObject({ role: 'system' });
  });
});
