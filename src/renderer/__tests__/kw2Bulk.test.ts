// @vitest-environment jsdom
/** kw2 — the known-words store in bulk: parsing imports, filtering, exporting, coverage, and the store's bulk writes. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_KNOWLEDGE_FILTER,
  exportKnowledgeRows,
  filterKnowledgeRows,
  frequencyCoverage,
  knowledgeRowStats,
  parseKnownWordsImport,
  type KnowledgeRow,
} from '../knownWordsBulk';
import {
  bulkClearManual,
  bulkSetLevels,
  getLevel,
  importKnownWords,
  isManualLevel,
  listKnowledgeEntries,
  onKnowledgeChanged,
  resetKnownWordsCacheForTests,
  setLevel,
} from '../knownWords';

describe('parseKnownWordsImport', () => {
  it('reads a plain list, first tokens only, deduplicated', () => {
    expect(parseKnownWordsImport('\uFEFF食べる\n飲む to drink\n\n食べる\n')).toEqual(['食べる', '飲む']);
  });

  it('reads the first column of CSV (quoted) and TSV, skipping a header row', () => {
    expect(parseKnownWordsImport('word,level\n"猫",known\n"犬, dog",familiar')).toEqual(['猫', '犬']);
    expect(parseKnownWordsImport('Expression\tMeaning\n本\tbook')).toEqual(['本']);
  });

  it('reads an Anki notes export: header lines, HTML, sound tags and furigana', () => {
    const anki = [
      '#separator:tab',
      '#html:true',
      '#notetype column:1',
      '<b>食[た]べる</b>[sound:taberu.mp3]\tto eat',
      '図書館[としょかん]\tlibrary',
      '&nbsp;水\twater',
    ].join('\n');
    expect(parseKnownWordsImport(anki)).toEqual(['食べる', '図書館', '水']);
  });
});

describe('filterKnowledgeRows', () => {
  const rows: KnowledgeRow[] = [
    { word: '猫', level: 3, manual: true },
    { word: '犬', level: 2, manual: false },
    { word: '鳥', level: 1, manual: false },
    { word: '魚', level: 0, manual: true },
    { word: '猫背', level: 1, manual: true },
  ];
  const lists = new Map([['n5', new Set(['猫', '犬'])]]);

  it('filters by level, pinned-new, source, list and search, highest level first', () => {
    const f = (patch: Partial<typeof DEFAULT_KNOWLEDGE_FILTER>) =>
      filterKnowledgeRows(rows, { ...DEFAULT_KNOWLEDGE_FILTER, ...patch }, lists).map((r) => r.word);
    expect(f({})).toEqual(['猫', '犬', '猫背', '鳥', '魚']);
    expect(f({ level: 'learning' })).toEqual(['猫背', '鳥']);
    expect(f({ level: 'pinnedNew' })).toEqual(['魚']);
    expect(f({ source: 'auto' })).toEqual(['犬', '鳥']);
    expect(f({ list: 'n5' })).toEqual(['猫', '犬']);
    expect(f({ list: 'none', source: 'manual' })).toEqual(['猫背', '魚']);
    expect(f({ search: '猫' })).toEqual(['猫', '猫背']);
  });

  it('counts by level and source', () => {
    expect(knowledgeRowStats(rows)).toEqual({ learning: 2, familiar: 1, known: 1, pinnedNew: 1, manual: 3, auto: 2 });
  });
});

describe('exportKnowledgeRows', () => {
  it('writes a re-importable text list and CSV', () => {
    const rows: KnowledgeRow[] = [
      { word: '猫', level: 3, manual: true },
      { word: 'a,b', level: 1, manual: false },
    ];
    expect(exportKnowledgeRows(rows, 'txt')).toBe('猫\na,b\n');
    const csv = exportKnowledgeRows(rows, 'csv');
    expect(csv).toBe('word,level,source\n猫,known,manual\n"a,b",learning,auto\n');
    expect(parseKnownWordsImport(csv)).toEqual(['猫', 'a,b']);
  });
});

describe('frequencyCoverage', () => {
  const rows: KnowledgeRow[] = [
    { word: 'a', level: 3, manual: false },
    { word: 'b', level: 2, manual: false },
    { word: 'c', level: 1, manual: false },
    { word: 'd', level: 3, manual: false },
  ];

  it('counts Familiar-or-better words within each top-N band', () => {
    const bands = frequencyCoverage(rows, { a: 10, b: 3_000, c: 20, d: 50_000 }, [1_000, 5_000]);
    expect(bands).toEqual([
      { band: 1_000, known: 1, share: 0.001 },
      { band: 5_000, known: 2, share: 0.0004 },
    ]);
  });

  it('says nothing when no word has a rank, and never exceeds 100%', () => {
    expect(frequencyCoverage(rows, {})).toBeNull();
    expect(frequencyCoverage(rows, { a: 1, b: 1, d: 1 }, [2])?.[0].share).toBe(1);
  });
});

describe('knownWords bulk writes', () => {
  beforeEach(() => {
    localStorage.clear();
    resetKnownWordsCacheForTests();
  });

  it('sets many words by hand in one change event', () => {
    const heard = vi.fn();
    const off = onKnowledgeChanged(heard);
    expect(bulkSetLevels(['猫', '犬', ' '], 3)).toBe(2);
    off();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0][0]).toEqual(['猫', '犬']);
    expect(getLevel('猫')).toBe(3);
    expect(isManualLevel('犬')).toBe(true);
    expect(bulkSetLevels(['猫'], 3)).toBe(0);
  });

  it('hands words back to automatic grading, dropping a pinned New', () => {
    bulkSetLevels(['猫'], 2);
    setLevel('魚', 0, true);
    expect(bulkClearManual(['猫', '魚', '鳥'])).toBe(2);
    expect(isManualLevel('猫')).toBe(false);
    expect(getLevel('猫')).toBe(2);
    expect(listKnowledgeEntries().map((e) => e.word)).toEqual(['猫']);
  });

  it('imports without ever lowering a level', () => {
    setLevel('猫', 3, false);
    setLevel('犬', 1, false);
    expect(importKnownWords(['猫', '犬', '鳥', '鳥'], 2)).toEqual({ added: 1, raised: 1, kept: 1 });
    expect(getLevel('猫')).toBe(3);
    expect(isManualLevel('猫')).toBe(false);
    expect(getLevel('犬')).toBe(2);
    expect(isManualLevel('鳥')).toBe(true);
  });

  it('lists pinned New entries with their source', () => {
    setLevel('魚', 0, true);
    setLevel('猫', 2, false);
    expect(listKnowledgeEntries()).toEqual([
      { word: '魚', level: 0, manual: true },
      { word: '猫', level: 2, manual: false },
    ]);
  });
});
