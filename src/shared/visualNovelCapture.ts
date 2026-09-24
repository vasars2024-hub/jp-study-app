/**
 * Live text capture for a running visual novel — the shape shared by main
 * (which owns the capture session) and every window that shows it.
 *
 * Capture sources, all of which only ever read text the GAME has already put on
 * screen and a text hooker the USER runs has handed over:
 *
 *   - clipboard  — a text hooker (Textractor with its "Copy to Clipboard"
 *                  extension, or any tool that copies each line) writes every
 *                  new line to the clipboard; main polls it.
 *   - websocket  — the texthooker-page convention: a local server (Textractor's
 *                  websocket extension, Agent, LunaTranslator, …) pushes each
 *                  line over `ws://localhost:<port>`; main is the client.
 *   - hook       — the older file relay: tail a text file a hooker writes.
 *
 * Nothing here bundles or launches a hooker. Textractor is GPL and is never
 * shipped; the user installs whatever tool they prefer.
 */

export type VisualNovelCaptureSource = 'clipboard' | 'websocket' | 'hook';
export type VisualNovelWebsocketStatus = 'off' | 'connecting' | 'connected' | 'error';

/** The de-facto default port texthooker pages connect to. */
export const DEFAULT_TEXTHOOKER_URL = 'ws://localhost:6677';

export interface VisualNovelCaptureLine {
  japanese: string;
  speaker: string;
  source: VisualNovelCaptureSource;
  at: number;
}

export interface VisualNovelCaptureState {
  /** The novel captures are saved to; '' when no session is running. */
  visualNovelId: string;
  active: boolean;
  /** A test session reports lines without saving them. */
  test: boolean;
  clipboard: 'off' | 'listening';
  websocket: VisualNovelWebsocketStatus;
  websocketUrl: string;
  /** Lines saved (or, in a test, received) since the session started. */
  lines: number;
  lastLine: VisualNovelCaptureLine | null;
  lastError: string;
  startedAt: number | null;
}

export interface VisualNovelSessionState {
  visualNovelId: string;
  startedAt: number | null;
  /** How the running game is followed: its own process, by name, by capture inactivity, or by hand. */
  tracking: 'child' | 'process-name' | 'idle' | 'manual' | null;
}

/** A finished reading session, queued in main until a window records it in the study stats. */
export interface VisualNovelStudyTime {
  visualNovelId: string;
  title: string;
  seconds: number;
  chars: number;
  endedAt: number;
}

export function idleVisualNovelCaptureState(): VisualNovelCaptureState {
  return {
    visualNovelId: '',
    active: false,
    test: false,
    clipboard: 'off',
    websocket: 'off',
    websocketUrl: DEFAULT_TEXTHOOKER_URL,
    lines: 0,
    lastLine: null,
    lastError: '',
    startedAt: null,
  };
}

/**
 * Only a LOCAL websocket is accepted. The whole point of the source is a server
 * the user runs next to the game; a remote URL would turn the capture client
 * into something that phones out, which it must never do.
 */
export function normalizeTexthookerUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_TEXTHOOKER_URL;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_TEXTHOOKER_URL;
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return DEFAULT_TEXTHOOKER_URL;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return DEFAULT_TEXTHOOKER_URL;
    if (url.username || url.password) return DEFAULT_TEXTHOOKER_URL;
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return DEFAULT_TEXTHOOKER_URL;
  }
}

/**
 * The text of one websocket message. Texthooker servers disagree on framing:
 * Textractor's extension sends the raw sentence, others send JSON such as
 * `{"sentence": "…"}` or `{"text": "…"}`. Anything else is ignored.
 */
export function parseTexthookerMessage(data: unknown): string {
  const raw = typeof data === 'string'
    ? data
    : data instanceof Uint8Array
      ? new TextDecoder('utf-8').decode(data)
      : '';
  const text = raw.trim();
  if (!text) return '';
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string').join('\n').trim();
      }
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        for (const key of ['sentence', 'text', 'line', 'data']) {
          if (typeof record[key] === 'string') return (record[key] as string).trim();
        }
        return '';
      }
    } catch {
      /* not JSON — a sentence that happens to start with a bracket */
    }
  }
  return text;
}

/**
 * Whether a clipboard/websocket payload looks like a line of the game's text
 * rather than something the user copied for another reason (a path, a URL, a
 * page of prose).
 */
export function isCapturableText(text: string): boolean {
  const value = text.trim();
  if (!value || value.length > 600) return false;
  if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(value)) return false;
  if (/^(?:[a-z]:\\|\\\\|\/|https?:\/\/|file:)/i.test(value)) return false;
  return true;
}
