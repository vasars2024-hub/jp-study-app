/**
 * The transport that turns a ReadingLens capture into a Lexicon lookup.
 *
 * `resolveReadingLensWorkflow` has always been able to say "this capture is
 * word-scale, send it to Lexicon", and until now nothing acted on that answer:
 * its only caller hard-codes `'compact'` and uses the result to seed local
 * analysis text, so the `lexicon` target — and `resolveLexiconRoute`,
 * `LEXICON_WORKBENCH_ROUTE` and `LexiconLens` with it — had no consumer outside
 * their own tests. This is the missing half, and it is deliberately the lexical
 * half only: sentence → Workbench analysis and passage → Reading workspace still
 * have no real receiving surface and are not forced through Dictionary here.
 *
 * The route is the same fourth route `shared/agentImageStaging.ts` had to open,
 * and for the same reason: the lens is its own `BrowserWindow`, destroyed the
 * moment a capture lands, and `popOut` takes a section name and nothing else. A
 * renderer-held copy never reaches the Dictionary window, and the persisted
 * stores are the wrong place for a phrase the user looked at once. So this is
 * main-process memory: bounded, expiring, and **single-use**.
 *
 * It differs from the image lane in exactly one way, and the difference is not
 * an oversight. That lane is keyed by conversation because an Agent shell claims
 * by selecting one; there is only ever **one** Lexicon destination, so this is a
 * single slot and a second lookup replaces the first. An unclaimed handoff is by
 * definition one nobody navigated to, and reviving it later would drop a stale
 * word into a search box the user had moved on from.
 */

import {
  LEXICON_WORKBENCH_ROUTE,
  resolveLexiconInput,
  type LexiconInputKind,
  type LexiconLens,
  type LexiconRoute,
} from './lexiconWorkbench';
import {
  READING_LENS_SOURCES,
  resolveReadingLensWorkflow,
  type ReadingLensCapture,
  type ReadingLensSource,
} from './readingLens';

export const LEXICON_HANDOFF_CHANNELS = {
  stage: 'lexiconHandoff:stage',
  take: 'lexiconHandoff:take',
  /**
   * Main → every window, after a lookup is accepted.
   *
   * The claim cannot be a mount-time read alone. `popOut` focuses an *existing*
   * Dictionary window rather than creating a second one, so the common case is a
   * consumer that is already mounted and would otherwise never look again. This
   * is the same ordering defect the image lane's `staged` broadcast exists to
   * fix, arriving here before it could be rediscovered.
   */
  staged: 'lexiconHandoff:staged',
} as const;

/**
 * How long an unclaimed lookup survives in main.
 *
 * Much shorter than the image lane's ten minutes, because the gesture is much
 * shorter: staging is immediately followed by opening the Dictionary, and the
 * claim happens as that window paints. Anything still resident two minutes later
 * is a navigation that failed, not a user still deciding.
 */
export const LEXICON_HANDOFF_TTL_MS = 2 * 60_000;

/**
 * The ceiling on a staged lookup, applied *before* classification.
 *
 * `classifyLexiconInput` already calls anything past 280 code points a
 * paragraph, and paragraphs are refused below — so this is not the real scale
 * gate, it is the bound that keeps main from classifying a pasted novel in the
 * first place. Renderer input arriving in main gets a length check before it
 * gets a regex.
 */
export const LEXICON_HANDOFF_TEXT_MAX = 400;

/**
 * The scales a Lexicon lookup accepts.
 *
 * `empty` has nothing to look up; `paragraph` and `document` are exactly what
 * `resolveReadingLensWorkflow` routes to the Reading workspace instead, and
 * accepting them here would quietly answer the product question that target is
 * still waiting on by dumping a passage into a dictionary search box.
 */
export const LEXICON_HANDOFF_KINDS = ['character', 'word', 'sentence'] as const;
export type LexiconHandoffKind = (typeof LEXICON_HANDOFF_KINDS)[number];

const SOURCE_LABEL_MAX = 120;

export type LexiconHandoffFailureCode =
  | 'invalid-request'
  | 'not-lexicon-scale'
  | 'bridge-unavailable';

/** What a producer asks for. `source` describes where the text was captured. */
export interface LexiconHandoffRequest {
  text: string;
  source: ReadingLensSource;
  sourceLabel?: string;
}

export interface LexiconHandoffTakeRequest {
  lens: LexiconLens;
}

/** What main holds, and what a claim hands back. */
export interface LexiconHandoff {
  route: LexiconRoute;
  text: string;
  kind: LexiconHandoffKind;
  lens: LexiconLens;
  source: ReadingLensSource;
  sourceLabel: string;
  stagedAt: number;
}

export type LexiconHandoffStageResult =
  | { ok: true; kind: LexiconHandoffKind; lens: LexiconLens }
  | { ok: false; code: LexiconHandoffFailureCode };

/**
 * `handoff: null` is an ordinary empty claim, not a failure — the Dictionary
 * asks on every mount and almost always nothing is waiting.
 */
export type LexiconHandoffTakeResult =
  | { ok: true; handoff: LexiconHandoff | null }
  | { ok: false; code: LexiconHandoffFailureCode };

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

function isHandoffKind(kind: LexiconInputKind): kind is LexiconHandoffKind {
  return (LEXICON_HANDOFF_KINDS as readonly string[]).includes(kind);
}

/**
 * Validates an untrusted stage request at the boundary where it enters main.
 *
 * The scale refusal is a distinct code rather than a generic one because it is
 * the only failure a *correct* producer can hit: the lens offers the gesture
 * from the same capture the workspace target would claim, and a caller that
 * skipped `lexiconHandoffFromCapture` deserves to be told which rule it broke.
 */
export function normalizeLexiconHandoffRequest(
  value: unknown,
  now = Date.now(),
): LexiconHandoff | null {
  if (!isRecord(value)) return null;
  if (typeof value.text !== 'string') return null;
  // Length before classification, on the raw string: `resolveLexiconInput`
  // normalizes and would happily NFKC a megabyte first.
  if (value.text.length > LEXICON_HANDOFF_TEXT_MAX) return null;

  const resolved = resolveLexiconInput(value.text);
  if (!resolved.text || !isHandoffKind(resolved.kind)) return null;

  const source = sourceOf(value.source);
  const stagedAt = Number.isFinite(now) ? Number(now) : Date.now();
  return {
    route: LEXICON_WORKBENCH_ROUTE,
    text: resolved.text,
    kind: resolved.kind,
    lens: resolved.lens,
    source,
    sourceLabel: boundedText(value.sourceLabel, SOURCE_LABEL_MAX),
    stagedAt,
  };
}

/**
 * Says why a rejected request was rejected, without staging it.
 *
 * Kept beside the normalizer so the two cannot disagree about what "too big to
 * be a lookup" means; the store calls both rather than inventing a second rule.
 */
export function lexiconHandoffRejection(value: unknown): LexiconHandoffFailureCode {
  if (!isRecord(value) || typeof value.text !== 'string') return 'invalid-request';
  if (value.text.length > LEXICON_HANDOFF_TEXT_MAX) return 'not-lexicon-scale';
  const resolved = resolveLexiconInput(value.text);
  if (!resolved.text) return 'invalid-request';
  return isHandoffKind(resolved.kind) ? 'invalid-request' : 'not-lexicon-scale';
}

/**
 * The one rule for turning a capture into a lookup, so every producer agrees.
 *
 * This is what finally makes `resolveReadingLensWorkflow`'s `lexicon` target
 * load-bearing. `'auto'` is passed on purpose: the workflow's own scale decision
 * is the gate, so a paragraph capture returns `null` here and the surface hides
 * the gesture rather than offering a lookup that main is about to refuse.
 */
export function lexiconHandoffFromCapture(
  capture: ReadingLensCapture,
): LexiconHandoffRequest | null {
  const workflow = resolveReadingLensWorkflow(capture);
  if (workflow.target !== 'lexicon') return null;
  if (!isHandoffKind(workflow.input.kind)) return null;
  const text = workflow.input.text;
  if (!text || text.length > LEXICON_HANDOFF_TEXT_MAX) return null;
  return {
    text,
    source: capture.source,
    ...(capture.sourceLabel ? { sourceLabel: capture.sourceLabel } : {}),
  };
}

function normalizeStagedHandoff(value: unknown): LexiconHandoff | null {
  if (!isRecord(value)) return null;
  const text = boundedText(value.text, LEXICON_HANDOFF_TEXT_MAX);
  const kind = value.kind;
  const lens = value.lens;
  if (!text || value.route !== LEXICON_WORKBENCH_ROUTE) return null;
  if (!(LEXICON_HANDOFF_KINDS as readonly string[]).includes(kind as string)) return null;
  if (lens !== 'lookup' && lens !== 'translate') return null;
  const stagedAt = typeof value.stagedAt === 'number' && Number.isFinite(value.stagedAt)
    ? value.stagedAt
    : 0;
  return {
    route: LEXICON_WORKBENCH_ROUTE,
    text,
    kind: kind as LexiconHandoffKind,
    lens,
    source: sourceOf(value.source),
    sourceLabel: boundedText(value.sourceLabel, SOURCE_LABEL_MAX),
    stagedAt,
  };
}

function failureCode(value: unknown): LexiconHandoffFailureCode {
  return value === 'invalid-request' || value === 'not-lexicon-scale'
    ? value
    : 'bridge-unavailable';
}

/**
 * Renderer-side validation of what main handed back, symmetrical with every
 * other bridge here: a payload is not trusted because it arrived over IPC.
 */
export function normalizeLexiconHandoffTakeResult(value: unknown): LexiconHandoffTakeResult {
  if (!isRecord(value)) return { ok: false, code: 'bridge-unavailable' };
  if (value.ok === true) {
    return { ok: true, handoff: normalizeStagedHandoff(value.handoff) };
  }
  return { ok: false, code: failureCode(value.code) };
}

export function normalizeLexiconHandoffStageResult(value: unknown): LexiconHandoffStageResult {
  if (!isRecord(value)) return { ok: false, code: 'bridge-unavailable' };
  if (value.ok === true
    && (LEXICON_HANDOFF_KINDS as readonly string[]).includes(value.kind as string)
    && (value.lens === 'lookup' || value.lens === 'translate')) {
    return { ok: true, kind: value.kind as LexiconHandoffKind, lens: value.lens };
  }
  return { ok: false, code: failureCode(value.code) };
}
