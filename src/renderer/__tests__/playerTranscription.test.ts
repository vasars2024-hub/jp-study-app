import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureLibraryItemForPath,
  findLibraryItemForPath,
  latestWhisperRecord,
  persistPlayerSubtitle,
  playerWhisperErrorKey,
  playerWhisperView,
  subtitleImportFormat,
} from '../../media/playerTranscription';
import type { TranscriptionProgress } from '../../shared/transcriptionIpc';
import type { MediaItem } from '../../shared/types';
import type { SubtitleRecord } from '../../shared/subtitleRecord';

function progress(partial: Partial<TranscriptionProgress>): TranscriptionProgress {
  return { mediaId: 'm1', title: 'Show', phase: 'queued', done: 0, total: 0, startedAt: 0, ...partial };
}

function item(partial: Partial<MediaItem> & { id: string; path: string }): MediaItem {
  return { title: partial.id, fileName: `${partial.id}.mkv`, addedAt: 0, ...partial } as MediaItem;
}

function record(partial: Partial<SubtitleRecord> & { id: string }): SubtitleRecord {
  return {
    lang: 'ja',
    source: 'generated',
    format: 'srt',
    path: `subs/${partial.id}.srt`,
    addedAt: 0,
    ...partial,
  } as SubtitleRecord;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playerWhisperView', () => {
  it('maps queue phases onto the player controls', () => {
    expect(playerWhisperView(progress({ phase: 'queued' }))).toMatchObject({ state: 'loading', messageKey: 'media.jobs.phase.queued' });
    expect(playerWhisperView(progress({ phase: 'extracting-audio' }))).toMatchObject({ state: 'extracting' });
    expect(playerWhisperView(progress({ phase: 'transcribing', done: 3, total: 12 }))).toEqual({
      state: 'transcribing',
      progress: 0.25,
      messageKey: 'studyLoop2.whisper.chunks',
      messageParams: { done: 3, total: 12 },
    });
    expect(playerWhisperView(progress({ phase: 'transcribing' }))).toMatchObject({ progress: 0, messageKey: 'media.jobs.phase.transcribing' });
    expect(playerWhisperView(progress({ phase: 'done', done: 12, total: 12 })).state).toBe('done');
    expect(playerWhisperView(progress({ phase: 'cancelled' })).state).toBe('idle');
  });

  it('turns queue error codes into sentences', () => {
    expect(playerWhisperView(progress({ phase: 'error', error: 'no-window' }))).toMatchObject({
      state: 'error',
      messageKey: 'studyLoop2.whisper.noHost',
    });
    expect(playerWhisperErrorKey('item-not-found')).toBe('mediaWorkspace.study.whisperLocalOnly');
    expect(playerWhisperErrorKey('anything else')).toBe('mediaWorkspace.study.whisperFailed');
  });
});

describe('library lookups', () => {
  it('matches the playing file regardless of slash direction and case', () => {
    const items = [item({ id: 'a', path: 'C:\\Anime\\Show 01.mkv' }), item({ id: 'b', path: 'C:/Anime/Show 02.mkv' })];
    expect(findLibraryItemForPath(items, 'c:/anime/show 01.mkv')?.id).toBe('a');
    expect(findLibraryItemForPath(items, 'C:/Anime/Show 03.mkv')).toBeNull();
  });

  it('picks the newest Whisper transcript in the job language, never a fused or translated track', () => {
    const subtitles = [
      record({ id: 'old', addedAt: 1 }),
      record({ id: 'new', addedAt: 5, derivation: 'whisper' }),
      record({ id: 'fused', addedAt: 9, derivation: 'en-ja-fusion' }),
      record({ id: 'mt', addedAt: 9, derivation: 'machine-translation' }),
      record({ id: 'english', addedAt: 9, lang: 'en' }),
      record({ id: 'human', addedAt: 9, source: 'jimaku' as SubtitleRecord['source'] }),
    ];
    expect(latestWhisperRecord({ subtitles }, 'ja')?.id).toBe('new');
    expect(latestWhisperRecord({ subtitles }, 'zh')).toBeNull();
    expect(latestWhisperRecord(null, 'ja')).toBeNull();
  });

  it('knows which subtitle files can be attached', () => {
    expect(subtitleImportFormat('Show.ja.SRT')).toBe('srt');
    expect(subtitleImportFormat('show.ass')).toBe('ass');
    expect(subtitleImportFormat('show.sub')).toBeNull();
  });
});

describe('window.api glue', () => {
  it('adds the file to the library when it is not there, then attaches the subtitle text', async () => {
    const attach = vi.fn(async () => ({ ok: true, message: '' }));
    const added = item({ id: 'new-item', path: 'C:/v/ep1.mkv' });
    vi.stubGlobal('window', {
      api: {
        listMedia: async () => [],
        addMediaPaths: vi.fn(async () => [added]),
        attachSubtitleText: attach,
      },
    });
    expect(await ensureLibraryItemForPath('C:/v/ep1.mkv')).toBe(added);
    const outcome = await persistPlayerSubtitle({
      videoPath: 'C:/v/ep1.mkv',
      fileName: 'ep1.ja.srt',
      text: '1\n00:00:01,000 --> 00:00:02,000\n猫\n',
      lang: 'ja',
    });
    expect(outcome).toBe('saved');
    expect(attach).toHaveBeenCalledWith({
      mediaId: 'new-item',
      text: '1\n00:00:01,000 --> 00:00:02,000\n猫\n',
      format: 'srt',
      lang: 'ja',
      label: 'ep1.ja.srt',
    });
  });

  it('reports a refused or unsupported attach instead of claiming it saved', async () => {
    vi.stubGlobal('window', {
      api: {
        listMedia: async () => [item({ id: 'x', path: 'C:/v/ep1.mkv' })],
        attachSubtitleText: async () => ({ ok: false, message: 'too large' }),
      },
    });
    expect(await persistPlayerSubtitle({ videoPath: 'C:/v/ep1.mkv', fileName: 'a.srt', text: 'x', lang: 'ja' })).toBe('failed');
    expect(await persistPlayerSubtitle({ videoPath: 'C:/v/ep1.mkv', fileName: 'a.sub', text: 'x', lang: 'ja' })).toBe('unsupported');
  });
});
