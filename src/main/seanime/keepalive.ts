/**
 * The websocket client the supervisor holds for as long as the app is alive.
 *
 * ## Why this exists
 *
 * The sidecar is launched with `--desktop-sidecar`, which arms Seanime's dead-man
 * switch (`internal/events/websocket.go`, `ExitIfNoConnsAsDesktopSidecar`): once any
 * websocket client has connected, a poll every 5s exits the process with code 1 after
 * 10s with no connections at all. Upstream's desktop app satisfies that trivially —
 * its renderer window *is* the client, and it lives exactly as long as the app.
 *
 * Study OS is shaped differently. The only websocket lived inside `MediaWorkspace`,
 * which is a **transient full-screen overlay**: closing it dropped the last client and
 * killed a media server the app still owned. Every downstream symptom in the record
 * descends from that one fact — the sidecar restarting on a new ephemeral port, the
 * renderer holding a stale port/token, `Video error -> switching to HLS ->
 * Unrecoverable HLS error`, a player stuck at `readyState 0`, and a renderer reload as
 * the only recovery. It was seen three times in the 2026-07-31 live pass alone
 * (51812 -> 64510 -> 61480), and it lands hardest on Phase 6 slice 7, whose entire
 * purpose is entering the player from *outside* the workspace.
 *
 * So the fix is not to disarm the switch but to give it the client it was always
 * meant to watch. The supervisor's lifetime *is* the app's lifetime.
 *
 * ## Why not simply drop `--desktop-sidecar`
 *
 * That is one line and it does remove the bug, but it also removes the protection the
 * flag exists for. `stopSeanime()` runs from `will-quit` and from `process.on('exit')`,
 * and neither runs when the main process is SIGKILLed (Task Manager "End task", a power
 * cut). The datadir is durable now, so an orphan would sit on `<userData>/seanime`
 * holding its SQLite database, and the next launch would reserve a *different* port and
 * spawn a second server against that same database. Keeping the switch armed and
 * holding its client from main preserves the protection and makes it precise: the
 * socket dies with the process it is proving alive, whatever kills it.
 *
 * ## Rules encoded below, each with an obvious wrong alternative
 *
 * 1. **Its client id is distinct, and claimed explicitly.** `RemoveConn` (websocket.go)
 *    deletes the *first* connection whose id matches, so sharing an id with the renderer
 *    would mean this socket's disconnect silently evicts the renderer's connection from
 *    the event manager — the renderer would stay connected and simply stop receiving
 *    events. The server accepts an unsigned claimed id here because the request is
 *    loopback with no `Origin`, which is what `canAcceptClaimedClientId` allows; without
 *    an explicit id the middleware would mint a uuid and this socket would be
 *    indistinguishable from a real client in the logs.
 * 2. **Retry for as long as the supervisor believes the sidecar is up.** Giving up after
 *    N attempts hands the process back to the dead-man switch, which is precisely the
 *    bug being fixed. The failure mode of retrying too long is a wasted timer; the
 *    failure mode of stopping is a dead media server.
 * 3. **The backoff caps well below the switch's window.** The server needs 10s of
 *    *continuous* absence and polls every 5s, so a cap of 3s guarantees a reconnect lands
 *    inside the window even if the first few attempts fail.
 * 4. **`stop()` releases the generation *before* it closes the socket.** Closing fires
 *    `onClose`, so a stop that closed first would have its own teardown schedule a
 *    reconnect to a port the supervisor is in the middle of killing — a sidecar that
 *    will not die. Clearing the pending timer is necessary too but is not what makes
 *    the order safe: mutating the two clear/close lines into either order still passes,
 *    while releasing the generation last fails two tests. That is the invariant to keep.
 * 5. **A keepalive that cannot connect is reported, never thrown.** Same rule as datadir
 *    adoption: the sidecar still works, it is only exposed to the old behaviour again,
 *    and a start that fails loudly would be strictly worse than one that degrades.
 *
 * Kept free of `electron` and `node:*` imports so it is directly testable: the caller
 * supplies the socket and the timers.
 */

/** Connection details for one sidecar generation. Both change on every restart. */
export interface SeanimeKeepaliveContext {
  /** `http://127.0.0.1:<ephemeral port>`. */
  baseUrl: string;
  /** The server password *hash* — what `/events` checks as `?token=`. */
  token: string;
}

export interface SeanimeKeepaliveHandlers {
  onOpen(): void;
  /**
   * Fired for a closed socket AND for one that never opened. The websocket `error`
   * event is always followed by `close`, so this is the only terminal signal needed.
   */
  onClose(): void;
}

/** Everything with a side effect, injected so tests need no socket and no clock. */
export interface SeanimeKeepaliveIo {
  /** Opens a socket to `url`; the returned function closes it. May throw. */
  connect(url: string, handlers: SeanimeKeepaliveHandlers): () => void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Goes to the supervisor's log tail, which the dev panel renders. */
  log(line: string): void;
}

export interface SeanimeKeepalive {
  /** Point at a sidecar generation. Safe to call again; the previous socket is dropped. */
  start(context: SeanimeKeepaliveContext): void;
  /** Release the client. Must be called before the child is killed. */
  stop(): void;
  connected(): boolean;
}

/**
 * Deliberately not a uuid: it names the holder in the sidecar's own connection log, so
 * `ws: Client connected id=study-os-supervisor` distinguishes this socket from the
 * media workspace's at a glance. See rule 1 for why it must not collide.
 */
export const KEEPALIVE_CLIENT_ID = 'study-os-supervisor';

/** Backoff per consecutive failure; the last entry repeats forever. See rule 3. */
export const KEEPALIVE_RETRY_DELAYS_MS: readonly number[] = [250, 500, 1000, 2000, 3000];

/**
 * The `/events` URL for one generation.
 *
 * `token` is the only credential the endpoint checks when a password is set
 * (`webSocketEventHandler`), and `platform` is deliberately omitted: the normalizer
 * accepts only `web`/`denshi`/`mobile`, and this client is none of them.
 */
export function seanimeKeepaliveUrl(context: SeanimeKeepaliveContext): string {
  const url = new URL('/events', context.baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('id', KEEPALIVE_CLIENT_ID);
  if (context.token) url.searchParams.set('token', context.token);
  return url.toString();
}

export function retryDelayMs(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), KEEPALIVE_RETRY_DELAYS_MS.length - 1);
  return KEEPALIVE_RETRY_DELAYS_MS[index] as number;
}

export function createSeanimeKeepalive(io: SeanimeKeepaliveIo): SeanimeKeepalive {
  /** Non-null exactly while started. Doubles as the "should I reconnect?" flag. */
  let context: SeanimeKeepaliveContext | null = null;
  let closeSocket: (() => void) | null = null;
  let retryTimer: unknown = null;
  let attempt = 0;
  let isConnected = false;
  /** One failure line per generation, so a retry loop cannot flood the log tail. */
  let reportedFailure = false;

  function clearRetry(): void {
    if (retryTimer === null) return;
    io.clearTimer(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry(): void {
    // Rule 2: only while started, and never two timers at once.
    if (!context || retryTimer !== null) return;
    const delay = retryDelayMs(attempt);
    attempt += 1;
    retryTimer = io.setTimer(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function connect(): void {
    if (!context) return;
    const url = seanimeKeepaliveUrl(context);
    // Guards against a socket that reports `close` more than once, and against a
    // `close` arriving after this generation was replaced by a newer `start()`.
    const generation = context;
    let settled = false;

    try {
      closeSocket = io.connect(url, {
        onOpen: () => {
          if (context !== generation) return;
          attempt = 0;
          isConnected = true;
          reportedFailure = false;
          io.log(`keepalive: holding a websocket client as ${KEEPALIVE_CLIENT_ID}`);
        },
        onClose: () => {
          if (settled) return;
          settled = true;
          isConnected = false;
          if (context !== generation) return;
          closeSocket = null;
          scheduleRetry();
        },
      });
    } catch (err) {
      // Rule 5. `connect` throwing at all means no socket exists to close.
      closeSocket = null;
      isConnected = false;
      if (!reportedFailure) {
        reportedFailure = true;
        io.log(`keepalive: could not hold a websocket client — ${String(err)}`);
      }
      scheduleRetry();
    }
  }

  function stop(): void {
    // Rule 4: the flag first, then the timer, then the socket. `onClose` fires during
    // `close()` and must find a stopped keepalive rather than schedule a reconnect.
    context = null;
    clearRetry();
    const close = closeSocket;
    closeSocket = null;
    isConnected = false;
    attempt = 0;
    reportedFailure = false;
    if (!close) return;
    try {
      close();
    } catch {
      /* a socket that cannot be closed is already gone */
    }
  }

  return {
    start(next: SeanimeKeepaliveContext): void {
      stop();
      context = next;
      connect();
    },
    stop,
    connected: () => isConnected,
  };
}
