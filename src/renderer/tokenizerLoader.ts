// The kuromoji half of `tokenizer.ts`: the library code and the IPADIC loader.
//
// Split out so Blanc's boot bundle does not carry kuromoji (+ async.js +
// doublearray, ~70 KB built) just because flashcardDeck / knownWords /
// studyTokens ask `tokenizerReady()` and call `tokenizeSync()`. Those stay
// synchronous in `tokenizer.ts`; only `getTokenizer()` reaches this module,
// through a dynamic import, the first time the dictionary is actually wanted.
//
// We assemble the tokenizer from @sglkc/kuromoji's internals with our own
// dictionary loader because neither stock loader survives every environment:
// the Node loader needs fs, and the browser loader always gunzips — but the
// Vite dev server serves *.gz with `Content-Encoding: gzip`, so fetch() hands
// it ALREADY-decompressed bytes ("invalid gzip data"), while the packaged
// app:// protocol serves the raw gzip. Sniffing the magic bytes handles both.
import DictionaryLoader from '@sglkc/kuromoji/src/loader/DictionaryLoader';
import KuromojiTokenizer from '@sglkc/kuromoji/src/Tokenizer';
import { gunzipSync } from 'fflate';
import type { KuromojiTokenizerLike } from './tokenizer';

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

/** Fetch + inflate the IPADIC dictionary and assemble a kuromoji tokenizer. */
export function buildKuromojiTokenizer(): Promise<KuromojiTokenizerLike> {
  return new Promise((resolve, reject) => {
    // MUST be a root-relative path: kuromoji joins it with Node's path.join,
    // which mangles "http://" (→ the origin gets doubled and every request
    // lands on the SPA fallback page instead of the dictionary).
    const Loader = SniffingLoader as unknown as new (dicPath: string) => {
      load(callback: (err: unknown, dic: unknown) => void): void;
    };
    const loader = new Loader('/kuromoji/dict/');
    loader.load((err: unknown, dic: unknown) => {
      if (err || !dic) {
        reject(err ?? new Error('tokenizer failed to build'));
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve(new (KuromojiTokenizer as any)(dic) as KuromojiTokenizerLike);
    });
  });
}
