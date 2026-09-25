/**
 * Pure helpers for the YouTube manager's downloads (audit r2 #17, #20), kept
 * out of `main/media.ts` so they are testable without Electron.
 */

/**
 * Whether a downloaded subtitle file is an auto caption: its language tag is
 * not among the creator's own tracks. `manualLangs` are the keys of yt-dlp's
 * `subtitles` (never `automatic_captions`).
 */
export function subtitleIsAutoCaption(pickedName: string, manualLangs: readonly string[]): boolean {
  const parts = pickedName.toLowerCase().split('.');
  const tag = parts.length >= 3 ? parts[parts.length - 2] : '';
  if (!tag) return false;
  return !manualLangs.some((raw) => {
    const lang = raw.toLowerCase();
    return tag === lang || tag.startsWith(`${lang}-`) || lang.startsWith(`${tag}-`);
  });
}

/** Partial files a cancelled download leaves in the download folder, by video id. */
export function partialDownloadFiles(names: readonly string[], youtubeId: string): string[] {
  if (!youtubeId) return [];
  const marker = `[${youtubeId}]`;
  return names.filter(
    (name) =>
      name.includes(marker) &&
      (/\.(part|ytdl|temp)$/i.test(name) || /\.part-Frag\d+$/i.test(name) || /\.f\d+\.[a-z0-9]+(\.part)?$/i.test(name)),
  );
}
