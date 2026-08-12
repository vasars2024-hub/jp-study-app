import { describe, expect, it } from 'vitest';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';

describe('Scraper Images settings truthfulness', () => {
  const imageFields = SCRAPER_FIELDS.filter((field) => field.group === 'images');

  it('keeps the five runtime-backed controls active', () => {
    expect(
      imageFields.filter((field) => !field.inert).map((field) => field.path),
    ).toEqual([
      'images.downloadThumbnails',
      'images.downloadPosters',
      'images.downloadBanners',
      'images.preferredFormat',
      'images.maxPerEntry',
    ]);
  });

  it('marks every downloader-only value as inert', () => {
    expect(
      imageFields.filter((field) => field.inert).map((field) => [field.path, field.toPath]),
    ).toEqual([
      ['images.minWidth', 'images.minHeight'],
      ['images.skipDuplicatesByHash', undefined],
      ['images.namingTemplate', undefined],
    ]);
  });
});
