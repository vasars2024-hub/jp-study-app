// @vitest-environment node
/**
 * "Read text with AI" (main/ocrAiVisionProvider.ts, main/aiOcrVisionStore.ts):
 * the modes, the merge (AI wins where they disagree), the reply's lines and
 * doubts, the image limits, abort, and who may read — with a fake model call,
 * so nothing reaches a real AI API. The wire formats are covered against a
 * local HTTP fake in aiProviderLayer.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AI_OCR_UNVERIFIED_CONFIDENCE,
  aiReplyToLines,
  aiVisionOcrProvider,
  buildAiOcrPrompt,
  checkWithAiVision,
  mergeAiRead,
  prepareAiOcrImage,
  readRegionsWithAiVision,
  withAiVision,
  type AiVisionDeps,
} from '../ocrAiVisionProvider';
import { readAiOcrVisionStatus, resolveAiOcrVisionPlan, type AiOcrVisionFacts } from '../aiOcrVisionStore';
import { defaultScriptOf, recognizeWithRouter, type OcrProvider, type RouterDeps, type RouterImage } from '../ocrRouter';
import { AiProviderRuntimeError } from '../providerRuntime';
import { DEFAULT_AI_OCR_VISION_SETTINGS, applyAiOcrVisionPatch, snipAiCheckWanted } from '../../shared/aiOcrVision';
import { unsureCharsOf, type OcrRouterResult } from '../../shared/ocrRouterTypes';
import { snipEngineLabel } from '../../shared/snipToCards';

function picture(width = 600, height = 120, scaledTo: number[] = []): RouterImage {
  return {
    width,
    height,
    dataUrl: () => `data:image/png;base64,${'A'.repeat(Math.ceil(width * height / 100))}`,
    crop: () => picture(10, 10),
    scaled(factor) {
      scaledTo.push(factor);
      return picture(Math.round(width * factor), Math.round(height * factor), scaledTo);
    },
  };
}

type Region = { image?: number; lines: Array<{ text: string; confidence?: number; vertical?: boolean; box?: number[]; doubts?: Array<{ at: number; alts: string[] }> }> };

function fakeCall(regions: Region[] | (() => never)) {
  return vi.fn(async (..._args: unknown[]) => {
    if (typeof regions === 'function') return regions();
    return { regions };
  }) as unknown as AiVisionDeps['call'] & ReturnType<typeof vi.fn>;
}

const local = (lines: Array<{ text: string; confidence: number }>, engine: OcrProvider['id'] = 'web'): OcrProvider => ({
  id: engine,
  langs: ['ja'],
  tier: 1,
  available: () => true,
  readPage: async () => lines.map((l, i) => ({ ...l, box: [0, i * 40, 600, i * 40 + 40] as [number, number, number, number], vertical: false })),
});

function routerDeps(providers: OcrProvider[]): RouterDeps {
  return {
    providers,
    wordOracle: () => null,
    detectLang: (_text, candidates) => candidates[0] ?? 'ja',
    scriptOf: defaultScriptOf,
    assetsFor: () => [],
    now: () => Date.now(),
  };
}

const plan = (mode: 'unsure' | 'always' | 'check' | null) => () => (mode ? { mode, providerId: 'claude-sonnet-5-5' as const } : null);

describe('the request', () => {
  it('asks for an exact transcription: reading order, vertical right to left, no furigana, no translation', () => {
    const prompt = buildAiOcrPrompt({ langs: ['ja', 'zh'], purpose: 'manga', orientation: 'vertical' }, 1);
    expect(prompt).toMatch(/most likely Japanese; it may also be Chinese/);
    expect(prompt).toMatch(/columns from right to left/);
    expect(prompt).toMatch(/Leave out furigana/);
    expect(prompt).toMatch(/Do not correct, normalise, translate/);
    expect(prompt).toMatch(/No commentary/);
    expect(buildAiOcrPrompt({ langs: ['ja'], purpose: 'snip', furigana: true }, 3)).toMatch(/Include furigana[\s\S]*1–3/);
  });

  it('downscales to what each vendor reads, and no further than it must', () => {
    const scaled: number[] = [];
    const part = prepareAiOcrImage(picture(3000, 2000, scaled), 'claude-haiku-5-5');
    expect(Math.max(part.width!, part.height!)).toBeLessThanOrEqual(1568);
    expect(part.width! * part.height!).toBeLessThanOrEqual(1_150_000);
    expect(part.detail).toBe('high');
    const small = prepareAiOcrImage(picture(600, 120), 'openai');
    expect([small.width, small.height]).toEqual([600, 120]);
    expect(prepareAiOcrImage(picture(3000, 2000), 'gemini-2.5-flash').width).toBe(3000);
  });

  it('one call for a page, however many lines, with the feature, the signal and a cloud-sized timeout', async () => {
    const call = fakeCall([{ image: 1, lines: [{ text: '一行目' }, { text: '二行目' }, { text: '三行目' }] }]);
    const signal = new AbortController().signal;
    const [lines] = await readRegionsWithAiVision([picture()], 'claude-sonnet-5-5', { langs: ['ja'], purpose: 'lens', budgetMs: 4000, signal }, { call });
    expect(lines.map((l) => l.text)).toEqual(['一行目', '二行目', '三行目']);
    expect(call).toHaveBeenCalledTimes(1);
    const options = call.mock.calls[0][5] as Record<string, unknown>;
    expect(options).toMatchObject({ feature: 'ocrVision', signal, temperature: 0, timeoutMs: 20_000 });
    expect((options.images as unknown[]).length).toBe(1);
  });

  it('an aborted read sends nothing', async () => {
    const call = fakeCall([]);
    const controller = new AbortController();
    controller.abort();
    await expect(readRegionsWithAiVision([picture()], 'claude-sonnet-5-5', { langs: ['ja'], purpose: 'snip', signal: controller.signal }, { call }))
      .rejects.toMatchObject({ code: 'cancelled' });
    expect(call).not.toHaveBeenCalled();
  });
});

describe('the reply as lines', () => {
  it('no confidence is high-but-unverified; a low one is floored so no local engine outvotes it', () => {
    const lines = aiReplyToLines([{ text: 'あ' }, { text: 'い', confidence: 0.3 }, { text: 'う', confidence: 0.95 }], { width: 100, height: 60 });
    expect(lines.map((l) => l.confidence)).toEqual([AI_OCR_UNVERIFIED_CONFIDENCE, 0.8, 0.95]);
  });

  it('the model\'s doubts become one-click fixes; a line written across a break is split', () => {
    const lines = aiReplyToLines([
      { text: '語え', doubts: [{ at: 1, alts: ['る', 'るる', 'え'] }] },
      { text: '上\n下' },
    ], { width: 200, height: 100 });
    expect(lines.map((l) => l.text)).toEqual(['語え', '上', '下']);
    expect(unsureCharsOf(lines)).toEqual([{ at: 1, ch: 'え', p: 0.55, alts: ['る'] }]);
  });

  it('boxes: the model\'s (0–1000) in pixels, else bands in reading order (vertical: right to left)', () => {
    const [boxed] = aiReplyToLines([{ text: 'x', box: [100, 200, 500, 400] }], { width: 1000, height: 500 });
    expect(boxed.box).toEqual([100, 100, 500, 200]);
    const columns = aiReplyToLines([{ text: '縦一', vertical: true }, { text: '縦二', vertical: true }], { width: 200, height: 600 });
    expect(columns.map((l) => l.box)).toEqual([[100, 0, 200, 600], [0, 0, 100, 600]]);
  });
});

describe('merging a check into a local read (AI wins where they disagree)', () => {
  const read = (text: string, p = 0.6): OcrRouterResult => {
    const lines = text.split('\n').map((t, i) => ({
      text: t,
      box: [0, i * 40, 600, i * 40 + 40] as [number, number, number, number],
      vertical: false,
      confidence: p,
      engine: 'web',
      chars: [...t].map((ch) => ({ ch, p, alts: [{ ch: '?', p: 0.1 }] })),
      consulted: ['web'],
    }));
    return { ok: true, text, lines, confidence: p, engine: 'web', engines: ['web'], lang: 'ja', unsure: unsureCharsOf(lines) };
  };
  const ai = (texts: string[]) => aiReplyToLines(texts.map((text) => ({ text })), { width: 600, height: 80 });

  it('a differing line takes the model\'s text, keeping the local box when it is the same line', () => {
    const merged = mergeAiRead(read('彼後がいた\n今日'), ai(['恐竜がいた', '今日']), 'ai:claude-sonnet-5-5');
    expect(merged.text).toBe('恐竜がいた\n今日');
    expect(merged.lines[0]).toMatchObject({ engine: 'ai:claude-sonnet-5-5', box: [0, 0, 600, 40], consulted: ['web', 'ai:claude-sonnet-5-5'] });
    // The agreeing line is the local one, now confirmed: no doubts left on it.
    expect(merged.lines[1].engine).toBe('web');
    expect(merged.lines[1].chars!.every((c) => c.p >= AI_OCR_UNVERIFIED_CONFIDENCE)).toBe(true);
    expect(merged.unsure).toEqual([]);
    expect(merged.engines).toEqual(['web', 'ai:claude-sonnet-5-5']);
    expect(merged.engine).toBe('ai:claude-sonnet-5-5');
  });

  it('an empty AI read leaves the local read as it was', () => {
    const before = read('窓辺');
    expect(mergeAiRead(before, [], 'ai:openai')).toBe(before);
  });

  it('a read no local engine could make, or one in a language with no reader, is the model\'s', () => {
    const none: OcrRouterResult = { ok: false, text: '', lines: [], engine: 'none', engines: [], lang: 'ja', unsure: [], error: 'no-engine', missing: { lang: 'zh', assetIds: ['paddle-ocr-zh'] } };
    const merged = mergeAiRead(none, ai(['今天我们去图书馆']), 'ai:gemini-2.5-flash', () => 'zh');
    expect(merged).toMatchObject({ ok: true, text: '今天我们去图书馆', lang: 'zh', engine: 'ai:gemini-2.5-flash' });
    expect(merged.error).toBeUndefined();
    expect(merged.missing).toBeUndefined();
  });

  it('a failed or invalid reply keeps the local read, and says why', async () => {
    const before = read('窓辺');
    const call = fakeCall(() => {
      throw new AiProviderRuntimeError('bad', 'invalid-response');
    });
    const checked = await checkWithAiVision(picture(), { langs: ['ja'], purpose: 'snip' }, before, 'claude-sonnet-5-5', { call });
    expect(checked).toMatchObject({ text: '窓辺', engine: 'web', aiError: 'invalid-response' });
  });
});

describe('the modes, around the real router', () => {
  const unsureLocal = local([{ text: '彼後', confidence: 0.6 }]);
  const sureLocal = local([{ text: '窓辺の猫', confidence: 0.97 }]);

  it('Off: the router call exactly as before, and no model call', async () => {
    const call = fakeCall([]);
    const run = vi.fn(recognizeWithRouter);
    const read = await withAiVision(picture(), { langs: ['ja'], purpose: 'snip' }, routerDeps([unsureLocal]), run, { call, plan: plan(null) });
    expect(read.text).toBe('彼後');
    expect(run).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });

  it('Only when unsure: a sure local read is not sent', async () => {
    const call = fakeCall([{ lines: [{ text: 'x' }] }]);
    const read = await withAiVision(picture(), { langs: ['ja'], purpose: 'snip' }, routerDeps([sureLocal]), recognizeWithRouter, { call, plan: plan('unsure') });
    expect(read.text).toBe('窓辺の猫');
    expect(call).not.toHaveBeenCalled();
  });

  it('Only when unsure: an unsure one is sent once, and the model\'s text wins', async () => {
    const call = fakeCall([{ lines: [{ text: '恐竜' }] }]);
    const read = await withAiVision(picture(), { langs: ['ja'], purpose: 'snip' }, routerDeps([unsureLocal]), recognizeWithRouter, { call, plan: plan('unsure') });
    expect(call).toHaveBeenCalledTimes(1);
    expect(read).toMatchObject({ text: '恐竜', engine: 'ai:claude-sonnet-5-5' });
    expect(read.engines).toEqual(['web', 'ai:claude-sonnet-5-5']);
  });

  it('Always: the model reads, once, for every language the router tries', async () => {
    const call = fakeCall([{ lines: [{ text: '今天我们去图书馆' }] }]);
    const deps = routerDeps([sureLocal]);
    const read = await withAiVision(picture(), { langs: ['ja', 'zh', 'ru'], purpose: 'snip' }, deps, recognizeWithRouter, { call, plan: plan('always') });
    expect(call).toHaveBeenCalledTimes(1);
    expect(read).toMatchObject({ ok: true, text: '今天我们去图书馆', engine: 'ai:claude-sonnet-5-5' });
  });

  it('Always: when the model fails, the local engines read, and the failure is reported', async () => {
    const call = fakeCall(() => {
      throw new AiProviderRuntimeError('offline', 'network');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const read = await withAiVision(picture(), { langs: ['ja'], purpose: 'snip' }, routerDeps([sureLocal]), recognizeWithRouter, { call, plan: plan('always') });
    expect(read).toMatchObject({ text: '窓辺の猫', engine: 'web', aiError: 'network' });
  });

  it('a picked engine (tier −10) still leads Always; the model leads the defaults', () => {
    const provider = aiVisionOcrProvider('openai', { langs: ['ja'], purpose: 'manga' }, { call: fakeCall([]) });
    expect(provider).toMatchObject({ id: 'ai:openai', langs: 'any', tier: -5 });
    expect(provider.readLine).toBeTypeOf('function');
  });

  it('a cancelled surface sends nothing after the local read', async () => {
    const call = fakeCall([{ lines: [{ text: '恐竜' }] }]);
    const controller = new AbortController();
    const run = async (...args: Parameters<typeof recognizeWithRouter>) => {
      const result = await recognizeWithRouter(...args);
      controller.abort();
      return result;
    };
    await withAiVision(picture(), { langs: ['ja'], purpose: 'vn', signal: controller.signal }, routerDeps([unsureLocal]), run, { call, plan: plan('unsure') });
    expect(call).not.toHaveBeenCalled();
  });
});

describe('who may read (aiOcrVisionStore)', () => {
  const facts = (over: Partial<Record<keyof AiOcrVisionFacts, unknown>> = {}): AiOcrVisionFacts => ({
    settings: () => ({ ...DEFAULT_AI_OCR_VISION_SETTINGS, mode: 'always' }),
    aiEnabled: () => true,
    consent: () => true,
    configuredProvider: () => 'claude-haiku-5-5',
    configured: () => true,
    compatBaseUrl: () => 'http://localhost:11434/v1',
    ...(over as Partial<AiOcrVisionFacts>),
  });

  it('ready only with AI on, a provider that reads pictures and has a key, and the opt-in — in that order', () => {
    expect(readAiOcrVisionStatus(facts())).toMatchObject({ ready: true, available: true, effectiveProviderId: 'claude-haiku-5-5', host: 'api.anthropic.com' });
    expect(readAiOcrVisionStatus(facts({ aiEnabled: () => false })).blocked).toBe('ai-off');
    expect(readAiOcrVisionStatus(facts({ configuredProvider: () => 'deepseek-v4-pro' })).blocked).toBe('no-vision');
    expect(readAiOcrVisionStatus(facts({ configured: () => false })).blocked).toBe('not-configured');
    const noConsent = readAiOcrVisionStatus(facts({ consent: () => false }));
    expect(noConsent).toMatchObject({ blocked: 'no-consent', available: true, ready: false });
  });

  it('the local server reads pictures only when the user said so, and its host is shown as local', () => {
    const settings = (compatVision: boolean) => () => ({ ...DEFAULT_AI_OCR_VISION_SETTINGS, mode: 'always' as const, providerId: 'openai-compatible' as const, compatVision });
    expect(readAiOcrVisionStatus(facts({ settings: settings(false) })).blocked).toBe('no-vision');
    expect(readAiOcrVisionStatus(facts({ settings: settings(true) }))).toMatchObject({ ready: true, local: true, host: 'localhost:11434' });
  });

  it('Off reads nothing by itself; "Check with AI" still may, with the opt-in', () => {
    const off = facts({ settings: () => DEFAULT_AI_OCR_VISION_SETTINGS });
    expect(resolveAiOcrVisionPlan({}, off)).toBeNull();
    expect(resolveAiOcrVisionPlan({ check: true }, off)).toEqual({ mode: 'check', providerId: 'claude-haiku-5-5' });
    expect(resolveAiOcrVisionPlan({ check: true }, facts({ consent: () => false }))).toBeNull();
    expect(resolveAiOcrVisionPlan({}, facts())).toEqual({ mode: 'always', providerId: 'claude-haiku-5-5' });
  });

  it('settings patches keep only well-formed fields', () => {
    const next = applyAiOcrVisionPatch(DEFAULT_AI_OCR_VISION_SETTINGS, { mode: 'sometimes', providerId: 'gpt-9', compatVision: 'yes' });
    expect(next).toEqual(DEFAULT_AI_OCR_VISION_SETTINGS);
    expect(applyAiOcrVisionPatch(DEFAULT_AI_OCR_VISION_SETTINGS, { mode: 'unsure', providerId: 'openai', compatVision: true }))
      .toEqual({ version: 1, mode: 'unsure', providerId: 'openai', compatVision: true });
  });
});

describe('snips', () => {
  const entry = { status: 'done', text: '窓辺', engine: 'web', confidence: 0.95, unsure: [] as unknown[] };

  it('"Check with AI" is offered on unsure snips only, and never on one the model read', () => {
    expect(snipAiCheckWanted(entry)).toBe(false);
    expect(snipAiCheckWanted({ ...entry, unsure: [{}] })).toBe(true);
    expect(snipAiCheckWanted({ ...entry, confidence: 0.6 })).toBe(true);
    expect(snipAiCheckWanted({ ...entry, engine: 'basic' })).toBe(true);
    expect(snipAiCheckWanted({ ...entry, status: 'error', error: 'garbage' })).toBe(true);
    expect(snipAiCheckWanted({ ...entry, status: 'error', error: 'cancelled' })).toBe(false);
    expect(snipAiCheckWanted({ ...entry, engine: 'ai:claude-sonnet-5-5', confidence: 0.6 })).toBe(false);
    expect(snipAiCheckWanted({ ...entry, status: 'processing', unsure: [{}] })).toBe(false);
  });

  it('a snip the model read says which one ("Read by Claude Sonnet 5.5")', () => {
    expect(snipEngineLabel('ai:claude-sonnet-5-5')).toEqual({ name: 'Claude Sonnet 5.5' });
    expect(snipEngineLabel('ai:openai-compatible')).toEqual({ key: 'aiProv.vendor.local' });
    expect(snipEngineLabel('web')).toEqual({ name: 'PaddleOCR' });
  });
});
