/**
 * Gate 25's renderer half — "recognised **without a manual refresh**".
 *
 * The watcher lives in main (`main/filesApp/watch.ts`); this is the half that
 * makes its answer visible. Two effects and nothing else:
 *
 *  1. Keep main's watched set equal to the settings document's. The renderer
 *     owns the list, so it re-sends it on mount and on every change — main
 *     holds no preference of its own, which keeps one writer for it.
 *  2. Subscribe to arrivals, refresh the index, and keep the last batch so a
 *     surface can SAY what landed and how long it took. A refresh with no
 *     statement would leave the user watching a list change for no stated
 *     reason, which is the same defect as a silent import.
 *
 * **`refresh` is held in a ref rather than listed as a dependency.** It is a
 * fresh closure on most renders, and a subscription that tore down and rebuilt
 * on every render would drop the arrival that landed between the two.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadIngestSettings, onIngestSettingsChanged } from '../../filesIngestSettingsStore';
import type { FilesWatchArrival } from '../../../main/filesApp/watch';

export interface FilesWatchState {
  /** The roots main is watching, as last confirmed BY main — never as asked. */
  roots: string[];
  /** Files seen but not yet accepted, from main's own count. */
  pending: number;
  /** The most recent batch that landed. Empty until something does. */
  arrivals: FilesWatchArrival[];
  /** Dismiss the notice without touching what was imported or indexed. */
  clearArrivals: () => void;
}

export function useFilesWatch(refresh: () => void): FilesWatchState {
  const [roots, setRoots] = useState<string[]>([]);
  const [pending, setPending] = useState(0);
  const [arrivals, setArrivals] = useState<FilesWatchArrival[]>([]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // (1) The document is the source of truth; main is told, and answers with
  // what it is actually watching.
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      const settings = loadIngestSettings();
      const api = window.api as typeof window.api & {
        filesWatchSet?: (
          r: string[],
          o?: { stabilityMs?: number },
        ) => Promise<{ roots: string[]; pending: number }>;
      };
      if (typeof api?.filesWatchSet !== 'function') return;
      void api
        .filesWatchSet(settings.watchRoots, { stabilityMs: settings.stabilityMs })
        .then((status) => {
          if (cancelled || !status) return;
          setRoots(status.roots);
          setPending(status.pending);
        })
        .catch(() => {
          // A watcher that could not start must not claim it did.
          if (!cancelled) setRoots([]);
        });
    };
    apply();
    const off = onIngestSettingsChanged(apply);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // (2) Push, not poll. This is the clause the gate turns on.
  useEffect(() => {
    const api = window.api as typeof window.api & {
      onFilesWatchArrival?: (cb: (a: FilesWatchArrival[]) => void) => () => void;
    };
    if (typeof api?.onFilesWatchArrival !== 'function') return undefined;
    return api.onFilesWatchArrival((batch) => {
      if (!batch?.length) return;
      setArrivals(batch);
      setPending(0);
      // After the arrival is recorded, so a re-render cannot race the notice.
      refreshRef.current();
    });
  }, []);

  const clearArrivals = useCallback(() => setArrivals([]), []);

  return { roots, pending, arrivals, clearArrivals };
}
