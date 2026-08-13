import { describe, expect, it } from 'vitest';
import { isDictionaryImportTerminal, type DictionaryImportJobSnapshot } from '../dictionaryImportJob';

describe('dictionary import job contract', () => {
  it('does not mistake progress for a terminal result', () => {
    const snapshot: DictionaryImportJobSnapshot = {
      jobId: 'job-1', kind: 'cedict', status: 'running',
      progress: { jobId: 'job-1', kind: 'cedict', lines: 20, phase: 'importing' },
    };
    expect(isDictionaryImportTerminal(snapshot)).toBe(false);
  });

  it('requires an explicit committed, cancelled, or failed terminal state', () => {
    const states: DictionaryImportJobSnapshot[] = [
      { jobId: 'a', kind: 'cedict', status: 'committed', terminal: { state: 'committed', counts: { entries: 2 } } },
      { jobId: 'b', kind: 'wiktextract', status: 'cancelled', terminal: { state: 'cancelled', counts: {} } },
      { jobId: 'c', kind: 'legacy', status: 'failed', terminal: { state: 'failed', error: 'read failed' } },
    ];
    expect(states.every(isDictionaryImportTerminal)).toBe(true);
  });
});
