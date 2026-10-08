import { describe, expect, it } from 'vitest';
import { WATCH_FINISHED_FRACTION } from '../watchFinished';
import {
  CONTINUE_WATCHING_MIN_POSITION_SEC,
  CONTINUE_WATCHING_REWIND_SEC,
  continueWatchingPathFromKey,
  continueWatchingResumeSec,
  formatContinueWatchingPosition,
  seanimeContinueWatching,
} from '../seanimeContinueWatching';
import type { WatchLoopCard } from '../seanimeWatchLoop';
import type { MediaItem } from '../types';
import type { VideoCoreResumePosition } from '../videoCoreStudy';

function resume(
  key: string,
  positionSec: number,
  updatedAt: number,
): VideoCoreResumePosition {
  return { key, positionSec, updatedAt };
}

function media(patch: Partial<MediaItem> & { path: string }): MediaItem {
  return {
    id: patch.path,
    title: patch.title ?? 'Item',
    fileName: patch.path.split(/[\\/]/).pop() ?? '',
    addedAt: 0,
    ...patch,
  } as MediaItem;
}

function card(patch: Partial<WatchLoopCard> & { pathKey: string }): WatchLoopCard {
  return {
    historyId: `h-${patch.pathKey}-${patch.noteId ?? 1}`,
    noteId: patch.noteId ?? 1,
    term: '猫',
    sentence: '猫が窓辺で寝ている。',
    localFilePath: patch.localFilePath ?? 'C:/Media/Ep1.mkv',
    title: patch.title ?? 'Mined title',
    cue: { index: 0, trackNumber: 3, startMs: 2148, endMs: 5148 },
    minedAt: patch.minedAt ?? 1000,
    stage: 'new',
    canReplay: true,
    ...patch,
  };
}

describe('continueWatchingPathFromKey', () => {
  it('unwraps a file key and refuses every other key shape', () => {
    expect(continueWatchingPathFromKey('file:c:/media/ep1.mkv')).toBe('c:/media/ep1.mkv');
    // Rule 1: none of these can be handed to MediaWorkspaceOpenRequest.localFilePath.
    expect(continueWatchingPathFromKey('media:154587:episode:1')).toBe('');
    expect(continueWatchingPathFromKey('stream:https://example.test/a.m3u8')).toBe('');
    expect(continueWatchingPathFromKey('playback:abc-123')).toBe('');
    expect(continueWatchingPathFromKey('')).toBe('');
  });
});

describe('seanimeContinueWatching', () => {
  it('builds a row from a VideoCore resume position', () => {
    const [entry] = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 620, 5000)],
    });
    expect(entry).toBeDefined();
    expect(entry?.pathKey).toBe('c:/media/ep1.mkv');
    expect(entry?.localFilePath).toBe('c:/media/ep1.mkv');
    expect(entry?.title).toBe('ep1.mkv');
    expect(entry?.positionSec).toBe(620);
    expect(entry?.source).toBe('videocore');
    // Rule 3: no duration was supplied, so no percentage is invented.
    expect(entry?.percent).toBeUndefined();
    expect(entry?.durationSec).toBeUndefined();
  });

  it('excludes non-file resume keys rather than rendering a dead row', () => {
    const entries = seanimeContinueWatching({
      resumePositions: [
        resume('playback:abc-123', 600, 5000),
        resume('media:154587:episode:2', 600, 5000),
        resume('stream:https://example.test/a.m3u8', 600, 5000),
      ],
    });
    expect(entries).toEqual([]);
  });

  it('drops a position too early to be worth resuming', () => {
    expect(seanimeContinueWatching({
      resumePositions: [
        resume('file:c:/media/ep1.mkv', CONTINUE_WATCHING_MIN_POSITION_SEC - 0.1, 1),
      ],
    })).toEqual([]);
    expect(seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', CONTINUE_WATCHING_MIN_POSITION_SEC, 1)],
    })).toHaveLength(1);
  });

  it('reports a percentage only when a duration was measured', () => {
    const [entry] = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 300, 5000)],
      mediaItems: [media({ path: 'C:/Media/Ep1.mkv', durationSec: 1200 })],
    });
    expect(entry?.durationSec).toBe(1200);
    expect(entry?.percent).toBeCloseTo(0.25, 5);
  });

  it('drops a file the shared finished rule calls finished, and keeps one just before it', () => {
    const duration = 1200;
    // 1080 / 1200 is exactly WATCH_FINISHED_FRACTION (0.9) — `shared/watchFinished.ts`.
    const finishedAt = duration * WATCH_FINISHED_FRACTION;
    expect(seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 1080, 5000)],
      mediaItems: [media({ path: 'C:/Media/Ep1.mkv', durationSec: duration })],
    })).toEqual([]);
    expect(seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', Math.floor(finishedAt) - 1, 5000)],
      mediaItems: [media({ path: 'C:/Media/Ep1.mkv', durationSec: duration })],
    })).toHaveLength(1);
  });

  it('keeps a far-advanced file when no duration is known — finished is not guessable', () => {
    // Rule 4. The alternative — treating a large position as "probably finished" — would
    // hide exactly the long files a resume matters most for.
    const entries = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/film.mkv', 7000, 5000)],
    });
    expect(entries).toHaveLength(1);
  });

  describe('two stores, one file (rule 2)', () => {
    it('takes the newer write when the library is more recent', () => {
      const [entry] = seanimeContinueWatching({
        resumePositions: [resume('file:c:/media/ep1.mkv', 100, 1000)],
        mediaItems: [media({
          path: 'C:/Media/Ep1.mkv',
          positionSec: 700,
          lastPlayedAt: 9000,
        })],
      });
      expect(entry?.positionSec).toBe(700);
      expect(entry?.source).toBe('library');
    });

    it('takes the newer write when VideoCore is more recent', () => {
      const [entry] = seanimeContinueWatching({
        resumePositions: [resume('file:c:/media/ep1.mkv', 100, 9000)],
        mediaItems: [media({
          path: 'C:/Media/Ep1.mkv',
          positionSec: 700,
          lastPlayedAt: 1000,
        })],
      });
      expect(entry?.positionSec).toBe(100);
      expect(entry?.source).toBe('videocore');
    });

    it('never lets an undated library position outrank a real VideoCore write', () => {
      const [entry] = seanimeContinueWatching({
        resumePositions: [resume('file:c:/media/ep1.mkv', 100, 1)],
        mediaItems: [media({ path: 'C:/Media/Ep1.mkv', positionSec: 700 })],
      });
      expect(entry?.source).toBe('videocore');
      expect(entry?.positionSec).toBe(100);
    });

    it('surfaces a library-only position with no VideoCore entry at all', () => {
      const [entry] = seanimeContinueWatching({
        mediaItems: [media({
          path: 'C:/Media/Ep1.mkv',
          title: 'The Big O',
          positionSec: 700,
          lastPlayedAt: 9000,
        })],
      });
      expect(entry?.source).toBe('library');
      expect(entry?.title).toBe('The Big O');
    });
  });

  it('prefers a recorded original-cased path over the lower-cased resume key', () => {
    const [fromLibrary] = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 600, 5000)],
      mediaItems: [media({ path: 'C:/Media/Ep1.mkv' })],
    });
    expect(fromLibrary?.localFilePath).toBe('C:/Media/Ep1.mkv');

    const [fromMining] = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 600, 5000)],
      cards: [card({ pathKey: 'c:/media/ep1.mkv', localFilePath: 'C:/Media/Ep1.mkv' })],
    });
    expect(fromMining?.localFilePath).toBe('C:/Media/Ep1.mkv');
  });

  it('resolves titles library → mining → study ledger → file name', () => {
    const key = 'file:c:/media/ep1.mkv';
    const positions = [resume(key, 600, 5000)];
    const mined = [card({ pathKey: 'c:/media/ep1.mkv', title: 'Mined title' })];
    const ledger = [{ id: key, title: 'Sousou no Frieren — 1' }];

    expect(seanimeContinueWatching({
      resumePositions: positions,
      mediaItems: [media({ path: 'C:/Media/Ep1.mkv', title: 'Library title' })],
      cards: mined,
      ledgerShows: ledger,
    })[0]?.title).toBe('Library title');
    expect(seanimeContinueWatching({
      resumePositions: positions,
      cards: mined,
      ledgerShows: ledger,
    })[0]?.title).toBe('Mined title');
    expect(seanimeContinueWatching({
      resumePositions: positions,
      ledgerShows: ledger,
    })[0]?.title).toBe('Sousou no Frieren — 1');
    expect(seanimeContinueWatching({ resumePositions: positions })[0]?.title).toBe('ep1.mkv');
  });

  it('joins the study ledger by resume key, and ignores rows that cannot become a path', () => {
    const positions = [resume('file:c:/media/ep1.mkv', 600, 5000)];

    // The ledger keys by `videoCoreResumeKey`, this join keys by `studyLibraryPathKey`.
    // Original-cased and backslashed ledger ids must still land on the same row.
    expect(seanimeContinueWatching({
      resumePositions: positions,
      ledgerShows: [{ id: 'file:C:\\Media\\Ep1.mkv', title: 'Ledger title' }],
    })[0]?.title).toBe('Ledger title');

    // Rule 1 owns the conversion, so a non-`file:` ledger row produces no path and is
    // skipped rather than matching some other entry.
    expect(seanimeContinueWatching({
      resumePositions: positions,
      ledgerShows: [
        { id: 'media:154587:episode:1', title: 'Wrong row' },
        { id: 'playback:abc', title: 'Also wrong' },
      ],
    })[0]?.title).toBe('ep1.mkv');

    // A blank ledger title must not beat the file name it is supposed to improve on.
    expect(seanimeContinueWatching({
      resumePositions: positions,
      ledgerShows: [{ id: 'file:c:/media/ep1.mkv', title: '   ' }],
    })[0]?.title).toBe('ep1.mkv');
  });

  it('rolls mined cards up onto the same join key, and reports zero when none match', () => {
    const [entry] = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 600, 5000)],
      cards: [
        card({ pathKey: 'c:/media/ep1.mkv', noteId: 1, minedAt: 400 }),
        card({ pathKey: 'c:/media/ep1.mkv', noteId: 2, minedAt: 900 }),
        card({ pathKey: 'c:/media/other.mkv', noteId: 3, minedAt: 5000 }),
      ],
    });
    expect(entry?.cards).toBe(2);
    expect(entry?.lastMinedAt).toBe(900);

    const [none] = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 600, 5000)],
      cards: [card({ pathKey: 'c:/media/other.mkv', noteId: 3 })],
    });
    expect(none?.cards).toBe(0);
    expect(none?.lastMinedAt).toBe(0);
  });

  it('orders by the write it is based on, newest first', () => {
    const entries = seanimeContinueWatching({
      resumePositions: [
        resume('file:c:/media/a.mkv', 600, 1000),
        resume('file:c:/media/c.mkv', 600, 9000),
        resume('file:c:/media/b.mkv', 600, 5000),
      ],
    });
    expect(entries.map((entry) => entry.fileName)).toEqual(['c.mkv', 'b.mkv', 'a.mkv']);
  });

  it('joins path variants onto one row rather than duplicating the file', () => {
    const entries = seanimeContinueWatching({
      resumePositions: [resume('file:c:/media/ep1.mkv', 600, 5000)],
      // Backslashes and different casing — the shape Windows actually produces.
      mediaItems: [media({ path: 'C:\\Media\\Ep1.mkv', title: 'The Big O' })],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('The Big O');
  });

  it('returns an empty list for empty input rather than throwing', () => {
    expect(seanimeContinueWatching({})).toEqual([]);
  });
});

describe('continueWatchingResumeSec', () => {
  it('rewinds for context and never goes below zero', () => {
    expect(continueWatchingResumeSec({ positionSec: 600 }))
      .toBe(600 - CONTINUE_WATCHING_REWIND_SEC);
    expect(continueWatchingResumeSec({ positionSec: 1 })).toBe(0);
  });
});

describe('formatContinueWatchingPosition', () => {
  it('adds an hour field only once there is one', () => {
    expect(formatContinueWatchingPosition(0)).toBe('0:00');
    expect(formatContinueWatchingPosition(65)).toBe('1:05');
    expect(formatContinueWatchingPosition(3599)).toBe('59:59');
    expect(formatContinueWatchingPosition(3600)).toBe('1:00:00');
    expect(formatContinueWatchingPosition(3725)).toBe('1:02:05');
  });

  it('clamps a negative position instead of printing a negative clock', () => {
    expect(formatContinueWatchingPosition(-10)).toBe('0:00');
  });
});
