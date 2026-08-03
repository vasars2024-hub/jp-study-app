// The Images settings group, over what this backend actually has.
//
// Read the group's labels literally and they describe an image *downloader*:
// "Download Thumbnails", a naming template, duplicate detection by hash, a
// minimum pixel size. There is no downloader here. Nothing in src/main/scraper
// writes an image to disk, and the only fetch an image ever gets is the
// renderer resolving an <img> in the Images tab.
//
// So the honest reading of the three "Download …" switches is the one that
// happens to be literally true: they decide whether the run *collects* that
// image at all, and collecting is what causes the fetch. Turn Download Posters
// off and no poster row is produced, nothing renders it, and no bytes move.
//
// What is here, and what is not:
//
//   downloadPosters / Banners / Thumbnails → whether the row exists.
//   maxPerEntry                            → a ceiling on the list.
//   preferredFormat                        → picks among the variants a provider
//                                            published, falling back to the
//                                            canonical URL rather than inventing
//                                            one.
//
//   minWidth / minHeight    — a catalogue publishes a URL, not a pixel size.
//     Measuring means downloading every image on every run to apply a filter
//     that would never reject anything a catalogue served.
//   skipDuplicatesByHash    — "by hash" means the bytes. Collapsing rows whose
//     URL happens to match is a different, weaker check, and calling it hash
//     de-duplication would be the lie this group is otherwise free of.
//   namingTemplate          — names files nothing writes.

import type { ImageRow } from '../../shared/scraperResults';
import type { ScraperImageSettings } from '../../shared/scraperOutputSettings';
import type { CatalogueEpisode, CatalogueWork } from './catalogue';

/** `…/cover.webp?x=1` → `webp`. '' when the URL names no format. */
export function formatOf(url: string): string {
  const match = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url);
  if (!match) return '';
  const value = match[1].toLowerCase();
  return value === 'jpeg' ? 'jpg' : value;
}

/**
 * The cover URL to use, honouring `preferredFormat`.
 *
 * 'original' means "whatever the provider calls canonical", which is what
 * `posterUrl` already is. Any other choice is a preference, not a demand: a
 * provider that published only a JPEG still gets used when WebP is preferred,
 * because the alternative is a result with no poster in it.
 */
export function posterUrlFor(work: CatalogueWork, preferred: string): string {
  if (preferred && preferred !== 'original') {
    // Optional at runtime as well as in the type: a work read back from a cache
    // written before variants existed has no such key, and a preference is not
    // worth throwing over.
    const variant = work.posterVariants?.[preferred];
    if (variant) return variant;
  }
  return work.posterUrl;
}

/**
 * The image an episode *row* shows beside itself.
 *
 * The episode's own still where the provider has one, and the series poster
 * otherwise — which is what every row carried before this group had a consumer,
 * so turning the setting on changes nothing for a user who never touched it.
 *
 * The poster fallback stops here. It is not offered as an `ImageRow` of kind
 * 'thumbnail' below: a row label claims the image *is* a thumbnail of that
 * episode, and twenty-eight identical posters under that heading would be a
 * statement about what the run found that is simply untrue.
 */
export function episodeThumbnailFor(
  episode: CatalogueEpisode,
  work: CatalogueWork,
  images: ScraperImageSettings,
): string {
  if (!images.downloadThumbnails) return '';
  return episode.thumbnailUrl || posterUrlFor(work, images.preferredFormat);
}

/**
 * The Images tab's rows for one run.
 *
 * Ordered posters, then banners, then episode stills, so `maxPerEntry` cuts the
 * least important first rather than whichever the provider happened to list
 * last.
 */
export function buildImageRows(
  work: CatalogueWork,
  seriesId: string,
  episodes: CatalogueEpisode[],
  images: ScraperImageSettings,
  sourceLabel: string,
): ImageRow[] {
  const rows: ImageRow[] = [];

  if (images.downloadPosters) {
    const url = posterUrlFor(work, images.preferredFormat);
    if (url) {
      rows.push({
        id: `${seriesId}-poster`,
        episodeId: null,
        kind: 'poster',
        // The catalogue publishes the URL, not the pixel size or the byte
        // count; measuring either would mean fetching every image on every run.
        width: 0,
        height: 0,
        sizeBytes: 0,
        format: formatOf(url),
        url,
        sourceLabel,
      });
    }
  }

  if (images.downloadBanners && work.bannerUrl) {
    rows.push({
      id: `${seriesId}-banner`,
      episodeId: null,
      kind: 'banner',
      width: 0,
      height: 0,
      sizeBytes: 0,
      format: formatOf(work.bannerUrl),
      url: work.bannerUrl,
      sourceLabel,
    });
  }

  if (images.downloadThumbnails) {
    for (const episode of episodes) {
      if (!episode.thumbnailUrl) continue;
      rows.push({
        id: `${seriesId}-e${episode.number}-thumb`,
        episodeId: `${seriesId}-e${episode.number}`,
        kind: 'thumbnail',
        width: 0,
        height: 0,
        sizeBytes: 0,
        format: formatOf(episode.thumbnailUrl),
        url: episode.thumbnailUrl,
        sourceLabel,
      });
    }
  }

  // 0 is a real answer — "collect none" — and not a disabled ceiling.
  return images.maxPerEntry >= 0 ? rows.slice(0, images.maxPerEntry) : rows;
}
