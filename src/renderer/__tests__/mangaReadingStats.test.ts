import { describe, expect, it } from 'vitest';
import { createMangaReadingTracker, mokuroPageCharCount } from '../mangaReadingStats';
import type { MokuroPage } from '../../shared/mokuroTypes';

function tracker() {
  const chars: number[] = [];
  const garden: number[] = [];
  const t = createMangaReadingTracker({
    addChars: (n) => chars.push(n),
    creditGardenPage: (p) => garden.push(p),
  });
  return { t, chars, garden };
}

describe('mokuroPageCharCount', () => {
  it('counts dialogue and narration, not SFX, ignored regions or whitespace', () => {
    const page = {
      version: '1',
      img_width: 1,
      img_height: 1,
      blocks: [
        { box: [0, 0, 1, 1], vertical: true, lines: ['おはよう', 'ござい ます'], kind: 'text' },
        { box: [0, 0, 1, 1], vertical: true, lines: ['ドドド'], kind: 'sfx' },
        { box: [0, 0, 1, 1], vertical: true, lines: ['ページ12'], kind: 'ignore' },
      ],
    } as unknown as MokuroPage;
    expect(mokuroPageCharCount(page)).toBe(4 + 5);
    expect(mokuroPageCharCount(null)).toBe(0);
  });
});

describe('createMangaReadingTracker', () => {
  it('credits a page and its OCR characters when the reader turns forward off it', () => {
    const { t, chars, garden } = tracker();
    t.notePageChars(0, 40);
    t.turn(0, 1);
    expect(garden).toEqual([0]);
    expect(chars).toEqual([40]);
  });

  it('counts a page with no OCR as a page with no characters', () => {
    const { t, chars, garden } = tracker();
    t.turn(3, 4);
    expect(garden).toEqual([3]);
    expect(chars).toEqual([]);
  });

  it('credits each page once, however often it is re-read', () => {
    const { t, garden, chars } = tracker();
    t.notePageChars(0, 10);
    t.turn(0, 1);
    t.turn(1, 0);
    t.turn(0, 1);
    expect(garden).toEqual([0]);
    expect(chars).toEqual([10]);
  });

  it('credits nothing for going back or for a jump', () => {
    const { t, garden } = tracker();
    t.turn(5, 4);
    t.turn(0, 120);
    expect(garden).toEqual([]);
  });

  it('credits both pages of a two-page spread', () => {
    const { t, garden } = tracker();
    t.turn(2, 4, 2);
    expect(garden).toEqual([2, 3]);
  });
});
