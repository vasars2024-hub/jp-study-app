// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The cross-monitor drag broker.
 *
 * The invariant under test is the single-writer rule (B2): main never edits a
 * layout. It tells the target to adopt and the origin to release, and each
 * window commits its own desktop. So every assertion here is about *who is
 * told what*, never about stored state.
 */

const h = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => void>();
  const invokeHandlers = new Map<string, (event: unknown, payload: unknown) => unknown>();

  interface Sent {
    displayKey: string;
    channel: string;
    payload: unknown;
  }
  const sent: Sent[] = [];

  const state = {
    /** displayKey -> exists as a live window */
    windows: new Set<string>(['main', 'second', 'third']),
    /** displayKey -> desktop index */
    desktops: new Map<string, number>([
      ['main', 0],
      ['second', 1],
      ['third', 2],
    ]),
    /** point -> displayKey, keyed by x for simplicity */
    pointMap: (x: number): string | null => {
      if (x < 1000) return 'main';
      if (x < 2000) return 'second';
      if (x < 3000) return 'third';
      return null;
    },
    displayListeners: [] as (() => void)[],
  };

  return { handlers, invokeHandlers, sent, state };
});

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, cb: (event: unknown, payload: unknown) => void) => {
      h.handlers.set(channel, cb);
    },
    handle: (channel: string, cb: (event: unknown, payload: unknown) => unknown) => {
      h.invokeHandlers.set(channel, cb);
    },
  },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}));

vi.mock('../displays', () => ({
  keyForPoint: (x: number) => h.state.pointMap(x),
  onDisplaysChanged: (cb: () => void) => {
    h.state.displayListeners.push(cb);
    return () => undefined;
  },
}));

vi.mock('../desktopWindows', () => ({
  windowForDisplayKey: (key: string) =>
    h.state.windows.has(key)
      ? {
          isDestroyed: () => false,
          webContents: {
            send: (channel: string, payload: unknown) => h.sent.push({ displayKey: key, channel, payload }),
          },
        }
      : null,
  desktopIndexForDisplayKey: (key: string) => h.state.desktops.get(key) ?? null,
}));

const mod = await import('../deskDrag');
mod.registerDeskDragIpc();

const send = (channel: string, payload: unknown): void => {
  h.handlers.get(channel)?.({ sender: { id: 1 } }, payload);
};

const begin = (over: Record<string, unknown> = {}): void =>
  send('deskdrag:begin', {
    kind: 'window',
    id: 'w1',
    payload: { kind: 'window', snapshot: { id: 'w1' } },
    displayKey: 'main',
    ...over,
  });

const channels = (): string[] => h.sent.map((s) => s.channel);
const to = (key: string): string[] => h.sent.filter((s) => s.displayKey === key).map((s) => s.channel);

describe('deskDrag broker', () => {
  beforeEach(() => {
    send('deskdrag:cancel', undefined);
    h.sent.length = 0;
    h.state.windows = new Set(['main', 'second', 'third']);
  });

  describe('begin', () => {
    it('rejects an unknown kind', () => {
      begin({ kind: 'nonsense' });
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      expect(h.sent).toHaveLength(0);
    });

    it('rejects a payload with no id or displayKey', () => {
      begin({ id: 42 });
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      expect(h.sent).toHaveLength(0);
    });

    it('retires a previous drag rather than tracking two', () => {
      begin();
      h.sent.length = 0;
      begin({ id: 'w2' });
      expect(to('main')).toContain('deskdrag:cancelled');
    });
  });

  describe('move', () => {
    it('says nothing while the pointer is over the origin display', () => {
      begin();
      send('deskdrag:move', { screenX: 500, screenY: 100 });
      expect(h.sent).toHaveLength(0);
    });

    it('hovers the display under the cursor', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      const hover = h.sent.find((s) => s.channel === 'deskdrag:hover');
      expect(hover?.displayKey).toBe('second');
      expect(hover?.payload).toMatchObject({ kind: 'window', desktopIndex: 1 });
    });

    it('leaves the previous display exactly once when crossing to a third', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:move', { screenX: 2500, screenY: 100 });
      expect(to('second')).toEqual(['deskdrag:leave']);
      expect(to('third')).toEqual(['deskdrag:hover']);
    });

    it('retracts the hover when the pointer returns to the origin', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:move', { screenX: 500, screenY: 100 });
      expect(to('second')).toEqual(['deskdrag:leave']);
    });

    it('ignores a move with no live drag', () => {
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      expect(h.sent).toHaveLength(0);
    });

    it('ignores non-numeric coordinates', () => {
      begin();
      send('deskdrag:move', { screenX: 'x', screenY: null });
      expect(h.sent).toHaveLength(0);
    });
  });

  describe('end', () => {
    it('tells the target to adopt and the origin to release', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 1500, screenY: 100 });

      const adopt = h.sent.find((s) => s.channel === 'deskdrag:adopt');
      const release = h.sent.find((s) => s.channel === 'deskdrag:release');
      expect(adopt?.displayKey).toBe('second');
      expect(adopt?.payload).toMatchObject({ kind: 'window', id: 'w1', desktopIndex: 1 });
      expect(release?.displayKey).toBe('main');
      expect(release?.payload).toMatchObject({ kind: 'window', id: 'w1' });
    });

    it('adopts before it releases, so the item is never in flight nowhere', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 1500, screenY: 100 });
      const order = channels();
      expect(order.indexOf('deskdrag:adopt')).toBeLessThan(order.indexOf('deskdrag:release'));
    });

    it('cancels rather than adopting when released over the origin', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 500, screenY: 100 });
      expect(channels()).not.toContain('deskdrag:adopt');
      expect(to('main')).toContain('deskdrag:cancelled');
    });

    it('cancels when the target display has no window', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.state.windows.delete('second');
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 1500, screenY: 100 });
      expect(channels()).not.toContain('deskdrag:adopt');
      expect(to('main')).toContain('deskdrag:cancelled');
    });

    it('cancels when released off every display', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 9999, screenY: 100 });
      expect(to('main')).toContain('deskdrag:cancelled');
    });

    it('clears the hover on the target so no ghost is left behind', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 1500, screenY: 100 });
      expect(to('second')).toContain('deskdrag:leave');
    });

    it('a second end after the first does nothing', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      send('deskdrag:end', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 1500, screenY: 100 });
      expect(h.sent).toHaveLength(0);
    });
  });

  describe('cancel paths', () => {
    it('an explicit cancel returns the item to the origin', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:cancel', undefined);
      expect(to('second')).toContain('deskdrag:leave');
      expect(to('main')).toContain('deskdrag:cancelled');
    });

    it('a display removed mid-drag cancels instead of orphaning the item', () => {
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      h.state.windows.delete('second');
      for (const cb of h.state.displayListeners) cb();
      expect(to('main')).toContain('deskdrag:cancelled');
    });

    it('drops the drag silently when the ORIGIN window itself disappears', () => {
      // There is nothing to hand the item back to; announcing a cancel to a
      // dead window would be the only alternative.
      begin();
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      h.state.windows.delete('main');
      for (const cb of h.state.displayListeners) cb();
      expect(h.sent).toHaveLength(0);
      send('deskdrag:end', { screenX: 1500, screenY: 100 });
      expect(h.sent).toHaveLength(0);
    });
  });

  describe('every payload kind rides the same broker', () => {
    it.each(['window', 'icon', 'widget', 'note'])('carries a %s', (kind) => {
      begin({ kind, id: `${kind}-1`, payload: { kind, snapshot: { id: `${kind}-1` } } });
      send('deskdrag:move', { screenX: 1500, screenY: 100 });
      h.sent.length = 0;
      send('deskdrag:end', { screenX: 1500, screenY: 100 });
      const adopt = h.sent.find((s) => s.channel === 'deskdrag:adopt');
      expect(adopt?.payload).toMatchObject({ kind, id: `${kind}-1` });
    });
  });

  describe('isDragActive', () => {
    it('reports whether a drag is in flight', () => {
      expect(mod.isDragActive()).toBe(false);
      begin();
      expect(mod.isDragActive()).toBe(true);
      send('deskdrag:cancel', undefined);
      expect(mod.isDragActive()).toBe(false);
    });
  });
});
