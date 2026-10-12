// @vitest-environment node
//
// Whole-track machine translation: which engine is chosen, that timing survives,
// that cached lines cost nothing, and that a refusal no retry can fix stops the
// run instead of sending the rest of the episode to it. Engines are scripted.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSubtitles } from '../../shared/subtitleCues';
import { setAiCloudFeatureReader, setAiFeaturesReader } from '../aiFeatureGate';
import { resolveSubtitleTranslationEngine, translateSubtitleTrack } from '../subtitleDiscoveryTranslate';

const configured: Record<string, boolean> = {};
let modelPresent = false;
const cache = new Map<string, string>();
const cloudCalls: { providerId: string; prompt: string }[] = [];
const localCalls: string[] = [];
let cloudReply: (prompt: string) => string = () => '[]';

// Hoisted with the mocks: the static imports below load the mocked modules first.
const { FakeRuntimeError } = vi.hoisted(() => ({
  FakeRuntimeError: class FakeRuntimeError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
}));

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
  // Keyed like the real cache: the engine scope is part of the key ('local' by default).
  getCachedTranslation: (text: string, source: string, target: string, engine = 'local') =>
    cache.get(`${engine}|${source}|${target}|${text}`),
  setCachedTranslation: (text: string, source: string, target: string, value: string, engine = 'local') => {
    cache.set(`${engine}|${source}|${target}|${text}`, value);
  },
  flushTranslationCache: () => undefined,
}));

type Deps = NonNullable<Parameters<typeof resolveSubtitleTranslationEngine>[1]>;

let aiOn = true;
let chosenProvider: string | null = 'gemini-2.5-flash';
let cloudAllowed = false;

/** The engine choice's inputs, scripted: no profile, no vault, no Translate settings file. */
const deps = (): Deps => ({
  aiEnabled: () => aiOn,
  configuredProvider: () => chosenProvider as ReturnType<Deps['configuredProvider']>,
  providerConfigured: (id) => configured[id] === true,
  cloudAllowed: () => cloudAllowed,
  localAvailable: () => modelPresent,
});

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
  aiOn = true;
  chosenProvider = 'gemini-2.5-flash';
  cloudAllowed = false;
  // The real gate, with the subtitle opt-in granted: the track tests below are
  // about translation, and the opt-in has its own tests.
  setAiFeaturesReader(null);
  setAiCloudFeatureReader(() => true);
});

describe('resolveSubtitleTranslationEngine', () => {
  it('uses the provider chosen in Settings > AI, never the first one with a key', () => {
    configured['deepseek-v4-flash'] = true;
    configured['claude-haiku-5-5'] = true;
    chosenProvider = 'claude-haiku-5-5';
    cloudAllowed = true;
    modelPresent = true;
    expect(resolveSubtitleTranslationEngine('auto', deps())).toMatchObject({ kind: 'cloud', providerId: 'claude-haiku-5-5' });
  });

  it('sends nothing to the cloud without the opt-in: a key alone is not consent (audit F1)', () => {
    configured['gemini-2.5-flash'] = true;
    modelPresent = true;
    expect(resolveSubtitleTranslationEngine('auto', deps())).toEqual({ kind: 'local', label: 'local-qwen' });
    expect(resolveSubtitleTranslationEngine('cloud', deps())).toBeNull();
  });

  it('runs nothing at all with "Use AI features" off, the offline model included', () => {
    configured['gemini-2.5-flash'] = true;
    cloudAllowed = true;
    modelPresent = true;
    aiOn = false;
    expect(resolveSubtitleTranslationEngine('auto', deps())).toBeNull();
    expect(resolveSubtitleTranslationEngine('local', deps())).toBeNull();
  });

  it('falls back to the offline model when the chosen provider is not set up, and to nothing', () => {
    cloudAllowed = true;
    modelPresent = true;
    expect(resolveSubtitleTranslationEngine('auto', deps())).toEqual({ kind: 'local', label: 'local-qwen' });
    modelPresent = false;
    expect(resolveSubtitleTranslationEngine('auto', deps())).toBeNull();
  });

  it('keeps to the engine the user chose', () => {
    configured['gemini-2.5-flash'] = true;
    cloudAllowed = true;
    expect(resolveSubtitleTranslationEngine('local', deps())).toBeNull();
    modelPresent = true;
    expect(resolveSubtitleTranslationEngine('local', deps())?.kind).toBe('local');
    configured['gemini-2.5-flash'] = false;
    expect(resolveSubtitleTranslationEngine('cloud', deps())).toBeNull();
  });

  it('defaults to the offline model for a new profile', async () => {
    const { DEFAULT_SUBTITLE_DISCOVERY_SETTINGS } = await import('../../shared/subtitleDiscoveryIpc');
    expect(DEFAULT_SUBTITLE_DISCOVERY_SETTINGS.translationEngine).toBe('local');
  });
});

describe('the gate is re-checked at send time', () => {
  const cloud = { kind: 'cloud' as const, providerId: 'gemini-2.5-flash' as const, label: 'gemini-2.5-flash' };

  it('stops before the first chunk when the subtitle opt-in was withdrawn', async () => {
    setAiCloudFeatureReader(() => false);
    const out = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    expect(cloudCalls).toHaveLength(0);
    expect(out).toMatchObject({ translated: 0, stoppedBy: 'cloud-disabled' });
  });

  it('stops the offline model too when AI is switched off', async () => {
    setAiFeaturesReader(() => false);
    const out = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', { kind: 'local', label: 'local-qwen' });
    expect(localCalls).toHaveLength(0);
    expect(out).toMatchObject({ translated: 0, stoppedBy: 'ai-off' });
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

describe('the subtitle cache is scoped by engine and versioned', () => {
  const cloud = { kind: 'cloud' as const, providerId: 'gemini-2.5-flash' as const, label: 'gemini-2.5-flash' };
  const local = { kind: 'local' as const, label: 'local-qwen' as const };

  it('stores cloud output under the provider, never under the offline key', async () => {
    await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    const keys = [...cache.keys()];
    expect(keys).toHaveLength(3);
    expect(keys.every((key) => key.startsWith('gemini-2.5-flash|'))).toBe(true);
    expect(keys.some((key) => key.startsWith('local|'))).toBe(false);
  });

  it('never serves a cloud line to the offline model, or one provider\'s to another', async () => {
    await translateSubtitleTrack(JA_TRACK, 'ja', 'en', cloud);
    modelPresent = true;
    const offline = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', local);
    expect(localCalls.length).toBeGreaterThan(0);
    // Asked, not served from the cloud's answers.
    expect(offline?.srt ?? '').not.toContain("Let's go!");
    expect(offline?.srt ?? '').not.toContain('Wait for me');
    cloudCalls.length = 0;
    await translateSubtitleTrack(JA_TRACK, 'ja', 'en', { kind: 'cloud', providerId: 'deepseek-v4-flash', label: 'deepseek-v4-flash' });
    expect(cloudCalls).toHaveLength(1);
  });

  it('ignores entries written under the old unscoped key, which a cloud engine filled as "offline"', async () => {
    // What v1 left behind: Gemini's answers under the offline model's key.
    cache.set('local|ja#subtitle|en|行くぞ！', "Let's go! (cloud, stored as offline)");
    cache.set('local|ja#subtitle|en|待ってくれ', 'Wait (cloud, stored as offline)');
    cache.set('local|ja#subtitle|en|はい', 'Yes (cloud, stored as offline)');
    modelPresent = true;
    const out = await translateSubtitleTrack(JA_TRACK, 'ja', 'en', local);
    expect(localCalls.length).toBeGreaterThan(0);
    expect(out?.srt).not.toContain('stored as offline');
  });

  it('exposes the versioned namespace and scope', async () => {
    const { subtitleCacheScope, subtitleCacheSource, SUBTITLE_TRANSLATION_CACHE_VERSION } = await import('../subtitleDiscoveryTranslate');
    expect(SUBTITLE_TRANSLATION_CACHE_VERSION).toBeGreaterThanOrEqual(2);
    expect(subtitleCacheSource('ja')).not.toBe('ja#subtitle');
    expect(subtitleCacheScope(cloud)).toBe('gemini-2.5-flash');
    expect(subtitleCacheScope(local)).toBe('local');
  });
});
