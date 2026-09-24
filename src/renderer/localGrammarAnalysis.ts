import { GRAMMAR } from './data/grammar';
import type { NormalizedGrammarPoint } from './data/grammar/normalize';
import { grammarSurfaceCore } from '../shared/grammarPatternSurface';
import {
  alignAnnotations,
  normalizeAnalysisText,
  type SentenceAnalysisResult,
  type UnalignedAnnotation,
} from '../shared/sentenceAnalysisCore';

/**
 * Grammar highlight without AI: the Grammar app's own library, matched on the sentence.
 *
 * The AI analysis explains a line; this only finds which library patterns the line
 * literally contains, with the library's meaning, explanation and examples for each. That
 * is enough to colour the subtitle and fill the panel offline and for free, so the toggle
 * does something in a fresh profile, and the AI stays what adds depth when it is set up.
 *
 * The match is `grammarSurfaceCore` — the same conservative rule Grammar practice uses, so
 * a short kana fragment (に, て) that occurs inside unrelated words is never claimed. That
 * under-reports on purpose: a highlight that points at the wrong characters teaches the
 * wrong thing, while a missing one only teaches less.
 */

interface LibraryEntry {
  core: string;
  point: NormalizedGrammarPoint;
}

const libraryByLang = new Map<string, LibraryEntry[]>();

function libraryFor(lang: string): LibraryEntry[] {
  const cached = libraryByLang.get(lang);
  if (cached) return cached;
  const seen = new Set<string>();
  const entries: LibraryEntry[] = [];
  // GRAMMAR runs N5 → N1 (then HSK), so a core shared by several records keeps its
  // earliest, best-authored one rather than a later supplement's copy.
  for (const point of GRAMMAR) {
    if (point.lang !== lang) continue;
    const core = grammarSurfaceCore(point.title);
    // Chinese has no kana, so the "has a kanji" escape hatch would admit every one-hanzi
    // pattern (的, 了) and highlight half the sentence.
    if (!core || (lang !== 'ja' && core.length < 2) || seen.has(core)) continue;
    seen.add(core);
    entries.push({ core, point });
  }
  libraryByLang.set(lang, entries);
  return entries;
}

const MAX_EXAMPLES = 2;
const CACHE_LIMIT = 200;
const resultCache = new Map<string, SentenceAnalysisResult | null>();

/**
 * The library patterns in `raw`, as a `SentenceAnalysisResult` the subtitle line and the
 * analysis panel render as they would the AI's. `null` when nothing in the library
 * matches, so the caller can tell "no offline highlight" from "an empty one".
 */
export function localSentenceAnalysis(raw: string, lang: string): SentenceAnalysisResult | null {
  const sentence = normalizeAnalysisText(raw);
  if (!sentence) return null;
  const key = `${lang}::${sentence}`;
  if (resultCache.has(key)) return resultCache.get(key) ?? null;

  const hits: Array<{ at: number; annotation: UnalignedAnnotation }> = [];
  for (const { core, point } of libraryFor(lang)) {
    const at = sentence.indexOf(core);
    if (at < 0) continue;
    hits.push({ at, annotation: {
      text: core,
      category: 'grammar',
      headword: point.title,
      level: String(point.level),
      meaning: point.meaning,
      explanation: point.explanation,
      examples: point.examples.slice(0, MAX_EXAMPLES).map((example) => ({
        text: example.jp,
        translation: example.en,
      })),
      vocabulary: [],
    } });
  }
  // Reading order, longest first at one position: `alignAnnotations` keeps the longer of
  // two overlapping spans, the more specific claim (〜なければならない over 〜ならない).
  hits.sort((a, b) => a.at - b.at || b.annotation.text.length - a.annotation.text.length);
  const annotations = alignAnnotations(sentence, hits.map((hit) => hit.annotation));
  const result = annotations.length
    ? { sentence, translations: {}, annotations, nuance: [], pitfalls: [] }
    : null;
  resultCache.set(key, result);
  while (resultCache.size > CACHE_LIMIT) {
    const oldest = resultCache.keys().next().value;
    if (oldest === undefined) break;
    resultCache.delete(oldest);
  }
  return result;
}
