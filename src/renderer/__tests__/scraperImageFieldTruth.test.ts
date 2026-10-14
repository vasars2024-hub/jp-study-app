import { describe, expect, it } from 'vitest';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';

describe('Scraper Images settings truthfulness', () => {
  const imageFields = SCRAPER_FIELDS.filter((field) => field.group === 'images');

  it('offers exactly the five runtime-backed controls', () => {
    expect(
      imageFields.map((field) => field.path),
    ).toEqual([
      'images.downloadThumbnails',
      'images.downloadPosters',
      'images.downloadBanners',
      'images.preferredFormat',
      'images.maxPerEntry',
    ]);
  });

  it('offers none of the downloader-only values (v1 removed them rather than mark them inert)', () => {
    // The scraper keeps artwork URLs and never downloads image bytes, so a
    // minimum pixel size, a byte hash and a file-naming template had nothing
    // to act on.
    const paths = imageFields.flatMap((field) => [field.path, field.toPath]);
    for (const gone of ['images.minWidth', 'images.minHeight', 'images.skipDuplicatesByHash', 'images.namingTemplate']) {
      expect(paths).not.toContain(gone);
    }
  });
});
