/**
 * The shared contract of the live-captions overlay: settings bounds, how a
 * caption line becomes clickable words in each study language, which stretch
 * of the ring buffer is a line's audio, and the energy segmenter behind the
 * experimental Whisper captions.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTIONS_SETTINGS,
  EnergySegmenter,
  LINE_LEAD_MS,
  LINE_MAX_MS,
  LINE_TAIL_MS,
  OVERLAY_MAX_HEIGHT,
  OVERLAY_MIN_WIDTH,
  captionClipFilename,
  captionTokenSpans,
  lineAudioWindow,
  normalizeCaptionsSettings,
} from '../captionsOverlay';

describe('settings', () => {
  it('defaults: capture off is not a setting — only lengths, source and look', () => {
    expect(DEFAULT_CAPTIONS_SETTINGS.captureSeconds).toBe(60);
    expect(DEFAULT_CAPTIONS_SETTINGS.mineSeconds).toBe(8);
    expect(DEFAULT_CAPTIONS_SETTINGS.source).toBe('windows');
    expect(DEFAULT_CAPTIONS_SETTINGS.bounds).toBeNull();
  });

  it('clamps whatever was stored or sent', () => {
    const s = normalizeCaptionsSettings({
      captureSeconds: 5000,
      mineSeconds: 1,
      source: 'nonsense',
      overlayOpacity: 3,
      fontSize: 2,
      bounds: { x: 10.4, y: 20, width: 50, height: 9999 },
      transcribeMined: 'yes',
    });
    expect(s.captureSeconds).toBe(120);
    expect(s.mineSeconds).toBe(3);
    expect(s.source).toBe('windows');
    expect(s.overlayOpacity).toBe(1);
    expect(s.fontSize).toBe(16);
    expect(s.bounds).toEqual({ x: 10, y: 20, width: OVERLAY_MIN_WIDTH, height: OVERLAY_MAX_HEIGHT });
    expect(s.transcribeMined).toBe(true);
  });

  it('a partial patch keeps the rest of the base', () => {
    const base = normalizeCaptionsSettings({ source: 'gum', mineSeconds: 12 });
    const next = normalizeCaptionsSettings({ overlayOpacity: 0.5 }, base);
    expect(next.source).toBe('gum');
    expect(next.mineSeconds).toBe(12);
    expect(next.overlayOpacity).toBe(0.5);
    expect(normalizeCaptionsSettings({ bounds: null }, { ...base, bounds: { x: 1, y: 1, width: 900, height: 140 } }).bounds).toBeNull();
  });
});

const words = (spans: ReturnType<typeof captionTokenSpans>): string[] => spans.filter((s) => s.word).map((s) => s.text);

describe('caption line → word spans', () => {
  it('Japanese with the tokenizer: one span per morpheme, offsets into the line', () => {
    const text = '昨日、寿司を食べました。';
    const spans = captionTokenSpans(text, 'ja', ['昨日', '、', '寿司', 'を', '食べ', 'まし', 'た', '。']);
    expect(spans.map((s) => s.text).join('')).toBe(text);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
    expect(words(spans)).toEqual(['昨日', '寿司', 'を', '食べ', 'まし', 'た']);
    expect(spans.find((s) => s.text === '、')?.word).toBe(false);
  });

  it('Japanese: a surface the tokenizer normalised is skipped, never misplaced', () => {
    const text = 'ＡＢＣで遊ぶ';
    const spans = captionTokenSpans(text, 'ja', ['ABC', 'で', '遊ぶ']);
    expect(spans.map((s) => s.text).join('')).toBe(text);
    expect(words(spans)).toEqual(['で', '遊ぶ']);
  });

  it('Japanese before kuromoji has loaded still gives clickable words (ICU)', () => {
    const spans = captionTokenSpans('今日は雨です', 'ja');
    expect(spans.map((s) => s.text).join('')).toBe('今日は雨です');
    expect(words(spans).length).toBeGreaterThan(1);
  });

  it('Chinese: ICU words, punctuation and Latin are not clickable', () => {
    const text = '今天天气很好，我们去 KTV 吧。';
    const spans = captionTokenSpans(text, 'zh');
    expect(spans.map((s) => s.text).join('')).toBe(text);
    const w = words(spans);
    expect(w).toContain('今天');
    expect(w).not.toContain('KTV');
    expect(w).not.toContain('，');
  });

  it('Russian: whole words with hyphens, English asides and numbers plain', () => {
    const text = 'Кто-нибудь видел 3 книги? OK';
    const spans = captionTokenSpans(text, 'ru');
    expect(spans.map((s) => s.text).join('')).toBe(text);
    expect(words(spans)).toEqual(['Кто-нибудь', 'видел', 'книги']);
  });

  it('empty text is no spans', () => {
    expect(captionTokenSpans('', 'ru')).toEqual([]);
  });
});

describe('a line\'s audio', () => {
  it('Live Captions lines start before they were seen and end after their last revision', () => {
    const w = lineAudioWindow({ startMs: 10_000, endMs: 13_000, source: 'windows' });
    expect(w).toEqual({ startMs: 10_000 - LINE_LEAD_MS, endMs: 13_000 + LINE_TAIL_MS });
  });

  it('never runs into the next line\'s speech', () => {
    const w = lineAudioWindow({ startMs: 10_000, endMs: 16_000, source: 'windows' }, { startMs: 14_000 });
    expect(w.endMs).toBe(14_000 - LINE_LEAD_MS / 3);
  });

  it('is capped for a line revised for a long time', () => {
    const w = lineAudioWindow({ startMs: 0, endMs: 60_000, source: 'windows' });
    expect(w.endMs - w.startMs).toBe(LINE_MAX_MS);
  });

  it('Whisper utterances are already speech-bounded', () => {
    expect(lineAudioWindow({ startMs: 5000, endMs: 8000, source: 'gum' })).toEqual({ startMs: 4750, endMs: 8250 });
  });

  it('names clips by their UTC start', () => {
    expect(captionClipFilename(Date.UTC(2026, 8, 26, 7, 5, 9), 'mp3')).toBe('gum-captions-20260926-070509.mp3');
  });
});

describe('EnergySegmenter', () => {
  const RATE = 16_000;
  const silence = (ms: number): Int16Array => new Int16Array((RATE * ms) / 1000);
  const speech = (ms: number): Int16Array =>
    Int16Array.from({ length: (RATE * ms) / 1000 }, (_, i) => Math.round(Math.sin(i / 3) * 9000));

  it('closes an utterance after a pause and stamps it in wall-clock time', () => {
    const seg = new EnergySegmenter({ sampleRate: RATE });
    const out = [
      ...seg.push(silence(1000), 101_000),
      ...seg.push(speech(1500), 102_500),
      ...seg.push(silence(1000), 103_500),
    ];
    expect(out).toHaveLength(1);
    const u = out[0]!;
    expect(u.forced).toBe(false);
    // Speech began at 101000; the pre-roll reaches ~200 ms before it.
    expect(u.startMs).toBeGreaterThanOrEqual(100_750);
    expect(u.startMs).toBeLessThanOrEqual(101_000);
    expect(u.endMs).toBeGreaterThan(102_500);
    expect(u.endMs).toBeLessThan(103_300);
    expect(u.samples.length).toBe(Math.round(((u.endMs - u.startMs) / 1000) * RATE));
  });

  it('ignores a click shorter than a word', () => {
    const seg = new EnergySegmenter({ sampleRate: RATE });
    const out = [...seg.push(speech(90), 1090), ...seg.push(silence(1500), 2590)];
    expect(out).toEqual([]);
  });

  it('cuts a monologue at the maximum so captions keep flowing', () => {
    const seg = new EnergySegmenter({ sampleRate: RATE, maxUtteranceMs: 3000 });
    const out = seg.push(speech(7000), 7000);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.every((u) => u.forced)).toBe(true);
  });
});
