// Readings for the study language's reading aid: pinyin for Chinese words from
// CC-CEDICT, stressed spellings for Russian words from the dictionary database
// (the Wiktionary extract's `canonical` form and paradigm rows).
//
// Pure over its inputs (a CC-CEDICT index, a database handle) so it is testable
// without Electron; `dictionary.ts` supplies the real ones behind
// `dict:readingAid`.

import type { CedictEntry } from '../../shared/pinyin';
import { pinyinToneMarks } from '../../shared/pinyin';
import { russianVowelCount, type ReadingAidResult } from '../../shared/readingAid';
import { foldRussianYo, hasRussianStressMark, stripRussianStress } from '../../shared/russianMorphology';
import type { CedictIndex } from './chineseLookup';
import type { SqliteDb } from './db';
import { prepareCached } from './db';
import { INFLECTION_WRITTEN_TAG } from './dictService';

const HAN = /\p{Script=Han}/u;
const MAX_WORD = 8;

/**
 * The entry a reader most likely means: one written exactly this way, and not a
 * surname or place-name reading (CC-CEDICT capitalises those: `Zeng1` for 曾).
 */
function bestEntry(entries: readonly CedictEntry[] | undefined, text: string): CedictEntry | null {
  if (!entries?.length) return null;
  const exact = entries.filter((entry) => entry.simp === text || entry.trad === text);
  const pool = exact.length ? exact : entries;
  return pool.find((entry) => !/^[A-Z]/.test(entry.pinyin)) ?? pool[0];
}

/**
 * One tone-marked syllable per character of a Chinese word, by forward maximum
 * match over CC-CEDICT: the word itself when it is a headword, else the longest
 * headwords it is made of (我在 → 我 + 在). '' for a character nothing covers.
 */
export function chineseSyllables(index: CedictIndex, word: string): string[] {
  const chars = [...word];
  const out: string[] = new Array(chars.length).fill('');
  let i = 0;
  while (i < chars.length) {
    if (!HAN.test(chars[i])) {
      i += 1;
      continue;
    }
    let matched = 0;
    for (let len = Math.min(MAX_WORD, chars.length - i); len >= 1; len -= 1) {
      const piece = chars.slice(i, i + len).join('');
      const entry = bestEntry(index.byWord.get(piece), piece);
      if (!entry) continue;
      const syllables = entry.pinyin.trim().split(/\s+/);
      if (syllables.length !== len) {
        // Erhua and letter words (`一点儿` [yi1 dian3 r5] is fine; `卡拉OK`
        // is not): a count mismatch cannot be spread over characters.
        if (len > 1) continue;
      }
      syllables.slice(0, len).forEach((syllable, k) => {
        out[i + k] = pinyinToneMarks(syllable.toLowerCase());
      });
      matched = len;
      break;
    }
    i += matched || 1;
  }
  return out;
}

export function chineseReadings(index: CedictIndex, words: readonly string[]): ReadingAidResult {
  const out: ReadingAidResult = {};
  for (const word of words) {
    if (!HAN.test(word)) continue;
    const syllables = chineseSyllables(index, word);
    if (syllables.some(Boolean)) out[word] = syllables;
  }
  return out;
}

/**
 * The stressed spelling of each Russian word, when the dictionary knows it and
 * knows only one: `руки` is both ру́ки (genitive singular) and ру́ки / руки́ by
 * paradigm, and a guessed accent is worse than none. Monosyllables carry no mark.
 */
export function russianReadings(db: SqliteDb, words: readonly string[]): ReadingAidResult {
  const out: ReadingAidResult = {};
  const byHeadword = prepareCached(
    db,
    `select h.reading as reading from headwords h join dictionaries d on d.id = h.dict_id
     where d.enabled = 1 and h.lang = 'ru' and h.norm = ? and h.reading is not null and h.reading <> ''`,
  );
  const byForm = prepareCached(
    db,
    `select i.tags as tags from inflections i join headwords h on h.id = i.headword_id
     join dictionaries d on d.id = h.dict_id
     where d.enabled = 1 and h.lang = 'ru' and i.form = ?`,
  );
  for (const word of words) {
    if (russianVowelCount(word) < 2) continue;
    const plain = stripRussianStress(word.normalize('NFKC').trim().toLowerCase());
    const found = new Set<string>();
    for (const row of byHeadword.all(plain) as { reading: string }[]) {
      if (hasRussianStressMark(row.reading)) found.add(row.reading.normalize('NFC').toLowerCase());
    }
    for (const key of new Set([plain, foldRussianYo(plain)])) {
      for (const row of byForm.all(key) as { tags: string | null }[]) {
        for (const tag of row.tags?.split(',') ?? []) {
          if (tag.startsWith(INFLECTION_WRITTEN_TAG)) {
            found.add(tag.slice(INFLECTION_WRITTEN_TAG.length).normalize('NFC').toLowerCase());
          }
        }
      }
    }
    if (found.size === 1) out[word] = [...found];
  }
  return out;
}
