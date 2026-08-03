import type { AcquisitionPlayback } from './acquisition';

/**
 * Renderer-wide handoff for the adopted Seanime media workspace.
 *
 * The legacy Media Center remains the rollback surface while the sidecar flag is
 * disabled. When the flag is armed, every video entry point raises this event and
 * the adopted VideoCore owns playback.
 */
export const MEDIA_WORKSPACE_OPEN_EVENT = 'seanime:media-workspace-open';

/**
 * How many `MediaWorkspaceHost`s are mounted in this window — i.e. whether anything
 * would *hear* `MEDIA_WORKSPACE_OPEN_EVENT`.
 *
 * It lives beside the event name on purpose: the invariant is that this counter's
 * lifetime **is** that listener's lifetime, and two files cannot keep that true.
 *
 * `mediaWorkspaceHostIsMounted()` (renderer/continueWatchingStore.ts) asks the DOM for
 * the host's launcher instead. That is the right test for a surface deciding whether to
 * *offer* a list of files — with the sidecar disabled the host renders nothing, so the
 * rows would open a player the user never sees. It is the wrong test for "will this
 * dispatch be heard", and answering the second question with the first is Phase 6 slice
 * 14's defect:
 *
 *   - the host registers its listeners in an *unconditional* effect, so the listener is
 *     live a commit before `status` arrives and the launcher renders; and, decisively,
 *   - a shell that never mounts a host at all produces no marker either, which is
 *     indistinguishable from a disabled sidecar and was reported as one. The reader
 *     (`App.tsx`'s `reading` branch) and every pop-out but `video` mount `CommandPalette`
 *     without a host, so `video.resumeLast` told those windows the media server was off
 *     while it was running.
 *
 * A shell fact and a sidecar fact. Keep them apart: this answers the first, and
 * `useMediaWorkspaceAvailability`/`mediaWorkspaceIsAvailable()` answer the second by
 * asking main rather than by inspecting the DOM.
 */
let mountedHosts = 0;

/** Called by `MediaWorkspaceHost` from the same effect that adds its window listeners. */
export function registerMediaWorkspaceHost(): () => void {
  mountedHosts += 1;
  let released = false;
  return () => {
    // Idempotent: React StrictMode runs an effect's cleanup twice in development, and a
    // second decrement would under-count a host that is still mounted — reporting "this
    // window has no media player" in the one shell that does.
    if (released) return;
    released = true;
    mountedHosts = Math.max(0, mountedHosts - 1);
  };
}

/** Whether a dispatched `MEDIA_WORKSPACE_OPEN_EVENT` has a listener in this window. */
export function mediaWorkspaceHostExists(): boolean {
  return mountedHosts > 0;
}

/**
 * The desktop sections that hand off to the adopted workspace instead of the legacy
 * Media Center — old-player retirement, step 2.
 *
 * Three places need this and they had drifted into two answers. `AppSection` routes both
 * ids to `MediaWorkspaceSectionView`; `MediaWorkspaceHost` listens for `os:open` on both;
 * but `App` mounted the host in a pop-out window only for `video`, because that condition
 * predated `player` joining the list. A `player` pop-out therefore rendered the section's
 * "open the workspace" button in a window where nothing listened for the event.
 *
 * A pop-out is a separate renderer with its own `App` tree, so "the host is mounted" is
 * per-window and cannot be inherited from the desktop that spawned it.
 */
export const MEDIA_WORKSPACE_SECTIONS = ['player', 'video'] as const;

export function sectionOpensMediaWorkspace(section: unknown): boolean {
  return typeof section === 'string'
    && (MEDIA_WORKSPACE_SECTIONS as readonly string[]).includes(section);
}

/**
 * Renderer-wide handoff from a *preparation* row to the **Review** view, focused on that
 * one file.
 *
 * The readiness row states how many of its mined cards need another look. Without this
 * that number is a dead end — a count the user can read but cannot act on, which is worse
 * than not showing it. Raised as an event rather than threaded through props for the same
 * reason `MEDIA_WORKSPACE_OPEN_EVENT` is: the two panels are lazy siblings under
 * `MediaWorkspaceHost` and neither owns the other.
 *
 * `detail.pathKey` is a `studyLibraryPathKey` value — the join key both Phase 6 halves
 * already share — never a raw path.
 */
export const STUDY_REVIEW_FOCUS_EVENT = 'seanime:study-review-focus';

export interface StudyReviewFocusRequest {
  pathKey: string;
  /** Shown verbatim as the focus chip's label. Study content, so never translated. */
  title: string;
}

export interface MediaWorkspaceStreamSource {
  streamId: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  seriesTitle: string;
  aniListId: number | null;
  resolution: string;
  playback: AcquisitionPlayback;
}

export interface MediaWorkspaceLocalPlaybackRequest {
  kind: 'local';
  requestId: number;
  localFilePath: string;
  /**
   * Seek here on open instead of resuming where the file was left.
   *
   * Phase 6's watch-to-review loop is the only producer: a mined card carries the exact
   * cue it came from, so "replay the line this card came from" is a real destination
   * rather than a resume. Absent for every ordinary open, which keeps the stored resume
   * position authoritative — an explicit request outranks it, nothing else does.
   */
  startAtSec?: number;
}

export interface MediaWorkspaceStreamPlaybackRequest {
  kind: 'stream';
  requestId: number;
  stream: MediaWorkspaceStreamSource;
}

export type MediaWorkspacePlaybackRequest =
  | MediaWorkspaceLocalPlaybackRequest
  | MediaWorkspaceStreamPlaybackRequest;

export interface MediaWorkspaceOpenRequest {
  localFilePath?: string;
  stream?: MediaWorkspaceStreamSource;
  /** Local files only — see `MediaWorkspaceLocalPlaybackRequest.startAtSec`. */
  startAtSec?: number;
}

export function normalizeMediaWorkspaceOpenRequest(
  value: unknown,
  requestId = Date.now(),
): MediaWorkspacePlaybackRequest | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as MediaWorkspaceOpenRequest;
  const path = input.localFilePath?.trim();
  if (path) {
    return {
      kind: 'local',
      requestId,
      localFilePath: path,
      // Only a finite, non-negative number survives. A NaN or a negative reaching
      // `initialState.currentTime` would make the element seek to an invalid position and
      // the open would look like a broken file rather than a bad request.
      ...(typeof input.startAtSec === 'number'
        && Number.isFinite(input.startAtSec)
        && input.startAtSec >= 0
        ? { startAtSec: input.startAtSec }
        : {}),
    };
  }
  const stream = input.stream;
  if (
    !stream
    || !stream.streamId?.trim()
    || !stream.playback?.url?.trim()
    || stream.playback.refreshRequired
    || !Number.isFinite(stream.episodeNumber)
  ) {
    return null;
  }
  return {
    kind: 'stream',
    requestId,
    stream: {
      ...stream,
      streamId: stream.streamId.trim(),
      episodeId: stream.episodeId.trim(),
      episodeTitle: stream.episodeTitle.trim(),
      seriesTitle: stream.seriesTitle.trim(),
      resolution: stream.resolution.trim(),
      playback: {
        ...stream.playback,
        url: stream.playback.url.trim(),
        headers: { ...stream.playback.headers },
        subtitles: stream.playback.subtitles.map((subtitle) => ({ ...subtitle })),
      },
    },
  };
}
