/**
 * Blanc's Player fieldset, routed onto the adopted study player — Phase 6 slice 15.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNERSHIP: this file belongs to the **Media & Cards** work stream, same as
 * `BlancMediaPanels.tsx` which composes it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ## Why this file exists
 *
 * Old-player retirement swept the desktop sections and Media Center's own nav, and the
 * record then said the legacy player was "unreachable in normal use". It was not:
 * `BlancMediaPanels.tsx` rendered `MediaPlayerStage` whenever a source was loaded, with no
 * sidecar gate of any kind — no `seanimeStatus`, no `useMediaWorkspaceAvailability`. Blanc's
 * toolbox was a third shell nobody enumerated, the same class of miss as slice 14. This
 * component is the routing that closes it, so that DELETING the legacy player becomes a
 * clean product decision instead of a trade made under a false claim.
 *
 * ## The gate is the same rule, not a copy of it
 *
 * `useMediaWorkspaceAvailability()` is the single owner of "does this machine have the
 * workspace?", shared with `MediaWorkspaceSectionView` and `MediaCenterView`.
 *
 * Slice 15 routed here and kept `MediaPlayerStage` as the `SEANIME_SIDECAR=0` fallback, so
 * that the rollback still had a player. Slice 16 deleted the stage on an explicit user
 * decision, so the `unavailable` branch now STATES that playback needs the media server
 * rather than falling back to anything. That is the documented cost of the deletion: the
 * rollback keeps the library, transcription and study surfaces and loses playback.
 *
 * ## Size
 *
 * Blanc's toolbox window is 560×460 by default (`keyboardShortcuts.ts`), and the adopted
 * study dock and cue-loop overlay were laid out full-screen. `.blanc-study-player` in
 * `theme/blanc-media.css` gives the surface a bounded, scrolling frame the same way
 * `.blanc-flashcards-embed` does for the flashcard modes.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { useMediaWorkspaceAvailability } from '../../mediaWorkspaceAvailability';
import { useSeanimeConnection } from '../../../media/useSeanimeConnection';
import PlayerFrame from '../../../media/PlayerFrame';
import { lastFrameFor } from '../../../media/lastFrameCache';
import { normalizeMediaWorkspaceOpenRequest } from '../../../shared/mediaWorkspace';
import type { MediaItem } from '../../../shared/types';

/** Lazy for the same reason the host loads the workspace lazily: the 46 adopted packages
 *  stay out of Blanc's boot path. Both surfaces share the emitted chunk, so a window that
 *  has already opened the media overlay pays nothing to mount this. */
const MediaPlayerSurface = lazy(() => import('../../../media/MediaPlayerSurface'));

/** Rendered by `BlancMediaPanels` only when a source is actually loaded. */
export default function BlancStudyPlayer({ item }: { item: MediaItem }) {
  const { t } = useT();
  const availability = useMediaWorkspaceAvailability();
  // A loaded source is the signal that this surface is really in use, so the sidecar is
  // started for it. Blanc's Media tab with nothing loaded never renders this component at
  // all, which is what keeps the media server down until something needs it.
  const { status, conn, retryConnection } = useSeanimeConnection(availability === 'available');

  const playbackRequest = useMemo(
    // `requestId` is derived from the item rather than from a clock: a re-render must not
    // look like a new request and restart playback. `positionSec` is the legacy player's
    // own resume position, so switching Blanc to this surface keeps the user's place.
    () => normalizeMediaWorkspaceOpenRequest(
      { localFilePath: item.path, startAtSec: item.positionSec },
      hashRequestId(item.id, item.positionSec),
    ),
    [item.id, item.path, item.positionSec],
  );

  // The item's own artwork for the opening frame — only what is already on disk (a still
  // or a thumbnail made earlier); the frame never waits for one to be generated.
  const [poster, setPoster] = useState<string | null>(null);
  useEffect(() => {
    setPoster(null);
    let cancelled = false;
    const ask = window.api?.mediaPlaybackPlan;
    if (typeof ask !== 'function') return undefined;
    void ask(item.path).then((plan) => {
      if (!cancelled) setPoster(plan?.posterUrl ?? null);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.path]);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    setRetrying(false);
  }, [status?.kind, conn]);

  // `pending` shows nothing: with the status still in flight there is nothing true to say.
  if (availability === 'pending') return null;

  // Slice 16 deleted `MediaPlayerStage`, so a disabled sidecar no longer has a player to
  // fall back to. Saying so is the point — an empty fieldset would read as a broken panel,
  // and this is the documented cost of the deletion, not a defect.
  if (availability === 'unavailable') {
    return <p className="blanc-status-row">{t('mediaWorkspace.playerNeedsServer')}</p>;
  }

  // From here the toolbox shows the player's opening frame (`media/PlayerFrame.tsx`): the
  // item's picture and "Opening …" while the media server starts, restarts or connects —
  // never the server's own state — and a stated failure with a Retry only when it failed.
  const imageUrl = lastFrameFor(item.path) ?? poster;
  const title = item.seriesTitle || item.title;
  if (status?.kind === 'failed') {
    return (
      <div className="blanc-study-player">
        <PlayerFrame
          compact
          title={title}
          imageUrl={imageUrl}
          failure={{
            message: t(
              status.errorCode === 'missing-exe' || status.errorCode === 'spawn-failed'
                || status.errorCode === 'unhealthy' || status.errorCode === 'port'
                ? `playback.failed.${status.errorCode}`
                : 'playback.failed.crashed',
            ),
            details: status.error,
            retrying,
            onRetry: () => {
              setRetrying(true);
              void window.api.seanimeStart().catch(() => setRetrying(false));
            },
          }}
        />
      </div>
    );
  }
  if (status?.kind === 'ready' && conn && !conn.baseUrl) {
    return (
      <div className="blanc-study-player">
        <PlayerFrame
          compact
          title={title}
          imageUrl={imageUrl}
          failure={{
            message: t('playback.failed.connect'),
            retrying,
            onRetry: () => {
              setRetrying(true);
              retryConnection();
            },
          }}
        />
      </div>
    );
  }
  const opening = (
    <div className="blanc-study-player">
      <PlayerFrame compact title={title} imageUrl={imageUrl} />
    </div>
  );
  if (!status || status.kind !== 'ready' || !conn) return opening;

  return (
    <Suspense fallback={opening}>
      <MediaPlayerSurface
        conn={conn}
        playbackRequest={playbackRequest}
        className="blanc-study-player"
      />
    </Suspense>
  );
}

/**
 * A stable id for one (file, resume point) pair. `normalizeMediaWorkspaceOpenRequest`
 * defaults this to `Date.now()`, which is right for an event-driven open and wrong here —
 * this component re-renders whenever Blanc's `useMedia` state changes, and a fresh
 * `requestId` each time would re-issue the playback request and jump the video back.
 */
function hashRequestId(id: string, positionSec: number | undefined): number {
  let hash = 2166136261;
  for (const char of `${id}@${positionSec ?? 0}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
