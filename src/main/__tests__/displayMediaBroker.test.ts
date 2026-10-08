/**
 * The app's one display-media handler: a request is routed to the window whose
 * MAIN FRAME made it, and everybody else — an unregistered window, a subframe,
 * a released registration, a decision that throws — is refused.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handler: null as null | ((request: unknown, callback: (streams: unknown) => void) => void),
  allowed: new Set<number>(),
  installs: 0,
}));

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      setDisplayMediaRequestHandler: (fn: typeof h.handler) => {
        h.installs += 1;
        h.handler = fn;
      },
    },
  },
}));
vi.mock('../securityHardening', () => ({
  allowDisplayCapture: (id: number) => {
    h.allowed.add(id);
    return () => h.allowed.delete(id);
  },
}));

import {
  decideDisplayMediaRequest,
  displayMediaRequesterCount,
  installDisplayMediaBroker,
  registerDisplayMediaRequester,
} from '../displayMediaBroker';

const contents = (id: number, processId = 7) => ({ id, mainFrame: { processId, routingId: id } });
const ask = (frame: unknown): Promise<unknown> => new Promise((resolve) => h.handler!({ frame }, resolve));

describe('display-media broker', () => {
  it('installs exactly one handler however often it is asked', () => {
    installDisplayMediaBroker();
    installDisplayMediaBroker();
    registerDisplayMediaRequester(contents(1), () => null)();
    expect(h.installs).toBe(1);
  });

  it('refuses a request from a window nobody registered', async () => {
    expect(await ask({ processId: 7, routingId: 99 })).toEqual({});
  });

  it('routes each request to the window whose main frame made it', async () => {
    const offA = registerDisplayMediaRequester(contents(10), () => ({ video: { id: 'screen:a' } as never }));
    const offB = registerDisplayMediaRequester(contents(11), async () => ({ video: { id: 'screen:b' } as never, audio: 'loopback' }));
    expect(await ask({ processId: 7, routingId: 10 })).toEqual({ video: { id: 'screen:a' } });
    expect(await ask({ processId: 7, routingId: 11 })).toEqual({ video: { id: 'screen:b' }, audio: 'loopback' });
    // Same routing id in another renderer process is another frame.
    expect(await ask({ processId: 8, routingId: 10 })).toEqual({});
    expect(h.allowed.has(10) && h.allowed.has(11)).toBe(true);
    offA();
    offB();
  });

  it('a released registration is refused again, and so is its permission', async () => {
    const off = registerDisplayMediaRequester(contents(20), () => ({ video: { id: 's' } as never }));
    off();
    off();
    expect(await ask({ processId: 7, routingId: 20 })).toEqual({});
    expect(h.allowed.has(20)).toBe(false);
  });

  it('a stale disposer never removes a newer registration of the same window', async () => {
    const first = registerDisplayMediaRequester(contents(30), () => ({ video: { id: 'old' } as never }));
    const second = registerDisplayMediaRequester(contents(30), () => ({ video: { id: 'new' } as never }));
    first();
    expect(await ask({ processId: 7, routingId: 30 })).toEqual({ video: { id: 'new' } });
    second();
    expect(displayMediaRequesterCount()).toBe(0);
  });

  it('a decision that throws, a missing frame or a destroyed window is a refusal', async () => {
    const offA = registerDisplayMediaRequester(contents(40), () => { throw new Error('no sources'); });
    expect(await ask({ processId: 7, routingId: 40 })).toEqual({});
    expect(await decideDisplayMediaRequest({})).toBeNull();
    const dead = { id: 41, get mainFrame(): never { throw new Error('destroyed'); } };
    const offB = registerDisplayMediaRequester(dead, () => ({ video: { id: 'x' } as never }));
    expect(await ask({ processId: 7, routingId: 41 })).toEqual({});
    offA();
    offB();
  });
});
