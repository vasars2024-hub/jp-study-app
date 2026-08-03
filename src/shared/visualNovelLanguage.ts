import type { VisualNovelTextCapture } from './visualNovel';

export interface VisualNovelCharacterSpeechProfile {
  speaker: string;
  lineCount: number;
  characterCount: number;
  politeness: 'formal' | 'mixed' | 'casual';
  pronouns: string[];
  sentenceEndings: string[];
  markers: string[];
  summary: string;
}

const PRONOUNS = ['私', 'わたし', 'わたくし', '僕', 'ぼく', '俺', 'おれ', 'あたし', '自分', 'わし'];
const ENDINGS = ['です', 'ます', 'ございます', 'だ', 'だよ', 'だね', 'だぞ', 'だな', 'かな', 'かしら', 'わよ', 'のよ', 'ぜ', 'ぞ'];

function countMatches(lines: string[], pattern: RegExp): number {
  return lines.reduce((total, line) => total + (line.match(pattern)?.length ?? 0), 0);
}

function uniqueMatches(lines: string[], values: string[]): string[] {
  return values.filter((value) => lines.some((line) => line.includes(value)));
}

export function analyzeVisualNovelCharacterSpeech(
  captures: readonly VisualNovelTextCapture[],
): VisualNovelCharacterSpeechProfile[] {
  const grouped = new Map<string, string[]>();
  for (const capture of captures) {
    const speaker = capture.speaker.trim();
    if (!speaker || capture.kind !== 'dialogue') continue;
    const lines = grouped.get(speaker) ?? [];
    lines.push(capture.japanese);
    grouped.set(speaker, lines);
  }

  return [...grouped.entries()].map(([speaker, lines]) => {
    const formalCount = countMatches(lines, /(です|ます|でした|ました|ございます)/gu);
    const casualCount = countMatches(lines, /(だ[よねなぞ]?|じゃん|だろう|だろ|ぜ|ぞ)(?:[。！？!?]|$)/gu);
    const politeness: VisualNovelCharacterSpeechProfile['politeness'] = formalCount > casualCount * 1.5
      ? 'formal'
      : casualCount > formalCount * 1.5
        ? 'casual'
        : 'mixed';
    const markers = [
      ...(countMatches(lines, /(?:じゃん|だろ|だぜ|だぞ)/gu) ? ['assertive'] : []),
      ...(countMatches(lines, /(?:かしら|わよ|のよ)/gu) ? ['feminine-coded endings'] : []),
      ...(countMatches(lines, /(?:っす|すか)/gu) ? ['informal polite speech'] : []),
      ...(countMatches(lines, /(?:〜|ー{2,}|っ{2,})/gu) ? ['expressive elongation'] : []),
    ];
    const pronouns = uniqueMatches(lines, PRONOUNS);
    const sentenceEndings = uniqueMatches(lines, ENDINGS);
    const summaryParts = [
      `${politeness} register`,
      pronouns.length ? `uses ${pronouns.join('・')}` : '',
      markers.join(', '),
    ].filter(Boolean);
    return {
      speaker,
      lineCount: lines.length,
      characterCount: lines.reduce((total, line) => total + [...line].length, 0),
      politeness,
      pronouns,
      sentenceEndings,
      markers,
      summary: summaryParts.join('; '),
    };
  }).sort((a, b) => b.lineCount - a.lineCount || a.speaker.localeCompare(b.speaker, 'ja'));
}
