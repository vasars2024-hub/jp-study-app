// @vitest-environment node
//
// Whole-track machine translation: which engine is chosen, that timing survives,
// that cached lines cost nothing, and that a refusal no retry can fix stops the
// run instead of sending the rest of the episode to it. Engines are scripted.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSubtitles } from '../../shared/subtitleCues';

const configured: Record<string, boolean> = {};
let modelPresent = false;
const cache = new Map<string, string>();
const cloudCalls: { providerId: string; prompt: string }[] = [];
const localCalls: string[] = [];
let cloudReply: (prompt: string) => string = () => '[]';

class FakeRuntimeError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

vi.mock('../providerRuntime', () => ({
  AiProviderRuntimeError: FakeRuntimeError,
  getAiProviderHealth: (id: string) => ({ providerId: id, configured: configured[id] === true }),
  runCloudAiRequest: async (request: { providerId: string; prompt: string }) => {
    cloudCalls.push(request);
    return { text: cloudReply(request.prompt) };
  },
}));

vi.mock('../translate', () => ({
  isTranslateAvailable: () => modelPresent,
  runLocalQwenPrompt: async (prompt: string) => {
    localCalls.push(prompt);
    return answerAll(prompt, (text) => `EN:${text}`);
  },
  getCachedTranslation: (text: string, source: string, target: string) => cache.get(`${source}|${target}|${text}`),
  setCachedTranslation: (text: string, source: string, target: string, value: string) => {
    cache.set(`${source}|${target}|${text}`, value);
  },
  flushTranslationCache: () => undefined,
}));

const { resolveSubtitleTranslationEngine, translateSubtitleTrack } = await import('../subtitleDiscoveryTranslate');

/** Answers every `[id] text` line of a prompt with `map(text)`. */
function answerAll(prompt: string, map: (text: string) => string): string {
  const lines = prompt.split('\n').filter((line) => /^\[\d+\] /.test(line));
  return JSON.stringify(lines.map((line) => {
    const [, id, text] = /^\[(\d+)\] (.*)$/.exec(line) ?? [];
    return { id, text: map(text) };
  }));
}

const JA_TRACK = [
  '1', '00:00:01,000 --> 00:00:02,000', '行くぞ！', '',
  '2', '00:00:03,500 --> 00:00:05,000', '待ってくれ', '',
  '3', '00:00:06,000 --> 00:00:07,250', 'はい', '',
].join('\n');

beforeEach(() => {
  for (const key of Object.keys(configured)) delete configured[key];
  modelPresent = false;
  cache.clear();
  cloudCalls.length = 0;
  localCalls.length = 0;
  cloudReply = (prompt) => answerAll(prompt, (text) => ({ '行くぞ！': "Let's go!", '待ってくれ': 'Wait for me', 'はい': 'Yes' }[text] ?? 'Hm'));
});

describe('resolveSubtitleTranslationEngine', () => {
  it('prefers a configured cloud key, the first in the app\'s own order', () => {
    configured['deepseek-v4-flash'] = true;
    configured['deepseek-v4-pro'] = true;
    modelPresent = true;
    expect(resolveSubtitleTranslationEngine('auto')).toMatchObject({ kind: 'cloud', providerId: 'deepseek-v4-flash' });
  });

  it('falls back to the offline model, and to nothing', () => {
    modelPresent = true;
    expect(resolveSubtitleTranslationEngine('auto')).toEqual({ kind: 'local', label: 'local-qwen' });
    modelPresent = false;
    expect(resolveSubtitleTranslationEngine('auto')).toBeNull();
  });

  it('keeps to the engine the user chose', () => {
    configured['gemini-2.5-flash'] = true;
    expect(resolveSubtitleTranslationEngine('local')).toBeNull();
    modelPresent = true;
    expect(resolveSubtitleTranslationEngine('local')?.kind).toBe('local');
    configured['gemini-2.5-flash'] = false;
    expect(resolveSubtitleTranslationEngine('cloud')).toBeNull();
  });
});

describe('translateSubtitleTrack', () => {
  const cloud = { kind: 'cloud' as const, providerId: 'gemini-2.5-flash' as const, label: 'gemini-2.5-flash' };

  it('translates every line in one batch and keeps the source timing', async () => {
    const out = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    expect(cloudCalls).toHaveLength(1);
    expect(out).toMatchObject({ translated: 3, total: 3, engine: 'gemini-2.5-flash' });
    expect(parseSubtitles(out?.srt ?? '')).toEqual([
      { start: 1, end: 2, text: "Let's go!" },
      { start: 3.5, end: 5, text: 'Wait for me' },
      { start: 6, end: 7.25, text: 'Yes' },
    ]);
  });

  it('reads cached lines instead of asking again', async () => {
    await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    cloudCalls.length = 0;
    const again = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    expect(cloudCalls).toHaveLength(0);
    expect(again?.translated).toBe(3);
  });

  it('drops a line the model answered in the wrong script', async () => {
    cloudReply = (prompt) => answerAll(prompt, (text) => (text === 'はい' ? 'はい' : 'Fine'));
    const out = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    expect(out?.translated).toBe(2);
  });

  it('stops at a refusal no retry can fix', async () => {
    cloudReply = () => {
      throw new FakeRuntimeError('over budget', 'spend-budget');
    };
    const out = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    expect(out).toMatchObject({ translated: 0, stoppedBy: 'spend-budget' });
  });

  it('batches small for the offline model', async () => {
    const long = Array.from({ length: 23 }, (_, i) =>
      `${i + 1}\n00:00:${String(i * 2).padStart(2, '0')},000 --> 00:00:${String(i * 2 + 1).padStart(2, '0')},000\n台詞${i}\n`).join('\n');
    const out = await translateSubtitleTrack(long, 'ja', 'en', { kind: 'local', label: 'local-qwen' });
    expect(localCalls).toHaveLength(3);
    expect(out?.translated).toBe(23);
  });

  it('returns null for a track with nothing to translate', async () => {
    expect(await translateSubtitleTrack('', 'ja', 'en', cloud)).toBeNull();
  });
});
