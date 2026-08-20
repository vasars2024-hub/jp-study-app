/**
 * The transport that turns a ReadingLens capture into a Reading-workspace read.
 *
 * `resolveReadingLensWorkflow` has been able to say "this capture is
 * paragraph-scale, send it to the Reading workspace" since the contract was
 * written, and nothing has ever acted on that answer. `shared/lexiconHandoff.ts`
 * closed the word/sentence half and said so explicitly in its own header — the
 * passage target "still has no real receiving surface". This is that half.
 *
 * It is deliberately the same shape as the Lexicon lane rather than a new one:
 * main-owned memory, bounded, expiring, single-use, with a `staged` broadcast,
 * because the producing surface has the same two properties that forced that
 * design. The lens is its own `BrowserWindow`, destroyed the moment a capture
 * lands, and `popOut` takes a section name and nothing else.
 *
 * Two differences from the Lexicon lane, both deliberate:
 *
 * - **A passage is large.** The lookup lane caps text at 400 characters because
 *   anything longer is by definition not a lookup. A passage is the opposite
 *   case, so the cap here is the same 20 KB the capture normalizer already
 *   applies, and the line array is bounded separately.
 * - **The TTL is longer.** Five minutes rather than two. Opening the Reading
 *   workspace can mean mounting a lazy route in a pop-out that was not running,
 *   and unlike a search box a passage is worth arriving slightly late.
 */

import { classifyLexiconInput, type LexiconInputKind } from './lexiconWorkbench';
import {
  READING_LENS_SOURCES,
  resolveReadingLensWorkflow,
  type ReadingLensCapture,
  type ReadingLensSource,
} from './readingLens';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  type ReadingWorkspaceRoute,
} from './readingWorkspace';

export const READING_PASSAGE_HANDOFF_CHANNELS = {
  stage: 'readingPassageHandoff:stage',
  take: 'readingPassageHandoff:take',
  /**
   * Main → every window, after a passage is accepted.
   *
   * Not optional polish, for the reason the Lexicon lane records: `popOut`
   * focuses an *existing* Reading window rather than creating a second one, so
   * the common case after the first handoff is a consumer that is already
   * mounted and would never look again on its own.
   */
  staged: 'readingPassageHandoff:staged',
} as const;

/** How long an unclaimed passage survives in main. */
export const READING_PASSAGE_HANDOFF_TTL_MS = 5 * 60_000;

/** The ceiling on staged passage text, applied before classification. */
export const READING_PASSAGE_HANDOFF_TEXT_MAX = 20_000;

/** The ceiling on retained OCR lines; the joined text is the source of truth. */
export const READING_PASSAGE_HANDOFF_LINES_MAX = 400;

const LINE_TEXT_MAX = 2_000;
const SOURCE_LABEL_MAX = 120;
const CAPTURE_ID_MAX = 160;
const LANGUAGE_MAX = 40;

/**
 * The scales the Reading workspace accepts.
 *
 * Exactly the complement of `LEXICON_HANDOFF_KINDS`: a word or a sentence has a
 * Lexicon destination and is refused here, so the two lanes cannot both claim
 * the same capture and no capture is left with neither.
 */
export const READING_PASSAGE_HANDOFF_KINDS = ['paragraph', 'document'] as const;
export type ReadingPassageHandoffKind = (typeof READING_PASSAGE_HANDOFF_KINDS)[number];

export type ReadingPassageHandoffFailureCode =
  | 'invalid-request'
  | 'not-passage-scale'
  | 'bridge-unavailable';

/** What a producer asks for. */
export interface ReadingPassageHandoffRequest {
  text: string;
  source: ReadingLensSource;
  sourceLabel?: string;
  captureId?: string;
  language?: string;
  /** OCR line texts, in reading order; the reader falls back to `text`. */
  lines?: string[];
}

/** What main holds, and what a claim hands back. */
export interface ReadingPassageHandoff {
  route: ReadingWorkspaceRoute;
  text: string;
  kind: ReadingPassageHandoffKind;
  lines: string[];
  source: ReadingLensSource;
  sourceLabel: string;
  captureId: string;
  language: string;
  stagedAt: number;
}

export type ReadingPassageHandoffStageResult =
  | { ok: true; kind: ReadingPassageHandoffKind; captureId: string }
  | { ok: false; code: ReadingPassageHandoffFailureCode };

/**
 * `handoff: null` is an ordinary empty claim, not a failure — the workspace asks
 * on every mount and almost always nothing is waiting.
 */
export type ReadingPassageHandoffTakeResult =
  | { ok: true; handoff: ReadingPassageHandoff | null }
  | { ok: false; code: ReadingPassageHandoffFailureCode };

/** Where a claimed passage is read. */
export const READING_PASSAGE_ROUTE: ReadingWorkspaceRoute = {
  version: READING_WORKSPACE_SCHEMA_VERSION,
  section: 'captures',
  intent: 'browse',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function sourceOf(value: unknown): ReadingLensSource {
  return (READING_LENS_SOURCES as readonly string[]).includes(value as string)
    ? (value as ReadingLensSource)
    : 'text';
}

function isPassageKind(kind: LexiconInputKind): kind is ReadingPassageHandoffKind {
  return (READING_PASSAGE_HANDOFF_KINDS as readonly string[]).includes(kind);
}

function normalizeLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const raw of value.slice(0, READING_PASSAGE_HANDOFF_LINES_MAX)) {
    const line = boundedText(raw, LINE_TEXT_MAX);
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Validates an untrusted stage request at the boundary where it enters main.
 *
 * The scale refusal is its own code for the same reason the Lexicon lane gives
 * one: it is the only failure a *correct* producer can hit, and a caller that
 * skipped `readingPassageHandoffFromCapture` deserves to be told which rule it
 * broke rather than a generic "invalid".
 */
export function normalizeReadingPassageHandoffRequest(
  value: unknown,
  now = Date.now(),
): ReadingPassageHandoff | null {
  if (!isRecord(value)) return null;
  if (typeof value.text !== 'string') return null;
  // Length before classification, on the raw string: the classifier counts code
  // points and would happily walk a megabyte first.
  if (value.text.length > READING_PASSAGE_HANDOFF_TEXT_MAX) return null;

  const text = value.text.trim();
  if (!text) return null;
  const kind = classifyLexiconInput(text);
  if (!isPassageKind(kind)) return null;

  const stagedAt = Number.isFinite(now) ? Number(now) : Date.now();
  return {
    route: READING_PASSAGE_ROUTE,
    text,
    kind,
    lines: normalizeLines(value.lines),
    source: sourceOf(value.source),
    sourceLabel: boundedText(value.sourceLabel, SOURCE_LABEL_MAX),
    captureId: boundedText(value.captureId, CAPTURE_ID_MAX),
    language: boundedText(value.language, LANGUAGE_MAX) || 'ja',
    stagedAt,
  };
}

/**
 * Says why a rejected request was rejected, without staging it.
 *
 * Kept beside the normalizer so the two cannot disagree about what "too small to
 * be a passage" means; the store calls both rather than inventing a second rule.
 */
export function readingPassageHandoffRejection(
  value: unknown,
): ReadingPassageHandoffFailureCode {
  if (!isRecord(value) || typeof value.text !== 'string') return 'invalid-request';
  if (value.text.length > READING_PASSAGE_HANDOFF_TEXT_MAX) return 'not-passage-scale';
  const text = value.text.trim();
  if (!text) return 'invalid-request';
  return isPassageKind(classifyLexiconInput(text)) ? 'invalid-request' : 'not-passage-scale';
}

/**
 * The one rule for turning a capture into a passage, so every producer agrees.
 *
 * `'auto'` is passed on purpose: the workflow's own scale decision is the gate,
 * so a word or sentence capture returns `null` here and the surface offers the
 * Lexicon gesture instead rather than a read main is about to refuse.
 */
export function readingPassageHandoffFromCapture(
  capture: ReadingLensCapture,
): ReadingPassageHandoffRequest | null {
  const workflow = resolveReadingLensWorkflow(capture);
  if (workflow.target !== 'reading') return null;
  const text = capture.text.trim();
  if (!text || text.length > READING_PASSAGE_HANDOFF_TEXT_MAX) return null;
  const lines = capture.lines.map((line) => line.text).filter(Boolean);
  return {
    text,
    source: capture.source,
    ...(capture.sourceLabel ? { sourceLabel: capture.sourceLabel } : {}),
    ...(capture.captureId ? { captureId: capture.captureId } : {}),
    ...(capture.language ? { language: capture.language } : {}),
    ...(lines.length ? { lines } : {}),
  };
}

function normalizeStagedHandoff(value: unknown): ReadingPassageHandoff | null {
  if (!isRecord(value)) return null;
  const text = boundedText(value.text, READING_PASSAGE_HANDOFF_TEXT_MAX);
  if (!text) return null;
  if (!(READING_PASSAGE_HANDOFF_KINDS as readonly string[]).includes(value.kind as string)) {
    return null;
  }
  const stagedAt = typeof value.stagedAt === 'number' && Number.isFinite(value.stagedAt)
    ? value.stagedAt
    : 0;
  return {
    route: READING_PASSAGE_ROUTE,
    text,
    kind: value.kind as ReadingPassageHandoffKind,
    lines: normalizeLines(value.lines),
    source: sourceOf(value.source),
    sourceLabel: boundedText(value.sourceLabel, SOURCE_LABEL_MAX),
    captureId: boundedText(value.captureId, CAPTURE_ID_MAX),
    language: boundedText(value.language, LANGUAGE_MAX) || 'ja',
    stagedAt,
  };
}

function failureCode(value: unknown): ReadingPassageHandoffFailureCode {
  const code = isRecord(value) ? value.code : null;
  return code === 'not-passage-scale' || code === 'bridge-unavailable'
    ? code
    : 'invalid-request';
}

/** Normalizes an IPC stage reply; anything unrecognizable is a failure. */
export function normalizeReadingPassageHandoffStageResult(
  value: unknown,
): ReadingPassageHandoffStageResult {
  if (!isRecord(value)) return { ok: false, code: 'invalid-request' };
  if (value.ok !== true) return { ok: false, code: failureCode(value) };
  if (!(READING_PASSAGE_HANDOFF_KINDS as readonly string[]).includes(value.kind as string)) {
    return { ok: false, code: 'invalid-request' };
  }
  return {
    ok: true,
    kind: value.kind as ReadingPassageHandoffKind,
    captureId: boundedText(value.captureId, CAPTURE_ID_MAX),
  };
}

/** Normalizes an IPC claim reply; an empty claim stays `ok`. */
export function normalizeReadingPassageHandoffTakeResult(
  value: unknown,
): ReadingPassageHandoffTakeResult {
  if (!isRecord(value)) return { ok: false, code: 'invalid-request' };
  if (value.ok !== true) return { ok: false, code: failureCode(value) };
  if (value.handoff === null || value.handoff === undefined) return { ok: true, handoff: null };
  const handoff = normalizeStagedHandoff(value.handoff);
  return handoff ? { ok: true, handoff } : { ok: false, code: 'invalid-request' };
}
