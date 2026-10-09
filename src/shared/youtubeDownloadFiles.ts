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

/**
 * The language a sidecar subtitle beside a media file is ranked for: the item's
 * own language when the library knows it, else the study language. Reduced to
 * the base tag (`zh-Hans` -> `zh`) because yt-dlp names its files by base tag
 * (`.zh.vtt`, `.ja.vtt`) and the ranker matches tags literally.
 */
export function sidecarWantedLang(itemLang: string | undefined | null, studyLangTag: string | undefined | null): string {
  const raw = (itemLang?.trim() || studyLangTag?.trim() || 'ja').toLowerCase();
  return raw.split(/[-_]/)[0] || 'ja';
}

/** What a yt-dlp download's file name says about the video it came from. */
export interface YoutubeDownloadIdentity {
  /** The video title, without the ` [id]` suffix yt-dlp appends. */
  title: string;
  youtubeId: string;
}

/**
 * The 11th character of a YouTube video id only carries four bits, so it is
 * one of these sixteen. Checking it turns "an 11-character bracket tag" (which
 * a release group could plausibly use) into "a YouTube id" with 16x fewer false
 * positives, at no cost for real downloads.
 */
const YT_ID_LAST = 'AEIMQUYcgkosw048';

/**
 * Recognise this app's own yt-dlp output name, `'%(title).150B [%(id)s].%(ext)s'`
 * (`main/media.ts`), from a path. Used so a downloaded YouTube video is called by
 * its title — not `Title [dQw4w9WgXcQ].mp4` — on cards mined from it and in
 * Statistics. `null` for anything else.
 */
export function youtubeIdentityFromPath(filePath: string | undefined | null): YoutubeDownloadIdentity | null {
  const base = (filePath ?? '').split(/[\\/]/).pop() ?? '';
  const match = /^(.*\S)\s\[([A-Za-z0-9_-]{11})\]\.[A-Za-z0-9]{2,5}$/.exec(base);
  if (!match) return null;
  const youtubeId = match[2];
  if (!YT_ID_LAST.includes(youtubeId[10])) return null;
  return { title: match[1].trim(), youtubeId };
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
