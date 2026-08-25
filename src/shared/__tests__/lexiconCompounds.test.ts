import { describe, expect, it } from 'vitest';
import {
  containsCompoundQuery,
  selectLexiconCompounds,
  nextHeadwordScanChunk,
  HEADWORD_SCAN_CHUNK_ROWS,
  HEADWORD_SCAN_MIN_CHUNK_ROWS,
  HEADWORD_SCAN_WINDOW_TARGET_MS,
  type LexiconCompoundCandidate,
} from '../lexiconCompounds';

const candidate = (
  text: string,
  reading = '',
  over: Partial<LexiconCompoundCandidate> = {},
): LexiconCompoundCandidate => ({
  headwordId: 1,
  lang: 'ja',
  text,
  reading,
  dictId: 'jmdict-en',
  dictTitle: 'JMdict (English)',
  ...over,
});

describe('containsCompoundQuery', () => {
  it('applies the same NFKC + case fold the headword index is built on', () => {
    expect(containsCompoundQuery('子猫', '猫')).toBe(true);
    // Full-width Latin normalises to ASCII in `norm`, so a row the index matched
    // has to pass here too — testing the raw display string would reject it.
    expect(containsCompoundQuery('ＣＡＴｓ', 'cat')).toBe(true);
    expect(containsCompoundQuery('犬', '猫')).toBe(false);
  });

  it('refuses an empty needle rather than matching everything', () => {
    expect(containsCompoundQuery('子猫', '   ')).toBe(false);
  });
});

describe('selectLexiconCompounds', () => {
  // The SQL enforces the same containment rule, so this guard is the pure
  // function's own contract rather than a second filter. It is tested directly
  // because nothing routed through SQLite can ever exercise it.
  it('drops a candidate that does not contain the query', () => {
    const chosen = selectLexiconCompounds('猫', [candidate('犬'), candidate('子猫')]);
    expect(chosen.map((item) => item.text)).toEqual(['子猫']);
  });

  it('never returns the query itself', () => {
    const chosen = selectLexiconCompounds('猫', [
      candidate('猫', 'ねこ'),
      // A katakana spelling of the query never reaches the exclusion — it does
      // not contain the query, so containment drops it first. Asserted so the
      // exclusion is not credited with work the filter above it does.
      candidate('ネコ', 'ネコ'),
      candidate('子猫', 'こねこ'),
    ]);
    expect(chosen.map((item) => item.text)).toEqual(['子猫']);
  });

  // This is what the folded key is actually for, and a plain `===` fails it.
  it('excludes a spelling of the query that differs only in width or case', () => {
    expect(selectLexiconCompounds('猫', [candidate('　猫　'.trim())]).map((i) => i.text)).toEqual([]);
    expect(selectLexiconCompounds('cat', [candidate('ＣＡＴ'), candidate('cats')])
      .map((item) => item.text)).toEqual(['cats']);
  });

  it('collapses one word supplied by two dictionaries, keeping the first', () => {
    const chosen = selectLexiconCompounds('猫', [
      candidate('子猫', 'こねこ', { headwordId: 7, dictId: 'jmdict-en', dictTitle: 'JMdict (English)' }),
      candidate('子猫', 'こねこ', { headwordId: 9, dictId: 'jmdict-ru', dictTitle: 'JMdict (Russian)' }),
    ]);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].dictTitle).toBe('JMdict (English)');
  });

  it('keeps two spellings of the same reading apart', () => {
    const chosen = selectLexiconCompounds('猫', [
      candidate('子猫', 'こねこ'),
      candidate('仔猫', 'こねこ'),
    ]);
    expect(chosen.map((item) => item.text)).toEqual(['子猫', '仔猫']);
  });

  it('preserves the order it was given, which is the database’s own ranking', () => {
    const chosen = selectLexiconCompounds('猫', [
      candidate('愛猫'), candidate('子猫'), candidate('猫背'),
    ]);
    expect(chosen.map((item) => item.text)).toEqual(['愛猫', '子猫', '猫背']);
  });

  it('stops at the requested limit and clamps a nonsense one', () => {
    const many = ['子猫', '猫背', '愛猫', '山猫'].map((text) => candidate(text));
    expect(selectLexiconCompounds('猫', many, 2).map((item) => item.text)).toEqual(['子猫', '猫背']);
    expect(selectLexiconCompounds('猫', many, 0)).toHaveLength(1);
    expect(selectLexiconCompounds('猫', many, 999)).toHaveLength(4);
  });
});

/**
 * The headword scan's window is sized by measured wall time, not by rows, because
 * a row budget cannot bound a block: 5,000 rows held the worst window to 47.9 ms
 * out of process and to 2,035 / 1,912 / 1,781 ms inside the running app on three
 * separate boots. What varies is page residency per row, which no row count holds
 * constant.
 */
describe('the scan window resizes itself against its own wall clock', () => {
  it('halves after an overrun and keeps halving, but never below the floor', () => {
    expect(nextHeadwordScanChunk(4000, HEADWORD_SCAN_WINDOW_TARGET_MS + 1)).toBe(2000);
    expect(nextHeadwordScanChunk(2000, 900)).toBe(1000);
    // Six more halvings from 1000 would reach 15; the floor stops it at 250 and
    // then holds, so a permanently slow disk cannot drive the window to nothing.
    let chunk = 1000;
    for (let i = 0; i < 8; i += 1) chunk = nextHeadwordScanChunk(chunk, 900);
    expect(chunk).toBe(HEADWORD_SCAN_MIN_CHUNK_ROWS);
  });

  it('grows back on a warm cache, and stops at the measured ceiling', () => {
    expect(nextHeadwordScanChunk(HEADWORD_SCAN_MIN_CHUNK_ROWS, 0)).toBe(500);
    let chunk = HEADWORD_SCAN_MIN_CHUNK_ROWS;
    for (let i = 0; i < 20; i += 1) chunk = nextHeadwordScanChunk(chunk, 1);
    expect(chunk).toBe(HEADWORD_SCAN_CHUNK_ROWS);
  });

  it('holds still inside the dead band, which is what stops it oscillating', () => {
    // Under target but not comfortably under: growing here is what produces a
    // long window every other turn.
    const justUnder = HEADWORD_SCAN_WINDOW_TARGET_MS - 1;
    expect(justUnder * 2).toBeGreaterThan(HEADWORD_SCAN_WINDOW_TARGET_MS);
    expect(nextHeadwordScanChunk(1000, justUnder)).toBe(1000);
    expect(nextHeadwordScanChunk(1000, HEADWORD_SCAN_WINDOW_TARGET_MS)).toBe(1000);
  });
});
