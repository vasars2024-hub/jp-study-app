/**
 * Why the Video surface's three action buttons are disabled — as ordered rules
 * rather than a constant.
 *
 * The category-8 sweep scored three mute pairs on Video: `Subtitles` and
 * `Generate` in the topbar (`MediaCenterView.tsx`) and `Download & transcribe`
 * in the YouTube bar (`MediaContent.tsx`). All three are captioned buttons, so
 * unlike Media Center's arrows nothing was wrong with their NAMES — the user
 * could read exactly what each one does and still had nothing telling them why
 * it was grey.
 *
 * The rules live here, next to `agentComposerReason.ts` and for the same
 * reason, rather than inline in either component: two of the three have more
 * than one condition, so there is a PRIORITY, and a priority that is not in a
 * module is a priority nothing can test. Returning i18n KEYS keeps this file
 * free of English.
 */

/**
 * `undefined` means the button is ENABLED. Both shells derive `disabled` from
 * this rather than repeating the condition list, so the two can never disagree
 * and a button that is greyed out with no reason is not expressible.
 */
export function videoSubtitlesDisabledReason(s: { hasSource: boolean }): string | undefined {
  if (!s.hasSource) return 'mediaCenter.video.reason.noVideo';
  return undefined;
}

export function videoGenerateDisabledReason(
  s: { hasSource: boolean; generating: boolean },
): string | undefined {
  // The precondition comes first. In practice `generating` cannot be true
  // without a source, so the two orders agree today — it is written this way so
  // that if generation ever becomes startable some other way, the answer is
  // still "open a video" and not a report about a run the user did not start.
  if (!s.hasSource) return 'mediaCenter.video.reason.noVideo';
  if (s.generating) return 'mediaCenter.video.reason.generating';
  return undefined;
}

/**
 * Here the order is load-bearing rather than defensive, and it is the whole
 * reason this is a function. The URL input is disabled by the same running
 * download that disables the button, so during a run the user CANNOT type —
 * and the URL may legitimately be empty at that moment. Reporting "paste a
 * link" would then be advice they are physically unable to follow, about a
 * field the app itself has locked. The running download is the live fact and
 * wins.
 */
export function youtubeDownloadDisabledReason(
  s: { url: string; downloading: boolean },
): string | undefined {
  if (s.downloading) return 'media.yt.reason.busy';
  if (!s.url.trim()) return 'media.yt.reason.noUrl';
  return undefined;
}

/** Every key the three rules can return, so a catalog test can assert all of them. */
export const MEDIA_VIDEO_ACTION_REASON_KEYS = [
  'mediaCenter.video.reason.noVideo',
  'mediaCenter.video.reason.generating',
  'media.yt.reason.busy',
  'media.yt.reason.noUrl',
] as const;
