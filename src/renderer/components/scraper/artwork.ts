const ARTWORK = [
  new URL('../../assets/scraper/anime-dawn.svg', import.meta.url).href,
  new URL('../../assets/scraper/anime-swordsman.svg', import.meta.url).href,
  new URL('../../assets/scraper/anime-storm.svg', import.meta.url).href,
  new URL('../../assets/scraper/anime-harbor.svg', import.meta.url).href,
  new URL('../../assets/scraper/anime-island.svg', import.meta.url).href,
] as const;

export const SCRAPER_POSTER = new URL(
  '../../assets/scraper/anime-poster.svg',
  import.meta.url,
).href;

export function scraperArtwork(index: number): string {
  return ARTWORK[Math.abs(index) % ARTWORK.length];
}
