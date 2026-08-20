import { describe, expect, it } from 'vitest';
import {
  buildVisualNovelCaptureTarget,
  LENS_CAPTURE_TARGET_MAX_AGE_MS,
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
