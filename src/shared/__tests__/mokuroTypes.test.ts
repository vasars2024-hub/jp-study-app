import { describe, expect, it } from 'vitest';
import {
  MOKURO_EMIT_VERSION,
  parseMokuroPage,
  MokuroParseError,
  regionIdFromBox,
  blockContext,
  isSupportedMokuroVersion,
} from '../mokuroTypes';

describe('mokuroTypes', () => {
  const validPage = {
    version: MOKURO_EMIT_VERSION,
    img_width: 800,
    img_height: 1200,
    blocks: [
      {
        box: [10, 20, 100, 200],
        vertical: true,
        font_size: 18,
        lines: ['こんにちは'],
        regionId: 'p1:10,20,100,200',
        confidence: 0.9,
        kind: 'text' as const,
      },
    ],
  };

  it('parses our 1.01 emitter shape', () => {
    const page = parseMokuroPage(validPage);
    expect(page.version).toBe(MOKURO_EMIT_VERSION);
    expect(page.blocks).toHaveLength(1);
    expect(page.blocks[0].lines[0]).toBe('こんにちは');
    expect(page.blocks[0].regionId).toBe('p1:10,20,100,200');
  });

  it('accepts stock Mokuro 0.1.6', () => {
    const page = parseMokuroPage({
      version: '0.1.6',
      img_width: 100,
      img_height: 200,
      blocks: [{ box: [0, 0, 10, 10], vertical: false, lines: ['あ'] }],
    });
    expect(page.version).toBe('0.1.6');
    expect(isSupportedMokuroVersion('0.1.6')).toBe(true);
  });

  it('rejects unsupported major versions', () => {
    expect(() =>
      parseMokuroPage({
        version: '2.0.0',
        img_width: 1,
        img_height: 1,
        blocks: [],
      }),
    ).toThrow(MokuroParseError);
  });

  it('rejects malformed boxes', () => {
    expect(() =>
      parseMokuroPage({
        version: '0.1.0',
        img_width: 1,
        img_height: 1,
        blocks: [{ box: [1, 2], vertical: true, lines: [] }],
      }),
    ).toThrow(/box/);
  });

  it('builds stable region ids from rounded boxes', () => {
    expect(regionIdFromBox([10.4, 20.6, 100.2, 200.8], '0001')).toBe('0001:10,21,100,201');
  });

  it('parses optional rawLines and order fields', () => {
    const page = parseMokuroPage({
      ...validPage,
      blocks: [
        {
          ...validPage.blocks[0],
          rawLines: ['こんにちわ'],
          order: 3,
        },
      ],
    });
    expect(page.blocks[0].rawLines).toEqual(['こんにちわ']);
    expect(page.blocks[0].order).toBe(3);
  });

  it('omits rawLines/order when absent, without throwing', () => {
    const page = parseMokuroPage(validPage);
    expect(page.blocks[0].rawLines).toBeUndefined();
    expect(page.blocks[0].order).toBeUndefined();
  });

  it('accepts the ignore block kind', () => {
    const page = parseMokuroPage({
      ...validPage,
      blocks: [{ ...validPage.blocks[0], kind: 'ignore' as const }],
    });
    expect(page.blocks[0].kind).toBe('ignore');
  });

  it('joins vertical lines without newlines for context', () => {
    expect(
      blockContext({
        box: [0, 0, 1, 1],
        vertical: true,
        lines: ['あ', 'い'],
      }),
    ).toBe('あい');
    expect(
      blockContext({
        box: [0, 0, 1, 1],
        vertical: false,
        lines: ['hello', 'world'],
      }),
    ).toBe('hello\nworld');
  });
});
