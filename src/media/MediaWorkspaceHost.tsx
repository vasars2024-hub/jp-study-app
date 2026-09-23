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
  setMediaWorkspaceOpen,
  STUDY_REVIEW_FOCUS_EVENT,
  type MediaWorkspaceOpenRequest,
  type MediaWorkspacePlaybackRequest,
  type StudyReviewFocusRequest,
} from '../shared/mediaWorkspace';
import { SIDECAR_STATUS_KEY } from '../shared/mediaWorkspaceLabels';
import { useT } from '../renderer/i18n';
import { ContextualSurface } from '../renderer/components/liquid/LiquidSurface';
import { LiquidLoading } from '../renderer/components/liquid/LiquidLoading';
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

/** How long a stopped sidecar may be "auto-start is on its way" before it is explained. */
const STOPPED_GRACE_MS = 4000;

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
  /*
   * Where "Back" goes. A video handed in from outside (the Media Center, the Video app,
   * Continue watching) opened this workspace only to play it, so leaving the video returns
   * there — the Media Center is the user's library. A video picked from this workspace's own
   * library returns to that library. Held in refs: the open listener is registered once.
   */
  const openRef = useRef(false);
  const openedForPlaybackRef = useRef(false);
  const [openedForPlayback, setOpenedForPlayback] = useState(false);
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
      const wasOpen = openRef.current;
      setOpen(true);
      const request = normalizeMediaWorkspaceOpenRequest(detail);
      if (!request) return;
      if (!wasOpen) {
        openedForPlaybackRef.current = true;
        setOpenedForPlayback(true);
      }
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

  // Publish the overlay's real open state so the `player`/`video` sections behind
  // it can describe it truthfully instead of inferring it from sidecar
  // availability — which said "open in front of this window" while it was
  // stopped, starting, offline, failed, or freshly closed (audit F15).
  useEffect(() => {
    setMediaWorkspaceOpen(open);
    return () => setMediaWorkspaceOpen(false);
  }, [open]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Closing drops the in-host route too, so reopening lands on the library rather than on
  // whatever entry happened to be showing when the user shut the workspace an hour ago. It
  // also drops the video: kept, a bare reopen remounted the player and it replayed the last
  // file (or its error screen) on its own (transition audit 2026-09-23).
  const close = useCallback(() => {
    setOpen(false);
    setPlaybackRequest(null);
    openedForPlaybackRef.current = false;
    setOpenedForPlayback(false);
    resetHostLocation();
  }, []);

  /*
   * Is a video on screen? Read from the slice's own published state (`data-study-player`)
   * rather than from `playbackRequest`, which outlives a player VideoCore closed by itself
   * (its error screen's Close Player). Watched with a MutationObserver because the slice is
   * lazy and deep inside the adopted surface.
   */
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [playerActive, setPlayerActive] = useState(false);
  useEffect(() => {
    const root = hostRef.current;
    if (!open || !root) {
      setPlayerActive(false);
      return undefined;
    }
    const read = (): void => {
      setPlayerActive(root.querySelector(
        '.study-player-slice:is([data-study-player="active"], [data-study-player="loading"])',
      ) != null);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-study-player'],
    });
    return () => observer.disconnect();
  }, [open, status?.kind]);

  /*
   * The player's way out that is not "close everything". Before this the only exits from a
   * playing video were Close (the whole workspace) or the error screen's Close Player; the
   * Library segment kept the player on screen (audit 2026-09-23). Withdrawing the request
   * stops the player (`StudyPlayerSlice` ends the stream when its request goes away).
   */
  const backToLibrary = useCallback(() => {
    setPlaybackRequest(null);
    setView('library');
    openedForPlaybackRef.current = false;
    setOpenedForPlayback(false);
    resetHostLocation();
  }, []);
  /** "Back" from a video: to wherever it was opened from (see `openedForPlaybackRef`). */
  const leavePlayer = useCallback(() => {
    if (openedForPlaybackRef.current) close();
    else backToLibrary();
  }, [backToLibrary, close]);

  // The host bar's height, for the player that starts under it (`--seanime-host-bar-h`,
  // mediaWorkspace.css). `offsetHeight` is in CSS pixels, which is what the player's `top`
  // is read in; a bounding box would be in painted pixels under the app's zoom.
  useEffect(() => {
    const root = hostRef.current;
    const bar = root?.querySelector<HTMLElement>('.seanime-host-bar');
    if (!open || !root || !bar) return undefined;
    const publish = (): void => {
      root.style.setProperty('--seanime-host-bar-h', `${bar.offsetHeight}px`);
    };
    publish();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [open, status?.kind]);

  /*
   * A stopped sidecar is normally a moment: opening the workspace auto-starts it
   * (`useSeanimeConnection`), so for that moment it shows the loader, not "stopped" and a
   * Start button. If it is STILL stopped after a few seconds the auto-start did not take,
   * and the words and the button come back — a loader must never spin on a server nobody
   * is starting.
   */
  const [stoppedTooLong, setStoppedTooLong] = useState(false);
  useEffect(() => {
    setStoppedTooLong(false);
    if (!open || status?.kind !== 'stopped') return undefined;
    const timer = window.setTimeout(() => setStoppedTooLong(true), STOPPED_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [open, status?.kind]);

  // Readiness and Review hide the library pane — and the player inside it, which kept
  // playing out loud with no picture and no transport (transition audit 2026-09-23). Leaving
  // the pane pauses it; coming back leaves it paused, where the viewer left it.
  useEffect(() => {
    if (view === 'library') return;
    const video = hostRef.current?.querySelector<HTMLVideoElement>('#media-workspace video');
    if (video && !video.paused) video.pause();
  }, [view]);

  // Escape steps back one level: from a playing video to the library, and from the library
  // out of the workspace. It never acts while the user is typing (a card field, a search
  // box), while a menu, sheet or dialog inside the player is open (those close first), or in
  // fullscreen, where Escape belongs to the browser.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) return;
      if (document.fullscreenElement) return;
      if (document.querySelector(
        '.study-player-slice:is([data-study-player="active"], [data-study-player="loading"])',
      )) {
        const busy = document.querySelector(
          '.study-bar-layer:not([data-study-sheet-open="none"]), '
          + '#media-workspace [role="menu"], #media-workspace [role="dialog"], '
          + '#media-workspace [data-state="open"]',
        );
        if (busy) return;
        leavePlayer();
        return;
      }
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, leavePlayer, open]);

  // Move focus into the workspace on open and hand it back to whatever held it before on
  // close, so a keyboard user is never left tabbing through the desktop behind a
  // full-screen layer. (It went back to the corner launcher until that was removed.)
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement && active !== document.body
        ? active
        : null;
      closeRef.current?.focus();
      return;
    }
    const back = returnFocusRef.current;
    returnFocusRef.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
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
    // No corner launcher: it sat over the desktop's bottom-right as a permanent "Media
    // workspace · stopped" pill the user did not want (2026-09-23), and every way into the
    // workspace — the Video app, an episode, Continue watching, Resume last — already opens
    // it through `MEDIA_WORKSPACE_OPEN_EVENT`. This invisible marker keeps "a host is mounted
    // and its sidecar is not disabled" answerable from the DOM (`mediaWorkspaceHostIsMounted`).
    return <span className="seanime-host-present" data-sidecar={status.kind} hidden />;
  }

  const retryable = status.kind === 'failed' || status.kind === 'offline'
    || status.kind === 'stopped';

  return (
    <div
      ref={hostRef}
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
        {playerActive ? (
          <button
            type="button"
            className="seanime-host-btn seanime-host-back"
            onClick={leavePlayer}
            title={openedForPlayback ? t('mediaWorkspace.backHint') : t('mediaWorkspace.backToLibraryHint')}
          >
            <span aria-hidden="true">←</span>{' '}
            {openedForPlayback ? t('common.back') : t('mediaWorkspace.backToLibrary')}
          </button>
        ) : null}
        <strong className="seanime-host-title">{t('mediaWorkspace.launcher')}</strong>
        {/* Silent when all is well: "Adopted library · sidecar ready" on every open said
            nothing a learner could use (audit 2026-09-23). A server that is starting, stopped
            or failed still says so here, beside the body's own explanation. */}
        <span
          className="seanime-host-status"
          data-sidecar={status.kind}
          role="status"
          aria-live="polite"
        >
          {status.kind === 'ready' ? null : (
            <>
              <span className="seanime-host-dot" aria-hidden="true" />
              {t('mediaWorkspace.status', { status: statusLabel })}
            </>
          )}
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
            // Also clears the in-host route and stops a playing video. Without this, pressing
            // Library while an entry or the player is up is a control that visibly does
            // nothing: `view` is already 'library', so the state never changes.
            onClick={backToLibrary}
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
              fallback={<LiquidLoading layout="study" />}
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
        {/* One loader from "server stopped" to "library drawn": the same swirl the pane's
            Suspense uses. A cold open used to cycle 5-7 looks — "The media server is stopped"
            with a Start button for a frame (auto-start was already on its way), "starting",
            "Connecting…", then the swirl (transition audit 2026-09-23). Real failures still
            get words and a retry below. */}
        {view === 'review' ? null
          : (status.kind === 'stopped' && !stoppedTooLong)
            || status.kind === 'starting'
            || (status.kind === 'ready' && !conn) ? (
            <LiquidLoading layout="library" />
          ) : status.kind !== 'ready' ? (
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
        ) : !conn ? null : !conn.baseUrl ? (
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
                fallback={<LiquidLoading layout="library" />}
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
                  fallback={<LiquidLoading layout="library" />}
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
