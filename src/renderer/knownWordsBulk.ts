/**
 * Pure helpers behind the known-words manager (kw2): parsing an imported word
 * list, filtering the store, exporting it, and measuring how much of a frequency
 * list the learner knows.
 *
 * Kept apart from `knownWords.ts` so the store stays the store, and so each rule
 * here is testable with plain data.
 */
import type { WkLevel } from './knownWords';

export interface KnowledgeRow {
  word: string;
  level: WkLevel;
  manual: boolean;
}

/** A header cell that names the column rather than holding a word. */
const HEADER_CELL = /^(word|words|expression|term|vocab(ulary)?|front|lemma|単語|語彙|表記|词|词语|слово)$/i;

/** One CSV/TSV line split into cells, honouring "quoted, cells" and "" escapes. */
function splitCells(line: string, separator: string): string[] {
  if (separator !== ',' || !line.includes('"')) return line.split(separator);
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

function cleanCell(cell: string): string {
  return cell
    .replace(/\[sound:[^\]]*\]/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // Anki furigana: 食[た]べる → 食べる (a reading in brackets after a kanji run).
    .replace(/ ?\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words from an imported list: a plain list (one per line), CSV/TSV (first
 * column), or an Anki "Notes in Plain Text" export (`#separator:` / `#html:`
 * header lines, HTML, `[sound:]` tags and furigana brackets in the field). The
 * word is the first cell's first whitespace token. A header row is skipped,
 * duplicates are dropped, order is kept.
 */
export function parseKnownWordsImport(raw: string): string[] {
  const text = raw.replace(/^\uFEFF/, '');
  let separator: string | null = null;
  const seen = new Set<string>();
  const out: string[] = [];
  let first = true;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const header = /^#separator:(.+)$/i.exec(line.trim());
    if (header) {
      const name = header[1].trim().toLowerCase();
      separator = name === 'tab' ? '\t' : name === 'comma' ? ',' : name === 'semicolon' ? ';' : name === 'space' ? ' ' : name === 'pipe' ? '|' : name;
      continue;
    }
    if (line.startsWith('#')) continue;
    const sep = separator ?? (line.includes('\t') ? '\t' : line.includes(',') ? ',' : line.includes(';') ? ';' : null);
    const cell = cleanCell(sep ? splitCells(line, sep)[0] ?? '' : line);
    // First token, without a list separator left hanging on it ("犬, dog" → 犬).
    const word = (cell.split(/\s+/)[0] ?? '').replace(/[,;、，；。]+$/, '');
    const isHeader = first && HEADER_CELL.test(word);
    first = false;
    if (!word || isHeader || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

export type KnowledgeLevelFilter = 'all' | 'learning' | 'familiar' | 'known' | 'pinnedNew';
export type KnowledgeSourceFilter = 'all' | 'manual' | 'auto';

export interface KnowledgeFilter {
  level: KnowledgeLevelFilter;
  source: KnowledgeSourceFilter;
  /** A level-list id, `none` (on no list), or `all`. */
  list: string;
  search: string;
}

export const DEFAULT_KNOWLEDGE_FILTER: KnowledgeFilter = { level: 'all', source: 'all', list: 'all', search: '' };

const LEVEL_OF: Record<Exclude<KnowledgeLevelFilter, 'all' | 'pinnedNew'>, WkLevel> = {
  learning: 1,
  familiar: 2,
  known: 3,
};

/**
 * Rows matching every axis, sorted by level (highest first) then word. `lists`
 * maps a level-list id to its words as store keys (`levelListWordKeys`).
 */
export function filterKnowledgeRows(
  rows: readonly KnowledgeRow[],
  filter: KnowledgeFilter,
  lists: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): KnowledgeRow[] {
  const q = filter.search.trim().normalize('NFKC').toLowerCase();
  const onAnyList = (word: string): boolean => [...lists.values()].some((set) => set.has(word));
  return rows
    .filter((row) => {
      if (filter.level === 'pinnedNew') {
        if (!(row.level === 0 && row.manual)) return false;
      } else if (filter.level !== 'all') {
        if (row.level !== LEVEL_OF[filter.level]) return false;
      }
      if (filter.source === 'manual' && !row.manual) return false;
      if (filter.source === 'auto' && row.manual) return false;
      if (filter.list === 'none') {
        if (onAnyList(row.word)) return false;
      } else if (filter.list !== 'all') {
        if (!lists.get(filter.list)?.has(row.word)) return false;
      }
      if (q && !row.word.normalize('NFKC').toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.level - a.level || a.word.localeCompare(b.word));
}

/** Counts by level and by source, for the manager's summary. */
export function knowledgeRowStats(rows: readonly KnowledgeRow[]): {
  learning: number;
  familiar: number;
  known: number;
  pinnedNew: number;
  manual: number;
  auto: number;
} {
  const out = { learning: 0, familiar: 0, known: 0, pinnedNew: 0, manual: 0, auto: 0 };
  for (const row of rows) {
    if (row.level === 1) out.learning += 1;
    else if (row.level === 2) out.familiar += 1;
    else if (row.level === 3) out.known += 1;
    else if (row.manual) out.pinnedNew += 1;
    if (row.manual) out.manual += 1;
    else out.auto += 1;
  }
  return out;
}

const LEVEL_NAME: Record<WkLevel, string> = { 0: 'new', 1: 'learning', 2: 'familiar', 3: 'known' };

/**
 * The store as a file: `txt` is one word per line (re-importable anywhere);
 * `csv` is word,level,source with a header (re-importable here — the importer
 * skips the header row and reads the first column).
 */
export function exportKnowledgeRows(rows: readonly KnowledgeRow[], format: 'txt' | 'csv'): string {
  if (format === 'txt') return `${rows.map((row) => row.word).join('\n')}\n`;
  const quote = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = rows.map((row) => `${quote(row.word)},${LEVEL_NAME[row.level]},${row.manual ? 'manual' : 'auto'}`);
  return `word,level,source\n${lines.join('\n')}\n`;
}

/** The frequency bands coverage is reported for. */
export const COVERAGE_BANDS = [1_000, 5_000, 10_000, 20_000] as const;

export interface CoverageBand {
  band: number;
  /** Words at Familiar or better whose rank is within the band. */
  known: number;
  /** `known / band`, capped at 1 (a corpus may give two spellings one rank). */
  share: number;
}

/**
 * How much of each top-N frequency band the learner knows (Familiar or better —
 * the level lists' "learned" threshold). `ranks` maps a word to its best corpus
 * rank; a word no corpus ranks is simply not counted. Null when no word has a
 * rank at all — there is then no frequency list to measure against, and 0%
 * would claim the learner knows none of one.
 */
export function frequencyCoverage(
  rows: readonly KnowledgeRow[],
  ranks: Readonly<Record<string, number>>,
  bands: readonly number[] = COVERAGE_BANDS,
): CoverageBand[] | null {
  if (!Object.keys(ranks).length) return null;
  const knownRanks = rows
    .filter((row) => row.level >= 2)
    .map((row) => ranks[row.word])
    .filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank) && rank >= 1);
  return bands.map((band) => {
    const known = knownRanks.filter((rank) => rank <= band).length;
    return { band, known, share: Math.min(1, known / band) };
  });
}
