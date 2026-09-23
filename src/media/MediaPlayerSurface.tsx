/**
 * The adopted player as a pure capability — no library, no anime-browsing UI.
 *
 * User decision, 2026-07-31: route Blanc onto the new player before deleting the legacy
 * one, and route it "stripped of its UI, as pure capability, light for the machine". This
 * file is that surface. It is the same `MediaSurfaceShell` the full workspace uses, with
 * `StudyPlayerSlice` as its only child.
 *
 * **What "light" means here, concretely.** `MediaWorkspace` pulls `LibraryView`, and
 * `LibraryView` is the single decisive edge into the heavy half of the adopted tree
 * (`media-entry-card → media-preview-modal → mpv-core / onlinestream / torrent-search /
 * debrid / playlists`) — that is `adoptionBlastRadius.singleDecisiveEdge` in
 * `progress.json`, not a guess made here. This module imports `StudyPlayerSlice` and the
 * shell and nothing else from `@/`, so a `React.lazy` boundary in front of it can split a
 * chunk that contains none of that. `mediaSurfaceImportGraph.test.ts` fails if an import
 * that reaches the library screens is ever added to this file.
 *
 * Mounting this alongside the host overlay's workspace in one window is a supported state
 * — that is exactly what happens when Blanc's toolbox has a video up and the user opens
 * the media overlay. They share one websocket (`seanimeSocketPool.ts`) and one client id.
 */
import React from 'react';
import type { SeanimeConnection } from '../shared/seanime';
import type { MediaWorkspacePlaybackRequest } from '../shared/mediaWorkspace';
import MediaSurfaceShell from './MediaSurfaceShell';
import StudyPlayerSlice from './StudyPlayerSlice';

export default function MediaPlayerSurface({
  conn,
  playbackRequest,
  className,
}: {
  conn: SeanimeConnection;
  playbackRequest: MediaWorkspacePlaybackRequest | null;
  /**
   * Blanc's toolbox window is 560×460 by default, and the study dock and cue-loop overlay
   * were laid out full-screen. The embedding shell passes its own bounded frame class
   * rather than this file guessing at a size.
   */
  className?: string;
}): React.ReactElement {
  return (
    <MediaSurfaceShell conn={conn} surface="player" className={className}>
      {/* `surface="player"` also keys the workspace layout, so this bounded frame keeps
          its own arrangement instead of sharing the full workspace's. */}
      <StudyPlayerSlice conn={conn} playbackRequest={playbackRequest} surface="player" />
    </MediaSurfaceShell>
  );
}
