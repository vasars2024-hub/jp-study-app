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
import {
  VN5_CONNECT_TIMEOUT_MS,
  VN5_STABLE_CONNECTION_MS,
  vn5ReconnectDelay,
} from '../../shared/visualNovelStudy5';
import {
  VN5_DEDUPE_WINDOW,
  VN5_DEFAULT_LINE_FILTERS,
  vn5CleanLine,
  vn5CompileRule,
  vn5NormalizeLineFilters,
  type Vn5LineFilters,
} from '../../shared/visualNovelLineFilters';

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
  /**
   * True when a clipboard change came from the app itself — the user copying a
   * word out of the dictionary popup or the reader — rather than from the game's
   * text hooker. Such a change is skipped, never saved as a line.
   */
  clipboardFromApp?: () => boolean;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Jitter source for the reconnect backoff (tests pin it). */
  random?: () => number;
}

export interface CaptureStartOptions {
  clipboard: boolean;
  websocket: boolean;
  websocketUrl?: string;
  test?: boolean;
  /** Cleanup and the user's filters (Capture settings). Defaults when absent. */
  lineFilters?: Vn5LineFilters;
}

export const CLIPBOARD_POLL_MS = 400;
/** A test session ends itself; it exists to answer "is my hooker wired up?". */
export const TEST_CAPTURE_MS = 60_000;
/** The same text again from the same hook inside this window is the hook re-firing, not the game. */
export const SAME_SOURCE_BURST_MS = 400;
/** How long the other pipe of a two-source hooker may lag behind with its copy of a line. */
export const CROSS_SOURCE_ECHO_MS = 3_000;

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
  /** Failed connections in a row; reset only after a connection stayed up (VN5_STABLE_CONNECTION_MS). */
  let reconnectAttempt = 0;
  let connectTimer: unknown = null;
  let openedAt = 0;
  const random = deps.random ?? Math.random;
  let testTimer: unknown = null;
  let generation = 0;
  /**
   * The last ACCEPTED line, its source and the other sources that have since
   * echoed it. A hooker wired to both pipes delivers every line twice (once per
   * source), so the first echo from another source is dropped; a burst of the
   * same text from the SAME source is a hook re-firing and is dropped too. Any
   * other repeat is the game really saying the line again ("はい。" twice in a
   * row) and is kept, which a flat "same text within 3 s" rule used to lose.
   */
  let lastText = '';
  let lastTextAt = 0;
  let lastSource: VisualNovelCaptureSource | null = null;
  let echoedBy = new Set<VisualNovelCaptureSource>();
  let filters: Vn5LineFilters = VN5_DEFAULT_LINE_FILTERS;
  let compiledRules: (RegExp | null)[] = [];
  /** The last few accepted lines, for `dedupeRecent`. */
  let recentLines: string[] = [];

  const setFilters = (next: Vn5LineFilters | undefined): void => {
    filters = vn5NormalizeLineFilters(next ?? VN5_DEFAULT_LINE_FILTERS);
    compiledRules = filters.rules.map(vn5CompileRule);
  };

  const publish = (patch: Partial<VisualNovelCaptureState>): VisualNovelCaptureState => {
    state = { ...state, ...patch };
    deps.broadcast(state);
    return state;
  };

  /** True when `collapsed` is a duplicate delivery of the line just accepted, not a new reading of it. */
  const isEchoOfLastLine = (collapsed: string, source: VisualNovelCaptureSource): boolean => {
    if (collapsed !== lastText || lastSource === null) return false;
    const elapsed = now() - lastTextAt;
    if (source === lastSource) return elapsed < SAME_SOURCE_BURST_MS;
    if (elapsed >= CROSS_SOURCE_ECHO_MS || echoedBy.has(source)) return false;
    echoedBy.add(source);
    return true;
  };

  const receive = (raw: string, source: VisualNovelCaptureSource): void => {
    if (!state.active) return;
    // Cleanup and the user's rules first: a line a rule drops never counts as
    // "the last line" for echo detection either.
    const cleaned = vn5CleanLine(raw, filters, compiledRules);
    if (cleaned.dropped) {
      if (isCapturableText(raw)) publish({ filtered: (state.filtered ?? 0) + 1 });
      return;
    }
    const text = cleaned.text;
    if (!isCapturableText(text)) return;
    const collapsed = text.replace(/\s+/g, '');
    if (isEchoOfLastLine(collapsed, source)) return;
    if (filters.dedupeRecent && recentLines.includes(collapsed)) {
      publish({ filtered: (state.filtered ?? 0) + 1 });
      return;
    }
    lastText = collapsed;
    lastTextAt = now();
    lastSource = source;
    echoedBy = new Set();
    recentLines = [...recentLines, collapsed].slice(-VN5_DEDUPE_WINDOW);
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
    if (deps.clipboardFromApp?.()) return;
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
    openedAt = 0;
    // `token` alone is not enough: a socket replaced by a reconnect within the
    // same session shares it, and its late close used to schedule a second,
    // parallel reconnect. Every callback checks it is still THE socket.
    const current = (): boolean => token === generation && socket === opened;
    const markOpen = (): void => {
      if (openedAt) return;
      openedAt = now();
      if (connectTimer) cancel(connectTimer);
      connectTimer = null;
      publish({ websocket: 'connected', lastError: '', nextRetryAt: null });
    };
    // A server that accepts the TCP connection but never completes the upgrade
    // would otherwise leave the session "connecting" forever.
    connectTimer = later(() => {
      connectTimer = null;
      if (!current() || openedAt) return;
      socket = null;
      opened.onclose = null;
      try {
        opened.close();
      } catch {
        /* never opened */
      }
      publish({ websocket: 'error' });
      scheduleReconnect(url, token);
    }, VN5_CONNECT_TIMEOUT_MS);
    opened.onopen = () => {
      if (!current()) return;
      markOpen();
    };
    opened.onmessage = (event) => {
      if (!current()) return;
      // Some servers push before the open event reaches us; a line is proof of life.
      markOpen();
      const text = parseTexthookerMessage(event.data);
      if (text) receive(text, 'websocket');
    };
    opened.onerror = () => {
      if (!current()) return;
      publish({ websocket: 'error' });
    };
    opened.onclose = () => {
      if (!current()) return;
      socket = null;
      if (connectTimer) cancel(connectTimer);
      connectTimer = null;
      // Only a connection that held counts as recovered; a server that accepts
      // and drops at once keeps backing off instead of being hammered.
      if (openedAt && now() - openedAt >= VN5_STABLE_CONNECTION_MS) reconnectAttempt = 0;
      openedAt = 0;
      if (state.websocket !== 'error') publish({ websocket: 'connecting' });
      scheduleReconnect(url, token);
    };
  };

  const scheduleReconnect = (url: string, token: number): void => {
    if (token !== generation || !state.active || reconnectTimer) return;
    const delay = vn5ReconnectDelay(reconnectAttempt, random);
    reconnectAttempt += 1;
    reconnectTimer = later(() => {
      reconnectTimer = null;
      connect(url, token);
    }, delay);
    publish({ reconnectAttempt, nextRetryAt: now() + delay });
  };

  const teardown = (): void => {
    generation += 1;
    if (clipboardTimer) stopEvery(clipboardTimer);
    clipboardTimer = null;
    if (reconnectTimer) cancel(reconnectTimer);
    reconnectTimer = null;
    if (connectTimer) cancel(connectTimer);
    connectTimer = null;
    openedAt = 0;
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
      lastSource = null;
      echoedBy = new Set();
      recentLines = [];
      setFilters(options.lineFilters);
      reconnectAttempt = 0;
      state = {
        ...idleVisualNovelCaptureState(),
        visualNovelId,
        active: true,
        test: options.test === true,
        clipboard: options.clipboard ? 'listening' : 'off',
        websocket: options.websocket ? 'connecting' : 'off',
        websocketUrl,
        startedAt: now(),
        filtered: 0,
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

    /** New filters from the Capture settings apply to the running session at once. */
    setLineFilters: setFilters,

    /** Test seam and hook-file entry point: feed text as if a source produced it. */
    receive,
  };
}

export type CaptureSession = ReturnType<typeof createCaptureSession>;
