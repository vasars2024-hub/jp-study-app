/**
 * "Read text with AI": a vision model on the learner's own key (Claude, GPT,
 * Gemini, or a local OpenAI-compatible server whose model reads pictures) as an
 * engine of the OCR router (`ocrRouter.ts`). Settings and consent:
 * `shared/aiOcrVision.ts`, `aiOcrVisionStore.ts`.
 *
 * ## How a surface uses it
 *
 * ```ts
 * // Every OCR surface, around its router call (ocrSurface.ts does this once):
 * const read = await withAiVision(image, opts, deps, recognizeWithRouter);
 * // Snip's "Check with AI", whatever the mode (the opt-in still applies):
 * const checked = await checkWithAiVision(image, opts, localRead, plan.providerId);
 * // Manga: a page's speech-bubble crops in ONE call (lines per crop, in order):
 * const perCrop = await readRegionsWithAiVision(crops, providerId, opts);
 * ```
 *
 * - **Off** (the default): `withAiVision` is the router call, nothing else.
 * - **Always**: `aiVisionOcrProvider` leads the router's providers (tier −5:
 *   above PaddleOCR and manga-ocr, below an engine the learner picked by hand).
 *   It reads a page once — every candidate language the router tries gets the
 *   same memoised read — and if it fails the local engines read as before.
 * - **Only when unsure**: the router reads with the local engines; when it is
 *   still unsure (`aiOcrCheckWanted`), the picture goes to the model once and
 *   `mergeAiRead` keeps the model's text wherever the two disagree. An empty or
 *   invalid reply leaves the local read as it was.
 *
 * ## The request
 *
 * One call per snip, page or region (never per line), through `callAiProviderJson`:
 * the `ocrVision` opt-in is enforced there, the reply is validated with zod
 * (one repair retry), the caller's `signal` reaches the HTTP request, and the
 * spend ceiling counts the picture's tokens. The picture is downscaled to what
 * the provider would read anyway (`AI_OCR_IMAGE_LIMITS`), so no megabytes are
 * sent to be thrown away. The prompt asks for an exact transcription: printed
 * line breaks and reading order (vertical text column by column, right to
 * left), no furigana, no translation, no commentary; per line an optional
 * confidence, box and the characters the model doubts with alternatives — the
 * same one-click fixes the local engines offer. A line without a confidence is
 * "high but unverified" (`AI_OCR_UNVERIFIED_CONFIDENCE`).
 */
import { z } from 'zod';
import type { EngineLine, OcrProvider, RouterDeps, RouterImage } from './ocrRouter';
import {
  meanLineConfidence,
  OCR_LINE_FALLBACK_CONFIDENCE,
  unsureCharsOf,
  type OcrChar,
  type OcrLangId,
  type OcrPurpose,
  type OcrRouterLine,
  type OcrRouterOptions,
  type OcrRouterResult,
} from '../shared/ocrRouterTypes';
import { requireAiProvider, type AiProviderId, type AiProviderKeyBucket } from '../shared/aiProviders';
import { aiOcrCheckWanted, aiOcrEngineId } from '../shared/aiOcrVision';
import { callAiProviderJson } from './aiProviderClient';
import { AiProviderRuntimeError, type AiProviderErrorCode, type AiProviderImageInput } from './providerRuntime';
import { resolveAiOcrVisionPlan, type AiOcrVisionPlan } from './aiOcrVisionStore';

// ---------------------------------------------------------------------------
// Limits

/** What each vendor reads a picture at; anything larger is downscaled by the vendor anyway. */
export interface AiOcrImageLimits {
  /** Longest side, px. */
  maxSide: number;
  /** Pixels in all. */
  maxPixels: number;
  /** Base64 characters per picture. */
  maxBase64: number;
}

export const AI_OCR_IMAGE_LIMITS: Readonly<Record<AiProviderKeyBucket, AiOcrImageLimits>> = {
  // Anthropic: ≤1568 px long side and ~1.15 MP are read without resizing; 5 MB per image.
  anthropic: { maxSide: 1568, maxPixels: 1_150_000, maxBase64: 4_800_000 },
  // OpenAI high detail fits 2048 × 2048, then 768 on the short side; 20 MB per image.
  openai: { maxSide: 2048, maxPixels: 2048 * 768 * 2, maxBase64: 15_000_000 },
  // Gemini tiles at 768 px; a 20 MB request in all.
  gemini: { maxSide: 3072, maxPixels: 3072 * 3072, maxBase64: 12_000_000 },
  // A local vision model resizes to far less; this only bounds the upload.
  'openai-compatible': { maxSide: 1536, maxPixels: 1536 * 1536, maxBase64: 8_000_000 },
  // DeepSeek reads no pictures (the runtime refuses); listed so the record is total.
  deepseek: { maxSide: 1024, maxPixels: 1024 * 1024, maxBase64: 4_000_000 },
};

/** At most this many pictures in one call (Anthropic allows 100, a local server far fewer). */
export const AI_OCR_MAX_IMAGES_PER_CALL = 16;

/** A cloud model takes seconds, not the router's sub-second budgets: the floor per purpose. */
export const AI_OCR_TIMEOUT_MS: Readonly<Record<OcrPurpose, number>> = {
  snip: 60_000,
  manga: 45_000,
  lens: 20_000,
  vn: 15_000,
  book: 60_000,
};

/** A line the model gave no confidence for: high, but nothing checked it. */
export const AI_OCR_UNVERIFIED_CONFIDENCE = 0.9;
/** A character the model said it doubts: listed as unsure, never re-read alone. */
export const AI_OCR_DOUBT_P = 0.55;

/** How much smaller a picture must be to fit `limits` (1 = as is). */
export function aiOcrScaleFactor(width: number, height: number, limits: AiOcrImageLimits): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const fit = Math.min(limits.maxSide / Math.max(width, height), Math.sqrt(limits.maxPixels / (width * height)));
  // A hair under, so rounding the new size never lands a pixel over the limit.
  return fit >= 1 ? 1 : fit * 0.998;
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new AiProviderRuntimeError('The picture could not be encoded for the AI provider.', 'invalid-response');
  return { mimeType: match[1], base64: match[2] };
}

/** The picture as an image part, downscaled to the provider's limits (and further if still too many bytes). */
export function prepareAiOcrImage(image: RouterImage, providerId: AiProviderId): AiProviderImageInput {
  const limits = AI_OCR_IMAGE_LIMITS[requireAiProvider(providerId).keyBucket];
  let factor = aiOcrScaleFactor(image.width, image.height, limits);
  let sized = factor < 1 && image.scaled ? image.scaled(factor) : image;
  let part = splitDataUrl(sized.dataUrl());
  for (let tries = 0; part.base64.length > limits.maxBase64 && image.scaled && tries < 4; tries += 1) {
    factor *= 0.7;
    sized = image.scaled(factor);
    part = splitDataUrl(sized.dataUrl());
  }
  if (part.base64.length > limits.maxBase64) {
    throw new AiProviderRuntimeError('The picture is too large for the AI provider.', 'input-budget');
  }
  return { ...part, width: sized.width, height: sized.height, detail: 'high' };
}

// ---------------------------------------------------------------------------
// The prompt and the reply

const SYSTEM_PROMPT =
  'You are a meticulous OCR engine for language learners. You transcribe the text in pictures exactly as printed. You never translate, explain, summarise or correct it.';

function languageName(lang: OcrLangId): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

export interface AiOcrReadOptions {
  /** The languages the picture may be in; the learner's own first. */
  langs: readonly OcrLangId[];
  purpose: OcrPurpose;
  orientation?: 'horizontal' | 'vertical' | 'auto';
  budgetMs?: number;
  signal?: AbortSignal;
  /** Transcribe furigana / ruby too (default: left out). */
  furigana?: boolean;
}

/** The instructions for one call over `count` pictures. */
export function buildAiOcrPrompt(opts: Pick<AiOcrReadOptions, 'langs' | 'purpose' | 'orientation' | 'furigana'>, count: number): string {
  const langs = [...new Set(opts.langs)];
  const likely = langs.length
    ? `The text is most likely ${languageName(langs[0])}${langs.length > 1 ? `; it may also be ${langs.slice(1).map(languageName).join(' or ')}` : ''}. Transcribe it in whatever language it is actually in.`
    : 'Transcribe the text in whatever language it is in.';
  const what = opts.purpose === 'manga'
    ? 'Each picture is a manga page or a speech bubble.'
    : opts.purpose === 'book'
      ? 'Each picture is a book page.'
      : 'Each picture is a screenshot region the learner selected.';
  const direction = opts.orientation === 'vertical'
    ? 'The text is set vertically.'
    : opts.orientation === 'horizontal'
      ? 'The text is set horizontally.'
      : '';
  return [
    `${count === 1 ? 'Read the picture.' : `Read each of the ${count} pictures; picture 1 is the first one attached.`} ${what} ${likely} ${direction}`.replace(/\s+/g, ' ').trim(),
    'Rules:',
    '- Transcribe every character exactly as printed: keep kanji, kana, punctuation and full-width forms as they are. Do not correct, normalise, translate or add anything.',
    '- One entry in `lines` per printed line, in reading order. Vertical text: one entry per column, columns from right to left, each read top to bottom; set `vertical` true. Separate speech bubbles or panels are separate lines, in their reading order.',
    opts.furigana
      ? '- Include furigana (small readings beside kanji) as their own lines.'
      : '- Leave out furigana / ruby (the small readings printed beside kanji) and page numbers.',
    '- No commentary, notes or descriptions of the picture. A picture with no readable text has an empty `lines`.',
    '- `confidence`: 0 to 1, how sure you are of the line.',
    '- `doubts`: only the characters you are unsure of, as `at` (0-based character index in the line) and `alts` (other characters it could be, most likely first).',
    '- `box`: the line\'s bounds as [x0, y0, x1, y1], each 0 to 1000 relative to the picture\'s width and height.',
    `- Answer with \`regions\`: one entry per picture, with \`image\` its number (1${count > 1 ? `–${count}` : ''}).`,
  ].join('\n');
}

const LINE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    vertical: { type: 'boolean' },
    confidence: { type: 'number' },
    box: { type: 'array', items: { type: 'number' } },
    doubts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at: { type: 'integer' }, alts: { type: 'array', items: { type: 'string' } } },
        required: ['at', 'alts'],
      },
    },
  },
  required: ['text'],
};

/** The JSON schema the model answers in (Gemini `responseSchema`, an Anthropic tool, OpenAI `json_schema`). */
export const AI_OCR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { image: { type: 'integer' }, lines: { type: 'array', items: LINE_SCHEMA } },
        required: ['image', 'lines'],
      },
    },
  },
  required: ['regions'],
};

const optionalNumber = z.number().finite().nullable().optional();
const LineReply = z.object({
  text: z.string(),
  vertical: z.boolean().nullable().optional(),
  confidence: optionalNumber,
  box: z.array(z.number()).nullable().optional(),
  doubts: z.array(z.object({ at: z.number(), alts: z.array(z.string()) })).nullable().optional(),
});
export const AiOcrReply = z.object({
  regions: z.array(z.object({ image: optionalNumber, lines: z.array(LineReply) })),
});
export type AiOcrReplyShape = z.infer<typeof AiOcrReply>;
type LineReplyShape = z.infer<typeof LineReply>;

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const INVISIBLE = /[​-‍⁠﻿]/gu;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A model box (0–1000) in pixels, or null when it is not a usable one. */
function pixelBox(box: readonly number[] | null | undefined, width: number, height: number): [number, number, number, number] | null {
  if (!box || box.length !== 4 || box.some((v) => !Number.isFinite(v))) return null;
  const [x0, y0, x1, y1] = box.map((v) => clamp(v, 0, 1000) / 1000);
  if (x1 - x0 < 0.002 || y1 - y0 < 0.002) return null;
  return [x0 * width, y0 * height, x1 * width, y1 * height];
}

/** No box from the model: the line's share of the picture, in reading order. */
function bandBox(index: number, count: number, vertical: boolean, width: number, height: number): [number, number, number, number] {
  if (vertical) {
    const w = width / count;
    return [width - (index + 1) * w, 0, width - index * w, height];
  }
  const h = height / count;
  return [0, index * h, width, (index + 1) * h];
}

/** One line's characters, with the model's doubts as unsure candidates (undefined when it doubted nothing). */
function doubtChars(text: string, confidence: number, doubts: LineReplyShape['doubts']): OcrChar[] | undefined {
  const chars = [...text];
  const byIndex = new Map<number, string[]>();
  for (const doubt of doubts ?? []) {
    if (!Number.isInteger(doubt.at) || doubt.at < 0 || doubt.at >= chars.length) continue;
    const alts = [...new Set(doubt.alts.map((a) => a.trim()).filter((a) => [...a].length === 1 && a !== chars[doubt.at]))].slice(0, 5);
    if (alts.length) byIndex.set(doubt.at, alts);
  }
  if (!byIndex.size) return undefined;
  return chars.map((ch, i) => {
    const alts = byIndex.get(i);
    if (!alts) return { ch, p: confidence, alts: [] };
    const share = (1 - AI_OCR_DOUBT_P) / alts.length;
    return { ch, p: AI_OCR_DOUBT_P, alts: alts.map((alt) => ({ ch: alt, p: share })) };
  });
}

/**
 * One picture's reply as router lines. A line the model wrote across a line
 * break is split; a line with no confidence is high-but-unverified; every line
 * is floored at the router's fallback bar, so a local engine never re-reads a
 * crop of an approximate box and outvotes the model (AI wins where they
 * disagree) — the model's doubts still surface as unsure characters.
 */
export function aiReplyToLines(
  lines: readonly LineReplyShape[],
  size: { width: number; height: number },
  orientation?: AiOcrReadOptions['orientation'],
): EngineLine[] {
  const flat = lines.flatMap((line) => line.text.replace(INVISIBLE, '').split(/\r?\n/).map((text, i, all) => ({
    ...line,
    text: text.trim(),
    // A box or doubts that covered several lines no longer fit one of them.
    ...(all.length > 1 ? { box: null, doubts: null } : {}),
  }))).filter((line) => line.text);
  return flat.map((line, index) => {
    const vertical = typeof line.vertical === 'boolean'
      ? line.vertical
      : orientation === 'vertical' || (orientation !== 'horizontal' && size.height > size.width * 1.5 && CJK.test(line.text));
    const reported = typeof line.confidence === 'number' ? clamp(line.confidence, 0, 1) : AI_OCR_UNVERIFIED_CONFIDENCE;
    const confidence = clamp(reported, OCR_LINE_FALLBACK_CONFIDENCE, 0.99);
    const chars = doubtChars(line.text, confidence, line.doubts);
    return {
      text: line.text,
      box: pixelBox(line.box, size.width, size.height) ?? bandBox(index, flat.length, vertical, size.width, size.height),
      vertical,
      confidence,
      ...(chars ? { chars } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// The call

export interface AiVisionDeps {
  call: typeof callAiProviderJson;
  /** May a picture go now, and to which entry (`aiOcrVisionStore.ts`). */
  plan(opts: { check?: boolean }): AiOcrVisionPlan | null;
}

export function defaultAiVisionDeps(): AiVisionDeps {
  return { call: callAiProviderJson, plan: (opts) => resolveAiOcrVisionPlan(opts) };
}

/** Output room for `count` pictures: generous, because reasoning models spend it before answering. */
function outputTokensFor(count: number): number {
  return Math.min(16_384, 6_000 + 2_000 * (count - 1));
}

/**
 * Read several pictures (a page's speech bubbles, a book spread's columns) in
 * as few calls as possible: lines per picture, in the order given. Throws an
 * `AiProviderRuntimeError` (cancelled, cloud-disabled, vision-unsupported, …).
 */
export async function readRegionsWithAiVision(
  images: readonly RouterImage[],
  providerId: AiProviderId,
  opts: AiOcrReadOptions,
  deps: Pick<AiVisionDeps, 'call'> = defaultAiVisionDeps(),
): Promise<EngineLine[][]> {
  const out: EngineLine[][] = [];
  for (let start = 0; start < images.length; start += AI_OCR_MAX_IMAGES_PER_CALL) {
    if (opts.signal?.aborted) throw new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
    const chunk = images.slice(start, start + AI_OCR_MAX_IMAGES_PER_CALL);
    const parts = chunk.map((image) => prepareAiOcrImage(image, providerId));
    const reply = await deps.call(providerId, '', buildAiOcrPrompt(opts, chunk.length), AI_OCR_RESPONSE_SCHEMA, AiOcrReply, {
      feature: 'ocrVision',
      images: parts,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0,
      timeoutMs: Math.max(opts.budgetMs ?? 0, AI_OCR_TIMEOUT_MS[opts.purpose]),
      maxOutputTokens: outputTokensFor(chunk.length),
      context: 'The AI reader',
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    const regions = reply.regions;
    // Matched by the number the model gave; by position when it gave none (or one picture).
    const byNumber = new Map<number, (typeof regions)[number]>();
    regions.forEach((region) => {
      if (typeof region.image === 'number' && !byNumber.has(region.image)) byNumber.set(region.image, region);
    });
    chunk.forEach((image, i) => {
      const region = chunk.length === 1 ? regions[0] : byNumber.get(i + 1) ?? (byNumber.size ? undefined : regions[i]);
      out.push(aiReplyToLines(region?.lines ?? [], image, opts.orientation));
    });
  }
  return out;
}

/** CJK lines join without a space when a line crop is read as one line. */
function joinAsOneLine(lines: readonly EngineLine[]): string {
  const texts = lines.map((line) => line.text);
  return texts.join(texts.every((t) => CJK.test(t)) ? '' : ' ');
}

/**
 * The router provider for "Always": reads any language, leads the defaults,
 * and makes ONE call per picture whatever the router asks of it (every
 * candidate language gets the same memoised read). No per-line fallback use:
 * it is always the primary when present, and the router never sends a primary
 * its own lines.
 */
export function aiVisionOcrProvider(
  providerId: AiProviderId,
  opts: AiOcrReadOptions,
  deps: Pick<AiVisionDeps, 'call'> = defaultAiVisionDeps(),
): OcrProvider & { readonly aiError?: AiProviderErrorCode } {
  const reads = new Map<RouterImage, Promise<EngineLine[]>>();
  let failure: AiProviderErrorCode | undefined;
  const readOnce = (image: RouterImage, orientation: AiOcrReadOptions['orientation']): Promise<EngineLine[]> => {
    let read = reads.get(image);
    if (!read) {
      read = readRegionsWithAiVision([image], providerId, { ...opts, orientation }, deps)
        .then((all) => all[0] ?? [])
        .catch((err: unknown) => {
          failure = errorCode(err);
          throw err;
        });
      reads.set(image, read);
    }
    return read;
  };
  return {
    /** Why the model's read failed, once it has (the router only logs it). */
    get aiError() {
      return failure;
    },
    id: aiOcrEngineId(providerId),
    langs: 'any',
    tier: -5,
    available: () => true,
    readPage: (image, _lang, { vertical }) => readOnce(image, vertical === true ? 'vertical' : vertical === false ? 'horizontal' : opts.orientation),
    async readLine(image, _lang, { vertical }) {
      const lines = await readOnce(image, vertical ? 'vertical' : 'horizontal');
      const text = joinAsOneLine(lines);
      if (!text) return null;
      return { text, box: [0, 0, image.width, image.height], vertical, confidence: meanLineConfidence(lines) ?? AI_OCR_UNVERIFIED_CONFIDENCE };
    },
  };
}

// ---------------------------------------------------------------------------
// Merging a check into a local read

/** Share of characters two reads have in common (0–1), order-free. */
function overlap(a: string, b: string): number {
  const left = [...a.replace(/\s+/g, '')];
  const right = [...b.replace(/\s+/g, '')];
  if (!left.length || !right.length) return 0;
  const counts = new Map<string, number>();
  for (const ch of left) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let shared = 0;
  for (const ch of right) {
    const n = counts.get(ch) ?? 0;
    if (n > 0) {
      shared += 1;
      counts.set(ch, n - 1);
    }
  }
  return shared / Math.max(left.length, right.length);
}

const same = (a: string, b: string): boolean => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

/**
 * The model's read merged into a local one: the model's text wins wherever
 * they disagree; where a line agrees, the local line stays (boxes, per-character
 * data) and is now confirmed, so its doubts are cleared. A line keeps the local
 * box when the two reads have the same lines and that line is recognisably the
 * same one. An empty AI read changes nothing.
 */
export function mergeAiRead<R extends OcrRouterResult>(
  local: R,
  aiLines: readonly EngineLine[],
  engine: string,
  detectLang?: (text: string) => OcrLangId,
): R {
  if (!aiLines.length) return local;
  const own = local.ok ? local.lines : [];
  const aligned = own.length === aiLines.length;
  const lines: OcrRouterLine[] = aiLines.map((ai, i) => {
    const mine = aligned ? own[i] : undefined;
    if (mine && same(mine.text, ai.text)) {
      const confidence = Math.max(mine.confidence, ai.confidence);
      return {
        ...mine,
        confidence,
        ...(mine.chars ? { chars: mine.chars.map((c) => ({ ...c, p: Math.max(c.p, confidence) })) } : {}),
        consulted: [...new Set([...mine.consulted, engine])],
      };
    }
    const keepBox = mine && overlap(mine.text, ai.text) >= 0.5;
    return {
      text: ai.text,
      box: keepBox ? mine.box : ai.box,
      vertical: keepBox ? mine.vertical : ai.vertical,
      confidence: ai.confidence,
      engine,
      ...(ai.chars ? { chars: ai.chars.map((c) => ({ ...c, engine })) } : {}),
      consulted: mine ? [...new Set([...mine.consulted, engine])] : [engine],
    };
  });
  const text = lines.map((l) => l.text).join('\n').trim();
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line.engine, (counts.get(line.engine) ?? 0) + [...line.text].length);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? engine;
  const confidence = meanLineConfidence(lines);
  // The model read it, so a language no local engine reads is no longer a reason to distrust it.
  const { error: _error, missing: _missing, timedOut: _timedOut, ...rest } = local;
  return {
    ...rest,
    ok: Boolean(text),
    text,
    lines,
    ...(confidence !== undefined ? { confidence } : {}),
    engine: majority,
    engines: [...new Set([...local.engines, engine])],
    lang: detectLang ? detectLang(text) : local.lang,
    unsure: unsureCharsOf(lines),
    ...(!text ? { error: 'empty' as const } : {}),
  } as R;
}

/** A read, plus why the model did not take part when it was asked to. */
export type AiCheckedRead<R extends OcrRouterResult> = R & { aiError?: AiProviderErrorCode };

function errorCode(err: unknown): AiProviderErrorCode {
  return err instanceof AiProviderRuntimeError ? err.code : 'network';
}

/**
 * Ask the model about a picture a local engine already read (or could not):
 * one call, merged by `mergeAiRead`. A failed or empty reply returns the local
 * read untouched, with `aiError` set when it failed.
 */
export async function checkWithAiVision<R extends OcrRouterResult>(
  image: RouterImage,
  opts: OcrRouterOptions & { furigana?: boolean },
  local: R,
  providerId: AiProviderId,
  deps: Pick<AiVisionDeps, 'call'> = defaultAiVisionDeps(),
  detectLang?: (text: string) => OcrLangId,
): Promise<AiCheckedRead<R>> {
  try {
    const [lines = []] = await readRegionsWithAiVision([image], providerId, opts, deps);
    return mergeAiRead(local, lines, aiOcrEngineId(providerId), detectLang);
  } catch (err) {
    if (!(err instanceof AiProviderRuntimeError && err.code === 'cancelled')) console.warn('[ocrAiVision] the AI reader failed', err);
    return { ...local, aiError: errorCode(err) };
  }
}

/**
 * The router call with "Read text with AI" applied, by the mode the learner
 * chose. `run` is the router entry the surface uses (`recognizeWithRouter`,
 * `recognizeLineWithRouter`); with the mode Off it is called exactly as before.
 */
export async function withAiVision<R extends OcrRouterResult>(
  image: RouterImage,
  opts: OcrRouterOptions,
  deps: RouterDeps,
  run: (image: RouterImage, opts: OcrRouterOptions, deps: RouterDeps) => Promise<R>,
  ai: AiVisionDeps = defaultAiVisionDeps(),
): Promise<AiCheckedRead<R>> {
  let plan: AiOcrVisionPlan | null = null;
  try {
    plan = ai.plan({});
  } catch {
    plan = null;
  }
  if (!plan) return run(image, opts, deps);
  const detect = (text: string): OcrLangId => deps.detectLang(text, opts.langs);
  if (plan.mode === 'always') {
    const provider = aiVisionOcrProvider(plan.providerId, opts, ai);
    const read = await run(image, opts, { ...deps, providers: [provider, ...deps.providers] });
    if (read.ok || opts.signal?.aborted) return read;
    // The model failed (offline, refused, over the spending limit) or saw no text:
    // the local engines read as before.
    const local = await run(image, opts, deps);
    return provider.aiError ? { ...local, aiError: provider.aiError } : local;
  }
  const local = await run(image, opts, deps);
  if (opts.signal?.aborted || !aiOcrCheckWanted(local)) return local;
  return checkWithAiVision(image, opts, local, plan.providerId, ai, detect);
}
