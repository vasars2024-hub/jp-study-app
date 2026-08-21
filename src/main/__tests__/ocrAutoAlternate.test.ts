/**
 * `ocrAuto` keeping the read it did not choose.
 *
 * In `auto`, whenever `shouldTryMangaOcr` fires, BOTH recognizers run and the
 * loser used to be discarded — so a reader who disagreed with the pick paid for
 * a whole second OCR pass to see a read that had already been computed. The
 * loser now rides back as `alternate`.
 *
 * Two things are asserted that a "does it come back" test would miss:
 *  - the alternate is the OTHER engine in BOTH directions, i.e. it appears on
 *    the manga-wins branch too, not just the common web-wins one;
 *  - an EMPTY loser is dropped, because a control that offers "switch engines"
 *    and lands on a blank passage is a dead control, not a choice.
 * And the negative control: a read where only one engine ran carries none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = {
  paddleAvailable: true,
  mangaAvailable: true,
  paddleText: '',
  mangaText: '',
  mangaCalls: 0,
};

vi.mock('electron', () => ({
  nativeImage: {
    // ocrAuto only asks for the size (to score character density) and, in heavy
    // mode, for a resize. A 1000x1000 page is well over HEAVY_UPSCALE_BELOW_SIDE
    // so nothing here reaches the upscale branch.
    createFromDataURL: () => ({
      getSize: () => ({ width: 1000, height: 1000 }),
      resize: () => ({ toDataURL: () => 'data:image/png;base64,x' }),
    }),
  },
}));

vi.mock('../paddleOcr', () => ({
  paddleOcrAvailable: () => h.paddleAvailable,
  recognizePaddleOcrDataUrl: async () => ({
    lang: 'ja',
    text: h.paddleText,
    lines: h.paddleText
      ? [{ text: h.paddleText, box: [0, 0, 200, 20], vertical: false, confidence: 0.4 }]
      : [],
  }),
}));

vi.mock('../mangaOcr', () => ({
  mangaOcrAvailable: () => h.mangaAvailable,
  recognizeMangaOcrRegionsDataUrl: async () => {
    h.mangaCalls += 1;
    return {
      text: h.mangaText,
      lines: h.mangaText
        ? [{ text: h.mangaText, box: [0, 0, 200, 20], vertical: true, confidence: 0.9 }]
        : [],
    };
  },
}));

// The routing decision itself is pinned by `shared/__tests__/ocrRouting.test.ts`.
// Forcing it open here is what makes the both-engines path reachable at all —
// otherwise a weak-but-passable general read would return before manga ever runs.
vi.mock('../../shared/ocrRouting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/ocrRouting')>();
  return { ...actual, shouldTryMangaOcr: () => true };
});

const { ocrAuto } = await import('../ocrAuto');

const DATA_URL = 'data:image/png;base64,x';

beforeEach(() => {
  h.paddleAvailable = true;
  h.mangaAvailable = true;
  h.mangaCalls = 0;
  h.paddleText = '';
  h.mangaText = '';
});

describe('ocrAuto — the alternate read', () => {
  it('carries the general read when manga-ocr wins', async () => {
    // Vertical Japanese with no latin: pickBetterRead prefers manga here.
    h.paddleText = 'ネコ ガ マ ド';
    h.mangaText = '猫が窓の外を見ている';

    const res = await ocrAuto(DATA_URL);

    expect(h.mangaCalls).toBe(1);
    expect(res.engine).toBe('manga');
    expect(res.alternate?.engine).toBe('web');
    expect(res.alternate?.text).toBe('ネコ ガ マ ド');
    expect(res.alternate?.lines).toHaveLength(1);
  });

  it('carries the manga read when the general engine wins', async () => {
    // Latin-heavy text is exactly what manga-ocr hallucinates on, so the
    // general read wins and manga-ocr becomes the alternate.
    h.paddleText = 'The quick brown fox jumps over the lazy dog';
    h.mangaText = 'あ';

    const res = await ocrAuto(DATA_URL);

    expect(res.engine).toBe('web');
    expect(res.mangaConsidered).toBe(true);
    expect(res.alternate?.engine).toBe('manga');
    expect(res.alternate?.text).toBe('あ');
  });

  it('drops an EMPTY loser rather than offering a blank swap', async () => {
    h.paddleText = 'The quick brown fox jumps over the lazy dog';
    h.mangaText = '   ';

    const res = await ocrAuto(DATA_URL);

    expect(res.engine).toBe('web');
    // manga-ocr DID run — the alternate is absent because it came back empty,
    // not because the second pass was skipped.
    expect(h.mangaCalls).toBe(1);
    expect(res.alternate).toBeUndefined();
  });

  it('drops a manga read the router rejected as junk — the live `．．．` case', async () => {
    // Measured live on 2026-08-21: a 96 px vertical `猫だ` made the general
    // engine's 2-char read escalate, and manga-ocr answered `．．．` — non-empty,
    // so the emptiness guard passed it, and 0.0 Japanese, so `pickBetterRead`
    // had already thrown it out. Offering the reader a one-click swap onto a
    // read the router called junk is the dead-control shape this guard exists
    // to stop.
    h.paddleText = '猫だ';
    h.mangaText = '．．．';

    const res = await ocrAuto(DATA_URL);

    expect(h.mangaCalls).toBe(1);
    expect(res.engine).toBe('web');
    expect(res.text).toBe('猫だ');
    expect(res.alternate).toBeUndefined();
  });

  it('drops a degenerate repetition loop, but keeps a merely SHORT Japanese read', async () => {
    h.paddleText = 'The quick brown fox jumps over the lazy dog';
    h.mangaText = 'あ'.repeat(12);
    expect((await ocrAuto(DATA_URL)).alternate).toBeUndefined();

    // Short is a comparison, not a defect: a real two-character Japanese read is
    // a legitimate thing for a reader to switch to, so it must survive.
    h.mangaText = '猫だ';
    const short = await ocrAuto(DATA_URL);
    expect(short.engine).toBe('web');
    expect(short.alternate?.text).toBe('猫だ');
  });

  it('NEGATIVE CONTROL: a single-engine read carries no alternate', async () => {
    h.mangaAvailable = false;
    h.paddleText = '猫が窓の外を見ている';

    const res = await ocrAuto(DATA_URL);

    expect(h.mangaCalls).toBe(0);
    expect(res.engine).toBe('web');
    expect(res.alternate).toBeUndefined();
  });

  it('NEGATIVE CONTROL: a forced engine never runs the other one', async () => {
    h.paddleText = 'x';
    h.mangaText = '猫';

    const forced = await ocrAuto(DATA_URL, { engine: 'web' });

    expect(h.mangaCalls).toBe(0);
    expect(forced.alternate).toBeUndefined();
  });
});
