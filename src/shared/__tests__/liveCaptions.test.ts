import { describe, expect, it } from 'vitest';
import {
  type CaptionLine,
  type CaptionScript,
  DEFAULT_SCRIPT_GAP_MS,
  dayKey,
  detectLang,
  mergeCaptionSnapshot,
  scriptLang,
  scriptTitle,
  segmentScripts,
  sortScriptsByLang,
  startsNewScript,
} from '../liveCaptions';

/**
 * The fixtures below are the real mutation sequence observed from
 * `LiveCaptions.exe` on Windows 11 26200 (polled at ~900 ms while a Chinese
 * conversation played), not invented text. They are what the merge has to
 * survive: a provisional tail that grows character by character, punctuation
 * inserted into text already emitted, and front-eviction from a 12-line window.
 */

function lines(...texts: string[]): CaptionLine[] {
  return texts.map((text, i) => ({ text, ts: 1000 + i }));
}

describe('mergeCaptionSnapshot', () => {
  it('takes the whole first snapshot', () => {
    const r = mergeCaptionSnapshot([], ['你不学习啊', '嗯哦，在'], 5000);
    expect(r.lines.map((l) => l.text)).toEqual(['你不学习啊', '嗯哦，在']);
    expect(r.appended).toBe(2);
    expect(r.desynced).toBe(false);
  });

  it('appends nothing when the window has not changed', () => {
    const prev = lines('你不学习啊', '嗯哦，在');
    const r = mergeCaptionSnapshot(prev, ['你不学习啊', '嗯哦，在'], 5000);
    expect(r.appended).toBe(0);
    expect(r.lines.map((l) => l.text)).toEqual(['你不学习啊', '嗯哦，在']);
  });

  it('revises a growing provisional tail in place instead of duplicating it', () => {
    // The exact n=0..n=4 progression of the tail line from the sampled run.
    const growth = [
      '嗯',
      '嗯哦，在',
      '嗯哦，在俄罗斯',
      '嗯哦，在俄罗斯呃点',
      '嗯哦，在俄罗斯呃点外卖方便吗',
    ];
    let state: CaptionLine[] = lines('你不学习啊');
    for (const tail of growth) {
      state = mergeCaptionSnapshot(state, ['你不学习啊', tail], 5000).lines;
    }
    expect(state.map((l) => l.text)).toEqual([
      '你不学习啊',
      '嗯哦，在俄罗斯呃点外卖方便吗',
    ]);
  });

  it('treats inserted punctuation as a revision, not a new line', () => {
    // 方便吗 -> 方便吗？ : not a pure append at the character level, which is
    // why the revision test strips punctuation before comparing.
    const prev = lines('嗯哦，在俄罗斯呃点外卖方便吗');
    const r = mergeCaptionSnapshot(prev, ['嗯哦，在俄罗斯呃点外卖方便吗？'], 9000);
    expect(r.appended).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.text).toBe('嗯哦，在俄罗斯呃点外卖方便吗？');
  });

  it('stamps lines first seen in the same poll apart, in order', () => {
    const first = mergeCaptionSnapshot([], ['今天天气很好。', '我们去公园吧。', '走吧'], 5000);
    expect(first.lines.map((l) => l.ts)).toEqual([5000, 5001, 5002]);
    const more = mergeCaptionSnapshot(first.lines, ['我们去公园吧。', '走吧，快点。', '好的。', '嗯'], 9000);
    const stamps = more.lines.map((l) => l.ts);
    expect(new Set(stamps).size).toBe(stamps.length);
    expect(more.lines.at(-2)).toEqual({ text: '好的。', ts: 9000 });
    expect(more.lines.at(-1)).toEqual({ text: '嗯', ts: 9001 });
  });

  it('keeps the first-seen timestamp when a line is revised', () => {
    const prev: CaptionLine[] = [{ text: '嗯哦，在俄罗斯', ts: 111 }];
    const r = mergeCaptionSnapshot(prev, ['嗯哦，在俄罗斯呃点外卖方便吗'], 999);
    expect(r.lines[0]!.ts).toBe(111);
  });

  it('appends only the new line when the window scrolls', () => {
    const prev = lines('A句子', 'B句子', 'C句子');
    const r = mergeCaptionSnapshot(prev, ['B句子', 'C句子', 'D句子'], 7000);
    expect(r.lines.map((l) => l.text)).toEqual(['A句子', 'B句子', 'C句子', 'D句子']);
    expect(r.appended).toBe(1);
    expect(r.lines[3]!.ts).toBe(7000);
  });

  it('survives eviction plus tail revision in the same poll', () => {
    // n=8 -> n=9 in the sampled run: the head line was evicted *and* the tail
    // reset to a new short provisional line at the same time.
    const prev = lines('第一行', '第二行', '嗯哦，在俄罗斯呃点外卖方便吗？');
    const r = mergeCaptionSnapshot(
      prev,
      ['第二行', '嗯哦，在俄罗斯呃点外卖方便吗？', '在'],
      8000,
    );
    expect(r.lines.map((l) => l.text)).toEqual([
      '第一行',
      '第二行',
      '嗯哦，在俄罗斯呃点外卖方便吗？',
      '在',
    ]);
    expect(r.desynced).toBe(false);
  });

  it('flags a desync when the whole window turned over between polls', () => {
    const prev = lines('完全不同的一行');
    const r = mergeCaptionSnapshot(prev, ['毫无关系的新行'], 9000);
    expect(r.desynced).toBe(true);
    expect(r.lines.map((l) => l.text)).toEqual(['完全不同的一行', '毫无关系的新行']);
  });

  it('ignores blank and whitespace-only lines', () => {
    const r = mergeCaptionSnapshot([], ['  ', '真的一行', '\t'], 5000);
    expect(r.lines.map((l) => l.text)).toEqual(['真的一行']);
  });

  it('leaves state untouched on an empty snapshot', () => {
    const prev = lines('保留这行');
    const r = mergeCaptionSnapshot(prev, [], 5000);
    expect(r.lines.map((l) => l.text)).toEqual(['保留这行']);
    expect(r.appended).toBe(0);
  });
});

describe('script segmentation', () => {
  const day = (d: number, h = 12, m = 0) => new Date(2026, 3, d, h, m).getTime();

  it('starts a script when there is nothing yet', () => {
    expect(startsNewScript(undefined, day(5))).toBe(true);
  });

  it('splits on a calendar-day rollover even within the gap window', () => {
    const scripts = segmentScripts([
      { text: 'late', ts: new Date(2026, 3, 5, 23, 55).getTime() },
      { text: 'early', ts: new Date(2026, 3, 6, 0, 5).getTime() },
    ]);
    expect(scripts).toHaveLength(2);
  });

  it('splits on an idle gap', () => {
    const scripts = segmentScripts([
      { text: 'one', ts: day(5, 9, 0) },
      { text: 'two', ts: day(5, 9, 5) },
      { text: 'three', ts: day(5, 14, 0) },
    ]);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]!.lines).toHaveLength(2);
    expect(scripts[1]!.lines).toHaveLength(1);
  });

  it('keeps a continuous conversation in one script', () => {
    const scripts = segmentScripts([
      { text: 'one', ts: day(5, 9, 0) },
      { text: 'two', ts: day(5, 9, 4) },
      { text: 'three', ts: day(5, 9, 9) },
    ]);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.endedAt).toBe(day(5, 9, 9));
  });

  it('respects a custom gap', () => {
    const tight = segmentScripts(
      [
        { text: 'one', ts: day(5, 9, 0) },
        { text: 'two', ts: day(5, 9, 5) },
      ],
      60 * 1000,
    );
    expect(tight).toHaveLength(2);
    expect(DEFAULT_SCRIPT_GAP_MS).toBe(30 * 60 * 1000);
  });

  it('keys days locally', () => {
    expect(dayKey(day(5))).toBe('2026-04-05');
  });
});

describe('scriptTitle', () => {
  const at = (d: number, h = 9, m = 30) => new Date(2026, 3, d, h, m).getTime();
  const script = (d: number, h = 9, m = 30) => ({
    id: 'x',
    startedAt: at(d, h, m),
    endedAt: at(d, h, m),
    lines: [{ text: 'x', ts: at(d, h, m) }],
  });

  it('names a script after its date', () => {
    expect(scriptTitle(script(5), at(5))).toBe('Script 5th April');
  });

  it('uses correct ordinals', () => {
    expect(scriptTitle(script(1), at(1))).toBe('Script 1st April');
    expect(scriptTitle(script(2), at(2))).toBe('Script 2nd April');
    expect(scriptTitle(script(3), at(3))).toBe('Script 3rd April');
    expect(scriptTitle(script(11), at(11))).toBe('Script 11th April');
    expect(scriptTitle(script(12), at(12))).toBe('Script 12th April');
    expect(scriptTitle(script(13), at(13))).toBe('Script 13th April');
    expect(scriptTitle(script(21), at(21))).toBe('Script 21st April');
  });

  it('adds the year only when it is not the current one', () => {
    const nowNextYear = new Date(2027, 0, 1).getTime();
    expect(scriptTitle(script(5), nowNextYear)).toBe('Script 5th April 2026');
  });

  it('disambiguates a second script on the same day by start time', () => {
    expect(scriptTitle(script(5, 14, 7), at(5), 1)).toBe('Script 5th April (14:07)');
  });
});

describe('detectLang', () => {
  it('reads the Chinese sample the poller actually captured', () => {
    expect(detectLang('各位听众朋友们，大家好，欢迎收听新一期的每天中文，我是李明')).toBe('zh');
  });

  it('calls kana Japanese even when kanji dominate the line', () => {
    // The ja/zh split is the whole point: this line is mostly Han, and a
    // dominant-script count would file it under Chinese.
    expect(detectLang('日本語能力試験の勉強を始めました')).toBe('ja');
  });

  it('needs only a single kana to decide against Chinese', () => {
    expect(detectLang('東京大学の学生')).toBe('ja');
    expect(detectLang('東京大学')).toBe('zh');
  });

  it('separates hangul, Cyrillic and Latin', () => {
    expect(detectLang('안녕하세요 반갑습니다')).toBe('ko');
    expect(detectLang('Привет, как дела')).toBe('ru');
    expect(detectLang('Good morning everyone')).toBe('en');
  });

  it('reports und rather than guessing when there is nothing to read', () => {
    expect(detectLang('12:04 — 88 %')).toBe('und');
    expect(detectLang('')).toBe('und');
  });

  it('classifies a script on its whole body, so one stray word cannot flip it', () => {
    const s: CaptionScript = {
      id: 'x',
      startedAt: 0,
      endedAt: 3,
      lines: [
        { text: 'OK', ts: 0 },
        { text: 'それでは始めましょう', ts: 1 },
        { text: '今日のテーマは料理です', ts: 2 },
      ],
    };
    expect(scriptLang(s)).toBe('ja');
  });
});

describe('sortScriptsByLang', () => {
  const HOUR = 3600_000;
  function script(id: string, startedAt: number, text: string): CaptionScript {
    return { id, startedAt, endedAt: startedAt, lines: [{ text, ts: startedAt }] };
  }

  it('groups by language, newest first inside a group', () => {
    const groups = sortScriptsByLang([
      script('ja-old', 1 * HOUR, 'おはようございます'),
      script('zh-new', 9 * HOUR, '大家好，欢迎收听'),
      script('ja-new', 5 * HOUR, 'こんばんは'),
    ]);
    expect(groups.map((g) => g.lang)).toEqual(['zh', 'ja']);
    expect(groups[1]!.scripts.map((s) => s.id)).toEqual(['ja-new', 'ja-old']);
  });

  it('orders groups by their newest script, so the language just spoken leads', () => {
    // Ten Japanese scripts must not outrank one Chinese script recorded later —
    // group order is recency, not group size.
    const many = Array.from({ length: 10 }, (_, i) =>
      script(`ja-${i}`, i * HOUR, 'こんにちは'),
    );
    const groups = sortScriptsByLang([...many, script('zh', 20 * HOUR, '你好')]);
    expect(groups.map((g) => g.lang)).toEqual(['zh', 'ja']);
  });

  it('keeps every script exactly once', () => {
    const input = [
      script('a', 1, 'こんにちは'),
      script('b', 2, '你好'),
      script('c', 3, 'Привет'),
      script('d', 4, '12345'),
    ];
    const out = sortScriptsByLang(input).flatMap((g) => g.scripts.map((s) => s.id));
    expect(out.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate its input', () => {
    const input = [script('a', 1, 'こんにちは'), script('b', 2, 'おはよう')];
    sortScriptsByLang(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
