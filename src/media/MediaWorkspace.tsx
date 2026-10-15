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

/**
 * No request means the host closed and keeps this tree warm (hidden, `.seanime-host-warm`,
 * `MediaWorkspaceHost.tsx`). A warm player is paused, never playing: closing makes VideoCore
 * unload its element, but one that resumes after that (a late `play()` from a buffering
 * promise, an autoplay on a remount) would go on unseen and unheard, keeping the media
 * pipeline busy. Whatever plays under the warm host is paused at once. It lives here, in the
 * lazy player chunk, so the start-up graph does not carry it.
 */
function usePausedWhileWarm(warm: boolean): void {
  React.useEffect(() => {
    if (!warm) return undefined;
    const pause = (media: EventTarget | null): void => {
      if (media instanceof HTMLMediaElement && !media.paused && media.closest('.seanime-host-warm')) media.pause();
    };
    document.querySelectorAll('.seanime-host-warm video, .seanime-host-warm audio').forEach(pause);
    const onPlay = (event: Event): void => pause(event.target);
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, [warm]);
}

export default function MediaWorkspace({
  conn,
  playbackRequest,
}: {
  conn: SeanimeConnection;
  playbackRequest: MediaWorkspacePlaybackRequest | null;
}): React.ReactElement {
  usePausedWhileWarm(playbackRequest === null);
  return (
    <MediaSurfaceShell conn={conn} surface="workspace">
      <LocalPlaybackProvider onOpen={openLocalLibraryFile}>
        <StudyPlayerSlice conn={conn} playbackRequest={playbackRequest} />
      </LocalPlaybackProvider>
    </MediaSurfaceShell>
  );
}
