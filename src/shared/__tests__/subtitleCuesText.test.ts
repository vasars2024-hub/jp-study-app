// @vitest-environment node
/**
 * Parser correctness for every format `subtitleCues.ts` reads, table-driven.
 *
 * Work package 5 (docs/SCORECARD.md, bugs 20 and 21) plus the same classes of
 * bug checked across SRT, VTT, ASS/SSA and LRC: BOM, CRLF and lone CR, comma vs
 * dot milliseconds, hours above 99, negative times, overlapping cues, override
 * tags, ruby, VTT voice/class tags and HTML entities.
 */
import { describe, expect, it } from 'vitest';
import {
  cleanLine,
  decodeSubtitleEntities,
  parseAss,
  parseLrc,
  parseSrtVtt,
  parseSubtitles,
  toSeconds,
  type Cue,
} from '../subtitleCues';
import { studyCueAt, type VideoCoreStudyCue } from '../videoCoreStudy';

/** [start, end, text] rounded to the millisecond, for compact table rows. */
type Row = [number, number, string];
const rows = (cues: Cue[]): Row[] =>
  cues.map((c) => [Math.round(c.start * 1000) / 1000, Math.round(c.end * 1000) / 1000, c.text]);

const BOM = String.fromCharCode(0xfeff);
const crlf = (s: string) => s.replace(/\n/g, '\r\n');
const lfToCr = (s: string) => s.replace(/\n/g, '\r');

const srt = (...cues: [string, string, string][]) =>
  cues.map(([a, b, text], i) => `${i + 1}\n${a} --> ${b}\n${text}\n`).join('\n');
const vtt = (...cues: [string, string, string][]) =>
  `WEBVTT\n\n${cues.map(([a, b, text]) => `${a} --> ${b}\n${text}\n`).join('\n')}`;
const ASS_HEAD = '[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const ass = (...cues: [string, string, string][]) =>
  ASS_HEAD + cues.map(([a, b, text]) => `Dialogue: 0,${a},${b},Default,,0,0,0,,${text}`).join('\n');

describe('toSeconds', () => {
  it.each([
    ['00:00:01,500', 1.5],
    ['00:00:01.500', 1.5],
    ['01:02:03.004', 3723.004],
    ['02:03.5', 123.5],
    ['0:00:01.00', 1],
    ['123:00:00,000', 442800], // hours above 99
    ['00:00:02.869 align:start position:0%', 2.869],
    ['-00:00:01,000', -1], // shifted past zero: negative, not +1
    ['garbage', 0],
  ])('%s → %s', (stamp, seconds) => {
    expect(toSeconds(stamp)).toBeCloseTo(seconds, 6);
  });
});

describe('decodeSubtitleEntities — text only, one pass', () => {
  it.each([
    ['Tom &amp; Jerry', 'Tom & Jerry'],
    ['&gt;&gt; 話者', '>> 話者'],
    ['it&#39;s', "it's"],
    ['it&#x27;s', "it's"],
    ['a&nbsp;b', 'a b'],
    ['&lrm;こんにちは', 'こんにちは'],
    ['&rlm;x', 'x'],
    ['&#12354;', 'あ'],
    ['&#x1F600;', '😀'],
    ['&hellip;', '…'],
    // Negative cases: escaped markup stays visible text, never becomes markup.
    ['&amp;lt;b&amp;gt;', '&lt;b&gt;'],
    ['&lt;script&gt;', '<script>'],
    // Unknown, malformed or out-of-range references are left as written.
    ['&bogus;', '&bogus;'],
    ['&valueOf;', '&valueOf;'],
    ['&toString;', '&toString;'],
    ['&amp', '&amp'],
    ['&#xD800;', '&#xD800;'],
    ['&#0;', '&#0;'],
    ['&#99999999;', '&#99999999;'],
    ['AT&T', 'AT&T'],
  ])('%s → %s', (input, out) => {
    expect(decodeSubtitleEntities(input)).toBe(out);
  });
});

describe('cleanLine — markup out, readable text in', () => {
  it.each([
    // VTT voice / class / lang / timing tags.
    ['<v Roger Bingham>We are in New York City', 'We are in New York City'],
    ['<c.yellow.bg_blue>黄色</c>', '黄色'],
    ['<lang ja>日本語</lang>', '日本語'],
    ['皆さん<00:00:00.640><c>こんにちは</c>', '皆さんこんにちは'],
    // SRT HTML-ish tags.
    ['<i>斜体</i> と <b>太字</b>', '斜体 と 太字'],
    ['<font color="#ffff00">黄</font>', '黄'],
    // Ruby: the reading is dropped, not glued onto the base.
    ['<ruby>漢字<rt>かんじ</rt></ruby>を読む', '漢字を読む'],
    ['<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字</ruby>', '漢字'],
    ['<ruby>東京<rt>とうきょう</ruby>', '東京'],
    ['｜漢字《かんじ》を読む', '漢字を読む'],
    ['東京《とうきょう》へ', '東京へ'],
    // ASS overrides and hard breaks inside an SRT.
    ['{\\an8}上に出る', '上に出る'],
    ['一行目\\N二行目', '一行目\n二行目'],
    // Entities decoded after tag stripping: an escaped tag stays visible.
    ['&lt;i&gt;not italics&lt;/i&gt;', '<i>not italics</i>'],
    ['&gt;&gt; Speaker', '>> Speaker'],
    // Per-line trim; blank lines dropped.
    ['  上  \n\n  下  ', '上\n下'],
    // Negative: a parenthesised reading and brackets that are not ruby stay.
    ['（ナレーション）昔々', '（ナレーション）昔々'],
    ['《重要》', '《重要》'],
  ])('%j → %j', (input, out) => {
    expect(cleanLine(input)).toBe(out);
  });
});

describe('SRT', () => {
  const base = srt(
    ['00:00:01,000', '00:00:02,500', 'おはよう'],
    ['00:00:03.000', '00:00:04.000', 'Tom &amp; Jerry'],
  );
  it.each([
    ['LF', base],
    ['CRLF', crlf(base)],
    ['lone CR', lfToCr(base)],
    ['BOM + CRLF', BOM + crlf(base)],
  ])('%s', (_name, raw) => {
    expect(rows(parseSubtitles(raw))).toEqual([[1, 2.5, 'おはよう'], [3, 4, 'Tom & Jerry']]);
    // A direct call behaves like the dispatcher.
    expect(rows(parseSrtVtt(raw))).toEqual([[1, 2.5, 'おはよう'], [3, 4, 'Tom & Jerry']]);
  });

  it('reads hours above 99', () => {
    const raw = srt(['100:00:00,000', '100:00:02,000', '長い']);
    expect(rows(parseSubtitles(raw))).toEqual([[360000, 360002, '長い']]);
  });

  it('drops a cue wholly before zero and starts a straddling one at zero', () => {
    const raw = srt(
      ['-00:00:03,000', '-00:00:01,000', '前'],
      ['-00:00:01,000', '00:00:01,000', '跨ぐ'],
      ['00:00:02,000', '00:00:03,000', '後'],
    );
    expect(rows(parseSubtitles(raw))).toEqual([[0, 1, '跨ぐ'], [2, 3, '後']]);
  });

  it('keeps overlapping cues as separate lines, in start order', () => {
    const raw = srt(
      ['00:00:01,000', '00:00:05,000', 'A が話す'],
      ['00:00:02,000', '00:00:03,000', 'B が割り込む'],
    );
    expect(rows(parseSubtitles(raw))).toEqual([[1, 5, 'A が話す'], [2, 3, 'B が割り込む']]);
  });

  it('keeps the same line said twice in a row (not a rolling track)', () => {
    const raw = srt(['00:00:01,000', '00:00:02,000', 'はい'], ['00:00:02,000', '00:00:03,000', 'はい']);
    expect(rows(parseSubtitles(raw))).toEqual([[1, 2, 'はい'], [2, 3, 'はい']]);
  });

  it('does not open a cue on text that merely contains -->', () => {
    const raw = 'not a --> timing line\n\n' + srt(['00:00:01,000', '00:00:02,000', 'a --> b']);
    expect(rows(parseSubtitles(raw))).toEqual([[1, 2, 'a --> b']]);
  });
});

describe('VTT', () => {
  it.each([
    ['dot milliseconds, no hours', vtt(['00:01.000', '00:02.000', 'こんにちは']), [[1, 2, 'こんにちは']]],
    ['cue settings after the end time', vtt(['00:00:01.000', '00:00:02.000 align:start position:0%', 'x']), [[1, 2, 'x']]],
    ['voice tag', vtt(['00:00:01.000', '00:00:02.000', '<v 先生>静かに']), [[1, 2, '静かに']]],
    ['entity-bearing caption', vtt(['00:00:01.000', '00:00:02.000', '&gt;&gt; 次は&#39;東京&#39;&nbsp;です&lrm;']), [[1, 2, ">> 次は'東京' です"]]],
    ['ruby', vtt(['00:00:01.000', '00:00:02.000', '<ruby>明日<rt>あした</rt></ruby>また']), [[1, 2, '明日また']]],
    ['BOM + CRLF', BOM + crlf(vtt(['00:00:01.000', '00:00:02.000', 'a'])), [[1, 2, 'a']]],
  ] as [string, string, Row[]][])('%s', (_name, raw, expected) => {
    expect(rows(parseSubtitles(raw))).toEqual(expected);
  });

  it('skips a NOTE block and a cue identifier', () => {
    const raw = 'WEBVTT\n\nNOTE this is a comment\n\nintro\n00:00:01.000 --> 00:00:02.000\n本文\n';
    expect(rows(parseSubtitles(raw))).toEqual([[1, 2, '本文']]);
  });
});

describe('ASS / SSA', () => {
  it.each([
    ['\\an8 and \\N', '{\\an8}上の\\N二行目', '上の\n二行目'],
    ['\\h hard space', 'また\\h明日', 'また 明日'],
    ['karaoke timing', '{\\k20}か{\\k30}ら{\\k25}お{\\k40}け', 'からおけ'],
    ['entity', 'Tom &amp; Jerry', 'Tom & Jerry'],
    ['commas in text', 'はい, そうです, ね', 'はい, そうです, ね'],
  ])('%s', (_name, text, expected) => {
    expect(rows(parseAss(ass(['0:00:01.00', '0:00:02.00', text])))).toEqual([[1, 2, expected]]);
  });

  it.each([
    ['CRLF', crlf(ass(['0:00:01.00', '0:00:02.00', 'a']))],
    ['BOM', BOM + ass(['0:00:01.00', '0:00:02.00', 'a'])],
    ['lone CR', lfToCr(ass(['0:00:01.00', '0:00:02.00', 'a']))],
  ])('%s', (_name, raw) => {
    expect(rows(parseSubtitles(raw))).toEqual([[1, 2, 'a']]);
  });

  it('reads hours beyond one digit, ignores Comment: lines, accepts indented Dialogue', () => {
    const raw = `${ASS_HEAD}Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,メモ\n  Dialogue: 0,12:00:01.00,12:00:02.50,Default,,0,0,0,,遅い`;
    expect(rows(parseSubtitles(raw))).toEqual([[43201, 43202.5, '遅い']]);
  });

  it('drops a line wholly before zero and clamps one that straddles it', () => {
    const raw = ass(['-0:00:03.00', '-0:00:01.00', '前'], ['-0:00:01.00', '0:00:01.00', '跨ぐ']);
    expect(rows(parseSubtitles(raw))).toEqual([[0, 1, '跨ぐ']]);
  });
});

describe('LRC', () => {
  it('BUG 20: a blank timestamp ends the line before it', () => {
    // Line 1 is sung 10–14 s, then a 26 s instrumental break. It used to run 10–40 s.
    const raw = '[00:10.00]一行目\n[00:14.00]\n[00:40.00]二行目\n[00:44.00]\n';
    expect(rows(parseLrc(raw))).toEqual([[10, 14, '一行目'], [40, 44, '二行目']]);
  });

  it('without a blank stamp a line still runs to the next line', () => {
    expect(rows(parseLrc('[00:10.00]一\n[00:14.50]二\n[00:19.00]三\n'))).toEqual([
      [10, 14.5, '一'],
      [14.5, 19, '二'],
      [19, 23.5, '三'], // last line: the song's typical (median) line length
    ]);
  });

  it.each([
    ['median below the floor', '[00:01.00]a\n[00:01.50]b\n[00:02.00]c\n', [2, 4]],
    ['median above the ceiling', '[00:00.00]a\n[00:30.00]b\n[01:00.00]c\n', [60, 70]],
    ['single line, nothing to measure', '[00:05.00]only\n', [5, 10]],
    ['[length:] bounds the last line', '[length: 00:21.00]\n[00:10.00]a\n[00:15.00]b\n[00:20.00]c\n', [20, 21]],
  ] as [string, string, [number, number]][])('caps the last line: %s', (_name, raw, [start, end]) => {
    const last = parseLrc(raw).at(-1);
    expect([last?.start, last?.end]).toEqual([start, end]);
  });

  it('applies [offset:] (positive = earlier), clamped at zero', () => {
    expect(rows(parseLrc('[offset:+500]\n[00:00.20]a\n[00:10.00]b\n[00:12.00]\n'))).toEqual([[0, 9.5, 'a'], [9.5, 11.5, 'b']]);
    expect(rows(parseLrc('[offset:-1000]\n[00:10.00]a\n[00:12.00]\n'))).toEqual([[11, 13, 'a']]);
  });

  it('reads enhanced LRC word times: stripped from the text, a closing one ends the line', () => {
    const raw = '[00:12.00]<00:12.00>春の<00:12.80>風が<00:13.60>\n[00:20.00]<00:20.00>夏の<00:21.00>空\n[00:25.00]\n';
    expect(rows(parseLrc(raw))).toEqual([[12, 13.6, '春の風が'], [20, 25, '夏の空']]);
  });

  it('a closing word time never runs past the next tag', () => {
    expect(rows(parseLrc('[00:01.00]a <00:09.00>\n[00:05.00]b\n[00:06.00]\n'))).toEqual([[1, 5, 'a'], [5, 6, 'b']]);
  });

  it('expands a line with several time tags, and keeps same-time lines visible', () => {
    const raw = '[00:10.00][00:40.00]サビ\n[00:14.00]\n[00:44.00]\n[00:20.00]原文\n[00:20.00]translation\n[00:24.00]\n';
    expect(rows(parseLrc(raw))).toEqual([
      [10, 14, 'サビ'],
      [20, 24, '原文'],
      [20, 24, 'translation'], // used to be [20, 20]: never on screen
      [40, 44, 'サビ'],
    ]);
  });

  it.each([
    ['[mm:ss]', '[00:10]a\n[00:12]\n', [[10, 12, 'a']]],
    ['[mm:ss.xxx]', '[00:10.250]a\n[00:12.500]\n', [[10.25, 12.5, 'a']]],
    ['[mm:ss:xx]', '[00:10:50]a\n[00:12:00]\n', [[10.5, 12, 'a']]],
    ['[mm:ss.x]', '[00:10.5]a\n[00:12.0]\n', [[10.5, 12, 'a']]],
    ['minutes above 99', '[120:00.00]a\n[120:02.00]\n', [[7200, 7202, 'a']]],
    ['metadata ignored', '[ti:曲]\n[ar:歌手]\n[by:me]\n[00:01.00]a\n[00:02.00]\n', [[1, 2, 'a']]],
    ['entity decoded', '[00:01.00]rock &amp; roll\n[00:02.00]\n', [[1, 2, 'rock & roll']]],
    ['non-time brackets kept as text', '[00:01.00][Chorus] la\n[00:02.00]\n', [[1, 2, '[Chorus] la']]],
    ['BOM + CRLF', `${BOM}[00:01.00]a\r\n[00:02.00]\r\n`, [[1, 2, 'a']]],
  ] as [string, string, Row[]][])('%s', (_name, raw, expected) => {
    expect(rows(parseLrc(raw))).toEqual(expected);
    expect(rows(parseSubtitles(raw))).toEqual(expected);
  });
});

/**
 * BUG 21b, YouTube rolling auto-captions: the same rolling layout as
 * `fixtures/youtube-auto-ja.vtt` (spacer line, previous line on top, 10 ms
 * carry cue), with `はい` said twice in a row.
 */
describe('rolling auto-captions keep a line said twice', () => {
  const typing = (a: string, b: string, top: string, said: string) =>
    `${a} --> ${b} align:start position:0%\n${top}\n${said}<${a}><c></c>\n`;
  const carry = (a: string, b: string, line: string) => `${a} --> ${b} align:start position:0%\n${line}\n \n`;
  const ROLLING = [
    'WEBVTT\nKind: captions\nLanguage: ja\n',
    typing('00:00:00.100', '00:00:01.990', ' ', 'こんにちは'),
    carry('00:00:01.990', '00:00:02.000', 'こんにちは'),
    typing('00:00:02.000', '00:00:03.990', 'こんにちは', 'はい'),
    carry('00:00:03.990', '00:00:04.000', 'はい'),
    typing('00:00:04.000', '00:00:05.990', 'はい', 'はい'),
    carry('00:00:05.990', '00:00:06.000', 'はい'),
    typing('00:00:06.000', '00:00:07.990', 'はい', 'さようなら'),
    carry('00:00:07.990', '00:00:08.000', 'さようなら'),
  ].join('\n');

  it('BUG 21b: two separate はい cues, each with its own time', () => {
    expect(rows(parseSubtitles(ROLLING))).toEqual([
      [0.1, 2, 'こんにちは'],
      [2, 4, 'はい'],
      [4, 6, 'はい'],
      [6, 8, 'さようなら'],
    ]);
  });

  it('still collapses true carry-overs: CRLF + BOM change nothing', () => {
    expect(rows(parseSubtitles(BOM + crlf(ROLLING)))).toEqual(rows(parseSubtitles(ROLLING)));
  });

  it('a re-emitted identical display back to back is a carry, not a new line', () => {
    const raw = [
      'WEBVTT\n',
      typing('00:00:00.100', '00:00:01.000', ' ', 'こんにちは'),
      typing('00:00:01.000', '00:00:02.000', ' ', 'こんにちは'),
      carry('00:00:02.000', '00:00:02.010', 'こんにちは'),
      typing('00:00:02.010', '00:00:03.000', 'こんにちは', 'またね'),
    ].join('\n');
    expect(rows(parseSubtitles(raw))).toEqual([[0.1, 2.01, 'こんにちは'], [2.01, 3, 'またね']]);
  });

  it('after a gap the display was cleared, so a repeat is a new line', () => {
    const raw = [
      'WEBVTT\n',
      typing('00:00:00.100', '00:00:01.000', ' ', 'はい'),
      carry('00:00:01.000', '00:00:01.010', 'はい'),
      typing('00:00:05.000', '00:00:06.000', ' ', 'はい'),
      carry('00:00:06.000', '00:00:06.010', 'はい'),
    ].join('\n');
    expect(rows(parseSubtitles(raw))).toEqual([[0.1, 1.01, 'はい'], [5, 6.01, 'はい']]);
  });

  it('the SRT-converted shape (no spacer, no tags) keeps the repeat too', () => {
    const raw = srt(
      ['00:00:00,100', '00:00:01,990', '一つ目'],
      ['00:00:01,990', '00:00:02,000', '一つ目'],
      ['00:00:02,000', '00:00:03,990', '一つ目\nはい'],
      ['00:00:03,990', '00:00:04,000', 'はい'],
      ['00:00:04,000', '00:00:05,990', 'はい\nはい'],
      ['00:00:05,990', '00:00:06,000', 'はい'],
      ['00:00:06,000', '00:00:07,990', 'はい\n終わり'],
    );
    expect(parseSubtitles(raw).map((c) => c.text)).toEqual(['一つ目', 'はい', 'はい', '終わり']);
  });

  it('BUG 21a: entities in auto-captions are decoded before carry detection', () => {
    const raw = [
      'WEBVTT\n',
      typing('00:00:00.100', '00:00:01.990', ' ', '&gt;&gt; 司会'),
      carry('00:00:01.990', '00:00:02.000', '&gt;&gt; 司会'),
      typing('00:00:02.000', '00:00:03.000', '&gt;&gt; 司会', 'Q&amp;A'),
    ].join('\n');
    expect(parseSubtitles(raw).map((c) => c.text)).toEqual(['>> 司会', 'Q&A']);
  });
});

/**
 * Round trip through the study player's own lookup: what each parser produces
 * is what `studyCueAt` (replay / mine / loop / auto-pause) acts on.
 */
describe('round trip through studyCueAt', () => {
  const toStudy = (cues: Cue[]): VideoCoreStudyCue[] =>
    cues.map((c, index) => ({
      index,
      trackNumber: 1,
      text: c.text,
      startMs: Math.round(c.start * 1000),
      endMs: Math.round(c.end * 1000),
    }));
  const at = (cues: Cue[], t: number, linger = true) => studyCueAt(toStudy(cues), t, 0, { linger })?.text ?? null;

  it('LRC: the instrumental break is not part of the line', () => {
    const cues = parseSubtitles('[00:10.00]一行目\n[00:14.00]\n[00:40.00]二行目\n[00:44.00]\n');
    expect(at(cues, 12)).toBe('一行目');
    // In the break nothing is ACTIVE; the line just heard lingers for the study tools.
    expect(at(cues, 20, false)).toBeNull();
    expect(at(cues, 20)).toBe('一行目');
    expect(at(cues, 41)).toBe('二行目');
  });

  it('rolling captions: each はい is its own study line', () => {
    const raw = [
      'WEBVTT\n',
      '00:00:00.100 --> 00:00:01.990\n \nはい<00:00:00.100><c></c>\n',
      '00:00:01.990 --> 00:00:02.000\nはい\n \n',
      '00:00:02.000 --> 00:00:03.990\nはい\nはい<00:00:02.000><c></c>\n',
      '00:00:03.990 --> 00:00:04.000\nはい\n \n',
    ].join('\n');
    const study = toStudy(parseSubtitles(raw));
    const first = studyCueAt(study, 1, 0);
    const second = studyCueAt(study, 3, 0);
    expect(first?.text).toBe('はい');
    expect(second?.text).toBe('はい');
    expect(first?.index).not.toBe(second?.index);
  });

  it('VTT entities reach the study line decoded', () => {
    const cues = parseSubtitles(vtt(['00:00:01.000', '00:00:03.000', '&gt;&gt; Q&amp;A']));
    expect(at(cues, 2)).toBe('>> Q&A');
  });

  it('ASS overrides and SRT negative times do not leak into lookup', () => {
    expect(at(parseSubtitles(ass(['0:00:01.00', '0:00:03.00', '{\\an8}上\\N下'])), 2)).toBe('上\n下');
    const shifted = parseSubtitles(srt(['-00:00:01,000', '00:00:01,000', '跨ぐ'], ['00:00:02,000', '00:00:03,000', '次']));
    expect(at(shifted, 0.5)).toBe('跨ぐ');
    expect(at(shifted, 2.5)).toBe('次');
  });
});
