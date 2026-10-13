// @vitest-environment node
/**
 * VN capture correctness (scorecard bugs 24, 27 and binary texthooker frames),
 * at the session level with a hand-cranked clock and fake sockets:
 *
 *   - "Test" while a real capture runs is refused instead of replacing it.
 *   - The clipboard is still captured while the VN READER has focus; only a
 *     piece of an already-captured line (a word copied out of the reader) is
 *     skipped there. Other app windows still skip.
 *   - Binary frames (ArrayBuffer, Buffer, Blob) are captured, in order.
 *   - A failed save says what failed as a code, not only English text.
 */
import { describe, expect, it } from 'vitest';
import {
  CLIPBOARD_POLL_MS,
  SAME_SOURCE_BURST_MS,
  createCaptureSession,
  type CaptureSocket,
} from '../immersion/visualNovelCaptureSession';
import { VisualNovelError, type VisualNovelCaptureState } from '../../shared/visualNovelCapture';
import type { VisualNovelHookLine } from '../../shared/visualNovelHook';

type Focus = 'none' | 'reader' | 'other';
type FakeSocket = CaptureSocket & { url: string; closed: boolean };

function harness(options: {
  focus?: () => Focus;
  savedLineContains?: (id: string, collapsed: string) => boolean;
  saveLines?: (id: string, lines: VisualNovelHookLine[]) => number;
} = {}) {
  let now = 1_000;
  let clipboard = '';
  let nextHandle = 1;
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, { fn: () => void; at: number }>();
  const sockets: FakeSocket[] = [];
  const saved: Array<{ id: string; japanese: string; speaker: string; source: string }> = [];
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
      } as FakeSocket;
      sockets.push(socket);
      return socket;
    },
    saveLines: (id, lines, source) => {
      if (options.saveLines) return options.saveLines(id, lines);
      for (const line of lines) saved.push({ id, japanese: line.japanese, speaker: line.speaker, source });
      return lines.length;
    },
    broadcast: (state) => states.push(state),
    focusedAppWindow: options.focus,
    savedLineContains: options.savedLineContains,
    now: () => now,
    setInterval: (fn) => {
      const handle = nextHandle++;
      intervals.set(handle, fn);
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
    copy(value: string) {
      clipboard = value;
      now += CLIPBOARD_POLL_MS;
      for (const fn of [...intervals.values()]) fn();
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('Test never replaces a running capture (bug 24)', () => {
  it('refuses a test while a real capture runs, and the capture keeps going', () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: true, websocket: true });
    const live = h.sockets[0];
    expect(() => h.session.start('vn-1', { clipboard: true, websocket: true, test: true }))
      .toThrow(VisualNovelError);
    try {
      h.session.start('vn-1', { clipboard: true, websocket: true, test: true });
    } catch (error) {
      expect((error as VisualNovelError).vnCode).toBe('capture-running');
    }
    // Same session, same socket, still saving.
    expect(h.session.state()).toMatchObject({ active: true, test: false, visualNovelId: 'vn-1' });
    expect(live.closed).toBe(false);
    expect(h.sockets).toHaveLength(1);
    live.onmessage?.({ data: '実験は続く。' });
    expect(h.saved.map((line) => line.japanese)).toEqual(['実験は続く。']);
  });

  it('refuses it for a capture running on ANOTHER novel too', () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: true, websocket: false });
    expect(() => h.session.start('vn-2', { clipboard: true, websocket: false, test: true })).toThrow(/already running/);
    expect(h.session.state().visualNovelId).toBe('vn-1');
  });

  it('still allows a test when nothing runs, a new test over a test, and Start over a test', () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: true, websocket: false, test: true });
    expect(h.session.state()).toMatchObject({ active: true, test: true });
    h.session.start('vn-1', { clipboard: true, websocket: false, test: true });
    expect(h.session.state()).toMatchObject({ active: true, test: true });
    h.session.start('vn-1', { clipboard: true, websocket: false });
    expect(h.session.state()).toMatchObject({ active: true, test: false });
    h.session.stop();
    h.session.start('vn-1', { clipboard: true, websocket: false, test: true });
    expect(h.session.state()).toMatchObject({ active: true, test: true });
  });
});

describe('clipboard while the VN reader has focus (bug 27)', () => {
  it('captures a new line while the reader is focused (an auto-advancing game)', () => {
    const h = harness({ focus: () => 'reader' });
    h.session.start('vn-1', { clipboard: true, websocket: false });
    h.copy('紅莉栖「実験を始めよう。」');
    h.copy('まゆり「トゥットゥルー♪」');
    expect(h.saved.map((line) => line.japanese)).toEqual(['実験を始めよう。', 'トゥットゥルー♪']);
  });

  it('skips a word or a whole line copied OUT of the reader', () => {
    const h = harness({ focus: () => 'reader' });
    h.session.start('vn-1', { clipboard: true, websocket: false });
    h.copy('紅莉栖「実験を始めよう。」');
    h.copy('実験');
    h.copy('実験を始めよう。');
    expect(h.saved).toHaveLength(1);
  });

  it('skips a copy of an older saved line the reader shows from before this session', () => {
    const asked: Array<[string, string]> = [];
    const h = harness({
      focus: () => 'reader',
      savedLineContains: (id, collapsed) => {
        asked.push([id, collapsed]);
        return collapsed === '昨日の台詞';
      },
    });
    h.session.start('vn-9', { clipboard: true, websocket: false });
    h.copy('昨日の台詞');
    expect(h.saved).toEqual([]);
    expect(asked).toEqual([['vn-9', '昨日の台詞']]);
  });

  it('a line skipped while the reader had focus does not swallow the next real line', () => {
    const h = harness({ focus: () => 'reader' });
    h.session.start('vn-1', { clipboard: true, websocket: false });
    h.copy('ダル「オカリン、それマジ？」');
    h.copy('オカリン');
    h.advance(SAME_SOURCE_BURST_MS);
    h.copy('ダル「オカリン、それマジ？」');
    // The game said it again after the user copied a word: a real repeat, kept.
    expect(h.saved.map((line) => line.japanese)).toEqual(['オカリン、それマジ？', 'オカリン、それマジ？']);
  });

  it('still skips copies made while any OTHER app window has focus', () => {
    let focus: Focus = 'other';
    const h = harness({ focus: () => focus });
    h.session.start('vn-1', { clipboard: true, websocket: false });
    h.copy('勉強');
    expect(h.saved).toEqual([]);
    focus = 'none';
    h.copy('紅莉栖「次の行。」');
    expect(h.saved.map((line) => line.japanese)).toEqual(['次の行。']);
  });
});

describe('binary texthooker frames', () => {
  it('captures ArrayBuffer and Buffer frames synchronously', () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: false, websocket: true });
    const socket = h.sockets[0];
    const bytes = new TextEncoder().encode('【小町】おはようございます。');
    socket.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    socket.onmessage?.({ data: Buffer.from('今日は雨ですね。', 'utf8') });
    expect(h.saved).toEqual([
      { id: 'vn-1', japanese: 'おはようございます。', speaker: '小町', source: 'websocket' },
      { id: 'vn-1', japanese: '今日は雨ですね。', speaker: '', source: 'websocket' },
    ]);
  });

  it('captures a Blob frame, and keeps the hooker\'s order for frames behind it', async () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: false, websocket: true });
    const socket = h.sockets[0];
    socket.onmessage?.({ data: new Blob(['一行目のテキスト。']) });
    socket.onmessage?.({ data: '二行目のテキスト。' });
    socket.onmessage?.({ data: new Blob([JSON.stringify({ sentence: '三行目のテキスト。' })]) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.saved.map((line) => line.japanese)).toEqual(['一行目のテキスト。', '二行目のテキスト。', '三行目のテキスト。']);
  });

  it('drops a Blob that arrives after the session stopped', async () => {
    const h = harness();
    h.session.start('vn-1', { clipboard: false, websocket: true });
    const socket = h.sockets[0];
    socket.onmessage?.({ data: new Blob(['遅れて届いた行。']) });
    h.session.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.saved).toEqual([]);
  });
});

describe('capture errors carry a code', () => {
  it('a save that fails reports lastErrorCode, and the next good line clears it', () => {
    let fail = true;
    const h = harness({
      saveLines: (_id, lines) => {
        if (fail) throw new VisualNovelError('not-found', 'The visual novel does not exist.');
        return lines.length;
      },
    });
    h.session.start('vn-1', { clipboard: false, websocket: true });
    h.sockets[0].onmessage?.({ data: '保存できない行。' });
    expect(h.session.state()).toMatchObject({ lastErrorCode: 'not-found' });
    fail = false;
    h.sockets[0].onmessage?.({ data: '保存できる行。' });
    expect(h.session.state()).toMatchObject({ lastErrorCode: '', lastError: '', lines: 1 });
  });

  it('a socket that cannot be created reports websocket-unavailable', () => {
    const session = createCaptureSession({
      readClipboard: () => '',
      createSocket: () => {
        throw new VisualNovelError('websocket-unavailable', 'WebSocket is unavailable in this build.');
      },
      saveLines: () => 0,
      broadcast: () => undefined,
      setTimeout: () => 0,
      clearTimeout: () => undefined,
      setInterval: () => 0,
      clearInterval: () => undefined,
    });
    session.start('vn-1', { clipboard: false, websocket: true });
    expect(session.state()).toMatchObject({ websocket: 'error', lastErrorCode: 'websocket-unavailable' });
  });
});
