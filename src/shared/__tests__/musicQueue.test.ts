// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  arrangeQueueOrder,
  queueAppend,
  queueAsPlaylistIds,
  queueInsertNext,
  queueKeyboardMove,
  queueMoveEntry,
  queueUpcoming,
} from '../musicQueue';
import { createLyricStudyLog, lyricStudyLineKey } from '../musicLyricStudy';

describe('queueInsertNext (Play next)', () => {
  it('puts the track first, moving it when it was already queued', () => {
    expect(queueInsertNext(['b', 'c'], 'x', 'a')).toEqual(['x', 'b', 'c']);
    expect(queueInsertNext(['b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'b', 'c']);
  });

  it('never moves the current track', () => {
    expect(queueInsertNext(['b', 'c'], 'a', 'a')).toEqual(['b', 'c']);
  });
});

describe('queueAppend (Add to queue)', () => {
  it('goes first when nothing is hand-queued', () => {
    expect(queueAppend(['b', 'c', 'd'], 'x', 'a', new Set())).toEqual(['x', 'b', 'c', 'd']);
  });

  it('goes after the last hand-queued track, not after the whole library', () => {
    const queued = new Set(['q1', 'q2']);
    expect(queueAppend(['q1', 'q2', 'lib1', 'lib2'], 'x', 'a', queued)).toEqual(['q1', 'q2', 'x', 'lib1', 'lib2']);
  });

  it('moves an already-queued track rather than duplicating it', () => {
    const queued = new Set(['q1']);
    expect(queueAppend(['lib1', 'q1', 'lib2'], 'lib1', 'a', queued)).toEqual(['q1', 'lib1', 'lib2']);
  });

  it('never moves the current track', () => {
    expect(queueAppend(['b'], 'a', 'a', new Set())).toEqual(['b']);
  });
});

describe('queueMoveEntry / queueKeyboardMove', () => {
  it('moves an entry and clamps the target', () => {
    expect(queueMoveEntry(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(queueMoveEntry(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(queueMoveEntry(['a', 'b', 'c'], 7, 0)).toEqual(['a', 'b', 'c']);
  });

  it('reports no move at either end', () => {
    expect(queueKeyboardMove(0, -1, 3)).toBeNull();
    expect(queueKeyboardMove(2, 1, 3)).toBeNull();
    expect(queueKeyboardMove(1, 1, 3)).toBe(2);
    expect(queueKeyboardMove(1, -1, 3)).toBe(0);
    expect(queueKeyboardMove(5, -1, 3)).toBeNull();
  });
});

describe('arrangeQueueOrder', () => {
  it('keeps history before the current track and the cursor on it', () => {
    const ids = ['h1', 'h2', 'cur', 'u1', 'u2', 'u3'];
    const next = arrangeQueueOrder(ids, 2, 'cur', ['u3', 'u1']);
    expect(next.ids).toEqual(['h1', 'h2', 'cur', 'u3', 'u1', 'u2']);
    expect(next.ids[next.cursor]).toBe('cur');
  });

  it('adds a track from outside the order and never duplicates one', () => {
    const next = arrangeQueueOrder(['cur', 'u1'], 0, 'cur', ['new', 'new', 'cur']);
    expect(next.ids).toEqual(['cur', 'new', 'u1']);
    expect(next.cursor).toBe(0);
  });

  it('pulls a wrapped history track forward (repeat-all "Up next")', () => {
    const next = arrangeQueueOrder(['h1', 'cur', 'u1'], 1, 'cur', ['h1', 'u1']);
    expect(next.ids).toEqual(['cur', 'h1', 'u1']);
    expect(next.cursor).toBe(0);
  });

  it('puts a current track that was outside the queue at the cursor', () => {
    const next = arrangeQueueOrder(['a', 'b'], -1, 'cur', ['b']);
    expect(next.ids).toEqual(['cur', 'b', 'a']);
    expect(next.cursor).toBe(0);
  });

  it('works with nothing playing', () => {
    const next = arrangeQueueOrder(['a', 'b', 'c'], -1, null, ['c']);
    expect(next).toEqual({ ids: ['c', 'a', 'b'], cursor: -1 });
  });

  it('agrees with queueUpcoming after the arrangement', () => {
    const next = arrangeQueueOrder(['h', 'cur', 'a', 'b'], 1, 'cur', queueMoveEntry(['a', 'b'], 1, 0));
    expect(queueUpcoming(next.ids, next.cursor)).toEqual(['b', 'a']);
  });
});

describe('queueAsPlaylistIds', () => {
  it('saves the current track then what follows, once each', () => {
    expect(queueAsPlaylistIds('cur', ['a', 'cur', 'b', 'a'])).toEqual(['cur', 'a', 'b']);
    expect(queueAsPlaylistIds(null, ['a', 'b'])).toEqual(['a', 'b']);
    expect(queueAsPlaylistIds(null, [])).toEqual([]);
  });
});

describe('createLyricStudyLog', () => {
  it('counts each lyric line once per session', () => {
    const counts: number[] = [];
    const log = createLyricStudyLog((n) => counts.push(n));
    expect(log.note('song', 0, '一行目')).toBe(true);
    expect(log.note('song', 0, '一行目')).toBe(false);
    expect(log.note('song', 1, '二行目')).toBe(true);
    expect(log.note('other', 0, '一行目')).toBe(true);
    expect(counts).toEqual([1, 1, 1]);
  });

  it('ignores blank lines and survives a store that throws', () => {
    const log = createLyricStudyLog(() => {
      throw new Error('quota');
    });
    expect(log.note('song', 2, '   ')).toBe(false);
    expect(log.note('', 0, 'text')).toBe(false);
    expect(log.note('song', 3, '歌')).toBe(true);
  });

  it('keys a corrected line as a new line', () => {
    expect(lyricStudyLineKey('s', 0, 'a')).not.toBe(lyricStudyLineKey('s', 0, 'b'));
    expect(lyricStudyLineKey('s', 0, ' a ')).toBe(lyricStudyLineKey('s', 0, 'a'));
  });
});
