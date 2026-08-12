/**
 * Renderer side of the lens → Lexicon lookup bridge.
 *
 * Three calls at the two ends of one gesture: the lens stages and opens, the
 * Dictionary claims and subscribes. Nothing here rejects — a window whose
 * preload predates these methods, a rejected invoke and a malformed reply all
 * land in the same typed failure, following `agentImageStagingClient.ts`.
 *
 * A claim that finds nothing is `ok` with a `null` handoff, not a failure: the
 * Dictionary asks on every mount and the overwhelmingly common answer is "no
 * lookup is waiting".
 */

import {
  lexiconHandoffFromCapture,
  normalizeLexiconHandoffStageResult,
  normalizeLexiconHandoffTakeResult,
  type LexiconHandoffRequest,
  type LexiconHandoffStageResult,
  type LexiconHandoffTakeResult,
} from '../shared/lexiconHandoff';
import type { ReadingLensCapture } from '../shared/readingLens';

interface LexiconHandoffBridge {
  lexiconHandoffStage(request: LexiconHandoffRequest): Promise<unknown>;
  lexiconHandoffTake(): Promise<unknown>;
  onLexiconHandoffStaged(callback: () => void): () => void;
  popOut(section: string): Promise<void>;
}

function bridgeMethod<K extends keyof LexiconHandoffBridge>(
  name: K,
): LexiconHandoffBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<LexiconHandoffBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function' ? (method.bind(api) as LexiconHandoffBridge[K]) : null;
}

export async function stageLexiconHandoff(
  request: LexiconHandoffRequest,
): Promise<LexiconHandoffStageResult> {
  const method = bridgeMethod('lexiconHandoffStage');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeLexiconHandoffStageResult(await method(request));
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

export async function takeLexiconHandoff(): Promise<LexiconHandoffTakeResult> {
  const method = bridgeMethod('lexiconHandoffTake');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeLexiconHandoffTakeResult(await method());
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

/**
 * Subscribes to main's "a lookup is waiting" announcement.
 *
 * Returns a no-op unsubscribe when the bridge is absent, so a consumer can wire
 * it from an effect without branching. This is not optional polish: `popOut`
 * focuses an already-open Dictionary rather than remounting it, so without the
 * announcement the second lookup of a session would never arrive.
 */
export function onLexiconHandoffStaged(callback: () => void): () => void {
  const method = bridgeMethod('onLexiconHandoffStaged');
  if (!method) return () => undefined;
  try {
    return method(() => callback());
  } catch {
    return () => undefined;
  }
}

export type LexiconHandoffOutcome =
  | 'handed-off'
  | 'not-lexicon-scale'
  | 'stage-failed'
  | 'open-failed';

/**
 * The whole gesture: stage, then open — in that order, and the order matters.
 *
 * Staging first is what `agentContextHandoff.ts` learned to do: if opening the
 * Dictionary fails, the caller hears `open-failed` rather than being told the
 * gesture landed, and nothing has been navigated to a window that never
 * appeared. Opening first would show an empty search box and then decide whether
 * to fill it.
 *
 * `not-lexicon-scale` is returned rather than announced as an error. A paragraph
 * capture is not a broken lookup, it is a capture whose destination is the
 * Reading workspace target that has no consumer yet, and the producing surface
 * hides the gesture for exactly that reason.
 */
export async function handOffCaptureToLexicon(
  capture: ReadingLensCapture,
): Promise<LexiconHandoffOutcome> {
  const request = lexiconHandoffFromCapture(capture);
  if (!request) return 'not-lexicon-scale';

  const staged = await stageLexiconHandoff(request);
  if (!staged.ok) return staged.code === 'not-lexicon-scale' ? 'not-lexicon-scale' : 'stage-failed';

  const popOut = bridgeMethod('popOut');
  if (!popOut) return 'open-failed';
  try {
    // Main's pop-out route rather than the desktop-only `os:open` event, for the
    // reason `openAgentSurface` records: the lens is not a `DesktopShell`, so it
    // has no listener for that event, and `popOut` deduplicates by section.
    await popOut('dictionary');
    return 'handed-off';
  } catch {
    return 'open-failed';
  }
}
