// The per-style script filter, measured against the shape that produced it.
//
// Route B acquired 39 episodes of JoJo Part 5 on 2026-08-18, tagged
// `简繁外挂字幕`. Parsed: 667,437 cues, of which 97.0% carry no kana at all —
// 348,994 Chinese OP karaoke (0 kana), 274,628 romaji karaoke (826), 11,602
// Chinese dialogue (38) and 11,168 Japanese dialogue (11,049). Every one of
// those would have gone into a Japanese frequency table.

import { describe, expect, it } from 'vitest';
import { keepJapaneseStyleCues, parseStudySubtitles, parseSubtitles, type Cue } from '../subtitleCues';

const cue = (text: string, style?: string, start = 0): Cue => ({
  start,
  end: start + 1,
  text,
  ...(style ? { style } : {}),
});

/** N lines of a style, of which `kana` carry kana. */
function track(style: string, total: number, kana: number): Cue[] {
  return Array.from({ length: total }, (_, i) => cue(i < kana ? 'これはセリフだ' : '這是台詞', style, i));
}

describe('keepJapaneseStyleCues — a dual-language .ass is two tracks in one file', () => {
  it('drops the Chinese track and keeps the Japanese one', () => {
    // The measured episode-01 ratio, scaled down: 413 lines each way, the
    // Japanese track at 98.9% kana and the Chinese one at 0%.
    const cues = [...track('JOJO5_textjp', 413, 409), ...track('JOJO5_textch', 413, 0)];
    const split = keepJapaneseStyleCues(cues);

    expect(split.cues).toHaveLength(413);
    expect(split.dropped).toBe(413);
    expect(split.styles).toEqual(['JOJO5_textch']);
    expect(split.cues.every((c) => c.style === 'JOJO5_textjp')).toBe(true);
  });

  it('drops romaji karaoke, which a kana-anywhere rule would have kept', () => {
    // NEGATIVE CONTROL for the threshold itself. `JOJO5-op1-jp-2` measured
    // 826 kana cues out of 274,628 — 0.3%. A rule of "keep any style that has
    // kana somewhere" keeps all 274,628, so the majority test is what earns
    // the 60x reduction rather than the name `jp` in the style.
    const cues = [...track('JOJO5-op1-jp-2', 1_000, 3), ...track('JOJO5_textjp', 100, 99)];
    const split = keepJapaneseStyleCues(cues);

    expect(split.dropped).toBe(1_000);
    expect(split.cues.every((c) => c.style === 'JOJO5_textjp')).toBe(true);
  });

  it('sorts the reported styles by how much each one cost', () => {
    const cues = [
      ...track('small-ch', 10, 0),
      ...track('huge-ch', 500, 0),
      ...track('jp', 50, 50),
    ];
    expect(keepJapaneseStyleCues(cues).styles).toEqual(['huge-ch', 'small-ch']);
  });
});

describe('keepJapaneseStyleCues — inert wherever it has no evidence', () => {
  it('leaves a styleless cue list exactly as it found it', () => {
    // Every .srt, .vtt and .lrc in the app. Identity, not merely equal length:
    // this must not become a filter that quietly reshapes the ordinary path.
    const cues = [cue('これはセリフだ'), cue('這是台詞'), cue('plain line')];
    const split = keepJapaneseStyleCues(cues);
    expect(split.cues).toBe(cues);
    expect(split.dropped).toBe(0);
    expect(split.styles).toEqual([]);
  });

  it('keeps everything when no style qualifies, rather than emptying the corpus', () => {
    // A file uniform in something that is not kana. Refusing it here would hide
    // a whole release behind a filter; `looksJapaneseSubtitle` already judged
    // the file, and this function has no second opinion to offer.
    const cues = [...track('a', 20, 0), ...track('b', 20, 0)];
    const split = keepJapaneseStyleCues(cues);
    expect(split.cues).toHaveLength(40);
    expect(split.dropped).toBe(0);
  });

  it('keeps everything when every style qualifies', () => {
    const cues = [...track('sign', 20, 20), ...track('dialogue', 30, 30)];
    expect(keepJapaneseStyleCues(cues).dropped).toBe(0);
  });

  it('holds a Japanese track that leans on kanji, at the measured margin', () => {
    // The false-positive control. Natural Japanese reaches for a particle
    // almost every line, so the risk is a terse track — 60% kana still stays.
    const cues = [...track('jp-terse', 100, 60), ...track('ch', 100, 0)];
    const split = keepJapaneseStyleCues(cues);
    expect(split.styles).toEqual(['ch']);
    expect(split.cues).toHaveLength(100);
  });
});

describe('keepJapaneseStyleCues — through the real parser', () => {
  it('reads the style off an ASS file and filters on it end to end', () => {
    const ass = [
      '[Script Info]',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.00,textjp,,0,0,0,,お客さん ここらじゃうちが一番安いよ',
      'Dialogue: 0,0:00:01.00,0:00:03.00,textch,,0,0,0,,這位客人 這裡就數我家最便宜了',
      'Dialogue: 0,0:00:04.00,0:00:06.00,textjp,,0,0,0,,{\\pos(10,10)}なんだと',
      'Dialogue: 0,0:00:04.00,0:00:06.00,textch,,0,0,0,,你說什麼',
    ].join('\n');

    const cues = parseSubtitles(ass);
    expect(cues).toHaveLength(4);
    const split = keepJapaneseStyleCues(cues);
    expect(split.dropped).toBe(2);
    expect(split.cues.map((c) => c.text)).toEqual(['お客さん ここらじゃうちが一番安いよ', 'なんだと']);
  });
});

describe('parseStudySubtitles — what the player is asked to render', () => {
  /** The dual-language shape, with both tracks on the SAME timings. */
  const DUAL = [
    '[Script Info]',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:03.00,JOJO5_textjp,,0,0,0,,お客さん ここらじゃうちが一番安いよ',
    'Dialogue: 0,0:00:01.00,0:00:03.00,JOJO5_textch,,0,0,0,,這位客人 這裡就數我家最便宜了',
    'Dialogue: 0,0:00:04.00,0:00:06.00,JOJO5_textjp,,0,0,0,,なんだと',
    'Dialogue: 0,0:00:04.00,0:00:06.00,JOJO5_textch,,0,0,0,,你說什麼',
  ].join('\n');

  /** What a player does every frame: everything whose interval covers `t`. */
  const activeAt = (cues: Cue[], t: number): string[] =>
    cues.filter((c) => c.start <= t && t < c.end).map((c) => c.text);

  it('leaves one line on screen where the raw parse leaves two', () => {
    // The defect, stated as the number: two cues share every timestamp, so the
    // player stacks a Chinese line on the Japanese one for the whole episode.
    expect(activeAt(parseSubtitles(DUAL), 2)).toHaveLength(2);
    expect(activeAt(parseStudySubtitles(DUAL).cues, 2)).toEqual([
      'お客さん ここらじゃうちが一番安いよ',
    ]);
  });

  it('reports the number and the style, so the hiding is never silent', () => {
    const split = parseStudySubtitles(DUAL);
    expect(split.dropped).toBe(2);
    expect(split.styles).toEqual(['JOJO5_textch']);
  });

  it('is inert on a .srt, which has no styles to judge', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nHello there\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond line\n';
    const split = parseStudySubtitles(srt);
    expect(split.cues).toHaveLength(2);
    expect(split.dropped).toBe(0);
  });

  it('keeps a whole Japanese-only .ass rather than judging its styles against each other', () => {
    // The jimaku case. Two styles, both Japanese-bearing, and the smaller one is
    // not a "loser" merely for being smaller.
    const single = [
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,こんばんは',
      'Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,また明日',
      'Dialogue: 0,0:00:07.00,0:00:09.00,Sign,,0,0,0,,東京駅へようこそ',
    ].join('\n');
    const split = parseStudySubtitles(single);
    expect(split.cues).toHaveLength(3);
    expect(split.dropped).toBe(0);
  });

  it('hides a kana-free sign style, and that limit is deliberate rather than an oversight', () => {
    // 東京駅 is a valid Japanese sign AND a valid Chinese one; script alone
    // cannot separate them, so a style with no kana is dropped whatever language
    // wrote it. A minimum-line floor would be the obvious "fix" and the measured
    // release forbids it: censused 2026-08-18 over all 39 acquired episodes,
    // `JOJO5_textjp-an8` and `JOJO5_textch-an8` are BOTH 169 lines across 35
    // files — one line per file each — so any floor that saved the Japanese sign
    // would put the Chinese one straight back on screen. The cost is bounded and
    // reported: the caller names the dropped styles, and the translation-track
    // slot loads the file unfiltered.
    const withSign = [
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,こんばんは',
      'Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,また明日',
      'Dialogue: 0,0:00:07.00,0:00:09.00,Sign,,0,0,0,,東京駅',
    ].join('\n');
    const split = parseStudySubtitles(withSign);
    expect(split.dropped).toBe(1);
    expect(split.styles).toEqual(['Sign']);
  });
});
