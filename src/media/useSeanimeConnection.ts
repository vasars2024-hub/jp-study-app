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
 * launcher button, Blanc's Media tab with no video loaded — does not hold a connection.
 * Whether the PROCESS runs is main's business since the seamless-playback pass
 * (`main/seanime/lifecycle.ts`: warmed after boot, restarted after a crash); this hook only
 * nudges it (`seanimeWarm`) when a surface needs it and finds it stopped.
 *
 * It never starts a sidecar that has `failed`: that is a stated failure the surface shows
 * with a Retry, and restarting it from here would loop on a binary that cannot start.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SeanimeConnection, SeanimeStatus } from '../shared/seanime';
import { bootstrapSeanimeConnection } from './seanimeBootstrap';

export type SeanimeConnectionState = {
  /** `null` until the first status arrives from main. */
  status: SeanimeStatus | null;
  /** `null` while disconnected; `baseUrl: ''` means the bootstrap failed (after a retry). */
  conn: SeanimeConnection | null;
  /** Try the connection bootstrap again (the surface's Retry for a failed connect). */
  retryConnection: () => void;
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

/**
 * Ask main to start the media server soon, without waiting. Falls back to the blocking
 * start for a preload that predates `seanimeWarm` (a renderer reloaded against an older
 * main under HMR).
 */
export function warmSeanimeServer(delayMs = 0): void {
  const api = typeof window !== 'undefined' ? window.api : undefined;
  if (!api) return;
  if (typeof api.seanimeWarm === 'function') {
    void api.seanimeWarm(delayMs).catch(() => undefined);
  } else if (delayMs <= 0 && typeof api.seanimeStart === 'function') {
    void api.seanimeStart().catch(() => undefined);
  }
}

/** How long a failed connection bootstrap waits before its one automatic second try. */
const BOOTSTRAP_RETRY_MS = 400;

export function useSeanimeConnection(
  enabled: boolean,
  /**
   * Whether this surface may nudge a stopped server. A surface that is only being kept warm
   * (the host's hidden player) must not: an explicit stop would be undone by a player
   * nobody is looking at. Defaults to `enabled`.
   */
  nudge: boolean = enabled,
): SeanimeConnectionState {
  const status = useSeanimeStatus();
  const [conn, setConn] = useState<SeanimeConnection | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (status?.kind !== 'ready') {
      // Never leave the adopted client mounted against a stopped process.
      setConn(null);
      return;
    }

    let cancelled = false;
    let timer = 0;
    const run = (tries: number): void => {
      void bootstrapSeanimeConnection()
        .then((next) => {
          if (cancelled) return;
          if (!next.baseUrl && tries > 0) {
            timer = window.setTimeout(() => run(tries - 1), BOOTSTRAP_RETRY_MS);
            return;
          }
          setConn(next);
        })
        .catch(() => {
          if (cancelled) return;
          if (tries > 0) {
            timer = window.setTimeout(() => run(tries - 1), BOOTSTRAP_RETRY_MS);
            return;
          }
          setConn({ baseUrl: '', token: '' });
        });
    };
    run(1);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, status?.kind, status?.pid, status?.port, attempt]);

  // A surface that needs the server and finds it stopped (or down without a recovery under
  // way) nudges main once per state; `failed` is left to the surface's Retry.
  const nudgedRef = useRef<string | null>(null);
  const kind = status?.kind ?? null;
  const recovering = status?.recovering === true;
  useEffect(() => {
    if (!enabled || !nudge || !kind) return;
    const needsNudge = kind === 'stopped' || (kind === 'offline' && !recovering);
    if (!needsNudge) {
      nudgedRef.current = null;
      return;
    }
    const stateKey = `${kind}:${recovering}`;
    if (nudgedRef.current === stateKey) return;
    nudgedRef.current = stateKey;
    warmSeanimeServer(0);
  }, [enabled, nudge, kind, recovering]);

  const retryConnection = useCallback(() => {
    setConn(null);
    setAttempt((n) => n + 1);
  }, []);

  return { status, conn, retryConnection };
}
