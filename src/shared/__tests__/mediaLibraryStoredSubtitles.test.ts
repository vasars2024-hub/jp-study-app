import { describe, expect, it } from 'vitest';
import { mediaSubtitleRecordsFromStoredDocument } from '../mediaLibraryEntries';

describe('media library persisted subtitle reader', () => {
  it('retains the owning media identity while flattening subtitle records', () => {
    const rows = mediaSubtitleRecordsFromStoredDocument({
      items: [
        {
          id: 'episode-1',
          title: 'Episode One',
          fileName: 'ep1.mkv',
          subtitles: [
            {
              id: 'ja-human',
              lang: 'ja',
              source: 'provider',
              format: 'srt',
              path: 'subtitles/episode-1/ja-human.srt',
              addedAt: 10,
            },
            {
              id: 'ja-whisper',
              lang: 'ja',
              source: 'generated',
              format: 'srt',
              path: 'subtitles/episode-1/ja-whisper.srt',
              machineGenerated: true,
              derivation: 'whisper',
              addedAt: 20,
            },
          ],
        },
      ],
    });

    expect(rows.map((row) => [row.mediaId, row.mediaTitle, row.record.id])).toEqual([
      ['episode-1', 'Episode One', 'ja-human'],
      ['episode-1', 'Episode One', 'ja-whisper'],
    ]);
  });

  it('accepts a legacy array document and skips malformed records', () => {
    const rows = mediaSubtitleRecordsFromStoredDocument([
      {
        id: 'legacy',
        fileName: 'legacy.mkv',
        subtitles: [
          null,
          { id: 'missing-path', source: 'sidecar' },
          { id: 'valid', path: 'outside/legacy.srt', source: 'sidecar' },
        ],
      },
      { id: 42, subtitles: [{ id: 'ignored', path: 'ignored.srt' }] },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].mediaTitle).toBe('legacy.mkv');
    expect(rows[0].record.id).toBe('valid');
  });
});
