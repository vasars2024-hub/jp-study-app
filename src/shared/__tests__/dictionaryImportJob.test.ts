import { describe, expect, it } from 'vitest';
import {
  isDictionaryImportTerminal,
  normalizeDictionaryImportJobSnapshot,
  normalizeDictionaryImportRequest,
  type DictionaryImportJobSnapshot,
} from '../dictionaryImportJob';

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

  it('rejects mismatched progress and terminal payloads', () => {
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-1', kind: 'cedict', status: 'running',
      progress: { jobId: 'other', kind: 'cedict', lines: 2, phase: 'reading' },
    })).toBeNull();
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-2', kind: 'wiktextract', status: 'committed',
      terminal: { state: 'failed', error: 'nope' },
    })).toBeNull();
  });

  it('normalizes a valid worker snapshot', () => {
    const snapshot = normalizeDictionaryImportJobSnapshot({
      jobId: 'job-3', kind: 'legacy', status: 'failed',
      progress: { jobId: 'job-3', kind: 'legacy', lines: 4, phase: 'committing' },
      terminal: { state: 'failed', error: 'cancelled by user' },
    });
    expect(snapshot && isDictionaryImportTerminal(snapshot)).toBe(true);
  });

  it('rejects invalid terminal count values from the worker boundary', () => {
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-4', kind: 'cedict', status: 'committed',
      terminal: { state: 'committed', counts: { entries: -1 } },
    })).toBeNull();
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-5', kind: 'cedict', status: 'cancelled',
      terminal: { state: 'cancelled', counts: { entries: Number.NaN } },
    })).toBeNull();
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-6', kind: 'cedict', status: 'running',
      progress: { jobId: 'job-6', kind: 'cedict', lines: Number.MAX_SAFE_INTEGER + 1, phase: 'reading' },
    })).toBeNull();
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-7', kind: 'cedict', status: 'committed',
      terminal: { state: 'committed', counts: { entries: Number.MAX_SAFE_INTEGER + 1 } },
    })).toBeNull();
  });

  it('bounds untrusted identifiers, errors, and count keys', () => {
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'x'.repeat(129), kind: 'cedict', status: 'running',
    })).toBeNull();
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-8', kind: 'cedict', status: 'failed',
      terminal: { state: 'failed', error: 'x'.repeat(2_001) },
    })).toBeNull();
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-9', kind: 'cedict', status: 'committed',
      terminal: { state: 'committed', counts: { ['x'.repeat(65)]: 1 } },
    })).toBeNull();
  });

  it('rejects an oversized terminal count map', () => {
    const counts = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`count-${index}`, index]));
    expect(normalizeDictionaryImportJobSnapshot({
      jobId: 'job-10', kind: 'cedict', status: 'committed', terminal: { state: 'committed', counts },
    })).toBeNull();
  });
});

describe('dictionary import request validation', () => {
  it('accepts the two file-backed kinds with a path', () => {
    expect(normalizeDictionaryImportRequest({ kind: 'cedict', filePath: '/tmp/cedict.u8' }))
      .toEqual({ kind: 'cedict', filePath: '/tmp/cedict.u8' });
    expect(normalizeDictionaryImportRequest({ kind: 'wiktextract', filePath: '/tmp/d.jsonl', dictId: 'wikt-ja' }))
      .toEqual({ kind: 'wiktextract', filePath: '/tmp/d.jsonl', dictId: 'wikt-ja' });
    expect(normalizeDictionaryImportRequest({ kind: 'jmnedict', filePath: '/tmp/JMnedict.xml' }))
      .toEqual({ kind: 'jmnedict', filePath: '/tmp/JMnedict.xml' });
    expect(normalizeDictionaryImportRequest({ kind: 'tatoeba', filePath: '/tmp/s.tsv', linksFilePath: '/tmp/l.tsv' }))
      .toEqual({ kind: 'tatoeba', filePath: '/tmp/s.tsv', linksFilePath: '/tmp/l.tsv' });
    expect(normalizeDictionaryImportRequest({ kind: 'tatoeba', filePath: '/tmp/s.tsv' })).toBeNull();
  });

  it('refuses a file-backed kind with no path rather than importing nothing', () => {
    expect(normalizeDictionaryImportRequest({ kind: 'cedict' })).toBeNull();
    expect(normalizeDictionaryImportRequest({ kind: 'cedict', filePath: '' })).toBeNull();
    expect(normalizeDictionaryImportRequest({ kind: 'wiktextract', filePath: 'x'.repeat(4_097) })).toBeNull();
  });

  it('reads the whole legacy tree and refuses a path that would be silently ignored', () => {
    expect(normalizeDictionaryImportRequest({ kind: 'legacy' })).toEqual({ kind: 'legacy' });
    expect(normalizeDictionaryImportRequest({ kind: 'legacy', filePath: '/tmp/anything' })).toBeNull();
  });

  it('takes a relabel only with both a dictionary and a usable language', () => {
    expect(normalizeDictionaryImportRequest({ kind: 'relabel', dictId: 'jmdict-ru', toLang: ' RU ' }))
      .toEqual({ kind: 'relabel', dictId: 'jmdict-ru', toLang: 'ru' });
    // Neither half has a defensible default: no dictionary means nothing to
    // move, and a blank language would leave rows answering no pair at all.
    expect(normalizeDictionaryImportRequest({ kind: 'relabel', toLang: 'ru' })).toBeNull();
    expect(normalizeDictionaryImportRequest({ kind: 'relabel', dictId: 'jmdict-ru' })).toBeNull();
    expect(normalizeDictionaryImportRequest({ kind: 'relabel', dictId: 'jmdict-ru', toLang: '  ' })).toBeNull();
  });

  it('refuses a relabel carrying a path, and any other kind carrying a language', () => {
    // Same rule both ways: a field this kind ignores must not be accepted, or
    // the request implies it was honoured.
    expect(normalizeDictionaryImportRequest({ kind: 'relabel', dictId: 'd', toLang: 'ru', filePath: '/tmp/x' })).toBeNull();
    expect(normalizeDictionaryImportRequest({ kind: 'cedict', filePath: '/a', toLang: 'zh' })).toBeNull();
    expect(normalizeDictionaryImportRequest({ kind: 'legacy', toLang: 'ja' })).toBeNull();
  });

  it('rejects an unknown kind and non-object input', () => {
    expect(normalizeDictionaryImportRequest({ kind: 'jmdict', filePath: '/a' })).toBeNull();
    expect(normalizeDictionaryImportRequest(null)).toBeNull();
    expect(normalizeDictionaryImportRequest('cedict')).toBeNull();
  });

  it('bounds a caller-supplied dictionary id', () => {
    expect(normalizeDictionaryImportRequest({ kind: 'cedict', filePath: '/a', dictId: 'x'.repeat(129) })).toBeNull();
  });
});
