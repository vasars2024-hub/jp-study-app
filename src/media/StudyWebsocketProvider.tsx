/**
 * Study OS websocket lifecycle for the adopted Seanime surface.
 *
 * Upstream's provider is intentionally tuned for a normal browser page. Its heartbeat
 * uses wall-clock time, so an Electron renderer whose timers were throttled can wake up,
 * conclude that 45 seconds elapsed without a pong, and tear down a healthy loopback
 * socket before the queued pong event is dispatched. Its delayed ping starter is also
 * not cancelled on reconnect, allowing old intervals to accumulate.
 *
 * That corrected lifecycle now lives in `seanimeSocketPool.ts`, at module scope. This
 * component is the React face of it: it joins the window's single socket for the given
 * sidecar generation and republishes what the pool reports into the adopted atoms and
 * context. Slice 15 moved the socket out because Blanc's toolbox player and the host
 * overlay can now both be mounted in one window, and two sockets sharing this window's
 * one client id is a state the pinned sidecar mishandles — see
 * `shared/seanimeSocketOwnership.ts`.
 *
 * Any number of these may be mounted. There will still be exactly one socket.
 */
import React from 'react';
import { atom, useAtom, useSetAtom } from 'jotai';
import { websocketAtom, WebSocketContext } from '@/app/(main)/_atoms/websocket.atoms';
import {
  clientIdAtom,
  websocketConnectedAtom,
  websocketConnectionErrorCountAtom,
} from '@/app/websocket-provider';
import { getClientIdentity, subscribeToClientIdentity } from '@/lib/server/client-id';
import type { SeanimeConnection } from '../shared/seanime';
import { joinSeanimeSocket } from './seanimeSocketPool';

/**
 * Whether `clientIdAtom` currently holds the id this window's socket is registered under.
 *
 * Ours, not adopted: upstream has no such notion because it never opens a stream keyed by
 * client id in the same breath as connecting. Anything that addresses the sidecar BY client
 * id must gate on this rather than on `websocketConnectedAtom`. The two are NOT the same
 * moment — an id obtained from an HTTP response is live before the socket opens, and the
 * server can name a different one milliseconds later (measured: ~10ms), which is exactly
 * long enough for a local open to be sent under an id the server will never route back.
 *
 * Module-level on jotai's default store, matching the adopted atoms this provider writes.
 */
export const clientIdentityConfirmedAtom = atom(false);

export default function StudyWebsocketProvider({
  conn,
  children,
}: {
  conn: SeanimeConnection;
  children: React.ReactNode;
}): React.ReactElement {
  const [socket, setSocket] = useAtom(websocketAtom);
  const setConnected = useSetAtom(websocketConnectedAtom);
  const setConnectionErrorCount = useSetAtom(websocketConnectionErrorCountAtom);
  const setClientId = useSetAtom(clientIdAtom);
  const setIdentityConfirmed = useSetAtom(clientIdentityConfirmedAtom);

  React.useEffect(() => {
    const publishIdentity = ({ clientId }: { clientId: string }): void => {
      setClientId(clientId || null);
    };
    publishIdentity(getClientIdentity());
    return subscribeToClientIdentity(publishIdentity);
  }, [setClientId]);

  React.useEffect(() => {
    // The atoms are module-level on jotai's default store, so every mounted provider in
    // this window writes the same three values. That is idempotent by construction now
    // that they all describe one socket; it was the bug when they described two.
    //
    // Depend on the two PRIMITIVES, never on `conn` itself: callers build that object
    // inline, so a `conn` dependency would re-run this on every render of the parent and
    // close a healthy socket each time. The pool is keyed on exactly these two values, so
    // rebuilding the object here cannot desync from the key.
    return joinSeanimeSocket({ baseUrl: conn.baseUrl, token: conn.token }, {
      onSocket: setSocket,
      onConnected: setConnected,
      onConnectionErrorCount: setConnectionErrorCount,
      onIdentityConfirmed: setIdentityConfirmed,
    });
  }, [
    conn.baseUrl,
    conn.token,
    setConnected,
    setConnectionErrorCount,
    setIdentityConfirmed,
    setSocket,
  ]);

  return <WebSocketContext.Provider value={socket}>{children}</WebSocketContext.Provider>;
}
