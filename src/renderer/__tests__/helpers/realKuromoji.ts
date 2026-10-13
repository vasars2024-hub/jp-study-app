/**
 * Build the app's REAL renderer tokenizer (`renderer/tokenizer.ts`, IPADIC from
 * `public/kuromoji/dict`) inside a test, by serving the dictionary files to its
 * `fetch` from disk. A key rule checked against hand-written token fixtures only
 * proves the fixtures; this is the segmentation the reader actually shows.
 *
 * Not a `.test.ts` file, so `vitest.config.ts`'s glob does not collect it.
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const DICT = resolve(__dirname, '..', '..', '..', '..', 'public', 'kuromoji', 'dict');

export async function buildRealKuromoji(): Promise<void> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const name = basename(String(input));
    return new Response(readFileSync(resolve(DICT, name)));
  }) as typeof fetch;
  try {
    const { getTokenizer } = await import('../../tokenizer');
    await getTokenizer();
  } finally {
    globalThis.fetch = realFetch;
  }
}
