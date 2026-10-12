// @vitest-environment jsdom
/**
 * YouTube 7.5: whatever surface mined a line from a downloaded YouTube video,
 * the card gets the video's title, the scene as m:ss and a `&t=` watch link.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetYt5MediaCache, yt5EnrichMineInput, yt5MayEnrichMine, type Yt5MineLike } from '../youtubeStudy5Mining';

const VID = 'dQw4w9WgXcQ';

beforeEach(() => {
  resetYt5MediaCache();
  (window as unknown as { api: unknown }).api = {
    listMedia: async () => [
      { id: 'm1', title: 'NHK やさしい', path: 'C:\\yt\\nhk.mp4', fileName: 'nhk.mp4', addedAt: 1, youtubeId: VID },
      { id: 'm2', title: 'Local anime', path: 'C:\\anime\\ep1.mkv', fileName: 'ep1.mkv', addedAt: 1 },
    ],
  };
});

describe('YouTube mining metadata', () => {
  it('links a player-mined line from a downloaded YouTube file back to the scene', async () => {
    const out = await yt5EnrichMineInput<Yt5MineLike>({
      source: 'subtitle',
      sourceUrl: 'C:\\yt\\nhk.mp4',
      sourceRef: { mediaId: 'media-x', cueStartSec: 83.4 },
    });
    expect(out.sourceTitle).toBe('NHK やさしい');
    expect(out.sceneReference).toBe('1:23');
    expect(out.sourceRef).toMatchObject({ mediaId: 'media-x', cueStartSec: 83.4, webUrl: `https://www.youtube.com/watch?v=${VID}&t=83s` });
  });

  it('keeps a title and scene the surface already set', async () => {
    const out = await yt5EnrichMineInput<Yt5MineLike>({
      source: 'subtitle',
      sourceUrl: 'C:\\yt\\nhk.mp4',
      sourceTitle: 'Kept',
      sceneReference: 'Ep 1',
      sourceRef: { mediaId: 'm1', cueStartSec: 5 },
    });
    expect(out).toMatchObject({ sourceTitle: 'Kept', sceneReference: 'Ep 1' });
    expect(out.sourceRef?.webUrl).toContain('&t=5s');
  });

  it('reads a YouTube URL directly, without the library', async () => {
    (window as unknown as { api: unknown }).api = {};
    const out = await yt5EnrichMineInput<Yt5MineLike>({ source: 'extension', sourceUrl: `https://youtu.be/${VID}?t=61` });
    expect(out.sceneReference).toBe('1:01');
    expect(out.sourceRef?.webUrl).toBe(`https://www.youtube.com/watch?v=${VID}&t=61s`);
  });

  it('leaves everything else untouched, and skips the lookup when it cannot apply', async () => {
    const local: Yt5MineLike = { source: 'subtitle', sourceUrl: 'C:\\anime\\ep1.mkv', sourceRef: { mediaId: 'm2', cueStartSec: 3 } };
    await expect(yt5EnrichMineInput(local)).resolves.toBe(local);
    expect(yt5MayEnrichMine({ source: 'media', sourceId: 'vn:sg' })).toBe(false);
    expect(yt5MayEnrichMine({ source: 'subtitle', sourceRef: { mediaId: 'x', webUrl: 'https://x' } })).toBe(false);
  });
});
