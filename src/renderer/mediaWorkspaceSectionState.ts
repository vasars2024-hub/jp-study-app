/**
 * What `MediaWorkspaceSectionView` may truthfully say, from the facts that decide it.
 *
 * The section used to branch on one fact only — "is the sidecar `disabled`?" — and render
 * "The media workspace is open in front of this window." for every other answer. That
 * sentence was false in five of the six reachable states: the overlay closed (the user had
 * just closed it), the server `stopped`, `starting`, `offline` or `failed`. `stopped` was
 * the worst: the line promised a player while the one button under it opened an overlay
 * that could only report the server was down.
 *
 * Four independent facts, each from its owner:
 *
 *  - `availability` — is there a workspace on this machine at all (`mediaWorkspaceAvailability`).
 *  - `hostExists`   — does this window mount a host that would hear an open request
 *                     (`mediaWorkspaceHostExists`, a shell fact).
 *  - `open`         — is the overlay on screen right now (`mediaWorkspaceIsOpen`).
 *  - `serverKind`   — the sidecar's live status kind, `null` until main answers.
 *
 * Pure, so the branching is tested without rendering.
 */
import { useSyncExternalStore } from 'react';
import type { SeanimeStatusKind } from '../shared/seanime';
import { mediaWorkspaceIsOpen, onMediaWorkspaceOpenChanged } from '../shared/mediaWorkspace';
import type { MediaWorkspaceAvailability } from './mediaWorkspaceAvailability';

export type MediaWorkspaceSectionState =
  /** Availability still resolving: render nothing (see the section's header). */
  | 'pending'
  /** Sidecar disabled: the legacy media surface, which is the documented rollback. */
  | 'legacy'
  /** This window mounts no host, so an open request would go nowhere. */
  | 'no-host'
  /** The overlay is genuinely in front of the window. The only state that may say so. */
  | 'open'
  /** Server ready (or not yet reported), overlay closed: offer to open it. */
  | 'closed'
  /** Server coming up: say so, and still offer to open (the host shows its own progress). */
  | 'starting'
  /** Server stopped / offline / failed: offer to start it, not a player that cannot play. */
  | 'needs-server';

export interface MediaWorkspaceSectionFacts {
  availability: MediaWorkspaceAvailability;
  hostExists: boolean;
  open: boolean;
  serverKind: SeanimeStatusKind | null;
}

export function mediaWorkspaceSectionState(facts: MediaWorkspaceSectionFacts): MediaWorkspaceSectionState {
  if (facts.availability === 'pending') return 'pending';
  if (facts.availability === 'unavailable' || facts.serverKind === 'disabled') return 'legacy';
  if (!facts.hostExists) return 'no-host';
  if (facts.open) return 'open';
  switch (facts.serverKind) {
    case 'starting':
      return 'starting';
    case 'stopped':
    case 'offline':
    case 'failed':
      return 'needs-server';
    default:
      // `ready`, or main has not answered yet. Opening is safe either way: the host renders
      // its own account of whatever the server turns out to be doing.
      return 'closed';
  }
}

/** The catalog key naming a server status kind, for `mediaWorkspace.serverState`. */
export function mediaWorkspaceSidecarLabelKey(kind: SeanimeStatusKind): string {
  switch (kind) {
    case 'disabled': return 'mediaWorkspace.sidecar.disabled';
    case 'stopped': return 'mediaWorkspace.sidecar.stopped';
    case 'starting': return 'mediaWorkspace.sidecar.starting';
    case 'ready': return 'mediaWorkspace.sidecar.ready';
    case 'offline': return 'mediaWorkspace.sidecar.offline';
    case 'failed': return 'mediaWorkspace.sidecar.failed';
    default: return 'mediaWorkspace.sidecar.stopped';
  }
}

/**
 * Whether the overlay is open, live. The host publishes synchronously on every change, so a
 * section that repainted a tick late would show the previous claim.
 */
export function useMediaWorkspaceOverlayOpen(): boolean {
  return useSyncExternalStore(onMediaWorkspaceOpenChanged, mediaWorkspaceIsOpen, () => false);
}
