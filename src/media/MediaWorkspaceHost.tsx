/**
 * The media PLAYER — full-screen, opened to play one video and closed when it is done.
 *
 * Since 2026-09-23 it is player-only. The Media Center is the one media library (anime,
 * TV, films, downloads alike), so the Library / Readiness / Review panes this host used to
 * carry live there, and a bare "open the media workspace" or a "review this file" hand-off
 * is forwarded to it (`renderer/mediaCenterIntent.ts`).
 *
 * Mount point, following the Phase-1 dev-panel pattern exactly:
 * it renders nothing unless the main process reports a non-`disabled` sidecar, so a
 * normal build never shows it and `DesktopShell.tsx`, the desktop grid, the dragging
 * layer and the taskbar are all untouched.
 *
 * The adopted surface is loaded with React.lazy so none of the 46 adopted packages are
 * in the boot path — with the flag off, the app's startup bundle is unchanged.
 *
 * ## Seamless playback (2026-10-13)
 *
 * "Make the video playing seamless — minimize loading screens or weird 'server not started'
 * BS" (owner). What changed here, and the measured reason for each:
 *
 *  - **An opening frame, not a loader.** From the click to the first decoded frame the
 *    body shows `PlayerFrame`: the last frame the viewer left this file on (or its still /
 *    thumbnail) and one small "Opening …" pill. It used to step through "Media server
 *    stopped", "Media server starting", a spinner, "Connecting to the media server…",
 *    "Provisioning the media connection…" and "Opening local file".
 *  - **The server is never the viewer's problem unless it failed.** The bar no longer
 *    narrates the sidecar's state. Main warms it after boot and restarts it after a crash
 *    (`main/seanime/lifecycle.ts`); the request is simply held (queued) here until it is
 *    ready and then plays. Only a stated failure — the lifecycle gave up, the binary is
 *    missing, the connection could not be made, the player could not open the file —
 *    shows words, translated, with a Retry that re-runs the very same open.
 *  - **A warm player.** After the first video the adopted surface stays mounted while the
 *    player is closed (hidden, holding its connection and websocket identity), so a re-open
 *    or a resume skips the chunk, the status read, the socket handshake and the React
 *    mount. It is released after `WARM_KEEP_MS` closed. A media view coming into sight can
 *    ask for the same warm-up before the first video (`PLAYER_WARM_EVENT`).
 *
 * The host chrome uses Study OS's shared EN/JA/ZH/RU catalog. ADR-003's
 * temporary Phases 2–3 exemption was removed at the Phase-4 exit gate.
 */
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { type SeanimeStatus } from '../shared/seanime';
import {
  MEDIA_WORKSPACE_CLOSE_EVENT,
  MEDIA_WORKSPACE_OPEN_EVENT,
  normalizeMediaWorkspaceOpenRequest,
  registerMediaWorkspaceHost,
  setMediaWorkspaceOpen,
  STUDY_REVIEW_FOCUS_EVENT,
  type MediaWorkspaceOpenRequest,
  type MediaWorkspacePlaybackRequest,
  type StudyReviewFocusRequest,
} from '../shared/mediaWorkspace';
import { PLAYER_WARM_EVENT } from '../shared/playerWarm';
import type { PlaybackPlan } from '../shared/playbackPlan';
import { useT } from '../renderer/i18n';
import { ContextualSurface } from '../renderer/components/liquid/LiquidSurface';
import { useWorkspacePresentation } from '../renderer/workspacePresentation';
import { requestMediaCenter } from '../renderer/mediaCenterIntent';
import { useSeanimeConnection } from './useSeanimeConnection';
import PlayerFrame, { type PlayerFrameFailure } from './PlayerFrame';
import { forgetPlaybackPlan, getPlaybackPlan, playbackTitle } from './playbackPlanClient';
import { lastFrameFor, rememberLastFrame } from './lastFrameCache';

const MediaWorkspace = React.lazy(() => import('./MediaWorkspace'));

/** A closed warm player is released after this long, so an idle app gives the memory back. */
const WARM_KEEP_MS = 10 * 60_000;
/** A sidecar still `stopped` this long after an open was nudged did not start: say so. */
const STOPPED_TOO_LONG_MS = 10_000;
/**
 * A media element that errored and has not drawn a frame this long after: the player's own
 * fallbacks (the transcoder switch takes ~3.4 s cold) did not rescue it.
 */
const MEDIA_ERROR_GRACE_MS = 9_000;

/** The failure sentence for a sidecar that could not be brought up. */
function serverFailureKey(status: SeanimeStatus): string {
  switch (status.errorCode) {
    case 'missing-exe':
    case 'spawn-failed':
    case 'unhealthy':
    case 'port':
    case 'disabled':
      return `playback.failed.${status.errorCode}`;
    default:
      return 'playback.failed.crashed';
  }
}

export default function MediaWorkspaceHost(): React.ReactElement | null {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [playbackRequest, setPlaybackRequest] =
    useState<MediaWorkspacePlaybackRequest | null>(null);
  /**
   * Keep the adopted surface mounted while closed (see "A warm player" above). Set by the
   * first open that reaches the player, or by a media view asking ahead of time.
   */
  const [warmHeld, setWarmHeld] = useState(false);
  // Status tracking, the connection bootstrap and the auto-start live in
  // `useSeanimeConnection` — Blanc's toolbox player needs exactly the same rules
  // (slice 15). The bootstrap still resolves BEFORE React.lazy pulls the adopted bundle,
  // which is the ordering `seanimeBootstrap.ts` exists to guarantee.
  const { status, conn, retryConnection } = useSeanimeConnection(open || warmHeld, open);
  // L3.2 — the fourth presentation host (`renderer/workspacePresentation.ts`): the Liquid
  // toggle in the bar, and the material the bar takes under `.workspace-liquid`.
  const presentation = useWorkspacePresentation();

  useEffect(() => {
    // Presence is published from inside the listener effect, never from a render or a
    // separate effect, so "a host exists" and "the open event has a listener" are one
    // fact with one lifetime (see `mediaWorkspaceHostExists`).
    const releaseHost = registerMediaWorkspaceHost();
    const onWorkspaceOpen = (event: Event): void => {
      const request = normalizeMediaWorkspaceOpenRequest(
        (event as CustomEvent<MediaWorkspaceOpenRequest>).detail,
      );
      // Nothing to play: the library is where a viewer picks something, so go there.
      if (!request) {
        requestMediaCenter({ tab: 'library' });
        return;
      }
      // The server is wanted NOW: nudge it in the same tick as the click, before React
      // has even rendered the frame. A no-op when it is already up. (No blocking-start
      // fallback here: `useSeanimeConnection` nudges a stopped server once it renders.)
      void window.api?.seanimeWarm?.(0).catch(() => undefined);
      if (request.kind === 'local') void getPlaybackPlan(request.localFilePath);
      setPlaybackRequest(request);
      setOpen(true);
    };
    // "Review this file" (a readiness row, the desktop Continue-watching widget) lands on the
    // Media Center's Review page, focused on that file.
    const onReviewFocus = (event: Event): void => {
      const detail = (event as CustomEvent<StudyReviewFocusRequest>).detail;
      if (!detail?.pathKey) return;
      requestMediaCenter({ tab: 'review', focus: detail });
    };
    // A media view came into sight: a video is likely next. Warm the server and the player.
    const onWarm = (): void => {
      void window.api?.seanimeWarm?.(0).catch(() => undefined);
      setWarmHeld(true);
    };
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen);
    const onWorkspaceClose = (): void => {
      setOpen(false);
      setPlaybackRequest(null);
    };
    window.addEventListener(MEDIA_WORKSPACE_CLOSE_EVENT, onWorkspaceClose);
    window.addEventListener(STUDY_REVIEW_FOCUS_EVENT, onReviewFocus);
    window.addEventListener(PLAYER_WARM_EVENT, onWarm);
    return () => {
      releaseHost();
      window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen);
      window.removeEventListener(MEDIA_WORKSPACE_CLOSE_EVENT, onWorkspaceClose);
      window.removeEventListener(STUDY_REVIEW_FOCUS_EVENT, onReviewFocus);
      window.removeEventListener(PLAYER_WARM_EVENT, onWarm);
    };
  }, []);

  // Publish the overlay's real open state so the sections behind it can describe it
  // truthfully instead of inferring it from sidecar availability (audit F15).
  useEffect(() => {
    setMediaWorkspaceOpen(open);
    return () => setMediaWorkspaceOpen(false);
  }, [open]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const localPath = playbackRequest?.kind === 'local' ? playbackRequest.localFilePath : null;
  const workspaceReady = status?.kind === 'ready' && conn !== null && conn.baseUrl !== '';

  // Closing drops the video too: kept, a later open remounted the player and it replayed the
  // last file (or its error screen) on its own (transition audit 2026-09-23). The frame on
  // screen is kept first, as the opening picture for this file's next open.
  const close = useCallback(() => {
    const video = hostRef.current?.querySelector('video');
    rememberLastFrame(localPath, video);
    setOpen(false);
    setPlaybackRequest(null);
  }, [localPath]);

  /*
   * Is a video on screen (or opening)? Read from the slice's own published state
   * (`data-study-player`), watched with a MutationObserver because the slice is lazy. When a
   * player that WAS up goes idle — VideoCore's own Close Player on an error screen — the host
   * closes with it: there is nothing else here to look at. The slice also publishes the
   * error it is showing (`data-study-error`), which the opening frame turns into a stated,
   * retryable failure.
   */
  const hadPlayerRef = useRef(false);
  const [playerActive, setPlayerActive] = useState(false);
  const [sliceError, setSliceError] = useState<string | null>(null);
  useEffect(() => {
    const root = hostRef.current;
    hadPlayerRef.current = false;
    setSliceError(null);
    if (!open || !root) {
      setPlayerActive(false);
      return undefined;
    }
    const read = (): void => {
      const slice = root.querySelector<HTMLElement>('.study-player-slice');
      const state = slice?.getAttribute('data-study-player');
      const up = state === 'active' || state === 'loading';
      setPlayerActive(up);
      setSliceError(slice?.getAttribute('data-study-error') || null);
      if (up) hadPlayerRef.current = true;
      else if (hadPlayerRef.current && slice) close();
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-study-player', 'data-study-error'],
    });
    return () => observer.disconnect();
  }, [close, open, status?.kind, playbackRequest?.requestId]);

  /*
   * The plan for this open (title, poster, and — for the slice — disk vs media server).
   * One IPC shared with the slice (`playbackPlanClient.ts`); it used to be `listMedia`, the
   * whole library, just to name the file in the bar.
   */
  const [plan, setPlan] = useState<PlaybackPlan | null>(null);
  useEffect(() => {
    setPlan(null);
    if (!localPath) return undefined;
    let cancelled = false;
    void getPlaybackPlan(localPath).then((next) => {
      if (!cancelled) setPlan(next);
    });
    return () => {
      cancelled = true;
    };
  }, [localPath, playbackRequest?.requestId]);

  /*
   * What is playing, named the way the Media Center names it ("Midnight Kitchen · Episode 1",
   * 第1話 in Japanese). Falls back to the file name.
   */
  const nowPlayingTitle = playbackRequest?.kind === 'local'
    ? playbackTitle(playbackRequest.localFilePath, plan, (n) => t('mediaWorkspace.episode', { number: n }))
    : playbackRequest?.kind === 'stream'
      ? `${playbackRequest.stream.seriesTitle} · ${t('mediaWorkspace.episode', { number: playbackRequest.stream.episodeNumber })}`
      : null;

  // The opening frame stays up until the requested video draws its first frame — again
  // after the player was rebuilt under it (a media server restart mid-video).
  const [firstFrame, setFirstFrame] = useState(false);
  const [mediaFailed, setMediaFailed] = useState<string | null>(null);
  /** Where the current request's video is, for a rebuild to continue from (see below). */
  const lastTimeRef = useRef<{ requestId: number; t: number } | null>(null);
  useEffect(() => {
    setFirstFrame(false);
    setMediaFailed(null);
    const root = hostRef.current;
    if (!open || !root || !playbackRequest) return undefined;
    const requestId = playbackRequest.requestId;
    let errorTimer = 0;
    let lastSnapAt = 0;
    const onTime = (event: Event): void => {
      const media = event.target;
      if (!(media instanceof HTMLVideoElement) || !Number.isFinite(media.currentTime)) return;
      lastTimeRef.current = { requestId, t: media.currentTime };
      // Keep the opening picture fresh for a rebuild under a playing video (cheap: a
      // 180-px JPEG every few seconds).
      const now = Date.now();
      if (now - lastSnapAt > 5000 && !media.paused) {
        lastSnapAt = now;
        rememberLastFrame(localPath, media);
      }
    };
    const onFrame = (event: Event): void => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      window.clearTimeout(errorTimer);
      errorTimer = 0;
      setMediaFailed(null);
      setFirstFrame(true);
    };
    const onError = (event: Event): void => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement) || !media.error) return;
      const detail = media.error.message || `MediaError ${media.error.code}`;
      window.clearTimeout(errorTimer);
      errorTimer = window.setTimeout(() => setMediaFailed(detail), MEDIA_ERROR_GRACE_MS);
    };
    root.addEventListener('loadeddata', onFrame, true);
    root.addEventListener('playing', onFrame, true);
    root.addEventListener('error', onError, true);
    root.addEventListener('timeupdate', onTime, true);
    return () => {
      window.clearTimeout(errorTimer);
      root.removeEventListener('loadeddata', onFrame, true);
      root.removeEventListener('playing', onFrame, true);
      root.removeEventListener('error', onError, true);
      root.removeEventListener('timeupdate', onTime, true);
    };
  }, [open, playbackRequest, workspaceReady, localPath]);

  /*
   * The media server went away under an open player (a crash; main is already restarting
   * it). The adopted surface is rebuilt for the new server generation, and the request it
   * gets continues from where the video was — not from the request's original start point —
   * so the viewer sees the frame they were on, a moment of "Opening …", and the video again.
   */
  const wasReadyRef = useRef(workspaceReady);
  useEffect(() => {
    const was = wasReadyRef.current;
    wasReadyRef.current = workspaceReady;
    if (!open || !was || workspaceReady) return;
    const last = lastTimeRef.current;
    setPlaybackRequest((current) => (
      current?.kind === 'local' && last && last.requestId === current.requestId && last.t > 0.5
        ? { ...current, startAtSec: last.t }
        : current
    ));
  }, [open, workspaceReady]);

  // A closed warm player is released after a while (and never held across a restart).
  useEffect(() => {
    if (open && status?.kind === 'ready' && conn?.baseUrl) setWarmHeld(true);
  }, [open, status?.kind, conn?.baseUrl]);
  useEffect(() => {
    if (open || !warmHeld) return undefined;
    const timer = window.setTimeout(() => setWarmHeld(false), WARM_KEEP_MS);
    return () => window.clearTimeout(timer);
  }, [open, warmHeld]);

  // The bar's height, for the player that starts under it (`--seanime-host-bar-h`,
  // mediaWorkspace.css). `offsetHeight` is in CSS pixels, which is what the player's `top`
  // is read in; a bounding box would be in painted pixels under the app's zoom.
  useEffect(() => {
    const root = hostRef.current;
    const bar = root?.querySelector<HTMLElement>('.seanime-host-bar');
    if (!open || !root || !bar) return undefined;
    const publish = (): void => {
      root.style.setProperty('--seanime-host-bar-h', `${bar.offsetHeight}px`);
    };
    // The observer's first callback (after layout) publishes it; a synchronous first read
    // forced a layout in the open commit (36-47 ms, profiled 2026-09-23).
    if (typeof ResizeObserver !== 'function') {
      publish();
      return undefined;
    }
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [open, status?.kind]);

  /*
   * A stopped sidecar is normally a moment: the open nudged it, and main starts it. If it is
   * STILL stopped long after, the start did not take, and that is a failure to state (with a
   * Retry) rather than a frame that spins forever.
   */
  const [stoppedTooLong, setStoppedTooLong] = useState(false);
  useEffect(() => {
    setStoppedTooLong(false);
    if (!open || status?.kind !== 'stopped') return undefined;
    const timer = window.setTimeout(() => setStoppedTooLong(true), STOPPED_TOO_LONG_MS);
    return () => window.clearTimeout(timer);
  }, [open, status?.kind]);

  // Escape closes the player. It never acts while the user is typing (a card field), while a
  // menu, sheet or dialog inside the player is open (those close first), or in fullscreen,
  // where Escape belongs to the browser.
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
      const busy = document.querySelector(
        '.study-bar-layer:not([data-study-sheet-open="none"]), '
        + '#media-workspace [role="menu"], #media-workspace [role="dialog"], '
        + '#media-workspace [data-state="open"]',
      );
      if (busy) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open]);

  const [fontWarmReady, setFontWarmReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setFontWarmReady(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  // Move focus into the player on open and hand it back to whatever held it before on close,
  // so a keyboard user is never left tabbing through the desktop behind a full-screen layer.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement && active !== document.body
        ? active
        : null;
      backRef.current?.focus();
      return;
    }
    const back = returnFocusRef.current;
    returnFocusRef.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, [open]);

  /** Retry pressed: which failure it answers decides what is re-run. */
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    setRetrying(false);
  }, [status?.kind, conn, playbackRequest?.requestId]);

  /** The same open again, as a new request (the slice re-runs it from the top). */
  const reissue = useCallback(() => {
    setPlaybackRequest((current) => {
      if (!current) return current;
      if (current.kind === 'local') forgetPlaybackPlan(current.localFilePath);
      return { ...current, requestId: Date.now() };
    });
  }, []);

  if (!status || status.kind === 'disabled') return null;

  /*
   * Warm the subtitle face. The 14.7 MB Yu Gothic UI semibold file was loaded the moment the
   * first line appeared, and again on each warm open (30-60 ms each, more from a cold disk;
   * profiled 2026-09-23). A few Japanese characters in that face, laid out off-screen a
   * moment after start-up, load it while nothing is watching.
   */
  const fontWarm = fontWarmReady ? (
    <span className="seanime-font-warm" lang="ja" aria-hidden="true">あ漢字カナ</span>
  ) : null;

  const mountWorkspace = workspaceReady && (open || warmHeld);
  // Nothing on screen while closed and cold. This invisible marker keeps "a host is mounted
  // and its sidecar is not disabled" answerable from the DOM (`mediaWorkspaceHostIsMounted`).
  const marker = !open ? (
    <span
      className="seanime-host-present"
      data-sidecar={status.kind}
      data-sidecar-error={status.errorCode ?? undefined}
      hidden
    />
  ) : null;
  if (!open && !mountWorkspace) {
    return (
      <>
        {marker}
        {null}
        {fontWarm}
      </>
    );
  }

  // The one failure the frame may state, in priority order.
  let failure: PlayerFrameFailure | null = null;
  if (open) {
    if (status.kind === 'failed' || stoppedTooLong) {
      failure = {
        message: t(stoppedTooLong ? 'playback.failed.unhealthy' : serverFailureKey(status)),
        details: status.error,
        retrying,
        onRetry: status.errorCode === 'disabled'
          ? undefined
          : () => {
            setRetrying(true);
            void window.api.seanimeStart().catch(() => setRetrying(false));
          },
      };
    } else if (status.kind === 'ready' && conn && !conn.baseUrl) {
      failure = {
        message: t('playback.failed.connect'),
        retrying,
        onRetry: () => {
          setRetrying(true);
          retryConnection();
        },
      };
    } else if (sliceError || mediaFailed) {
      failure = {
        message: sliceError ?? t('playback.failed.player'),
        details: sliceError ? null : mediaFailed,
        onRetry: reissue,
      };
    }
  }
  const frameUp = open && playbackRequest !== null
    && (failure !== null || !workspaceReady || !firstFrame);

  const liquidLabel = presentation.liquid
    ? t('desktop.returnToStandard')
    : t('desktop.makeLiquid');

  return (
    <>
      {marker}
      <div
        ref={hostRef}
        className={open
          ? `seanime-host${presentation.liquid ? ' workspace-liquid' : ''}`
          : 'seanime-host-warm'}
        // Closed and warm: mounted, never painted, out of the accessibility tree.
        style={open ? undefined : { display: 'none' }}
        aria-hidden={open ? undefined : true}
        data-now-playing={open && playerActive && nowPlayingTitle ? 'true' : undefined}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? nowPlayingTitle ?? t('mediaWorkspace.launcher') : undefined}
        data-presentation={open ? presentation.dataPresentation : undefined}
      >
        {open ? (
          /* The bar is navigation and transport by §2.3, so it is the region that takes the
             material (`theme/liquid-window.css` paints it only under `.workspace-liquid`).
             It no longer narrates the media server: that is the frame's job, and only when
             there is something the viewer can act on. */
          <ContextualSurface as="header" className="seanime-host-bar">
            <span className="seanime-host-lead">
              <button
                ref={backRef}
                type="button"
                className="seanime-host-btn seanime-host-back"
                onClick={close}
                title={t('mediaWorkspace.backHint')}
              >
                <span aria-hidden="true">←</span> {t('common.back')}
              </button>
            </span>
            {/* The flexible middle of the bar, so it appearing and going moves nothing else. */}
            <span className="seanime-host-now" title={nowPlayingTitle ?? undefined}>
              {nowPlayingTitle}
            </span>
            <span className="seanime-host-trail">
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
            </span>
          </ContextualSurface>
        ) : null}
        <div className="seanime-host-body">
          {mountWorkspace && conn ? (
            <Suspense fallback={null}>
              <MediaWorkspace
                key={`seanime-${status.pid ?? 'none'}-${status.port}`}
                conn={conn}
                playbackRequest={open ? playbackRequest : null}
              />
            </Suspense>
          ) : null}
          {frameUp ? (
            <PlayerFrame
              overlay
              title={nowPlayingTitle}
              imageUrl={lastFrameFor(localPath) ?? plan?.posterUrl ?? null}
              failure={failure}
              onBack={failure ? close : undefined}
            />
          ) : null}
        </div>
      </div>
      {fontWarm}
    </>
  );
}
