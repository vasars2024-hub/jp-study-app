import { describe, expect, it } from 'vitest';
import {
  SENTENCE_DECK_DEFAULTS,
  buildSentenceDeckNoteRequest,
  cleanSubtitleText,
  planSentenceDeck,
  sentenceAudioFfmpegArgs,
  sentenceClipBounds,
  sentenceDeckBookId,
  sentenceDeckNameFromPath,
  splitCueSentences,
  sentenceStillFfmpegArgs,
  sentenceTimeLabel,
  spokenText,
  studyAudioStreamIndex,
  translationFor,
  type SentenceDeckCue,
  type SentenceDeckOptions,
} from '../sentenceDeck';
import { existingDeckKeys } from '../filesApp/mining';

const ja: SentenceDeckOptions = { ...SENTENCE_DECK_DEFAULTS, studyLang: 'ja' };
const cue = (startMs: number, endMs: number, text: string, style?: string): SentenceDeckCue => ({
  startMs, endMs, text, ...(style ? { style } : {}),
});

describe('cleaning a subtitle line', () => {
  it('drops tags and dialogue dashes and joins CJK lines without a space', () => {
    expect(cleanSubtitleText('<i>おはよう</i>\n{\\an8}ございます')).toBe('おはようございます');
    expect(cleanSubtitleText('- はい。\n- いいえ。')).toBe('はい。いいえ。');
  });

  it('keeps the space between Russian words broken across lines', () => {
    expect(cleanSubtitleText('Я пойду\nдомой.')).toBe('Я пойду домой.');
  });

  it('removes sound effects and speaker labels but keeps the speech', () => {
    expect(spokenText('（笑）そうだね')).toBe('そうだね');
    expect(spokenText('田中：行きましょう')).toBe('行きましょう');
    expect(spokenText('Маша: Привет!')).toBe('Привет!');
    expect(spokenText('[拍手]')).toBe('');
    expect(spokenText('(смеётся)')).toBe('');
    // A clock is not a speaker.
    expect(spokenText('10:30に会おう')).toBe('10:30に会おう');
  });

  it('splits at sentence punctuation in all three languages', () => {
    expect(splitCueSentences('おはよう。元気？うん！')).toEqual(['おはよう。', '元気？', 'うん！']);
    expect(splitCueSentences('你好。你去哪儿？')).toEqual(['你好。', '你去哪儿？']);
    expect(splitCueSentences('Привет. Как дела? Т.е. 3.5 часа.')).toEqual(['Привет.', 'Как дела?', 'Т.е. 3.5 часа.']);
    expect(splitCueSentences('「行こう。」と言った')).toEqual(['「行こう。」', 'と言った']);
  });
});

describe('planSentenceDeck', () => {
  it('makes one sentence per dialogue line of the test episode', () => {
    const plan = planSentenceDeck([
      cue(1000, 4000, 'おはようございます。今日はいい天気ですね。'),
      cue(4500, 8000, 'そうですね。散歩に行きませんか？'),
      cue(8500, 12000, 'いいですよ。駅の近くの公園に行きましょう。'),
      cue(12500, 16000, '公園で猫を見ました。とても可愛かったです。'),
      cue(16500, 19500, 'また明日も来たいです。'),
    ], ja);
    expect(plan.segments.map((s) => s.text)).toHaveLength(5);
    expect(plan.segments[1]).toMatchObject({ index: 2, startMs: 4500, endMs: 8000 });
  });

  it('skips songs, signs, sound effects and lines with no study text, and says so', () => {
    const plan = planSentenceDeck([
      cue(0, 3000, '♪ 君の声が聞こえる'),
      cue(3000, 5000, '看板の文字', 'Signs'),
      cue(5000, 7000, '（拍手）'),
      cue(7000, 9000, 'Hello there'),
      cue(9000, 12000, '本当に行くの？'),
    ], ja);
    expect(plan.segments.map((s) => s.text)).toEqual(['本当に行くの？']);
    expect(plan.skipped.nonDialogue).toBe(3);
    expect(plan.skipped.noStudyText).toBe(1);
    expect(plan.read).toBe(5);
  });

  it('keeps non-dialogue when asked to', () => {
    const plan = planSentenceDeck([cue(0, 3000, '♪ 君の声が聞こえる')], { ...ja, skipNonDialogue: false });
    expect(plan.segments).toHaveLength(1);
  });

  it('merges a fragment into the next line and a line that ends mid-sentence', () => {
    const plan = planSentenceDeck([
      cue(0, 500, 'え？'),
      cue(700, 3000, '何て言ったの？'),
      cue(5000, 7500, '駅に行って、'),
      cue(7700, 10000, '電車に乗りました。'),
    ], ja);
    expect(plan.segments.map((s) => s.text)).toEqual(['え？何て言ったの？', '駅に行って、電車に乗りました。']);
    expect(plan.merged).toBe(2);
    expect(plan.segments[0]).toMatchObject({ startMs: 0, endMs: 3000 });
  });

  it('does not merge when switched off, and then drops the fragment as too short', () => {
    const plan = planSentenceDeck([cue(0, 500, 'え？'), cue(700, 3000, '何て言ったの？')], { ...ja, mergeShort: false });
    expect(plan.segments.map((s) => s.text)).toEqual(['何て言ったの？']);
    expect(plan.skipped.tooShort).toBe(1);
  });

  it('splits a long line at sentence ends and shares its time out by length', () => {
    const plan = planSentenceDeck(
      [cue(0, 20_000, '昨日は雨が降っていたので家にいました。今日は晴れたので公園に行きました。')],
      ja,
    );
    expect(plan.segments).toHaveLength(2);
    expect(plan.split).toBe(1);
    expect(plan.segments[0].startMs).toBe(0);
    expect(plan.segments[0].endMs).toBe(plan.segments[1].startMs);
    expect(plan.segments[1].endMs).toBe(20_000);
  });

  it('drops a line it cannot split that is over the maximum', () => {
    const plan = planSentenceDeck([cue(0, 20_000, '長い長い長い説明')], ja);
    expect(plan.segments).toHaveLength(0);
    expect(plan.skipped.tooLong).toBe(1);
  });

  it('honours the time range', () => {
    const plan = planSentenceDeck(
      [cue(1000, 3000, '一つ目です。'), cue(5000, 7000, '二つ目です。'), cue(9000, 11000, '三つ目です。')],
      { ...ja, rangeStartMs: 4000, rangeEndMs: 9000 },
    );
    expect(plan.segments.map((s) => s.text)).toEqual(['二つ目です。']);
    expect(plan.skipped.outOfRange).toBe(2);
  });

  it('skips what is already in the deck, and repeats within the track', () => {
    const plan = planSentenceDeck(
      [cue(0, 2000, 'ありがとう。'), cue(3000, 5000, 'はい、そうです。'), cue(6000, 8000, 'はい、そうです。')],
      ja,
      { existingKeys: existingDeckKeys(['ありがとう。']) },
    );
    expect(plan.segments.map((s) => s.text)).toEqual(['はい、そうです。']);
    expect(plan.skipped.duplicate).toBe(2);
  });

  it('reads Russian and Chinese tracks by their own script', () => {
    const ru = planSentenceDeck([cue(0, 2000, 'Доброе утро!'), cue(3000, 5000, 'おはよう')], {
      ...SENTENCE_DECK_DEFAULTS, studyLang: 'ru',
    });
    expect(ru.segments.map((s) => s.text)).toEqual(['Доброе утро!']);
    const zh = planSentenceDeck([cue(0, 2000, '早上好！'), cue(3000, 5000, 'Good morning')], {
      ...SENTENCE_DECK_DEFAULTS, studyLang: 'zh',
    });
    expect(zh.segments.map((s) => s.text)).toEqual(['早上好！']);
  });

  it('puts the helper-language line on the back', () => {
    const plan = planSentenceDeck(
      [cue(1000, 4000, 'おはようございます。'), cue(5000, 8000, '散歩に行きませんか？')],
      ja,
      { secondary: [cue(900, 4100, 'Good morning.'), cue(5200, 6500, 'Shall we'), cue(6500, 7900, 'go for a walk?')] },
    );
    expect(plan.segments.map((s) => s.translation)).toEqual(['Good morning.', 'Shall we go for a walk?']);
    expect(translationFor(10_000, 12_000, [cue(0, 20_000, 'far too long a line')])).toBe('far too long a line');
    expect(translationFor(10_000, 12_000, [cue(11_900, 15_000, 'next line')])).toBeUndefined();
  });

  it('caps a runaway track and counts what it left out', () => {
    const many = Array.from({ length: 5 }, (_, i) => cue(i * 3000, i * 3000 + 2000, `文${i}です。`));
    const plan = planSentenceDeck(many, ja, { maxCards: 3 });
    expect(plan.segments).toHaveLength(3);
    expect(plan.skipped.overCap).toBe(2);
  });
});

describe('clip bounds and ffmpeg arguments', () => {
  it('pads, clamps at zero and caps the length', () => {
    expect(sentenceClipBounds(1000, 3000, 200)).toEqual({ startSec: 0.8, durationSec: 2.4 });
    expect(sentenceClipBounds(100, 900, 250).startSec).toBe(0);
    expect(sentenceClipBounds(0, 120_000).durationSec).toBe(30);
    expect(sentenceClipBounds(1000, 1050, 0).durationSec).toBeCloseTo(0.4, 5);
  });

  it('cuts mono speech-rate MP3 from the chosen audio stream, seeking before the input', () => {
    const args = sentenceAudioFfmpegArgs({
      filePath: 'C:/ep 01.mkv',
      bounds: { startSec: 12.5, durationSec: 2.25 },
      audioStream: 1,
    });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('12.500');
    expect(args[args.indexOf('-t') + 1]).toBe('2.250');
    expect(args[args.indexOf('-map') + 1]).toBe('0:a:1');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
    expect(args[args.indexOf('-c:a') + 1]).toBe('libmp3lame');
    expect(args[args.indexOf('-af') + 1]).toMatch(/^loudnorm=.*afade=t=out:st=2\.190/);
    expect(args.at(-1)).toBe('pipe:1');
    expect(args).toContain('C:/ep 01.mkv');
  });

  it('grabs one still from the middle of the sentence', () => {
    const args = sentenceStillFfmpegArgs('a.mp4', { startSec: 10, durationSec: 4 });
    expect(args[args.indexOf('-ss') + 1]).toBe('12.000');
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1');
  });

  it('picks the study-language audio stream of a dual-audio release', () => {
    expect(studyAudioStreamIndex(['eng', 'jpn'], 'ja')).toBe(1);
    expect(studyAudioStreamIndex(['eng', 'rus'], 'ru')).toBe(1);
    expect(studyAudioStreamIndex(['chi', 'eng'], 'zh')).toBe(0);
    expect(studyAudioStreamIndex([null, null], 'ja')).toBe(0);
  });
});

describe('names and the Anki half', () => {
  it('names the deck after the episode without release tags', () => {
    expect(sentenceDeckNameFromPath('E:/v/[SubsPlease] Yuru Camp - 01 (1080p) [ABCD1234].mkv')).toBe('Yuru Camp - 01');
    expect(sentenceDeckNameFromPath('E:\\v\\[Test] Yuru Camp - 01.mp4')).toBe('Yuru Camp - 01');
    expect(sentenceDeckNameFromPath('/v/Show.Name.S01E02.mkv')).toBe('Show Name S01E02');
  });

  it('gives one file one stable group id regardless of separators and case', () => {
    expect(sentenceDeckBookId('E:\\V\\ep.mkv')).toBe(sentenceDeckBookId('e:/v/ep.mkv'));
    expect(sentenceDeckBookId('a.mkv')).not.toBe(sentenceDeckBookId('b.mkv'));
  });

  it('formats scene times', () => {
    expect(sentenceTimeLabel(65_400)).toBe('01:05');
    expect(sentenceTimeLabel(3_725_000)).toBe('1:02:05');
  });

  it('builds a sentence note routed by language, with the clip attached', () => {
    const request = buildSentenceDeckNoteRequest(
      { text: 'Привет!', translation: 'Hi!' },
      { studyLang: 'ru', audioBase64: 'AAAA', audioFilename: 'gum-sentence-1.mp3' },
    );
    expect(request.route).toEqual({ source: 'subtitle', cardKind: 'sentence', language: 'ru' });
    expect(request).toMatchObject({
      term: 'Привет!',
      sentence: 'Привет!',
      sentenceTranslation: 'Hi!',
      audioBase64: 'AAAA',
      audioFilename: 'gum-sentence-1.mp3',
    });
    expect(request.imageBase64).toBeUndefined();
  });
});
