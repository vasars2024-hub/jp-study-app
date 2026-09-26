import { describe, expect, it } from 'vitest';
import {
  buildWheelActions,
  draftFromText,
  draftImagePayload,
  isSentenceText,
  normalizeDraft,
  wheelIndexForKey,
} from '../companion';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('isSentenceText — the same rule for ja, zh and ru', () => {
  it('a word is a word in every study language', () => {
    expect(isSentenceText('食べる')).toBe(false);
    expect(isSentenceText('学习')).toBe(false);
    expect(isSentenceText('дом')).toBe(false);
    expect(isSentenceText('как дела')).toBe(false);
  });

  it('sentence punctuation, a long CJK run or four words make a sentence', () => {
    expect(isSentenceText('猫が寝ている。')).toBe(true);
    expect(isSentenceText('我今天在图书馆学习了很长时间')).toBe(true);
    expect(isSentenceText('Я читаю книгу каждый вечер')).toBe(true);
    expect(isSentenceText('Он пришёл домой.')).toBe(true);
  });
});

describe('draftFromText', () => {
  it('drafts a word card with the window it came from', () => {
    const draft = draftFromText('  猫 ', { origin: 'selection', sourceTitle: 'Game — Chapter 2', sourceApp: 'game', now: 5 });
    expect(draft).toMatchObject({ kind: 'word', word: '猫', sourceTitle: 'Game — Chapter 2', sourceApp: 'game', origin: 'selection' });
    expect(draft?.sentence).toBeUndefined();
  });

  it('a sentence selection is its own sentence card', () => {
    const draft = draftFromText('Я читаю книгу каждый вечер', { origin: 'wheel' });
    expect(draft).toMatchObject({ kind: 'sentence', word: 'Я читаю книгу каждый вечер', sentence: 'Я читаю книгу каждый вечер' });
  });

  it('keeps the context line for a word, and nothing for empty text', () => {
    expect(draftFromText('学习', { origin: 'lookup', sentence: '我喜欢学习中文。' })?.sentence).toBe('我喜欢学习中文。');
    expect(draftFromText('   ', { origin: 'lookup' })).toBeNull();
  });
});

describe('normalizeDraft — a draft that crossed IPC', () => {
  it('drops what cannot be trusted and keeps the rest', () => {
    const draft = normalizeDraft({
      id: 'x',
      kind: 'word',
      word: '猫',
      reading: 'ねこ',
      imageDataUrl: 'javascript:alert(1)',
      studyLang: 'klingon',
      origin: 'nowhere',
      createdAt: -1,
    });
    expect(draft).toMatchObject({ id: 'x', word: '猫', reading: 'ねこ', origin: 'selection' });
    expect(draft?.imageDataUrl).toBeUndefined();
    expect(draft?.studyLang).toBeUndefined();
    expect(draft?.createdAt).toBeGreaterThan(0);
  });

  it('keeps a real picture and a real study language', () => {
    const draft = normalizeDraft({ word: 'дом', imageDataUrl: PNG, studyLang: 'ru', origin: 'lens' });
    expect(draft).toMatchObject({ imageDataUrl: PNG, studyLang: 'ru', origin: 'lens' });
  });

  it('a draft with no word is not a card', () => {
    expect(normalizeDraft({ word: '  ' })).toBeNull();
    expect(normalizeDraft(null)).toBeNull();
  });
});

describe('draftImagePayload', () => {
  it('splits a data URL into card media with a safe name', () => {
    expect(draftImagePayload({ id: 'cd-1/../x', imageDataUrl: PNG })).toEqual({
      base64: 'iVBORw0KGgo=',
      filename: 'gum-companion-cd-1x.png',
    });
    expect(draftImagePayload({ id: 'a', imageDataUrl: undefined })).toBeNull();
  });
});

describe('the wheel', () => {
  it('has seven slots without live captions and eight with them, ending at Open Gum', () => {
    const without = buildWheelActions({ audioCommandId: null });
    expect(without.map((a) => a.id)).toEqual(['lookup', 'cursor', 'lens', 'preview', 'sentence', 'translate', 'open']);
    const withAudio = buildWheelActions({ audioCommandId: 'captions.mineRecent' });
    expect(withAudio).toHaveLength(8);
    expect(withAudio[6]).toMatchObject({ id: 'audio', commandId: 'captions.mineRecent' });
  });

  it('keys 1–8 from the top row or the numpad pick a slot', () => {
    expect(wheelIndexForKey('1')).toBe(0);
    expect(wheelIndexForKey('8')).toBe(7);
    expect(wheelIndexForKey('End', 'Numpad3')).toBe(2);
    expect(wheelIndexForKey('!', 'Digit1')).toBe(0);
    expect(wheelIndexForKey('9')).toBe(-1);
    expect(wheelIndexForKey('a', 'KeyA')).toBe(-1);
  });
});
