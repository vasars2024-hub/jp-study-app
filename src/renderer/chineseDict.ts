// Offline Simplified/Traditional Chinese → English dictionary, backed by
// CC-CEDICT (bundled at public/cedict/cedict.u8). Returns the same DictResult /
// DictEntry shape as the Japanese (Jisho) path, so the dictionary UI, the
// reader pop-up, saving to Flashcards, and adding to Anki all work unchanged.
import type { DictEntry, DictResult } from '../shared/types';

interface CedictEntry {
  trad: string;
  simp: string;
  pinyin: string; // numbered, e.g. "chuan2 tong3"
  defs: string[];
}

interface CedictIndex {
  /** simplified or traditional headword -> entries */
  byWord: Map<string, CedictEntry[]>;
  /** every entry, for English (gloss) search */
  all: CedictEntry[];
}

// ----- numbered pinyin (chuan2) -> tone marks (chuán) -----
const TONE: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à', 'a'],
  e: ['e', 'ē', 'é', 'ě', 'è', 'e'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

function syllableToneMark(syl: string): string {
  const m = syl.match(/^([a-zü:]+)([0-5])$/i);
  if (!m) return syl.replace(/u:/g, 'ü');
  const base = m[1].toLowerCase().replace(/u:/g, 'ü');
  const tone = Number(m[2]);
  if (tone === 0 || tone === 5) return base;
  let idx = -1;
  if (base.includes('a')) idx = base.indexOf('a');
  else if (base.includes('e')) idx = base.indexOf('e');
  else if (base.includes('ou')) idx = base.indexOf('o');
  else {
    for (let k = base.length - 1; k >= 0; k--) {
      if ('iouü'.includes(base[k])) {
        idx = k;
        break;
      }
    }
  }
  if (idx < 0) return base;
  const ch = base[idx];
  const marked = TONE[ch] ? TONE[ch][tone] : ch;
  return base.slice(0, idx) + marked + base.slice(idx + 1);
}

export function pinyinToneMarks(pinyin: string): string {
  return pinyin
    .trim()
    .split(/\s+/)
    .map(syllableToneMark)
    .join(' ');
}

// ----- index (loaded once, lazily) -----
let indexPromise: Promise<CedictIndex> | null = null;

const LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.+)\/\s*$/;

async function buildIndex(): Promise<CedictIndex> {
  const res = await fetch(`${location.origin}/cedict/cedict.u8`);
  if (!res.ok) throw new Error(`Could not load the Chinese dictionary (${res.status}).`);
  const text = await res.text();
  const byWord = new Map<string, CedictEntry[]>();
  const all: CedictEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const entry: CedictEntry = {
      trad: m[1],
      simp: m[2],
      pinyin: m[3],
      defs: m[4].split('/').map((d) => d.trim()).filter(Boolean),
    };
    all.push(entry);
    for (const key of entry.simp === entry.trad ? [entry.simp] : [entry.simp, entry.trad]) {
      const list = byWord.get(key);
      if (list) list.push(entry);
      else byWord.set(key, [entry]);
    }
  }
  return { byWord, all };
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
