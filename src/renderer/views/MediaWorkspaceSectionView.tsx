/**
 * The `player` (library) and `video` app sections after old-player retirement's routing
 * swap — 2026-07-31.
 *
 * Both used to render `MediaCenterView`, which composes the legacy `MediaContent.tsx`
 * player. They now hand off to the adopted Seanime workspace instead. `music` deliberately
 * did **not** move: `MediaWorkspace.tsx` contains nothing music-shaped, so routing it here
 * would delete a working feature rather than migrate it.
 *
 * ## Why this is a launcher and not the workspace itself
 *
 * `MediaWorkspaceHost` is not a route. It is mounted once per shell at the *App* level
 * (`App.tsx:598`, `:680`, `:706`) and opens as a full-screen overlay. So a section cannot
 * render it. The panel below is what remains in the window behind the overlay, and it
 * exists so that closing the workspace lands on a control rather than on an empty pane.
 *
 * ## This component does NOT open the workspace on mount — deliberately
 *
 * The host already listens for `os:open` with `'video'` or `'player'` and brings itself
 * forward, and that listener is the single owner of the handoff. An earlier cut of this
 * file also dispatched on mount, which produced two real problems: `video` was opened
 * twice, and because the dispatch waits on an async `seanimeStatus()` round trip, closing
 * the workspace inside that window let the late dispatch **reopen** it. It also meant a
 * restored desktop layout threw a full-screen overlay up at boot with no user action.
 *
 * The button below still dispatches, because that is an explicit request.
 *
 * ## The fallback is the load-bearing part
 *
 * `MediaWorkspaceHost` returns `null` when the sidecar is `disabled`, which is exactly what
 * `SEANIME_SIDECAR=0` produces. Routing straight to it would mean the documented rollback
 * *removes the app's media surface altogether* — the precise hazard
 * `src/.coordination/study-mode/NEXT_ACTIONS.md` blocked this step on for months. So the
 * decision is made from the authoritative source (the main process's own status) and a
 * disabled sidecar keeps the legacy view. The rollback stays a rollback.
 *
 * The status is asked for rather than inferred from the DOM: `mediaWorkspaceHostIsMounted()`
 * races this component's own first render, since the host mounts in the same commit.
 */
import { lazy, Suspense, useState } from 'react';
import { useT } from '../i18n';
import { useMediaWorkspaceAvailability } from '../mediaWorkspaceAvailability';
import { openMediaWorkspace } from '../mediaWorkspaceBridge';
import {
  mediaWorkspaceSectionState,
  mediaWorkspaceSidecarLabelKey,
  useMediaWorkspaceOverlayOpen,
} from '../mediaWorkspaceSectionState';
import { mediaWorkspaceHostExists } from '../../shared/mediaWorkspace';
import { useSeanimeStatus } from '../../media/useSeanimeConnection';
import type { MediaCenterTab } from './MediaCenterView';

const MediaCenterView = lazy(() => import('./MediaCenterView'));

interface MediaWorkspaceSectionViewProps {
  /** Where a disabled sidecar sends the user instead. */
  legacyTab: MediaCenterTab;
}

export default function MediaWorkspaceSectionView({
  legacyTab,
}: MediaWorkspaceSectionViewProps) {
  const { t } = useT();
  // Shared with MediaCenterView, which hides its own legacy Video and Library tabs on the
  // same answer. See `mediaWorkspaceAvailability.ts` for why it asks main rather than the
  // DOM, and why an IPC failure resolves to `unavailable`.
  const availability = useMediaWorkspaceAvailability();
  // The live server kind and whether the overlay is actually on screen. Without these the
  // section said "open in front of this window" for a closed overlay and a stopped server
  // alike — see `mediaWorkspaceSectionState.ts`.
  const status = useSeanimeStatus();
  const open = useMediaWorkspaceOverlayOpen();
  const [startRequested, setStartRequested] = useState(false);

  // `pending` renders nothing on purpose. Showing the legacy view while the status
  // resolves flashes the surface this change exists to retire, and on a fast resolve that
  // flash would be the only thing some users ever see of it.
  if (availability === 'pending') return null;

  if (availability === 'unavailable') {
    return (
      <Suspense fallback={null}>
        <div className="media-workspace-section-fallback" role="status">
          {t('mediaWorkspace.section.legacyFallback')}
        </div>
        <MediaCenterView initialTab={legacyTab} />
      </Suspense>
    );
  }

  const state = mediaWorkspaceSectionState({
    availability,
    hostExists: mediaWorkspaceHostExists(),
    open,
    serverKind: status?.kind ?? null,
  });
  const serverLine = status
    ? t('mediaWorkspace.serverState', { status: t(mediaWorkspaceSidecarLabelKey(status.kind)) })
    : null;

  let text: string;
  let action: 'open' | 'start' | null = null;
  switch (state) {
    case 'open':
      text = t('mediaWorkspace.section.open');
      break;
    case 'no-host':
      text = t('mediaWorkspace.section.noHost');
      break;
    case 'starting':
      text = serverLine ?? t('mediaWorkspace.connectingServer');
      action = 'open';
      break;
    case 'needs-server':
      text = serverLine ?? t('mediaWorkspace.notRunning');
      action = startRequested ? null : 'start';
      break;
    default:
      text = t('mediaWorkspace.section.closed');
      action = 'open';
  }

  return (
    <div className="media-workspace-section" data-media-workspace-section={state}>
      <p className="media-workspace-section-text" role="status">
        {state === 'needs-server' && startRequested ? t('mediaWorkspace.connectingServer') : text}
      </p>
      {action === 'open' && (
        <button
          type="button"
          className="media-workspace-section-button"
          onClick={() => openMediaWorkspace()}
        >
          {t('mediaWorkspace.section.open.action')}
        </button>
      )}
      {action === 'start' && (
        <button
          type="button"
          className="media-workspace-section-button"
          onClick={() => {
            // The status push from main moves the section on (to `starting`, then
            // `closed` with the open action). A failed start lands back on `failed`.
            setStartRequested(true);
            void window.api.seanimeStart()
              .catch(() => undefined)
              .finally(() => setStartRequested(false));
          }}
        >
          {t('mediaWorkspace.startServer')}
        </button>
      )}
    </div>
  );
}
