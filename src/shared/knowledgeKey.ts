// The one rule for the key a word's knowledge is stored under.
//
// Four writers used to derive it four ways — the Anki sync (first content token
// of kuromoji, whatever the study language), the built-in SRS (whole word unless
// it was exactly one content token), the known-words import (one content token
// AND at most two tokens) and the reader (one kuromoji token = one key). So 勉強する
// reviewed in Gum landed under 勉強する while the reader looked up 勉強, 気をつける
// from Anki marked 気 as known, and Chinese 学习 synced as 学. Every writer now
// asks this module, and the reader's key for a token comes from the same place.
//
// Pure: no DOM, no Electron. The Japanese tokenizer and the store's level lookup
// are passed in, so main, renderer and tests share one implementation.
//
// THE RULE
//
// Every language: NFKC first (half-width katakana, full-width Latin and CJK
// compatibility forms meet their ordinary spelling), then trimmed.
//
// Japanese (kuromoji/IPADIC, the reader's own segmenter):
//  1. A trailing する after a noun is dropped: 勉強する / 勉強します / 勉強をする → 勉強,
//     コピーする → コピー. The reader splits 勉強する into 勉強 + する and colours 勉強.
//     A lexical する-verb that IPADIC keeps whole (愛する) stays whole.
//  2. ONE content word plus inflection (食べた, 静かな, 見ている, お茶) → its
//     dictionary form, exactly the reader's key for that token. Only a prefix
//     (接頭詞) may come before it.
//  3. A NOUN COMPOUND the reader shows as several words (携帯電話 → 携帯 + 電話,
//     大学生活 → 大学 + 生活): every content part. Knowing the compound is evidence
//     for each part, and the parts are what the reader can colour. Only when the
//     word has kanji in it: an all-kana word that IPADIC does not know is cut
//     into nonsense (ケイタイ → ケイ + タイ) and stays whole.
//  4. Anything else is a SET PHRASE (気をつける, お腹が空く, かもしれない, 一石二鳥):
//     kept whole, as written. Its parts are not evidence (knowing 気をつける says
//     nothing about 気), so it never lights up a part in the reader.
//  5. No tokenizer yet: the word as written, with rule 1 applied by spelling
//     (two or more kanji, or katakana, followed by する).
//
// Chinese: ICU's word segmenter (`studySegmentation`), the reader's segmenter.
// One word → that word; a phrase the reader splits → its words.
//
// Russian: ICU words, each keyed by the dictionary form the learner already
// graded (книги → книга once книга is known), else the stem every form shares.
//
// SPELLING VARIANTS (Japanese, lookup only, never a write)
//
// `japaneseAliasKeys` names the other spellings a reader token may be known
// under: katakana ↔ hiragana for an all-kana word (ネコ ↔ ねこ), and for a kanji
// word the kana of its OWN dictionary reading (猫, read ネコ by IPADIC → ねこ / ネコ).
// The reverse (ねこ → 猫) is only offered when exactly one known kanji word has
// that reading. Conservative on purpose: homophones (橋/箸/端) are why it never
// guesses beyond a dictionary reading.

import type { StudyLang } from './studyLang';
import { russianLemmaCandidates, stripRussianStress } from './russianMorphology';
import { isVocabularySegment, segmentStudyText, studyWordKey } from './studySegmentation';
import { hasKanji, toHiragana } from './furigana';

/** The fields of a kuromoji token this rule reads (renderer `JpToken` fits). */
export interface KnowledgeKeyToken {
  surface: string;
  lemma: string;
  content: boolean;
  /** IPADIC part of speech (名詞 / 動詞 / 助詞 …). Empty when unknown. */
  pos?: string;
  /** IPADIC pos_detail_1 (サ変接続 / 接尾 …). */
  posDetail?: string;
  /** Katakana reading of the surface, when IPADIC has one. */
  reading?: string;
}

export interface KnowledgeKeyDeps {
  /** The Japanese tokenizer, when it is built. Absent → rule 5. */
  tokenizeJapanese?: ((text: string) => readonly KnowledgeKeyToken[]) | null;
  /** The store's level for a key (Russian picks the form already graded). */
  levelOf?: (key: string) => number;
}

/** NFKC + trim: the spelling every key starts from. */
export function normalizeKnowledgeText(text: string): string {
  return (text ?? '').normalize('NFKC').trim();
}

const KANA_ONLY = /^[ぁ-ゖァ-ヺー゛゜ゝゞヽヾ]+$/u;
const SURU_BY_SPELLING = /^((?:[㐀-鿿々]{2,})|(?:[ァ-ヺー]{2,}))する$/u;

/** The reader key of one kuromoji token: its dictionary form, NFKC. */
export function japaneseTokenKey(token: Pick<KnowledgeKeyToken, 'surface' | 'lemma'>): string {
  const lemma = token.lemma && token.lemma !== '*' ? token.lemma : token.surface;
  return normalizeKnowledgeText(lemma);
}

function isSuru(token: KnowledgeKeyToken): boolean {
  return token.lemma === 'する' && (!token.pos || token.pos === '動詞');
}

function isNoun(token: KnowledgeKeyToken): boolean {
  return token.pos === '名詞';
}

/** Rule 1 on tokens: drop a trailing する (and an object を before it) after a noun. */
function withoutTrailingSuru(tokens: readonly KnowledgeKeyToken[]): readonly KnowledgeKeyToken[] {
  const at = tokens.findIndex(isSuru);
  if (at <= 0) return tokens;
  // Only inflection may follow the する (します, した, している).
  if (tokens.slice(at + 1).some((token) => token.content)) return tokens;
  let stem = at;
  if (tokens[stem - 1].surface === 'を' && stem >= 2) stem -= 1;
  if (!isNoun(tokens[stem - 1])) return tokens;
  return tokens.slice(0, stem);
}

function japaneseKeys(word: string, tokenize: KnowledgeKeyDeps['tokenizeJapanese']): string[] {
  const text = normalizeKnowledgeText(word);
  if (!text) return [];
  const bySpelling = (): string[] => [text.replace(SURU_BY_SPELLING, '$1')];
  if (!tokenize) return bySpelling();
  let all: readonly KnowledgeKeyToken[];
  try {
    all = tokenize(text).filter((token) => token.surface.trim());
  } catch {
    return bySpelling();
  }
  if (!all.length) return [text];
  const tokens = withoutTrailingSuru(all);
  const contentAt = tokens.flatMap((token, index) => (token.content ? [index] : []));
  if (contentAt.length === 0) return [tokens.length === 1 ? japaneseTokenKey(tokens[0]) : text];
  if (contentAt.length === 1) {
    const at = contentAt[0];
    // Rule 2: only a prefix before the one content word; anything after it is inflection.
    if (tokens.slice(0, at).every((token) => token.pos === '接頭詞')) return [japaneseTokenKey(tokens[at])];
    return [text];
  }
  // Rule 3: a kanji noun compound the reader shows as separate words.
  if (hasKanji(text) && tokens.every((token) => isNoun(token) || token.pos === '接頭詞')) {
    return [...new Set(contentAt.map((index) => japaneseTokenKey(tokens[index])))];
  }
  // Rule 4: a set phrase, whole.
  return [text];
}

/** Russian: the graded dictionary form when there is one, else the shared stem. */
export function russianKnowledgeKey(word: string, levelOf: (key: string) => number = () => 0): string {
  const plain = stripRussianStress(word.normalize('NFKC').trim().toLowerCase());
  if (!plain) return '';
  let best = plain;
  let bestLevel = levelOf(plain);
  for (const candidate of russianLemmaCandidates(plain)) {
    const level = levelOf(candidate);
    if (level > bestLevel) {
      best = candidate;
      bestLevel = level;
    }
  }
  if (bestLevel > 0) return best;
  return studyWordKey(plain, 'ru');
}

/** The reader key of one ICU segment in Chinese or Russian. */
export function segmentKnowledgeKey(text: string, lang: StudyLang, levelOf?: (key: string) => number): string {
  if (lang === 'ru') return russianKnowledgeKey(text, levelOf);
  return normalizeKnowledgeText(text);
}

function segmentedKeys(word: string, lang: StudyLang, levelOf?: (key: string) => number): string[] {
  const text = normalizeKnowledgeText(word);
  if (!text) return [];
  const words = segmentStudyText(text, lang)
    .filter((part) => part.wordLike && isVocabularySegment(part.text, lang))
    .map((part) => segmentKnowledgeKey(part.text, lang, levelOf))
    .filter(Boolean);
  if (!words.length) return [lang === 'ru' ? russianKnowledgeKey(text, levelOf) || text : text];
  return [...new Set(words)];
}

/**
 * Every key evidence about `word` speaks for, in the study language `lang`:
 * usually one, several for a compound the reader shows as separate words, none
 * for an empty string. See the rule at the top of this file.
 */
export function knowledgeKeysFor(word: string, lang: StudyLang, deps: KnowledgeKeyDeps = {}): string[] {
  if (lang === 'ja') return japaneseKeys(word, deps.tokenizeJapanese);
  return segmentedKeys(word, lang, deps.levelOf);
}

/**
 * One key for a word that is graded or looked up as a unit (a dictionary
 * headword, a card): its key when the rule gives exactly one, else the word as
 * written (NFKC) — a compound graded by hand is not silently filed under its
 * first part.
 */
export function knowledgeKeyFor(word: string, lang: StudyLang, deps: KnowledgeKeyDeps = {}): string {
  const keys = knowledgeKeysFor(word, lang, deps);
  return keys.length === 1 ? keys[0] : normalizeKnowledgeText(word);
}

// ----- spelling variants -----------------------------------------------------

/** ひらがな → カタカナ. */
export function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

export function isKanaOnly(text: string): boolean {
  return KANA_ONLY.test(text);
}

export interface JapaneseAliasOptions {
  /** IPADIC reading of the key itself (katakana), when the token is its own dictionary form. */
  reading?: string;
  /** Known kanji keys whose dictionary reading is this hiragana (for kana → kanji). */
  keysForReading?: (hiragana: string) => readonly string[];
}

/**
 * Other spellings `key` may be known under, best first, never `key` itself.
 * All-kana: the other kana script, then the one kanji word with that reading.
 * Kanji: the kana of the word's own dictionary reading.
 */
export function japaneseAliasKeys(key: string, options: JapaneseAliasOptions = {}): string[] {
  const out: string[] = [];
  const add = (candidate: string): void => {
    if (candidate && candidate !== key && !out.includes(candidate)) out.push(candidate);
  };
  if (isKanaOnly(key)) {
    // One kana is a particle or a fragment far more often than a word.
    if (key.length < 2) return out;
    add(toHiragana(key));
    add(toKatakana(key));
    const kanji = options.keysForReading?.(toHiragana(key)) ?? [];
    if (kanji.length === 1) add(kanji[0]);
    return out;
  }
  const reading = options.reading ? normalizeKnowledgeText(options.reading) : '';
  if (hasKanji(key) && reading.length >= 2 && isKanaOnly(reading)) {
    add(toHiragana(reading));
    add(toKatakana(reading));
  }
  return out;
}

/**
 * The key a reader token should be coloured by: `key` when the store has it,
 * else the first alias the learner has graded, else `key`.
 */
export function resolveKnowledgeAlias(
  key: string,
  has: (key: string) => boolean,
  options: JapaneseAliasOptions = {},
): string {
  if (!key || has(key)) return key;
  for (const alias of japaneseAliasKeys(key, options)) if (has(alias)) return alias;
  return key;
}

// ----- re-keying a stored map ------------------------------------------------

export interface KnowledgeStoreEntry {
  l: 0 | 1 | 2 | 3;
  m?: 1;
}

/**
 * Two entries that now share one key: a hand-set level always wins over an
 * inferred one; two of the same kind keep the higher level.
 */
export function mergeKnowledgeEntries(a: KnowledgeStoreEntry | undefined, b: KnowledgeStoreEntry): KnowledgeStoreEntry {
  if (!a) return b.m === 1 ? { l: b.l, m: 1 } : { l: b.l };
  const aManual = a.m === 1;
  const bManual = b.m === 1;
  if (aManual !== bManual) return aManual ? { l: a.l, m: 1 } : { l: b.l, m: 1 };
  const l = (a.l >= b.l ? a.l : b.l) as KnowledgeStoreEntry['l'];
  return aManual ? { l, m: 1 } : { l };
}

/**
 * Re-key a whole store with `rekey` (old key → the keys it now belongs under, or
 * null to keep it). Returns the new map and how many old keys moved. Idempotent
 * whenever `rekey` is: a store already keyed by the rule comes back equal.
 */
export function rekeyKnowledgeStore<E extends KnowledgeStoreEntry>(
  entries: Readonly<Record<string, E>>,
  rekey: (key: string) => readonly string[] | null,
): { entries: Record<string, KnowledgeStoreEntry>; moved: number } {
  const out: Record<string, KnowledgeStoreEntry> = {};
  let moved = 0;
  const keep: Array<[string, E]> = [];
  const move: Array<[string[], E]> = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== 'object' || typeof entry.l !== 'number') continue;
    const next = rekey(key)?.filter(Boolean) ?? null;
    if (!next || !next.length || (next.length === 1 && next[0] === key)) keep.push([key, entry]);
    else move.push([[...next], entry]);
  }
  for (const [key, entry] of keep) out[key] = mergeKnowledgeEntries(out[key], entry);
  for (const [keys, entry] of move) {
    moved += 1;
    for (const key of keys) out[key] = mergeKnowledgeEntries(out[key], entry);
  }
  return { entries: out, moved };
}

/**
 * The conservative migration rule for a key stored before this module: only the
 * moves the new rule makes for certain. NFKC always; Japanese re-tokenized only
 * when the key has kanji (an all-kana key is a reader token and IPADIC cuts
 * unknown kana into nonsense); Russian lower-cased and stress-stripped (its
 * stems and graded forms are already keys). Null when the key stays.
 */
export function migratedKnowledgeKeys(key: string, lang: StudyLang, deps: KnowledgeKeyDeps = {}): string[] | null {
  const plain = normalizeKnowledgeText(key);
  if (!plain) return null;
  let next: string[];
  if (lang === 'ja') {
    next = hasKanji(plain) && deps.tokenizeJapanese ? japaneseKeys(plain, deps.tokenizeJapanese) : [plain];
  } else if (lang === 'ru') {
    next = [stripRussianStress(plain.toLowerCase())];
  } else {
    next = [plain];
  }
  return next.length === 1 && next[0] === key ? null : next;
}
