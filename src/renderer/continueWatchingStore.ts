/**
 * Renderer-side reader for the `localStorage` stores the continue-watching model joins.
 *
 * One reader, shared by every surface that offers "pick up where you left off" — the desktop
 * widget and the command palette today. Two readers would be two chances to disagree about
 * which files are resumable, on the same screen.
 *
 * Synchronous and total by design: every store read here is `localStorage`, a corrupt one is
 * an empty one, and the media library (which contributes titles, durations and the legacy
 * player's own positions) is an optional enrichment supplied by the caller. That matters for
 * the command palette, which must produce its item list in the same tick it opens — and is
 * why the study ledger is read through `getWatchedShowTitles()` rather than `getSummary()`.
 */
import {
  continueWatchingResumeSec,
  seanimeContinueWatching,
  type ContinueWatchingEntry,
} from '../shared/seanimeContinueWatching';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  mediaWorkspaceHostExists,
} from '../shared/mediaWorkspace';
import { seanimeWatchLoopCards } from '../shared/seanimeWatchLoop';
import type { MediaItem } from '../shared/types';
import { getWatchedShowTitles } from './stats';
import {
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_KEY,
} from '../shared/videoCoreMining';
import {
  normalizeVideoCoreResumePositions,
  VIDEO_CORE_RESUME_STORAGE_KEY,
} from '../shared/videoCoreStudy';

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    // A corrupt store is an empty one, not a crashed desktop.
    return null;
  }
}

export function readContinueWatching(
  mediaItems?: readonly MediaItem[],
): ContinueWatchingEntry[] {
  return seanimeContinueWatching({
    resumePositions: normalizeVideoCoreResumePositions(readJson(VIDEO_CORE_RESUME_STORAGE_KEY)),
    ...(mediaItems ? { mediaItems } : {}),
    // `null` snapshot: card *counts* are provenance and need no Anki. Maturity does, and
    // is deliberately left to the Review panel — see `seanimeContinueWatching`'s rule 5.
    cards: seanimeWatchLoopCards(
      normalizeVideoCoreMiningHistory(readJson(VIDEO_CORE_MINING_HISTORY_KEY) ?? []),
      null,
    ),
    // What Statistics calls these files. Without it an `unlinked` file — no library item,
    // and no provenance until it has been mined — falls through to its basename here while
    // Statistics names it properly, so one file wears two names on two surfaces.
    ledgerShows: getWatchedShowTitles(),
  });
}

/**
 * Whether a mounted `MediaWorkspaceHost` currently has anything **on screen** — its
 * launcher when closed, its dialog when open.
 *
 * For surfaces deciding whether to *offer* a list of files (the palette's search-mode
 * Continue-watching group, Statistics' By-show rows) this is the right question and the
 * only one they can afford: they build their list in the tick they render, with no room
 * for a `seanimeStatus()` await. With the sidecar disabled the host renders nothing, so
 * those rows would open a player the user never sees.
 *
 * It is **not** the test for "will a dispatched open event be heard" — slice 14. The host
 * registers its listeners in an unconditional effect, so this reads `false` for a commit
 * after a fresh mount while the listener is already live, and it reads `false` in a shell
 * that mounts no host at all, which is not a statement about the sidecar. Use
 * `mediaWorkspaceHostExists()` for that, and `mediaWorkspaceIsAvailable()` for the sidecar.
 */
export function mediaWorkspaceHostIsMounted(): boolean {
  return document.querySelector('.seanime-host-present, .seanime-host') != null;
}

/** Why a resume attempt did nothing, so the caller can say so instead of failing silently. */
export type ResumeLastOutcome = 'opened' | 'no-host' | 'nothing-watched';

/**
 * Reopen the most recently watched file at the position it stopped at.
 *
 * The widget and the palette group both make this handoff for a file the user
 * picked; this makes it for the newest one without asking, which is what a
 * *command* can offer that a list cannot. `seanimeContinueWatching` returns
 * newest-first (it sorts on `updatedAt`), so "most recent" is entry 0 — no
 * second ordering rule, which would be a second chance to disagree with the two
 * surfaces already showing this list.
 *
 * Returns an outcome rather than a boolean: "no workspace is listening" and
 * "nothing has been watched yet" are different things to a user, and a command
 * that silently does nothing is the failure mode this whole seam keeps hitting.
 *
 * `no-host` is a fact about the *shell*, not about the sidecar — slice 14. It asks
 * `mediaWorkspaceHostExists()` rather than the DOM marker above deliberately: the
 * marker is absent for a commit after a fresh host mount, while the listener is
 * already live, and this is called immediately after one (`App`'s reader handoff).
 * Whether the sidecar can show anything is a separate question the caller asks main.
 */
export function resumeMostRecentWatched(
  mediaItems?: readonly MediaItem[],
): ResumeLastOutcome {
  if (!mediaWorkspaceHostExists()) return 'no-host';
  const newest = readContinueWatching(mediaItems)[0];
  if (!newest) return 'nothing-watched';
  window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, {
    detail: {
      localFilePath: newest.localFilePath,
      startAtSec: continueWatchingResumeSec(newest),
    },
  }));
  return 'opened';
}
