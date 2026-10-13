/**
 * Snip to cards, round 2, the pure half: the first-run notice setting, the
 * unsure-read band, engine names, the per-snip deck, the action and toast
 * repairs main applies to IPC, and the merged-word round trip.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeSnipAction,
  normalizeSnipSettings,
  normalizeSnipToastPayload,
  normalizeSnipWord,
  snipDeckFor,
  snipEngineLabel,
  snipNoticeOpen,
  snipOwnsWork,
  snipReadCertainty,
  SNIP_SETTINGS_DEFAULTS,
} from '../snipToCards';

describe('settings: the default stays on, and the first run says so', () => {
  it('watching and auto-add are still on by default (owner decision pending); the notice starts pending', () => {
    expect(SNIP_SETTINGS_DEFAULTS).toMatchObject({ enabled: true, autoAdd: true, notice: 'pending', mergeExisting: true });
    expect(snipNoticeOpen(normalizeSnipSettings(undefined))).toBe(true);
  });

  it('the notice state and merge switch are repaired field by field', () => {
    expect(normalizeSnipSettings({ notice: 'answered', mergeExisting: false })).toMatchObject({ notice: 'answered', mergeExisting: false });
    expect(normalizeSnipSettings({ notice: 'whenever', mergeExisting: 'yes' })).toMatchObject({ notice: 'pending', mergeExisting: true });
    expect(snipNoticeOpen({ notice: 'shown' })).toBe(true);
    expect(snipNoticeOpen({ notice: 'answered' })).toBe(false);
  });
});

describe('OCR confidence and engine', () => {
  it('an unsure read (55–75 %) waits for review; a sure one may be added; no number decides nothing', () => {
    expect(snipReadCertainty(0.62)).toBe('unsure');
    expect(snipReadCertainty(0.9)).toBe('sure');
    expect(snipReadCertainty(undefined)).toBeNull();
    expect(snipReadCertainty(Number.NaN)).toBeNull();
  });

  it('names the engine that read the snip', () => {
    expect(snipEngineLabel('manga')).toEqual({ name: 'manga-ocr' });
    expect(snipEngineLabel('web')).toEqual({ name: 'PaddleOCR' });
    expect(snipEngineLabel('basic')).toEqual({ key: 'snip.engine.basic' });
    expect(snipEngineLabel('none')).toBeNull();
    expect(snipEngineLabel(undefined)).toBeNull();
  });
});

describe('per-snip deck and ownership', () => {
  it("a snip's own deck wins over the setting; blank falls back", () => {
    expect(snipDeckFor({ deck: 'Manga::Vol 1' }, { deck: 'Snips' })).toBe('Manga::Vol 1');
    expect(snipDeckFor({ deck: '  ' }, { deck: 'Snips' })).toBe('Snips');
    expect(snipDeckFor({}, { deck: '' })).toBe('Snips');
  });

  it('a merged example is something Undo takes back', () => {
    const empty = { words: [], cardIds: [], ankiNoteIds: [] };
    expect(snipOwnsWork(empty)).toBe(false);
    expect(snipOwnsWork({ ...empty, words: [{ surface: '猫', lemma: '猫', status: 'merged' as const, cardId: 'c', example: '猫がいる。' }] })).toBe(true);
    expect(snipOwnsWork({ ...empty, ankiNoteIds: [5] })).toBe(true);
  });

  it('a merged word survives the disk round trip with its exact example', () => {
    expect(normalizeSnipWord({ surface: '猫', status: 'merged', cardId: 'c1', example: '猫がいる。', edited: true }))
      .toEqual({ surface: '猫', lemma: '猫', status: 'merged', cardId: 'c1', example: '猫がいる。', edited: true });
  });
});

describe('actions from IPC', () => {
  it('keeps well-formed actions and strips what does not belong', () => {
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'undo', extra: 1 })).toEqual({ id: 'snip-a1', action: 'undo' });
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'addWords', indices: [3, 1, 3, 2.5, -1, '4'] }))
      .toEqual({ id: 'snip-a1', action: 'addWords', indices: [3, 1] });
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'editWord', index: 2, lemma: ' 未来 ', reading: 'みらい\n' }))
      .toEqual({ id: 'snip-a1', action: 'editWord', index: 2, lemma: '未来', reading: 'みらい' });
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'editWord', index: 2, reading: '' }))
      .toEqual({ id: 'snip-a1', action: 'editWord', index: 2, reading: '' });
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'reanalyze', text: 'a\r\nb\u0000' })).toEqual({ id: 'snip-a1', action: 'reanalyze', text: 'a\nb' });
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'setDeck', deck: ' Deck\u0007 ' })).toEqual({ id: 'snip-a1', action: 'setDeck', deck: 'Deck' });
  });

  it('refuses anything else', () => {
    expect(normalizeSnipAction(null)).toBeNull();
    expect(normalizeSnipAction({ id: '../etc', action: 'undo' })).toBeNull();
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'removeWord', index: '1' })).toBeNull();
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'addWords', indices: 'all' })).toBeNull();
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'editWord', index: 1, lemma: ' ' })).toBeNull();
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'reanalyze', text: 42 })).toBeNull();
    expect(normalizeSnipAction({ id: 'snip-a1', action: 'setDeck' })).toBeNull();
  });
});

describe('toast payloads from IPC', () => {
  it('keeps the fields the toast shows and drops `notice` (main alone sets it)', () => {
    expect(normalizeSnipToastPayload({ id: 'snip-a', kind: 'review', count: 3, review: 'uncertain', engine: 'basic', confidence: 62.4, notice: true }))
      .toEqual({ id: 'snip-a', kind: 'review', count: 3, review: 'uncertain', engine: 'basic', confidence: 62 });
    expect(normalizeSnipToastPayload({ kind: 'added', merged: 2, words: ['猫', 7] })).toEqual({ kind: 'added', merged: 2, words: ['猫'] });
    expect(normalizeSnipToastPayload({ kind: 'explode' })).toBeNull();
  });
});
