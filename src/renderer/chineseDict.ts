// Offline Simplified/Traditional Chinese → English dictionary, backed by
// CC-CEDICT. Prefers the Phase 6 managed install (`cc-cedict`); falls back to
// the bundled copy at public/cedict/cedict.u8. Returns the same DictResult /
// DictEntry shape as the Japanese (Jisho) path, so the dictionary UI, the
// reader pop-up, saving to Flashcards, and adding to Anki all work unchanged.
import type { DictEntry, DictResult } from '../shared/types';
import { cedictHeadwords, parseCedictLine, pinyinToneMarks, type CedictEntry } from '../shared/pinyin';

// The line format, the tone-mark table and the classifier parser moved to
// `shared/pinyin.ts` so the main-process CC-CEDICT importer can use the same code.
// Re-exported here because these are this module's published API and several
// callers import them from this path.
export { pinyinToneMarks, parseClassifiers, type ClassifierHint } from '../shared/pinyin';

interface CedictIndex {
  /** simplified or traditional headword -> entries */
  byWord: Map<string, CedictEntry[]>;
  /** every entry, for English (gloss) search */
  all: CedictEntry[];
}

// ----- index (loaded once, lazily) -----
let indexPromise: Promise<CedictIndex> | null = null;

async function loadCedictRaw(): Promise<string> {
  // Prefer Phase 6 managed install; fall back to the bundled public copy so ZH
  // lookup never hard-breaks when the asset is not downloaded yet.
  try {
    if (typeof window !== 'undefined' && window.api?.assetsIsInstalled) {
      const installed = await window.api.assetsIsInstalled('cc-cedict');
      if (installed) {
        const text = await window.api.assetsReadText('cc-cedict');
        if (text && text.length > 0) return text;
      }
    }
  } catch {
    /* fall through to bundled */
  }
  const res = await fetch(`${location.origin}/cedict/cedict.u8`);
  if (!res.ok) throw new Error(`Could not load the Chinese dictionary (${res.status}).`);
  return res.text();
}

async function buildIndex(): Promise<CedictIndex> {
  const text = await loadCedictRaw();
  const byWord = new Map<string, CedictEntry[]>();
  const all: CedictEntry[] = [];
  for (const line of text.split('\n')) {
    const entry = parseCedictLine(line);
    if (!entry) continue;
    all.push(entry);
    for (const key of cedictHeadwords(entry)) {
      const list = byWord.get(key);
      if (list) list.push(entry);
      else byWord.set(key, [entry]);
    }
  }
  return { byWord, all };
}

/** Drop the cached index so a newly installed CC-CEDICT is picked up. */
export function resetChineseDictCache(): void {
  indexPromise = null;
}

function getIndex(): Promise<CedictIndex> {
  if (!indexPromise) indexPromise = buildIndex();
  return indexPromise;
}

function toDictEntry(e: CedictEntry): DictEntry {
  return {
    word: e.simp,
    reading: pinyinToneMarks(e.pinyin),
    isCommon: false,
    jlpt: [],
    senses: [{ partsOfSpeech: [], definitions: e.defs, tags: [] }],
  };
}

const hasCjk = (s: string): boolean => /[㐀-鿿豈-﫿]/.test(s);

/** Look up a word (Chinese headword) or an English term, offline via CC-CEDICT. */
export async function lookupChinese(query: string): Promise<DictResult> {
  const q = (query ?? '').trim();
  if (!q) return { query: q, entries: [] };
  try {
    const { byWord, all } = await getIndex();

    if (hasCjk(q)) {
      // Exact headword, else the longest matching prefix (good for a reader
      // selection that grabbed a word plus a trailing particle/character).
      let hit = byWord.get(q);
      if (!hit) {
        for (let len = q.length - 1; len >= 1 && !hit; len--) {
          hit = byWord.get(q.slice(0, len));
        }
      }
      return { query: q, entries: (hit ?? []).slice(0, 12).map(toDictEntry) };
    }

    // English → Chinese: match whole glosses first, then substrings.
    const needle = q.toLowerCase();
    const exact: CedictEntry[] = [];
    const partial: CedictEntry[] = [];
    for (const e of all) {
      const defs = e.defs.map((d) => d.toLowerCase());
      if (defs.some((d) => d === needle || d.startsWith(needle + ' ') || d.startsWith('to ' + needle))) {
        exact.push(e);
      } else if (defs.some((d) => d.includes(needle))) {
        partial.push(e);
      }
      if (exact.length >= 20) break;
    }
    const merged = [...exact, ...partial].slice(0, 20);
    return { query: q, entries: merged.map(toDictEntry) };
  } catch (err) {
    return { query: q, entries: [], error: err instanceof Error ? err.message : String(err) };
  }
}
