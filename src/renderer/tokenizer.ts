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
        const data = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
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
export function tokenizeSync(text: string): JpToken[] {
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
