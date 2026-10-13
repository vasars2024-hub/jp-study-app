import { describe, expect, it } from 'vitest';
import { MokuroParseError, parseMokuroPage } from '../mokuroTypes';
import { matchMokuroPages, mokuroStemKey, parseMokuroVolume } from '../mokuroVolume';

/** A trimmed real-shape Mokuro 0.2 volume: two pages, `lines_coords` included. */
function volume(pages: Array<{ img: string; lines: string[][] }> = [
  { img: '001.jpg', lines: [['ちょっと', '待って！']] },
  { img: '002.jpg', lines: [['はい'], ['  ']] },
]) {
  return {
    version: '0.2.1',
    title: 'よつばと！',
    title_uuid: 'a',
    volume: '01',
    volume_uuid: 'b',
    pages: pages.map((p) => ({
      version: '0.2.1',
      img_width: 1000,
      img_height: 1500,
      img_path: p.img,
      blocks: p.lines.map((lines, i) => ({
        box: [100 + i * 10, 200, 180, 400],
        vertical: true,
        font_size: 28,
        lines_coords: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
        lines,
      })),
    })),
  };
}

describe('parseMokuroVolume', () => {
  it('reads a Mokuro 0.2 volume into our page schema', () => {
    const parsed = parseMokuroVolume(volume());
    expect(parsed.title).toBe('よつばと！');
    expect(parsed.pages.map((p) => p.stemKey)).toEqual(['001', '002']);
    const first = parsed.pages[0].page;
    // Valid for the cache reader: version 1.01 round-trips through parseMokuroPage.
    expect(parseMokuroPage(first)).toEqual(first);
    expect(first.blocks[0]).toMatchObject({
      box: [100, 200, 180, 400],
      vertical: true,
      font_size: 28,
      lines: ['ちょっと', '待って！'],
      rawLines: ['ちょっと', '待って！'],
      kind: 'text',
    });
    expect(first.blocks[0]).not.toHaveProperty('lines_coords');
  });

  it('drops blocks whose lines are all blank', () => {
    expect(parseMokuroVolume(volume()).pages[1].page.blocks).toHaveLength(1);
  });

  it('refuses what is not a volume', () => {
    expect(() => parseMokuroVolume({ version: '0.2.1' })).toThrow(MokuroParseError);
    expect(() => parseMokuroVolume({ version: '9.0', pages: [] })).toThrow(MokuroParseError);
    expect(() => parseMokuroVolume([1, 2])).toThrow(MokuroParseError);
    const broken = volume();
    (broken.pages[0].blocks[0] as { box: unknown }).box = ['x'];
    expect(() => parseMokuroVolume(broken)).toThrow(MokuroParseError);
  });
});

describe('matchMokuroPages', () => {
  it('pairs pages by file name, case-insensitively, and keys region ids by the library stem', () => {
    const parsed = parseMokuroVolume(volume([
      { img: 'vol1/001.JPG', lines: [['あ']] },
      { img: 'vol1/003.jpg', lines: [['う']] },
    ]));
    const result = matchMokuroPages(parsed, ['001', '002']);
    expect(result.matchedBy).toBe('name');
    expect(result.assignments.map((a) => a.stem)).toEqual(['001']);
    expect(result.assignments[0].page.blocks[0].regionId).toBe('001:100,200,180,400');
    expect(result.unmatched).toBe(1);
  });

  it('falls back to page order only when no name matches and the counts agree', () => {
    const parsed = parseMokuroVolume(volume());
    const ordered = matchMokuroPages(parsed, ['page_0001', 'page_0002']);
    expect(ordered.matchedBy).toBe('order');
    expect(ordered.assignments.map((a) => a.stem)).toEqual(['page_0001', 'page_0002']);
    expect(ordered.assignments[1].page.blocks[0].lines).toEqual(['はい']);

    const refused = matchMokuroPages(parsed, ['page_0001', 'page_0002', 'page_0003']);
    expect(refused.matchedBy).toBe('none');
    expect(refused.assignments).toEqual([]);
  });

  it('mokuroStemKey strips folders and the extension', () => {
    expect(mokuroStemKey('a\\b\\0007.webp')).toBe('0007');
    expect(mokuroStemKey('noext')).toBe('noext');
  });
});

/**
 * The library renames imported pages to their 1-based position (`0001.jpg`...),
 * so a library stem is a page number, not the source file's name. Comparing it
 * with Mokuro's kept image names as strings put a 0-based volume one page off.
 */
describe('matchMokuroPages against the library\'s 1-based page numbers', () => {
  /** A volume whose page N says `pN` (N counted from 1 in reading order). */
  function numbered(imgs: string[]) {
    return parseMokuroVolume(volume(imgs.map((img, i) => ({ img, lines: [[`p${i + 1}`]] }))));
  }
  const library = (count: number) => Array.from({ length: count }, (_, i) => String(i + 1).padStart(4, '0'));
  const textByStem = (result: ReturnType<typeof matchMokuroPages>) =>
    Object.fromEntries(result.assignments.map((a) => [a.stem, a.page.blocks[0].lines[0]]));

  it.each([
    {
      label: '0-based, four digits (the off-by-one case)',
      imgs: ['0000.jpg', '0001.jpg', '0002.jpg'],
      stems: library(3),
      expected: { '0001': 'p1', '0002': 'p2', '0003': 'p3' },
      matchedBy: 'name',
      unmatched: 0,
    },
    {
      label: '0-based, three digits in a folder',
      imgs: ['img/000.png', 'img/001.png', 'img/002.png'],
      stems: library(3),
      expected: { '0001': 'p1', '0002': 'p2', '0003': 'p3' },
      matchedBy: 'name',
      unmatched: 0,
    },
    {
      label: '1-based, four digits',
      imgs: ['0001.jpg', '0002.jpg', '0003.jpg'],
      stems: library(3),
      expected: { '0001': 'p1', '0002': 'p2', '0003': 'p3' },
      matchedBy: 'name',
      unmatched: 0,
    },
    {
      label: '1-based, unpadded',
      imgs: ['1.jpg', '2.jpg', '10.jpg'],
      stems: ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010'],
      expected: { '0001': 'p1', '0002': 'p2', '0010': 'p3' },
      matchedBy: 'name',
      unmatched: 0,
    },
    {
      label: '0-based with a page Mokuro skipped keeps the gap',
      imgs: ['000.jpg', '001.jpg', '003.jpg'],
      stems: library(4),
      expected: { '0001': 'p1', '0002': 'p2', '0004': 'p3' },
      matchedBy: 'name',
      unmatched: 0,
    },
    {
      label: 'original names, equal counts: the library\'s natural order',
      imgs: ['ch1_p10.jpg', 'ch1_p2.jpg', 'ch1_p1.jpg'],
      stems: library(3),
      expected: { '0001': 'p3', '0002': 'p2', '0003': 'p1' },
      matchedBy: 'order',
      unmatched: 0,
    },
  ])('$label', ({ imgs, stems, expected, matchedBy, unmatched }) => {
    const result = matchMokuroPages(numbered(imgs), stems);
    expect(textByStem(result)).toEqual(expected);
    expect(result.matchedBy).toBe(matchedBy);
    expect(result.unmatched).toBe(unmatched);
    for (const a of result.assignments) expect(a.page.blocks[0].regionId?.startsWith(`${a.stem}:`)).toBe(true);
  });

  it.each([
    {
      label: 'original names with a different page count',
      imgs: ['cover.jpg', 'p1.jpg'],
      stems: library(3),
    },
    {
      label: 'nothing in common with library pages that kept their names',
      imgs: ['0000.jpg', '0001.jpg'],
      stems: ['page_a', 'page_b', 'page_c'],
    },
  ])('refuses: $label', ({ imgs, stems }) => {
    const result = matchMokuroPages(numbered(imgs), stems);
    expect(result.matchedBy).toBe('none');
    expect(result.assignments).toEqual([]);
  });

  it('still string-matches library pages that kept their own names', () => {
    const result = matchMokuroPages(numbered(['000.jpg', 'page_b.jpg']), ['page_b', 'page_c']);
    expect(textByStem(result)).toEqual({ page_b: 'p2' });
    expect(result.matchedBy).toBe('name');
    expect(result.unmatched).toBe(1);
  });

  it('does not treat a numbering that starts above 1 as the library\'s own', () => {
    // `0000`-based library stems (not ours) are names: exact match, no shift.
    const result = matchMokuroPages(numbered(['0000.jpg', '0001.jpg']), ['0000', '0001']);
    expect(textByStem(result)).toEqual({ '0000': 'p1', '0001': 'p2' });
  });
});
