/**
 * MEDIA workspace — the adopted player, and nothing else (2026-09-23).
 *
 * It used to compose the adopted Seanime anime library (collection screen + entry page) with
 * the player. The Media Center is now the one library for every kind of video, so this is
 * the player-only tree: `MediaSurfaceShell` (the `#media-workspace` scope, query client,
 * status gate, socket) → `LocalPlaybackProvider` (auto-next and next/previous episode route
 * through it; without it they fail with "noHost") → `StudyPlayerSlice`.
 */
import React from 'react';
import type { SeanimeConnection } from '../shared/seanime';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  mediaWorkspaceHostExists,
  type MediaWorkspacePlaybackRequest,
} from '../shared/mediaWorkspace';
import MediaSurfaceShell from './MediaSurfaceShell';
import StudyPlayerSlice from './StudyPlayerSlice';
import { LocalPlaybackProvider } from './seanimeLocalPlayback';

function openLocalLibraryFile(localFilePath: string): boolean {
  if (!mediaWorkspaceHostExists()) return false;
  window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, { detail: { localFilePath } }));
  return true;
}

export default function MediaWorkspace({
  conn,
  playbackRequest,
}: {
  conn: SeanimeConnection;
  playbackRequest: MediaWorkspacePlaybackRequest | null;
}): React.ReactElement {
  return (
    <MediaSurfaceShell conn={conn} surface="workspace">
      <LocalPlaybackProvider onOpen={openLocalLibraryFile}>
        <StudyPlayerSlice conn={conn} playbackRequest={playbackRequest} />
      </LocalPlaybackProvider>
    </MediaSurfaceShell>
  );
}
