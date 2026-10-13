/**
 * Shared halves of the VN capture fixes: hook-file encoding detection (bug 26),
 * the start offset that lands on a character boundary, binary texthooker
 * frames, and the error codes the renderer translates instead of showing
 * main's English text.
 */
import { describe, expect, it } from 'vitest';
import {
  detectHookFileEncoding,
  hookFileStartOffset,
  parseTexthookerMessage,
  VISUAL_NOVEL_ERROR_CODES,
  VISUAL_NOVEL_ERROR_KEYS,
  VisualNovelError,
  visualNovelErrorCode,
  visualNovelErrorKey,
} from '../visualNovelCapture';
import { VISUAL_NOVEL_EN } from '../i18n/visualNovel/en';
import { VISUAL_NOVEL_JA } from '../i18n/visualNovel/ja';
import { VISUAL_NOVEL_ZH } from '../i18n/visualNovel/zh';
import { VISUAL_NOVEL_RU } from '../i18n/visualNovel/ru';

const utf16le = (text: string, bom = false): Uint8Array => {
  const body = Buffer.from(text, 'utf16le');
  return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
};
const utf16be = (text: string): Uint8Array => {
  const le = Buffer.from(text, 'utf16le');
  const be = Buffer.alloc(le.length);
  for (let index = 0; index < le.length; index += 2) {
    be[index] = le[index + 1];
    be[index + 1] = le[index];
  }
  return Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
};
/** 「はい。」 and 「今日は雨ですね。」 in Shift-JIS, written out byte by byte. */
const SJIS_LINES = Uint8Array.from([
  0x82, 0xcd, 0x82, 0xa2, 0x81, 0x42, 0x0d, 0x0a,
  0x8d, 0xa1, 0x93, 0xfa, 0x82, 0xcd, 0x89, 0x4a, 0x82, 0xc5, 0x82, 0xb7, 0x82, 0xcb, 0x81, 0x42, 0x0d, 0x0a,
]);

describe('detectHookFileEncoding', () => {
  it('reads the BOM', () => {
    expect(detectHookFileEncoding(utf16le('はい。\r\n', true))).toBe('utf-16le');
    expect(detectHookFileEncoding(utf16be('はい。\r\n'))).toBe('utf-16be');
    expect(detectHookFileEncoding(Buffer.from('﻿はい。', 'utf8'))).toBe('utf-8');
  });

  it('recognises BOM-less UTF-16LE: with ASCII in it, and kana-only', () => {
    expect(detectHookFileEncoding(utf16le('[Textractor] hooked\r\n「はい。」\r\n'))).toBe('utf-16le');
    expect(detectHookFileEncoding(utf16le('はい。'))).toBe('utf-16le');
    expect(detectHookFileEncoding(utf16le('今日は雨ですね。窓辺の猫が静かに眠っている。'))).toBe('utf-16le');
  });

  it('tells UTF-8 and Shift-JIS apart', () => {
    expect(detectHookFileEncoding(Buffer.from('今日は雨ですね。\n', 'utf8'))).toBe('utf-8');
    expect(detectHookFileEncoding(SJIS_LINES)).toBe('shift_jis');
    expect(new TextDecoder('shift_jis').decode(SJIS_LINES)).toBe('はい。\r\n今日は雨ですね。\r\n');
  });

  it('waits for more bytes when the start is empty or plain ASCII', () => {
    expect(detectHookFileEncoding(new Uint8Array())).toBeNull();
    expect(detectHookFileEncoding(Buffer.from('log started 12:30:45\r\n', 'utf8'))).toBeNull();
  });

  it('a UTF-8 file cut in the middle of a character at the sample end is still UTF-8', () => {
    const bytes = Buffer.from('あいうえお', 'utf8');
    expect(detectHookFileEncoding(bytes.subarray(0, bytes.length - 1))).toBe('utf-8');
  });
});

describe('hookFileStartOffset', () => {
  it('starts UTF-16 on an even byte', () => {
    expect(hookFileStartOffset(11, 'utf-16le', new Uint8Array([0x30, 0x0d, 0x00]))).toBe(10);
    expect(hookFileStartOffset(12, 'utf-16be', new Uint8Array())).toBe(12);
  });

  it('steps back before an unfinished UTF-8 sequence, and not before a finished one', () => {
    const a = Buffer.from('あ', 'utf8'); // e3 81 82
    expect(hookFileStartOffset(10, 'utf-8', a)).toBe(10);
    expect(hookFileStartOffset(9, 'utf-8', Buffer.from([0x41, 0xe3, 0x81]))).toBe(7);
    expect(hookFileStartOffset(9, 'utf-8', Buffer.from([0x41, 0x42, 0xe3]))).toBe(8);
    expect(hookFileStartOffset(9, null, Buffer.from([0x0a, 0x41, 0x42]))).toBe(9);
  });
});

describe('parseTexthookerMessage binary frames', () => {
  it('decodes an ArrayBuffer, a Buffer and a DataView', () => {
    const bytes = new TextEncoder().encode('{"sentence":"はい。"}');
    expect(parseTexthookerMessage(bytes.buffer)).toBe('はい。');
    expect(parseTexthookerMessage(Buffer.from('いいえ。', 'utf8'))).toBe('いいえ。');
    expect(parseTexthookerMessage(new DataView(new TextEncoder().encode('そう。').buffer))).toBe('そう。');
    expect(parseTexthookerMessage({ not: 'bytes' })).toBe('');
  });
});

describe('visual novel error codes', () => {
  it('classifies its own errors, errnos, JSON failures and the shared validation messages', () => {
    expect(visualNovelErrorCode(new VisualNovelError('duplicate', '"X" is already in the Visual Novel library.'))).toBe('duplicate');
    expect(visualNovelErrorCode(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }))).toBe('file-missing');
    expect(visualNovelErrorCode(Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' }))).toBe('file-access');
    expect(visualNovelErrorCode(new SyntaxError('Unexpected token'))).toBe('invalid-file');
    expect(visualNovelErrorCode(new Error('The visual novel does not exist.'))).toBe('not-found');
    expect(visualNovelErrorCode(new Error('The captured line does not exist.'))).toBe('line-not-found');
    expect(visualNovelErrorCode(new Error('A visual novel title is required.'))).toBe('title-required');
    expect(visualNovelErrorCode(new Error('Japanese capture text is required.'))).toBe('text-required');
    expect(visualNovelErrorCode(new Error('something else'))).toBe('unknown');
    expect(visualNovelErrorCode('a string')).toBe('unknown');
  });

  it('maps a response to its key, falling back for unknown or missing codes — never to `error`', () => {
    expect(visualNovelErrorKey({ ok: false, error: 'English', errorCode: 'duplicate' }, 'vnPanel.msg.addFailed')).toBe('vnError.duplicate');
    expect(visualNovelErrorKey({ ok: false, error: 'English', errorCode: 'unknown' }, 'vnPanel.msg.addFailed')).toBe('vnPanel.msg.addFailed');
    expect(visualNovelErrorKey({ ok: false, error: 'English' }, 'vnPanel.msg.addFailed')).toBe('vnPanel.msg.addFailed');
    expect(visualNovelErrorKey({ lastError: 'EBUSY', lastErrorCode: 'file-access' }, 'x')).toBe('vnError.fileAccess');
    expect(visualNovelErrorKey('capture-running', 'x')).toBe('vnError.captureRunning');
    expect(visualNovelErrorKey(undefined, 'x')).toBe('x');
  });

  it('every code has its sentence in en, ja, zh and ru, and no two languages share an English string', () => {
    const packs = { en: VISUAL_NOVEL_EN, ja: VISUAL_NOVEL_JA, zh: VISUAL_NOVEL_ZH, ru: VISUAL_NOVEL_RU };
    const keys = [
      ...VISUAL_NOVEL_ERROR_CODES.filter((code) => code !== 'unknown').map((code) => VISUAL_NOVEL_ERROR_KEYS[code as Exclude<typeof code, 'unknown'>]),
      'vnCapture.test.busy',
      'vnCapture.lineFailed',
      'vnPanel.msg.analyzeFailed',
      'vnPanel.hookReadFailed',
    ];
    for (const key of keys) {
      for (const [lang, pack] of Object.entries(packs)) {
        expect(typeof pack[key], `${lang} ${key}`).toBe('string');
        expect((pack[key] as string).length, `${lang} ${key}`).toBeGreaterThan(3);
      }
      expect(VISUAL_NOVEL_JA[key]).not.toBe(VISUAL_NOVEL_EN[key]);
      expect(VISUAL_NOVEL_ZH[key]).not.toBe(VISUAL_NOVEL_EN[key]);
      expect(VISUAL_NOVEL_RU[key]).not.toBe(VISUAL_NOVEL_EN[key]);
    }
  });
});
