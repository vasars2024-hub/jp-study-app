// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CLIPBOARD_POLL_MS,
  TEST_CAPTURE_MS,
  createCaptureSession,
  type CaptureSocket,
} from '../immersion/visualNovelCaptureSession';
import type { VisualNovelCaptureState } from '../../shared/visualNovelCapture';
import type { VisualNovelHookLine } from '../../shared/visualNovelHook';

/** A hand-cranked clock and timer queue, so the session runs without real time. */
function harness(initialClipboard = '', appFocused: () => boolean = () => false) {
  let now = 1_000;
  let clipboard = initialClipboard;
  let nextHandle = 1;
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  const timeouts = new Map<number, { fn: () => void; at: number }>();
  const sockets: Array<CaptureSocket & { url: string; closed: boolean }> = [];
  const saved: Array<{ id: string; lines: VisualNovelHookLine[]; source: string }> = [];
  const states: VisualNovelCaptureState[] = [];
  const session = createCaptureSession({
    readClipboard: () => clipboard,
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
      } as CaptureSocket & { url: string; closed: boolean };
      sockets.push(socket);
      return socket;
    },
    saveLines: (id, lines, source) => {
      saved.push({ id, lines, source });
      return lines.length;
    },
    broadcast: (state) => states.push(state),
    clipboardFromApp: appFocused,
    now: () => now,
    setInterval: (fn, ms) => {
      const handle = nextHandle++;
      intervals.set(handle, { fn, ms });
      return handle;
    },
    clearInterval: (handle) => intervals.delete(handle as number),
    setTimeout: (fn, ms) => {
      const handle = nextHandle++;
      timeouts.set(handle, { fn, at: now + ms });
      return handle;
    },
    clearTimeout: (handle) => timeouts.delete(handle as number),
  });
  return {
    session,
    saved,
    states,
    sockets,
    intervals,
    setClipboard: (value: string) => {
      clipboard = value;
    },
    /** Advance time, firing every due interval tick and timeout. */
    advance: (ms: number) => {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + CLIPBOARD_POLL_MS);
        for (const { fn } of [...intervals.values()]) fn();
        for (const [handle, timer] of [...timeouts.entries()]) {
          if (timer.at <= now) {
            timeouts.delete(handle);
            timer.fn();
          }
        }
      }
    },
  };
}

describe('clipboard capture in main', () => {
  it('ignores what was on the clipboard before the game ran, then captures each new line with its speaker', () => {
    const h = harness('something copied yesterday 昨日');
    h.session.start('vn-1', { clipboard: true, websocket: false });
    h.advance(CLIPBOARD_POLL_MS * 2);
    expect(h.saved).toEqual([]);

    h.setClipboard('紅莉栖「実験を始めよう。」');
    h.advance(CLIPBOARD_POLL_MS);
    expect(h.saved).toEqual([{
      id: 'vn-1',
      source: 'clipboard',
      lines: [{ japanese: '実験を始めよう。', speaker: '紅莉栖', kind: 'dialogue' }],
    }]);
    expect(h.session.state()).toMatchObject({
      active: true,
      lines: 1,
      clipboard: 'listening',
      lastLine: { japanese: '実験を始めよう。', speaker: '紅莉栖', source: 'clipboard' },
    });
  });

  it('keeps running whatever windows are open, and stops cleanly', () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: true, websocket: false });
    expect(h.intervals.size).toBe(1);
    h.session.stop();
    expect(h.intervals.size).toBe(0);
    h.setClipboard('新しい行');
    h.advance(CLIPBOARD_POLL_MS * 3);
    expect(h.saved).toEqual([]);
    expect(h.session.state().active).toBe(false);
  });

  it('skips what the user copies inside the app itself, such as a word from the dictionary popup', () => {
    let focused = true;
    const h = harness('', () => focused);
    h.session.start('vn-1', { clipboard: true, websocket: false });
    h.setClipboard('実験');
    h.advance(CLIPBOARD_POLL_MS);
    expect(h.saved).toEqual([]);
    // Back in the game, the hooker's next line is captured as usual.
    focused = false;
    h.setClipboard('紅莉栖「次の行。」');
    h.advance(CLIPBOARD_POLL_MS);
    expect(h.saved).toHaveLength(1);
  });

  it('skips non-game clipboard content', () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: true, websocket: false });
    h.setClipboard('C:\\Users\\me\\ゲーム\\save.dat');
    h.advance(CLIPBOARD_POLL_MS);
    h.setClipboard('an English sentence');
    h.advance(CLIPBOARD_POLL_MS);
    expect(h.saved).toEqual([]);
  });
});

describe('texthooker websocket client', () => {
  it('connects to the configured local server and captures each message', () => {
    const h = harness();
    h.session.start('vn-2', { clipboard: false, websocket: true, websocketUrl: 'ws://localhost:6677' });
    expect(h.sockets).toHaveLength(1);
    expect(h.sockets[0].url).toBe('ws://localhost:6677');
    expect(h.session.state().websocket).toBe('connecting');
    h.sockets[0].onopen?.({});
    expect(h.session.state().websocket).toBe('connected');
    h.sockets[0].onmessage?.({ data: JSON.stringify({ sentence: '【まゆり】トゥットゥルー' }) });
    expect(h.saved[0]).toMatchObject({ source: 'websocket', lines: [{ speaker: 'まゆり', japanese: 'トゥットゥルー' }] });
  });

  it('refuses a remote address and reconnects after the server goes away', () => {
    const h = harness();
    h.session.start('vn-2', { clipboard: false, websocket: true, websocketUrl: 'ws://evil.example:6677' });
    expect(h.sockets[0].url).toBe('ws://localhost:6677');
    h.sockets[0].onclose?.({});
    expect(h.sockets).toHaveLength(1);
    h.advance(2_000);
    expect(h.sockets).toHaveLength(2);
    h.session.stop();
    expect(h.sockets[1].closed).toBe(true);
  });

  it('does not save the same line twice when a hooker feeds both sources', () => {
    const h = harness();
    h.session.start('vn-3', { clipboard: true, websocket: true });
    h.sockets[0].onmessage?.({ data: '同じ行です。' });
    h.setClipboard('同じ行です。');
    h.advance(CLIPBOARD_POLL_MS);
    expect(h.saved).toHaveLength(1);
  });
});

describe('Test capture', () => {
  it('reports the line and its source without saving it, then ends by itself', () => {
    const h = harness();
    h.session.start('vn-4', { clipboard: true, websocket: false, test: true });
    h.setClipboard('ダル「オカリン、それマジ？」');
    h.advance(CLIPBOARD_POLL_MS);
    expect(h.saved).toEqual([]);
    expect(h.session.state()).toMatchObject({
      test: true,
      lastLine: { speaker: 'ダル', source: 'clipboard' },
    });
    h.advance(TEST_CAPTURE_MS);
    expect(h.session.state()).toMatchObject({ active: false, test: true });
    // The result survives the end of the test so the panel can still show it.
    expect(h.session.state().lastLine?.speaker).toBe('ダル');
  });
});
