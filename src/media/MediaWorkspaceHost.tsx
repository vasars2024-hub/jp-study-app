/**
 * Mount point for the MEDIA workspace, following the Phase-1 dev-panel pattern exactly:
 * it renders nothing unless the main process reports a non-`disabled` sidecar, so a
 * normal build never shows it and `DesktopShell.tsx`, the desktop grid, the dragging
 * layer and the taskbar are all untouched.
 *
 * The adopted surface is loaded with React.lazy so none of the 46 adopted packages are
 * in the boot path — with the flag off, the app's startup bundle is unchanged.
 *
 * The host chrome uses Study OS's shared EN/JA/ZH/RU catalog. ADR-003's
 * temporary Phases 2–3 exemption was removed at the Phase-4 exit gate.
 */
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { SeanimeStatus } from '../shared/seanime';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  normalizeMediaWorkspaceOpenRequest,
  registerMediaWorkspaceHost,
  STUDY_REVIEW_FOCUS_EVENT,
  type MediaWorkspaceOpenRequest,
  type MediaWorkspacePlaybackRequest,
  type StudyReviewFocusRequest,
} from '../shared/mediaWorkspace';
import { SIDECAR_STATUS_KEY } from '../shared/mediaWorkspaceLabels';
import { useT } from '../renderer/i18n';
import { ContextualSurface } from '../renderer/components/liquid/LiquidSurface';
import { useWorkspacePresentation } from '../renderer/workspacePresentation';
// The readiness loader, shared with the Media Center's sidebar. It keeps the orchestrator
// behind an `await import()`, so the boot bundle is unchanged — the invariant this file's
// header states.
import { useStudyReadiness } from '../renderer/useStudyReadiness';
import { useSeanimeConnection } from './useSeanimeConnection';
// The adopted surface's in-host location, owned by `vendor/seanime-web/lib/navigation.ts`.
//
// RELATIVE, not the `@/` alias. When this was written `vitest.config.ts` declared no
// alias at all, so `@/lib/navigation` here took out 25 tests across four suites that mount
// this component (mediaWorkspaceHostReview, mediaWorkspaceHostRecovery, readerResumeHandoff,
// resumeLastShellHandoff) with "Failed to resolve import".
//
// That reason EXPIRED at `36e29661`, which added `'@': vendor/seanime-web` to
// `vitest.config.ts` (boss audit F3 — a workaround left behind, unmarked, by its own fix).
// Both spellings now resolve to the same absolute file either way, so this is still exactly
// one module and one store, and the relative form is kept only because it is unambiguous.
import { resetHostLocation } from '../../vendor/seanime-web/lib/navigation';

const MediaWorkspace = React.lazy(() => import('./MediaWorkspace'));
/** Phase 6. Lazy for the same reason as the workspace: it stays out of the boot path. */
const SeanimeStudyLibraryPanel = React.lazy(
  () => import('../renderer/components/reading/SeanimeStudyLibraryPanel'),
);
const SeanimeWatchLoopPanel = React.lazy(
  () => import('../renderer/components/reading/SeanimeWatchLoopPanel'),
);

/**
 * The three segments are one study arc, in order: browse the library, prepare what is not
 * ready yet, then come back to what you mined. `review` is last because it is the return
 * leg — it only has content once the other two have been used.
 */
type HostView = 'library' | 'readiness' | 'review';

function sidecarStatusLabel(
  kind: SeanimeStatus['kind'],
  t: ReturnType<typeof useT>['t'],
): string {
  return t(SIDECAR_STATUS_KEY[kind]);
}

export default function MediaWorkspaceHost(): React.ReactElement | null {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [playbackRequest, setPlaybackRequest] =
    useState<MediaWorkspacePlaybackRequest | null>(null);
  const [view, setView] = useState<HostView>('library');
  /** Set when a readiness row hands off to Review focused on one file. */
  const [reviewFocus, setReviewFocus] = useState<StudyReviewFocusRequest | null>(null);
  // Status tracking, the connection bootstrap and the auto-start now live in
  // `useSeanimeConnection` — Blanc's toolbox player needs exactly the same three rules
  // (slice 15), and a second copy would be a second opinion on when a connection is safe
  // to hand out. `open` is the gate: a host showing only its launcher must not hold the
  // sidecar up. The bootstrap still resolves BEFORE React.lazy pulls the adopted bundle,
  // which is the ordering `seanimeBootstrap.ts` exists to guarantee.
  const { status, conn } = useSeanimeConnection(open);
  // L3.2 — the fourth presentation host. See `renderer/workspacePresentation.ts`
  // for why the overlay adopts the interior and never the frame: it is `inset: 0`
  // and opaque ON PURPOSE, so a translucent root would put the desktop grid back
  // on screen underneath an `aria-modal` dialog rather than reading as material.
  const presentation = useWorkspacePresentation();

  useEffect(() => {
    // Presence is published from inside the listener effect, never from a render or a
    // separate effect, so "a host exists" and "the open event has a listener" are one
    // fact with one lifetime. Note this runs whatever `status` says — the component
    // returns null while the sidecar is disabled, but the listener below is still live,
    // and a caller asking "will my dispatch be heard" must get `true` for that case and
    // for the commit before the first status arrives. Whether the sidecar can actually
    // show anything is a different question, answered by `mediaWorkspaceIsAvailable()`.
    const releaseHost = registerMediaWorkspaceHost();
    const bringForward = (detail?: MediaWorkspaceOpenRequest): void => {
      setOpen(true);
      const request = normalizeMediaWorkspaceOpenRequest(detail);
      if (!request) return;
      setPlaybackRequest(request);
      // The player lives in the library pane, and that pane is hidden — never unmounted —
      // whenever another segment shows. So a request arriving while the user sits on
      // Readiness or Review started a real directstream behind `hidden`: measured
      // 2026-08-17 as a 437 s clip playing unmuted at volume 1.0 inside a `display:none`
      // pane, box 0x0, while the Readiness tab stayed selected. Audible, invisible, and
      // with no transport to stop it. Same repair as `onReviewFocus` below, pointed the
      // other way — carry the view to where the handoff actually lands. Reversible: the
      // segment buttons still work and the pane was never unmounted, so moving loses
      // nothing. A bare open (no file) returns above and leaves the segment alone.
      setView('library');
    };
    const onWorkspaceOpen = (event: Event): void => {
      bringForward((event as CustomEvent<MediaWorkspaceOpenRequest>).detail);
    };
    /*
     * `os:open` is deliberately NOT listened for, and the removal is the point rather than
     * an oversight.
     *
     * Opening the `player` or `video` section used to bring this overlay forward. That was
     * right while both sections rendered `MediaWorkspaceSectionView` — a status-only view
     * whose whole content was a route to here. They now render the entire Media Center
     * (`AppSection.tsx`, and `mediaCenterIntegration.test.ts` pins it), so the same dispatch
     * mounted a shell with a sidebar, a global search and eight destinations and then
     * covered it with a three-button overlay: measured live 2026-08-20, one dispatch of
     * `os:open` with `player` left `.mc-root` AND `.seanime-host` in the document together.
     *
     * That contradicts the shell's own contract — "opening the adopted surface is an
     * explicit action from this shell; it must never replace the sidebar or auto-open during
     * mount" (`MediaCenterView.tsx`) — and Track 6's "clearly integrate local and
     * Seanime-backed libraries rather than hiding the mature shell behind a stripped
     * overlay". Nothing is lost: `mc-seanime-link` in that sidebar and the Video
     * destination's own action both dispatch `MEDIA_WORKSPACE_OPEN_EVENT`, which is still
     * handled above, and a window with no Media Center still has this host's launcher.
     */
    // A readiness row handing off to Review: switch the segment and carry the file, so
    // the count it stated lands on exactly the cards it was counting.
    //
    // It also OPENS the host. When slice 6 raised this event the sender was always a row
    // inside an already-open workspace, so opening was a no-op — but the Phase 6 slice 7
    // desktop widget raises the same event from outside, and without this it would set a
    // view the user cannot see, which reads as a button that does nothing.
    const onReviewFocus = (event: Event): void => {
      const detail = (event as CustomEvent<StudyReviewFocusRequest>).detail;
      if (!detail?.pathKey) return;
      setOpen(true);
      setReviewFocus(detail);
      setView('review');
    };
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen);
    window.addEventListener(STUDY_REVIEW_FOCUS_EVENT, onReviewFocus);
    return () => {
      releaseHost();
      window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen);
      window.removeEventListener(STUDY_REVIEW_FOCUS_EVENT, onReviewFocus);
    };
  }, []);

  // Closing drops the in-host route too, so reopening lands on the library rather than on
  // whatever entry happened to be showing when the user shut the workspace an hour ago.
  const close = useCallback(() => {
    setOpen(false);
    resetHostLocation();
  }, []);

  // Escape closes the workspace, but never out from under an active player: the adopted
  // VideoCore owns that layer and its own exit path, and yanking the host would drop a
  // live directstream. `data-study-player` is the slice's existing published state.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('.study-player-slice[data-study-player="active"]')) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open]);

  // Move focus into the workspace on open and hand it back to the launcher on close, so
  // a keyboard user is never left tabbing through the desktop behind a full-screen layer.
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus();
    else launcherRef.current?.focus({ preventScroll: true });
  }, [open]);

  /* ----------------------------------------------------------------------------------- *
   * The readiness panel's three props, all of which are load-bearing — the reasoning, the
   * deferred `await import()` and the `study:changed` subscription moved to
   * `renderer/useStudyReadiness.ts` when the Media Center's sidebar gained the same
   * destination. One loader, two shells: a second copy would be a second opinion about
   * when the document is fresh.
   * ----------------------------------------------------------------------------------- */
  const {
    document: studyDocument,
    fingerprints: studyFingerprints,
    analyse,
  } = useStudyReadiness(view === 'readiness');

  const pickLocalVideo = async (): Promise<void> => {
    const opened = await window.api.pickMedia();
    if (!opened?.item.path) return;
    setPlaybackRequest(
      normalizeMediaWorkspaceOpenRequest({ localFilePath: opened.item.path }),
    );
    // `Open local video` sits in the header of every segment, so it reaches the hidden
    // pane from Readiness and Review exactly as the rows above did.
    setView('library');
  };

  if (!status || status.kind === 'disabled') return null;

  const statusLabel = sidecarStatusLabel(status.kind, t);
  // The other three hosts' own strings, reused verbatim so one enable flow reads
  // the same wherever it is met. No new catalog key, in any of the four languages.
  const liquidLabel = presentation.liquid
    ? t('desktop.returnToStandard')
    : t('desktop.makeLiquid');

  if (!open) {
    return (
      <button
        ref={launcherRef}
        type="button"
        className="seanime-host-launcher"
        data-sidecar={status.kind}
        onClick={() => setOpen(true)}
      >
        <span className="seanime-host-dot" aria-hidden="true" />
        {t('mediaWorkspace.launcher')}
        <span className="seanime-host-launcher-state">{statusLabel}</span>
      </button>
    );
  }

  const retryable = status.kind === 'failed' || status.kind === 'offline'
    || status.kind === 'stopped';

  return (
    <div
      className={`seanime-host${presentation.liquid ? ' workspace-liquid' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('mediaWorkspace.launcher')}
      data-presentation={presentation.dataPresentation}
    >
      {/* The bar is navigation and transport by §2.3, so it is the region that
          takes the material. `as="header"` keeps the landmark and adds no node:
          the primitive is inert in conventional presentation, and
          `theme/liquid-window.css` paints it only under `.workspace-liquid`. */}
      <ContextualSurface as="header" className="seanime-host-bar">
        <strong className="seanime-host-title">{t('mediaWorkspace.launcher')}</strong>
        <span
          className="seanime-host-status"
          data-sidecar={status.kind}
          role="status"
          aria-live="polite"
        >
          <span className="seanime-host-dot" aria-hidden="true" />
          {t('mediaWorkspace.status', { status: statusLabel })}
        </span>
        <button
          type="button"
          className="seanime-host-btn"
          onClick={() => void pickLocalVideo()}
          disabled={status.kind !== 'ready'}
          // A disabled control with no stated reason reads as broken.
          title={status.kind === 'ready'
            ? undefined
            : t('mediaWorkspace.openLocalBlocked', { status: statusLabel })}
        >
          {t('mediaWorkspace.openLocal')}
        </button>
        {/* Phase 6. A segmented switch, not a separate window: the Study Mode readiness
            view is about this same library, and the adopted workspace below must stay
            mounted either way (see the CSS-hide note in the body). */}
        <div
          className="seanime-host-views"
          role="group"
          aria-label={t('mediaWorkspace.viewLabel')}
        >
          <button
            type="button"
            className="seanime-host-btn"
            aria-pressed={view === 'library'}
            // Also clears the in-host route. Without this, pressing Library while an entry
            // is open is a control that visibly does nothing: `view` is already 'library',
            // so the state never changes and the entry keeps the pane.
            onClick={() => {
              setView('library');
              resetHostLocation();
            }}
          >
            {t('mediaWorkspace.viewLibrary')}
          </button>
          <button
            type="button"
            className="seanime-host-btn"
            aria-pressed={view === 'readiness'}
            onClick={() => setView('readiness')}
          >
            {t('mediaWorkspace.viewReadiness')}
          </button>
          <button
            type="button"
            className="seanime-host-btn"
            aria-pressed={view === 'review'}
            onClick={() => setView('review')}
          >
            {t('mediaWorkspace.viewReview')}
          </button>
        </div>
        {/* `seanime-host-close` carries the `margin-left: auto` that pushes the
            right-hand group off the segment switch, so the Liquid toggle sits
            AFTER it rather than before — otherwise the toggle takes the gap and
            Close moves to the middle of the bar. Reuses the other three hosts'
            strings and their `aria-pressed` contract, and is inlined for the
            same reason `.fwin-b-liquid` and `.popout-btn-liquid` are: one call
            site. `ReaderLiquidToggle` exists only because the reader has two. */}
        <button
          ref={closeRef}
          type="button"
          className="seanime-host-btn seanime-host-close"
          onClick={close}
        >
          {t('common.close')}
        </button>
        {presentation.presentable ? (
          <button
            type="button"
            className={`seanime-host-btn seanime-host-liquid${
              presentation.liquid ? ' is-liquid' : ''
            }`}
            title={liquidLabel}
            aria-label={liquidLabel}
            aria-pressed={presentation.liquid}
            onClick={presentation.toggle}
          >
            {presentation.liquid ? '◆' : '◇'}
          </button>
        ) : null}
      </ContextualSurface>
      <div className="seanime-host-body">
        {/*
          Review sits OUTSIDE the sidecar gate, and that is a correctness fix rather than a
          convenience. Its data is Study OS mining history plus Anki — it reads nothing
          from the media server — so gating it behind `status.kind === 'ready'` meant a
          stopped sidecar hid the user's own mined cards for no reason. It renders first so
          that when the sidecar is down it is the only thing here, and when the sidecar is
          up the library pane below still mounts and keeps the websocket alive.
        */}
        {view === 'review' ? (
          <div className="seanime-host-pane" data-active="true">
            <Suspense
              fallback={
                <div className="seanime-host-state" role="status">
                  <p>{t('common.loading')}</p>
                </div>
              }
            >
              <SeanimeWatchLoopPanel
                focus={reviewFocus}
                onClearFocus={() => setReviewFocus(null)}
              />
            </Suspense>
          </div>
        ) : null}

        {/* A sidecar notice is only information when the view actually needs the sidecar.
            Beside the Review panel it would be a standing error about nothing. */}
        {view === 'review' ? null : status.kind !== 'ready' ? (
          <div className="seanime-host-state" role="status">
            <p>{t('mediaWorkspace.serverState', { status: statusLabel })}</p>
            {status.error ? <p className="seanime-host-state-detail">{status.error}</p> : null}
            {retryable ? (
              <button
                type="button"
                className="seanime-host-btn"
                onClick={() => void window.api.seanimeStart().catch(() => undefined)}
              >
                {t('mediaWorkspace.startServer')}
              </button>
            ) : null}
          </div>
        ) : !conn ? (
          <div className="seanime-host-state" role="status">
            <p>{t('mediaWorkspace.connecting')}</p>
          </div>
        ) : !conn.baseUrl ? (
          <div className="seanime-host-state" role="status">
            <p>{t('mediaWorkspace.notRunning')}</p>
          </div>
        ) : null}

        {status.kind !== 'ready' || !conn || !conn.baseUrl ? null : (
          <>
            {/*
              Hidden with CSS, never unmounted. The adopted workspace holds the sidecar
              websocket, and the sidecar's no-client watchdog exits the process shortly
              after the last client disconnects — so unmounting this to show another view
              would kill the media server underneath it.
            */}
            <div
              className="seanime-host-pane"
              data-active={view === 'library'}
              hidden={view !== 'library'}
            >
              <Suspense
                fallback={
                  <div className="seanime-host-state" role="status">
                    <p>{t('common.loading')}</p>
                  </div>
                }
              >
                <MediaWorkspace
                  key={`seanime-${status.pid ?? 'none'}-${status.port}`}
                  conn={conn}
                  playbackRequest={playbackRequest}
                />
              </Suspense>
            </div>
            {view === 'readiness' ? (
              <div className="seanime-host-pane" data-active="true">
                <Suspense
                  fallback={
                    <div className="seanime-host-state" role="status">
                      <p>{t('common.loading')}</p>
                    </div>
                  }
                >
                  <SeanimeStudyLibraryPanel
                    orchestrator={studyDocument}
                    fingerprints={studyFingerprints}
                    onAnalyse={analyse}
                  />
                </Suspense>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
