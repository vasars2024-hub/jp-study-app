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
  type ReadingPassageHandoff,
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
 *
 * The retained claim is dropped first: a new stage is exactly the event that
 * makes the previous one stale, so the latch below can never serve an old
 * passage over the one that just arrived.
 */
export function onReadingPassageHandoffStaged(callback: () => void): () => void {
  const method = bridgeMethod('onReadingPassageHandoffStaged');
  if (!method) return () => undefined;
  try {
    return method(() => {
      retained = null;
      callback();
    });
  } catch {
    return () => undefined;
  }
}

/**
 * How long a claimed passage is re-served to a consumer that mounts again.
 *
 * Short on purpose. This is a remount window, not a second TTL: it must outlive
 * React's StrictMode effect replay (immediate) and a fast route swap, and it
 * must not outlive the user walking away and coming back.
 */
const RETAIN_MS = 5_000;

let retained: { promise: Promise<ReadingPassageHandoff | null>; at: number } | null = null;

/**
 * Claim the waiting passage, surviving a remount.
 *
 * A bare `take` is single-use in main, which is right — but it made the whole
 * gesture fail under StrictMode, and the failure was invisible in jsdom. The
 * dev double-invoke mounts the consumer, claims the passage into an effect that
 * is then thrown away, and remounts to find main empty; the passage is gone with
 * no error anywhere. So the claim is latched here for a moment, and any fresh
 * announcement clears the latch.
 *
 * The latch holds the *promise*, not its result, and that detail is the whole
 * fix. StrictMode's replay runs mount → cleanup → mount synchronously, so the
 * second call happens before the first take has resolved; a result-only latch is
 * still empty at that moment and issues a second take against a main that has
 * already handed the passage over.
 *
 * Main stays the owner of single-use — this never re-asks for a passage main has
 * already handed over, it only stops the renderer from losing one.
 */
export function claimReadingPassageHandoff(
  now = Date.now(),
): Promise<ReadingPassageHandoff | null> {
  if (retained && now - retained.at < RETAIN_MS) return retained.promise;
  const promise = takeReadingPassageHandoff().then(
    (result) => (result.ok ? result.handoff : null),
  );
  retained = { promise, at: now };
  return promise;
}

/** Test seam: drops the retained claim without touching main. */
export function __resetReadingPassageHandoffLatch(): void {
  retained = null;
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
