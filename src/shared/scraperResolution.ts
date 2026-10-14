// A release's or an episode link's resolution, read from its name.
//
// Pure, shared by the torrent index parser (main/scraper/torrents.ts) and the
// engine's site-rule rows. Blank when the text does not say: the Resolution
// column is read as a fact about the file, so a guess is worse than nothing.

/** `[Group] Title - 01 (1080p)` → `1080p`; `1920x1080` → `1080p`; `4K` → `2160p`. */
export function parseResolution(name: string): string {
  const explicit = /\b(\d{3,4})[pP]\b/.exec(name ?? '');
  if (explicit) return `${explicit[1]}p`;
  const dimensions = /\b\d{3,4}\s*[xX×]\s*(\d{3,4})\b/.exec(name ?? '');
  if (dimensions) return `${dimensions[1]}p`;
  if (/\b(4k|uhd)\b/i.test(name ?? '')) return '2160p';
  return '';
}
