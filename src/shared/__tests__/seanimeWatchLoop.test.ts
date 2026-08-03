import { describe, expect, it } from 'vitest';
import type { IntervalEntry, IntervalSnapshot } from '../anki';
import {
  findMinedCueEntry,
  formatWatchLoopTimestamp,
  watchLoopSourceKey,
  seanimeWatchLoopAttention,
  seanimeWatchLoopByEntry,
  seanimeWatchLoopCards,
  seanimeWatchLoopSummary,
  watchLoopIntervalIndex,
  watchLoopReplaySec,
  watchLoopStage,
  WATCH_LOOP_REPLAY_LEAD_SEC,
} from '../seanimeWatchLoop';
import type { VideoCoreMiningHistoryEntry, VideoCoreMiningHistoryStatus } from '../videoCoreMining';

function historyEntry(
  overrides: {
    id?: string;
    status?: VideoCoreMiningHistoryStatus;
    noteId?: number;
    createdAt?: number;
    term?: string;
    sentence?: string;
    localFilePath?: string;
    mediaTitle?: string;
    episodeTitle?: string;
    episodeNumber?: number;
    startMs?: number;
    index?: number;
  } = {},
): VideoCoreMiningHistoryEntry {
  const startMs = overrides.startMs ?? 2148;
  return {
    id: overrides.id ?? 'video-core-mine-a',
    createdAt: overrides.createdAt ?? 1_700_000_000_000,
    status: overrides.status ?? 'exported',
    ...(overrides.noteId === undefined ? { noteId: 111 } : { noteId: overrides.noteId }),
    term: overrides.term ?? '無防備',
    sentence: overrides.sentence ?? '猫が窓辺で寝ている。',
    provenance: {
      schemaVersion: 1,
      cue: {
        index: overrides.index ?? 0,
        trackNumber: 3,
        rawText: overrides.sentence ?? '猫が窓辺で寝ている。',
        text: overrides.sentence ?? '猫が窓辺で寝ている。',
        startMs,
        endMs: startMs + 3000,
      },
      source: {
        playbackId: 'playback-1',
        playbackType: 'localfile',
        streamType: 'native',
        ...(overrides.localFilePath === undefined
          ? { localFilePath: 'C:\\Media\\Frieren - 01.mkv' }
          : overrides.localFilePath
            ? { localFilePath: overrides.localFilePath }
            : {}),
        ...(overrides.mediaTitle ? { mediaTitle: overrides.mediaTitle } : {}),
        ...(overrides.episodeTitle ? { episodeTitle: overrides.episodeTitle } : {}),
        ...(overrides.episodeNumber != null ? { episodeNumber: overrides.episodeNumber } : {}),
      },
      assets: {},
      capturedAt: overrides.createdAt ?? 1_700_000_000_000,
    },
  };
}

function interval(overrides: Partial<IntervalEntry> & { noteId: number }): IntervalEntry {
  return {
    expression: 'x',
    ivlDays: 0,
    modelName: 'JP Study App::JA Immersion',
    ...overrides,
  };
}

function snapshot(entries: IntervalEntry[]): IntervalSnapshot {
  return {
    generatedAt: 1_700_000_100_000,
    sourceQueries: ['deck:*'],
    entries,
    noteCount: entries.length,
    truncated: false,
  };
}

describe('watchLoopStage', () => {
  it('reports untracked, not new, when no interval record exists', () => {
    // The snapshot only scans notes matching a profile's sync query, so absence is
    // ignorance. Calling it `new` would report a confident zero-day interval.
    expect(watchLoopStage(undefined)).toBe('untracked');
  });

  it('maps interval length onto the same thresholds the rest of the app uses', () => {
    expect(watchLoopStage(interval({ noteId: 1, ivlDays: 0 }))).toBe('new');
    expect(watchLoopStage(interval({ noteId: 1, ivlDays: 1 }))).toBe('learning');
    expect(watchLoopStage(interval({ noteId: 1, ivlDays: 20 }))).toBe('learning');
    expect(watchLoopStage(interval({ noteId: 1, ivlDays: 21 }))).toBe('known');
  });

  it("honours a profile's own thresholds", () => {
    expect(watchLoopStage(interval({ noteId: 1, ivlDays: 10 }), { familiar: 1, known: 10 }))
      .toBe('known');
  });

  it('ranks leech above any interval length', () => {
    expect(watchLoopStage(interval({ noteId: 1, ivlDays: 40, leech: true }))).toBe('leech');
  });

  it('ranks suspended above leech, because the user has already acted on it', () => {
    expect(watchLoopStage(interval({ noteId: 1, ivlDays: 3, leech: true, suspended: true })))
      .toBe('suspended');
  });
});

describe('watchLoopIntervalIndex', () => {
  it('survives a null snapshot', () => {
    expect(watchLoopIntervalIndex(null).size).toBe(0);
  });

  it('skips unusable note ids rather than indexing them', () => {
    const index = watchLoopIntervalIndex(snapshot([
      interval({ noteId: 0 }),
      interval({ noteId: -5 }),
      interval({ noteId: 7 }),
    ]));
    expect([...index.keys()]).toEqual([7]);
  });

  it('keeps the first record for a repeated note id', () => {
    const index = watchLoopIntervalIndex(snapshot([
      interval({ noteId: 7, ivlDays: 30 }),
      interval({ noteId: 7, ivlDays: 1 }),
    ]));
    expect(index.get(7)?.ivlDays).toBe(30);
  });
});

describe('seanimeWatchLoopCards', () => {
  it('joins by note id, not by expression', () => {
    // The card's term is the sentence by default and the user may edit it, so an
    // expression match would miss exactly the cards that matter.
    const cards = seanimeWatchLoopCards(
      [historyEntry({ noteId: 111, term: 'edited by the user' })],
      snapshot([interval({ noteId: 111, ivlDays: 30, expression: 'something else' })]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.stage).toBe('known');
    expect(cards[0]?.ivlDays).toBe(30);
  });

  it('keeps only exported history', () => {
    const cards = seanimeWatchLoopCards(
      [
        historyEntry({ id: 'a', status: 'exported', noteId: 1 }),
        historyEntry({ id: 'b', status: 'undone', noteId: 2 }),
        historyEntry({ id: 'c', status: 'failed', noteId: 3 }),
        historyEntry({ id: 'd', status: 'duplicate', noteId: undefined }),
      ],
      snapshot([]),
    );
    expect(cards.map((card) => card.noteId)).toEqual([1]);
  });

  it('drops an exported row with no note id — it cannot be tracked', () => {
    const entry = historyEntry({ noteId: undefined });
    delete (entry as { noteId?: number }).noteId;
    expect(seanimeWatchLoopCards([entry], snapshot([]))).toHaveLength(0);
  });

  it('emits one card per note even when the same note was mined twice', () => {
    const cards = seanimeWatchLoopCards(
      [
        historyEntry({ id: 'a', noteId: 9, createdAt: 100 }),
        historyEntry({ id: 'b', noteId: 9, createdAt: 200 }),
      ],
      snapshot([]),
    );
    expect(cards).toHaveLength(1);
  });

  it('produces the join key the Phase 6 library join uses', () => {
    const cards = seanimeWatchLoopCards(
      [historyEntry({ localFilePath: 'C:\\Media\\Frieren - 01.mkv' })],
      snapshot([]),
    );
    expect(cards[0]?.pathKey).toBe('c:/media/frieren - 01.mkv');
    expect(cards[0]?.canReplay).toBe(true);
  });

  it('marks a card with no local file as unreplayable rather than hiding it', () => {
    const cards = seanimeWatchLoopCards(
      [historyEntry({ localFilePath: '' })],
      snapshot([]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.canReplay).toBe(false);
    expect(cards[0]?.pathKey).toBe('');
  });

  it('falls back through media title, episode title, then file name', () => {
    const [withMedia] = seanimeWatchLoopCards(
      [historyEntry({ mediaTitle: 'Frieren', episodeTitle: 'Ep' })], snapshot([]),
    );
    const [withEpisode] = seanimeWatchLoopCards(
      [historyEntry({ episodeTitle: 'The Journey' })], snapshot([]),
    );
    const [withFile] = seanimeWatchLoopCards([historyEntry({})], snapshot([]));
    expect(withMedia?.title).toBe('Frieren');
    expect(withEpisode?.title).toBe('The Journey');
    expect(withFile?.title).toBe('Frieren - 01.mkv');
  });

  it('orders newest mined first', () => {
    const cards = seanimeWatchLoopCards(
      [
        historyEntry({ id: 'old', noteId: 1, createdAt: 100 }),
        historyEntry({ id: 'new', noteId: 2, createdAt: 900 }),
        historyEntry({ id: 'mid', noteId: 3, createdAt: 400 }),
      ],
      snapshot([]),
    );
    expect(cards.map((card) => card.noteId)).toEqual([2, 3, 1]);
  });

  it('carries the exact cue back, so the replay is frame-accurate', () => {
    const [card] = seanimeWatchLoopCards(
      [historyEntry({ startMs: 6648, index: 4 })], snapshot([]),
    );
    expect(card?.cue).toEqual({ index: 4, trackNumber: 3, startMs: 6648, endMs: 9648 });
  });
});

describe('seanimeWatchLoopAttention', () => {
  const cards = seanimeWatchLoopCards(
    [
      historyEntry({ id: 'a', noteId: 1, createdAt: 500 }),
      historyEntry({ id: 'b', noteId: 2, createdAt: 400 }),
      historyEntry({ id: 'c', noteId: 3, createdAt: 300 }),
      historyEntry({ id: 'd', noteId: 4, createdAt: 200 }),
    ],
    snapshot([
      interval({ noteId: 1, ivlDays: 0 }),
      interval({ noteId: 2, ivlDays: 2, suspended: true }),
      interval({ noteId: 3, ivlDays: 2, leech: true }),
      interval({ noteId: 4, ivlDays: 30 }),
    ]),
  );

  it("lists only Anki's two problem markers", () => {
    expect(seanimeWatchLoopAttention(cards).map((card) => card.noteId)).toEqual([3, 2]);
  });

  it('ranks leech ahead of suspended', () => {
    expect(seanimeWatchLoopAttention(cards)[0]?.stage).toBe('leech');
  });

  it('excludes new cards — a rewatch does not fix a backlog', () => {
    expect(seanimeWatchLoopAttention(cards).some((card) => card.stage === 'new')).toBe(false);
  });

  it('is empty rather than throwing when nothing needs attention', () => {
    expect(seanimeWatchLoopAttention([])).toEqual([]);
  });
});

describe('seanimeWatchLoopSummary', () => {
  it('counts every stage and reports the attention total', () => {
    const history = [
      historyEntry({ id: 'a', noteId: 1, createdAt: 500 }),
      historyEntry({ id: 'b', noteId: 2, createdAt: 400 }),
      historyEntry({ id: 'c', noteId: 3, createdAt: 300 }),
      historyEntry({ id: 'd', noteId: 4, createdAt: 200 }),
      historyEntry({ id: 'e', noteId: 5, createdAt: 100 }),
    ];
    const summary = seanimeWatchLoopSummary(
      seanimeWatchLoopCards(history, snapshot([
        interval({ noteId: 1, ivlDays: 0 }),
        interval({ noteId: 2, ivlDays: 5 }),
        interval({ noteId: 3, ivlDays: 40 }),
        interval({ noteId: 4, ivlDays: 2, leech: true }),
        interval({ noteId: 5, ivlDays: 2, suspended: true }),
      ])),
      history,
    );
    expect(summary.cards).toBe(5);
    expect(summary.new).toBe(1);
    expect(summary.learning).toBe(1);
    expect(summary.known).toBe(1);
    expect(summary.leech).toBe(1);
    expect(summary.suspended).toBe(1);
    expect(summary.attention).toBe(2);
    expect(summary.lastMinedAt).toBe(500);
  });

  it('reports duplicates and undone rather than silently dropping them', () => {
    const history = [
      historyEntry({ id: 'a', noteId: 1 }),
      historyEntry({ id: 'b', status: 'duplicate' }),
      historyEntry({ id: 'c', status: 'duplicate' }),
      historyEntry({ id: 'd', status: 'undone', noteId: 4 }),
    ];
    const summary = seanimeWatchLoopSummary(
      seanimeWatchLoopCards(history, snapshot([])), history,
    );
    expect(summary.cards).toBe(1);
    expect(summary.duplicates).toBe(2);
    expect(summary.undone).toBe(1);
  });

  it('counts an unscanned note as untracked', () => {
    const summary = seanimeWatchLoopSummary(
      seanimeWatchLoopCards([historyEntry({ noteId: 42 })], snapshot([])),
    );
    expect(summary.untracked).toBe(1);
    expect(summary.new).toBe(0);
  });

  it('is all zeroes with no history', () => {
    const summary = seanimeWatchLoopSummary([], []);
    expect(summary.cards).toBe(0);
    expect(summary.attention).toBe(0);
    expect(summary.lastMinedAt).toBe(0);
  });
});

describe('seanimeWatchLoopByEntry', () => {
  it('rolls cards up onto the library join key', () => {
    const history = [
      historyEntry({ id: 'a', noteId: 1, createdAt: 500, localFilePath: 'C:\\M\\A.mkv' }),
      historyEntry({ id: 'b', noteId: 2, createdAt: 700, localFilePath: 'c:/m/a.mkv' }),
      historyEntry({ id: 'c', noteId: 3, createdAt: 100, localFilePath: 'C:\\M\\B.mkv' }),
    ];
    const byEntry = seanimeWatchLoopByEntry(seanimeWatchLoopCards(history, snapshot([
      interval({ noteId: 1, ivlDays: 2, leech: true }),
      interval({ noteId: 2, ivlDays: 30 }),
    ])));
    // Both spellings of the same file land on one rollup — the whole point of the key.
    expect(byEntry.get('c:/m/a.mkv')).toEqual({
      cards: 2, attention: 1, known: 1, lastMinedAt: 700,
    });
    expect(byEntry.get('c:/m/b.mkv')?.cards).toBe(1);
  });

  it('excludes cards with no path — they have nothing to attach to', () => {
    const byEntry = seanimeWatchLoopByEntry(
      seanimeWatchLoopCards([historyEntry({ localFilePath: '' })], snapshot([])),
    );
    expect(byEntry.size).toBe(0);
  });
});

describe('watchLoopSourceKey', () => {
  it('refuses a playback id — it is a per-session directstream id', () => {
    // Accepting it would make the lookup appear to work within one session, which is
    // exactly when you least need it, and silently answer "never mined" after a restart.
    expect(watchLoopSourceKey({ playbackId: 'stream-abc' })).toBe('');
  });

  it('uses the local file path when there is one', () => {
    expect(watchLoopSourceKey({ localFilePath: 'C:\\M\\A.mkv', playbackId: 'x' }))
      .toBe('file:c:/m/a.mkv');
  });

  it('falls back to media + episode', () => {
    expect(watchLoopSourceKey({ mediaId: 154587, episodeNumber: 1, playbackId: 'x' }))
      .toBe('media:154587:episode:1');
  });

  it('says nothing rather than guessing for an empty source', () => {
    expect(watchLoopSourceKey(null)).toBe('');
    expect(watchLoopSourceKey({})).toBe('');
  });
});

describe('findMinedCueEntry', () => {
  const source = { localFilePath: 'C:\\Media\\Frieren - 01.mkv', playbackId: 'session-2' };
  const cue = { trackNumber: 3, index: 0, startMs: 2148 };

  it('finds a cue mined in an EARLIER session, under a different playback id', () => {
    // This is the whole point: the same file reopened has a brand-new directstream id.
    const history = [historyEntry({ noteId: 1 })];
    expect(findMinedCueEntry(history, source, cue)?.id).toBe('video-core-mine-a');
  });

  it('treats a duplicate as already mined — Anki refused because the note exists', () => {
    const history = [historyEntry({ id: 'dup', status: 'duplicate', noteId: undefined })];
    expect(findMinedCueEntry(history, source, cue)?.id).toBe('dup');
  });

  it('does NOT report an undone card — the line is minable again', () => {
    const history = [historyEntry({ id: 'gone', status: 'undone' })];
    expect(findMinedCueEntry(history, source, cue)).toBeUndefined();
  });

  it('does NOT report a failed mine', () => {
    expect(findMinedCueEntry([historyEntry({ id: 'f', status: 'failed' })], source, cue))
      .toBeUndefined();
  });

  it('returns the newest matching entry, so an undo-then-remine reads correctly', () => {
    const history = [
      historyEntry({ id: 'first', noteId: 1 }),
      historyEntry({ id: 'second', noteId: 2 }),
    ];
    expect(findMinedCueEntry(history, source, cue)?.id).toBe('second');
  });

  it('requires startMs to match, not just the index', () => {
    // Selecting a track mid-playback restarts the stream and re-indexes from the current
    // position, so an index alone can point at a different line across two sessions.
    const history = [historyEntry({ startMs: 6648, index: 0 })];
    expect(findMinedCueEntry(history, source, { trackNumber: 3, index: 0, startMs: 2148 }))
      .toBeUndefined();
  });

  it('does not match the same cue index in a different file', () => {
    const history = [historyEntry({ localFilePath: 'C:\\Media\\Other - 05.mkv' })];
    expect(findMinedCueEntry(history, source, cue)).toBeUndefined();
  });

  it('says nothing when the source has no durable identity', () => {
    const history = [historyEntry({ noteId: 1 })];
    expect(findMinedCueEntry(history, { playbackId: 'only-this' }, cue)).toBeUndefined();
  });

  it('says nothing with no cue', () => {
    expect(findMinedCueEntry([historyEntry({})], source, null)).toBeUndefined();
  });
});

describe('watchLoopReplaySec', () => {
  it('backs off by the lead-in so the first mora is not clipped', () => {
    expect(watchLoopReplaySec({ startMs: 10_000 })).toBeCloseTo(10 - WATCH_LOOP_REPLAY_LEAD_SEC);
  });

  it('never returns a negative position for a cue near the top of the file', () => {
    expect(watchLoopReplaySec({ startMs: 200 })).toBe(0);
  });
});

describe('formatWatchLoopTimestamp', () => {
  it('formats a cue position as m:ss', () => {
    expect(formatWatchLoopTimestamp(2148)).toBe('0:02');
    expect(formatWatchLoopTimestamp(125_000)).toBe('2:05');
    expect(formatWatchLoopTimestamp(0)).toBe('0:00');
  });

  it('clamps a negative position rather than printing a negative clock', () => {
    expect(formatWatchLoopTimestamp(-5)).toBe('0:00');
  });
});
