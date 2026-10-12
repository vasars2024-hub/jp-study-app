// @vitest-environment node
/**
 * Texthooker websocket robustness (VN 7.5): jittered backoff that only resets
 * after a connection held, a connect timeout for a server that never upgrades,
 * and no parallel reconnects from a replaced socket's late close.
 */
import { describe, expect, it } from 'vitest';
import { createCaptureSession, type CaptureSocket } from '../immersion/visualNovelCaptureSession';
import type { VisualNovelCaptureState } from '../../shared/visualNovelCapture';
import {
  VN5_CONNECT_TIMEOUT_MS,
  VN5_RECONNECT_MIN_MS,
  VN5_STABLE_CONNECTION_MS,
} from '../../shared/visualNovelStudy5';

type FakeSocket = CaptureSocket & { url: string; closed: boolean };

function harness() {
  let now = 0;
  let nextHandle = 1;
  const timeouts = new Map<number, { fn: () => void; at: number }>();
  const sockets: FakeSocket[] = [];
  const states: VisualNovelCaptureState[] = [];
  const session = createCaptureSession({
    readClipboard: () => '',
    createSocket: (url) => {
      const socket = {
        url,
        closed: false,
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        close() {
          this.closed = true;
        },
      } as FakeSocket;
      sockets.push(socket);
      return socket;
    },
    saveLines: (_id, lines) => lines.length,
    broadcast: (state) => states.push(state),
    now: () => now,
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: (fn, ms) => {
      const handle = nextHandle++;
      timeouts.set(handle, { fn, at: now + ms });
      return handle;
    },
    clearTimeout: (handle) => timeouts.delete(handle as number),
    random: () => 0.5,
  });
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timeouts.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timeouts.delete(due[0]);
      due[1].fn();
    }
    now = end;
  };
  return { session, sockets, states, advance, last: () => states[states.length - 1] };
}

describe('texthooker reconnect', () => {
  it('backs off exponentially while the server keeps refusing, and reports the attempt', () => {
    const h = harness();
    h.session.start('vn', { clipboard: false, websocket: true });
    h.sockets[0].onclose?.({});
    expect(h.last()).toMatchObject({ reconnectAttempt: 1, nextRetryAt: VN5_RECONNECT_MIN_MS });
    h.advance(VN5_RECONNECT_MIN_MS);
    expect(h.sockets).toHaveLength(2);
    h.sockets[1].onclose?.({});
    expect(h.last().reconnectAttempt).toBe(2);
    h.advance(VN5_RECONNECT_MIN_MS * 2 - 1);
    expect(h.sockets).toHaveLength(2);
    h.advance(1);
    expect(h.sockets).toHaveLength(3);
  });

  it('a connection that drops at once does not reset the backoff; one that held does', () => {
    const h = harness();
    h.session.start('vn', { clipboard: false, websocket: true });
    h.sockets[0].onclose?.({});
    h.advance(VN5_RECONNECT_MIN_MS);
    h.sockets[1].onopen?.({});
    expect(h.last()).toMatchObject({ websocket: 'connected', nextRetryAt: null });
    h.sockets[1].onclose?.({});
    expect(h.last().reconnectAttempt).toBe(2);
    h.advance(VN5_RECONNECT_MIN_MS * 2);
    h.sockets[2].onopen?.({});
    h.advance(VN5_STABLE_CONNECTION_MS);
    h.sockets[2].onclose?.({});
    expect(h.last().reconnectAttempt).toBe(1);
  });

  it('gives up on a socket that never opens and retries', () => {
    const h = harness();
    h.session.start('vn', { clipboard: false, websocket: true });
    h.advance(VN5_CONNECT_TIMEOUT_MS);
    expect(h.sockets[0].closed).toBe(true);
    expect(h.last().websocket).toBe('error');
    h.advance(VN5_RECONNECT_MIN_MS);
    expect(h.sockets).toHaveLength(2);
  });

  it('a line before the open event counts as connected, so the timeout does not kill it', () => {
    const h = harness();
    h.session.start('vn', { clipboard: false, websocket: true });
    h.sockets[0].onmessage?.({ data: 'こんにちは。' });
    h.advance(VN5_CONNECT_TIMEOUT_MS * 2);
    expect(h.sockets).toHaveLength(1);
    expect(h.sockets[0].closed).toBe(false);
    expect(h.last().websocket).toBe('connected');
  });

  it('a replaced socket closing late does not start a second reconnect', () => {
    const h = harness();
    h.session.start('vn', { clipboard: false, websocket: true });
    const first = h.sockets[0];
    const lateClose = first.onclose;
    first.onclose?.({});
    h.advance(VN5_RECONNECT_MIN_MS);
    expect(h.sockets).toHaveLength(2);
    lateClose?.({});
    h.advance(VN5_RECONNECT_MAX_FOR_TEST);
    expect(h.sockets).toHaveLength(2);
  });

  it('stop cancels the pending retry', () => {
    const h = harness();
    h.session.start('vn', { clipboard: false, websocket: true });
    h.sockets[0].onclose?.({});
    h.session.stop();
    h.advance(60_000);
    expect(h.sockets).toHaveLength(1);
  });
});

const VN5_RECONNECT_MAX_FOR_TEST = 5_000;
