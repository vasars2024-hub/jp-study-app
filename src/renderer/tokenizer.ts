// Offline Japanese morphological analysis via kuromoji (IPADIC bundled in
// public/kuromoji/dict). Used to split reader text into words and to reduce
// every inflected form to its lemma (basic form) for knowledge tracking.
//
// We assemble the tokenizer from @sglkc/kuromoji's internals with our own
// dictionary loader because neither stock loader survives every environment:
// the Node loader needs fs, and the browser loader always gunzips — but the
// Vite dev server serves *.gz with `Content-Encoding: gzip`, so fetch() hands
// it ALREADY-decompressed bytes ("invalid gzip data"), while the packaged
// app:// protocol serves the raw gzip. Sniffing the magic bytes handles both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import DictionaryLoader from '@sglkc/kuromoji/src/loader/DictionaryLoader';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import KuromojiTokenizer from '@sglkc/kuromoji/src/Tokenizer';
import { gunzipSync } from 'fflate';

export interface JpToken {
  surface: string;
  lemma: string;
  /** True for vocabulary worth tracking (nouns/verbs/adjectives/adverbs). */
  content: boolean;
  /** True for 名詞,固有名詞 (proper nouns) — filtered out of comprehensibility scoring. */
  proper: boolean;
  /** IPADIC part of speech, e.g. 名詞 / 動詞 / 助詞. */
  pos: string;
  /** IPADIC pos_detail_1 subtype, e.g. 格助詞 / 係助詞 ('*' when absent). */
  posDetail: string;
  /** Katakana reading from IPADIC when present. */
  reading?: string;
}

// The fork ships no types; model just what we use.
interface IpadicFeatures {
  surface_form: string;
  basic_form: string;
  pos: string;
  pos_detail_1: string;
  reading?: string;
}
interface Tokenizer {
  tokenize(text: string): IpadicFeatures[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BaseLoader = DictionaryLoader as any;

/**
 * Inflate a dictionary file without holding the UI thread. The browser's
 * DecompressionStream inflates natively and hands back the bytes
 * asynchronously; `fflate.gunzipSync` did the same work in JavaScript on the
 * UI thread at boot (1.28 s for the IPADIC files, measured). The synchronous
 * path stays as the fallback for a runtime without DecompressionStream.
 */
export async function gunzipOffThread(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function' && typeof Blob === 'function' && typeof Response === 'function') {
    try {
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      /* a platform whose stream refuses: inflate synchronously below */
    }
  }
  return gunzipSync(raw);
}

class SniffingLoader extends BaseLoader {
  loadArrayBuffer(url: string, callback: (err: unknown, buf: ArrayBuffer | null) => void): void {
    // The dict is stored as "*.dat.bin" (gzip BYTES under a non-.gz name):
    // .gz filenames make dev/prod servers add `Content-Encoding: gzip`, and the
    // browser's transparent decompression then truncates the body at the
    // compressed Content-Length → misaligned Int32Array buffers. A neutral
    // extension means we always receive the raw gzip and inflate it ourselves.
    fetch(url.replace(/\.dat\.gz$/, '.dat.bin'))
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
        const raw = new Uint8Array(await res.arrayBuffer());
        const data = raw[0] === 0x1f && raw[1] === 0x8b ? await gunzipOffThread(raw) : raw;
        // Hand over an exact-size ArrayBuffer (a larger backing buffer breaks
        // kuromoji's typed-array views).
        return data.byteLength === data.buffer.byteLength
          ? (data.buffer as ArrayBuffer)
          : (data.slice().buffer as ArrayBuffer);
      })
      // Two-handler then: if the SUCCESS callback throws deeper inside
      // kuromoji's assembly, it must NOT be caught here and re-invoke the
      // callback (async.js forbids double calls and masks the real error).
      .then(
        (buf) => callback(null, buf),
        (e) => callback(e, null),
      );
  }
}

let tok: Tokenizer | null = null;
let loading: Promise<Tokenizer> | null = null;

export function getTokenizer(): Promise<Tokenizer> {
  if (tok) return Promise.resolve(tok);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      // MUST be a root-relative path: kuromoji joins it with Node's path.join,
      // which mangles "http://" (→ the origin gets doubled and every request
      // lands on the SPA fallback page instead of the dictionary).
      const loader = new SniffingLoader('/kuromoji/dict/');
      loader.load((err: unknown, dic: unknown) => {
        if (err || !dic) {
          loading = null;
          console.error('[tokenizer] kuromoji failed to build:', err);
          reject(err ?? new Error('tokenizer failed to build'));
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tok = new (KuromojiTokenizer as any)(dic) as Tokenizer;
        resolve(tok);
      });
    });
  }
  return loading;
}

export function tokenizerReady(): boolean {
  return tok != null;
}

const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞']);
// Noun subtypes that aren't real vocabulary (numbers, suffixes, pronouns…).
const SKIP_SUB = new Set(['数', '非自立', '接尾', '代名詞', '特殊']);

function isContent(t: IpadicFeatures): boolean {
  if (!CONTENT_POS.has(t.pos)) return false;
  if (t.pos === '名詞' && SKIP_SUB.has(t.pos_detail_1)) return false;
  if (t.pos === '動詞' && t.pos_detail_1 === '非自立') return false;
  // Ignore pure kana one-character "words" and anything with no CJK at all.
  if (t.surface_form.length === 1 && /^[ぁ-んァ-ンー]$/.test(t.surface_form)) return false;
  if (!/[぀-ヿ㐀-鿿々]/.test(t.surface_form)) return false;
  return true;
}

/** Tokenize a run of Japanese text (tokenizer must already be built). */
/**
 * Results by text. Subtitle lines are tokenized when they appear (4-53 ms each on the main
 * thread, profiled 2026-09-23) and again by the transcript, the analyser and mining; the
 * same line never tokenizes differently, so it is done once. Bounded, oldest out first.
 */
const TOKENIZE_CACHE_MAX = 4000;
/**
 * The cache is for lines and paragraphs. A whole-chapter or book-sample text is
 * tokenized once and never asked for again, and caching it kept hundreds of
 * thousands of token objects resident (the Library's 40k-character samples held
 * ~120 MB), so long texts are not cached and the total is capped by size too.
 */
export const TOKENIZE_CACHE_MAX_TEXT = 1_000;
/** Estimated bytes the cache may hold (text + token objects). */
export const TOKENIZE_CACHE_MAX_BYTES = 8 * 1024 * 1024;
/** Rough heap cost of one token object with its strings. */
const TOKEN_BYTES = 160;
const tokenizeCache = new Map<string, { tokens: JpToken[]; bytes: number }>();
let tokenizeCacheBytes = 0;

function cacheCost(text: string, tokens: readonly JpToken[]): number {
  return text.length * 2 + tokens.length * TOKEN_BYTES;
}

export function tokenizeSync(text: string): JpToken[] {
  if (!tok) return [];
  const cached = tokenizeCache.get(text);
  if (cached) return cached.tokens;
  const tokens = tokenizeUncached(text);
  if (text.length > TOKENIZE_CACHE_MAX_TEXT) return tokens;
  const bytes = cacheCost(text, tokens);
  while (
    tokenizeCache.size && (tokenizeCache.size >= TOKENIZE_CACHE_MAX || tokenizeCacheBytes + bytes > TOKENIZE_CACHE_MAX_BYTES)
  ) {
    const oldest = tokenizeCache.keys().next().value;
    if (oldest === undefined) break;
    tokenizeCacheBytes -= tokenizeCache.get(oldest)?.bytes ?? 0;
    tokenizeCache.delete(oldest);
  }
  tokenizeCache.set(text, { tokens, bytes });
  tokenizeCacheBytes += bytes;
  return tokens;
}

/** What the tokenize cache holds now. For tests and diagnostics. */
export function tokenizeCacheStats(): { entries: number; bytes: number } {
  return { entries: tokenizeCache.size, bytes: tokenizeCacheBytes };
}

/**
 * Drop every cached tokenization (Blanc's "Trim"). Results are recomputed on
 * demand, so this only trades a little CPU later for up to the cache's byte cap
 * now. Returns the estimated bytes released.
 */
export function clearTokenizeCache(): number {
  const released = tokenizeCacheBytes;
  tokenizeCache.clear();
  tokenizeCacheBytes = 0;
  return released;
}

/**
 * Tokenize `texts` a few at a time in idle periods, so the lines of a subtitle file are ready
 * before they are shown. Returns a cancel function. A no-op until the tokenizer is loaded.
 */
export function pretokenizeInIdle(texts: readonly string[]): () => void {
  let cancelled = false;
  let index = 0;
  const idle = (cb: () => void): void => {
    const ric = (window as unknown as {
      requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof ric === 'function') ric(cb, { timeout: 2000 });
    else window.setTimeout(cb, 50);
  };
  const step = (): void => {
    if (cancelled || !tok) return;
    const until = performance.now() + 8;
    while (index < texts.length && performance.now() < until) {
      tokenizeSync(texts[index]);
      index += 1;
    }
    if (index < texts.length) idle(step);
  };
  void getTokenizer().then(() => idle(step)).catch(() => undefined);
  return () => {
    cancelled = true;
  };
}

function tokenizeUncached(text: string): JpToken[] {
  if (!tok) return [];
  return tok.tokenize(text).map((t) => ({
    surface: t.surface_form,
    lemma: t.basic_form && t.basic_form !== '*' ? t.basic_form : t.surface_form,
    content: isContent(t),
    proper: t.pos === '名詞' && t.pos_detail_1 === '固有名詞',
    pos: t.pos,
    posDetail: t.pos_detail_1,
    reading: t.reading && t.reading !== '*' ? t.reading : undefined,
  }));
}

/** Lemma (dictionary form) of a single word/phrase — first content token wins. */
export async function lemmaOf(word: string): Promise<string> {
  const w = word.trim();
  if (!w) return w;
  try {
    await getTokenizer();
  } catch {
    return w;
  }
  const toks = tokenizeSync(w);
  const first = toks.find((t) => t.content) ?? toks[0];
  return first?.lemma ?? w;
}
