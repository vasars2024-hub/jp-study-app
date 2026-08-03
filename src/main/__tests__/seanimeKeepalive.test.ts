import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KEEPALIVE_CLIENT_ID,
  KEEPALIVE_RETRY_DELAYS_MS,
  createSeanimeKeepalive,
  retryDelayMs,
  seanimeKeepaliveUrl,
  type SeanimeKeepaliveHandlers,
  type SeanimeKeepaliveIo,
} from '../seanime/keepalive';

const CONN = { baseUrl: 'http://127.0.0.1:51812', token: 'abc123' };

interface FakeSocket {
  url: string;
  handlers: SeanimeKeepaliveHandlers;
  closed: boolean;
}

interface FakeIo extends SeanimeKeepaliveIo {
  sockets: FakeSocket[];
  logs: string[];
  /** Pending timers, in the order they were scheduled. */
  timers: Array<{ id: number; fn: () => void; ms: number; cancelled: boolean }>;
  /** Run the earliest pending timer, as the event loop would. */
  runNextTimer(): void;
  live(): FakeSocket[];
  /** Make the next `connect` throw, to exercise rule 5. */
  failNextConnect: string | null;
}

function fakeIo(): FakeIo {
  let nextTimerId = 1;
  const io: FakeIo = {
    sockets: [],
    logs: [],
    timers: [],
    failNextConnect: null,
    connect(url, handlers) {
      if (io.failNextConnect) {
        const message = io.failNextConnect;
        io.failNextConnect = null;
        throw new Error(message);
      }
      const socket: FakeSocket = { url, handlers, closed: false };
      io.sockets.push(socket);
      return () => {
        socket.closed = true;
        // A real socket reports `close` when it is closed locally, which is exactly
        // the path that must not schedule a reconnect.
        handlers.onClose();
      };
    },
    setTimer(fn, ms) {
      const id = nextTimerId++;
      io.timers.push({ id, fn, ms, cancelled: false });
      return id;
    },
    clearTimer(handle) {
      const timer = io.timers.find((entry) => entry.id === handle);
      if (timer) timer.cancelled = true;
    },
    log: (line) => void io.logs.push(line),
    runNextTimer() {
      const timer = io.timers.find((entry) => !entry.cancelled);
      if (!timer) throw new Error('no pending timer');
      timer.cancelled = true;
      timer.fn();
    },
    live: () => io.sockets.filter((socket) => !socket.closed),
  };
  return io;
}

/** The most recently opened socket, which is the only one that can be live. */
function current(io: FakeIo): FakeSocket {
  const socket = io.sockets.at(-1);
  if (!socket) throw new Error('no socket was opened');
  return socket;
}

describe('seanimeKeepaliveUrl', () => {
  it('addresses /events over ws with the token the handler checks', () => {
    const url = new URL(seanimeKeepaliveUrl(CONN));
    expect(url.protocol).toBe('ws:');
    expect(url.host).toBe('127.0.0.1:51812');
    expect(url.pathname).toBe('/events');
    expect(url.searchParams.get('token')).toBe('abc123');
  });

  it('claims a client id distinct from anything the renderer can be given', () => {
    // Rule 1: sharing an id with the media workspace would make this socket's
    // disconnect evict the renderer's connection via RemoveConn.
    const url = new URL(seanimeKeepaliveUrl(CONN));
    expect(url.searchParams.get('id')).toBe(KEEPALIVE_CLIENT_ID);
    // Not a uuid and not the server's fallback id.
    expect(KEEPALIVE_CLIENT_ID).not.toBe('0');
    expect(KEEPALIVE_CLIENT_ID).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('omits platform, which the server normalizer would reject anyway', () => {
    expect(new URL(seanimeKeepaliveUrl(CONN)).searchParams.has('platform')).toBe(false);
  });

  it('omits an empty token rather than sending token=', () => {
    const url = new URL(seanimeKeepaliveUrl({ baseUrl: CONN.baseUrl, token: '' }));
    expect(url.searchParams.has('token')).toBe(false);
  });

  it('upgrades https to wss', () => {
    const url = new URL(seanimeKeepaliveUrl({ baseUrl: 'https://127.0.0.1:1', token: 't' }));
    expect(url.protocol).toBe('wss:');
  });
});

describe('retryDelayMs', () => {
  it('backs off and then repeats the last delay forever', () => {
    expect(retryDelayMs(0)).toBe(KEEPALIVE_RETRY_DELAYS_MS[0]);
    expect(retryDelayMs(KEEPALIVE_RETRY_DELAYS_MS.length - 1)).toBe(
      KEEPALIVE_RETRY_DELAYS_MS.at(-1),
    );
    // Rule 2: attempt 500 still returns a real delay rather than giving up.
    expect(retryDelayMs(500)).toBe(KEEPALIVE_RETRY_DELAYS_MS.at(-1));
  });

  it('never caps at or above the server 10s window', () => {
    // Rule 3. The switch needs 10s of continuous absence and polls every 5s, so every
    // delay must leave room for a reconnect inside that window.
    for (const delay of KEEPALIVE_RETRY_DELAYS_MS) expect(delay).toBeLessThan(5_000);
  });
});

describe('createSeanimeKeepalive', () => {
  it('opens a socket for the started generation and reports it once open', () => {
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);

    expect(io.sockets).toHaveLength(1);
    expect(current(io).url).toBe(seanimeKeepaliveUrl(CONN));
    expect(keepalive.connected()).toBe(false);

    current(io).handlers.onOpen();
    expect(keepalive.connected()).toBe(true);
    expect(io.logs.join('\n')).toContain(KEEPALIVE_CLIENT_ID);
  });

  it('reconnects after the server drops it, so the switch never sees a gap', () => {
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);
    current(io).handlers.onOpen();

    current(io).handlers.onClose();
    expect(keepalive.connected()).toBe(false);
    expect(io.timers.filter((timer) => !timer.cancelled)).toHaveLength(1);

    io.runNextTimer();
    expect(io.sockets).toHaveLength(2);
    current(io).handlers.onOpen();
    expect(keepalive.connected()).toBe(true);
  });

  it('keeps retrying past the end of the backoff table', () => {
    // Rule 2: the wrong alternative is a bounded retry, which hands the process back
    // to the dead-man switch — the exact defect this module exists to remove.
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);

    for (let i = 0; i < KEEPALIVE_RETRY_DELAYS_MS.length + 5; i += 1) {
      current(io).handlers.onClose();
      io.runNextTimer();
    }
    expect(io.sockets.length).toBe(KEEPALIVE_RETRY_DELAYS_MS.length + 6);
    expect(keepalive.connected()).toBe(false);

    current(io).handlers.onOpen();
    expect(keepalive.connected()).toBe(true);
  });

  it('resets the backoff once a connection succeeds', () => {
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);

    current(io).handlers.onClose();
    const first = io.timers.at(-1);
    io.runNextTimer();
    current(io).handlers.onClose();
    const second = io.timers.at(-1);
    expect(second?.ms).toBeGreaterThan(first?.ms ?? 0);

    io.runNextTimer();
    current(io).handlers.onOpen();
    current(io).handlers.onClose();
    expect(io.timers.at(-1)?.ms).toBe(first?.ms);
  });

  it('stop() closes the socket and schedules nothing', () => {
    // Rule 4: a pending retry would reconnect to a port stopSeanime has already killed.
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);
    current(io).handlers.onOpen();

    keepalive.stop();
    expect(current(io).closed).toBe(true);
    expect(keepalive.connected()).toBe(false);
    expect(io.timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
    expect(io.sockets).toHaveLength(1);
  });

  it('stop() cancels a retry that was already pending', () => {
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);
    current(io).handlers.onClose();
    expect(io.timers.filter((timer) => !timer.cancelled)).toHaveLength(1);

    keepalive.stop();
    expect(io.timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
    expect(() => io.runNextTimer()).toThrow();
  });

  it('a late close from a stopped generation cannot resurrect the socket', () => {
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);
    const stale = current(io);
    keepalive.stop();

    stale.handlers.onClose();
    expect(io.timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
    expect(io.sockets).toHaveLength(1);
  });

  it('start() on a new generation drops the old socket and uses the new port', () => {
    // Every restart provisions a new ephemeral port AND a new token; a keepalive still
    // holding the old one would keep a dead generation's socket object alive and would
    // authenticate against nothing.
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);
    current(io).handlers.onOpen();
    const first = current(io);

    const next = { baseUrl: 'http://127.0.0.1:64510', token: 'def456' };
    keepalive.start(next);
    expect(first.closed).toBe(true);
    expect(io.live()).toHaveLength(1);
    expect(current(io).url).toBe(seanimeKeepaliveUrl(next));
  });

  it('a close reported twice by one socket schedules only one retry', () => {
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    keepalive.start(CONN);
    current(io).handlers.onClose();
    current(io).handlers.onClose();
    expect(io.timers.filter((timer) => !timer.cancelled)).toHaveLength(1);
  });

  it('a connect that throws is logged once and retried, never thrown', () => {
    // Rule 5: the sidecar still runs, it is only exposed to the old behaviour again.
    const io = fakeIo();
    const keepalive = createSeanimeKeepalive(io);
    io.failNextConnect = 'no WebSocket in this runtime';

    expect(() => keepalive.start(CONN)).not.toThrow();
    expect(io.logs.filter((line) => line.includes('could not hold'))).toHaveLength(1);
    expect(io.timers.filter((timer) => !timer.cancelled)).toHaveLength(1);

    io.failNextConnect = 'still nothing';
    io.runNextTimer();
    // Still one line: a retry loop must not flood the 40-line log tail.
    expect(io.logs.filter((line) => line.includes('could not hold'))).toHaveLength(1);
  });
});

describe('the supervisor wiring', () => {
  // From the repo root, the way the other source-reading tests in this suite do it:
  // `import.meta` is not permitted under this tsconfig's `module` setting.
  const supervisor = fs.readFileSync(
    path.join(process.cwd(), 'src/main/seanime/supervisor.ts'),
    'utf8',
  );

  it('still arms the dead-man switch', () => {
    // Dropping the flag is the other way to fix this defect, and it silently gives up
    // orphan protection when the main process is SIGKILLed — see keepalive.ts.
    expect(supervisor).toContain('--desktop-sidecar');
  });

  it('releases the client on stop and on an unexpected child exit', () => {
    // Either omission leaves a socket holding a dead port, and the stop case leaves the
    // switch unable to finish a kill the supervisor started.
    expect(supervisor).toMatch(/export function stopSeanime[\s\S]{0,400}keepalive\.stop\(\)/);
    expect(supervisor).toMatch(/child\.on\('exit'[\s\S]{0,400}keepalive\.stop\(\)/);
  });

  it('holds the client only once the sidecar is actually healthy', () => {
    expect(supervisor).toMatch(/kind === 'ready'[\s\S]{0,400}keepalive\.start\(/);
  });
});
