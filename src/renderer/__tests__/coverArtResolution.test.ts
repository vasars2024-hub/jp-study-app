import { beforeEach, describe, expect, it } from 'vitest';
import {
  coverFallbackImage,
  coverStyleFor,
  coverUrlFor,
  isCoverBroken,
  markCoverBroken,
  probeCover,
  resetCoverArtCache,
} from '../utils/coverArt';

/**
 * The resolution chain the Reading-workspace plan asks for: cached local art ->
 * art that actually loads -> designed fallback, with failure caching.
 *
 * The middle link is what these cover. A cover path recorded in the library
 * index outlives the file behind it, `media://` then 404s, and a background
 * image has no error event — so before this the card painted nothing at all.
 */
describe('cover resolution', () => {
  beforeEach(() => {
    resetCoverArtCache();
  });

  it('builds a media URL only when both halves of the identity are present', () => {
    expect(coverUrlFor('cover.jpg', 'item-1')).toBe('media://item-1/cover.jpg');
    expect(coverUrlFor('cover.jpg', undefined)).toBeNull();
    expect(coverUrlFor(undefined, 'item-1')).toBeNull();
  });

  it('derives the same fallback for the same title and a different one otherwise', () => {
    expect(coverFallbackImage('とりかえばや')).toBe(coverFallbackImage('とりかえばや'));
    expect(coverFallbackImage('とりかえばや')).not.toBe(coverFallbackImage('悪の教典'));
  });

  it('layers art over the fallback so a cover that fails to paint is not a blank box', () => {
    const style = coverStyleFor('Title', 'cover.jpg', 'item-1');
    expect(style.backgroundImage).toContain('url("media://item-1/cover.jpg")');
    // The gradient must survive as a second layer, not be replaced by the art.
    expect(style.backgroundImage).toContain(coverFallbackImage('Title'));
  });

  it('falls back to the gradient alone when there is no art to try', () => {
    expect(coverStyleFor('Title').backgroundImage).toBe(coverFallbackImage('Title'));
  });

  it('drops a known-broken URL out of the style entirely', () => {
    const url = 'media://item-1/cover.jpg';
    expect(coverStyleFor('Title', 'cover.jpg', 'item-1').backgroundImage).toContain(url);
    markCoverBroken(url);
    expect(coverStyleFor('Title', 'cover.jpg', 'item-1').backgroundImage).toBe(
      coverFallbackImage('Title'),
    );
  });

  it('records a failing probe once and never re-requests that URL', async () => {
    let calls = 0;
    const failing = () => {
      calls += 1;
      return Promise.resolve(false);
    };

    expect(await probeCover('media://a/x.jpg', failing)).toBe(false);
    expect(isCoverBroken('media://a/x.jpg')).toBe(true);

    // A second card mounting the same missing cover must not cost a request.
    expect(await probeCover('media://a/x.jpg', failing)).toBe(false);
    expect(calls).toBe(1);
  });

  it('shares one in-flight probe between concurrent cards', async () => {
    let calls = 0;
    const slow = () => {
      calls += 1;
      return Promise.resolve(true);
    };

    const [a, b] = await Promise.all([
      probeCover('media://a/y.jpg', slow),
      probeCover('media://a/y.jpg', slow),
    ]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(calls).toBe(1);
  });

  it('does not cache a success, so re-imported art is re-tried rather than assumed', async () => {
    let calls = 0;
    const ok = () => {
      calls += 1;
      return Promise.resolve(true);
    };

    expect(await probeCover('media://a/z.jpg', ok)).toBe(true);
    expect(isCoverBroken('media://a/z.jpg')).toBe(false);
    expect(await probeCover('media://a/z.jpg', ok)).toBe(true);
    expect(calls).toBe(2);
  });
});
