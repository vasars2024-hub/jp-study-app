import { describe, expect, it } from 'vitest';
import type { DictionaryImportJobSnapshot } from '../../shared/dictionaryImportJob';
import { dictionaryImportStatusKey } from '../components/settings/pages/DictionaryImportCard';

describe('DictionaryImportCard status presentation', () => {
  it('distinguishes recoverable running phases from terminal outcomes', () => {
    const running: DictionaryImportJobSnapshot = {
      jobId: 'job-1',
      kind: 'cedict',
      status: 'running',
      progress: { jobId: 'job-1', kind: 'cedict', phase: 'committing', lines: 42 },
    };
    expect(dictionaryImportStatusKey(running)).toBe('storage.dictionaryImport.phase.committing');
    expect(dictionaryImportStatusKey({
      jobId: 'job-1',
      kind: 'cedict',
      status: 'cancelled',
      terminal: { state: 'cancelled', counts: { entries: 2 } },
    })).toBe('storage.dictionaryImport.status.cancelled');
    expect(dictionaryImportStatusKey(null)).toBe('storage.dictionaryImport.idle');
  });
});
