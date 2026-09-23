// @vitest-environment jsdom
/**
 * A late HTTP response must not roll the client id back past the one the socket was named.
 * Reproduces the packaged-build failure measured 2026-09-23 (see `socketIdentityGuard.ts`):
 * the id the sidecar routes `native-player` messages to is the socket's, and a response to a
 * request sent before `CLIENT_IDENTITY` used to overwrite it for the rest of the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClientIdentity,
  setClientIdentity,
  subscribeToClientIdentity,
} from '@/lib/server/client-id';
import { __resetSeanimeSocketPoolForTests, joinSeanimeSocket } from '../seanimeSocketPool';
import { socketIdentityToRestore } from '../socketIdentityGuard';

class FakeSocket extends EventTarget {
  static last: FakeSocket | null = null;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = 0;
  constructor(readonly url: string) {
    super();
    FakeSocket.last = this;
  }
  send = vi.fn();
  close(): void {
    this.readyState = FakeSocket.CLOSED;
  }
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }
  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

const listener = {
  onSocket: vi.fn(),
  onConnected: vi.fn(),
  onConnectionErrorCount: vi.fn(),
  onIdentityConfirmed: vi.fn(),
};
const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

let release: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
  setClientIdentity('pre-socket-id', 'pre-socket-proof');
});

afterEach(() => {
  release?.();
  release = null;
  __resetSeanimeSocketPoolForTests();
  vi.unstubAllGlobals();
});

function connectAndName(clientId: string): void {
  release = joinSeanimeSocket({ baseUrl: 'http://127.0.0.1:4321', token: 't' }, listener);
  const socket = FakeSocket.last!;
  socket.open();
  socket.receive({ type: 'client-identity', payload: { clientId, proof: 'socket-proof' } });
}

describe('socket identity outranks a late HTTP header', () => {
  it('restores the socket id after a stale response rewrites it', async () => {
    connectAndName('socket-id');
    expect(getClientIdentity().clientId).toBe('socket-id');

    // The response to a request that went out under the old id, landing afterwards.
    setClientIdentity('pre-socket-id', 'pre-socket-proof');
    await flush();

    expect(getClientIdentity()).toEqual({ clientId: 'socket-id', clientIdProof: 'socket-proof' });
  });

  it('leaves every subscriber — including one added after the guard — on the socket id', async () => {
    connectAndName('socket-id');
    const seen: string[] = [];
    const off = subscribeToClientIdentity((identity) => seen.push(identity.clientId));

    setClientIdentity('pre-socket-id', 'pre-socket-proof');
    await flush();
    off();

    expect(seen.at(-1)).toBe('socket-id');
  });

  it('adopts a new id when the socket itself is renamed', async () => {
    connectAndName('socket-id');
    FakeSocket.last!.receive({ type: 'client-identity', payload: { clientId: 'renamed-id', proof: 'p2' } });
    await flush();

    expect(getClientIdentity().clientId).toBe('renamed-id');
  });
});

describe('socketIdentityToRestore', () => {
  const socket = { clientId: 'socket-id', clientIdProof: 'p' };

  it('does nothing before a socket has named an id', () => {
    expect(socketIdentityToRestore({ clientId: 'http-id', clientIdProof: '' }, null)).toBeNull();
  });

  it('does nothing when the ids already agree', () => {
    expect(socketIdentityToRestore({ clientId: 'socket-id', clientIdProof: 'other' }, socket)).toBeNull();
  });

  it('returns the socket identity when they differ', () => {
    expect(socketIdentityToRestore({ clientId: 'http-id', clientIdProof: '' }, socket)).toBe(socket);
  });
});
