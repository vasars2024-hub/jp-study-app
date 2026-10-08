import { describe, expect, it } from 'vitest';
import type { SubtitleRecord } from '../../shared/subtitleRecord';
import { mergeSweepSubtitles } from '../subtitleSweepMerge';

const rec = (id: string, over: Partial<SubtitleRecord> = {}): SubtitleRecord =>
  ({ id, lang: 'ja', source: 'provider', format: 'srt', path: `${id}.srt`, addedAt: 1, ...over }) as SubtitleRecord;

describe('mergeSweepSubtitles', () => {
  it('writes the sweep answer as-is when nobody touched the item', () => {
    const snapshot = [rec('a')];
    expect(mergeSweepSubtitles(snapshot, snapshot, [rec('a'), rec('new')]).map((r) => r.id)).toEqual(['a', 'new']);
  });

  it('keeps a record the user added during the sweep', () => {
    const out = mergeSweepSubtitles([rec('a')], [rec('a'), rec('user')], [rec('a'), rec('new')]);
    expect(out.map((r) => r.id)).toEqual(['a', 'new', 'user']);
  });

  it('does not restore a record the user removed during the sweep', () => {
    const out = mergeSweepSubtitles([rec('a'), rec('b')], [rec('b')], [rec('a'), rec('b'), rec('new')]);
    expect(out.map((r) => r.id)).toEqual(['b', 'new']);
  });

  it('keeps the user edit of a record over the stale copy', () => {
    const out = mergeSweepSubtitles([rec('a')], [rec('a', { syncOffsetSec: 1.5 })], [rec('a')]);
    expect(out).toEqual([rec('a', { syncOffsetSec: 1.5 })]);
  });

  it('lets the sweep drop a record the user left alone', () => {
    expect(mergeSweepSubtitles([rec('a'), rec('b')], [rec('a'), rec('b')], [rec('b')]).map((r) => r.id)).toEqual(['b']);
  });

  it('handles items with no subtitles at all', () => {
    expect(mergeSweepSubtitles(undefined, undefined, [])).toEqual([]);
    expect(mergeSweepSubtitles(undefined, [rec('user')], [rec('new')]).map((r) => r.id)).toEqual(['new', 'user']);
  });
});
