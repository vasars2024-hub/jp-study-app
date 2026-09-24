import { describe, expect, it } from 'vitest';
import { summarizeAssetBundle } from '../assetBundleProgress';
import type { AssetStatus } from '../assetRegistry';
import { bookOcrEngine, bookOcrViewOf, judgeBookOcrRun } from '../bookOcrIpc';

const status = (id: string, patch: Partial<AssetStatus> = {}): AssetStatus => ({
  id,
  state: 'not-installed',
  receivedBytes: 0,
  totalBytes: 100,
  bytesPerSecond: 0,
  ...patch,
});

describe('summarizeAssetBundle', () => {
  it('is installed only when every member is', () => {
    expect(summarizeAssetBundle([status('a', { state: 'installed' }), status('b', { state: 'installed' })]).state)
      .toBe('installed');
    expect(summarizeAssetBundle([status('a', { state: 'installed' }), null]).state).toBe('missing');
    expect(summarizeAssetBundle([]).state).toBe('missing');
  });

  it('adds up the bytes of the members still to come, so a companion moves the bar', () => {
    const s = summarizeAssetBundle([
      status('det', { state: 'downloading', receivedBytes: 50, totalBytes: 100 }),
      status('rec', { state: 'queued', totalBytes: 300 }),
      status('keys', { state: 'installed', receivedBytes: 10, totalBytes: 10 }),
    ]);
    expect(s).toMatchObject({ state: 'busy', receivedBytes: 50, totalBytes: 400, busyIds: ['det', 'rec'] });
    expect(s.fraction).toBeCloseTo(0.125);
  });

  it('reports a failure with its reason once nothing is moving', () => {
    const error = { key: 'assetError.httpFailed', vars: { status: 404 } };
    expect(summarizeAssetBundle([status('a', { state: 'failed', error }), status('b')])).toMatchObject({
      state: 'failed',
      error,
    });
    // Still busy while another member downloads.
    expect(summarizeAssetBundle([
      status('a', { state: 'failed', error }),
      status('b', { state: 'downloading' }),
    ]).state).toBe('busy');
  });
});

describe('bookOcrEngine', () => {
  const has = (...ids: string[]) => (id: string) => ids.includes(id);
  it('needs the Japanese web pack, or the whole manga-ocr set', () => {
    expect(bookOcrEngine(has('paddle-ocr-det', 'paddle-ocr-ja', 'paddle-ocr-ja-keys'))).toBe('auto');
    expect(bookOcrEngine(has('manga-ocr', 'manga-ocr-decoder', 'manga-ocr-vocab', 'comic-text-detector'))).toBe('manga');
    expect(bookOcrEngine(has('paddle-ocr-det', 'paddle-ocr-zh', 'paddle-ocr-zh-keys'))).toBeNull();
    expect(bookOcrEngine(has('manga-ocr'))).toBeNull();
  });
});

describe('judgeBookOcrRun', () => {
  it('passes a book whose covers are blank', () => {
    expect(judgeBookOcrRun(['', 'a', 'b', ''], 0).ok).toBe(true);
  });
  it('fails below half the pages', () => {
    expect(judgeBookOcrRun(['a', '', '', ''], 0)).toMatchObject({
      ok: false,
      errorKey: 'bookOcr.error.mostlyEmpty',
      errorVars: { read: 1, total: 4 },
    });
  });
  it('names the engine when every page threw', () => {
    expect(judgeBookOcrRun(['', ''], 2, 'boom')).toMatchObject({ ok: false, errorKey: 'bookOcr.error.engine' });
  });
});

describe('bookOcrViewOf', () => {
  it('tells the converted shelf from the original, including items converted before tracking', () => {
    expect(bookOcrViewOf({ kind: 'book', epubFile: 'original.epub' })).toBeNull();
    expect(bookOcrViewOf({ kind: 'book', epubFile: 'original.pdf' })).toBeNull();
    expect(bookOcrViewOf({ kind: 'book', epubFile: 'ocr.epub' })).toBe('text');
    expect(bookOcrViewOf({ kind: 'manga', ocrEpubFile: 'ocr.epub' })).toBe('original');
    expect(bookOcrViewOf({ kind: 'book', epubFile: 'original.pdf', ocrEpubFile: 'ocr.epub' })).toBe('original');
  });
});
