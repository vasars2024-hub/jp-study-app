/**
 * Shared ReadingLens capture and depth contract.
 *
 * The screen overlay is the first consumer, but captures can also come from
 * clipboard text or imported images. Keeping the envelope here means those
 * sources can reach the same compact Lexicon handoff and future Reading
 * workspace without adding another renderer/main-specific shape.
 */

import {
  classifyLexiconInput,
  resolveLexiconInput,
  type LexiconInputResolution,
} from './lexiconWorkbench';

export const READING_LENS_CONTRACT_VERSION = 1 as const;

export const READING_LENS_DEPTHS = ['quick', 'compact', 'workspace'] as const;
export type ReadingLensDepth = (typeof READING_LENS_DEPTHS)[number];
export type ReadingLensDepthRequest = ReadingLensDepth | 'auto';

export const READING_LENS_SOURCES = ['screen', 'clipboard', 'image', 'text'] as const;
export type ReadingLensSource = (typeof READING_LENS_SOURCES)[number];

export type ReadingLensEngine = 'auto' | 'manga' | 'web' | 'none' | 'import';

export interface ReadingLensLine {
  text: string;
  /** [x, y, width, height], relative to the captured region. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
}

export interface ReadingLensCapture {
  schemaVersion: typeof READING_LENS_CONTRACT_VERSION;
  /** Stable for a capture handoff; OCR hashes are preferred when available. */
  captureId: string;
  source: ReadingLensSource;
  /** Optional human/source context, never required for a quick capture. */
  sourceLabel: string;
  sourceRef: string;
  capturedAt: number;
  language: string;
  engine: ReadingLensEngine;
  hash: string;
  text: string;
  lines: ReadingLensLine[];
  /** Bounded image evidence for a card or workspace handoff. */
  screenshotDataUrl?: string;
}

export interface ReadingLensCaptureInput {
  captureId?: unknown;
  source?: unknown;
  sourceLabel?: unknown;
  sourceRef?: unknown;
  capturedAt?: unknown;
  language?: unknown;
  /** `lang` is accepted for direct adoption of the current OCR result. */
  lang?: unknown;
  engine?: unknown;
  hash?: unknown;
  text?: unknown;
  lines?: unknown;
  screenshotDataUrl?: unknown;
}

export type ReadingLensWorkflow =
  | {
      depth: 'quick';
      target: 'capture';
      capture: ReadingLensCapture;
    }
  | {
      depth: 'compact';
      target: 'lexicon';
      capture: ReadingLensCapture;
      input: LexiconInputResolution;
    }
  | {
      depth: 'workspace';
      target: 'reading';
      capture: ReadingLensCapture;
      input: LexiconInputResolution;
    };

const MAX_CAPTURE_ID = 160;
const MAX_SOURCE_LABEL = 240;
const MAX_SOURCE_REF = 1_000;
const MAX_LANGUAGE = 24;
const MAX_HASH = 128;
const MAX_TEXT = 20_000;
const MAX_LINE_COUNT = 512;
const MAX_LINE_TEXT = 2_000;
const MAX_BOX_COORD = 100_000;
/** Matches the bounded screenshot emitted by the screen-OCR service. */
const MAX_SCREENSHOT_DATA_URL = 1_250_000;

const DEFAULT_SOURCE_LABEL: Record<ReadingLensSource, string> = {
  screen: 'screen',
  clipboard: 'clipboard',
  image: 'image',
  text: 'text',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').normalize('NFKC').trim().slice(0, limit);
}

function cleanToken(value: unknown, limit: number): string {
  return Array.from(cleanText(value, limit))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
}

function screenshotDataUrlOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_SCREENSHOT_DATA_URL) return undefined;
  const screenshot = value.trim();
  return /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/iu.test(screenshot)
    ? screenshot
    : undefined;
}

function sourceOf(value: unknown): ReadingLensSource {
  return READING_LENS_SOURCES.includes(value as ReadingLensSource)
    ? (value as ReadingLensSource)
    : 'screen';
}

function engineOf(value: unknown, source: ReadingLensSource): ReadingLensEngine {
  if (value === 'auto' || value === 'manga' || value === 'web' || value === 'none' || value === 'import') {
    return value;
  }
  return source === 'screen' ? 'auto' : 'import';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLines(value: unknown): ReadingLensLine[] {
  if (!Array.isArray(value)) return [];
  const lines: ReadingLensLine[] = [];

  for (const raw of value.slice(0, MAX_LINE_COUNT)) {
    if (!isRecord(raw)) continue;
    const text = cleanText(raw.text, MAX_LINE_TEXT);
    const rawBox = raw.box;
    if (!text || !Array.isArray(rawBox) || rawBox.length !== 4 || rawBox.some((n) => !finite(n))) continue;

    const [x, y, width, height] = rawBox as number[];
    if (width <= 0 || height <= 0) continue;
    lines.push({
      text,
      box: [
        clamp(x, 0, MAX_BOX_COORD),
        clamp(y, 0, MAX_BOX_COORD),
        clamp(width, 1, MAX_BOX_COORD),
        clamp(height, 1, MAX_BOX_COORD),
      ],
      vertical: raw.vertical === true,
      confidence: finite(raw.confidence) ? clamp(raw.confidence, 0, 1) : 0,
    });
  }

  return lines;
}

/**
 * Join OCR lines into a passage without inserting spaces inside CJK text.
 * Latin/Cyrillic words receive a separator when two lines would otherwise be
 * welded together.
 */
export function joinReadingLensLines(lines: readonly Pick<ReadingLensLine, 'text'>[]): string {
  const isCjk = (value: string): boolean => /[\u3040-\u30ff\u3400-\u9fff々ー]/u.test(value);
  return lines.reduce((acc, line) => {
    const next = cleanText(line.text, MAX_LINE_TEXT);
    if (!next) return acc;
    if (!acc) return next;
    const needsSpace = /[\p{Letter}\p{Number}]$/u.test(acc) && /^[\p{Letter}\p{Number}]/u.test(next);
    const first = next[0] ?? '';
    return needsSpace && !isCjk(acc.slice(-1)) && !isCjk(first) ? `${acc} ${next}` : acc + next;
  }, '');
}

/**
 * Normalize an untrusted capture at the boundary where it becomes reusable.
 * Empty captures are rejected; malformed lines and oversized screenshot
 * evidence are dropped rather than allowed to poison a later handoff.
 */
export function normalizeReadingLensCapture(
  value: unknown,
  now = Date.now(),
): ReadingLensCapture | null {
  if (!isRecord(value)) return null;

  const source = sourceOf(value.source);
  const lines = normalizeLines(value.lines);
  const text = cleanText(value.text, MAX_TEXT) || cleanText(joinReadingLensLines(lines), MAX_TEXT);
  if (!text) return null;

  const safeNow = finite(now) ? now : Date.now();
  const capturedAt = finite(value.capturedAt) && value.capturedAt > 0 ? value.capturedAt : safeNow;
  const hash = cleanToken(value.hash, MAX_HASH);
  const explicitId = cleanToken(value.captureId, MAX_CAPTURE_ID);
  const captureId = explicitId || (hash ? `reading-lens:${hash}` : `reading-lens:${source}:${Math.round(capturedAt)}`);
  const screenshotDataUrl = screenshotDataUrlOf(value.screenshotDataUrl);

  return {
    schemaVersion: READING_LENS_CONTRACT_VERSION,
    captureId,
    source,
    sourceLabel: cleanToken(value.sourceLabel, MAX_SOURCE_LABEL) || DEFAULT_SOURCE_LABEL[source],
    sourceRef: cleanToken(value.sourceRef, MAX_SOURCE_REF),
    capturedAt,
    language: cleanToken(value.language ?? value.lang, MAX_LANGUAGE) || 'ja',
    engine: engineOf(value.engine, source),
    hash,
    text,
    lines,
    ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
  };
}

/** The next useful depth for a capture after the quick result is visible. */
export function recommendedReadingLensDepth(text: string): ReadingLensDepth {
  const kind = classifyLexiconInput(text);
  return kind === 'empty' ? 'quick' : kind === 'paragraph' || kind === 'document' ? 'workspace' : 'compact';
}

/**
 * Resolve the next handoff without opening a route or crossing IPC. The caller
 * can render the quick capture locally, send compact text to Lexicon, or pass a
 * paragraph/document envelope to the future Reading workspace consumer.
 */
export function resolveReadingLensWorkflow(
  capture: ReadingLensCapture,
  requested: ReadingLensDepthRequest = 'auto',
): ReadingLensWorkflow {
  const input = resolveLexiconInput(capture.text);
  if (!capture.text.trim() || requested === 'quick') {
    return { depth: 'quick', target: 'capture', capture };
  }

  const depth = requested === 'auto' ? recommendedReadingLensDepth(capture.text) : requested;
  if (depth === 'workspace') {
    return { depth, target: 'reading', capture, input };
  }
  return { depth: 'compact', target: 'lexicon', capture, input };
}
