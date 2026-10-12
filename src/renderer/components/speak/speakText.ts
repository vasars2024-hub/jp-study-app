/**
 * Study-language text as the speaking and writing panels need it: tokens with
 * readings for the shadowing comparison, and tokens with knowledge levels and
 * ruby for the conversation partner. Japanese goes through kuromoji, Chinese
 * through ICU words plus CC-CEDICT pinyin from main (`readingAid`), Russian
 * through ICU words. When a tokenizer or dictionary is missing, the text still
 * comes back as plain tokens — comparison and colouring degrade, never throw.
 *
 * Loaded only by lazy panels.
 */
import { alignFurigana, toHiragana, type FuriganaSegment } from '../../../shared/furigana';
import { pinyinRubyPairs } from '../../../shared/readingAid';
import type { ShadowToken } from '../../../shared/shadowingScore';
import { segmentStudyText } from '../../../shared/studySegmentation';
import { studyLangTag, type StudyLang } from '../../../shared/studyLang';
import { getLevel } from '../../knownWords';
import { fetchReadingAid } from '../../readingAid';
import { getChineseScript } from '../../studyEnvironment';
import { studyTokens } from '../../studyTokens';
import { getTokenizer, tokenizeSync } from '../../tokenizer';

async function japaneseReady(): Promise<boolean> {
  try {
    await getTokenizer();
    return true;
  } catch {
    return false;
  }
}

/** Tokens of a line with readings, for `compareShadowing`. */
export async function shadowTokensFor(text: string, lang: 'ja' | 'zh'): Promise<ShadowToken[]> {
  const clean = text.trim();
  if (!clean) return [];
  if (lang === 'ja') {
    if (!(await japaneseReady())) return [{ surface: clean }];
    return tokenizeSync(clean).map((token) => ({
      surface: token.surface,
      ...(token.reading && token.reading !== '*' ? { reading: token.reading } : {}),
    }));
  }
  const parts = segmentStudyText(clean, studyLangTag('zh', getChineseScript()));
  const words = parts.filter((part) => part.wordLike).map((part) => part.text);
  const readings = await fetchReadingAid('zh', words).catch(() => ({} as Record<string, string[]>));
  return parts.map((part) => ({ surface: part.text, ...(readings[part.text] ? { syllables: readings[part.text] } : {}) }));
}

export type WordLevelClass = 'is-known' | 'is-learning' | 'is-new';

export interface DisplayToken {
  surface: string;
  /** The knowledge-store key; '' for punctuation and particles. */
  lemma: string;
  content: boolean;
  proper: boolean;
  /** Hiragana reading (Japanese), when the tokenizer had one. */
  reading: string;
  level: WordLevelClass | null;
}

export function levelClass(level: number): WordLevelClass {
  return level >= 2 ? 'is-known' : level === 1 ? 'is-learning' : 'is-new';
}

/** Tokens of a reply with their knowledge level. Japanese needs `prepareStudyText` first. */
export function displayTokensFor(text: string, lang: StudyLang): DisplayToken[] {
  let tokens: ReturnType<typeof studyTokens>;
  try {
    tokens = studyTokens(text, lang);
  } catch {
    return [{ surface: text, lemma: '', content: false, proper: false, reading: '', level: null }];
  }
  return tokens.map((token) => {
    const content = token.content && !token.proper;
    return {
      surface: token.surface,
      lemma: content ? token.lemma : '',
      content,
      proper: token.proper,
      reading: token.reading && token.reading !== '*' ? toHiragana(token.reading) : '',
      level: content ? levelClass(getLevel(token.lemma)) : null,
    };
  });
}

/** Builds kuromoji for Japanese; true when tokens with readings are available. */
export function prepareStudyText(lang: StudyLang): Promise<boolean> {
  return lang === 'ja' ? japaneseReady() : Promise.resolve(true);
}

export interface RubyRun {
  base: string;
  rt: string;
}

/** Ruby runs for one Japanese token (furigana over its kanji only). */
export function japaneseRuby(token: DisplayToken): RubyRun[] {
  const segments: FuriganaSegment[] = alignFurigana(token.surface, token.reading || undefined);
  return segments.map((segment) => ({ base: segment.text, rt: segment.reading ?? '' }));
}

/** Ruby runs for one Chinese word from its pinyin syllables. */
export function chineseRuby(word: string, syllables: readonly string[] | undefined): RubyRun[] {
  return pinyinRubyPairs(word, syllables);
}

/** Pinyin for every word of the given texts (one round trip; cached by `readingAid`). */
export async function pinyinFor(texts: readonly string[]): Promise<Record<string, string[]>> {
  const words = new Set<string>();
  for (const text of texts) {
    for (const part of segmentStudyText(text, studyLangTag('zh', getChineseScript()))) {
      if (part.wordLike) words.add(part.text);
    }
  }
  if (!words.size) return {};
  return fetchReadingAid('zh', [...words]).catch(() => ({}));
}
