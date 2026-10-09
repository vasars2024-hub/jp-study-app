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
