/**
 * The one sidecar websocket a renderer window is allowed to hold.
 *
 * The lifecycle here — one socket, one heartbeat interval and one reconnect timer per
 * sidecar generation, misses counted only on ticks that actually run — is unchanged from
 * `StudyWebsocketProvider`, which owned it until slice 15. What moved is *where it lives*:
 * at module scope rather than inside a component's effect closure.
 *
 * That move is the whole point. Once Blanc's toolbox player and the host overlay can both
 * be up in one window, two providers would mean two sockets presenting the same client id,
 * which the pinned sidecar mishandles in three separate ways — see
 * `shared/seanimeSocketOwnership.ts` for the transcription and
 * `shared/__tests__/seanimeSocketOwnership.test.ts` for the property. A module-owned
 * socket also makes unmount ORDER irrelevant: whichever surface happens to have opened the
 * connection may be the first to go, and a live directstream has to survive that.
 *
 * Everything stateful in this file is reachable only through `joinSeanimeSocket`, and
 * `__resetSeanimeSocketPoolForTests` is the only other way to touch it.
 */
import {
  acquireSeanimeSocket as acquireLease,
  EMPTY_SEANIME_SOCKET_POOL,
  releaseSeanimeSocket as releaseLease,
  seanimeSocketKey,
  type SeanimeSocketPoolState,
} from '../shared/seanimeSocketOwnership';
import { getClientIdentity, setClientIdentity } from '@/lib/server/client-id';
import { WSEvents } from '@/lib/server/ws-events';
import { __clientPlatform__ } from '@/types/constants';
import {
  acknowledgeSeanimePong,
  advanceSeanimeHeartbeat,
  type SeanimeConnection,
  type SeanimeHeartbeatState,
} from '../shared/seanime';

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_MISSED_PONGS = 3;
const MAX_RECONNECT_DELAY_MS = 3_000;
/**
 * How long to wait for the server's `CLIENT_IDENTITY` before treating whatever id we already
 * hold as good enough. Measured arrival on a healthy sidecar is ~10ms after the socket opens,
 * so this is never reached in practice — it exists so a server that does not send the message
 * at all degrades to the old behaviour (open under an unconfirmed id) instead of never
 * opening the player at all.
 */
const IDENTITY_CONFIRM_FALLBACK_MS = 2_000;

/** What a subscriber is told, in the order the old provider's effect told it. */
export type SeanimeSocketListener = {
  onSocket(socket: WebSocket | null): void;
  onConnected(connected: boolean): void;
  onConnectionErrorCount(count: number): void;
  /**
   * Fires once the client id is the one this socket is actually registered under — either
   * because the server named it, or because the fallback above gave up waiting. Callers that
   * address the server BY client id must wait for this: the id held at socket-open time can
   * still be replaced milliseconds later, and anything sent under the old one is addressed to
   * a client the server does not associate with this socket.
   */
  onIdentityConfirmed(confirmed: boolean): void;
};

type Connection = {
  readonly key: string;
  readonly conn: SeanimeConnection;
  socket: WebSocket | null;
  heartbeat: number | null;
  reconnectTimer: number | null;
  reconnectAttempts: number;
  heartbeatState: SeanimeHeartbeatState;
  identityConfirmed: boolean;
  identityTimer: number | null;
  disposed: boolean;
  listeners: Set<SeanimeSocketListener>;
};

let leases: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;
const connections = new Map<string, Connection>();
let subscriberSeq = 0;

function websocketUrl(conn: SeanimeConnection): string {
  const url = new URL('/events', conn.baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  const identity = getClientIdentity();
  if (identity.clientId) url.searchParams.set('id', identity.clientId);
  if (identity.clientIdProof) url.searchParams.set('proof', identity.clientIdProof);
  if (__clientPlatform__) url.searchParams.set('platform', __clientPlatform__);
  if (conn.token) url.searchParams.set('token', conn.token);
  return url.toString();
}

function notify(entry: Connection, fn: (listener: SeanimeSocketListener) => void): void {
  // Copied before iterating: a listener that releases during notification would otherwise
  // mutate the set mid-iteration.
  for (const listener of [...entry.listeners]) fn(listener);
}

function clearHeartbeat(entry: Connection): void {
  if (entry.heartbeat != null) {
    window.clearInterval(entry.heartbeat);
    entry.heartbeat = null;
  }
}

function clearIdentityTimer(entry: Connection): void {
  if (entry.identityTimer != null) {
    window.clearTimeout(entry.identityTimer);
    entry.identityTimer = null;
  }
}

/**
 * Sticky by design. A reconnect re-sends the confirmed id as `?id=`, so the identity survives
 * the blip; clearing this on every close would re-block opens during a routine reconnect and
 * turn a momentary drop into a stalled player.
 */
function confirmIdentity(entry: Connection): void {
  clearIdentityTimer(entry);
  if (entry.identityConfirmed) return;
  entry.identityConfirmed = true;
  notify(entry, (l) => l.onIdentityConfirmed(true));
}

function scheduleReconnect(entry: Connection): void {
  if (entry.disposed || entry.reconnectTimer != null) return;
  entry.reconnectAttempts += 1;
  notify(entry, (l) => l.onConnectionErrorCount(entry.reconnectAttempts));
  const delay = Math.min(
    2 ** Math.min(entry.reconnectAttempts - 1, 10) * 1_000,
    MAX_RECONNECT_DELAY_MS,
  );
  entry.reconnectTimer = window.setTimeout(() => {
    entry.reconnectTimer = null;
    connect(entry);
  }, delay);
}

function disconnectCurrent(entry: Connection, reason: string): void {
  const ws = entry.socket;
  if (!ws) return;
  try {
    ws.close(4000, reason);
  } catch {
    scheduleReconnect(entry);
  }
}

function connect(entry: Connection): void {
  if (entry.disposed || entry.socket) return;

  const ws = new WebSocket(websocketUrl(entry.conn));
  entry.socket = ws;
  notify(entry, (l) => l.onSocket(ws));

  ws.addEventListener('open', () => {
    if (entry.disposed || entry.socket !== ws) return;
    entry.reconnectAttempts = 0;
    entry.heartbeatState = acknowledgeSeanimePong();
    notify(entry, (l) => {
      l.onConnected(true);
      l.onConnectionErrorCount(0);
    });

    // Armed on open rather than at construction: only an open socket can be told its identity,
    // so the wait starts here and not while the connection is still being established.
    if (!entry.identityConfirmed) {
      clearIdentityTimer(entry);
      entry.identityTimer = window.setTimeout(() => {
        entry.identityTimer = null;
        if (entry.disposed || entry.socket !== ws) return;
        confirmIdentity(entry);
      }, IDENTITY_CONFIRM_FALLBACK_MS);
    }

    clearHeartbeat(entry);
    entry.heartbeat = window.setInterval(() => {
      if (entry.socket !== ws || ws.readyState !== WebSocket.OPEN) {
        disconnectCurrent(entry, 'socket is not open');
        return;
      }

      const tick = advanceSeanimeHeartbeat(entry.heartbeatState, MAX_MISSED_PONGS);
      entry.heartbeatState = tick.state;
      if (tick.shouldReconnect) {
        disconnectCurrent(entry, 'heartbeat timeout');
        return;
      }

      try {
        ws.send(JSON.stringify({ type: 'ping', payload: { timestamp: Date.now() } }));
      } catch {
        disconnectCurrent(entry, 'heartbeat send failed');
      }
    }, HEARTBEAT_INTERVAL_MS);
  });

  ws.addEventListener('message', (event) => {
    if (entry.disposed || entry.socket !== ws) return;
    try {
      const message = JSON.parse(String(event.data)) as {
        type?: string;
        payload?: { clientId?: string; proof?: string };
      };
      if (message.type === 'pong') {
        entry.heartbeatState = acknowledgeSeanimePong();
        return;
      }
      if (message.type === WSEvents.CLIENT_IDENTITY) {
        const nextClientId = message.payload?.clientId?.trim() ?? '';
        const nextProof = message.payload?.proof?.trim() ?? '';
        // Confirm AFTER the write, never before: a subscriber that opens a stream the moment
        // it sees `confirmed` must read the new id, not the one this message replaces.
        if (nextClientId) setClientIdentity(nextClientId, nextProof);
        confirmIdentity(entry);
      }
    } catch {
      // Adopted listeners still receive the original event. This observer only consumes
      // the two lifecycle messages it understands.
    }
  });

  ws.addEventListener('close', () => {
    if (entry.socket !== ws) return;
    clearHeartbeat(entry);
    entry.socket = null;
    notify(entry, (l) => {
      l.onSocket(null);
      l.onConnected(false);
    });
    scheduleReconnect(entry);
  });

  ws.addEventListener('error', () => {
    if (entry.socket === ws) disconnectCurrent(entry, 'websocket error');
  });
}

function teardown(entry: Connection): void {
  entry.disposed = true;
  clearHeartbeat(entry);
  clearIdentityTimer(entry);
  if (entry.reconnectTimer != null) window.clearTimeout(entry.reconnectTimer);
  const ws = entry.socket;
  entry.socket = null;
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    try {
      ws.close(1000, 'provider unmounted');
    } catch {
      // Already closing.
    }
  }
  notify(entry, (l) => {
    l.onSocket(null);
    l.onConnected(false);
  });
  entry.listeners.clear();
}

/**
 * Join the window's socket for this sidecar generation, opening it if nobody holds one.
 * The returned function releases this subscriber's hold; the socket closes only when the
 * last hold goes. Calling it twice is safe.
 */
export function joinSeanimeSocket(
  conn: SeanimeConnection,
  listener: SeanimeSocketListener,
): () => void {
  const key = seanimeSocketKey(conn);
  const subscriberId = `subscriber-${(subscriberSeq += 1)}`;
  const lease = acquireLease(leases, key, subscriberId);
  leases = lease.state;

  let entry = connections.get(key);
  if (!entry) {
    entry = {
      key,
      conn,
      socket: null,
      heartbeat: null,
      reconnectTimer: null,
      reconnectAttempts: 0,
      heartbeatState: acknowledgeSeanimePong(),
      identityConfirmed: false,
      identityTimer: null,
      disposed: false,
      listeners: new Set(),
    };
    connections.set(key, entry);
  }
  entry.listeners.add(listener);

  if (lease.action === 'open') {
    connect(entry);
  } else if (entry.socket) {
    // A late joiner is told the current state immediately, so it never renders a null
    // socket for a connection that is already up.
    listener.onSocket(entry.socket);
    listener.onConnected(entry.socket.readyState === WebSocket.OPEN);
  }
  // Replayed outside the branch above: confirmation can already have happened on a
  // connection this subscriber did not open, and a joiner that never hears it would wait
  // for a message that has already been and gone.
  if (entry.identityConfirmed) listener.onIdentityConfirmed(true);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const held = connections.get(key);
    held?.listeners.delete(listener);
    const result = releaseLease(leases, key, subscriberId);
    leases = result.state;
    if (result.action === 'close' && held) {
      connections.delete(key);
      teardown(held);
    }
  };
}

/** Test-only. Closes everything and forgets every lease. */
export function __resetSeanimeSocketPoolForTests(): void {
  for (const entry of connections.values()) teardown(entry);
  connections.clear();
  leases = EMPTY_SEANIME_SOCKET_POOL;
  subscriberSeq = 0;
}
