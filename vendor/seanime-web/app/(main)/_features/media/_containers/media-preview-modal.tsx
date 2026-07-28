/**
 * STUDY OS SUBSTITUTION — stands in for seanime-web's `media-preview-modal.tsx`.
 *
 * This is the single edge that decides the adoption blast radius. Upstream's hover-preview
 * modal imports the whole anime-entry page, which transitively reaches video-core
 * (`hls.js`, `jassub`, `anime4k-webgpu`, `media-captions`), mpv-core (`@mpv-prism/core`),
 * onlinestream, torrent-search, debrid and playlists.
 *
 * Measured, from `library-view.tsx`:
 *     with this modal      368 local files, 60 npm packages
 *     with this stub       179 local files, 47 npm packages
 *
 * The player and entry surfaces belong to Phase 3, so Phase 2 severs the edge here rather
 * than dragging them in early. `media-entry-card.tsx` consumes only `useMediaPreviewModal`,
 * so a no-op setter is the entire contract.
 *
 * Restoring upstream behaviour later = deleting this file and re-copying the real one from
 * the pinned checkout. See `vendor/seanime-web/ADOPTION.md`.
 */
import React from 'react';

export function useMediaPreviewModal(): { setPreviewModalMediaId: (id: number | undefined) => void } {
  return React.useMemo(
    () => ({
      setPreviewModalMediaId: () => {
        /* Phase 2: hover preview is not adopted. */
      },
    }),
    [],
  );
}

export function MediaPreviewModal(): React.ReactElement | null {
  return null;
}
