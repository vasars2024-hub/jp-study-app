import { describe, expect, it } from 'vitest';
import {
  buildMangaCaptureTarget,
  buildVisualNovelCaptureTarget,
  LENS_CAPTURE_TARGET_MAX_AGE_MS,
  LENS_CAPTURE_TARGET_WORKFLOWS,
  normalizeLensCaptureTarget,
  parseLensCaptureTarget,
} from '../lensCaptureTarget';
import { normalizeReadingLensCapture } from '../readingLens';

const fields = {
  visualNovelId: ' vn-1 ',
  title: '  Steins;Gate ',
  routeId: ' route-a ',
  chapter: ' Chapter 2 ',
  scene: ' Lab ',
};

describe('lens capture target', () => {
  it('derives the contract provenance fields from the workflow context', () => {
    const target = buildVisualNovelCaptureTarget(fields, 50_000);
    expect(target).toEqual({
      workflow: 'visual-novel',
      sourceLabel: 'Steins;Gate · Chapter 2 · Lab',
      sourceRef: 'vn:vn-1?route=route-a&chapter=Chapter%202&scene=Lab',
      createdAt: 50_000,
      visualNovel: {
        visualNovelId: 'vn-1',
        title: 'Steins;Gate',
        routeId: 'route-a',
        chapter: 'Chapter 2',
        scene: 'Lab',
      },
    });
  });

  it('omits the context a workflow has not recorded', () => {
    const target = buildVisualNovelCaptureTarget(
      { visualNovelId: 'vn-2', title: 'Clannad', routeId: '', chapter: '', scene: '' },
      1,
    );
    expect(target.sourceLabel).toBe('Clannad');
    expect(target.sourceRef).toBe('vn:vn-2');
  });

  it('re-derives provenance on read rather than trusting what was stored', () => {
    const now = 1_000_000_000;
    const target = normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      sourceLabel: 'A title that was never this one',
      sourceRef: 'vn:some-other-novel',
      createdAt: now,
      visualNovel: { visualNovelId: 'vn-1', title: 'Steins;Gate', routeId: '', chapter: '', scene: '' },
    }, now);
    expect(target?.sourceLabel).toBe('Steins;Gate');
    expect(target?.sourceRef).toBe('vn:vn-1');
  });

  it('rejects malformed, unknown-workflow, expired, and implausibly future targets', () => {
    const now = 1_000_000_000;
    const visualNovel = { visualNovelId: 'vn-1', title: 'Title', routeId: '', chapter: '', scene: '' };
    expect(parseLensCaptureTarget('{', now)).toBeNull();
    expect(parseLensCaptureTarget(null, now)).toBeNull();
    expect(normalizeLensCaptureTarget({ workflow: 'manga', createdAt: now, visualNovel }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({ workflow: 'visual-novel', createdAt: now }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      createdAt: now,
      visualNovel: { ...visualNovel, title: '' },
    }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      createdAt: now - LENS_CAPTURE_TARGET_MAX_AGE_MS - 1,
      visualNovel,
    }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      createdAt: now + 60_001,
      visualNovel,
    }, now)).toBeNull();
  });

  it('round-trips through storage', () => {
    const now = 2_000_000;
    const target = buildVisualNovelCaptureTarget(fields, now);
    expect(parseLensCaptureTarget(JSON.stringify(target), now)).toEqual(target);
  });

  it('keeps a Japanese ref inside the capture contract budget, escapes intact', () => {
    const long = '長'.repeat(240);
    const target = buildVisualNovelCaptureTarget(
      { visualNovelId: long, title: long, routeId: long, chapter: long, scene: long },
      1,
    );
    expect(target.sourceRef.length).toBeLessThanOrEqual(1_000);
    expect(target.sourceLabel.length).toBeLessThanOrEqual(240);
    // A ref sliced mid-escape would throw here instead of decoding.
    expect(() => decodeURIComponent(target.sourceRef.slice(3))).not.toThrow();
  });

  it('survives the capture normalizer that stores it, unchanged', () => {
    const target = buildVisualNovelCaptureTarget(
      { visualNovelId: 'vn-1', title: 'シュタインズ・ゲート', routeId: 'r', chapter: '第二章', scene: '' },
      1,
    );
    const capture = normalizeReadingLensCapture({
      source: 'screen',
      sourceLabel: target.sourceLabel,
      sourceRef: target.sourceRef,
      text: 'テスト',
      lines: [],
    });
    expect(capture?.sourceLabel).toBe(target.sourceLabel);
    expect(capture?.sourceRef).toBe(target.sourceRef);
  });
});

describe('lens capture target: manga', () => {
  const mangaFields = {
    mangaId: ' manga-1 ',
    title: '  よつばと！ ',
    chapter: ' 12 ',
    page: ' 47 ',
  };

  it('is a declared workflow beside the visual novel, not a loose string', () => {
    expect([...LENS_CAPTURE_TARGET_WORKFLOWS]).toEqual(['visual-novel', 'manga']);
  });

  it('derives the contract provenance fields from the page the reader is on', () => {
    const target = buildMangaCaptureTarget(mangaFields, 50_000);
    expect(target).toEqual({
      workflow: 'manga',
      sourceLabel: 'よつばと！ · Ch. 12 · p. 47',
      sourceRef: 'manga:manga-1?chapter=12&page=47',
      createdAt: 50_000,
      manga: { mangaId: 'manga-1', title: 'よつばと！', chapter: '12', page: '47' },
    });
  });

  it('omits a chapter a plain import does not have, and keeps the page', () => {
    const target = buildMangaCaptureTarget(
      { mangaId: 'manga-2', title: 'Yotsuba', chapter: '', page: '3' },
      1,
    );
    expect(target.sourceLabel).toBe('Yotsuba · p. 3');
    expect(target.sourceRef).toBe('manga:manga-2?page=3');
  });

  it('re-derives provenance on read rather than trusting what was stored', () => {
    const now = 1_000_000_000;
    const target = normalizeLensCaptureTarget({
      workflow: 'manga',
      sourceLabel: 'A book that was never this one',
      sourceRef: 'manga:some-other-book?page=999',
      createdAt: now,
      manga: { mangaId: 'manga-1', title: 'Yotsuba', chapter: '', page: '47' },
    }, now);
    expect(target?.sourceLabel).toBe('Yotsuba · p. 47');
    expect(target?.sourceRef).toBe('manga:manga-1?page=47');
  });

  it('refuses a manga target whose payload cannot address a book', () => {
    const now = 1_000_000_000;
    const manga = { mangaId: 'manga-1', title: 'Yotsuba', chapter: '', page: '1' };
    // No payload at all, and the payload under the *other* workflow's key.
    expect(normalizeLensCaptureTarget({ workflow: 'manga', createdAt: now }, now)).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now, visualNovel: manga },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now, manga: { ...manga, title: '' } },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now, manga: { ...manga, mangaId: '' } },
      now,
    )).toBeNull();
    // The same expiry the novel is held to.
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now - LENS_CAPTURE_TARGET_MAX_AGE_MS - 1, manga },
      now,
    )).toBeNull();
    // Control: the same shape inside the window resolves, so the refusals above
    // are the named rules and not a dead manga branch.
    expect(normalizeLensCaptureTarget({ workflow: 'manga', createdAt: now, manga }, now))
      .not.toBeNull();
  });

  it('keeps a page with no number addressable, which an unpaginated view produces', () => {
    const target = buildMangaCaptureTarget(
      { mangaId: 'manga-3', title: 'Untitled', chapter: '', page: '' },
      1,
    );
    expect(target.sourceLabel).toBe('Untitled');
    expect(target.sourceRef).toBe('manga:manga-3');
    expect(parseLensCaptureTarget(JSON.stringify(target), 1)).toEqual(target);
  });

  it('keeps a Japanese ref inside the capture contract budget, escapes intact', () => {
    const long = '巻'.repeat(240);
    const target = buildMangaCaptureTarget(
      { mangaId: long, title: long, chapter: long, page: long },
      1,
    );
    expect(target.sourceRef.length).toBeLessThanOrEqual(1_000);
    expect(target.sourceLabel.length).toBeLessThanOrEqual(240);
    expect(() => decodeURIComponent(target.sourceRef.slice('manga:'.length))).not.toThrow();
  });

  it('survives the capture normalizer that stores it — label NFKC-folded, ref intact', () => {
    // TRAP for whoever adds the next workflow: `normalizeReadingLensCapture`
    // runs every string through `NFKC` (`readingLens.ts:129`), so a full-width
    // `！` in a title is stored as `!`. That is pre-existing and applies to the
    // visual-novel label too — its own test simply uses a title with no
    // full-width punctuation. The *ref* is percent-encoded and therefore ASCII,
    // so it round-trips byte-for-byte and stays the addressable half.
    const target = buildMangaCaptureTarget(
      { mangaId: 'manga-1', title: 'よつばと！', chapter: '第12話', page: '47' },
      1,
    );
    const capture = normalizeReadingLensCapture({
      source: 'screen',
      sourceLabel: target.sourceLabel,
      sourceRef: target.sourceRef,
      text: 'テスト',
      lines: [],
    });
    expect(capture?.sourceLabel).toBe(target.sourceLabel.normalize('NFKC'));
    expect(capture?.sourceLabel).toBe('よつばと! · Ch. 第12話 · p. 47');
    expect(capture?.sourceRef).toBe(target.sourceRef);
    expect(decodeURIComponent(capture!.sourceRef.slice('manga:'.length)))
      .toBe('manga-1?chapter=第12話&page=47');
  });
});
