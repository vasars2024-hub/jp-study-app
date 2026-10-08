// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAPTURE_INBOX_MAX,
  captureInboxReducer,
  captureText,
  detectCaptureKind,
  dispatchCapture,
  loadCaptureInbox,
  nextCaptureIndex,
  normalizeCaptureText,
  resetCaptureInboxForTests,
  type CaptureItem,
} from '../components/blanc/blancCaptureInbox';

const add = (id: string, text: string, at = 1) =>
  ({ type: 'add', id, text, origin: 'selection', at }) as const;

describe('detectCaptureKind', () => {
  it('calls short single tokens words and everything else sentences', () => {
    expect(detectCaptureKind('猫')).toBe('word');
    expect(detectCaptureKind('食べる')).toBe('word');
    expect(detectCaptureKind('кошка')).toBe('word');
    expect(detectCaptureKind('猫が好きです。')).toBe('sentence');
    expect(detectCaptureKind('я люблю кошек')).toBe('sentence');
    expect(detectCaptureKind('「猫」')).toBe('sentence');
    expect(detectCaptureKind('あ'.repeat(17))).toBe('sentence');
  });
});

describe('captureInboxReducer (triage)', () => {
  it('adds newest first and detects the kind', () => {
    let items: CaptureItem[] = [];
    items = captureInboxReducer(items, add('a', '猫'));
    items = captureInboxReducer(items, add('b', '猫が好きです。'));
    expect(items.map((item) => [item.id, item.kind])).toEqual([['b', 'sentence'], ['a', 'word']]);
  });

  it('moves a re-captured text to the top instead of duplicating it', () => {
    let items = captureInboxReducer([], add('a', '猫', 1));
    items = captureInboxReducer(items, add('b', '犬', 2));
    items = captureInboxReducer(items, add('c', ' 猫 ', 3));
    expect(items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(items[0].capturedAt).toBe(3);
  });

  it('ignores empty captures and caps the inbox', () => {
    expect(captureInboxReducer([], add('a', '   \n '))).toEqual([]);
    let items: CaptureItem[] = [];
    for (let i = 0; i < CAPTURE_INBOX_MAX + 5; i += 1) items = captureInboxReducer(items, add(`id${i}`, `w${i}`));
    expect(items).toHaveLength(CAPTURE_INBOX_MAX);
    expect(items[0].id).toBe(`id${CAPTURE_INBOX_MAX + 4}`);
  });

  it('x discards one item', () => {
    let items = captureInboxReducer([], add('a', '猫'));
    items = captureInboxReducer(items, add('b', '犬'));
    expect(captureInboxReducer(items, { type: 'remove', id: 'a' }).map((item) => item.id)).toEqual(['b']);
  });

  it('e edits; a changed text is re-detected and looked up again', () => {
    let items = captureInboxReducer([], add('a', '猫'));
    items = captureInboxReducer(items, { type: 'update', id: 'a', patch: { lookedUp: true, reading: 'ねこ' } });
    expect(items[0]).toMatchObject({ reading: 'ねこ', lookedUp: true, kind: 'word' });
    items = captureInboxReducer(items, { type: 'update', id: 'a', patch: { text: '猫が好きです。' } });
    expect(items[0]).toMatchObject({ text: '猫が好きです。', kind: 'sentence', lookedUp: false });
    // An edit that empties the text keeps the old one.
    items = captureInboxReducer(items, { type: 'update', id: 'a', patch: { text: '  ' } });
    expect(items[0].text).toBe('猫が好きです。');
  });

  it('keeps the selection on the item that took the removed one\'s place', () => {
    expect(nextCaptureIndex(3, 1)).toBe(1);
    expect(nextCaptureIndex(3, 3)).toBe(2);
    expect(nextCaptureIndex(0, 0)).toBe(-1);
  });

  it('normalizes whitespace', () => {
    expect(normalizeCaptureText('  a　　b\r\n\r\n\nc  ')).toBe('a b\nc');
  });
});

describe('capture inbox store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetCaptureInboxForTests();
  });

  it('persists through the guarded writer and reads back', () => {
    const item = captureText('猫', 'clipboard', 10);
    expect(item).toMatchObject({ text: '猫', kind: 'word', origin: 'clipboard' });
    resetCaptureInboxForTests();
    expect(loadCaptureInbox().map((entry) => entry.text)).toEqual(['猫']);
    dispatchCapture({ type: 'clear' });
    resetCaptureInboxForTests();
    expect(loadCaptureInbox()).toEqual([]);
  });

  it('survives a corrupt store', () => {
    window.localStorage.setItem('jp-study.blanc.captureInbox.v1', '{nope');
    expect(loadCaptureInbox()).toEqual([]);
  });
});
