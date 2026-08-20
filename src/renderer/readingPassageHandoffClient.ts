/**
 * Renderer side of the lens → Reading workspace passage bridge.
 *
 * The mirror image of `lexiconHandoffClient.ts`, and deliberately so: the lens
 * stages and opens, the workspace claims and subscribes. Nothing here rejects —
 * a window whose preload predates these methods, a rejected invoke and a
 * malformed reply all land in the same typed failure.
 *
 * A claim that finds nothing is `ok` with a `null` handoff, not a failure: the
 * workspace asks on every mount and the overwhelmingly common answer is "no
 * passage is waiting".
 */

import {
  normalizeReadingPassageHandoffStageResult,
  normalizeReadingPassageHandoffTakeResult,
  readingPassageHandoffFromCapture,
  type ReadingPassageHandoffRequest,
  type ReadingPassageHandoffStageResult,
  type ReadingPassageHandoffTakeResult,
} from '../shared/readingPassageHandoff';
import type { ReadingLensCapture } from '../shared/readingLens';

interface ReadingPassageHandoffBridge {
  readingPassageHandoffStage(request: ReadingPassageHandoffRequest): Promise<unknown>;
  readingPassageHandoffTake(): Promise<unknown>;
  onReadingPassageHandoffStaged(callback: () => void): () => void;
  popOut(section: string): Promise<void>;
}

function bridgeMethod<K extends keyof ReadingPassageHandoffBridge>(
  name: K,
): ReadingPassageHandoffBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<ReadingPassageHandoffBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function' ? (method.bind(api) as ReadingPassageHandoffBridge[K]) : null;
}

export async function stageReadingPassageHandoff(
  request: ReadingPassageHandoffRequest,
): Promise<ReadingPassageHandoffStageResult> {
  const method = bridgeMethod('readingPassageHandoffStage');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeReadingPassageHandoffStageResult(await method(request));
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

export async function takeReadingPassageHandoff(): Promise<ReadingPassageHandoffTakeResult> {
  const method = bridgeMethod('readingPassageHandoffTake');
  if (!method) return { ok: false, code: 'bridge-unavailable' };
  try {
    return normalizeReadingPassageHandoffTakeResult(await method());
  } catch {
    return { ok: false, code: 'bridge-unavailable' };
  }
}

/**
 * Subscribes to main's "a passage is waiting" announcement.
 *
 * Returns a no-op unsubscribe when the bridge is absent, so a consumer can wire
 * it from an effect without branching. Required, not polish: `popOut` focuses an
 * already-open Reading window rather than remounting it, so without the
 * announcement the second passage of a session would never arrive.
 */
export function onReadingPassageHandoffStaged(callback: () => void): () => void {
  const method = bridgeMethod('onReadingPassageHandoffStaged');
  if (!method) return () => undefined;
  try {
    return method(() => callback());
  } catch {
    return () => undefined;
  }
}

export type ReadingPassageHandoffOutcome =
  | 'handed-off'
  | 'not-passage-scale'
  | 'stage-failed'
  | 'open-failed';

/**
 * The whole gesture: stage, then open — in that order, and the order matters,
 * for the reason `lexiconHandoffClient.ts` records. If opening the workspace
 * fails the caller hears `open-failed` rather than being told the gesture
 * landed, and nothing has been navigated to a window that never appeared.
 */
export async function handOffCaptureToReadingWorkspace(
  capture: ReadingLensCapture,
): Promise<ReadingPassageHandoffOutcome> {
  const request = readingPassageHandoffFromCapture(capture);
  if (!request) return 'not-passage-scale';

  const staged = await stageReadingPassageHandoff(request);
  if (!staged.ok) return staged.code === 'not-passage-scale' ? 'not-passage-scale' : 'stage-failed';

  const popOut = bridgeMethod('popOut');
  if (!popOut) return 'open-failed';
  try {
    // Main's pop-out route rather than the desktop-only `os:open` event: the
    // lens is not a `DesktopShell`, so it has no listener for that event, and
    // `popOut` deduplicates by section.
    await popOut('reading');
    return 'handed-off';
  } catch {
    return 'open-failed';
  }
}
