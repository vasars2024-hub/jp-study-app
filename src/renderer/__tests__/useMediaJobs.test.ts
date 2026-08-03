// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __mediaJobsTestables } from '../components/media/library/useMediaJobs';

// The store only touches `window` when a component subscribes; these tests drive
// it directly, so the stub just has to exist at import time. Assigned before the
// static import runs because vitest hoists `vi.*` calls above imports.
vi.stubGlobal('window', {
  api: {},
  setInterval: () => 0,
  clearInterval: () => undefined,
});

// Static, not `await import`: this tsconfig's module target rejects top-level await.
const { reset, upsert, read } = __mediaJobsTestables;

const job = (over: Partial<Parameters<typeof upsert>[0]> = {}) => ({
  id: 'metadata:x',
  kind: 'metadata' as const,
  title: 'X',
  phase: 'searching',
  done: 0,
  total: 1,
  finished: false,
  updatedAt: Date.now(),
  ...over,
});

describe('media jobs store', () => {
  beforeEach(() => reset());

  it('starts empty', () => {
    expect(read().jobs).toEqual([]);
    expect(read().active).toBe(0);
    expect(read().transcribing.size).toBe(0);
  });

  it('is shared, so a consumer created later sees earlier events', () => {
    // The bug this guards: the store used to be per-hook, so a drawer opened
    // mid-sweep had missed every prior event and reported nothing running.
    upsert(job({ id: 'transcription:m1', kind: 'transcription', title: 'Ep 1' }));
    // A "second consumer" is just another read of the same module state.
    expect(read().transcribing.has('m1')).toBe(true);
    expect(read().active).toBe(1);
  });

  it('replaces rather than accumulates on repeated progress for one subject', () => {
    upsert(job({ phase: 'searching' }));
    upsert(job({ phase: 'matching' }));
    expect(read().jobs).toHaveLength(1);
    expect(read().jobs[0].phase).toBe('matching');
  });

  it('returns an identical snapshot until something changes', () => {
    upsert(job());
    // useSyncExternalStore compares by identity; a fresh object per read would
    // spin forever.
    expect(read()).toBe(read());
  });

  it('drops a finished transcription out of the pending set', () => {
    upsert(job({ id: 'transcription:m1', kind: 'transcription', finished: false }));
    expect(read().transcribing.has('m1')).toBe(true);
    upsert(job({ id: 'transcription:m1', kind: 'transcription', phase: 'done', finished: true }));
    expect(read().transcribing.has('m1')).toBe(false);
    // Still listed, though — a row that vanishes on completion never gets read.
    expect(read().jobs).toHaveLength(1);
  });

  it('sorts running work above finished work', () => {
    upsert(job({ id: 'a', phase: 'done', finished: true, updatedAt: 2_000 }));
    upsert(job({ id: 'b', phase: 'searching', finished: false, updatedAt: 1_000 }));
    expect(read().jobs.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('keeps every job kind apart by id namespace', () => {
    upsert(job({ id: 'metadata:same', kind: 'metadata' }));
    upsert(job({ id: 'subtitles:same', kind: 'subtitles' }));
    upsert(job({ id: 'download:same', kind: 'download' }));
    expect(read().jobs).toHaveLength(3);
  });
});
