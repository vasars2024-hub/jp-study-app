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
  isBlobLike,
  isCapturableText,
  normalizeTexthookerUrl,
  parseTexthookerMessage,
  VisualNovelError,
  visualNovelErrorCode,
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
   * Which of the app's own windows has focus when the clipboard changes:
   *
   *   - 'none'   — the game (or anything else) has it: the change is the hooker's.
   *   - 'reader' — the VN reader overlay. The user keeps it focused while playing
   *                (clicking a word, then the game again), and an auto-advancing
   *                game keeps writing lines meanwhile, so a change is still a line
   *                — unless it is a piece of a line just captured, i.e. a word the
   *                user copied out of the reader.
   *   - 'other'  — any other app window: the user is working in the app (copying
   *                a word from the dictionary popup, say), so the change is skipped
   *                and remembered as seen, or it would be saved as a "line" the
   *                moment the game got focus back.
   */
  focusedAppWindow?: () => 'none' | 'reader' | 'other';
  /**
   * Whether a saved line of this novel (one the reader may be showing from before
   * this session) contains `collapsed` — the reader's "copy line" and a copied
   * word from an older line are the user's copies too.
   */
  savedLineContains?: (visualNovelId: string, collapsed: string) => boolean;
  /** Older form of `focusedAppWindow`: true means 'other'. */
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
/** Captured lines a copy made in the reader is checked against. */
export const READER_COPY_WINDOW = 50;
/** OCR'd lines a new read is compared with: the text box re-read is not a new line. */
export const OCR_RECENT_WINDOW = 8;
/** Two reads of the box this alike are the same line read twice (OCR noise), not two lines. */
export const OCR_SAME_LINE_SIMILARITY = 0.85;

/** What an OCR'd line is compared by: its characters, without spacing or punctuation. */
export function ocrLineKey(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, '');
}

function bigrams(text: string): Map<string, number> {
  const chars = [...text];
  const out = new Map<string, number>();
  if (chars.length < 2) {
    if (chars.length) out.set(chars[0], 1);
    return out;
  }
  for (let i = 0; i < chars.length - 1; i += 1) {
    const gram = chars[i] + chars[i + 1];
    out.set(gram, (out.get(gram) ?? 0) + 1);
  }
  return out;
}

/** Dice similarity of two strings' character bigrams, 0–1. */
export function ocrLineSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const count of ga.values()) total += count;
  for (const count of gb.values()) total += count;
  for (const [gram, count] of ga) overlap += Math.min(count, gb.get(gram) ?? 0);
  return total ? (2 * overlap) / total : 0;
}

/**
 * Whether an OCR read of the text box is a line already captured.
 *
 * A watched box is re-read whenever its pixels change — a cursor arrow, a
 * blinking "next" icon, a character sprite moving behind a translucent box —
 * so the same line comes back many times, and OCR does not read it the same
 * way twice. The same characters as any recent read, or a near-identical read
 * of the last one, is that line again.
 */
export function isOcrRepeat(text: string, recent: readonly string[]): boolean {
  const key = ocrLineKey(text);
  if (!key) return true;
  if (recent.includes(key)) return true;
  const last = recent[recent.length - 1];
  return last !== undefined && ocrLineSimilarity(key, last) >= OCR_SAME_LINE_SIMILARITY;
}

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
  /**
   * A longer tail of accepted lines as the reader shows them (no speaker), to
   * recognise a word or line copied out of the reader. A hooker's own delivery
   * of a line with a speaker (「…」 / 【…】) is never one of these, so a game
   * repeating such a line is still captured; a speakerless line repeated while
   * the reader has focus cannot be told from the reader's "copy line" and is
   * skipped.
   */
  let readerLines: string[] = [];
  /** Recent OCR'd lines (`ocrLineKey`), for `isOcrRepeat`. */
  let recentOcr: string[] = [];

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
    if (source === 'ocr') {
      // The box is read again on every pixel change: only a new line counts,
      // and a re-read is not "filtered" — nothing the user asked for was dropped.
      if (isOcrRepeat(text, recentOcr)) return;
      recentOcr = [...recentOcr, ocrLineKey(text)].slice(-OCR_RECENT_WINDOW);
    }
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
    // What the reader shows (and copies): the line without its speaker.
    readerLines = [...readerLines, line.japanese.replace(/\s+/g, '')].slice(-READER_COPY_WINDOW);
    let added = 1;
    if (!state.test) {
      try {
        added = deps.saveLines(state.visualNovelId, [line], source);
      } catch (error) {
        publish({ lastError: error instanceof Error ? error.message : String(error), lastErrorCode: visualNovelErrorCode(error) });
        return;
      }
    }
    publish({
      lines: state.lines + added,
      lastLine: { japanese: line.japanese, speaker: line.speaker, source, at: now() },
      lastError: '',
      lastErrorCode: '',
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
    const focus = deps.focusedAppWindow?.() ?? (deps.clipboardFromApp?.() ? 'other' : 'none');
    if (focus === 'other') return;
    if (focus === 'reader' && copiedFromReader(text)) return;
    receive(text, 'clipboard');
  };

  /** A word or phrase taken out of a line this session already captured. */
  const copiedFromReader = (text: string): boolean => {
    const collapsed = text.replace(/\s+/g, '');
    if (!collapsed) return false;
    if (readerLines.some((line) => line.includes(collapsed))) return true;
    try {
      return deps.savedLineContains?.(state.visualNovelId, collapsed) === true;
    } catch {
      return false;
    }
  };

  const connect = (url: string, token: number): void => {
    if (token !== generation || !state.active) return;
    publish({ websocket: 'connecting' });
    let opened: CaptureSocket;
    try {
      opened = deps.createSocket(url);
    } catch (error) {
      publish({
        websocket: 'error',
        lastError: error instanceof Error ? error.message : String(error),
        lastErrorCode: visualNovelErrorCode(error),
      });
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
    /**
     * A binary frame can arrive as a Blob (Node's WebSocket defaults to it),
     * whose bytes come back asynchronously. Frames behind one wait for it, so
     * lines are captured in the order the hooker sent them.
     */
    let pendingFrames: Promise<void> | null = null;
    const handleFrame = (data: unknown): void => {
      const text = parseTexthookerMessage(data);
      if (text) receive(text, 'websocket');
    };
    opened.onmessage = (event) => {
      if (!current()) return;
      // Some servers push before the open event reaches us; a line is proof of life.
      markOpen();
      const data = event.data;
      if (!pendingFrames && !isBlobLike(data)) {
        handleFrame(data);
        return;
      }
      const job: Promise<void> = (pendingFrames ?? Promise.resolve())
        .then(async () => {
          const bytes = isBlobLike(data) ? await data.arrayBuffer() : data;
          if (current()) handleFrame(bytes);
        })
        .catch(() => undefined)
        .finally(() => {
          if (pendingFrames === job) pendingFrames = null;
        });
      pendingFrames = job;
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
      // A test answers "is my hooker wired up?". Run over a live capture it used to
      // REPLACE it: lines stopped being saved, and when the test ended capture was
      // simply off, mid-game, with nothing saying so.
      if (options.test && state.active && !state.test) {
        throw new VisualNovelError('capture-running', 'Capture is already running; stop it before testing.');
      }
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
      readerLines = [];
      recentOcr = [];
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

    /** How the session's extras are doing (OCR watch, voice buffer, screenshots), for the UI. */
    setStatus(patch: Partial<Pick<VisualNovelCaptureState, 'ocr' | 'audio' | 'screenshots'>>): VisualNovelCaptureState {
      if (!state.active) return state;
      return publish(patch);
    },

    /** Test seam and hook-file entry point: feed text as if a source produced it. */
    receive,
  };
}

export type CaptureSession = ReturnType<typeof createCaptureSession>;
