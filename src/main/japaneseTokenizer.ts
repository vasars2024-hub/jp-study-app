import path from 'node:path';
import { createRequire } from 'node:module';

export interface MainKuromojiToken {
  surface_form: string;
  basic_form: string;
  reading?: string;
  pos: string;
  pos_detail_1: string;
  pos_detail_2: string;
}

export interface MainJapaneseTokenizer {
  tokenize(text: string): MainKuromojiToken[];
}

let tokenizerPromise: Promise<MainJapaneseTokenizer | null> | null = null;
const localRequire = createRequire(__filename);

/**
 * Shared main-process tokenizer used by mining and Study analysis. Loading the
 * dictionary is expensive, so every consumer awaits the same cached promise.
 */
export async function getMainJapaneseTokenizer(): Promise<MainJapaneseTokenizer | null> {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      try {
        const mod = await import('kuromoji');
        const dictPath = path.join(path.dirname(localRequire.resolve('kuromoji')), '..', 'dict');
        return await new Promise<MainJapaneseTokenizer>((resolve, reject) => {
          mod.builder({ dicPath: dictPath }).build((error: Error | null, tokenizer: unknown) => {
            if (error || !tokenizer) {
              reject(error ?? new Error('Could not build the Japanese tokenizer.'));
              return;
            }
            resolve(tokenizer as MainJapaneseTokenizer);
          });
        });
      } catch (error) {
        console.error('[japanese-tokenizer] kuromoji unavailable:', error);
        return null;
      }
    })();
  }
  return tokenizerPromise;
}

