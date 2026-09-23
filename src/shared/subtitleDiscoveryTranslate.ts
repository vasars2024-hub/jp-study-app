/**
 * Turning one subtitle track into another language's track, minus the engine.
 *
 * Everything here is pure: which cues are worth translating, how a batch is
 * prompted, how the reply is read, and how the answers are put back on the
 * original timing. The main process supplies the model (`main/
 * subtitleDiscoveryTranslate.ts`); the tests supply canned replies.
 *
 * Why not `translateCore.buildBatchPrompt`: that prompt is written for glossary
 * terms and book passages, and below 40 characters it switches to "give the
 * meaning only". Nearly every subtitle line is under 40 characters, so it would
 * translate `行くぞ！` as "to go". A subtitle line needs the dialogue register and
 * the lines around it, which is what this prompt asks for.
 */

import type { Cue } from './subtitleCues';
import { selectDialogueCues } from './subtitleFusionCore';
import { cuesToSrt } from './subtitlesExport';
import { cleanLlmOutput, parseBatchJson } from './translateCore';
import { langLabel } from './langs';

export interface SubtitleTranslationUnit {
  /** Stable id inside one track: the 1-based position among translated lines. */
  id: string;
  start: number;
  end: number;
  text: string;
}

/** Longest line sent to a model. A real subtitle line is a fraction of this. */
const MAX_UNIT_CHARS = 400;

/** ASS override blocks, `\N` breaks and runs of whitespace collapsed to one readable line. */
export function subtitleUnitText(text: string): string {
  return text
    .replace(/\{[^}]*\\[^}]*\}/g, '')
    .replace(/\\[Nnh]/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_UNIT_CHARS);
}

/**
 * The cues worth translating, in time order.
 *
 * Signs and song lyrics are dropped — the same classifier the EN→JA fusion uses —
 * because a helper line under a karaoke credit or a shop sign is noise, and each
 * one costs a model its share of a batch.
 */
export function subtitleTranslationUnits(cues: readonly Cue[]): SubtitleTranslationUnit[] {
  const { cues: dialogue } = selectDialogueCues(cues);
  const units: SubtitleTranslationUnit[] = [];
  for (const cue of dialogue) {
    const text = subtitleUnitText(cue.text);
    if (!text || !(cue.end > cue.start)) continue;
    units.push({ id: String(units.length + 1), start: cue.start, end: cue.end, text });
  }
  return units;
}

export function chunkTranslationUnits<T>(units: readonly T[], size: number): T[][] {
  const width = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < units.length; i += width) chunks.push(units.slice(i, i + width));
  return chunks;
}

/** Lines preceding a chunk, shown to the model for context only. */
export function contextBefore(
  units: readonly SubtitleTranslationUnit[],
  chunk: readonly SubtitleTranslationUnit[],
  count = 4,
): string[] {
  const first = units.indexOf(chunk[0]);
  if (first <= 0) return [];
  return units.slice(Math.max(0, first - count), first).map((unit) => unit.text);
}

export const SUBTITLE_TRANSLATION_SYSTEM_PROMPT =
  'You translate film and TV subtitles. Respond with valid JSON only: a JSON array '
  + '[{"id":"1","text":"..."}] with exactly one object per input line, using the same ids.';

function targetGuidance(target: string): string {
  if (target.toLowerCase().startsWith('ja')) {
    return 'Write natural spoken Japanese as a native subtitle would read: kanji and kana, '
      + 'no romaji, no furigana, no brackets with readings.';
  }
  return `Write natural spoken ${langLabel(target)}: short, idiomatic subtitle lines, `
    + 'no romanization, no notes, no quotation marks around the line.';
}

/**
 * One batch prompt. The example id is the chunk's own first id, because a small
 * local model copies an example id literally (see `translateCore.buildBatchPrompt`).
 */
export function buildSubtitleTranslationPrompt(
  chunk: readonly SubtitleTranslationUnit[],
  source: string,
  target: string,
  context: readonly string[] = [],
): string {
  const from = langLabel(source);
  const to = langLabel(target);
  const first = chunk[0]?.id ?? '1';
  const parts = [
    '/no_think',
    `Translate these ${from} subtitle lines into ${to}.`,
    'Each numbered line is one subtitle. Translate every line on its own — do not merge, split or skip lines — '
      + 'but use the neighbouring lines to get pronouns, tone and meaning right. Keep names as names.',
    targetGuidance(target),
    `Return ONLY a JSON array: [{"id":${JSON.stringify(first)},"text":"<${to} line>"}, ...]`,
  ];
  if (context.length) {
    parts.push('', 'Earlier lines (context only, do not translate):', ...context.map((line) => `- ${line}`));
  }
  parts.push('', 'Lines:', ...chunk.map((unit) => `[${unit.id}] ${unit.text}`));
  return parts.join('\n');
}

/** Pulls a JSON array or object out of a reply that may be fenced or wrapped in prose. */
export function extractJsonPayload(raw: string): string {
  const cleaned = cleanLlmOutput(raw);
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(cleaned);
  if (fence?.[1]) return fence[1].trim();
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (arrayStart >= 0 && arrayEnd > arrayStart && (objectStart < 0 || arrayStart < objectStart)) {
    return cleaned.slice(arrayStart, arrayEnd + 1);
  }
  if (objectStart >= 0 && objectEnd > objectStart) return cleaned.slice(objectStart, objectEnd + 1);
  return cleaned;
}

/** id → translated line, for ids this chunk asked about. Anything else is ignored. */
export function parseSubtitleTranslationReply(
  raw: string,
  chunk: readonly SubtitleTranslationUnit[],
): Map<string, string> {
  const expected = new Set(chunk.map((unit) => unit.id));
  const parsed = parseBatchJson(extractJsonPayload(raw), expected);
  const out = new Map<string, string>();
  for (const [id, text] of parsed) {
    const line = text.replace(/^["“「]|["”」]$/g, '').replace(/\s+/g, ' ').trim();
    if (line) out.set(id, line);
  }
  return out;
}

/**
 * The translated track, on the source track's timing. A line with no usable
 * translation is left out rather than filled with the source text: a Japanese
 * line in the English helper row reads as a bug, and a gap reads as silence.
 */
export function assembleTranslatedSrt(
  units: readonly SubtitleTranslationUnit[],
  translations: ReadonlyMap<string, string>,
): { srt: string; translated: number; total: number } {
  const cues = units
    .map((unit) => ({ start: unit.start, end: unit.end, text: translations.get(unit.id) ?? '' }))
    .filter((cue) => cue.text.trim());
  return { srt: cues.length ? `${cuesToSrt(cues)}\n` : '', translated: cues.length, total: units.length };
}

/**
 * Whether a translated track is complete enough to keep. A run where most batches
 * failed is worse than none: the helper line would drop out every few lines and
 * the user would read that as broken timing.
 */
export function translationIsUsable(result: { translated: number; total: number }): boolean {
  if (result.total === 0) return false;
  return result.translated >= Math.min(3, result.total) && result.translated / result.total >= 0.6;
}
