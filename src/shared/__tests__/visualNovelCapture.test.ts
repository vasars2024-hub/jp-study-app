import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEXTHOOKER_URL,
  isCapturableText,
  normalizeTexthookerUrl,
  parseTexthookerMessage,
} from '../visualNovelCapture';

describe('texthooker websocket address', () => {
  it('accepts a local server and fills in the scheme', () => {
    expect(normalizeTexthookerUrl('ws://localhost:6677')).toBe('ws://localhost:6677');
    expect(normalizeTexthookerUrl('127.0.0.1:9001')).toBe('ws://127.0.0.1:9001');
    expect(normalizeTexthookerUrl(' ws://localhost:2333/ ')).toBe('ws://localhost:2333');
  });

  it('never connects anywhere but this computer', () => {
    // The capture client must not become something that phones out.
    expect(normalizeTexthookerUrl('ws://example.com:6677')).toBe(DEFAULT_TEXTHOOKER_URL);
    expect(normalizeTexthookerUrl('wss://192.168.1.5:6677')).toBe(DEFAULT_TEXTHOOKER_URL);
    expect(normalizeTexthookerUrl('http://localhost:6677')).toBe(DEFAULT_TEXTHOOKER_URL);
    expect(normalizeTexthookerUrl('ws://user:pw@localhost:6677')).toBe(DEFAULT_TEXTHOOKER_URL);
    expect(normalizeTexthookerUrl(42)).toBe(DEFAULT_TEXTHOOKER_URL);
  });
});

describe('texthooker message framing', () => {
  it('reads the raw sentence Textractor sends', () => {
    expect(parseTexthookerMessage('紅莉栖「実験を始めよう。」')).toBe('紅莉栖「実験を始めよう。」');
  });

  it('reads the JSON shapes other servers send', () => {
    expect(parseTexthookerMessage(JSON.stringify({ sentence: 'こんにちは' }))).toBe('こんにちは');
    expect(parseTexthookerMessage(JSON.stringify({ text: 'さようなら', process: 'game.exe' }))).toBe('さようなら');
    expect(parseTexthookerMessage(JSON.stringify(['一行目', '二行目']))).toBe('一行目\n二行目');
    expect(parseTexthookerMessage(new TextEncoder().encode('バイナリ'))).toBe('バイナリ');
  });

  it('ignores JSON with no text and keeps a sentence that merely starts with a bracket', () => {
    expect(parseTexthookerMessage(JSON.stringify({ type: 'ping' }))).toBe('');
    expect(parseTexthookerMessage('[ダル] オカリン')).toBe('[ダル] オカリン');
    expect(parseTexthookerMessage(null)).toBe('');
  });
});

describe('what counts as a captured line', () => {
  it('takes Japanese game text and refuses paths, URLs and walls of text', () => {
    expect(isCapturableText('実験を始めよう。')).toBe(true);
    expect(isCapturableText('hello world')).toBe(false);
    expect(isCapturableText('C:\\Games\\日本語\\game.exe')).toBe(false);
    expect(isCapturableText('https://vndb.org/v2002 シュタインズ')).toBe(false);
    expect(isCapturableText('あ'.repeat(601))).toBe(false);
  });
});
