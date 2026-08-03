/**
 * When a local-file open is accepted, does nothing, and never says so.
 *
 * ## The defect this exists for, measured rather than reasoned
 *
 * `POST /api/v1/directstream/play/localfile` returns **200 whether or not the preparation
 * it started survives**. The pinned sidecar cancels an in-flight preparation when a
 * `player.TerminatedEvent` arrives for that client id (`internal/directstream/stream.go`,
 * the `cs, ok := m.currentStream.Get()` branch of `listenToPlayerEvents`) — and that event
 * originates in the *client*, as the adopted player's `video-terminated`
 * (`video-core-events.ts`). Every later step of the preparation is then skipped
 * ("Skipping open step for cancelled preparation"), the POST completes 200, and **no
 * message of any kind is sent to the client**. The panel sits on "Opening local file"
 * forever.
 *
 * The adopted lifecycle effect (`video-core.tsx`, `useUpdateEffect` keyed on
 * `[state.playbackInfo?.id, waitForWatchHistory, shouldWaitForWatchHistory]`) dispatches
 * that event from its `if (!state.playbackInfo)` branch — i.e. **whenever it re-runs while
 * an open is still in flight**, which is exactly the window between our POST and the
 * `watch` payload. Two ways in, both real:
 *
 *  - **Deterministic, in a dev build.** `React.StrictMode` double-invokes effects on mount,
 *    so the branch runs once spuriously. Blanc's toolbox mounts the surface and issues the
 *    open in the same commit, so it loses this race *every time*.
 *    Measured: `docs/migration/proof/blanc-open-retry-20260801072500/` — mount at 1920 ms
 *    (the doubled `discord/presence/cancel` is that same branch running twice), POST at
 *    2000, `open-and-await` at 2018, `video-terminated` ×2 at 2112, POST 200 at 9177.
 *  - **Intermittent, in any build.** `waitForWatchHistory` and `shouldWaitForWatchHistory`
 *    are both derived from `serverStatus.settings.library.enableWatchContinuity`
 *    (`continuity.hooks.ts`), so a `/api/v1/status` that resolves *after* the open was
 *    issued flips a dep and runs the same branch. `StudyPlayerSlice.tsx` has called the
 *    local open "intermittent" in a comment since Phase 3 and three harnesses carry retries
 *    for it. This is that intermittency, named.
 *
 * ## Why the recovery is a re-open rather than a fix at the source
 *
 * The event comes from adopted code, which ADR-004 keeps unedited. Suppressing it would
 * also be wrong: `video-terminated` is *correct* when a player really goes away, and the
 * sidecar is right to act on it. What is missing is on our side — **the open has no failure
 * detection at all**, so a preparation that dies silently is indistinguishable from one that
 * is merely slow. That is true no matter what killed it, so the recovery here is deliberately
 * cause-agnostic: a dropped socket, a sidecar restart mid-open or a future upstream change
 * all present the same way and all want the same answer.
 *
 * A re-open works because `BeginOpen` clears `preparationCanceled` — proven end to end by
 * `blanc-player-open-retry-probe.mjs` step 2, which is also why every `blanc-player-harness`
 * run since 2026-08-01 reports `openAttempts: 2`. **That retry lived in the harnesses. It
 * belongs in the product**, which is the whole of this module.
 *
 * ## Silence, not elapsed time
 *
 * The deadline is measured from the **last sign of life**, not from the POST. A live
 * preparation reports its steps on the native-player channel (`updateOpenStepLocked` →
 * `openAndAwait`), so a big file whose metadata parse is genuinely slow keeps re-arming the
 * clock, while a cancelled one goes quiet immediately. A fixed total deadline would have to
 * choose between failing slow files and waiting a long time on dead ones.
 *
 * ## Where this lives, and why it moved
 *
 * Pure — and it now imports the open channel's queue deadline, which is the one number the two
 * halves of the recovery share; see {@link directstreamOpenPresumedDead}.
 *
 * Beside its only consumer (`StudyPlayerSlice.tsx`). It spent slices 24–35 in
 * `src/shared/` for one reason only — `src/media/**` was outside every `vitest.config.ts`
 * include glob, and a timing rule that cannot be tested is a timing rule that drifts, so
 * the rule was exiled to reach a test runner rather than because it belonged there.
 *
 * `vitest.config.ts` now collects `src/media/**\/*.test.ts` (2026-08-02), so the exile is
 * over: the rule sits with the component whose behaviour it describes and is covered in
 * place by `__tests__/directstreamOpenRecovery.test.ts`. Keep it a separate module rather
 * than inlining it into the component — `StudyPlayerSlice.tsx` pulls React and the adopted
 * VideoCore bundle, which no node-environment test can import.
 */
import { DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS } from '../shared/directstreamOpenChannel';

/** No word from the sidecar for this long means the preparation is not coming back. */
export const DIRECTSTREAM_OPEN_SILENCE_MS = 8_000;

/**
 * ## A SECOND failure this module does NOT cover, measured in slice 31 — read before extending
 *
 * `playbackArrived` is a terminal state below: the verdict returns `playing` for it
 * unconditionally. That is right about the *message* clock and incomplete about the open,
 * because **the `watch` payload is not playback — it is a promise of playback.**
 *
 * Measured twice in one run (`proof/retirement-step3-20260801083650`, `openStalls`):
 *
 * ```text
 * slice active, the study dock fully rendered ("Previous line … 1.50x … More")
 * <video> PRESENT     src blob:      readyState 0      networkState 0      buffered 0
 * ```
 *
 * `readyState 0` with `networkState 0` (`NETWORK_EMPTY`) is an element that has a
 * MediaSource attached and **has not begun to load anything** — nothing was ever appended to
 * the SourceBuffer. The open completed, the whole player rendered, and no media flowed. The
 * verdict short-circuits to `playing` at exactly that moment and disarms, so nothing detects
 * it and nothing reports it: what the user sees is the slice-24 panel again, reached from
 * the other side.
 *
 * ## A fix was attempted and REVERTED, and the reason is the warning
 *
 * The obvious shape is a second stage keyed on the element's own readiness — `playbackArrived`
 * starts a clock, `readyState >= 1` ends it, and a window with neither re-opens once. It was
 * built, unit-tested (six guards, all of which a restored pre-fix line failed) and driven:
 * `proof/retirement-step3-20260801084459`. **Phase E then failed with slice 29's exact
 * signature** — `allCues` holding only cue 0, `replay-cue` disabled, `next-cue` returning
 * cue 0 — on an otherwise quiet tree whose only change was that stage.
 *
 * That signature is what a mid-playback re-open produces. `BeginOpen` calls
 * `beginSubtitleSeek`, which **stops every active subtitle stream** and bumps the generation
 * (`internal/directstream/subtitles.go:316-334`), so a spurious recovery POST against a
 * healthy open restarts subtitle delivery from the new offset and the client is left holding
 * one cue. **A recovery whose action is destructive must prove the thing it is recovering
 * from is actually broken**, and "no `mediaReady` signal yet" is not that proof: it is equally
 * consistent with an element handle this code could not read. One run is not an attribution,
 * so this is recorded as a hazard rather than as a diagnosis.
 *
 * The revert was then confirmed twice (`proof/retirement-step3-20260801085237` and
 * `-20260801090448`, nine phases PASS each). Both runs **reproduced the stall above twice
 * each** and passed cue navigation anyway, which refutes the one reading that would have
 * exonerated the stage — that whatever produces the stall also thins cue delivery. It still
 * does not prove the stage caused the loss; that needs the stage re-applied and failed on
 * purpose.
 *
 * Whoever picks this up: make "cannot judge" a `waiting`, never a `reopen`, and gate the
 * whole stage on having observed a real element at least once. Then prove on a HEALTHY open
 * that the stage never fires, before proving it rescues a broken one — and that control now
 * has a fixture rather than a wish: any run whose `openStalls` is non-empty and whose phase E
 * passes is exactly the tree the stage must stay silent on.
 */

/**
 * Two POSTs total: the original and one recovery. A second recovery would be a loop — if a
 * re-open on a settled session also dies silently, the cause is not the race this module
 * was written for and hiding it behind more retries would only delay the report.
 */
export const DIRECTSTREAM_OPEN_MAX_ATTEMPTS = 2;

export type DirectstreamOpenProgress = {
  /** POSTs issued for THIS request so far. The first attempt is 1, never 0. */
  readonly attempts: number;
  /**
   * When the sidecar last showed it was alive for this request: the moment the POST was
   * issued, then every native-player message that follows it.
   */
  readonly lastSignalAt: number;
  /**
   * A `watch` payload has been applied, so the player has real playback info. NOTE: this is
   * a promise of playback, not playback — see the second block at the top of this file for
   * the failure that hides behind it and for the reverted attempt at covering it.
   */
  readonly playbackArrived: boolean;
};

/**
 * `playing` — nothing to do. `waiting` — still inside the silence window. `reopen` — issue
 * the request again. `failed` — tell the user; there are no attempts left.
 */
export type DirectstreamOpenVerdict = 'playing' | 'waiting' | 'reopen' | 'failed';

export function directstreamOpenVerdict(
  progress: DirectstreamOpenProgress,
  now: number,
  silenceMs: number = DIRECTSTREAM_OPEN_SILENCE_MS,
  maxAttempts: number = DIRECTSTREAM_OPEN_MAX_ATTEMPTS,
): DirectstreamOpenVerdict {
  // Checked first and unconditionally: an open that has already produced playback is not a
  // candidate for recovery even if a later reading of the clock says it went quiet. This is
  // also where the slice-31 failure hides — see the second block at the top of this file.
  if (progress.playbackArrived) return 'playing';
  if (now - progress.lastSignalAt < silenceMs) return 'waiting';
  return progress.attempts < maxAttempts ? 'reopen' : 'failed';
}

/**
 * The progress record for a re-open. Separate from the verdict so the component cannot
 * increment the count without also re-arming the clock — the two together are what stop
 * `reopen` from being returned again on the very next tick.
 */
export function directstreamOpenReopened(
  progress: DirectstreamOpenProgress,
  now: number,
): DirectstreamOpenProgress {
  return { attempts: progress.attempts + 1, lastSignalAt: now, playbackArrived: false };
}

/**
 * The recovery was REFUSED by `directstreamOpenChannel` — must this open be reported anyway?
 *
 * **A gate that can withhold the POST must not also withhold the REPORT.** Slice 44 wired the
 * channel, and a `busy` drop is a recovery that never leaves, never counts an attempt, and
 * therefore never advances `directstreamOpenVerdict` toward `failed`. Left alone that turns
 * the one case the channel cannot help with — an open POST that answers *never*, so the
 * channel stays busy forever — from "an error at ~16 s" into "a spinner, silently, forever".
 * That is the slice-24 defect arriving from a third direction, caused by its own fix.
 *
 * So the refusal is bounded by the same clock everything else here uses. Past the silence
 * window PLUS `DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS` — which is already this track's answer to
 * "how long may an open say nothing before it is presumed dead", and is the number the channel
 * releases a queued launch on — the outstanding POST is presumed dead and the caller says so
 * with the message exhausting the attempts would have reached.
 *
 * Deliberately **not** a licence to post: this returns whether to SPEAK, never whether to
 * send. The refusal stands; the channel is still the only thing that decides what leaves.
 */
export function directstreamOpenPresumedDead(
  progress: DirectstreamOpenProgress,
  now: number,
  silenceMs: number = DIRECTSTREAM_OPEN_SILENCE_MS,
  graceMs: number = DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS,
): boolean {
  if (progress.playbackArrived) return false;
  return now - progress.lastSignalAt >= silenceMs + graceMs;
}

/* ------------------------------------------------------------------------------------- *
 * STAGE 2 — the watch-with-no-media gap. Read this before changing the fire condition.
 * ------------------------------------------------------------------------------------- */

/**
 * The second stage, rebuilt against the two constraints the reverted attempt violated.
 *
 * **The RE-OPENING half of this is not wired, and is the second thing to be reverted here.
 * The REPORTING half ships — see `DIRECTSTREAM_MEDIA_REPORT_ONLY` below. Read all of this
 * before making it re-open again.**
 *
 * The control that justified wiring it: `replay-media-verdict.mjs` replays a run's recorded
 * 200 ms element series through this exact function. Across
 * `proof/retirement-step3-20260801092655` and `-20260801092956` it reported **four healthy
 * opens, zero fires; two real stalls, both fired at ~10.2 s** against a 43 s hang. It was
 * wired on that basis, and `proof/retirement-step3-20260801094543` failed phase E with the
 * destructive signature anyway.
 *
 * ## Two separate mistakes, and the second is the one that matters
 *
 * **1. The control was optimistic, and said it was conservative.** It proxies the clock's
 * start with "the first sample in which the element exists", which is LATE. The rule fires on
 * `now - watchArrivedAt >= silenceMs`, so a late start means a smaller elapsed time and the
 * replay fires LATER than the product. "Never fired" under replay was therefore weaker
 * evidence than it read as. Corrected in that tool's header.
 *
 * **2. The stage fired correctly and was destructive anyway.** This is the important one. In
 * the failing run's own `mediaSamples`, the stalled attempt holds the signature from 2 257 ms
 * and flips to `networkState 2` at 10 724 ms — the element beginning to load because the
 * recovery POST landed. **That is the rescue working.** But the harness abandons that attempt
 * at ~20.9 s and opens the file again, and phase E measures the NEXT attempt. A recovery POST
 * issued against attempt N can still be in flight when attempt N+1's stream goes live, and
 * `BeginOpen` → `beginSubtitleSeek` stops every active subtitle stream. Keying the record by
 * `requestId` stops the STATE leaking across attempts and does nothing about the REQUEST
 * already sent.
 *
 * So the lesson is not "find a better fire condition" — the fire condition was right. **A
 * recovery that races a re-open needs the POST itself to be abandonable**: a generation the
 * sidecar can reject, or a rule that never issues while a newer open for the same file is
 * outstanding.
 *
 * **Both now exist, and stage 2 still does not re-open.** Slice 44 wired the second
 * (`shared/directstreamOpenChannel.ts`) and sends the first
 * (`patches/seanime/0004-directstream-open-generation.patch`, slice 41). What has NOT changed
 * is the evidence: the two wired stage-2 implementations each failed phase E once, and no run
 * of any kind has been taken against the wired channel — so the thing that would justify
 * re-opening is still missing, and it is a live run, not a mechanism. Worse, the generation is
 * only half-live: patch 0004 is absent from `build-patched-sidecar.mjs`, so the sidecar this
 * app actually launches accepts the field and ignores it. Re-opening on the strength of a
 * refusal nobody has observed a server perform would be the third revert.
 *
 * Held to this file's own standard: the mechanism above is a hypothesis consistent with the
 * samples, not established — the PASSING wired run has a nearly identical stalled-attempt
 * timeline, so the difference is timing, which is also why it is intermittent. What is
 * established is the tally: **7 of 7 runs pass with nothing wired; the two different stage-2
 * implementations that have been wired have each failed phase E once.**
 *
 * ## What went wrong last time, in one line
 *
 * The reverted stage fired on the *absence* of a readiness signal, and absence is ambiguous:
 * "no `mediaReady` yet" is equally consistent with an element handle the code could not read.
 * A recovery POST calls `BeginOpen` → `beginSubtitleSeek`, which stops every active subtitle
 * stream, so an ambiguous read cost a healthy playback its cues.
 *
 * ## So this one fires on PRESENCE of the measured signature instead
 *
 * `readyState 0` **and** `networkState 0` (`NETWORK_EMPTY`) **and** zero buffered ranges, on
 * an element we have actually read. That is `HTMLMediaElement` for "a source is attached and
 * nothing has begun to load". Any other reading returns `playing`: not "healthy", but **not
 * this defect, so not ours to act on.**
 *
 * Measured six times, byte-identical, across three independently prepared runs
 * (`proof/retirement-step3-20260801083650`, `-20260801085237`, `-20260801090448`, two stalls
 * each): `videoPresent true, readyState 0, networkState 0, bufferedRanges 0, src blob:`.
 *
 * ## The signature is NECESSARY BUT NOT SUFFICIENT — measured, against the first guess
 *
 * The obvious reading of the above is that the signature alone separates broken from healthy
 * and the window is a formality. **That is false, and a 200 ms sampler measured it false.**
 * In `proof/retirement-step3-20260801092956`, the attempt that OPENED reads:
 *
 * ```text
 *    0 ms   readyState 0  networkState 0  buffered 0   <- the failure signature, exactly
 *  209 ms   readyState 0  networkState 2  buffered 0
 *  508 ms   readyState 4  networkState 1  buffered 1   <- playing
 * ```
 *
 * A healthy open passes THROUGH the signature on mount, for about 200 ms. What separates the
 * two is not shape but **duration**: in that same run the two stalled attempts reached the
 * same reading at 2.3 s and 1.6 s and were still holding it 43 s later.
 *
 * So `silenceMs` is load-bearing, and 10 s is chosen against measured numbers rather than
 * taste — ~50x the longest healthy transient observed, and it fires 33 s before the harness's
 * own 45 s patience. Do not shorten it toward that transient without re-measuring.
 *
 * One more thing that sampler killed: a stalled attempt passed through `readyState 1,
 * networkState 1, buffered 1` at 795 ms before falling back to the signature. **A "has it ever
 * looked healthy?" gate would therefore be wrong** — brokenness here is not monotonic, which is
 * why the rule reads only the CURRENT observation and lets the clock discriminate.
 */
export type DirectstreamMediaObservation =
  /**
   * The element could not be read this tick — no ref yet, or a cross-document handle. THE
   * ambiguous case that caused the revert. It is never evidence of anything.
   */
  | { readonly kind: 'unreadable' }
  | {
      readonly kind: 'element';
      readonly readyState: number;
      readonly networkState: number;
      readonly bufferedRanges: number;
    };

export type DirectstreamMediaProgress = {
  /** A `watch` payload has been applied. Before that this stage has no opinion at all. */
  readonly playbackArrived: boolean;
  /** When the `watch` arrived, or the last stage-2 re-open. The window runs from here. */
  readonly watchArrivedAt: number;
  /**
   * Whether a real element has been read at least ONCE for this request. The gate: with no
   * element ever seen, every verdict is `waiting`, however long the window has run.
   */
  readonly elementEverObserved: boolean;
  /** The most recent reading. `null` before the first tick. */
  readonly lastObservation: DirectstreamMediaObservation | null;
  /** Stage-2 POSTs issued for this request. Starts at 0 — stage 2 has not acted yet. */
  readonly stageAttempts: number;
};

/**
 * Deliberately longer than the stage-1 window. The exact value is not load-bearing — the
 * fire condition is an exact signature match, so this only decides how long to let a
 * genuinely-empty element prove it is going to stay that way. It is a floor on patience,
 * not a guess at a healthy load time.
 */
export const DIRECTSTREAM_MEDIA_SILENCE_MS = 10_000;

/** One stage-2 recovery, for the same reason stage 1 allows one: a second is a loop. */
export const DIRECTSTREAM_MEDIA_MAX_ATTEMPTS = 1;

/**
 * **What is actually wired, and why it is zero.**
 *
 * Everything above establishes that the PREDICATE is right and the ACTION is the problem: a
 * recovery POST against attempt N can land inside attempt N+1's healthy stream. Slice 44 built
 * the two things that can call it back and neither has been observed working against a real
 * sidecar, so re-opening stays unshipped — the bar was never "a mechanism exists", it was "a
 * run says it holds", and this constant is what keeps the two from being confused.
 *
 * But re-opening was never the whole value. The user-visible defect is that the panel renders
 * the entire study dock over a dead `<video>` and **says nothing, forever** — and REPORTING
 * that needs no POST at all. With `maxAttempts: 0` the verdict skips `reopen` entirely and
 * goes to `failed`, which surfaces the same `mediaWorkspace.openStalled` message stage 1
 * already uses.
 *
 * This is destructive-by-construction-proof rather than destructive-by-evidence: there is no
 * `BeginOpen`, so there is no `beginSubtitleSeek`, so the cue-thinning mechanism cannot occur.
 * A silent forever-spinner becomes a stated error; the automatic rescue remains future work.
 */
export const DIRECTSTREAM_MEDIA_REPORT_ONLY = 0;

export function directstreamMediaVerdict(
  progress: DirectstreamMediaProgress,
  now: number,
  silenceMs: number = DIRECTSTREAM_MEDIA_SILENCE_MS,
  maxAttempts: number = DIRECTSTREAM_MEDIA_MAX_ATTEMPTS,
): DirectstreamOpenVerdict {
  // Stage 1 owns everything before the watch. Two stages acting on one request is how a
  // recovery becomes a loop.
  if (!progress.playbackArrived) return 'waiting';

  // THE GATE. "Cannot judge" is a waiting, never a reopen — the whole lesson of the revert.
  // Checked before the clock, so a long window can never convert ignorance into an action.
  if (!progress.elementEverObserved) return 'waiting';
  if (!progress.lastObservation || progress.lastObservation.kind === 'unreadable') {
    return 'waiting';
  }

  // PRESENCE of the measured signature, not absence of a good one. Anything else — a
  // loading element, a buffered one, any readyState above HAVE_NOTHING — is not this
  // defect, and a recovery that is not sure is a recovery that does not fire.
  const { readyState, networkState, bufferedRanges } = progress.lastObservation;
  const isEmptySource = readyState === 0 && networkState === 0 && bufferedRanges === 0;
  if (!isEmptySource) return 'playing';

  if (now - progress.watchArrivedAt < silenceMs) return 'waiting';
  return progress.stageAttempts < maxAttempts ? 'reopen' : 'failed';
}

/** Counts the stage-2 attempt AND re-arms its window, for the stage-1 reason. */
export function directstreamMediaReopened(
  progress: DirectstreamMediaProgress,
  now: number,
): DirectstreamMediaProgress {
  return { ...progress, stageAttempts: progress.stageAttempts + 1, watchArrivedAt: now };
}
