// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { artworkName } from '../mediaProviderClients';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, net: { request: () => undefined } }));

describe('artworkName', () => {
  it('is stable for the same series and match', () => {
    expect(artworkName('poster', 'the big o', 'jikan:567'))
      .toBe(artworkName('poster', 'the big o', 'jikan:567'));
  });

  it('changes when the match changes, so a re-match cannot reuse cached art', () => {
    // The bug this guards: `downloadArtwork` returns early when the file exists,
    // so naming art after the series alone meant "Change match" updated the title
    // and synopsis but kept the previous show's poster.
    expect(artworkName('poster', 'the big o', 'jikan:567'))
      .not.toBe(artworkName('poster', 'the big o', 'jikan:129608'));
  });

  it('separates posters from banners for one match', () => {
    expect(artworkName('poster', 'x', 'jikan:1')).not.toBe(artworkName('banner', 'x', 'jikan:1'));
  });

  it('separates different series', () => {
    expect(artworkName('poster', 'a', 'jikan:1')).not.toBe(artworkName('poster', 'b', 'jikan:1'));
  });

  it('stays filesystem-safe whatever the inputs contain', () => {
    const name = artworkName('poster', ['C:', 'odd', 'name *?<>|'].join('/'), 'anilist:1');
    expect(name).toMatch(/^poster-[0-9a-f]{16}$/);
  });

  it('still works without a match id, for callers that have none', () => {
    expect(artworkName('poster', 'x')).toMatch(/^poster-[0-9a-f]{16}$/);
  });
});
