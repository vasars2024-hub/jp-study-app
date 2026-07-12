import { describe, expect, it } from 'vitest';
import { analyzeCsvPaste } from '../csvPaste';

describe('analyzeCsvPaste', () => {
  it('normalizes line endings and counts rows/columns', () => {
    const raw = 'a,b,c\r\n1,2,3\r\n4,5,6\r\n';
    const stats = analyzeCsvPaste(raw);
    expect(stats.rows).toBe(3);
    expect(stats.columns).toBe(3);
    expect(stats.delimiter).toBe(',');
    expect(stats.normalized).toBe('a,b,c\n1,2,3\n4,5,6');
  });

  it('detects tab delimiter', () => {
    const stats = analyzeCsvPaste('word\treading\tmeaning\n本\tほん\tbook');
    expect(stats.delimiter).toBe('\t');
    expect(stats.columns).toBe(3);
  });
});
