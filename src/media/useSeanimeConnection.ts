/**
 * "Give me a live sidecar connection while this surface is up."
 *
 * These three effects lived inside `MediaWorkspaceHost` until slice 15, when Blanc's
 * toolbox became a second place that mounts an adopted surface and therefore needs the
 * same thing. Two copies would be two chances to disagree about when a connection is
 * safe to hand out — and the rule they encode is not obvious:
 *
 *   - The connection is dropped the moment the sidecar stops being `ready`. A restart
 *     provisions BOTH a new ephemeral port and a new token, so a retained connection is
 *     not stale-but-usable, it is pointed at nothing.
 *   - `bootstrapSeanimeConnection()` must resolve BEFORE any adopted module evaluates,
 *     because upstream's auth-token atom snapshots localStorage at module-eval time. That
 *     is why callers gate `React.lazy` on the returned `conn` rather than rendering the
 *     surface and fetching in parallel. See `seanimeBootstrap.ts`.
 *   - A failed bootstrap resolves to `{ baseUrl: '', token: '' }` rather than null, so a
 *     caller can tell "not connected yet" (`null`) from "tried and the server is not
 *     there" (empty `baseUrl`) and say different things about them.
 *
 * `enabled` exists so a surface that is mounted but not showing anything — the host's
 * launcher button, Blanc's Media tab with no video loaded — does not hold the sidecar up.
 * The sidecar's own watchdog exits shortly after its last client disconnects, and the
 * point of not connecting eagerly is that the process stays down until something needs it.
 */
import { useEffect, useState } from 'react';
import type { SeanimeConnection, SeanimeStatus } from '../shared/seanime';
import { bootstrapSeanimeConnection } from './seanimeBootstrap';

export type SeanimeConnectionState = {
  /** `null` until the first status arrives from main. */
  status: SeanimeStatus | null;
  /** `null` while disconnected; `baseUrl: ''` means the bootstrap failed. */
  conn: SeanimeConnection | null;
};

export function useSeanimeStatus(): SeanimeStatus | null {
  const [status, setStatus] = useState<SeanimeStatus | null>(null);

  useEffect(() => {
    // Under Vite HMR the renderer can reload while an
    // older main process is still live, and an unguarded invoke becomes an unhandled
    // rejection in the app's error boundary.
    if (typeof window.api?.seanimeStatus !== 'function') return;
    void window.api.seanimeStatus().then(setStatus).catch(() => setStatus(null));
    return window.api.onSeanimeStatus(setStatus);
  }, []);

  return status;
}

export function useSeanimeConnection(enabled: boolean): SeanimeConnectionState {
  const status = useSeanimeStatus();
  const [conn, setConn] = useState<SeanimeConnection | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (status?.kind !== 'ready') {
      // Never leave the adopted client mounted against a stopped process.
      setConn(null);
      return;
    }

    let cancelled = false;
    void bootstrapSeanimeConnection()
      .then((next) => {
        if (!cancelled) setConn(next);
      })
      .catch(() => {
        if (!cancelled) setConn({ baseUrl: '', token: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, status?.kind, status?.pid, status?.port]);

  useEffect(() => {
    if (
      !enabled
      || !status
      || status.kind === 'ready'
      || status.kind === 'starting'
      || status.kind === 'disabled'
    ) {
      return;
    }
    void window.api.seanimeStart().catch(() => undefined);
  }, [enabled, status]);

  return { status, conn };
}
