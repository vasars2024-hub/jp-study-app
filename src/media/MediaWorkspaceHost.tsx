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
  sectionOpensMediaWorkspace,
  STUDY_REVIEW_FOCUS_EVENT,
  type MediaWorkspaceOpenRequest,
  type MediaWorkspacePlaybackRequest,
  type StudyReviewFocusRequest,
} from '../shared/mediaWorkspace';
import { SIDECAR_STATUS_KEY } from '../shared/mediaWorkspaceLabels';
import { useT } from '../renderer/i18n';
import { useSeanimeConnection } from './useSeanimeConnection';
// Type-only, so all three erase at build time and the boot bundle is unchanged — the
// invariant this file's header states. The runtime halves are `await import()`ed below.
import type { StudyOrchestratorDocument } from '../shared/mediaStudyOrchestrator';
import type { StudyReadinessFingerprints } from '../shared/seanimeStudyLibrary';
import type {
  SeanimeStudyAnalyseAction,
} from '../renderer/components/reading/SeanimeStudyLibraryPanel';

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
  const { t, lang } = useT();
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
    // Old-player retirement, 2026-07-31: `player` joins `video` here. Both sections now
    // render `MediaWorkspaceSectionView`, and this listener is the ONE thing that opens the
    // workspace for them — the section deliberately does not dispatch on mount.
    //
    // It used to, and that was a real defect: the section's open is gated behind an async
    // `seanimeStatus()` round trip, so closing the workspace within that window let the
    // late dispatch reopen it. Two mechanisms opening one overlay is also two chances to
    // disagree about when it should be open. Keep this the only one.
    const onOsOpen = (event: Event): void => {
      // Slice 14: the same list `AppSection` routes on and `App` mounts pop-out hosts
      // from. This condition used to be the only one of the three that was complete.
      if (sectionOpensMediaWorkspace((event as CustomEvent<unknown>).detail)) bringForward();
    };
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
    window.addEventListener('os:open', onOsOpen);
    return () => {
      releaseHost();
      window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onWorkspaceOpen);
      window.removeEventListener(STUDY_REVIEW_FOCUS_EVENT, onReviewFocus);
      window.removeEventListener('os:open', onOsOpen);
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

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
   * The readiness panel's three props. See the block comment above `analyse` for why it is
   * three and not the one the carried record claimed.
   * ----------------------------------------------------------------------------------- */
  const [studyDocument, setStudyDocument] = useState<StudyOrchestratorDocument | null>(null);
  const [studyFingerprints, setStudyFingerprints] =
    useState<StudyReadinessFingerprints | null>(null);

  /**
   * Loaded when the readiness segment is actually shown, never on mount.
   *
   * `renderer/mediaStudyOrchestrator.ts` reaches the known-words store, the level lists and
   * the frequency dictionaries to build the fingerprints, so a static import would put all
   * of that in the boot path and break this file's standing promise that a build with the
   * sidecar off starts up unchanged. `await import()` keeps it in the segment's own chunk,
   * beside the `React.lazy` panels it feeds.
   *
   * The `study:changed` subscription is what makes the analyse row transition at all. The
   * main-process `persist()` broadcasts the whole document on every write, so a successful
   * prepare pushes a fresher document here and the row re-derives its badge from real
   * readiness — the panel's own header says the badge can only change "once whoever supplies
   * the document supplies a fresher one", and this is that supplier.
   */
  useEffect(() => {
    if (view !== 'readiness') return;
    let dead = false;
    let release: (() => void) | undefined;
    void (async () => {
      try {
        const { currentStudyReadinessFingerprints, initializeStudyOrchestrator } =
          await import('../renderer/mediaStudyOrchestrator');
        const [document, fingerprints] = await Promise.all([
          initializeStudyOrchestrator(),
          currentStudyReadinessFingerprints(),
        ]);
        if (dead) return;
        setStudyDocument(document);
        setStudyFingerprints(fingerprints);
        release = window.api.onStudyChanged((next) => setStudyDocument(next));
      } catch {
        // A readiness document that cannot be read is a panel with no scores, which is
        // exactly what it renders from `undefined`. It is not a reason to blank the segment.
      }
    })();
    return () => {
      dead = true;
      release?.();
    };
  }, [view]);

  /**
   * The analyse row action, wired to the real `study:prepare` path.
   *
   * **The carried record called this "one prop". It is three, and the other two are not
   * decoration.** `onAnalyse` alone makes the button render and fire, but readiness lives in
   * the orchestrator document, which the panel takes as a prop and does not own: with no
   * `orchestrator`, `joinSeanimeStudyLibrary` finds no snapshot for any file, so every linked
   * row is pinned at `unanalyzed` forever, `ready` and `stale` are unreachable states, and a
   * successful analyse changes nothing the user can see. `fingerprints` is what separates a
   * current score from `stale`. Supplying only `onAnalyse` would have replaced a button that
   * does nothing with a button that does something invisible.
   *
   * `unanalyzed` and `stale` are the only states that render the button, and
   * `joinSeanimeStudyLibrary` gives both a `studyMediaId` and a `subtitleRecordId` — the two
   * arguments `prepareStudyMediaById` takes. The guard below is therefore unreachable by
   * construction rather than defensive-in-case; it reuses the `unlinked` row's own wording
   * instead of inventing a string for a case that cannot arrive.
   */
  const analyse = useCallback<SeanimeStudyAnalyseAction>(async (entry) => {
    if (!entry.studyMediaId) throw new Error(t('studyLibrary.action.unlinked'));
    const { prepareStudyMediaById } = await import('../renderer/mediaStudyOrchestrator');
    const result = await prepareStudyMediaById(entry.studyMediaId, entry.subtitleRecordId);
    return result.status === 'queued-transcription'
      ? { status: 'queued-transcription', stage: result.stage }
      : {
        status: 'prepared',
        candidateCount: result.candidateCount,
        readinessCategory: result.readinessCategory,
      };
    // `lang`, never `t` — `t`'s identity is stable by design, so depending on it goes stale
    // after a language switch instead of erroring (CLAUDE.md i18n rule 6).
  }, [lang]);

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
      className="seanime-host"
      role="dialog"
      aria-modal="true"
      aria-label={t('mediaWorkspace.launcher')}
    >
      <header className="seanime-host-bar">
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
            onClick={() => setView('library')}
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
        <button
          ref={closeRef}
          type="button"
          className="seanime-host-btn seanime-host-close"
          onClick={close}
        >
          {t('common.close')}
        </button>
      </header>
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
                    orchestrator={studyDocument ?? undefined}
                    fingerprints={studyFingerprints ?? undefined}
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
