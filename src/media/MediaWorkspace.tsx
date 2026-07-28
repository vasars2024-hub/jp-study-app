/**
 * MEDIA workspace — Study OS's host for the adopted Seanime library/lists surface.
 *
 * This is the whole Phase-2 integration seam, and it is deliberately thin: everything
 * under `@/` is upstream source copied verbatim from the pinned checkout (9bdd052), and
 * this file supplies only what upstream gets from its own Next-style layout —
 *
 *   1. a react-query client,
 *   2. the sidecar's ephemeral loopback origin,
 *   3. one `/api/v1/status` read to seed `serverStatusAtom`, which the adopted hooks read
 *      for theme settings and the simulated-user flag.
 *
 * The auth token is NOT set here — it must already be in localStorage before this module
 * is evaluated. See `seanimeBootstrap.ts` for why.
 *
 * Jotai needs no Provider: the adopted atoms are module-level on the default store, which
 * is exactly how upstream runs them.
 */
import React from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { setSeanimeBaseUrl } from '@/api/client/server-url';
import { useSetServerStatus } from '@/app/(main)/_hooks/use-server-status';
import { useHandleLibraryCollection } from '@/app/(main)/_features/anime-library/_lib/handle-library-collection';
import { LibraryView } from '@/app/(main)/_features/anime-library/_screens/library-view';
// Straight from the vendored generated contract, the same import the main process uses —
// not through the `@/` alias, so this stays a real compile-time type.
import type { Status } from '../../vendor/seanime/generated/types';
import type { SeanimeConnection } from '../shared/seanime';
import './mediaWorkspace.css';

/**
 * `retry: 0` because a dead sidecar should surface as an explicit offline state
 * immediately, not as four silent retries — the same rule Phase 1 applied to the
 * supervisor's health poll.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
});

function LibraryScreen(): React.ReactElement {
  const {
    libraryGenres,
    libraryCollectionList,
    filteredLibraryCollectionList,
    continueWatchingList,
    isLoading,
    hasEntries,
    streamingMediaIds,
  } = useHandleLibraryCollection();

  return (
    <LibraryView
      genres={libraryGenres}
      collectionList={libraryCollectionList}
      filteredCollectionList={filteredLibraryCollectionList}
      continueWatchingList={continueWatchingList}
      isLoading={isLoading}
      hasEntries={hasEntries}
      streamingMediaIds={streamingMediaIds}
    />
  );
}

/** Seeds `serverStatusAtom` before the library query is allowed to mount. */
function StatusGate({
  conn,
  children,
}: {
  conn: SeanimeConnection;
  children: React.ReactNode;
}): React.ReactElement {
  const setServerStatus = useSetServerStatus();
  const [state, setState] = React.useState<'loading' | 'ready' | string>('loading');

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${conn.baseUrl}/api/v1/status`, {
          headers: { 'X-Seanime-Token': conn.token },
        });
        if (!res.ok) throw new Error(`status -> HTTP ${res.status}`);
        const body = (await res.json()) as { data?: Status };
        if (cancelled) return;
        setServerStatus(body.data);
        setState('ready');
      } catch (err) {
        if (!cancelled) setState(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conn, setServerStatus]);

  if (state === 'loading') return <p className="p-6 text-gray-400">Connecting to the media server…</p>;
  if (state !== 'ready') {
    // Explicit terminal state, never a spinner — the Phase-1 lifecycle rule.
    return (
      <div className="p-6 space-y-2">
        <p className="font-semibold text-gray-200">Media server offline</p>
        <p className="text-sm text-gray-400">{state}</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function MediaWorkspace({ conn }: { conn: SeanimeConnection }): React.ReactElement {
  // Set during render, not in an effect: the axios client reads the origin at call time,
  // and child queries mount before any effect of this component runs.
  setSeanimeBaseUrl(conn.baseUrl);

  return (
    // `id` powers Tailwind's `important` scoping and `dark` powers its class-based dark
    // mode; both are load-bearing, see tailwind.config.ts.
    <div id="media-workspace" className="dark">
      <QueryClientProvider client={queryClient}>
        <StatusGate conn={conn}>
          <LibraryScreen />
        </StatusGate>
      </QueryClientProvider>
    </div>
  );
}
