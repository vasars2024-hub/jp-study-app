import { describe, expect, it } from 'vitest';
import {
  ConsoleBuffer,
  atLeastLevel,
  countByLevel,
  detailToText,
  filterEntries,
  formatEntriesForReport,
  type ConsoleEntry,
} from '../blancConsole';

function entry(over: Partial<ConsoleEntry> = {}): ConsoleEntry {
  return {
    id: 1,
    at: Date.UTC(2026, 6, 21, 12, 0, 0),
    level: 'info',
    category: 'mining',
    message: 'mined a card',
    ...over,
  };
}

describe('ConsoleBuffer', () => {
  it('assigns ids and timestamps', () => {
    const b = new ConsoleBuffer();
    const a = b.push({ level: 'info', category: 'deck', message: 'one' });
    const c = b.push({ level: 'info', category: 'deck', message: 'two' });
    expect(a.id).toBe(1);
    expect(c.id).toBe(2);
    expect(typeof a.at).toBe('number');
  });

  it('honours a supplied timestamp', () => {
    const b = new ConsoleBuffer();
    expect(b.push({ level: 'info', category: 'ui', message: 'x', at: 123 }).at).toBe(123);
  });

  it('lists newest first', () => {
    const b = new ConsoleBuffer();
    b.push({ level: 'info', category: 'deck', message: 'first' });
    b.push({ level: 'info', category: 'deck', message: 'second' });
    expect(b.list().map((e) => e.message)).toEqual(['second', 'first']);
  });

  it('drops oldest-first at capacity and counts the loss', () => {
    const b = new ConsoleBuffer(3);
    for (const m of ['a', 'b', 'c', 'd', 'e']) b.push({ level: 'info', category: 'ui', message: m });
    expect(b.size).toBe(3);
    expect(b.list().map((e) => e.message)).toEqual(['e', 'd', 'c']);
    // A log that silently loses its head is worse than one that admits it.
    expect(b.droppedCount).toBe(2);
  });

  it('keeps ids monotonic across a drop, so nothing looks reused', () => {
    const b = new ConsoleBuffer(2);
    for (const m of ['a', 'b', 'c']) b.push({ level: 'info', category: 'ui', message: m });
    expect(b.list().map((e) => e.id)).toEqual([3, 2]);
  });

  it('clear resets entries and the dropped count', () => {
    const b = new ConsoleBuffer(1);
    b.push({ level: 'info', category: 'ui', message: 'a' });
    b.push({ level: 'info', category: 'ui', message: 'b' });
    expect(b.droppedCount).toBe(1);
    b.clear();
    expect(b.size).toBe(0);
    expect(b.droppedCount).toBe(0);
  });
});

describe('detailToText', () => {
  it('passes strings through and serialises objects', () => {
    expect(detailToText('hello')).toBe('hello');
    expect(detailToText({ a: 1 })).toBe('{"a":1}');
  });

  it('returns empty for nothing', () => {
    expect(detailToText(undefined)).toBe('');
    expect(detailToText(null)).toBe('');
  });

  it('survives a circular structure rather than throwing', () => {
    // Event/DOM payloads are commonly circular, and the log exists to record them.
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(() => detailToText(circular)).not.toThrow();
    expect(detailToText(circular)).toBeTypeOf('string');
  });
});

describe('filterEntries', () => {
  const entries = [
    entry({ id: 1, category: 'mining', level: 'info', message: 'mined 日本語' }),
    entry({ id: 2, category: 'deck', level: 'error', message: 'deck write failed' }),
    entry({ id: 3, category: 'anki', level: 'warn', message: 'anki offline', detail: { port: 8765 } }),
  ];

  it('returns everything for an empty filter', () => {
    expect(filterEntries(entries, {})).toHaveLength(3);
  });

  it('filters by category and by level', () => {
    expect(filterEntries(entries, { categories: ['deck'] }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(entries, { levels: ['warn', 'error'] }).map((e) => e.id)).toEqual([2, 3]);
  });

  it('searches message, category, and serialised detail', () => {
    expect(filterEntries(entries, { query: 'failed' }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(entries, { query: 'anki' }).map((e) => e.id)).toEqual([3]);
    // The port only exists inside the detail payload.
    expect(filterEntries(entries, { query: '8765' }).map((e) => e.id)).toEqual([3]);
  });

  it('searches case-insensitively and matches Japanese', () => {
    expect(filterEntries(entries, { query: 'MINED' }).map((e) => e.id)).toEqual([1]);
    expect(filterEntries(entries, { query: '日本語' }).map((e) => e.id)).toEqual([1]);
  });

  it('combines filters', () => {
    expect(filterEntries(entries, { levels: ['error'], query: 'deck' }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(entries, { categories: ['mining'], query: 'anki' })).toEqual([]);
  });
});

describe('countByLevel / atLeastLevel', () => {
  it('counts every level, including zeroes', () => {
    expect(countByLevel([entry({ level: 'error' }), entry({ level: 'error' }), entry({ level: 'info' })])).toEqual({
      debug: 0, info: 1, warn: 0, error: 2,
    });
  });

  it('ranks severity', () => {
    expect(atLeastLevel(entry({ level: 'error' }), 'warn')).toBe(true);
    expect(atLeastLevel(entry({ level: 'info' }), 'warn')).toBe(false);
    expect(atLeastLevel(entry({ level: 'warn' }), 'warn')).toBe(true);
  });
});

describe('formatEntriesForReport', () => {
  it('renders a readable line per entry', () => {
    const text = formatEntriesForReport([entry({ level: 'error', message: 'boom' })]);
    expect(text).toContain('ERROR');
    expect(text).toContain('mining');
    expect(text).toContain('boom');
    expect(text).toContain('2026-07-21T12:00:00.000Z');
  });

  it('includes the correlation id and detail when present', () => {
    const text = formatEntriesForReport([entry({ correlationId: 'mine-7', detail: { deck: 'Core' } })]);
    expect(text).toContain('[mine-7]');
    expect(text).toContain('"deck":"Core"');
  });

  it('handles an empty log', () => {
    expect(formatEntriesForReport([])).toBe('');
  });
});
