import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  mediaWorkspaceHostExists,
  type MediaWorkspaceOpenRequest,
} from '../shared/mediaWorkspace';
import { mediaWorkspaceIsAvailable } from './mediaWorkspaceAvailability';
import { PLAYER_WARM_EVENT } from '../shared/playerWarm';

/**
 * A video is likely next (a media view came into sight, a row is under the pointer): warm
 * the media server and the window's player now, so the open itself is instant. Cheap and
 * idempotent; throttled so a hover storm is one event.
 */
let lastWarmAt = 0;
export function warmMediaPlayer(): void {
  const now = Date.now();
  if (now - lastWarmAt < 5000) return;
  lastWarmAt = now;
  window.dispatchEvent(new CustomEvent(PLAYER_WARM_EVENT));
}

/**
 * `warmMediaPlayer` once the view that asks has painted and the window is idle, so the
 * warm-up never competes with the view's own first frame. Returns a cancel for an effect.
 */
export function warmMediaPlayerWhenIdle(): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => warmMediaPlayer(), { timeout: 2000 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(() => warmMediaPlayer(), 600);
  return () => window.clearTimeout(id);
}

/** Bring the adopted workspace forward and optionally start a local file. */
export function openMediaWorkspace(detail: MediaWorkspaceOpenRequest = {}): void {
  window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, { detail }));
}

/** Why a dispatch would be swallowed, or `ready` when it will not be. */
export type MediaWorkspaceReach = 'ready' | 'no-host' | 'unavailable';

/**
 * The two questions that must both be answered before dispatching an open request, in
 * the order slice 14 established — and now in one place, because slice 19 needed the same
 * sequence for a second caller.
 *
 * `no-host` is a fact about **this window**: a pop-out mounts `CommandPalette` but not
 * `MediaWorkspaceHost`, so the event has no listener there. `unavailable` is a fact about
 * **the machine**: the sidecar is disabled. Conflating them is what told users "the media
 * server is off" while it was running, and asking main for the shell answer would let an
 * IPC failure re-word a window fact as a sidecar fact — so the host check comes first and
 * short-circuits.
 *
 * Callers own the wording, because "nothing to resume into" and "cannot open this episode"
 * are the same fact about different intentions.
 */
export async function reachMediaWorkspace(): Promise<MediaWorkspaceReach> {
  if (!mediaWorkspaceHostExists()) return 'no-host';
  if (!(await mediaWorkspaceIsAvailable())) return 'unavailable';
  return 'ready';
}
