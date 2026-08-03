import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { UnifiedSearchQueryPlanningState } from '../shared/unifiedSearch';
import {
  createRendererUnifiedSearchSession,
  type RendererUnifiedSearchSessionOptions,
} from './unifiedSearchController';
import { loadDeck } from './flashcardDeck';
import { createOfflineLocalLibraryExecutor } from './unifiedSearchLocalLibrary';
import type { UnifiedSearchSession, UnifiedSearchSessionState } from './unifiedSearchSession';

/**
 * `useSyncExternalStore`-backed adapter over the Unified Search coordinator.
 *
 * A single coordinator is created per mount (lazily, via a ref) and disposed on
 * unmount, so an in-flight search is always cancelled when the surface goes away.
 * `getState` returns a frozen, referentially-stable snapshot, which is exactly
 * what `useSyncExternalStore` needs to avoid render loops.
 */
export interface UnifiedSearchSessionHandle {
  state: UnifiedSearchSessionState;
  search: (input: UnifiedSearchQueryPlanningState) => void;
  cancel: (reason?: unknown) => void;
  clear: () => void;
}

export function useUnifiedSearchSession(
  options?: RendererUnifiedSearchSessionOptions,
): UnifiedSearchSessionHandle {
  // Options are read once, at first render, on purpose: the coordinator owns its
  // own lifecycle and must not be rebuilt as the parent re-renders.
  const sessionRef = useRef<UnifiedSearchSession | null>(null);
  if (sessionRef.current === null) {
    // Bind the offline deck-backed local-library connector by default; callers can
    // still override `localLibrary` (or the whole registry) through `options`.
    sessionRef.current = createRendererUnifiedSearchSession({
      localLibrary: createOfflineLocalLibraryExecutor({
        loadDeck,
        listReaderLibrary: () => window.api.listLibrary(),
        listMediaLibrary: () => window.api.listMedia(),
      }),
      ...options,
    });
  }
  const session = sessionRef.current;

  useEffect(() => () => session.dispose(), [session]);

  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);

  return {
    state,
    search: (input) => { session.search(input); },
    cancel: (reason) => { session.cancel(reason); },
    clear: () => { session.clear(); },
  };
}
