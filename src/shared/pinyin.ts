// CC-CEDICT's line format and pinyin transliteration, as pure functions.
//
// Lifted out of `renderer/chineseDict.ts` because the main-process CC-CEDICT
// importer needs exactly the same parsing, and a second copy of a tone-mark table
// is a guaranteed divergence. `chineseDict.ts` now re-exports from here, so there
// is one implementation and the renderer keeps its public API unchanged.
//
// Everything here is synchronous, allocation-light and free of any DOM or Node
// dependency: it is called once per line over a ~120 000-line file.

export interface CedictEntry {
  trad: string;
  simp: string;
  /** Numbered pinyin exactly as CEDICT writes it, e.g. `chuan2 tong3`. */
  pinyin: string;
  defs: string[];
}

export interface ClassifierHint {
  trad: string;
  simp: string;
  /** Tone-marked, e.g. `tiáo`. */
  pinyin: string;
}

// ----- numbered pinyin (chuan2) → tone marks (chuán) -------------------------

const TONE: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à', 'a'],
  e: ['e', 'ē', 'é', 'ě', 'è', 'e'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

/**
 * Places the tone mark on the correct vowel of one numbered syllable.
 *
 * The rule is not "the first vowel": it is a → e → the `o` of `ou` → otherwise the
 * last vowel. `xiao4` is `xiào` (not `xìao`) and `liu2` is `liú` (not `líu`), which
 * is what the final-vowel fallback is for.
 */
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

/** `chuan2 tong3` → `chuán tǒng`. Display form. */
export function pinyinToneMarks(pinyin: string): string {
  return pinyin
    .trim()
    .split(/\s+/)
    .map(syllableToneMark)
    .join(' ');
}

/**
 * `chuan2 tong3` → `chuan tong`. The search key.
 *
 * `headwords.reading_norm` stores this: a learner types `chuan tong` or `chuantong`
 * without tones, and neither can match a tone-marked or tone-numbered string. Both
 * spellings are covered by storing this form and stripping spaces from the query.
 */
export function pinyinToneless(pinyin: string): string {
  return pinyin
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((syl) => syl.replace(/u:/g, 'ü').replace(/[0-5]+$/, ''))
    .filter(Boolean)
    .join(' ');
}

/** `chuan2 tong3` → `chuantong`. For the spaceless spelling learners actually type. */
export function pinyinSearchKey(pinyin: string): string {
  return pinyinToneless(pinyin).replace(/\s+/g, '');
}

// ----- the CC-CEDICT line format --------------------------------------------

/** `傳統 传统 [chuan2 tong3] /tradition/traditional/` */
export const CEDICT_LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.+)\/\s*$/;

/**
 * Parses one CC-CEDICT line, or returns null for a comment, a blank line or
 * anything that does not match the format.
 *
 * Returning null rather than throwing is deliberate: the file ships with a comment
 * header and occasional malformed lines, and an importer that dies on line 4 of a
 * 120 000-line file is worse than one that skips it.
 */
export function parseCedictLine(line: string): CedictEntry | null {
  if (!line || line[0] === '#') return null;
  const m = CEDICT_LINE_RE.exec(line);
  if (!m) return null;
  const defs = m[4].split('/').map((d) => d.trim()).filter(Boolean);
  if (!defs.length) return null;
  return { trad: m[1], simp: m[2], pinyin: m[3], defs };
}

/** Every headword a CEDICT entry should be findable under, deduplicated. */
export function cedictHeadwords(entry: CedictEntry): string[] {
  return entry.simp === entry.trad ? [entry.simp] : [entry.simp, entry.trad];
}

// ----- classifier (measure word) hints ---------------------------------------

// CEDICT embeds classifier hints as defs like "CL:隻|只[zhi1],條|条[tiao2]"
// (the trad| part is absent when both forms match, e.g. "CL:个[ge4]").
const CL_ITEM_RE = /([^,|[\]]+)(?:\|([^,[\]]+))?\[([^\]]*)\]/g;

/** Extract measure-word hints from a CEDICT entry's definition list. */
export function parseClassifiers(defs: string[]): ClassifierHint[] {
  const out: ClassifierHint[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    if (!def.startsWith('CL:')) continue;
    const body = def.slice(3);
    CL_ITEM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CL_ITEM_RE.exec(body)) !== null) {
      const trad = m[1].trim();
      const simp = (m[2] ?? m[1]).trim();
      if (!trad || seen.has(simp)) continue;
      seen.add(simp);
      out.push({ trad, simp, pinyin: pinyinToneMarks(m[3]) });
    }
  }
  return out;
}
