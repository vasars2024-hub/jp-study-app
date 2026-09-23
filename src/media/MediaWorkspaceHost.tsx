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
import { requestMediaCenter } from '../renderer/mediaCenterIntent';
import { useSeanimeConnection } from './useSeanimeConnection';

const MediaWorkspace = React.lazy(() => import('./MediaWorkspace'));

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
  // Status tracking, the connection bootstrap and the auto-start live in
  // `useSeanimeConnection` — Blanc's toolbox player needs exactly the same three rules
  // (slice 15). `open` is the gate: a closed host must not hold the sidecar up. The
  // bootstrap still resolves BEFORE React.lazy pulls the adopted bundle, which is the
  // ordering `seanimeBootstrap.ts` exists to guarantee.
  const { status, conn } = useSeanimeConnection(open);
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
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen);
    window.addEventListener(STUDY_REVIEW_FOCUS_EVENT, onReviewFocus);
    return () => {
      releaseHost();
      window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen);
      window.removeEventListener(STUDY_REVIEW_FOCUS_EVENT, onReviewFocus);
    };
  }, []);

  // Publish the overlay's real open state so the sections behind it can describe it
  // truthfully instead of inferring it from sidecar availability (audit F15).
  useEffect(() => {
    setMediaWorkspaceOpen(open);
    return () => setMediaWorkspaceOpen(false);
  }, [open]);

  // Closing drops the video too: kept, a later open remounted the player and it replayed the
  // last file (or its error screen) on its own (transition audit 2026-09-23).
  const close = useCallback(() => {
    setOpen(false);
    setPlaybackRequest(null);
  }, []);

  /*
   * Is a video on screen (or opening)? Read from the slice's own published state
   * (`data-study-player`), watched with a MutationObserver because the slice is lazy. When a
   * player that WAS up goes idle — VideoCore's own Close Player on an error screen — the host
   * closes with it: there is nothing else here to look at.
   */
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hadPlayerRef = useRef(false);
  const [playerActive, setPlayerActive] = useState(false);
  useEffect(() => {
    const root = hostRef.current;
    hadPlayerRef.current = false;
    if (!open || !root) {
      setPlayerActive(false);
      return undefined;
    }
    const read = (): void => {
      const up = root.querySelector(
        '.study-player-slice:is([data-study-player="active"], [data-study-player="loading"])',
      ) != null;
      setPlayerActive(up);
      if (up) hadPlayerRef.current = true;
      else if (hadPlayerRef.current && root.querySelector('.study-player-slice')) close();
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
  }, [close, open, status?.kind]);

  /*
   * What is playing, named the way the Media Center names it ("Midnight Kitchen · Episode 1",
   * 第1話 in Japanese). The adopted player's own title strip named anime only — a drama had
   * no title anywhere — and named them differently from the library. Falls back to the file
   * name.
   */
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!playbackRequest || playbackRequest.kind !== 'local') {
      setNowPlayingTitle(null);
      return undefined;
    }
    const path = playbackRequest.localFilePath;
    const norm = (value: string): string => value.replace(/\\/g, '/').toLowerCase();
    const base = path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1)
      .replace(/\.[^.]+$/, '');
    setNowPlayingTitle(base);
    let cancelled = false;
    // Guarded like the status calls: a window or harness without the library API keeps the
    // file-name title rather than throwing out of an effect.
    if (typeof window.api?.listMedia !== 'function') return undefined;
    void window.api.listMedia().then((items) => {
      if (cancelled) return;
      const item = items.find((entry) => norm(entry.path ?? '') === norm(path));
      if (!item) return;
      const series = item.seriesTitle || item.title || base;
      const episode = item.episode && item.episode > 0
        ? t('mediaWorkspace.episode', { number: item.episode })
        : '';
      setNowPlayingTitle(episode ? `${series} · ${episode}` : series);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [playbackRequest, t]);

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
    publish();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [open, status?.kind]);

  /*
   * A stopped sidecar is normally a moment: opening the player auto-starts it, so for that
   * moment it shows the loader, not "stopped" and a Start button. If it is STILL stopped
   * after a few seconds the auto-start did not take, and the words and the button come
   * back — a loader must never spin on a server nobody is starting.
   */
  const [stoppedTooLong, setStoppedTooLong] = useState(false);
  useEffect(() => {
    setStoppedTooLong(false);
    if (!open || status?.kind !== 'stopped') return undefined;
    const timer = window.setTimeout(() => setStoppedTooLong(true), STOPPED_GRACE_MS);
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

  if (!status || status.kind === 'disabled') return null;

  const statusLabel = sidecarStatusLabel(status.kind, t);
  // The other three hosts' own strings, reused verbatim so one enable flow reads
  // the same wherever it is met.
  const liquidLabel = presentation.liquid
    ? t('desktop.returnToStandard')
    : t('desktop.makeLiquid');

  if (!open) {
    // Nothing on screen while closed. This invisible marker keeps "a host is mounted and its
    // sidecar is not disabled" answerable from the DOM (`mediaWorkspaceHostIsMounted`).
    return <span className="seanime-host-present" data-sidecar={status.kind} hidden />;
  }

  const retryable = status.kind === 'failed' || status.kind === 'offline'
    || status.kind === 'stopped';
  const loading = (status.kind === 'stopped' && !stoppedTooLong)
    || status.kind === 'starting'
    || (status.kind === 'ready' && !conn);

  return (
    <div
      ref={hostRef}
      className={`seanime-host${presentation.liquid ? ' workspace-liquid' : ''}`}
      data-now-playing={playerActive && nowPlayingTitle ? 'true' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={nowPlayingTitle ?? t('mediaWorkspace.launcher')}
      data-presentation={presentation.dataPresentation}
    >
      {/* The bar is navigation and transport by §2.3, so it is the region that takes the
          material (`theme/liquid-window.css` paints it only under `.workspace-liquid`). */}
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
        {/* Silent when all is well; a server that is starting, stopped or failed says so. */}
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
      <div className="seanime-host-body">
        {/* One loader from "server stopped" to "video drawn"; real failures get words and a
            retry. */}
        {loading ? (
          <LiquidLoading layout="study" />
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
        ) : (
          <Suspense fallback={<LiquidLoading layout="study" />}>
            <MediaWorkspace
              key={`seanime-${status.pid ?? 'none'}-${status.port}`}
              conn={conn}
              playbackRequest={playbackRequest}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

