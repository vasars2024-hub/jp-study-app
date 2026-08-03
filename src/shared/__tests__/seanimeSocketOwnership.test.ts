/**
 * One socket per sidecar generation per window — Phase 6 slice 15.
 *
 * The first block is the MEASUREMENT that motivates the rest: a model of the pinned
 * sidecar's own connection registry, transcribed from
 * `seanime-upstream/internal/events/websocket.go` (`AddConn` line 147, `SendEventTo` line
 * 206, `RemoveConn` line 161). It is here so the defect being prevented is on record as a
 * property rather than as a paragraph — routing the player into Blanc is what would first
 * make two same-id clients reachable, and a reviewer should be able to see the damage
 * without reading Go.
 *
 * The model is deliberately faithful on the three details that matter and ignorant of
 * everything else: append-not-replace, no break on the first id match, remove-first-match.
 */
import { describe, expect, it } from 'vitest';
import {
  acquireSeanimeSocket,
  EMPTY_SEANIME_SOCKET_POOL,
  liveSeanimeSocketKeys,
  releaseSeanimeSocket,
  seanimeSocketKey,
  seanimeSocketSubscriberCount,
  type SeanimeSocketPoolState,
} from '../seanimeSocketOwnership';

/** Transcribed from the pinned sidecar. Not a stub of our code — a model of theirs. */
class SidecarRegistryModel {
  conns: { id: string; socket: string; open: boolean }[] = [];

  /** `AddConn` appends unconditionally. */
  add(id: string, socket: string): void {
    this.conns.push({ id, socket, open: true });
  }

  /** `RemoveConn` removes the first entry matching the id, then breaks. */
  remove(id: string): void {
    const index = this.conns.findIndex((c) => c.id === id);
    if (index >= 0) this.conns.splice(index, 1);
  }

  /** `SendEventTo` writes to EVERY conn with the id — there is no break. */
  deliver(id: string): string[] {
    return this.conns.filter((c) => c.id === id).map((c) => c.socket);
  }
}

describe('the defect two same-id clients would cause (measured, pre-fix)', () => {
  it('delivers every targeted event twice', () => {
    const registry = new SidecarRegistryModel();
    // Both providers in one window read the same module-level client id.
    registry.add('client-1', 'host-overlay');
    registry.add('client-1', 'blanc-player');

    expect(registry.deliver('client-1')).toEqual(['host-overlay', 'blanc-player']);
  });

  it('lets the socket that closes FIRST de-register the one still open', () => {
    const registry = new SidecarRegistryModel();
    registry.add('client-1', 'host-overlay');
    registry.add('client-1', 'blanc-player');

    // The Blanc player unmounts. `RemoveConn` matches on the id alone, so it drops the
    // FIRST entry — the host overlay's — and the entry left behind belongs to a socket
    // that is now closed.
    registry.remove('client-1');

    expect(registry.conns).toHaveLength(1);
    expect(registry.conns[0]?.socket).toBe('blanc-player');
    // The overlay's socket is still open and can no longer be addressed.
    expect(registry.deliver('client-1')).not.toContain('host-overlay');
  });
});

describe('acquireSeanimeSocket', () => {
  const key = seanimeSocketKey({ baseUrl: 'http://127.0.0.1:43110', token: 'tok' });

  it('tells the first subscriber to open and every later one to reuse', () => {
    let state: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;

    const first = acquireSeanimeSocket(state, key, 'host-overlay');
    expect(first.action).toBe('open');
    state = first.state;

    const second = acquireSeanimeSocket(state, key, 'blanc-player');
    expect(second.action).toBe('reuse');
    state = second.state;

    expect(seanimeSocketSubscriberCount(state, key)).toBe(2);
  });

  it('does not double-count a repeated acquire from one subscriber', () => {
    // React 18 StrictMode double-invokes effects in development. A refcount that counted
    // the second invocation would sit one release short of zero and never close.
    let state: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;
    state = acquireSeanimeSocket(state, key, 'blanc-player').state;
    const again = acquireSeanimeSocket(state, key, 'blanc-player');

    expect(again.action).toBe('reuse');
    expect(seanimeSocketSubscriberCount(again.state, key)).toBe(1);
    expect(again.state).toBe(state);
  });

  it('treats a new token as a different socket, not a reuse', () => {
    // A sidecar restart provisions a new port AND a new token. Reusing across that is the
    // "mounted against a stopped process" state the host already refuses to be in.
    const restarted = seanimeSocketKey({ baseUrl: 'http://127.0.0.1:43110', token: 'tok-2' });
    expect(restarted).not.toBe(key);

    let state: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;
    state = acquireSeanimeSocket(state, key, 'host-overlay').state;
    const afterRestart = acquireSeanimeSocket(state, restarted, 'host-overlay');

    expect(afterRestart.action).toBe('open');
  });
});

describe('releaseSeanimeSocket', () => {
  const key = seanimeSocketKey({ baseUrl: 'http://127.0.0.1:43110', token: 'tok' });

  it('keeps the socket while any subscriber remains, whatever the unmount order', () => {
    // The whole reason the socket is module-owned: the surface that opened it may be the
    // first to go, and a live directstream must survive that.
    let state: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;
    state = acquireSeanimeSocket(state, key, 'host-overlay').state;
    state = acquireSeanimeSocket(state, key, 'blanc-player').state;

    const ownerLeaves = releaseSeanimeSocket(state, key, 'host-overlay');
    expect(ownerLeaves.action).toBe('keep');
    state = ownerLeaves.state;
    expect(seanimeSocketSubscriberCount(state, key)).toBe(1);

    const lastLeaves = releaseSeanimeSocket(state, key, 'blanc-player');
    expect(lastLeaves.action).toBe('close');
    expect(liveSeanimeSocketKeys(lastLeaves.state)).toEqual([]);
  });

  it('never reports close for an unknown or repeated release', () => {
    // A stray cleanup must not be able to tear down a socket others are using.
    let state: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;
    state = acquireSeanimeSocket(state, key, 'host-overlay').state;

    expect(releaseSeanimeSocket(state, key, 'never-acquired').action).toBe('keep');
    expect(releaseSeanimeSocket(state, 'other-key', 'host-overlay').action).toBe('keep');

    const closed = releaseSeanimeSocket(state, key, 'host-overlay');
    expect(closed.action).toBe('close');
    expect(releaseSeanimeSocket(closed.state, key, 'host-overlay').action).toBe('keep');
  });

  it('drops the key entirely rather than leaving a hollow entry', () => {
    let state: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;
    state = acquireSeanimeSocket(state, key, 'host-overlay').state;
    state = releaseSeanimeSocket(state, key, 'host-overlay').state;

    expect(Object.prototype.hasOwnProperty.call(state, key)).toBe(false);
    expect(liveSeanimeSocketKeys(state)).toEqual([]);
  });
});

describe('the invariant the pool exists to hold', () => {
  it('opens exactly once across any interleaving of two surfaces', () => {
    const key = seanimeSocketKey({ baseUrl: 'http://127.0.0.1:1', token: 't' });
    // Every order in which the two surfaces can mount and unmount.
    const orders: [string, string][][] = [
      [['acquire', 'a'], ['acquire', 'b'], ['release', 'a'], ['release', 'b']],
      [['acquire', 'a'], ['acquire', 'b'], ['release', 'b'], ['release', 'a']],
      [['acquire', 'b'], ['acquire', 'a'], ['release', 'a'], ['release', 'b']],
      [['acquire', 'a'], ['release', 'a'], ['acquire', 'b'], ['release', 'b']],
    ];

    for (const order of orders) {
      let state: SeanimeSocketPoolState = EMPTY_SEANIME_SOCKET_POOL;
      let opens = 0;
      let closes = 0;
      for (const [op, id] of order) {
        if (op === 'acquire') {
          const r = acquireSeanimeSocket(state, key, id);
          if (r.action === 'open') opens += 1;
          state = r.state;
        } else {
          const r = releaseSeanimeSocket(state, key, id);
          if (r.action === 'close') closes += 1;
          state = r.state;
        }
      }
      // The last order closes and reopens deliberately — sequential, never concurrent.
      const expected = order[1]?.[0] === 'release' ? 2 : 1;
      expect({ order, opens, closes }).toEqual({ order, opens: expected, closes: expected });
      expect(liveSeanimeSocketKeys(state)).toEqual([]);
    }
  });
});
