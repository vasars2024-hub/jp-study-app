import type { CsvTable } from './csvEditor';
import { normalizeTable } from './csvEditor';

export type ImportDeckSource = 'import' | 'csv';

export interface ImportDeckEntry {
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  front?: string;
  back?: string;
  source: ImportDeckSource;
  bookId: string;
  bookTitle: string;
}

export type DeckFieldKey = 'word' | 'reading' | 'meaning' | 'sentence' | 'front' | 'back' | 'skip';

export const DECK_FIELD_OPTIONS: Array<{ id: DeckFieldKey; label: string }> = [
  { id: 'word', label: 'Expression / Word' },
  { id: 'reading', label: 'Reading' },
  { id: 'meaning', label: 'Meaning / Definition' },
  { id: 'sentence', label: 'Sentence' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'skip', label: 'Skip' },
];

export type DeckColumnMapping = Record<number, DeckFieldKey>;

const HEADER_HINTS: Array<[RegExp, DeckFieldKey]> = [
  [/^expression$/i, 'word'],
  [/^word$/i, 'word'],
  [/^term$/i, 'word'],
  [/^kanji$/i, 'word'],
  // Chinese and Russian study decks.
  [/^(hanzi|simplified|汉字|漢字|简体|词语|詞語|单词|單詞|слово)$/i, 'word'],
  [/^vocabulary$/i, 'word'],
  [/^surface$/i, 'word'],
  [/^reading$/i, 'reading'],
  [/^kana$/i, 'reading'],
  [/^furigana$/i, 'reading'],
  [/^(pinyin|拼音|zhuyin|注音|transcription|stress|ударение|транскрипция|произношение)$/i, 'reading'],
  [/^meaning$/i, 'meaning'],
  [/^definition$/i, 'meaning'],
  [/^gloss$/i, 'meaning'],
  [/^translation$/i, 'meaning'],
  [/^(意思|释义|釋義|英文|значение|перевод)$/i, 'meaning'],
  [/^sentence$/i, 'sentence'],
  [/^example$/i, 'sentence'],
  [/^context$/i, 'sentence'],
  [/^(例句|句子|пример|предложение)$/i, 'sentence'],
  [/^front$/i, 'front'],
  [/^back$/i, 'back'],
  [/^rear$/i, 'back'],
];

/** A column of kana, pinyin (tone marks or digits) or a stress-marked word: a reading. */
function looksLikeReadingColumn(values: string[]): boolean {
  const cells = values.map((v) => v.trim()).filter(Boolean);
  if (!cells.length) return false;
  const reading = cells.filter(
    (v) =>
      /^[\p{Script=Hiragana}\p{Script=Katakana}ー・ \u3000]+$/u.test(v) ||
      /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(v) ||
      /^([a-zü]+[1-5] ?)+$/i.test(v) ||
      /́/.test(v.normalize('NFD')),
  ).length;
  return reading / cells.length >= 0.6;
}

/**
 * Columns by header name, then by position for the rest. `rows` (optional) lets
 * a headerless table be read by content: a pasted "猫<TAB>cat" list used to map
 * its second column to `reading` by position, so every card came out with
 * "cat" as its reading and no meaning at all.
 */
export function guessColumnMapping(headers: string[], rows?: readonly (readonly string[])[]): DeckColumnMapping {
  if (rows && rows.length) {
    // Only when no header names a field: named headers always win over content.
    const named = headers.some((h) => HEADER_HINTS.some(([re]) => re.test(h.trim())));
    if (!named) {
      const mapping: DeckColumnMapping = { 0: 'word' };
      let reading = false;
      let meaning = false;
      for (let i = 1; i < headers.length; i++) {
        const column = rows.map((row) => row[i] ?? '');
        if (!reading && looksLikeReadingColumn(column)) {
          mapping[i] = 'reading';
          reading = true;
        } else if (!meaning) {
          mapping[i] = 'meaning';
          meaning = true;
        } else if (!reading) {
          mapping[i] = 'reading';
          reading = true;
        } else mapping[i] = 'skip';
      }
      return mapping;
    }
  }
  return guessColumnMappingByHeader(headers);
}

function guessColumnMappingByHeader(headers: string[]): DeckColumnMapping {
  const mapping: DeckColumnMapping = {};
  const used = new Set<DeckFieldKey>();
  headers.forEach((header, index) => {
    const trimmed = header.trim();
    for (const [re, field] of HEADER_HINTS) {
      if (re.test(trimmed) && !used.has(field)) {
        mapping[index] = field;
        used.add(field);
        return;
      }
    }
  });
  if (!Object.values(mapping).includes('word') && headers.length > 0) mapping[0] = 'word';
  if (!Object.values(mapping).includes('reading') && headers.length > 1) {
    const idx = headers.findIndex((_, i) => !mapping[i]);
    if (idx >= 0) mapping[idx] = 'reading';
  }
  if (!Object.values(mapping).includes('meaning') && headers.length > 2) {
    const idx = headers.findIndex((_, i) => !mapping[i]);
    if (idx >= 0) mapping[idx] = 'meaning';
  }
  for (let i = 0; i < headers.length; i++) {
    if (!mapping[i]) mapping[i] = 'skip';
  }
  return mapping;
}

/** The id scheme before 2026-09: `[^\w]+` is ASCII-only, so every CJK title became `import-deck`. */
export function legacyDeckBookId(deckTitle: string): string {
  const slug = deckTitle
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `import-${slug || 'deck'}`;
}

/** FNV-1a over UTF-16 code units, as 8 hex digits. Stable across runs and platforms. */
function titleHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * A deck's group id, derived from its title.
 *
 * An all-ASCII title keeps the old slug, so decks imported before this change
 * still match on re-import. Any other title keeps its letters (`\p{L}` covers
 * kana and kanji) and adds a hash of the whole title, so two Japanese titles
 * never collapse onto one id the way `legacyDeckBookId` made them.
 */
export function deckBookId(deckTitle: string): string {
  const title = deckTitle.trim();
  // eslint-disable-next-line no-control-regex -- the ASCII range is the point
  if (/^[\x00-\x7F]*$/.test(title)) return legacyDeckBookId(title);
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `import-${Array.from(slug).slice(0, 24).join('') || 'deck'}-${titleHash(title)}`;
}

export function rowsToDeckEntries(
  table: CsvTable,
  mapping: DeckColumnMapping,
  deckTitle: string,
  source: ImportDeckSource = 'import',
): ImportDeckEntry[] {
  const t = normalizeTable(table);
  const title = deckTitle.trim() || 'Imported deck';
  const bookId = deckBookId(title);
  const out: ImportDeckEntry[] = [];

  for (const row of t.rows) {
    const fields: Partial<Record<DeckFieldKey, string>> = {};
    row.forEach((cell, colIndex) => {
      const key = mapping[colIndex] ?? 'skip';
      if (key === 'skip') return;
      const val = cell.trim();
      if (!val) return;
      fields[key] = fields[key] ? `${fields[key]}\n${val}` : val;
    });

    const word = fields.word || fields.front || '';
    if (!word.trim()) continue;

    const meaning = fields.meaning || fields.back || '';
    out.push({
      word: word.trim(),
      reading: (fields.reading ?? '').trim(),
      meaning: meaning.trim(),
      sentence: fields.sentence?.trim() || undefined,
      front: fields.front?.trim() || undefined,
      back: fields.back?.trim() || undefined,
      source,
      bookId,
      bookTitle: title,
    });
  }
  return out;
}

/** Plain text: one word per line, or tab-separated expression / reading / meaning. */
export function parsePlainTextImport(raw: string, deckTitle: string): ImportDeckEntry[] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const bookId = deckBookId(deckTitle);
  const title = deckTitle.trim() || 'Imported deck';
  return lines.map((line) => {
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim());
      if (parts.length >= 3) {
        return {
          word: parts[0],
          reading: parts[1],
          meaning: parts.slice(2).join(' ').trim(),
          source: 'import' as const,
          bookId,
          bookTitle: title,
        };
      }
      return {
        word: parts[0] ?? '',
        reading: '',
        meaning: parts[1] ?? '',
        source: 'import' as const,
        bookId,
        bookTitle: title,
      };
    }
    if (line.includes(',')) {
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        return {
          word: parts[0],
          reading: parts[1],
          meaning: parts.slice(2).join(', ').trim(),
          source: 'import' as const,
          bookId,
          bookTitle: title,
        };
      }
      if (parts.length === 2) {
        return {
          word: parts[0],
          reading: '',
          meaning: parts[1],
          source: 'import' as const,
          bookId,
          bookTitle: title,
        };
      }
    }
    return {
      word: line,
      reading: '',
      meaning: '',
      source: 'import' as const,
      bookId,
      bookTitle: title,
    };
  });
}
