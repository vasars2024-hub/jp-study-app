import { describe, expect, it } from 'vitest';
import {
  normalizeVisualNovelOcrTarget,
  parseVisualNovelOcrTarget,
  VISUAL_NOVEL_OCR_TARGET_MAX_AGE_MS,
} from '../visualNovelOcrTarget';

describe('visual novel OCR target', () => {
  it('normalizes a current capture target and trims its context', () => {
    const now = 50_000;
    expect(normalizeVisualNovelOcrTarget({
      visualNovelId: ' vn-1 ',
      title: '  Steins;Gate ',
      routeId: ' route-a ',
      chapter: ' Chapter 2 ',
      scene: ' Lab ',
      createdAt: now,
    }, now)).toEqual({
      visualNovelId: 'vn-1',
      title: 'Steins;Gate',
      routeId: 'route-a',
      chapter: 'Chapter 2',
      scene: 'Lab',
      createdAt: now,
    });
  });

  it('rejects malformed, expired, and implausibly future targets', () => {
    const now = 1_000_000_000;
    expect(parseVisualNovelOcrTarget('{', now)).toBeNull();
    expect(normalizeVisualNovelOcrTarget({
      visualNovelId: 'vn-1',
      title: 'Title',
      createdAt: now - VISUAL_NOVEL_OCR_TARGET_MAX_AGE_MS - 1,
    }, now)).toBeNull();
    expect(normalizeVisualNovelOcrTarget({
      visualNovelId: 'vn-1',
      title: 'Title',
      createdAt: now + 60_001,
    }, now)).toBeNull();
  });
});
