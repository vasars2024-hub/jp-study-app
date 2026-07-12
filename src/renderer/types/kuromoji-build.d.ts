// @sglkc/kuromoji ships no TypeScript types; we import two of its CJS
// internals directly and model what we use locally in tokenizer.ts.
declare module '@sglkc/kuromoji/src/loader/DictionaryLoader';
declare module '@sglkc/kuromoji/src/Tokenizer';
declare module '@sglkc/kuromoji/build/kuromoji.js';
