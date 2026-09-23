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
import { useHostLocation, useRouter } from '@/lib/navigation';
import type { SeanimeConnection } from '../shared/seanime';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  mediaWorkspaceHostExists,
  type MediaWorkspacePlaybackRequest,
} from '../shared/mediaWorkspace';
import { useT } from '../renderer/i18n';
import { LiquidLoading } from '../renderer/components/liquid/LiquidLoading';
import MediaSurfaceShell from './MediaSurfaceShell';
import StudyPlayerSlice from './StudyPlayerSlice';
import { LocalPlaybackProvider } from './seanimeLocalPlayback';

function openLocalLibraryFile(localFilePath: string): boolean {
  if (!mediaWorkspaceHostExists()) return false;
  window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, { detail: { localFilePath } }));
  return true;
}

/**
 * The adopted entry screen is behind `React.lazy` for the same reason the host lazies this
 * whole module: `ADOPTION.md` measured the entry closure at 369 modules against the
 * library's 362, so it is only ~7 modules wider — but it is 7 modules nobody who never
 * opens a card should pay for at library-mount time.
 */
const AnimeEntryScreen = React.lazy(() => import('@/app/(main)/entry/page'));

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

/**
 * The one routed screen this surface serves, and the way back out of it.
 *
 * Before 2026-09-05 there was no router here at all and `SeaLink` let the browser follow
 * `/entry?id=…`, which navigated the whole Electron renderer and destroyed the desk (see
 * `vendor/seanime-web/lib/navigation.ts` for the measurement). Routing it in-host is only
 * half the repair: an entry screen with no way back is a dead end, and the adopted
 * `AnimeEntryPage` carries no back control of its own — every upstream caller reaches it
 * from a page shell that has one. So the back control is supplied HERE, by the host.
 *
 * The library stays MOUNTED and hidden rather than unmounted, matching the rule
 * `MediaWorkspaceHost` already applies to its own panes: the collection query, the filter
 * state and the scroll position all survive a trip into an entry and back.
 */
function RoutedLibrary(): React.ReactElement {
  const { t } = useT();
  const location = useHostLocation();
  const router = useRouter();
  const onEntry = location.pathname.startsWith('/entry');

  return (
    <>
      <div className="media-workspace-route" data-active={!onEntry} hidden={onEntry}>
        <LibraryScreen />
      </div>
      {onEntry ? (
        <div className="media-workspace-route" data-active="true" data-route="entry">
          <button
            type="button"
            className="media-workspace-back"
            onClick={() => router.back()}
          >
            {t('mediaWorkspace.backToLibrary')}
          </button>
          <React.Suspense
            fallback={<LiquidLoading layout="library" />}
          >
            <AnimeEntryScreen />
          </React.Suspense>
        </div>
      ) : null}
    </>
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
      <LocalPlaybackProvider onOpen={openLocalLibraryFile}>
        <RoutedLibrary />
        <StudyPlayerSlice conn={conn} playbackRequest={playbackRequest} />
      </LocalPlaybackProvider>
    </MediaSurfaceShell>
  );
}
