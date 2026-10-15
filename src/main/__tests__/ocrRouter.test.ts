// @vitest-environment node
/**
 * The OCR router's policy with stub providers: which provider reads first,
 * when a line goes to the next provider, the per-character merge, the
 * dictionary-guided decoding, language detection and the missing-reader
 * offer, and the time budget. No real engine runs.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../paddleOcr', () => ({
  PADDLE_LANGS: ['ja', 'zh', 'ru'],
  installedPaddleLangs: () => [],
  isInstalledPaddleDetector: () => false,
  recognizePaddleOcrDataUrl: async () => ({ text: '', lang: 'ja', lines: [] }),
  recognizePaddleLineDataUrl: async () => null,
}));
vi.mock('../mangaOcr', () => ({
  mangaOcrAvailable: () => false,
  recognizeMangaCropDataUrl: async () => ({ text: '', rawText: '', confidence: 0, truncated: false }),
  recognizeMangaOcrRegionsDataUrl: async () => ({ text: '', lines: [] }),
}));

import {
  defaultRouterDeps,
  defaultScriptOf,
  mangaStepsToChars,
  needsFallback,
  providersFor,
  recognizeWithRouter,
  type EngineLine,
  type OcrProvider,
  type RouterDeps,
  type RouterImage,
} from '../ocrRouter';
import { memoWordOracle } from '../../shared/ocrDictionaryDecode';
import type { OcrChar } from '../../shared/ocrRouterTypes';

const image: RouterImage = {
  width: 400,
  height: 100,
  dataUrl: () => 'data:image/png;base64,AA==',
  crop() {
    return image;
  },
};

function chars(text: string, low: Record<number, [number, Array<[string, number]>]> = {}): OcrChar[] {
  return [...text].map((ch, i) => ({ ch, p: low[i]?.[0] ?? 0.97, alts: (low[i]?.[1] ?? []).map(([c, p]) => ({ ch: c, p })) }));
}

function line(text: string, confidence: number, extra: Partial<EngineLine> = {}): EngineLine {
  return { text, box: [0, 0, 400, 40], vertical: false, confidence, ...extra };
}

interface Stub extends OcrProvider {
  pages: string[];
  lines: string[];
}

function provider(over: Partial<OcrProvider> & Pick<OcrProvider, 'id' | 'langs'>, read: {
  page?: (lang: string) => EngineLine[] | Promise<EngineLine[]>;
  line?: (lang: string) => EngineLine | null;
} = {}): Stub {
  const stub: Stub = {
    available: () => true,
    pages: [],
    lines: [],
    ...over,
    ...(read.page ? {
      readPage: async (_img, lang) => {
        stub.pages.push(lang);
        return read.page!(lang);
      },
    } : {}),
    ...(read.line ? {
      readLine: async (_img, lang) => {
        stub.lines.push(lang);
        return read.line!(lang);
      },
    } : {}),
  };
  return stub;
}

const WORDS = new Set(['恐竜', '魅力', '語る', '今天', '天气', '我们']);

function deps(providers: OcrProvider[], over: Partial<RouterDeps> = {}): RouterDeps {
  const base = defaultRouterDeps();
  let now = 0;
  return {
    ...base,
    providers,
    wordOracle: (_lang, deadline) => memoWordOracle(async (t) => WORDS.has(t), { deadline, now: () => now }),
    now: () => now,
    ...over,
  };
}

describe('provider choice', () => {
  const web = provider({ id: 'web', langs: ['ja', 'zh', 'ru'], tier: 1, orientation: 'horizontal' });
  const manga = provider({ id: 'manga', langs: ['ja'], tier: 2, orientation: 'vertical', purposes: ['manga'] });
  const anyLang = provider({ id: 'tess-any', langs: 'any', tier: 8 });

  it('Japanese screen text: PaddleOCR first; vertical or manga pages: manga-ocr first', () => {
    expect(providersFor([web, manga], 'ja', { purpose: 'snip' }).map((p) => p.id)).toEqual(['web', 'manga']);
    expect(providersFor([web, manga], 'ja', { purpose: 'snip', orientation: 'vertical' }).map((p) => p.id)).toEqual(['manga', 'web']);
    expect(providersFor([web, manga], 'ja', { purpose: 'manga' }).map((p) => p.id)).toEqual(['manga', 'web']);
  });

  it('languages are plain strings: a provider for any language plugs in, and an unavailable one is skipped', () => {
    expect(providersFor([web, manga, anyLang], 'ko', { purpose: 'lens' }).map((p) => p.id)).toEqual(['tess-any']);
    const off = { ...web, available: () => false };
    expect(providersFor([off, manga], 'zh', { purpose: 'snip' })).toEqual([]);
  });

  it('a line goes to the next provider when it, or one of its characters, is unsure', () => {
    expect(needsFallback({ confidence: 0.95, chars: chars('猫') })).toBe(false);
    expect(needsFallback({ confidence: 0.6 })).toBe(true);
    expect(needsFallback({ confidence: 0.9, chars: chars('猫犬', { 1: [0.3, []] }) })).toBe(true);
  });

  it('scripts are looked up by the primary subtag, letters for an unknown language', () => {
    expect(defaultScriptOf('zh-Hans').test('猫')).toBe(true);
    expect(defaultScriptOf('uk').test('ї')).toBe(true);
    expect(defaultScriptOf('xx').test('a')).toBe(true);
  });
});

describe('manga-ocr\'s candidates', () => {
  it('each decoder step is a character with its runners-up, when they spell the text', () => {
    const steps = [
      { token: '恐', prob: 0.6, candidates: [{ token: '恐', prob: 0.6 }, { token: '怒', prob: 0.2 }] },
      { token: '##竜', prob: 0.9, candidates: [{ token: '##竜', prob: 0.9 }, { token: '電', prob: 0.05 }] },
    ];
    expect(mangaStepsToChars('恐竜', steps)).toEqual([
      { ch: '恐', p: 0.6, alts: [{ ch: '怒', p: 0.2 }] },
      { ch: '竜', p: 0.9, alts: [{ ch: '電', p: 0.05 }] },
    ]);
    // Post-processing changed the text (or a step is several characters): not aligned, no characters.
    expect(mangaStepsToChars('恐竜。', steps)).toBeUndefined();
    expect(mangaStepsToChars('恐竜', [{ token: '恐竜', prob: 0.5, candidates: [] }])).toBeUndefined();
    expect(mangaStepsToChars('恐竜', undefined)).toBeUndefined();
  });
});

describe('recognizeWithRouter', () => {
  it('no provider for any candidate: no-engine, with the download that would read the learner\'s language', async () => {
    const result = await recognizeWithRouter(image, { langs: ['zh'], purpose: 'snip' }, deps([]));
    expect(result).toMatchObject({ ok: false, error: 'no-engine', missing: { lang: 'zh', assetIds: ['paddle-ocr-zh'] } });
  });

  it('dictionary-guided decoding fixes the thumbnail, and the fix is reported as unsure for a one-click undo', async () => {
    const web = provider({ id: 'web', langs: ['ja'], tier: 1 }, {
      page: () => [line('彼後の魅力を語え', 0.9, {
        chars: chars('彼後の魅力を語え', { 0: [0.42, [['恐', 0.25]]], 1: [0.4, [['竜', 0.3]]], 7: [0.55, [['る', 0.3]]] }),
      })],
    });
    const result = await recognizeWithRouter(image, { langs: ['ja'], purpose: 'snip' }, deps([web]));
    expect(result).toMatchObject({ ok: true, text: '恐竜の魅力を語る', lang: 'ja', engine: 'web', engines: ['web'] });
    expect(result.lines[0].corrected).toBe(3);
    expect(result.unsure.find((u) => u.at === 0)).toMatchObject({ ch: '恐', alts: ['彼'] });
  });

  it('an unsure line is re-read by the next provider and merged per character', async () => {
    const web = provider({ id: 'web', langs: ['ja'], tier: 1 }, {
      page: () => [line('彼後の魅力', 0.55, { chars: chars('彼後の魅力', { 0: [0.3, []], 1: [0.3, []] }) })],
    });
    const manga = provider({ id: 'manga', langs: ['ja'], tier: 2 }, { line: () => line('恐竜の魅カ', 0.75) });
    const result = await recognizeWithRouter(image, { langs: ['ja'], purpose: 'snip' }, deps([web, manga]));
    // manga-ocr's 恐竜 makes a word; its カ (katakana) for 力 does not, so PaddleOCR's stays.
    expect(result.text).toBe('恐竜の魅力');
    expect(result.engines).toEqual(['web', 'manga']);
    expect(result.lines[0].consulted).toEqual(['web', 'manga']);
    expect(manga.lines).toEqual(['ja']);
  });

  it('a sure line is never sent to the next provider', async () => {
    const web = provider({ id: 'web', langs: ['ja'], tier: 1 }, { page: () => [line('魅力', 0.96, { chars: chars('魅力') })] });
    const manga = provider({ id: 'manga', langs: ['ja'], tier: 2 }, { line: () => line('魅カ', 0.75) });
    const result = await recognizeWithRouter(image, { langs: ['ja'], purpose: 'snip' }, deps([web, manga]));
    expect(manga.lines).toEqual([]);
    expect(result.engines).toEqual(['web']);
  });

  it('several candidate languages: each is read, and the text\'s own language wins', async () => {
    const web = provider({ id: 'web', langs: ['ja', 'zh'], tier: 1 }, {
      page: (lang) => (lang === 'ja' ? [line('过度的崇拝', 0.6)] : [line('过度的崇拜', 0.9)]),
    });
    const result = await recognizeWithRouter(image, { langs: ['ja', 'zh'], purpose: 'snip' }, deps([web]));
    expect(web.pages).toEqual(['ja', 'zh']);
    expect(result).toMatchObject({ lang: 'zh', text: '过度的崇拜' });
  });

  it('a good read in the learner\'s own language stops the search', async () => {
    const web = provider({ id: 'web', langs: ['ja', 'zh'], tier: 1 }, { page: () => [line('魅力を語る', 0.95)] });
    await recognizeWithRouter(image, { langs: ['ja', 'zh'], purpose: 'snip' }, deps([web]));
    expect(web.pages).toEqual(['ja']);
  });

  it('text in a language no provider reads: kept, with that reader offered', async () => {
    const web = provider({ id: 'web', langs: ['ja'], tier: 1 }, { page: () => [line('这是我们的书', 0.7)] });
    const result = await recognizeWithRouter(image, { langs: ['ja'], purpose: 'snip' }, deps([web]));
    expect(result).toMatchObject({ ok: true, lang: 'zh', text: '这是我们的书', missing: { lang: 'zh', assetIds: ['paddle-ocr-zh'] } });
  });

  it('the budget stops the fallbacks (the first read always completes)', async () => {
    let now = 0;
    const web = provider({ id: 'web', langs: ['ja'], tier: 1 }, {
      page: () => {
        now = 5000;
        return [line('彼後', 0.4), line('語え', 0.4)];
      },
    });
    const manga = provider({ id: 'manga', langs: ['ja'], tier: 2 }, { line: () => line('恐竜', 0.75) });
    const result = await recognizeWithRouter(image, { langs: ['ja'], purpose: 'snip', budgetMs: 1000 }, deps([web, manga], { now: () => now }));
    expect(result.text).toBe('彼後\n語え');
    expect(manga.lines).toEqual([]);
    expect(result.timedOut).toBe(true);
  });

  it('a provider that throws is reported, not fatal', async () => {
    const web = provider({ id: 'web', langs: ['ja'], tier: 1 }, { page: () => Promise.reject(new Error('onnx died')) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await recognizeWithRouter(image, { langs: ['ja'], purpose: 'snip' }, deps([web]));
    warn.mockRestore();
    expect(result).toMatchObject({ ok: false, error: 'ocr-failed' });
  });

  it('cancelled before reading: nothing is read', async () => {
    const web = provider({ id: 'web', langs: ['ja'], tier: 1 }, { page: () => [line('魅力', 0.9)] });
    const ctl = new AbortController();
    ctl.abort();
    const result = await recognizeWithRouter(image, { langs: ['ja'], purpose: 'snip', signal: ctl.signal }, deps([web]));
    expect(result.error).toBe('cancelled');
    expect(web.pages).toEqual([]);
  });
});
