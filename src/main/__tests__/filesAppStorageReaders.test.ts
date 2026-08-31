import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readMediaSubtitleAssets,
  readSubtitleLibraryOrphanAssets,
  readYoutubeSubtitleCacheAssets,
} from '../filesApp/storageReaders';

let root = '';

function write(relativePath: string, contents = 'subtitle'): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-app-storage-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Files app text storage readers', () => {
  it('recurses both YouTube cache layouts and ignores non-subtitle payloads', () => {
    write('yt-subs/playlist/video.a.ja.vtt');
    write('yt-subs/playlist/video.info.json');
    write('subs-cache/media-id/deep/human.ja.srt');

    const assets = readYoutubeSubtitleCacheAssets(root);

    expect(assets.map((asset) => asset.id)).toEqual([
      'youtube-subtitle:yt-subs:playlist/video.a.ja.vtt',
      'youtube-subtitle:subs-cache:media-id/deep/human.ja.srt',
    ]);
    expect(assets.map((asset) => asset.provenance)).toEqual([
      'auto-captions',
      'human-subs',
    ]);
  });

  it('returns an honest empty list when neither cache exists', () => {
    expect(readYoutubeSubtitleCacheAssets(root)).toEqual([]);
  });

  it('resolves relative records, preserves external sidecars and derives provenance', () => {
    const external = write('outside/external.ass');
    const stored = {
      items: [
        {
          id: 'episode-1',
          title: 'Episode One',
          subtitles: [
            {
              id: 'whisper',
              lang: 'ja',
              source: 'generated',
              format: 'srt',
              path: 'subtitles/episode-1/whisper.srt',
              machineGenerated: true,
              addedAt: 10,
            },
            {
              id: 'sidecar',
              lang: 'ja',
              source: 'sidecar',
              format: 'ass',
              path: external,
              external: true,
              addedAt: 20,
            },
          ],
        },
      ],
    };

    const assets = readMediaSubtitleAssets(root, stored);

    expect(assets.map((asset) => asset.provenance)).toEqual([
      'whisper-transcript',
      'human-subs',
    ]);
    expect(assets[0].filePath).toBe(path.join(root, 'subtitles/episode-1/whisper.srt'));
    expect(assets[1].filePath).toBe(external);
    expect(assets.map((asset) => asset.createdAt)).toEqual([10, 20]);
  });

  it('reports subtitle files under subtitles/ that no record claims, once each', () => {
    const claimed = write('subtitles/v1/published.ja.srt');
    write('subtitles/v1/fused-ja.whisper-only.srt');
    write('subtitles/v1/fused-ja.meta.json', '{}');

    const orphans = readSubtitleLibraryOrphanAssets(root, [claimed]);

    expect(orphans.map((asset) => asset.name)).toEqual(['fused-ja.whisper-only.srt']);
    expect(orphans[0].orphan).toBe(true);
    expect(orphans[0].provenance).toBe('unknown');
  });

  it('matches a claimed path case-insensitively, the way Windows resolves it', () => {
    const claimed = write('subtitles/v1/Published.JA.srt');

    // The record and the directory walk produce the same file under different
    // spellings; a case-sensitive compare would report the published track as
    // an orphan and double-count it in the tree.
    expect(readSubtitleLibraryOrphanAssets(root, [claimed.toUpperCase()])).toEqual([]);
  });

  it('an absent subtitles/ directory is an honest empty, not a throw', () => {
    expect(readSubtitleLibraryOrphanAssets(root, [])).toEqual([]);
  });
});
