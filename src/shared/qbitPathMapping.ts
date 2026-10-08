/**
 * Remote -> local path mapping for a qBittorrent that runs somewhere else.
 *
 * A client in Docker or on a NAS reports its own view of the disk
 * (`/downloads/Show/ep01.mkv`), which does not exist on this machine. The
 * user's mappings name the same folder as this machine sees it
 * (`\\\\nas\\torrents` or `D:\\Torrents`), and every path read from the client is
 * translated before it is joined, statted or watched.
 *
 * Matching is by whole path segments, separator-insensitive, and
 * case-insensitive when the remote side is a Windows path (drive letter or
 * UNC). The longest matching prefix wins, so `/data` and `/data/anime` can map
 * to different places.
 */

import type { ScraperQbitPathMapping } from './scraperSourceSettings';

function isWindowsLike(value: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/\/)/.test(value);
}

function segmentsOf(value: string): string[] {
  return value.replace(/\\/g, '/').split('/').filter(Boolean);
}

/** The separator the local side is written with. */
function localSeparator(local: string): '/' | '\\' {
  if (/^[a-zA-Z]:\\|^\\\\/.test(local)) return '\\';
  if (/^[a-zA-Z]:\//.test(local)) return '/';
  return local.includes('\\') ? '\\' : '/';
}

/**
 * `value` with its longest matching remote prefix replaced by that mapping's
 * local folder, or `value` unchanged when nothing matches (a local client, or a
 * path outside every mapping).
 */
export function mapQbitPath(value: string, mappings: readonly ScraperQbitPathMapping[] | undefined): string {
  if (!value || !mappings?.length) return value;
  const valueParts = segmentsOf(value);
  let best: { mapping: ScraperQbitPathMapping; depth: number } | null = null;
  for (const mapping of mappings) {
    if (!mapping?.remote || !mapping?.local) continue;
    // A POSIX remote never matches a Windows path, nor the other way round.
    if (isWindowsLike(mapping.remote) !== isWindowsLike(value)) continue;
    const prefix = segmentsOf(mapping.remote);
    if (prefix.length > valueParts.length) continue;
    const fold = isWindowsLike(mapping.remote);
    const same = prefix.every((part, index) => (fold
      ? part.toLowerCase() === valueParts[index].toLowerCase()
      : part === valueParts[index]));
    if (!same) continue;
    // `/` (zero segments) is a legitimate catch-all, but loses to anything deeper.
    if (!best || prefix.length > best.depth) best = { mapping, depth: prefix.length };
  }
  if (!best) return value;
  const rest = valueParts.slice(best.depth);
  if (!rest.length) return best.mapping.local;
  const local = best.mapping.local.replace(/[\\/]+$/, '');
  const sep = localSeparator(best.mapping.local);
  return `${local}${sep}${rest.join(sep)}`;
}
