/**
 * The exam level of one subtitle line: the hardest word in it, on the study
 * language's scale (JLPT / HSK / CEFR).
 *
 * Words are levelled by the learner's uploaded level lists first; a word no
 * list covers falls back to its dictionary frequency rank (see
 * shared/levelFallback). Ranks are fetched once per word and cached for the
 * session, so a line the player shows twice costs nothing the second time.
 */
import { useEffect, useState } from 'react';
import { examSlotsForLang } from '../shared/bookLevelEstimate';
import { LEVEL_ORDER, levelFromRank } from '../shared/levelFallback';
import type { StudyLang } from '../shared/levelScale';
import { segmentStudyText, studyWordKey } from '../shared/studySegmentation';
import { getSlotList } from './levelLists';
import { getTokenizer, tokenizeSync } from './tokenizer';

const rankCache = new Map<string, number | null>();
const lineCache = new Map<string, string | null>();

/** The words of a line worth levelling: content words for Japanese, word-like segments otherwise. */
export async function lineWords(text: string, lang: StudyLang): Promise<string[]> {
  if (lang === 'ja') {
    await getTokenizer();
    return tokenizeSync(text)
      .filter((token) => token.content && !token.proper)
      .map((token) => token.lemma || token.surface);
  }
  return segmentStudyText(text, lang)
    .filter((part) => part.wordLike)
    .map((part) => studyWordKey(part.text, lang));
}

function listLevel(word: string, lang: StudyLang): string | null {
  for (const slot of examSlotsForLang(lang)) {
    const list = getSlotList(slot.id);
    if (list?.words.includes(word)) return slot.short;
  }
  return null;
}

/** The hardest label among `labels`, on the language's order. */
export function hardestLevel(labels: ReadonlyArray<string | null>, lang: StudyLang): string | null {
  const order = LEVEL_ORDER[lang];
  let best = -1;
  for (const label of labels) {
    const index = label ? order.indexOf(label.replace(/\s+/g, '')) : -1;
    if (index > best) best = index;
  }
  return best >= 0 ? order[best] : null;
}

export async function levelOfLine(text: string, lang: StudyLang): Promise<string | null> {
  const key = `${lang}\u0000${text}`;
  if (lineCache.has(key)) return lineCache.get(key) ?? null;
  const words = [...new Set(await lineWords(text, lang))];
  const labels = words.map((word) => listLevel(word, lang));
  const missing = words.filter((word, i) => !labels[i] && !rankCache.has(`${lang}:${word}`));
  if (missing.length && typeof window !== 'undefined' && window.api?.dictFrequencyRanks) {
    try {
      const ranks = await window.api.dictFrequencyRanks(missing, { sourceLangs: [lang] });
      for (const word of missing) rankCache.set(`${lang}:${word}`, ranks[word] ?? null);
    } catch {
      for (const word of missing) rankCache.set(`${lang}:${word}`, null);
    }
  }
  const all = words.map((word, i) => labels[i] ?? levelFromRank(rankCache.get(`${lang}:${word}`) ?? undefined, lang));
  const level = hardestLevel(all, lang);
  lineCache.set(key, level);
  return level;
}

/** A line's level for display, or null while unknown / when switched off. */
export function useLineLevel(text: string, lang: StudyLang, enabled: boolean): string | null {
  const [level, setLevel] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !text.trim()) {
      setLevel(null);
      return undefined;
    }
    let cancelled = false;
    void levelOfLine(text, lang).then((value) => {
      if (!cancelled) setLevel(value);
    });
    return () => {
      cancelled = true;
    };
  }, [text, lang, enabled]);
  return level;
}
