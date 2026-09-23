/**
 * The workspace engine, mounted around the study surface.
 *
 * Everything the reducer decides lives in `shared/studyWorkspace.ts` and is pure. This
 * file is the three things that cannot be: storage, the viewport, and the keyboard.
 *
 * ## Per surface, never global
 *
 * Two study surfaces can be mounted in one window — the host overlay's workspace and
 * Blanc's toolbox player (`MediaPlayerSurface`), which is a supported state that
 * `StudyPlayerSlice`'s header calls out. A module-level singleton would have the two
 * fight over one layout, and a shared storage key would have the small toolbox player
 * overwrite the big one's arrangement. So state is React context and the storage key
 * carries the surface kind (audit §7 R7).
 *
 * ## Escape
 *
 * Escape closes the newest temporary surface and nothing else. It is registered in the
 * CAPTURE phase and stops propagation when it actually closed something, because two
 * other owners are listening for the same key: `MediaWorkspaceHost` closes the whole
 * media overlay, and the adopted VideoCore leaves fullscreen. Neither should fire while
 * a dictionary card is up — the prompt's rule is that Escape resolves temporary
 * surfaces before it touches playback or the workspace.
 */
import React from 'react';
import {
  activeWorkspace,
  createWorkspaceState,
  createDefaultWorkspaceDocument,
  parseWorkspaceDocument,
  resolveLayout,
  serializeWorkspaceDocument,
  workspaceReducer,
  WORKSPACE_STORAGE_KEY,
  type ContextualTrigger,
  type LayoutContext,
  type PracticeKind,
  type ResolvedBlock,
  type ResolvedLayout,
  type StudyBlockId,
  type StudyWorkspace,
  type ViewportInfo,
  type WorkspaceAction,
  type WorkspaceDocument,
} from '../shared/studyWorkspace';
import { STUDY_BLOCK_MAP } from './studyBlockRegistry';

/** Which surface this workspace belongs to. Part of the storage key. */
export type StudySurfaceKind = 'workspace' | 'player';

/** How long the pointer must be still before auto-hide blocks recede. */
export const IDLE_DELAY_MS = 2_600;

interface StudyWorkspaceApi {
  doc: WorkspaceDocument;
  workspace: StudyWorkspace;
  layout: ResolvedLayout;
  viewport: ViewportInfo;
  idle: boolean;
  customizing: boolean;
  reducedMotion: boolean;
  dispatch: React.Dispatch<WorkspaceAction>;
  /** Fire a contextual rule — the only way a block should ever open itself. */
  trigger: (trigger: ContextualTrigger) => void;
  /** Practice drill currently running, or null. Priority 1 in the resolution order. */
  activePractice: PracticeKind | null;
  setActivePractice: (kind: PracticeKind | null) => void;
  block: (id: StudyBlockId) => ResolvedBlock | undefined;
  isVisible: (id: StudyBlockId) => boolean;
}

const StudyWorkspaceContext = React.createContext<StudyWorkspaceApi | null>(null);

function storageKey(surface: StudySurfaceKind): string {
  return `${WORKSPACE_STORAGE_KEY}:${surface}`;
}

function readDocument(surface: StudySurfaceKind): WorkspaceDocument {
  try {
    return parseWorkspaceDocument(localStorage.getItem(storageKey(surface)), {
      definitions: STUDY_BLOCK_MAP,
    });
  } catch {
    // A blocked or full store must never be why the player will not open — the same
    // rule `StudyPlayerSlice` applies to its own storage reads.
    return createDefaultWorkspaceDocument();
  }
}

/** `matchMedia` is absent in jsdom, so this degrades to "motion allowed". */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function StudyWorkspaceProvider({
  surface = 'workspace',
  hostRef,
  children,
}: {
  surface?: StudySurfaceKind;
  /**
   * The element the workspace occupies. Measured for the responsive rules and watched
   * for pointer activity, so a pop-out player 560px wide recomposes on its own size
   * rather than on the screen's.
   */
  hostRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}): React.ReactElement {
  const [state, dispatch] = React.useReducer(
    workspaceReducer,
    surface,
    (kind: StudySurfaceKind) => createWorkspaceState(readDocument(kind), STUDY_BLOCK_MAP),
  );
  const [viewport, setViewport] = React.useState<ViewportInfo>({ width: 1280, height: 720 });
  const [idle, setIdle] = React.useState(false);
  const [activePractice, setActivePractice] = React.useState<PracticeKind | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  /* Persist. Debounced by React's own batching — one write per committed change. */
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey(surface), serializeWorkspaceDocument(state.doc));
    } catch {
      // See `readDocument`.
    }
  }, [state.doc, surface]);

  /* Measure the surface, not the screen. */
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const measure = (): void => {
      const rect = host.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };
    if (typeof ResizeObserver !== 'function') {
      measure();
      // jsdom has none. The one-shot measurement above still gives the wide layout,
      // which is the behaviour that existed before responsive rules — degrade, not fail.
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    // No synchronous first measure here: it forced a layout inside the mount commit
    // (7-29 ms, profiled 2026-09-23). The observer's first callback, after layout, has it.
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef]);

  /*
    Pointer idleness — what makes the controls fade in Watch Mode.

    Bound to the host rather than to `document` so a second surface in the same window
    does not keep this one awake, and reset by keyboard as well as pointer: a keyboard
    user driving the player with shortcuts is not idle.
  */
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let timer = 0;
    const wake = (): void => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_DELAY_MS);
    };
    wake();
    host.addEventListener('pointermove', wake);
    host.addEventListener('pointerdown', wake);
    host.addEventListener('keydown', wake);
    host.addEventListener('focusin', wake);
    return () => {
      window.clearTimeout(timer);
      host.removeEventListener('pointermove', wake);
      host.removeEventListener('pointerdown', wake);
      host.removeEventListener('keydown', wake);
      host.removeEventListener('focusin', wake);
    };
  }, [hostRef]);

  const workspace = activeWorkspace(state.doc);

  const layoutContext: LayoutContext = React.useMemo(
    () => ({ activePractice, idle }),
    [activePractice, idle],
  );
  const layout = React.useMemo(
    () => resolveLayout(workspace, layoutContext, viewport),
    [layoutContext, viewport, workspace],
  );

  const trigger = React.useCallback((next: ContextualTrigger): void => {
    dispatch({ type: 'context-trigger', trigger: next, atMs: Date.now(), viewport });
  }, [viewport]);

  /* Escape — see the header. */
  const hasTemporary = workspace.blocks.some(
    (instance) => instance.temporary && instance.presence !== 'hidden',
  );
  React.useEffect(() => {
    if (!hasTemporary && !state.doc.customizing) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (state.doc.customizing) {
        // Leaving customize mode is the first thing Escape does while it is on: the
        // edit chrome is the outermost temporary surface there is.
        event.preventDefault();
        event.stopPropagation();
        dispatch({ type: 'set-customizing', customizing: false });
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: 'dismiss-contextual' });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [hasTemporary, state.doc.customizing]);

  const block = React.useCallback(
    (id: StudyBlockId) => layout.blocks.find((entry) => entry.blockId === id),
    [layout],
  );
  const isVisible = React.useCallback(
    (id: StudyBlockId) => {
      const found = layout.blocks.find((entry) => entry.blockId === id);
      return !!found && found.effectivePresence !== 'hidden';
    },
    [layout],
  );

  const api = React.useMemo<StudyWorkspaceApi>(() => ({
    doc: state.doc,
    workspace,
    layout,
    viewport,
    idle,
    customizing: state.doc.customizing,
    reducedMotion,
    dispatch,
    trigger,
    activePractice,
    setActivePractice,
    block,
    isVisible,
  }), [
    activePractice, block, idle, isVisible, layout, reducedMotion, state.doc, trigger,
    viewport, workspace,
  ]);

  return (
    <StudyWorkspaceContext.Provider value={api}>{children}</StudyWorkspaceContext.Provider>
  );
}

/**
 * The workspace, or a read-only stand-in.
 *
 * A stand-in rather than a throw because the study overlay is also rendered by dev
 * harnesses and by tests that mount fragments of it. Failing to find a provider should
 * degrade to "Watch Mode, nothing customised", which is exactly the layout the player
 * had before this system existed.
 */
export function useStudyWorkspace(): StudyWorkspaceApi {
  const context = React.useContext(StudyWorkspaceContext);
  const fallback = React.useMemo<StudyWorkspaceApi>(() => {
    const doc = createDefaultWorkspaceDocument();
    const workspace = activeWorkspace(doc);
    const viewport = { width: 1280, height: 720 };
    return {
      doc,
      workspace,
      layout: resolveLayout(workspace, {}, viewport),
      viewport,
      idle: false,
      customizing: false,
      reducedMotion: false,
      dispatch: () => undefined,
      trigger: () => undefined,
      activePractice: null,
      setActivePractice: () => undefined,
      block: (id) => resolveLayout(workspace, {}, viewport).blocks
        .find((entry) => entry.blockId === id),
      isVisible: () => false,
    };
  }, []);
  return context ?? fallback;
}

export { StudyWorkspaceContext };
