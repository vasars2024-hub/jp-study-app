/**
 * Words of study-language text, for the surfaces that count and colour them —
 * comprehensibility scores and the reader's known-word highlight. Japanese is
 * kuromoji (`tokenizer.ts`); Chinese and Russian are ICU words
 * (`shared/studySegmentation`). Each token carries the key the knowledge store
 * knows it by, and that key comes from the one rule every writer uses
 * (`shared/knowledgeKey`): the Anki sync, SRS reviews and the known-words
 * import file a word under exactly the key the reader looks it up by.
 */
import { getTokenizer, tokenizeSync, tokenizerReady, type JpToken } from './tokenizer';
import { getLevel, isManualLevel, listKnowledgeEntries, onKnowledgeChanged } from './knownWords';
import { getStudyLang } from './studyEnvironment';
import type { StudyLang } from '../shared/studyLang';
import { isVocabularySegment, segmentStudyText } from '../shared/studySegmentation';
import { hasKanji, toHiragana } from '../shared/furigana';
import {
  isKanaOnly,
  japaneseTokenKey,
  knowledgeKeyFor,
  knowledgeKeysFor,
  resolveKnowledgeAlias,
  russianKnowledgeKey,
  segmentKnowledgeKey,
  type KnowledgeKeyDeps,
} from '../shared/knowledgeKey';

/**
 * What `shared/knowledgeKey` needs from the renderer: kuromoji once it is built
 * (before that, Japanese words keep their spelling) and the store's levels.
 */
export function knowledgeKeyDeps(levelOf: (key: string) => number = getLevel): KnowledgeKeyDeps {
  let ready = false;
  try {
    ready = tokenizerReady();
  } catch {
    ready = false;
  }
  return { tokenizeJapanese: ready ? tokenizeSync : null, levelOf };
}

/** Every key evidence about `word` speaks for (a noun compound names each part). */
export function wordKnowledgeKeys(word: string, lang: StudyLang = getStudyLang()): string[] {
  return knowledgeKeysFor(word, lang, knowledgeKeyDeps());
}

/** The one key a word is shown, graded and looked up under. */
export function wordKnowledgeKey(word: string, lang: StudyLang = getStudyLang()): string {
  return knowledgeKeyFor(word, lang, knowledgeKeyDeps());
}

/**
 * The knowledge-store key for a word. Russian: whichever of its likely
 * dictionary forms the learner already graded (книги → книга once книга is
 * known), else the stem all its forms share — so a word marked known is
 * recognised in every case it appears in. Chinese: the word (NFKC).
 * Japanese: the shared rule (dictionary form, する dropped).
 */
export function knownKeyFor(word: string, lang: StudyLang, levelOf: (key: string) => number = getLevel): string {
  if (lang === 'ru') return russianKnowledgeKey(word, levelOf);
  return knowledgeKeyFor(word, lang, knowledgeKeyDeps(levelOf));
}

/**
 * The key a grade is stored under: the form the learner already graded when
 * there is one, else — for Russian — the stem every form of the word shares, so
 * grading `книги` also colours `книгу` and `книгой`.
 */
export function gradeKeyFor(word: string, lang: StudyLang, levelOf: (key: string) => number = getLevel): string {
  return knownKeyFor(word, lang, levelOf);
}

// ----- spelling variants (ネコ / ねこ / 猫) ------------------------------------

/**
 * Hiragana reading → the kanji keys in the store that IPADIC reads that way,
 * for the kana → kanji direction of the alias lookup. Built from the store in
 * idle time (a 40,000-word store is ~0.5 s of kuromoji), kept current word by
 * word, and simply not consulted until it is ready.
 */
let readingIndex: Map<string, Set<string>> | null = null;
let readingIndexState: 'idle' | 'building' | 'ready' | 'off' = 'idle';
let readingIndexGeneration = 0;
let readingIndexWatching = false;
const READING_INDEX_INCREMENTAL_MAX = 200;
/** Words graded while a build is under way, indexed when it lands. */
const wordsDuringBuild = new Set<string>();

type RawTokenizer = Awaited<ReturnType<typeof getTokenizer>>;

function indexKey(raw: RawTokenizer, index: Map<string, Set<string>>, key: string): void {
  if (!hasKanji(key)) return;
  let tokens: ReturnType<RawTokenizer['tokenize']>;
  try {
    tokens = raw.tokenize(key);
  } catch {
    return;
  }
  // Only a word that IS one dictionary entry has a reading of its own.
  if (tokens.length !== 1 || tokens[0].surface_form !== key) return;
  const reading = tokens[0].reading;
  if (!reading || reading === '*') return;
  const hira = toHiragana(reading);
  const keys = index.get(hira) ?? new Set<string>();
  keys.add(key);
  index.set(hira, keys);
}

function idle(step: () => void): void {
  const host = globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof host.requestIdleCallback === 'function') host.requestIdleCallback(step, { timeout: 2000 });
  else setTimeout(step, 30);
}

function rebuildReadingIndex(): void {
  readingIndexGeneration += 1;
  const generation = readingIndexGeneration;
  readingIndexState = 'building';
  wordsDuringBuild.clear();
  let built: ReturnType<typeof getTokenizer>;
  try {
    built = getTokenizer();
  } catch {
    readingIndexState = 'off';
    return;
  }
  void built.then((raw) => {
    const keys = listKnowledgeEntries().map((entry) => entry.word);
    const next = new Map<string, Set<string>>();
    let at = 0;
    const step = (): void => {
      if (generation !== readingIndexGeneration) return;
      const until = performance.now() + 8;
      while (at < keys.length && performance.now() < until) indexKey(raw, next, keys[at++]);
      if (at < keys.length) {
        idle(step);
        return;
      }
      for (const word of wordsDuringBuild) indexKey(raw, next, word);
      wordsDuringBuild.clear();
      readingIndex = next;
      readingIndexState = 'ready';
    };
    idle(step);
  }, () => {
    if (generation === readingIndexGeneration) readingIndexState = 'off';
  });
}

function watchKnowledgeForIndex(): void {
  if (readingIndexWatching || typeof window === 'undefined') return;
  readingIndexWatching = true;
  onKnowledgeChanged((words) => {
    if (readingIndexState === 'idle' || readingIndexState === 'off') return;
    if (!words.length || words.length > READING_INDEX_INCREMENTAL_MAX) {
      rebuildReadingIndex();
      return;
    }
    if (readingIndexState === 'building' || !readingIndex) {
      for (const word of words) wordsDuringBuild.add(word);
      return;
    }
    const index = readingIndex;
    void getTokenizer().then((raw) => {
      for (const word of words) indexKey(raw, index, word);
    }, () => undefined);
  });
}

/** Known kanji keys IPADIC reads as `hiragana`; empty until the index is built. */
export function knownKeysForReading(hiragana: string): string[] {
  if (getStudyLang() !== 'ja') return [];
  if (readingIndexState === 'idle') {
    watchKnowledgeForIndex();
    rebuildReadingIndex();
    return [];
  }
  const keys = readingIndex?.get(hiragana);
  if (!keys) return [];
  return [...keys].filter((key) => getLevel(key) > 0 || isManualLevel(key));
}

/** Test seam: forget the reading index. */
export function resetReadingIndexForTests(): void {
  readingIndexGeneration += 1;
  readingIndex = null;
  readingIndexState = 'idle';
}

function storeHas(key: string): boolean {
  return getLevel(key) > 0 || isManualLevel(key);
}

/**
 * The key a Japanese reader token is coloured by: its dictionary form, or —
 * when the learner never graded that spelling — the other spelling they did
 * grade (ネコ ↔ ねこ, 猫 → its reading ねこ, ねこ → the one known kanji read ねこ).
 */
export function readerKeyForToken(token: Pick<JpToken, 'surface' | 'lemma' | 'reading'>): string {
  const key = japaneseTokenKey(token);
  if (!key) return key;
  // A reading is the lemma's own only when the token is not inflected.
  const reading = token.surface === token.lemma ? token.reading : undefined;
  return resolveKnowledgeAlias(key, storeHas, {
    reading,
    keysForReading: isKanaOnly(key) ? knownKeysForReading : undefined,
  });
}

function japaneseStudyTokens(text: string): JpToken[] {
  const tokens = tokenizeSync(text);
  // The tokenize cache hands back shared arrays: copy only when a key differs.
  let out: JpToken[] | null = null;
  tokens.forEach((token, index) => {
    if (!token.content) return;
    const key = readerKeyForToken(token);
    if (key === token.lemma) return;
    out ??= tokens.slice();
    out[index] = { ...token, lemma: key };
  });
  return out ?? tokens;
}

/** Tokens of `text` in `lang`, JpToken-shaped so existing scorers read them unchanged. */
export function studyTokens(text: string, lang: StudyLang = getStudyLang()): JpToken[] {
  if (lang === 'ja') return japaneseStudyTokens(text);
  return segmentStudyText(text, lang).map((part) => {
    const content = part.wordLike && isVocabularySegment(part.text, lang);
    return {
      surface: part.text,
      lemma: content ? segmentKnowledgeKey(part.text, lang, getLevel) || part.text : part.text,
      content,
      proper: false,
      pos: '',
      posDetail: '',
    };
  });
}

/** Whether `studyTokens` can run now: Japanese needs kuromoji built; the others need nothing. */
export function studyTokensReady(lang: StudyLang = getStudyLang()): boolean {
  return lang !== 'ja' || tokenizerReady();
}

/** The study language's text in a string: kana/kanji, hanzi, or Cyrillic. */
export function hasStudyText(text: string, lang: StudyLang = getStudyLang()): boolean {
  if (lang === 'ru') return /\p{Script=Cyrillic}/u.test(text);
  if (lang === 'zh') return /\p{Script=Han}/u.test(text);
  return /[぀-ヿ㐀-鿿々]/.test(text);
}
