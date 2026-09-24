/**
 * The whole watch library, kept current — for surfaces outside Gum that need
 * every title at once (the tracking dashboard, Discover's "already in my
 * library" check). One `watch:list` per change, debounced; the old renderer
 * lists are folded in first (`watchLegacyMigration.ts`).
 */

import { useEffect, useState } from 'react';
import type { WatchTitleView } from '../shared/watchLibrary';
import { migrateLegacyWatchStores } from './watchLegacyMigration';

export interface WatchTitlesState {
  titles: WatchTitleView[];
  /** False until the first answer (or when the bridge is missing). */
  ready: boolean;
  error: string | null;
}

export function useWatchTitles(enabled = true): WatchTitlesState {
  const [state, setState] = useState<WatchTitlesState>({ titles: [], ready: false, error: null });

  useEffect(() => {
    if (!enabled) return;
    const api = typeof window !== 'undefined' ? window.api : undefined;
    if (!api?.watchList) {
      setState({ titles: [], ready: true, error: null });
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = (): void => {
      void api.watchList({})
        .then((result) => {
          if (alive) setState({ titles: result.items, ready: true, error: null });
        })
        .catch((error: unknown) => {
          if (alive) setState((prev) => ({ ...prev, ready: true, error: error instanceof Error ? error.message : String(error) }));
        });
    };
    void migrateLegacyWatchStores().finally(load);
    const off = api.onWatchChanged?.(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      off?.();
    };
  }, [enabled]);

  return state;
}
