/**
 * The renderer half of the Chinese and Russian reading aid: segment a line
 * (ICU, synchronous) and ask main for the readings of its words (pinyin from
 * CC-CEDICT, stress from the Russian dictionary), cached per word. Japanese
 * furigana stays on kuromoji (`tokenizer.ts`).
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReadingAidLang, ReadingAidResult } from '../shared/readingAid';
import { segmentStudyText, type StudySegment } from '../shared/studySegmentation';
import type { StudyLang } from '../shared/studyLang';

const CACHE_MAX = 6000;
/** `lang\0word` → reading, or null for "asked, main has none". */
const cache = new Map<string, string[] | null>();

function remember(key: string, value: string[] | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** Readings for `words`, from the cache where possible and one IPC call for the rest. */
export async function fetchReadingAid(lang: ReadingAidLang, words: readonly string[]): Promise<ReadingAidResult> {
  const out: ReadingAidResult = {};
  const missing: string[] = [];
  for (const word of new Set(words)) {
    const key = `${lang}\u0000${word}`;
    if (cache.has(key)) {
      const hit = cache.get(key);
      if (hit) out[word] = hit;
    } else {
      missing.push(word);
    }
  }
  if (!missing.length || typeof window === 'undefined' || typeof window.api?.readingAid !== 'function') return out;
  try {
    const answer = await window.api.readingAid(lang, missing);
    for (const word of missing) {
      const reading = answer?.[word];
      remember(`${lang}\u0000${word}`, Array.isArray(reading) && reading.length ? reading : null);
      if (Array.isArray(reading) && reading.length) out[word] = reading;
    }
  } catch {
    /* no dictionary: the line is drawn without the aid */
  }
  return out;
}

/** The segmenter tag for a study language (`zh-Hans` / `zh-Hant` by script). */
function segmentTag(lang: StudyLang, tag?: string): string {
  return lang === 'zh' ? (tag?.startsWith('zh') ? tag : 'zh-Hans') : lang;
}

/**
 * Segments of each line, and — when the aid is on and the language is Chinese
 * or Russian — the readings of their words. Japanese returns segments only.
 */
export function useReadingAid(
  lines: readonly string[],
  lang: StudyLang,
  enabled: boolean,
  tag?: string,
): { segments: StudySegment[][]; readings: ReadingAidResult } {
  const locale = segmentTag(lang, tag);
  const key = lines.join('\u0001');
  // Keyed on the joined text, not the array: callers build `lines` inline.
  const segments = useMemo(() => lines.map((line) => segmentStudyText(line, locale)), [key, locale]);
  const [readings, setReadings] = useState<ReadingAidResult>({});

  useEffect(() => {
    if (!enabled || (lang !== 'zh' && lang !== 'ru')) {
      setReadings({});
      return;
    }
    let cancelled = false;
    const words = segments.flatMap((parts) => parts.filter((part) => part.wordLike).map((part) => part.text));
    void fetchReadingAid(lang, words).then((next) => {
      if (!cancelled) setReadings(next);
    });
    return () => {
      cancelled = true;
    };
  }, [segments, lang, enabled]);

  return { segments, readings };
}

/** Tests only. */
export function __clearReadingAidCacheForTests(): void {
  cache.clear();
}
