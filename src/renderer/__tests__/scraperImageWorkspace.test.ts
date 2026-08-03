import { describe, expect, it } from 'vitest';
import type { ImageRow } from '../../shared/scraperResults';
import {
  filterImageRows,
  imageDownloadFilename,
  summarizeImageRows,
} from '../components/scraper/data/imageWorkspace';

const IMAGES: ImageRow[] = [
  {
    id: 'poster-main',
    episodeId: null,
    kind: 'poster',
    width: 1000,
    height: 1500,
    sizeBytes: 200_000,
    format: 'WebP',
    url: '',
    sourceLabel: 'Metadata API',
  },
  {
    id: 'still-01',
    episodeId: 'episode-1',
    kind: 'still',
    width: 1920,
    height: 1080,
    sizeBytes: 500_000,
    format: 'JPEG',
    url: '',
    sourceLabel: 'StreamSB',
  },
];

describe('scraper image workspace helpers', () => {
  it('filters by kind and searchable metadata', () => {
    expect(filterImageRows(IMAGES, 'poster', '')).toEqual([IMAGES[0]]);
    expect(filterImageRows(IMAGES, 'all', 'streamsb')).toEqual([IMAGES[1]]);
    expect(filterImageRows(IMAGES, 'all', '1920x1080')).toEqual([IMAGES[1]]);
  });

  it('builds a safe download filename', () => {
    expect(imageDownloadFilename(IMAGES[1])).toBe('still-episode-1.jpeg');
  });

  it('summarizes providers, size, and episode-linked images', () => {
    expect(summarizeImageRows(IMAGES)).toEqual({
      count: 2,
      totalBytes: 700_000,
      sources: 2,
      episodeLinked: 1,
    });
  });
});
