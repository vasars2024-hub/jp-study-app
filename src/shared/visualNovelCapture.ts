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
 *   - ocr        — for games no hook reaches: the Reading Lens watches the
 *                  game's text box and reads each new line off the screen.
 *
 * Nothing here bundles or launches a hooker. Textractor is GPL and is never
 * shipped; the user installs whatever tool they prefer.
 */

export type VisualNovelCaptureSource = 'clipboard' | 'websocket' | 'hook' | 'ocr';
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
  /** Consecutive failed websocket connections since the last stable one (absent before any). */
  reconnectAttempt?: number;
  /** When the next websocket attempt is due (epoch ms), or null when none is scheduled. */
  nextRetryAt?: number | null;
  /** Lines the cleanup rules or duplicate filter threw away this session. */
  filtered?: number;
  /** What `lastError` means, for the UI to say it in the user's language. */
  lastErrorCode?: VisualNovelErrorCode | '';
  /**
   * Reading the text box off the screen (games without a text hook):
   * `pending` until the Lens has a region to watch, `lens-off` when the
   * Reading Lens is switched off. Absent or `off` when not asked for.
   */
  ocr?: 'off' | 'pending' | 'watching' | 'lens-off';
  /** The per-line voice clips' replay buffer: `error` when system audio could not be captured. */
  audio?: 'off' | 'on' | 'error';
  /** A picture is attached to every captured line. */
  screenshots?: boolean;
}

// ---- error codes -------------------------------------------------------------
//
// Main's own error text is English (and sometimes a path). Every visual-novel IPC
// failure therefore also carries a code from this list, and the renderer shows
// `vnError.<code>` instead of the raw message. `unknown` falls back to the
// action's own translated "could not …" sentence.

export const VISUAL_NOVEL_ERROR_CODES = [
  'not-found',
  'line-not-found',
  'title-required',
  'text-required',
  'duplicate',
  'not-a-file',
  'file-missing',
  'file-access',
  'too-large',
  'unsupported-format',
  'invalid-file',
  'capture-running',
  'websocket-unavailable',
  'unknown',
] as const;

export type VisualNovelErrorCode = typeof VISUAL_NOVEL_ERROR_CODES[number];

/** An error main raises on purpose, with its code attached. */
export class VisualNovelError extends Error {
  readonly vnCode: VisualNovelErrorCode;

  constructor(code: VisualNovelErrorCode, message: string) {
    super(message);
    this.name = 'VisualNovelError';
    this.vnCode = code;
  }
}

export function isVisualNovelErrorCode(value: unknown): value is VisualNovelErrorCode {
  return typeof value === 'string' && (VISUAL_NOVEL_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * The code for any error a visual-novel handler can meet: its own
 * `VisualNovelError`, a Node file-system errno, a JSON parse failure, or one of
 * the validation errors `shared/visualNovel.ts` throws by message.
 */
export function visualNovelErrorCode(error: unknown): VisualNovelErrorCode {
  if (error instanceof VisualNovelError) return error.vnCode;
  const record = error && typeof error === 'object' ? error as { vnCode?: unknown; code?: unknown; message?: unknown } : null;
  if (record && isVisualNovelErrorCode(record.vnCode)) return record.vnCode;
  const errno = typeof record?.code === 'string' ? record.code : '';
  if (errno === 'ENOENT' || errno === 'ENOTDIR') return 'file-missing';
  if (['EACCES', 'EPERM', 'EBUSY', 'EISDIR', 'EROFS', 'ENOSPC', 'EMFILE'].includes(errno)) return 'file-access';
  if (error instanceof SyntaxError) return 'invalid-file';
  const message = typeof record?.message === 'string' ? record.message : typeof error === 'string' ? error : '';
  if (/^The visual novel does not exist\./.test(message)) return 'not-found';
  if (/^The captured (?:line|sentence) does not exist\./.test(message)) return 'line-not-found';
  if (/title is required/i.test(message)) return 'title-required';
  if (/capture text is required/i.test(message)) return 'text-required';
  return 'unknown';
}

/** The catalog key for each code; `unknown` uses the action's own fallback sentence. */
export const VISUAL_NOVEL_ERROR_KEYS: Record<Exclude<VisualNovelErrorCode, 'unknown'>, string> = {
  'not-found': 'vnError.notFound',
  'line-not-found': 'vnError.lineNotFound',
  'title-required': 'vnError.titleRequired',
  'text-required': 'vnError.textRequired',
  duplicate: 'vnError.duplicate',
  'not-a-file': 'vnError.notAFile',
  'file-missing': 'vnError.fileMissing',
  'file-access': 'vnError.fileAccess',
  'too-large': 'vnError.tooLarge',
  'unsupported-format': 'vnError.unsupportedFormat',
  'invalid-file': 'vnError.invalidFile',
  'capture-running': 'vnError.captureRunning',
  'websocket-unavailable': 'vnError.websocketUnavailable',
};

/**
 * The catalog key for a failed visual-novel response (or a bare code): the
 * code's own sentence when main sent one it knows, else the action's fallback.
 * Reads `errorCode` (IPC responses) or `lastErrorCode` (capture / hook state)
 * off any shape, so callers need no per-channel typing. Main's English `error`
 * text is never the message.
 */
export function visualNovelErrorKey(response: unknown, fallbackKey: string): string {
  const code = response && typeof response === 'object'
    ? (response as { errorCode?: unknown }).errorCode ?? (response as { lastErrorCode?: unknown }).lastErrorCode
    : response;
  return isVisualNovelErrorCode(code) && code !== 'unknown' ? VISUAL_NOVEL_ERROR_KEYS[code] : fallbackKey;
}

// ---- hook files ----------------------------------------------------------------

export type HookFileEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'shift_jis';

/** Bytes of the file's start used to recognise its encoding. */
export const HOOK_ENCODING_SAMPLE_BYTES = 64 * 1024;

function decodesCleanly(encoding: string, bytes: Uint8Array): boolean {
  try {
    // `stream: true` so a character cut off by the end of the sample is not an error.
    new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the bytes read as Japanese UTF-16 in one byte order: nearly every unit
 * is ASCII, CJK punctuation, kana, kanji or a full-width form, AND a real share
 * of them are kana/punctuation (U+3000–U+30FF). The kana share is what tells it
 * from Shift-JIS, whose lead bytes 0x81–0x9F also land in the kanji block when
 * paired up, but which almost never yields a 0x30 byte beside another.
 */
function looksLikeJapaneseUtf16(bytes: Uint8Array, littleEndian: boolean): boolean {
  const units = Math.floor(bytes.length / 2);
  if (units < 2) return false;
  let plausible = 0;
  let kana = 0;
  for (let index = 0; index < units * 2; index += 2) {
    const unit = littleEndian
      ? bytes[index] | (bytes[index + 1] << 8)
      : (bytes[index] << 8) | bytes[index + 1];
    if (unit >= 0x3000 && unit <= 0x30ff) {
      kana += 1;
      plausible += 1;
    } else if (
      (unit >= 0x09 && unit <= 0x7e)
      || (unit >= 0x4e00 && unit <= 0x9fff)
      || (unit >= 0xff00 && unit <= 0xffef)
      || (unit >= 0x2000 && unit <= 0x206f)
    ) {
      plausible += 1;
    }
  }
  return plausible / units >= 0.85 && kana / units >= 0.15;
}

/**
 * The encoding of a text-hook output file, from bytes at its START (where a BOM
 * would be). Null when the bytes cannot tell yet — empty, or plain ASCII, which
 * every candidate reads the same way — so the caller decides again on the first
 * bytes that can.
 *
 * Hookers write UTF-8, UTF-16 (Textractor's native strings, usually with a BOM)
 * or Shift-JIS. The relay reads from where the file ENDED when it started, so
 * the BOM is never in the bytes it decodes: the encoding has to be decided here,
 * once, and remembered.
 */
export function detectHookFileEncoding(head: Uint8Array): HookFileEncoding | null {
  if (head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return 'utf-8';
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xfe) return 'utf-16le';
  if (head.length >= 2 && head[0] === 0xfe && head[1] === 0xff) return 'utf-16be';
  const sample = head.subarray(0, HOOK_ENCODING_SAMPLE_BYTES);
  if (!sample.length) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  let high = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) {
      if (index % 2 === 0) evenZeros += 1;
      else oddZeros += 1;
    } else if (sample[index] >= 0x80) {
      high += 1;
    }
  }
  const pairs = Math.max(1, Math.floor(sample.length / 2));
  // ASCII in UTF-16 is half zero bytes, on one side.
  if (oddZeros >= pairs / 4 && evenZeros <= oddZeros / 8) return 'utf-16le';
  if (evenZeros >= pairs / 4 && oddZeros <= evenZeros / 8) return 'utf-16be';
  if (!high && !evenZeros && !oddZeros) {
    // Plain ASCII — unless it is BOM-less UTF-16 kana (はい。 is 6F 30 44 30 02 30).
    if (looksLikeJapaneseUtf16(sample, true)) return 'utf-16le';
    if (looksLikeJapaneseUtf16(sample, false)) return 'utf-16be';
    return null;
  }
  if (decodesCleanly('utf-8', sample)) return 'utf-8';
  // Japanese-only UTF-16 without a BOM has no zero bytes at all; recognise it by its code units.
  if (looksLikeJapaneseUtf16(sample, true)) return 'utf-16le';
  if (looksLikeJapaneseUtf16(sample, false)) return 'utf-16be';
  if (decodesCleanly('shift_jis', sample)) return 'shift_jis';
  return 'utf-8';
}

/**
 * Where to start following a file that is `size` bytes long now, so the first
 * read begins on a character boundary even if the hooker was mid-write:
 * an even offset for UTF-16, and before an unfinished UTF-8 sequence. `tail` is
 * the (up to 3) bytes just before `size`.
 */
export function hookFileStartOffset(size: number, encoding: HookFileEncoding | null, tail: Uint8Array): number {
  if (encoding === 'utf-16le' || encoding === 'utf-16be') return size - (size % 2);
  if (encoding !== 'utf-8' && encoding !== null) return size;
  // Walk back over continuation bytes to the lead byte of the last sequence.
  for (let back = 1; back <= Math.min(3, tail.length); back += 1) {
    const byte = tail[tail.length - back];
    if ((byte & 0xc0) === 0x80) continue;
    const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return needed > back ? size - back : size;
  }
  return size;
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
  // A binary frame arrives as an ArrayBuffer (`binaryType = 'arraybuffer'`), a
  // Buffer/typed array, or — read by the session first — a Blob's bytes.
  const raw = typeof data === 'string'
    ? data
    : data instanceof ArrayBuffer
      ? new TextDecoder('utf-8').decode(new Uint8Array(data))
      : ArrayBuffer.isView(data)
        ? new TextDecoder('utf-8').decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
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

/** A Blob (Node's and the browser's), whose bytes have to be awaited. */
export function isBlobLike(data: unknown): data is { arrayBuffer(): Promise<ArrayBuffer> } {
  return !!data
    && typeof data === 'object'
    && !(data instanceof ArrayBuffer)
    && !ArrayBuffer.isView(data)
    && typeof (data as { arrayBuffer?: unknown }).arrayBuffer === 'function';
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
