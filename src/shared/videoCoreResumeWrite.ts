/**
 * What a resume-position write is allowed to say — Phase 6 slice 35.
 *
 * `ResumeTracker` (`media/StudyPlayerSlice.tsx`) persists `video.currentTime` from four
 * places: every `timeupdate` that moved at least 2 s, `pause`, `ended`, and its own effect
 * **teardown**. Three of those are the user doing something. The fourth is not, and that is
 * where this module exists.
 *
 * ## The defect, from the code rather than from a probe
 *
 * A write of `0` is not neutral. `resolveVideoCoreResumePosition` treats any stored entry
 * below {@link RESUME_MIN_MEANINGFUL_SEC} as "no resume point", and
 * `seanimeContinueWatching.ts` drops any row under `CONTINUE_WATCHING_MIN_POSITION_SEC`
 * (10 s) — so a `0` written over a real position does not merely lose precision, it
 * **deletes the Continue Watching row and the resume point together**. Yet the element hands
 * out `currentTime === 0` in two situations that mean opposite things:
 *
 *  - the user is genuinely at the top of the file, and
 *  - the element has no media at all — a stream that never arrived, or one the adopted
 *    lifecycle effect has already emptied (`video-core.tsx` §965-970 does
 *    `pause() / removeAttribute("src") / load()`, which resets `currentTime` to 0 and
 *    `currentSrc` to `""`).
 *
 * Two reachable paths therefore destroy a real stored position, and neither involves the
 * user watching anything:
 *
 *  1. **Open, then leave before playback.** Open an episode that already has a stored
 *     position, close the workspace (or hit the silent-open stall this phase has chased
 *     since slice 24) before the first frame. Teardown persists `0`, and the episode
 *     vanishes from Continue Watching.
 *  2. **A write from an emptied element.** Any teardown that lands after the lifecycle
 *     effect has run reads the *reset* clock, not the last position played.
 *
 * ## The rule
 *
 * A position is only allowed to speak for the user when the element actually has media, and
 * a sub-threshold position may only *clear* a stored point when this session had really
 * started — because "back to 0:00 after watching 8 minutes" is a decision, while "still at
 * 0:00 having never played" is an absence of one. Hence {@link resumeWriteAction}'s three
 * outcomes: `save`, `clear`, and — the one the old code could not express — `skip`.
 *
 * Pure and in `shared/` for the reason `directstreamOpenRecovery.ts` gives: `src/media/**`
 * is outside every `vitest.config.ts` include glob, so a rule that lives in the component
 * is a rule with no test.
 */

/**
 * Below this, a stored position is already meaningless to every reader in the app —
 * `resolveVideoCoreResumePosition` returns 0 for it. Writing such a value can only ever
 * destroy information, never add any.
 */
export const RESUME_MIN_MEANINGFUL_SEC = 1;

/**
 * How close to the end counts as finished. Matches the margin `resolveVideoCoreResumePosition`
 * uses when it refuses to resume an entry, so the store and its reader agree on "done".
 */
export const RESUME_END_MARGIN_SEC = 5;

export interface ResumeWriteInput {
  /** `video.currentTime` at the moment the write was triggered. */
  positionSec: number;
  /**
   * Whether the element has media to speak about — `readyState > HAVE_NOTHING` or a
   * non-empty `currentSrc`. An emptied element reports `0` for the position of a file the
   * user may have watched for an hour.
   */
  hasMedia: boolean;
  /** The highest position observed on this key during this session, in seconds. */
  sessionMaxSec: number;
  /** `video.duration`, when the element knows it. `NaN`/`null` while it does not. */
  durationSec?: number | null;
  /** The `ended` event — the only *statement* that the file was finished. */
  finished?: boolean;
}

export type ResumeWriteAction =
  /** Store `positionSec` against this key. */
  | 'save'
  /** Remove any stored entry for this key. */
  | 'clear'
  /** Leave the store exactly as it is; this write knows nothing the store does not. */
  | 'skip';

export function resumeWriteAction(input: ResumeWriteInput): ResumeWriteAction {
  const { positionSec, hasMedia, sessionMaxSec, durationSec, finished } = input;
  if (!Number.isFinite(positionSec) || positionSec < 0) return 'skip';
  // `ended` is a statement, not a sample: it is true of the element regardless of what the
  // clock reads afterwards, so it outranks every other rule here.
  if (finished) return 'clear';
  if (!hasMedia) return 'skip';
  if (
    typeof durationSec === 'number'
    && Number.isFinite(durationSec)
    && durationSec > 0
    && positionSec >= durationSec - RESUME_END_MARGIN_SEC
  ) return 'clear';
  if (positionSec >= RESUME_MIN_MEANINGFUL_SEC) return 'save';
  // Sub-threshold. Only a session that had genuinely started may throw a stored point away.
  return Number.isFinite(sessionMaxSec) && sessionMaxSec >= RESUME_MIN_MEANINGFUL_SEC
    ? 'clear'
    : 'skip';
}
