import { describe, expect, it } from 'vitest';
import { normalizeReadingLensCapture } from '../readingLens';
import {
  READING_LENS_HISTORY_LIMIT,
  normalizeReadingLensHistory,
  readingLensHistoryEntryOf,
  recordReadingLensHistory,
  removeReadingLensHistoryEntry,
  searchReadingLensHistory,
  type ReadingLensHistoryEntry,
} from '../readingLensHistory';

const capture = (patch: Record<string, unknown> = {}) => {
  const value = normalizeReadingLensCapture({
    captureId: 'cap-1',
    source: 'screen',
    sourceLabel: 'Steam — VN',
    sourceRef: 'game://vn/ch1',
    capturedAt: 1_700_000_000_000,
    language: 'ja',
    engine: 'auto',
    hash: 'h1',
    text: 'これは テスト です',
    lines: [{ text: 'これは テスト です', box: [0, 0, 100, 20] }],
    ...patch,
  });
  if (!value) throw new Error('fixture capture failed to normalize');
  return value;
};

const entry = (patch: Partial<ReadingLensHistoryEntry> = {}): ReadingLensHistoryEntry => {
  const built = readingLensHistoryEntryOf(capture());
  if (!built) throw new Error('fixture entry failed to build');
  return { ...built, ...patch };
};

describe('Reading Lens history — entry projection', () => {
  it('drops the screenshot, which is the whole privacy contract of the store', () => {
    const built = readingLensHistoryEntryOf(
      capture({ screenshotDataUrl: `data:image/jpeg;base64,${'A'.repeat(2_000)}` }),
    );

    if (!built) throw new Error('expected an entry');
    expect(Object.keys(built)).not.toContain('screenshotDataUrl');
    expect(JSON.stringify(built)).not.toContain('data:image');
  });

  it('keeps the line count but not the lines', () => {
    const built = readingLensHistoryEntryOf(capture());
    expect(built?.lineCount).toBe(1);
    expect(built).not.toHaveProperty('lines');
  });

  it('refuses a capture with no text — an empty row is not worth a slot', () => {
    // `normalizeReadingLensCapture` already rejects this, so the only way in is a
    // hand-built envelope; the guard exists because the IPC edge is not the only
    // caller of the projection.
    expect(readingLensHistoryEntryOf({ ...capture(), text: '   ' })).toBeNull();
  });

  it('starts a fresh capture at one sighting', () => {
    expect(readingLensHistoryEntryOf(capture())?.seenCount).toBe(1);
  });
});

describe('Reading Lens history — record', () => {
  it('puts a new capture at the front', () => {
    const first = entry({ captureId: 'a', hash: 'ha' });
    const second = entry({ captureId: 'b', hash: 'hb', text: 'second' });

    const list = recordReadingLensHistory(recordReadingLensHistory([], first), second);

    expect(list.map((item) => item.captureId)).toEqual(['b', 'a']);
  });

  it('merges a repeat of the same capture id rather than duplicating it', () => {
    const first = entry({ captureId: 'a', hash: 'ha', capturedAt: 1_000 });
    const again = entry({ captureId: 'a', hash: 'ha', capturedAt: 5_000 });

    const list = recordReadingLensHistory(recordReadingLensHistory([], first), again);

    expect(list).toHaveLength(1);
    expect(list[0].seenCount).toBe(2);
    expect(list[0].capturedAt).toBe(5_000);
  });

  it('merges on hash too, so two scans of identical text agree', () => {
    const first = entry({ captureId: 'a', hash: 'same', capturedAt: 1_000 });
    const rescan = entry({ captureId: 'b', hash: 'same', capturedAt: 9_000 });

    const list = recordReadingLensHistory(recordReadingLensHistory([], first), rescan);

    expect(list).toHaveLength(1);
    // The original id wins so an already-rendered row does not change identity.
    expect(list[0].captureId).toBe('a');
    expect(list[0].seenCount).toBe(2);
  });

  it('does not merge unrelated captures that both have an empty hash', () => {
    const first = entry({ captureId: 'a', hash: '' });
    const second = entry({ captureId: 'b', hash: '', text: 'other' });

    const list = recordReadingLensHistory(recordReadingLensHistory([], first), second);

    expect(list).toHaveLength(2);
  });

  it('adopts the newer text on a merge, which is how a correction reaches the store', () => {
    const first = entry({ captureId: 'a', hash: 'ha', text: 'ヲレは' });
    const corrected = entry({ captureId: 'a', hash: 'ha', text: '俺は' });

    const list = recordReadingLensHistory(recordReadingLensHistory([], first), corrected);

    expect(list[0].text).toBe('俺は');
  });

  it('is a ring, not an archive — the oldest falls off at the limit', () => {
    let list: ReadingLensHistoryEntry[] = [];
    for (let i = 0; i < READING_LENS_HISTORY_LIMIT + 10; i += 1) {
      list = recordReadingLensHistory(
        list,
        entry({ captureId: `c-${i}`, hash: `h-${i}`, capturedAt: 1_000 + i }),
      );
    }

    expect(list).toHaveLength(READING_LENS_HISTORY_LIMIT);
    expect(list[0].captureId).toBe(`c-${READING_LENS_HISTORY_LIMIT + 9}`);
    expect(list.some((item) => item.captureId === 'c-0')).toBe(false);
  });

  it('never exceeds the hard limit even when handed a larger one', () => {
    let list: ReadingLensHistoryEntry[] = [];
    for (let i = 0; i < READING_LENS_HISTORY_LIMIT + 5; i += 1) {
      list = recordReadingLensHistory(list, entry({ captureId: `c-${i}`, hash: `h-${i}` }), 10_000);
    }

    expect(list.length).toBeLessThanOrEqual(READING_LENS_HISTORY_LIMIT);
  });
});

describe('Reading Lens history — normalize from disk', () => {
  it('reads both the bare array and the versioned envelope', () => {
    const rows = [entry({ captureId: 'a', hash: 'ha' })];

    expect(normalizeReadingLensHistory(rows)).toHaveLength(1);
    expect(normalizeReadingLensHistory({ schemaVersion: 1, entries: rows })).toHaveLength(1);
  });

  it('degrades a corrupt file to the entries that survive, not to nothing', () => {
    const good = entry({ captureId: 'a', hash: 'ha' });

    const list = normalizeReadingLensHistory([
      null,
      'nonsense',
      { captureId: 'no-text', capturedAt: 1, text: '' },
      { captureId: '', capturedAt: 1, text: 'orphan' },
      good,
    ]);

    expect(list.map((item) => item.captureId)).toEqual(['a']);
  });

  it('returns newest first regardless of the order on disk', () => {
    const list = normalizeReadingLensHistory([
      entry({ captureId: 'old', hash: 'h1', capturedAt: 1_000 }),
      entry({ captureId: 'new', hash: 'h2', capturedAt: 9_000 }),
    ]);

    expect(list.map((item) => item.captureId)).toEqual(['new', 'old']);
  });

  it('falls back to a known source and engine rather than trusting the file', () => {
    const list = normalizeReadingLensHistory([
      { ...entry({ captureId: 'a' }), source: 'evil', engine: 'evil' },
    ]);

    expect(list[0].source).toBe('screen');
    expect(list[0].engine).toBe('auto');
  });

  it('collapses duplicate ids, keeping the newer sighting', () => {
    const list = normalizeReadingLensHistory([
      entry({ captureId: 'a', hash: 'ha', capturedAt: 1_000, text: 'old' }),
      entry({ captureId: 'a', hash: 'ha', capturedAt: 8_000, text: 'new' }),
    ]);

    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('new');
  });
});

describe('Reading Lens history — search', () => {
  const corpus = [
    entry({ captureId: 'a', hash: 'ha', text: 'カタカナの行', sourceLabel: 'YouTube', source: 'screen' }),
    entry({ captureId: 'b', hash: 'hb', text: 'plain english line', sourceLabel: '', source: 'clipboard' }),
    entry({ captureId: 'c', hash: 'hc', text: '漢字の勉強', sourceRef: 'file:///d/manga.cbz', source: 'image' }),
  ];

  it('returns everything for an empty query', () => {
    expect(searchReadingLensHistory(corpus)).toHaveLength(3);
  });

  it('matches a substring, since Japanese has no word boundary to tokenize on', () => {
    expect(searchReadingLensHistory(corpus, { query: '勉強' }).map((e) => e.captureId)).toEqual(['c']);
  });

  it('folds case', () => {
    expect(searchReadingLensHistory(corpus, { query: 'ENGLISH' }).map((e) => e.captureId)).toEqual(['b']);
  });

  it('folds width, so a halfwidth query finds a fullwidth capture', () => {
    expect(searchReadingLensHistory(corpus, { query: 'ｶﾀｶﾅ' }).map((e) => e.captureId)).toEqual(['a']);
  });

  it('searches the source label and ref, not just the text', () => {
    expect(searchReadingLensHistory(corpus, { query: 'youtube' }).map((e) => e.captureId)).toEqual(['a']);
    expect(searchReadingLensHistory(corpus, { query: 'manga.cbz' }).map((e) => e.captureId)).toEqual(['c']);
  });

  it('filters by source, and treats "all" as no filter', () => {
    expect(searchReadingLensHistory(corpus, { source: 'clipboard' }).map((e) => e.captureId)).toEqual(['b']);
    expect(searchReadingLensHistory(corpus, { source: 'all' })).toHaveLength(3);
  });

  it('honours a limit and clamps a hostile one', () => {
    expect(searchReadingLensHistory(corpus, { limit: 2 })).toHaveLength(2);
    expect(searchReadingLensHistory(corpus, { limit: 1e9 })).toHaveLength(3);
  });
});

describe('Reading Lens history — remove', () => {
  it('forgets one capture by id', () => {
    const list = removeReadingLensHistoryEntry(
      [entry({ captureId: 'a', hash: 'ha' }), entry({ captureId: 'b', hash: 'hb' })],
      'a',
    );

    expect(list.map((item) => item.captureId)).toEqual(['b']);
  });

  it('returns the same reference when nothing matched, so callers can skip a write', () => {
    const before = [entry({ captureId: 'a', hash: 'ha' })];

    expect(removeReadingLensHistoryEntry(before, 'missing')).toBe(before);
    expect(removeReadingLensHistoryEntry(before, '')).toBe(before);
  });
});
