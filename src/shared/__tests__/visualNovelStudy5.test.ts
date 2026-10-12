// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  VN5_CONTEXT_MAX_GAP_MS,
  VN5_DEFAULT_STUDY_PREFS,
  VN5_RECONNECT_MAX_MS,
  VN5_RECONNECT_MIN_MS,
  vn5ContextBefore,
  vn5ContextText,
  vn5Coverage,
  vn5DailyStats,
  vn5InitialLineStudy,
  vn5LineStudyReduce,
  vn5NormalizeStudyPrefs,
  vn5ReadingStreak,
  vn5ReconnectDelay,
  vn5ScreenshotFor,
  VN5_AFK_GAP_MS,
  vn5ContextAfter,
  vn5HotkeyAction,
  vn5SessionStats,
} from '../visualNovelStudy5';
import {
  VN5_DEFAULT_LINE_FILTERS,
  vn5CleanLine,
  vn5CollapseRepeats,
  vn5FilterPreview,
  vn5NormalizeLineFilters,
  vn5StripControlChars,
  vn5StripInlineRuby,
} from '../visualNovelLineFilters';

type Line = {
  id: string;
  visualNovelId: string;
  japanese: string;
  speaker: string;
  capturedAt: number;
  kind: 'dialogue' | 'narration' | 'choice' | 'character-name' | 'system';
  screenshotPath?: string;
  source: 'manual' | 'clipboard' | 'hook' | 'ocr' | 'import';
};

const line = (id: string, japanese: string, at: number, over: Partial<Line> = {}): Line => ({
  id,
  visualNovelId: 'vn',
  japanese,
  speaker: '',
  capturedAt: at,
  kind: 'dialogue',
  source: 'hook',
  ...over,
});

describe('texthooker reconnect backoff', () => {
  it('doubles from the minimum to the cap, with bounded jitter', () => {
    const mid = () => 0.5;
    expect(vn5ReconnectDelay(0, mid)).toBe(VN5_RECONNECT_MIN_MS);
    expect(vn5ReconnectDelay(1, mid)).toBe(VN5_RECONNECT_MIN_MS * 2);
    expect(vn5ReconnectDelay(10, mid)).toBe(VN5_RECONNECT_MAX_MS);
    expect(vn5ReconnectDelay(0, () => 0)).toBe(Math.round(VN5_RECONNECT_MIN_MS * 0.8));
    expect(vn5ReconnectDelay(0, () => 1)).toBe(Math.round(VN5_RECONNECT_MIN_MS * 1.2));
    expect(vn5ReconnectDelay(-3, mid)).toBe(VN5_RECONNECT_MIN_MS);
  });
});

describe('study prefs', () => {
  it('normalizes junk to defaults and clamps repeat', () => {
    expect(vn5NormalizeStudyPrefs(null)).toEqual(VN5_DEFAULT_STUDY_PREFS);
    expect(vn5NormalizeStudyPrefs({ contextLines: 2, contextAfterLines: 1, repeat: 9, holdNewLines: true, attachScreenshot: false })).toEqual({
      contextLines: 2,
      contextAfterLines: 1,
      attachScreenshot: false,
      holdNewLines: true,
      autoPlay: false,
      repeat: 3,
    });
    expect(vn5NormalizeStudyPrefs({ contextLines: 5 }).contextLines).toBe(1);
  });
});

describe('mining context', () => {
  const lines = [
    line('a', '一行目。', 1_000, { speaker: '岡部' }),
    line('sys', 'セーブしました', 2_000, { kind: 'system' }),
    line('b', '二行目。', 3_000),
    line('c', '三行目。', 4_000, { screenshotPath: '/shot.png' }),
    line('d', '四行目。', 5_000),
  ];

  it('takes the previous one or two spoken lines, skipping system text', () => {
    expect(vn5ContextBefore(lines, 'd', 1).map((l) => l.id)).toEqual(['c']);
    expect(vn5ContextBefore(lines, 'c', 2).map((l) => l.id)).toEqual(['a', 'b']);
    expect(vn5ContextBefore(lines, 'a', 2)).toEqual([]);
    expect(vn5ContextBefore(lines, 'd', 0)).toEqual([]);
  });

  it('stops at a long silence: that is another scene', () => {
    const gap = [line('x', '昔の行。', 0), line('y', '今の行。', VN5_CONTEXT_MAX_GAP_MS + 1)];
    expect(vn5ContextBefore(gap, 'y', 2)).toEqual([]);
  });

  it('formats speakers the way the hook parser reads them', () => {
    expect(vn5ContextText(vn5ContextBefore(lines, 'c', 2))).toBe('【岡部】一行目。\n二行目。');
  });

  it('borrows the screenshot of the line captured just before', () => {
    expect(vn5ScreenshotFor(lines, 'c')).toBe('/shot.png');
    expect(vn5ScreenshotFor(lines, 'd')).toBe('/shot.png');
    expect(vn5ScreenshotFor(lines, 'b')).toBe('');
    expect(vn5ScreenshotFor(lines, 'd', 500)).toBe('');
  });
});

describe('line study loop', () => {
  const hold = { holdNewLines: true, autoPlay: true, repeat: 2 };
  const live = { holdNewLines: false, autoPlay: false, repeat: 1 };

  it('holds new lines in a queue until next, with repeat plays', () => {
    let s = vn5LineStudyReduce(vn5InitialLineStudy(), { type: 'line', id: 'a' }, hold);
    expect(s).toEqual({ currentId: 'a', queue: [], playsLeft: 2 });
    s = vn5LineStudyReduce(s, { type: 'line', id: 'b' }, hold);
    s = vn5LineStudyReduce(s, { type: 'line', id: 'b' }, hold);
    s = vn5LineStudyReduce(s, { type: 'line', id: 'c' }, hold);
    expect(s.queue).toEqual(['b', 'c']);
    s = vn5LineStudyReduce(s, { type: 'played' }, hold);
    s = vn5LineStudyReduce(s, { type: 'played' }, hold);
    s = vn5LineStudyReduce(s, { type: 'played' }, hold);
    expect(s.playsLeft).toBe(0);
    s = vn5LineStudyReduce(s, { type: 'next' }, hold);
    expect(s).toEqual({ currentId: 'b', queue: ['c'], playsLeft: 2 });
  });

  it('follows the game live when not holding; replay grants one play', () => {
    let s = vn5LineStudyReduce(vn5InitialLineStudy(), { type: 'line', id: 'a' }, live);
    s = vn5LineStudyReduce(s, { type: 'line', id: 'b' }, live);
    expect(s).toEqual({ currentId: 'b', queue: [], playsLeft: 0 });
    s = vn5LineStudyReduce(s, { type: 'replay' }, live);
    expect(s.playsLeft).toBe(1);
    expect(vn5LineStudyReduce(s, { type: 'next' }, live)).toBe(s);
    expect(vn5LineStudyReduce(s, { type: 'reset' }, live)).toEqual(vn5InitialLineStudy());
  });
});

describe('glossary and coverage', () => {
  const tok = (lemma: string, content = true, proper = false) => ({ lemma, surface: lemma, content, proper });
  const levels: Record<string, number> = { 私: 3, 猫: 0, 好き: 3, 犬: 1 };
  const levelOf = (w: string) => levels[w] ?? 0;

  it('counts known token share, the unknown glossary by frequency and i+1 lines', () => {
    const cov = vn5Coverage(
      [
        { text: '私は猫が好き', tokens: [tok('私'), tok('は', false), tok('猫'), tok('好き')] },
        { text: '猫と犬', tokens: [tok('猫'), tok('犬')] },
        { text: '岡部', tokens: [tok('岡部', true, true)] },
      ],
      levelOf,
    );
    expect(cov.tokens).toBe(5);
    expect(cov.knownRatio).toBeCloseTo(2 / 5);
    expect(cov.glossary.map((r) => [r.lemma, r.count])).toEqual([['猫', 2], ['犬', 1]]);
    expect(cov.uniqueWords).toBe(4);
    expect(cov.uniqueKnown).toBe(2);
    expect(cov.iPlusOneLines).toBe(1);
    expect(vn5Coverage([], levelOf).knownRatio).toBeNull();
  });
});

describe('daily stats', () => {
  it('buckets lines and characters per day and excludes imports', () => {
    const now = new Date(2026, 9, 9, 18).getTime();
    const day = (d: number) => new Date(2026, 9, d, 10).getTime();
    const stats = vn5DailyStats(
      [
        { japanese: 'あい う', capturedAt: day(9), source: 'hook' },
        { japanese: 'えお', capturedAt: day(8), source: 'ocr' },
        { japanese: 'かき', capturedAt: day(9), source: 'import' },
        { japanese: '古い', capturedAt: day(1), source: 'hook' },
      ],
      now,
      3,
    );
    expect(stats).toEqual([
      { day: '2026-10-07', lines: 0, chars: 0 },
      { day: '2026-10-08', lines: 1, chars: 2 },
      { day: '2026-10-09', lines: 1, chars: 3 },
    ]);
    expect(vn5ReadingStreak(stats)).toBe(2);
    expect(vn5ReadingStreak([...stats, { day: 'x', lines: 0, chars: 0 }])).toBe(2);
  });
});

describe('context after the mined line', () => {
  it('takes the next lines in reading order, skipping system text and repeats, stopping at a scene gap', () => {
    const lines = [
      line('a', '前の行。', 0),
      line('b', 'これを覚える。', 1_000),
      line('c', 'これを覚える。', 2_000),
      line('d', '［セーブしました］', 3_000, { kind: 'system' }),
      line('e', '次の行。', 4_000),
      line('f', 'その次。', 5_000),
      line('g', 'ずっと後。', 5_000 + VN5_CONTEXT_MAX_GAP_MS + 1),
    ];
    expect(vn5ContextAfter(lines, 'b', 2).map((l) => l.id)).toEqual(['e', 'f']);
    expect(vn5ContextAfter(lines, 'f', 2)).toEqual([]);
    expect(vn5ContextAfter(lines, 'b', 0)).toEqual([]);
    expect(vn5ContextAfter(lines, 'missing', 2)).toEqual([]);
  });
});

describe('line cleanup and filters', () => {
  it('strips control characters and zero-width marks but keeps line breaks', () => {
    expect(vn5StripControlChars('\u0007お​は﻿よう\u0000\nございます�')).toBe('おはよう\nございます');
  });

  it('strips inline furigana markup and keeps the base text', () => {
    expect(vn5StripInlineRuby('｜吾輩《わがはい》は猫である')).toBe('吾輩は猫である');
    expect(vn5StripInlineRuby('見当《けんとう》がつかぬ')).toBe('見当がつかぬ');
    expect(vn5StripInlineRuby('<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>を読む')).toBe('漢字を読む');
    expect(vn5StripInlineRuby('[ruby text="かんじ"]漢字だ')).toBe('漢字だ');
    // 《…》 as quotation marks is the game's text, not furigana.
    expect(vn5StripInlineRuby('《聞こえる？》と声がした')).toBe('《聞こえる？》と声がした');
  });

  it('collapses texthooker repetition but leaves real repetition alone', () => {
    expect(vn5CollapseRepeats('ここんんににちちはは')).toBe('こんにちは');
    expect(vn5CollapseRepeats('おおははよよう')).toBe('おおははよよう');
    expect(vn5CollapseRepeats('今今今日日日ははは')).toBe('今日は');
    expect(vn5CollapseRepeats('ああ')).toBe('ああ');
    expect(vn5CollapseRepeats('はいはい')).toBe('はいはい');
    expect(vn5CollapseRepeats('ああああああ！！')).toBe('ああああああ！！');
    expect(vn5CollapseRepeats('雨が降ってきた。雨が降ってきた。')).toBe('雨が降ってきた。');
    expect(vn5CollapseRepeats('ねえねえ')).toBe('ねえねえ');
  });

  it('applies remove and drop rules in order; a bad pattern is skipped and reported', () => {
    const filters = vn5NormalizeLineFilters({
      rules: [
        { pattern: '^\\[[^\\]]*\\]', mode: 'remove' },
        { pattern: 'SAVE|セーブ', mode: 'drop' },
        { pattern: '(unclosed', mode: 'remove' },
        { pattern: '。$', mode: 'remove', enabled: false },
      ],
    });
    expect(vn5CleanLine('[01:23]おはよう。', filters)).toEqual({ text: 'おはよう。', dropped: false, changed: true });
    expect(vn5CleanLine('セーブしました', filters)).toMatchObject({ dropped: true });
    expect(vn5CleanLine('［］', vn5NormalizeLineFilters({ rules: [{ pattern: '［］', mode: 'remove' }] }))).toMatchObject({ dropped: true, text: '' });
    const preview = vn5FilterPreview(['[a]そうか。', 'SAVE DATA'], filters);
    expect(preview.rows.map((r) => [r.text, r.dropped])).toEqual([['そうか。', false], ['', true]]);
    expect(preview.invalidRules).toEqual([2]);
  });

  it('normalizes stored filters: defaults, caps and junk', () => {
    expect(vn5NormalizeLineFilters(undefined)).toEqual(VN5_DEFAULT_LINE_FILTERS);
    const many = vn5NormalizeLineFilters({ rules: Array.from({ length: 40 }, (_, i) => ({ pattern: `x${i}` })), collapseRepeats: false, dedupeRecent: true });
    expect(many.rules).toHaveLength(20);
    expect(many.collapseRepeats).toBe(false);
    expect(many.dedupeRecent).toBe(true);
    expect(vn5NormalizeLineFilters({ rules: [{ pattern: '' }, null, 'x', { pattern: 'a'.repeat(500) }] }).rules[0].pattern).toHaveLength(200);
  });
});

describe('session reading speed', () => {
  const at = (sec: number) => 1_000_000 + sec * 1000;
  const cap = (japanese: string, sec: number, source: 'hook' | 'import' = 'hook') => ({ japanese, capturedAt: at(sec), source });

  it('counts this session only, and caps long pauses as AFK time', () => {
    const captures = [
      cap('古い行。', -100),
      cap('一行目です。', 30),
      cap('二行目です。', 60),
      cap('長い休憩のあと。', 60 + 3600),
      cap('取り込み', 70, 'import'),
    ];
    const stats = vn5SessionStats(captures, at(0), at(3700));
    expect(stats.lines).toBe(3);
    expect(stats.chars).toBe(6 + 6 + 8);
    // 30 + 30 + (pause capped at 2 min) + 40 s since the last line
    expect(stats.activeMs).toBe(30_000 + 30_000 + VN5_AFK_GAP_MS + 40_000);
    expect(stats.charsPerHour).toBe(Math.round(20 / ((30_000 + 30_000 + VN5_AFK_GAP_MS + 40_000) / 3_600_000)));
  });

  it('reports no speed under a minute of reading', () => {
    expect(vn5SessionStats([cap('はい。', 5)], at(0), at(20)).charsPerHour).toBeNull();
  });
});

describe('reader hotkeys', () => {
  it('maps single keys and ignores chords, repeats and typing', () => {
    expect(vn5HotkeyAction({ key: 'm' })).toBe('mine');
    expect(vn5HotkeyAction({ key: 'T' })).toBe('translate');
    expect(vn5HotkeyAction({ key: 'r' })).toBe('replay');
    expect(vn5HotkeyAction({ key: 'Enter' })).toBe('next');
    expect(vn5HotkeyAction({ key: 'ArrowRight' })).toBe('next');
    expect(vn5HotkeyAction({ key: 'c' })).toBe('copy');
    expect(vn5HotkeyAction({ key: 'c', ctrlKey: true })).toBeNull();
    expect(vn5HotkeyAction({ key: 'm', editable: true })).toBeNull();
    expect(vn5HotkeyAction({ key: 'm', repeat: true })).toBeNull();
    expect(vn5HotkeyAction({ key: 'x' })).toBeNull();
  });
});
