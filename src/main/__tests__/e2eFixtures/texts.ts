// Invented content for the scraper pipeline E2E suites: one made-up show, its
// episode titles, and the Japanese subtitle lines the fake download carries.
// Nothing here is taken from a real release.

export const SHOW = 'Gum Test Show';
/** A second invented title whose name ends in a number, the shape `looksLikeBatch` used to misread. */
export const NUMBERED_SHOW = 'Gum Test Show 100';

export interface FixtureEpisode {
  n: number;
  title: string;
  /** 40 hex characters, a v1 infohash. Invented. */
  hash: string;
}

export const EPISODES: FixtureEpisode[] = [
  { n: 1, title: 'はじめての朝', hash: 'a1'.repeat(20) },
  { n: 2, title: '雨の日の約束', hash: 'b2'.repeat(20) },
  { n: 3, title: '第三の扉', hash: 'c3'.repeat(20) },
  { n: 4, title: '夜明け前', hash: 'd4'.repeat(20) },
];

/** What the index lists for each episode — a fansub-style release name. */
export function releaseName(show: string, n: number): string {
  return `[GumSubs] ${show} - ${String(n).padStart(2, '0')} (1080p) [JPN]`;
}

export const CUE_LINES = ['おはようございます。', '今日はいい天気ですね。'] as const;

/** UTF-8 with a byte-order mark and CRLF line ends, as Windows tools write it. */
export const SRT_JA = '﻿1\r\n00:00:00,500 --> 00:00:01,400\r\nおはようございます。\r\n\r\n'
  + '2\r\n00:00:01,500 --> 00:00:02,800\r\n今日はいい天気ですね。\r\n';

/** The same cues with no BOM, for re-encoding into legacy code pages. */
export const SRT_JA_PLAIN = SRT_JA.slice(1);

/**
 * An ASS script exercising the override tags a study parser must handle:
 * `{\an8}` (position), `\N` (hard break), `\h` (hard space) and a `{\p1}`
 * vector drawing, which is a shape and must never become a cue.
 */
export const ASS_JA = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 160',
  'PlayResY: 90',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.50,0:00:01.40,Default,,0,0,0,,{\\an8}おはようございます、先生。',
  'Dialogue: 0,0:00:01.50,0:00:02.80,Default,,0,0,0,,今日は\\Nいい天気ですね。',
  'Dialogue: 0,0:00:03.00,0:00:03.60,Default,,0,0,0,,また\\h明日。',
  'Dialogue: 1,0:00:00.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}',
  '',
].join('\n');

// --------------------------------------------------------- legacy encoding ---
//
// Node can decode Shift_JIS and EUC-JP (TextDecoder, full ICU) but has no
// encoder for them. Rather than adding a dependency for a test, the encoder is
// the decoder run backwards: every two-byte sequence is decoded once and the
// result remembered.

type LegacyEncoding = 'shift_jis' | 'euc-jp';

const reverse = new Map<LegacyEncoding, Map<string, number[]>>();

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function reverseTable(encoding: LegacyEncoding): Map<string, number[]> {
  const known = reverse.get(encoding);
  if (known) return known;
  const decoder = new TextDecoder(encoding, { fatal: true });
  const table = new Map<string, number[]>();
  const leads = encoding === 'shift_jis' ? [...range(0x81, 0x9f), ...range(0xe0, 0xfc)] : range(0xa1, 0xfe);
  const trails = encoding === 'shift_jis' ? range(0x40, 0xfc).filter((b) => b !== 0x7f) : range(0xa1, 0xfe);
  for (const lead of leads) {
    for (const trail of trails) {
      try {
        const ch = decoder.decode(Uint8Array.of(lead, trail));
        if (ch.length === 1 && !table.has(ch)) table.set(ch, [lead, trail]);
      } catch {
        /* not a valid pair */
      }
    }
  }
  reverse.set(encoding, table);
  return table;
}

/** Encodes `text` as Shift_JIS or EUC-JP. Throws on a character the code page lacks. */
export function encodeLegacy(text: string, encoding: LegacyEncoding): Buffer {
  const table = reverseTable(encoding);
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const pair = table.get(ch);
    if (!pair) throw new Error(`${encoding} cannot encode U+${code.toString(16)}`);
    bytes.push(...pair);
  }
  return Buffer.from(bytes);
}

/** UTF-16 LE with a byte-order mark. */
export function encodeUtf16Le(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
}
