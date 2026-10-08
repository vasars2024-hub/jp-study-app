// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeSubtitleBytes } from '../subtitleDecode';

/*
 * Real byte fixtures. Node's TextDecoder can read the legacy encodings but not
 * write them, so the encoded lines are spelled out byte for byte (checked against
 * the WHATWG tables) and wrapped in an ASCII SRT skeleton, which is what every
 * candidate decodes identically and the detector must see through.
 */

const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));

function srt(lines: number[][]): Uint8Array {
  const out: number[] = [];
  lines.forEach((line, index) => {
    out.push(...ascii(`${index + 1}\r\n00:00:0${index},000 --> 00:00:0${index + 1},000\r\n`));
    out.push(...line, 0x0d, 0x0a, 0x0d, 0x0a);
  });
  return Uint8Array.from(out);
}

// こんにちは、世界 / 日本語のテストです。/ ありがとう
const SJIS_HELLO = [0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd, 0x81, 0x41, 0x90, 0xa2, 0x8a, 0x45];
const SJIS_TEST = [0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x82, 0xcc, 0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x82, 0xc5, 0x82, 0xb7, 0x81, 0x42];
const SJIS_THANKS = [0x82, 0xa0, 0x82, 0xe8, 0x82, 0xaa, 0x82, 0xc6, 0x82, 0xa4];

// 你好世界 / 我们，中文字幕。
const GB_HELLO = [0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7];
const GB_SUBS = [0xce, 0xd2, 0xc3, 0xc7, 0xa3, 0xac, 0xd6, 0xd0, 0xce, 0xc4, 0xd7, 0xd6, 0xc4, 0xbb, 0xa1, 0xa3];

/** Windows-1251 for Russian: А..я are 0xC0..0xFF in order, Ё 0xA8, ё 0xB8. */
function cp1251(text: string): number[] {
  return [...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c < 0x80) return c;
    if (c >= 0x0410 && c <= 0x044f) return c - 0x0410 + 0xc0;
    if (c === 0x0401) return 0xa8;
    if (c === 0x0451) return 0xb8;
    throw new Error(`not in the fixture table: ${ch}`);
  });
}

function utf16(text: string, order: 'le' | 'be', bom: boolean): Uint8Array {
  const out: number[] = bom ? (order === 'le' ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (order === 'le') out.push(c & 0xff, c >> 8);
    else out.push(c >> 8, c & 0xff);
  }
  return Uint8Array.from(out);
}

const SRT_TEXT = '1\r\n00:00:01,000 --> 00:00:02,000\r\n行くぞ、みんな！\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nはい\r\n';

describe('decodeSubtitleBytes', () => {
  it('reads Shift-JIS Japanese', () => {
    const result = decodeSubtitleBytes(srt([SJIS_HELLO, SJIS_TEST, SJIS_THANKS]));
    expect(result.encoding).toBe('shift_jis');
    expect(result.text).toContain('こんにちは、世界');
    expect(result.text).toContain('日本語のテストです。');
    expect(result.text).toContain('ありがとう');
    expect(result.text).toContain('00:00:01,000 --> 00:00:02,000');
  });

  it('reads a single short Shift-JIS line', () => {
    expect(decodeSubtitleBytes(srt([SJIS_THANKS])).encoding).toBe('shift_jis');
  });

  it('reads GB2312/GBK Chinese as GB18030', () => {
    const result = decodeSubtitleBytes(srt([GB_HELLO, GB_SUBS]));
    expect(result.encoding).toBe('gb18030');
    expect(result.text).toContain('你好世界');
    expect(result.text).toContain('我们，中文字幕。');
  });

  it('reads Windows-1251 Russian', () => {
    const result = decodeSubtitleBytes(srt([
      cp1251('Привет, мир! Как дела?'),
      cp1251('Всё хорошо, спасибо.'),
      cp1251('Пойдём домой'),
    ]));
    expect(result.encoding).toBe('windows-1251');
    expect(result.text).toContain('Привет, мир! Как дела?');
    expect(result.text).toContain('Всё хорошо, спасибо.');
  });

  it('keeps valid UTF-8 as UTF-8, and strips its BOM', () => {
    const bytes = new TextEncoder().encode(SRT_TEXT);
    expect(decodeSubtitleBytes(bytes)).toEqual({ text: SRT_TEXT, encoding: 'utf-8' });
    const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
    expect(decodeSubtitleBytes(withBom)).toEqual({ text: SRT_TEXT, encoding: 'utf-8' });
    // An ArrayBuffer is accepted as well as a view.
    expect(decodeSubtitleBytes(bytes.buffer.slice(0)).text).toBe(SRT_TEXT);
  });

  it('reads UTF-16 with a BOM in both byte orders', () => {
    expect(decodeSubtitleBytes(utf16(SRT_TEXT, 'le', true))).toEqual({ text: SRT_TEXT, encoding: 'utf-16le' });
    expect(decodeSubtitleBytes(utf16(SRT_TEXT, 'be', true))).toEqual({ text: SRT_TEXT, encoding: 'utf-16be' });
  });

  it('reads UTF-16 without a BOM from its NUL bytes', () => {
    expect(decodeSubtitleBytes(utf16(SRT_TEXT, 'le', false))).toEqual({ text: SRT_TEXT, encoding: 'utf-16le' });
    expect(decodeSubtitleBytes(utf16(SRT_TEXT, 'be', false))).toEqual({ text: SRT_TEXT, encoding: 'utf-16be' });
  });

  it('answers empty input with empty text', () => {
    expect(decodeSubtitleBytes(new Uint8Array(0))).toEqual({ text: '', encoding: 'utf-8' });
  });

  it('treats pure ASCII as UTF-8', () => {
    expect(decodeSubtitleBytes(Uint8Array.from(ascii('1\n00:00:01,000 --> 00:00:02,000\nHello\n'))).encoding).toBe('utf-8');
  });
});
