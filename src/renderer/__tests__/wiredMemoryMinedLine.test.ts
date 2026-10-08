// @vitest-environment jsdom
/**
 * "The Wired remembers" the last line mined from a video: the newest of the
 * deck's player-mined cards and the player's mining history, with its show
 * title and time. Failed and undone history entries are not kept lines.
 */
import { describe, expect, it } from 'vitest';
import { latestMinedLine } from '../wiredMechanics/memoryFeed';
import type { VideoCoreMiningHistoryEntry } from '../../shared/videoCoreMining';

function entry(over: Partial<VideoCoreMiningHistoryEntry> & { title?: string; episode?: number }): VideoCoreMiningHistoryEntry {
  const { title, episode, ...rest } = over;
  return {
    id: `h-${rest.createdAt ?? 0}`,
    createdAt: 0,
    status: 'exported',
    term: '猫',
    sentence: '猫がいる',
    provenance: {
      schemaVersion: 1,
      cue: { index: 1, trackNumber: 1, rawText: '', text: '', startMs: 0, endMs: 1000 },
      source: {
        playbackId: 'p',
        playbackType: 'localfile',
        streamType: 'file',
        ...(title ? { mediaTitle: title } : {}),
        ...(episode != null ? { episodeNumber: episode } : {}),
      },
      assets: {},
      capturedAt: 0,
    },
    ...rest,
  };
}

describe('latestMinedLine', () => {
  it('is null with nothing mined from video', () => {
    expect(latestMinedLine([{ source: 'epub', sentence: '本の文', addedAt: 5 }], [])).toBeNull();
  });

  it('takes a player-mined deck card with its show title', () => {
    expect(latestMinedLine([
      { source: 'media', sentence: ' 古い行 ', bookTitle: 'Show A', addedAt: 10 },
      { source: 'media', sentence: '新しい行', bookTitle: 'Show B', addedAt: 20 },
      { source: 'media', sentence: '', bookTitle: 'Show C', addedAt: 30 },
    ], [])).toEqual({ sentence: '新しい行', title: 'Show B', at: 20 });
  });

  it('prefers a newer history entry, titled with its episode', () => {
    const line = latestMinedLine(
      [{ source: 'media', sentence: 'デッキの行', bookTitle: 'Show', addedAt: 10 }],
      [entry({ createdAt: 40, sentence: '履歴の行', title: 'Frieren', episode: 3 })],
    );
    expect(line).toEqual({ sentence: '履歴の行', title: 'Frieren #3', at: 40 });
  });

  it('skips failed and undone mines, and reports an untitled source as null', () => {
    const line = latestMinedLine([], [
      entry({ createdAt: 10, sentence: '残った行' }),
      entry({ createdAt: 50, sentence: '失敗', status: 'failed' }),
      entry({ createdAt: 60, sentence: '取り消し', status: 'undone' }),
    ]);
    expect(line).toEqual({ sentence: '残った行', title: null, at: 10 });
  });
});
