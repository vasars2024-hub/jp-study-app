/**
 * The host half of detach: keeps real OS windows and the workspace layout agreeing.
 *
 * The workspace document is the source of truth for *whether* a block is detached; the
 * main process is the source of truth for *whether a window exists*. Those two can
 * disagree in both directions and both are normal:
 *
 *   · layout says detached, no window — a restored layout on a fresh launch, or a
 *     workspace switch. This hook opens one.
 *   · window exists, layout says docked — the user closed the panel from the menu, or
 *     switched to a workspace that does not include it. This hook closes it.
 *   · window vanished on its own — the user hit the OS close button. The block returns
 *     to its dock rather than becoming invisible, which is the prompt's rule:
 *     "closing a detached block should return it safely to its workspace".
 *
 * Reconciliation is therefore one effect over the *difference* between those two sets,
 * not a pile of imperative calls at each call site. That is also what makes it safe to
 * run in a window with no `window.api` at all: `available` goes false, every entry
 * point becomes a no-op, and the workspace behaves exactly as it did before detach
 * existed (dev harnesses and jsdom take this path).
 */
import React from 'react';
import {
  appSectionForBlock,
  DETACHED_MIN_HEIGHT,
  DETACHED_MIN_WIDTH,
  isHostedDetachBlock,
  trimCues,
  type DetachCue,
  type DetachedWindowInfo,
  type StudyDetachCommand,
  type StudyDetachSnapshot,
} from '../shared/studyDetach';
import type { ResolvedLayout, StudyBlockId, WorkspaceAction } from '../shared/studyWorkspace';
import { detachWindowId } from '../shared/studyDetach';

export { DETACHED_MIN_HEIGHT, DETACHED_MIN_WIDTH };

/** Everything the host must be able to do when a detached panel asks for it. */
export interface StudyDetachHandlers {
  seekCue: (index: number) => void;
  togglePlay: () => void;
  replayLine: () => void;
  analyzeNow: () => void;
  selectAnnotation: (index: number) => void;
  lookup: (query: string, context: string) => void;
  setAiMode: (mode: 'analysis' | 'translation') => void;
  translate: () => void;
  mine: () => void;
}

/**
 * The snapshot minus the fields the transport fills in, and minus the clock.
 *
 * Playback position is deliberately *not* a React value here. The player has no
 * `currentTime` state and must not grow one: a `timeupdate` handler calling `setState`
 * re-renders the whole overlay four to five times a second while a video plays, which
 * is the performance rule (§27, "video playback must not stutter") failing in the one
 * place it matters most. The publisher reads the element directly instead, via
 * `readMedia`, and only when a publish is actually due.
 */
export type StudyDetachFrame = Omit<
  StudyDetachSnapshot,
  'sourceId' | 'revision' | 'surface' | 'cues' | 'positionSec' | 'durationSec' | 'paused'
>;

/** Live clock, read at publish time. */
export interface StudyDetachMediaRead {
  positionSec: number;
  durationSec: number;
  paused: boolean;
}

export interface StudyDetachApi {
  /** False in a window with no Electron bridge — every action below is then inert. */
  available: boolean;
  windows: readonly DetachedWindowInfo[];
  /** True when this block currently has a window of its own. */
  isDetached: (blockId: StudyBlockId) => boolean;
  detach: (blockId: StudyBlockId, displayKey?: string) => void;
  attach: (blockId: StudyBlockId) => void;
  sendToDisplay: (blockId: StudyBlockId, displayKey: string) => void;
}

/**
 * The API, shared down to the block menu.
 *
 * A context rather than props threaded through `StudyDocks`: the menu is three levels
 * below the overlay and every level in between is generic over "some block", which is
 * exactly what keeps a new Study Block from needing layout changes.
 */
export const StudyDetachContext = React.createContext<StudyDetachApi | null>(null);

/** Inert when there is no host — dev harnesses, jsdom, and the detached window itself. */
export function useStudyDetachApi(): StudyDetachApi {
  const context = React.useContext(StudyDetachContext);
  const fallback = React.useMemo<StudyDetachApi>(() => ({
    available: false,
    windows: [],
    isDetached: () => false,
    detach: () => undefined,
    attach: () => undefined,
    sendToDisplay: () => undefined,
  }), []);
  return context ?? fallback;
}

/** Publishing cadence. Fast enough to follow a line, slow enough to be free. */
const PUBLISH_INTERVAL_MS = 220;

function hasBridge(): boolean {
  return typeof window !== 'undefined'
    && typeof window.api?.studyBlockOpen === 'function'
    && typeof window.api?.studyBlockPublish === 'function';
}

export function useStudyDetach({
  surface,
  layout,
  dispatch,
  frame,
  cues,
  readMedia,
  handlers,
}: {
  surface: string;
  layout: ResolvedLayout;
  dispatch: React.Dispatch<WorkspaceAction>;
  /** Rebuilt every render by the overlay; only read when a publish is actually due. */
  frame: StudyDetachFrame;
  /** The live cue list. Sent only when its identity changes — see `StudyDetachSnapshot`. */
  cues: readonly DetachCue[];
  /** Reads the `<video>` element. Called only from the publisher. */
  readMedia: () => StudyDetachMediaRead;
  handlers: StudyDetachHandlers;
}): StudyDetachApi {
  const [available] = React.useState(hasBridge);
  const [windows, setWindows] = React.useState<readonly DetachedWindowInfo[]>([]);
  const [openSections, setOpenSections] = React.useState<readonly string[]>([]);

  /*
    Refs, not state, for everything the publisher and the command listener read. Both
    run on a timer or an IPC callback rather than in render, and putting the frame in
    state would re-render the whole player every 220ms to deliver it.
  */
  const frameRef = React.useRef(frame);
  frameRef.current = frame;
  const cuesRef = React.useRef(cues);
  cuesRef.current = cues;
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;
  const readMediaRef = React.useRef(readMedia);
  readMediaRef.current = readMedia;

  /* ---------------------------------------------------------------------------- *
   * What main says is open
   * ---------------------------------------------------------------------------- */

  React.useEffect(() => {
    if (!available) return undefined;
    let alive = true;
    void window.api.studyBlockList().then((list) => {
      if (alive) setWindows(list);
    }).catch(() => undefined);
    const offBlocks = window.api.onStudyBlockWindowsChanged((list) => setWindows(list));
    // App-section detach reuses the app's own pop-out windows, so its "is it open"
    // signal is the pop-out registry rather than the block registry.
    let offSections: (() => void) | undefined;
    if (typeof window.api.onPopoutChanged === 'function') {
      offSections = window.api.onPopoutChanged((sections) => setOpenSections(sections));
      void window.api.popoutListOpen?.().then((sections) => {
        if (alive) setOpenSections(sections);
      }).catch(() => undefined);
    }
    return () => {
      alive = false;
      offBlocks();
      offSections?.();
    };
  }, [available]);

  /* ---------------------------------------------------------------------------- *
   * Reconcile layout <-> windows
   * ---------------------------------------------------------------------------- */

  /** Blocks the layout currently wants in their own window. */
  const wanted = React.useMemo(() => {
    const map = new Map<StudyBlockId, { displayKey?: string; windowId: string }>();
    for (const block of layout.blocks) {
      if (block.effectivePlacement !== 'detached') continue;
      // A detached block that has been closed (bottom-bar toggle, workspace switch)
      // must take its window with it — otherwise a panel the user just dismissed keeps
      // sitting on their second monitor.
      if (block.effectivePresence === 'hidden') continue;
      map.set(block.blockId, {
        displayKey: block.detached?.displayKey,
        windowId: block.detached?.windowId ?? '',
      });
    }
    return map;
  }, [layout]);

  /*
    Blocks this hook has asked main to open. Without it, the "window vanished -> re-dock"
    rule would fire on the very first pass, before the window it is waiting for has
    finished loading, and a detached block would flap back into its dock every time.
  */
  const requestedRef = React.useRef(new Set<StudyBlockId>());

  React.useEffect(() => {
    if (!available) return;
    const liveHosted = new Set(
      windows.filter((entry) => entry.surface === surface).map((entry) => entry.blockId),
    );

    for (const [blockId, intent] of wanted) {
      const section = appSectionForBlock(blockId);
      if (section) {
        if (!openSections.includes(section) && !requestedRef.current.has(blockId)) {
          requestedRef.current.add(blockId);
          void window.api.popOut(section);
        }
        continue;
      }
      if (!isHostedDetachBlock(blockId)) continue;
      if (liveHosted.has(blockId)) {
        requestedRef.current.delete(blockId);
        // Record the live handle once, so a later reload knows this was detached on
        // purpose. Guarded on the handle being absent — dispatching unconditionally
        // would push an undo entry on every reconcile.
        if (!intent.windowId) {
          dispatch({
            type: 'detach-block',
            blockId,
            windowId: detachWindowId(blockId, surface),
            ...(intent.displayKey ? { displayKey: intent.displayKey } : {}),
          });
        }
        continue;
      }
      if (requestedRef.current.has(blockId)) continue;
      requestedRef.current.add(blockId);
      void window.api.studyBlockOpen(blockId, surface, intent.displayKey);
    }

    // Windows this workspace no longer wants.
    for (const entry of windows) {
      if (entry.surface !== surface) continue;
      if (wanted.has(entry.blockId as StudyBlockId)) continue;
      requestedRef.current.delete(entry.blockId as StudyBlockId);
      void window.api.studyBlockClose(entry.blockId, surface);
    }
  }, [available, dispatch, openSections, surface, wanted, windows]);

  /*
    The user closed a detached window with the OS button: main stops listing it, the
    layout still says detached, and nothing is on screen. Re-dock it.

    Split from the effect above rather than folded into it because it must only run
    against a list main has actually reported — `windows` starts empty, and re-docking
    on that first empty render is precisely the bug this ordering avoids.
  */
  const reportedRef = React.useRef(false);
  React.useEffect(() => {
    if (!available) return;
    if (!reportedRef.current) {
      reportedRef.current = true;
      return;
    }
    for (const [blockId] of wanted) {
      const section = appSectionForBlock(blockId);
      if (section) {
        if (requestedRef.current.has(blockId) && !openSections.includes(section)) continue;
        if (!openSections.includes(section)) dispatch({ type: 'attach-block', blockId });
        continue;
      }
      if (requestedRef.current.has(blockId)) continue;
      const live = windows.some(
        (entry) => entry.surface === surface && entry.blockId === blockId,
      );
      if (!live) dispatch({ type: 'attach-block', blockId });
    }
  }, [available, dispatch, openSections, surface, wanted, windows]);

  /* ---------------------------------------------------------------------------- *
   * Publish
   * ---------------------------------------------------------------------------- */

  const hostedOpen = windows.some(
    (entry) => entry.surface === surface && isHostedDetachBlock(entry.blockId),
  );

  React.useEffect(() => {
    // Nothing is detached: publish nothing. The bus must cost zero while the player is
    // being used normally, which is the overwhelming majority of the time.
    if (!available || !hostedOpen) return undefined;

    let revision = 0;
    let lastCues: readonly DetachCue[] | null = null;
    const publish = (): void => {
      const current = frameRef.current;
      const cueList = cuesRef.current;
      // Identity comparison, not deep: the overlay holds the array in state and
      // replaces it when the track changes, which is exactly the event that matters.
      const cuesChanged = cueList !== lastCues;
      lastCues = cueList;
      revision += 1;
      window.api.studyBlockPublish({
        ...current,
        ...readMediaRef.current(),
        // Stamped by main from `e.sender.id`; carried here only so the payload is a
        // complete `StudyDetachSnapshot` rather than a partial one.
        sourceId: 0,
        surface,
        revision,
        cues: cuesChanged ? trimCues(cueList) : null,
      });
    };

    publish();
    const timer = window.setInterval(publish, PUBLISH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [available, hostedOpen, surface]);

  /* ---------------------------------------------------------------------------- *
   * Commands coming back
   * ---------------------------------------------------------------------------- */

  React.useEffect(() => {
    if (!available || typeof window.api.onStudyBlockCommand !== 'function') return undefined;
    return window.api.onStudyBlockCommand((command: StudyDetachCommand) => {
      const api = handlersRef.current;
      switch (command.type) {
        case 'seek-cue': api.seekCue(command.index); break;
        case 'toggle-play': api.togglePlay(); break;
        case 'replay-line': api.replayLine(); break;
        case 'analyze-now': api.analyzeNow(); break;
        case 'select-annotation': api.selectAnnotation(command.index); break;
        case 'lookup': api.lookup(command.query, command.context); break;
        case 'set-ai-mode': api.setAiMode(command.mode); break;
        case 'translate': api.translate(); break;
        case 'mine': api.mine(); break;
        case 'closing': dispatch({ type: 'attach-block', blockId: command.blockId }); break;
      }
    });
  }, [available, dispatch]);

  /* ---------------------------------------------------------------------------- *
   * Entry points
   * ---------------------------------------------------------------------------- */

  const isDetached = React.useCallback((blockId: StudyBlockId): boolean => {
    const section = appSectionForBlock(blockId);
    if (section) return openSections.includes(section);
    return windows.some((entry) => entry.surface === surface && entry.blockId === blockId);
  }, [openSections, surface, windows]);

  const detach = React.useCallback((blockId: StudyBlockId, displayKey?: string): void => {
    if (!available) return;
    // The layout change is what drives the window, not the other way round: the
    // reconciler above sees the new intent and opens it. One path, so a detach from the
    // menu and a detach restored from storage cannot behave differently.
    dispatch({
      type: 'detach-block',
      blockId,
      windowId: '',
      ...(displayKey ? { displayKey } : {}),
    });
  }, [available, dispatch]);

  const attach = React.useCallback((blockId: StudyBlockId): void => {
    requestedRef.current.delete(blockId);
    dispatch({ type: 'attach-block', blockId });
  }, [dispatch]);

  const sendToDisplay = React.useCallback((blockId: StudyBlockId, displayKey: string): void => {
    if (!available) return;
    const section = appSectionForBlock(blockId);
    if (section) {
      if (!openSections.includes(section)) {
        detach(blockId, displayKey);
        return;
      }
      void window.api.studyBlockSendToDisplay({ section, displayKey });
      return;
    }
    if (!isDetached(blockId)) {
      // Not detached yet — "send to display 2" means detach *there*, not "do nothing".
      detach(blockId, displayKey);
      return;
    }
    void window.api.studyBlockSendToDisplay({ blockId, surface, displayKey });
    dispatch({ type: 'detach-block', blockId, windowId: detachWindowId(blockId, surface), displayKey });
  }, [available, detach, dispatch, isDetached, openSections, surface]);

  return { available, windows, isDetached, detach, attach, sendToDisplay };
}
