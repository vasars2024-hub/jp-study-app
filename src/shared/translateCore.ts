// Pure translation-engine helpers shared by the main process and tests:
// prompt construction and output parsing carry all the failure-mode handling
// (thinking blocks, malformed JSON, id echoes), so they live here without any
// Electron or node-llama dependencies.

import { langLabel } from './langs';

export interface TranslateBatchItem {
  id: string;
  text: string;
  source: string;
  target: string;
  /** Retry pass — use the stricter single-item prompt. */
  strict?: boolean;
}

/**
 * One word whose meaning the reader has already settled.
 *
 * The translator model resolves polysemy on its own and silently: 見る becomes
 * "saw" or "looked after" with nothing to appeal to. A hint is the reader's own
 * disambiguation — a gloss the dictionary supplied and the reader pinned —
 * handed to the model as a constraint rather than a suggestion the prose has to
 * imply. It carries no invented text: `gloss` always comes from a dictionary
 * entry the user has installed.
 */
export interface TranslateSenseHint {
  /** The dictionary headword, not the surface form: hints are per lemma. */
  text: string;
  reading?: string;
  gloss: string;
}

/** A prompt is a budget. Beyond this many hints the passage itself gets crowded out. */
export const MAX_SENSE_HINTS = 12;
/** Long enough for a real multi-gloss sense, short enough that 12 of them still fit. */
const MAX_SENSE_HINT_CHARS = 160;

/**
 * Coerce renderer-supplied hints into the shape the prompt builder trusts.
 *
 * This crosses an IPC boundary, so the main process cannot assume the array is
 * well-formed or bounded — an unsanitized list would let a caller push the
 * passage itself out of the model's context. A hint missing either the word or
 * the gloss says nothing and is dropped rather than rendered as a blank rule.
 */
export function sanitizeSenseHints(value: unknown): TranslateSenseHint[] {
  if (!Array.isArray(value)) return [];
  const out: TranslateSenseHint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const text = typeof item.text === 'string' ? item.text.trim().slice(0, MAX_SENSE_HINT_CHARS) : '';
    const gloss = typeof item.gloss === 'string' ? item.gloss.trim().slice(0, MAX_SENSE_HINT_CHARS) : '';
    if (!text || !gloss) continue;
    const reading = typeof item.reading === 'string'
      ? item.reading.trim().slice(0, MAX_SENSE_HINT_CHARS)
      : '';
    out.push(reading && reading !== text ? { text, reading, gloss } : { text, gloss });
    if (out.length >= MAX_SENSE_HINTS) break;
  }
  return out;
}

/**
 * The literal opening of the constraint block.
 *
 * Exported because it is also the echo detector: the phrase is distinctive
 * enough that a "translation" containing it is the model repeating its own
 * instructions rather than translating. See `looksLikeSenseHintEcho`.
 */
export const SENSE_HINT_MARKER = 'Word meanings to use:';

/**
 * The constraint block prefixed to a translation prompt.
 *
 * The shape here was decided by the model this app actually ships, not by what
 * reads best. A first attempt spelled the constraint out over three lines of
 * prose with one bullet per word; driven live against Qwen3-1.7B it made the
 * model echo the whole instruction block back as the translation, five times
 * over, and the result passed the existing validator because it was fluent
 * English containing no kana. So: one line, no bullets, no readings, no
 * explanation of why. The imperative and the `Text:` marker stay last, where a
 * small model's instruction-following is strongest.
 *
 * Returns the empty string when there are no hints, so every existing prompt is
 * byte-identical to what it was before this layer existed — an unpinned
 * translation must not change because the pinning feature shipped.
 */
export function buildSenseHintBlock(hints: readonly TranslateSenseHint[] | undefined): string {
  if (!hints?.length) return '';
  const pairs = hints.map((hint) => `${hint.text} = ${hint.gloss}`);
  return `${SENSE_HINT_MARKER} ${pairs.join(' / ')}\n`;
}

/**
 * Did the model hand back its own instructions instead of a translation?
 *
 * `isValidCrossLangTranslation` cannot see this: an echoed English instruction
 * block is fluent target-language text containing none of the source, which is
 * exactly what it checks for. Without this guard the reader is shown the prompt
 * as though it were a translation of their passage.
 */
export function looksLikeSenseHintEcho(
  text: string,
  hints?: readonly TranslateSenseHint[],
): boolean {
  if (text.includes(SENSE_HINT_MARKER)) return true;
  // Observed live: the model dropped the marker phrase and echoed only the
  // `word = gloss` pairs, which the marker check alone sailed straight past. No
  // translation of a passage contains its own glossary syntax, so the pair form
  // is as reliable a tell as the marker.
  return !!hints?.some((hint) => text.includes(`${hint.text} = `));
}

export function cleanLlmOutput(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/^[\s\n]+/, '')
    .trim();
}

/**
 * The `<Russian translation>` slot from `buildBatchPrompt`'s worked example.
 *
 * A small model sometimes fills the shape and not the content — observed live
 * against Qwen3-1.7B, which returned every item as `"<Japanese translation>"`.
 * That is a well-formed reply whose text is the prompt, and without this it
 * reaches the card as a translation.
 */
const TEMPLATE_ECHO = /^<[^<>]*\btranslation>$/;

/**
 * Parse the JSON array a batch prompt asks for. Malformed JSON returns an
 * empty map (the caller treats those items as failed); an item echoing its own
 * id as the "translation" is rejected (the source of stray "t1" card values), as
 * is one echoing the example's placeholder.
 */
export function parseBatchJson(raw: string, expectedIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const cleaned = cleanLlmOutput(raw);
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const arr = Array.isArray(parsed) ? parsed : (parsed as { results?: unknown })?.results;
    if (!Array.isArray(arr)) return out;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const id = typeof obj.id === 'string' ? obj.id : '';
      const text = typeof obj.text === 'string' ? obj.text.trim() : '';
      if (id && expectedIds.has(id) && text && text !== id && !TEMPLATE_ECHO.test(text)) {
        out.set(id, text);
      }
    }
  } catch {
    /* fall through */
  }
  return out;
}

/**
 * The batch prompt, with its worked example built from the caller's own first id.
 *
 * A hardcoded example id is not cosmetic — a 1.7B model copies it literally, and
 * `parseBatchJson` then drops the whole reply on the `expectedIds` filter. Measured
 * against Qwen3-1.7B on 2026-08-15: the short form's frozen `"t0"` example made the
 * model answer `["t0".."t7"]` for items numbered `[0]…[7]`, and `parseBatchJson`
 * kept **0 of 8** — every short-form batch in the app had been returning nothing.
 * Deriving the example from `items[0].id` makes that class of drift impossible.
 */
export function buildBatchPrompt(items: TranslateBatchItem[]): string {
  const source = langLabel(items[0].source);
  const target = langLabel(items[0].target);
  const lines = items.map((item) => `[${item.id}] ${item.text}`);
  const example = `[{"id":${JSON.stringify(items[0].id)},"text":"<${target} translation>"}, ...]`;
  const longForm = items.some((item) => item.text.length > 40);
  if (longForm) {
    return (
      `/no_think\nTranslate each numbered ${source} passage into ${target}. ` +
      `Keep meaning and tone; output ${target} only. ` +
      `Return ONLY a JSON array: ${example}\n\n` +
      lines.join('\n')
    );
  }
  return (
    `/no_think\nTranslate each numbered ${source} term into ${target}. ` +
    `Give the ${target} meaning only — never romaji, kana, or the original word. ` +
    `Return ONLY a JSON array: ${example}\n\n` +
    lines.join('\n')
  );
}

/**
 * Stricter single-item retry prompt used after a validation failure.
 *
 * The retry carries the same hints as the first pass. Dropping them here would
 * make the reader's pins hold only when the model happened to succeed first
 * time — a constraint that silently lapses on the retry path is worse than no
 * constraint, because nothing in the output says which pass produced it.
 */
export function buildStrictPrompt(
  item: TranslateBatchItem,
  hints?: readonly TranslateSenseHint[],
): string {
  const source = langLabel(item.source);
  const target = langLabel(item.target);
  return (
    `/no_think\n${buildSenseHintBlock(hints)}` +
    `Translate this ${source} term into ${target}. ` +
    `Respond with ONLY the ${target} translation written in ${target} — ` +
    `no ${source} characters, no romanization, no explanations, no quotes.\n\n` +
    `Term: ${item.text}`
  );
}

/**
 * How the interactive Translate surface asks for its rendering.
 *
 * `natural` is the prompt every caller has always sent. `literal` is the
 * learner's "show me the structure" rendering (DeepL's alternative / Migaku's
 * literal gloss): the same one-line instruction with one clause added, so the
 * small model's instruction-following stays where it is strongest — at the end.
 */
export type TranslateStyle = 'natural' | 'literal';

export function sanitizeTranslateStyle(value: unknown): TranslateStyle {
  return value === 'literal' ? 'literal' : 'natural';
}

/**
 * One sentence of a passage and what it became.
 *
 * `target` is empty when the model gave nothing usable for that sentence: the
 * joined translation drops it (a source clause inside target prose reads as part
 * of the translation), but the aligned view must still show which sentence it was.
 */
export interface TranslateSegment {
  source: string;
  target: string;
}

/**
 * The passage splitter the sentence-by-sentence translator uses. Shared so the
 * renderer's aligned view can split a passage exactly as the model saw it.
 */
export function splitTranslationSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[。．！？!?\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Coerce an IPC-supplied segment list into the shape the aligned view trusts.
 * Anything malformed yields `null` so the caller falls back to its own split.
 */
export function sanitizeTranslateSegments(value: unknown): TranslateSegment[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: TranslateSegment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.source !== 'string' || typeof item.target !== 'string') return null;
    out.push({ source: item.source, target: item.target });
  }
  return out;
}

export function buildSentencePrompt(
  text: string,
  source: string,
  target: string,
  hints?: readonly TranslateSenseHint[],
  style: TranslateStyle = 'natural',
): string {
  const how = style === 'literal'
    ? 'as literally as possible, keeping the original word order and structure where the target language allows. '
    : '';
  return (
    `/no_think\n${buildSenseHintBlock(hints)}` +
    `Translate the following ${langLabel(source)} text to ${langLabel(target)}${how ? ` ${how}` : '. '}` +
    `Output ONLY the translation, nothing else.\n\nText: ${text}`
  );
}
