/**
 * MEDIA workspace — Study OS's host for the adopted Seanime library/lists surface.
 *
 * The provider stack this used to own moved to `MediaSurfaceShell.tsx` in slice 15, when
 * the player had to become mountable without the library (Blanc). What is left here is
 * the composition that defines *this* surface: the adopted library screen plus the player.
 *
 * The split is along the one edge that matters for weight. `adoptionBlastRadius`
 * recorded `media-entry-card → media-preview-modal` as the single decisive import, and it
 * hangs off `LibraryView` alone — mpv-core, onlinestream, torrent-search, debrid and
 * playlists all arrive through it. `StudyPlayerSlice` reaches none of them.
 */
import React from 'react';
import { useHandleLibraryCollection } from '@/app/(main)/_features/anime-library/_lib/handle-library-collection';
import { LibraryView } from '@/app/(main)/_features/anime-library/_screens/library-view';
import type { SeanimeConnection } from '../shared/seanime';
import type { MediaWorkspacePlaybackRequest } from '../shared/mediaWorkspace';
import MediaSurfaceShell from './MediaSurfaceShell';
import StudyPlayerSlice from './StudyPlayerSlice';

function LibraryScreen(): React.ReactElement {
  const {
    libraryGenres,
    libraryCollectionList,
    filteredLibraryCollectionList,
    continueWatchingList,
    isLoading,
    hasEntries,
    streamingMediaIds,
  } = useHandleLibraryCollection();

  return (
    <LibraryView
      genres={libraryGenres}
      collectionList={libraryCollectionList}
      filteredCollectionList={filteredLibraryCollectionList}
      continueWatchingList={continueWatchingList}
      isLoading={isLoading}
      hasEntries={hasEntries}
      streamingMediaIds={streamingMediaIds}
    />
  );
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
      <LibraryScreen />
      <StudyPlayerSlice conn={conn} playbackRequest={playbackRequest} />
    </MediaSurfaceShell>
  );
}
