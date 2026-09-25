// Frequency lists the learner brings: CSV, TSV or plain-text word lists in any
// study language, and the language they are in. Pure, so main's importer and
// the tests share one definition of what a list file means.

import { studyLangOfText, type StudyLang } from './studyLang';

const NUMBER = /^-?\d+(?:[.,]\d+)?$/;

function num(value: string): number {
  return Number(value.replace(',', '.'));
}

/**
 * Ranks (1 = most frequent) from a text list. Accepted shapes, one entry per
 * line, separated by tab, comma, semicolon or spaces:
 *
 *   word                       — ranked by line order
 *   word  rank                 — the numbers rise down the file
 *   word  count                — the numbers fall: ranked by count, highest first
 *   rank  word  (count)        — a leading rank column
 *
 * A header line (`word,count`) and `#` comments are skipped. A reading column
 * (`word\treading\trank`, the Yomitan/JPDB shape) keeps the reading key too.
 */
export function parseFrequencyText(text: string): Record<string, number> {
  const rows: { word: string; reading?: string; value?: number }[] = [];
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';')
      : line.includes(',') ? line.split(',') : line.split(/\s+/))
      .map((cell) => cell.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    if (!cells.length) continue;
    const numbers = cells.filter((cell) => NUMBER.test(cell));
    const words = cells.filter((cell) => !NUMBER.test(cell));
    if (!words.length) continue;
    // A header: every cell a label and a known column name among them.
    if (!rows.length && !numbers.length && words.some((cell) => /^(word|term|expression|rank|count|freq(uency)?|lemma)$/i.test(cell))) continue;
    const leadingRank = NUMBER.test(cells[0]) && cells.length > 1;
    const value = leadingRank ? num(cells[0]) : numbers.length ? num(numbers[numbers.length - 1]) : undefined;
    rows.push({ word: words[0], ...(words[1] ? { reading: words[1] } : {}), ...(value !== undefined ? { value } : {}) });
  }

  const withValues = rows.filter((row) => row.value !== undefined);
  let ordered = rows;
  if (withValues.length === rows.length && rows.length > 1) {
    // Rising numbers are ranks; falling ones are counts.
    let rising = 0;
    let falling = 0;
    for (let i = 1; i < rows.length; i += 1) {
      const a = rows[i - 1].value as number;
      const b = rows[i].value as number;
      if (b > a) rising += 1;
      else if (b < a) falling += 1;
    }
    ordered = rising >= falling
      ? [...rows].sort((a, b) => (a.value as number) - (b.value as number))
      : [...rows].sort((a, b) => (b.value as number) - (a.value as number));
  }

  const ranks: Record<string, number> = {};
  ordered.forEach((row, index) => {
    const rank = index + 1;
    if (ranks[row.word] === undefined) ranks[row.word] = rank;
    if (row.reading) ranks[`${row.word}\x01${row.reading}`] = rank;
  });
  return ranks;
}

/**
 * The study language a list's words are in, by script over a sample: Cyrillic
 * is Russian; Han with kana among the words is Japanese (a Japanese list's top
 * words always include kana — particles, verbs); Han with no kana anywhere is
 * Chinese. Undefined for a list in none of them. An imported list with no
 * language used to count for every language at once.
 */
export function detectListLanguage(words: readonly string[], studyLang: StudyLang): StudyLang | undefined {
  let kana = 0;
  let han = 0;
  let cyrillic = 0;
  for (const word of words.slice(0, 500)) {
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) kana += 1;
    else if (/\p{Script=Han}/u.test(word)) han += 1;
    else if (/\p{Script=Cyrillic}/u.test(word)) cyrillic += 1;
  }
  if (!kana && !han && !cyrillic) return undefined;
  if (cyrillic > kana + han) return 'ru';
  if (kana) return 'ja';
  // Only Han and no kana: Chinese — unless the sample is tiny and the learner studies Japanese.
  return han < 20 ? studyLangOfText(words.find((word) => /\p{Script=Han}/u.test(word)) ?? '', studyLang) : 'zh';
}
