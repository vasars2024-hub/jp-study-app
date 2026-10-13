/**
 * The knowledge-store keys a dictionary surface grades, from the one rule every
 * writer uses (`shared/knowledgeKey`).
 *
 * The popup used to grade `lemmaOf(query)` — the FIRST content token — so
 * grading 携帯電話 filed the level under 携帯 and said nothing about 電話, while
 * the reader colours the two parts separately. Now a word grades exactly the keys
 * the reader reads it by: one key for one word (食べた → 食べる, with the reader's
 * spelling alias, ネコ → ねこ when only ねこ is graded), every part for a noun
 * compound (携帯電話 → 携帯 + 電話), the whole phrase for a set phrase.
 *
 * A compound has no level of its own any more — it lives under its parts — so a
 * surface shows the parts' levels and a combined state: the LOWEST part, because
 * a compound is only as known as its least-known part.
 */
import {
  bulkClearManual,
  bulkSetLevels,
  getLevel,
  isManualLevel,
  type WkLevel,
} from '../../knownWords';
import { getTokenizer, tokenizeSync, tokenizerReady } from '../../tokenizer';
import { knowledgeKeyDeps, readerKeyForToken } from '../../studyTokens';
import { knowledgeKeysFor } from '../../../shared/knowledgeKey';
import type { StudyLang } from '../../../shared/studyLang';

/** The key the reader colours a Japanese dictionary form by (its spelling alias when only that is graded). */
function japaneseReaderKey(key: string): string {
  let reading: string | undefined;
  if (tokenizerReady()) {
    try {
      const tokens = tokenizeSync(key);
      if (tokens.length === 1 && tokens[0].surface === key) reading = tokens[0].reading;
    } catch {
      reading = undefined;
    }
  }
  return readerKeyForToken({ surface: key, lemma: key, reading }) || key;
}

/**
 * The keys `word` is graded under, with whatever tokenizer state there is now.
 * Japanese before kuromoji is built: the word by spelling (rule 5).
 */
export function knowledgeTargetsSync(word: string, lang: StudyLang): string[] {
  const text = (word ?? '').trim();
  if (!text) return [];
  let keys: string[];
  try {
    keys = knowledgeKeysFor(text, lang, knowledgeKeyDeps());
  } catch {
    keys = [text];
  }
  if (!keys.length) keys = [text];
  if (lang !== 'ja') return keys;
  return [...new Set(keys.map(japaneseReaderKey))];
}

/** `knowledgeTargetsSync` after kuromoji is built (Japanese only; a failed build keeps the spelling rule). */
export async function knowledgeTargets(word: string, lang: StudyLang): Promise<string[]> {
  if (lang === 'ja') {
    try {
      await getTokenizer();
    } catch {
      // No tokenizer: the spelling rule below still gives a key.
    }
  }
  return knowledgeTargetsSync(word, lang);
}

export interface KnowledgePart {
  key: string;
  level: WkLevel;
  manual: boolean;
}

/** Each key's stored level and whether it was set by hand. */
export function knowledgeParts(keys: readonly string[]): KnowledgePart[] {
  return keys.map((key) => ({ key, level: getLevel(key), manual: isManualLevel(key) }));
}

/** The combined state of several keys: the least-known one. 0 for none. */
export function combinedLevel(keys: readonly string[]): WkLevel {
  if (!keys.length) return 0;
  let min = 3;
  for (const key of keys) min = Math.min(min, getLevel(key));
  return min as WkLevel;
}

/** Whether any of the keys carries a hand-set level. */
export function anyManualLevel(keys: readonly string[]): boolean {
  return keys.some((key) => isManualLevel(key));
}

/** Grade every key by hand, in one write and one change event. */
export function gradeKnowledgeTargets(keys: readonly string[], level: WkLevel): void {
  if (!keys.length) return;
  bulkSetLevels(keys, level);
}

/** Hand every key back to automatic grading. */
export function resetKnowledgeTargets(keys: readonly string[]): void {
  if (!keys.length) return;
  bulkClearManual(keys);
}

/** The next level when a cycling control is pressed on these keys (from their combined state). */
export function cycleKnowledgeTargets(keys: readonly string[]): WkLevel {
  const next = ((combinedLevel(keys) + 1) % 4) as WkLevel;
  gradeKnowledgeTargets(keys, next);
  return next;
}
