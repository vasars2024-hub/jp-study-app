/**
 * The capture session: main-process clipboard watching and a texthooker
 * websocket client, feeding parsed lines to one visual novel.
 *
 * It used to live in the panel. The clipboard watcher was a `setInterval` in
 * `VisualNovelPanel.tsx`, behind a closed disclosure, so it stopped the moment
 * the panel closed — i.e. exactly when the user switched to the game — and it
 * never parsed a speaker. Here it runs for as long as the game does, whatever
 * windows are open, and every line goes through `parseVisualNovelTextBox`.
 *
 * Dependencies are injected (clipboard reader, WebSocket constructor, timers)
 * so the session is testable without Electron or a real socket.
 */
import {
  idleVisualNovelCaptureState,
  isCapturableText,
  normalizeTexthookerUrl,
  parseTexthookerMessage,
  type VisualNovelCaptureSource,
  type VisualNovelCaptureState,
} from '../../shared/visualNovelCapture';
import { parseVisualNovelTextBox, type VisualNovelHookLine } from '../../shared/visualNovelHook';

export interface CaptureSocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  close(): void;
}

export interface CaptureSessionDeps {
  readClipboard: () => string;
  createSocket: (url: string) => CaptureSocket;
  /** Persist lines; return how many were new. Not called for a test session. */
  saveLines: (visualNovelId: string, lines: VisualNovelHookLine[], source: VisualNovelCaptureSource) => number;
  broadcast: (state: VisualNovelCaptureState) => void;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface CaptureStartOptions {
  clipboard: boolean;
  websocket: boolean;
  websocketUrl?: string;
  test?: boolean;
}

export const CLIPBOARD_POLL_MS = 400;
const RECONNECT_MIN_MS = 1_500;
const RECONNECT_MAX_MS = 15_000;
/** A test session ends itself; it exists to answer "is my hooker wired up?". */
export const TEST_CAPTURE_MS = 60_000;

export function createCaptureSession(deps: CaptureSessionDeps) {
  const now = deps.now ?? Date.now;
  const every = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const stopEvery = deps.clearInterval ?? ((handle: unknown) => clearInterval(handle as NodeJS.Timeout));
  const later = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout));

  let state: VisualNovelCaptureState = idleVisualNovelCaptureState();
  let clipboardTimer: unknown = null;
  let lastClipboard = '';
  let socket: CaptureSocket | null = null;
  let reconnectTimer: unknown = null;
  let reconnectDelay = RECONNECT_MIN_MS;
  let testTimer: unknown = null;
  let generation = 0;
  /** The last text seen from ANY source, so a hooker wired to both is not captured twice. */
  let lastText = '';
  let lastTextAt = 0;

  const publish = (patch: Partial<VisualNovelCaptureState>): VisualNovelCaptureState => {
    state = { ...state, ...patch };
    deps.broadcast(state);
    return state;
  };

  const receive = (text: string, source: VisualNovelCaptureSource): void => {
    if (!state.active || !isCapturableText(text)) return;
    const collapsed = text.replace(/\s+/g, '');
    if (collapsed === lastText && now() - lastTextAt < 3_000) return;
    lastText = collapsed;
    lastTextAt = now();
    const line = parseVisualNovelTextBox(text);
    if (!line) return;
    let added = 1;
    if (!state.test) {
      try {
        added = deps.saveLines(state.visualNovelId, [line], source);
      } catch (error) {
        publish({ lastError: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    publish({
      lines: state.lines + added,
      lastLine: { japanese: line.japanese, speaker: line.speaker, source, at: now() },
      lastError: '',
    });
  };

  const pollClipboard = (): void => {
    let text = '';
    try {
      text = deps.readClipboard();
    } catch {
      return;
    }
    if (!text || text === lastClipboard) return;
    lastClipboard = text;
    receive(text, 'clipboard');
  };

  const connect = (url: string, token: number): void => {
    if (token !== generation || !state.active) return;
    publish({ websocket: 'connecting' });
    let opened: CaptureSocket;
    try {
      opened = deps.createSocket(url);
    } catch (error) {
      publish({ websocket: 'error', lastError: error instanceof Error ? error.message : String(error) });
      scheduleReconnect(url, token);
      return;
    }
    socket = opened;
    opened.onopen = () => {
      if (token !== generation) return;
      reconnectDelay = RECONNECT_MIN_MS;
      publish({ websocket: 'connected', lastError: '' });
    };
    opened.onmessage = (event) => {
      if (token !== generation) return;
      const text = parseTexthookerMessage(event.data);
      if (text) receive(text, 'websocket');
    };
    opened.onerror = () => {
      if (token !== generation) return;
      publish({ websocket: 'error' });
    };
    opened.onclose = () => {
      if (token !== generation) return;
      socket = null;
      if (state.websocket !== 'error') publish({ websocket: 'connecting' });
      scheduleReconnect(url, token);
    };
  };

  const scheduleReconnect = (url: string, token: number): void => {
    if (token !== generation || !state.active || reconnectTimer) return;
    reconnectTimer = later(() => {
      reconnectTimer = null;
      connect(url, token);
    }, reconnectDelay);
    reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
  };

  const teardown = (): void => {
    generation += 1;
    if (clipboardTimer) stopEvery(clipboardTimer);
    clipboardTimer = null;
    if (reconnectTimer) cancel(reconnectTimer);
    reconnectTimer = null;
    if (testTimer) cancel(testTimer);
    testTimer = null;
    const open = socket;
    socket = null;
    if (open) {
      open.onclose = null;
      try {
        open.close();
      } catch {
        /* already closed */
      }
    }
  };

  const stop = (): VisualNovelCaptureState => {
    teardown();
    const last = state;
    state = { ...idleVisualNovelCaptureState(), lastLine: last.lastLine, lines: last.lines, test: last.test };
    deps.broadcast(state);
    return state;
  };

  return {
    state: (): VisualNovelCaptureState => state,

    start(visualNovelId: string, options: CaptureStartOptions): VisualNovelCaptureState {
      teardown();
      const token = generation;
      const websocketUrl = normalizeTexthookerUrl(options.websocketUrl);
      // Whatever is on the clipboard NOW was put there before the game ran; only
      // a change from here on is a captured line.
      try {
        lastClipboard = deps.readClipboard();
      } catch {
        lastClipboard = '';
      }
      lastText = '';
      reconnectDelay = RECONNECT_MIN_MS;
      state = {
        ...idleVisualNovelCaptureState(),
        visualNovelId,
        active: true,
        test: options.test === true,
        clipboard: options.clipboard ? 'listening' : 'off',
        websocket: options.websocket ? 'connecting' : 'off',
        websocketUrl,
        startedAt: now(),
      };
      deps.broadcast(state);
      if (options.clipboard) clipboardTimer = every(pollClipboard, CLIPBOARD_POLL_MS);
      if (options.websocket) connect(websocketUrl, token);
      if (options.test) {
        testTimer = later(() => {
          if (token === generation) stop();
        }, TEST_CAPTURE_MS);
      }
      return state;
    },

    stop,

    /** Test seam and hook-file entry point: feed text as if a source produced it. */
    receive,
  };
}

export type CaptureSession = ReturnType<typeof createCaptureSession>;
