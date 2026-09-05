/**
 * The provider stack every adopted media surface needs, in one place.
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
 *
 * ── Why this is a file of its own (slice 15) ──────────────────────────────────────────
 * `MediaWorkspace` used to BE this stack, with the library and the player wired straight
 * into it. Routing the player into Blanc needs the player without the library, and the
 * obvious move — a second component with its own copy of the stack — is the shape this
 * track has already been burned by: two copies are two chances to disagree about the
 * QueryClient, the websocket and the auth token, which is precisely why
 * `mediaWorkspaceAvailability.ts` exists. So there is one stack, and the two surfaces
 * differ only in what they pass as `children`.
 *
 * Mounting two of these in one window is expected and safe: the query client is per-shell
 * (independent caches are fine, they are read-through), and the websocket is NOT — it is
 * pooled per sidecar generation for the whole window by `seanimeSocketPool.ts`.
 */
import React from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { setSeanimeBaseUrl } from '@/api/client/server-url';
import { serverAuthTokenAtom } from '@/app/(main)/_atoms/server-status.atoms';
import { useSetServerStatus } from '@/app/(main)/_hooks/use-server-status';
import { useAtomValue, useSetAtom } from 'jotai';
// Straight from the vendored generated contract, the same import the main process uses —
// not through the `@/` alias, so this stays a real compile-time type.
import type { Status } from '../../vendor/seanime/generated/types';
import type { SeanimeConnection } from '../shared/seanime';
import { useT } from '../renderer/i18n';
import SeanimeToastHost from './SeanimeToastHost';
import StudyWebsocketProvider from './StudyWebsocketProvider';
import './mediaWorkspace.css';

/**
 * `retry: 0` because a dead sidecar should surface as an explicit offline state
 * immediately, not as four silent retries — the same rule Phase 1 applied to the
 * supervisor's health poll.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
}

/** Seeds `serverStatusAtom` before any adopted query is allowed to mount. */
function StatusGate({
  conn,
  children,
}: {
  conn: SeanimeConnection;
  children: React.ReactNode;
}): React.ReactElement {
  const { t } = useT();
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

  if (state === 'loading') {
    return <p className="p-6 text-gray-400">{t('mediaWorkspace.connectingServer')}</p>;
  }
  if (state !== 'ready') {
    // Explicit terminal state, never a spinner — the Phase-1 lifecycle rule.
    return (
      <div className="p-6 space-y-2">
        <p className="font-semibold text-gray-200">{t('mediaWorkspace.serverOffline')}</p>
        <p className="text-sm text-gray-400">{state}</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Which surface this is. Not cosmetic — see the `data-media-surface` note below. */
export type MediaSurfaceKind = 'workspace' | 'player';

export default function MediaSurfaceShell({
  conn,
  surface,
  className,
  children,
}: {
  conn: SeanimeConnection;
  surface: MediaSurfaceKind;
  /** Extra classes on the scoping element. The `id` and `dark` are not negotiable. */
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const { t } = useT();
  // Set during render, not in an effect: the axios client reads the origin at call time,
  // and child queries mount before any effect of this component runs.
  setSeanimeBaseUrl(conn.baseUrl);
  const activeToken = useAtomValue(serverAuthTokenAtom);
  const setActiveToken = useSetAtom(serverAuthTokenAtom);
  const queryClient = React.useMemo(createQueryClient, [conn.baseUrl, conn.token]);

  React.useLayoutEffect(() => {
    setSeanimeBaseUrl(conn.baseUrl);
    if (activeToken !== conn.token) {
      // atomWithStorage does not receive a storage event for writes made by this same
      // window. Update the live atom explicitly when the supervisor provisions a new
      // token, before any adopted request or websocket is mounted.
      setActiveToken(conn.token || undefined);
    }
  }, [activeToken, conn.baseUrl, conn.token, setActiveToken]);

  if (activeToken !== conn.token) {
    return <p className="p-6 text-gray-400">{t('mediaWorkspace.provisioning')}</p>;
  }

  return (
    // `id` powers Tailwind's `important` scoping and `dark` powers its class-based dark
    // mode; both are load-bearing, see tailwind.config.ts. Slice 5 scoped all 6,950
    // selectors in mediaWorkspace.css under this id, so a surface that omits it renders
    // unstyled.
    //
    // Two mounted surfaces therefore carry the SAME id, which CSS handles correctly — an
    // id selector matches every element bearing it — but `querySelector('#media-workspace')`
    // does not: it returns whichever is first in the document. Every such lookup must say
    // WHICH surface it means, and `data-media-surface` is how. The existing harnesses were
    // written when only one could exist; `retirement-step3-harness.mjs` now scopes its
    // three lookups to `[data-media-surface="workspace"]`.
    <div
      id="media-workspace"
      data-media-surface={surface}
      className={className ? `dark ${className}` : 'dark'}
    >
      {/*
        Above `StatusGate` on purpose: an offline sidecar is exactly when the adopted code
        has something to say, and the gate's error branch would otherwise unmount the only
        thing that can say it. It portals to `document.body`, so its position here costs
        this element no layout — see `SeanimeToastHost`.
      */}
      <SeanimeToastHost />
      <QueryClientProvider client={queryClient}>
        <StatusGate conn={conn}>
          <StudyWebsocketProvider conn={conn}>{children}</StudyWebsocketProvider>
        </StatusGate>
      </QueryClientProvider>
    </div>
  );
}
