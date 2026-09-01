/**
 * MINING gates 1 and 2 — choosing which DUB to download.
 *
 * The gap the plan recorded (`MINING_UNIFICATION_PLAN.md`, "Gaps", item 1):
 * `YouTubeDownloadOptions` carried no audio-language field at all and
 * `main/media.ts` hardcoded `-f ba[ext=m4a]/ba/b`, so yt-dlp always took the
 * video's default audio track. A multi-dub video — the ordinary case for anime
 * on YouTube — could not be fetched in Japanese.
 *
 * Two decisions are encoded here rather than in `main/media.ts`, and both are
 * load-bearing for the gates:
 *
 * 1. **Selection is by exact format id, resolved from a `yt-dlp -J` probe** —
 *    NOT by a filter expression such as `ba[language^=ja]`. Gate 1 requires the
 *    result be "proven by the selected track's language, not by the flag being
 *    set". A filter expression is only the flag again: nothing in the output
 *    says which track it matched. Probing first means the language comes from
 *    the video's own manifest, and the chosen `format_id` can be compared
 *    against the one yt-dlp reports it actually used.
 *
 * 2. **A missing dub REFUSES by name; it never falls back.** Gate 2 is the
 *    negative control for gate 1, and the failure mode it exists to catch is
 *    the quiet one: `-f 'ba[language^=ja]/ba/b'` downloads the English track
 *    and reports success. So once a specific language is asked for, the plan
 *    is either that exact track or a refusal naming what the video does have.
 *
 * Pure: no `fs`, no `child_process`, no `electron`. The caller runs yt-dlp and
 * hands the parsed formats in; this decides.
 */

import type { YouTubeAudioLang } from './types';

/**
 * The audio languages the picker offers. Deliberately the same four study
 * languages as `YouTubeSubtitleLang`, so the download row reads as one control
 * set — plus `original`, which is NOT the subtitle list's `none`: a video
 * download always has audio, so "don't pick" means "whatever the uploader made
 * primary", not "omit the track".
 */
export const YOUTUBE_AUDIO_LANGS = ['original', 'ja', 'zh', 'en', 'ru'] as const;

export function isYouTubeAudioLang(value: unknown): value is YouTubeAudioLang {
  return typeof value === 'string' && (YOUTUBE_AUDIO_LANGS as readonly string[]).includes(value);
}

/**
 * `original` is the default and is byte-for-byte today's behaviour: an absent,
 * unknown or explicitly-original value must produce the exact same yt-dlp args
 * the app shipped before this field existed.
 */
export function normalizeYouTubeAudioLang(value: unknown): YouTubeAudioLang {
  return isYouTubeAudioLang(value) ? value : 'original';
}

/** One audio-bearing format as yt-dlp's `-J` reports it. Extra keys are ignored. */
export interface YtDlpFormat {
  format_id?: string | null;
  /** BCP-47-ish: `ja`, `ja-JP`, `en-US`, `zh-Hans`. Often null on muxed formats. */
  language?: string | null;
  /** `'none'` on video-only formats. */
  acodec?: string | null;
  /** `'none'` on audio-only formats. */
  vcodec?: string | null;
  /** Audio bitrate; used only to rank equally-valid tracks. */
  abr?: number | null;
  ext?: string | null;
  format_note?: string | null;
}

/** An audio track this module is willing to name. */
export interface YtAudioTrack {
  formatId: string;
  /** The manifest's own tag, unmodified — this is what gate 1 reports. */
  language: string;
  abr: number | null;
  ext: string | null;
  /** True when yt-dlp flags this as the uploader's primary track. */
  isOriginal: boolean;
}

/**
 * Match a manifest language tag against one of our five choices.
 *
 * Prefix-with-separator, case-insensitively: `ja` matches `ja`, `ja-JP` and
 * YouTube's dubbed `ja-JP-orig`, and `zh` matches `zh-Hans`/`zh-Hant`/`zh-CN`
 * without needing the explicit variant list `ytDlpSubtitleLangs` keeps. It must
 * NOT match on a bare prefix: `en` must not claim `enm` (Middle English), which
 * a `startsWith` alone would.
 */
export function audioLangMatches(formatLanguage: string | null | undefined, wanted: YouTubeAudioLang): boolean {
  if (wanted === 'original') return false;
  if (typeof formatLanguage !== 'string') return false;
  const tag = formatLanguage.trim().toLowerCase();
  if (!tag) return false;
  return tag === wanted || tag.startsWith(`${wanted}-`);
}

function isAudioBearing(format: YtDlpFormat): boolean {
  // Audio-only formats are the ones a dub lives in. A muxed `b` format carries
  // audio too, but yt-dlp does not tag it with a language, so it can never
  // answer "which dub is this" and including it would let an untagged muxed
  // format masquerade as a match for whatever was asked.
  return format.acodec !== 'none' && format.vcodec === 'none';
}

/** Every distinct audio language the video actually ships, deduped and sorted. */
export function listAudioTrackLanguages(formats: readonly YtDlpFormat[]): string[] {
  const seen = new Set<string>();
  for (const format of formats) {
    if (!isAudioBearing(format)) continue;
    const tag = typeof format.language === 'string' ? format.language.trim() : '';
    if (tag) seen.add(tag);
  }
  return [...seen].sort();
}

/** Every audio track, normalised. Used by the picker and by the census. */
export function listAudioTracks(formats: readonly YtDlpFormat[]): YtAudioTrack[] {
  const out: YtAudioTrack[] = [];
  for (const format of formats) {
    if (!isAudioBearing(format)) continue;
    const formatId = typeof format.format_id === 'string' ? format.format_id.trim() : '';
    if (!formatId) continue;
    const language = typeof format.language === 'string' ? format.language.trim() : '';
    if (!language) continue;
    out.push({
      formatId,
      language,
      abr: typeof format.abr === 'number' && Number.isFinite(format.abr) ? format.abr : null,
      ext: typeof format.ext === 'string' ? format.ext : null,
      isOriginal: /orig/i.test(String(format.format_note ?? '')) || /-orig$/i.test(language),
    });
  }
  return out;
}

/**
 * The best track for a wanted language: highest bitrate wins, and an untagged
 * bitrate loses to any tagged one so a `null` never beats a real number.
 * Ties break on the format id so the choice is deterministic across runs —
 * a gate that reports a different format id each time proves nothing.
 */
export function pickAudioTrack(formats: readonly YtDlpFormat[], wanted: YouTubeAudioLang): YtAudioTrack | null {
  const candidates = listAudioTracks(formats).filter((track) => audioLangMatches(track.language, wanted));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.abr ?? -1) - (a.abr ?? -1) || a.formatId.localeCompare(b.formatId));
  return candidates[0];
}

/**
 * Why a dub request cannot proceed. Each is a distinct situation with a
 * different fix and its own i18n key — never one shared 'failed', for the same
 * reason `extensionTranscribe.ts` refuses by name.
 */
export const YT_AUDIO_LANG_REFUSALS = [
  /** The probe ran and the video has audio tracks, but none in the wanted language. */
  'noSuchAudioLanguage',
  /**
   * The probe ran and found no language-tagged audio track at all. Distinct
   * from the above: the video is single-track, so there is no dub to choose and
   * the honest answer is "this video has one audio track", not "no Japanese".
   */
  'noTaggedAudioTracks',
  /** yt-dlp could not be asked — the probe itself failed. Never a silent default. */
  'audioProbeFailed',
] as const;

export type YtAudioLangRefusal = (typeof YT_AUDIO_LANG_REFUSALS)[number];

export function audioLangRefusalKey(reason: YtAudioLangRefusal): string {
  return `media.yt.audioLang.refuse.${reason}`;
}

export type YtAudioTrackPlan =
  /** No language asked for: emit exactly the args the app used before. */
  | { action: 'default' }
  /** Download this exact format id, whose language came from the manifest. */
  | { action: 'select'; track: YtAudioTrack; wanted: YouTubeAudioLang }
  /** Gate 2: named, and it lists what the video does have. */
  | {
      action: 'refuse';
      reason: YtAudioLangRefusal;
      reasonKey: string;
      wanted: YouTubeAudioLang;
      /** The manifest's own tags, so the message can say what IS available. */
      available: string[];
    };

/**
 * The whole decision. `formats` is null when the probe could not be run at all,
 * which is its own refusal rather than a fall back to the default track.
 */
export function planYoutubeAudioTrack(
  wantedRaw: unknown,
  formats: readonly YtDlpFormat[] | null,
): YtAudioTrackPlan {
  const wanted = normalizeYouTubeAudioLang(wantedRaw);
  if (wanted === 'original') return { action: 'default' };
  if (formats === null) {
    return {
      action: 'refuse',
      reason: 'audioProbeFailed',
      reasonKey: audioLangRefusalKey('audioProbeFailed'),
      wanted,
      available: [],
    };
  }
  const available = listAudioTrackLanguages(formats);
  if (available.length === 0) {
    return {
      action: 'refuse',
      reason: 'noTaggedAudioTracks',
      reasonKey: audioLangRefusalKey('noTaggedAudioTracks'),
      wanted,
      available,
    };
  }
  const track = pickAudioTrack(formats, wanted);
  if (!track) {
    return {
      action: 'refuse',
      reason: 'noSuchAudioLanguage',
      reasonKey: audioLangRefusalKey('noSuchAudioLanguage'),
      wanted,
      available,
    };
  }
  return { action: 'select', track, wanted };
}

/**
 * The yt-dlp format args for a plan.
 *
 * `default` reproduces `main/media.ts`'s original strings character for
 * character — that equality is asserted in the suite, because the one way this
 * feature could quietly break every existing download is by rewriting the args
 * of the path nobody asked to change.
 *
 * For `select` there is deliberately **no `/ba/b` tail**: a fallback is exactly
 * what gate 2 forbids. If the id has gone stale between the probe and the
 * download, yt-dlp failing loudly is the correct outcome.
 */
export function youtubeFormatArgs(plan: YtAudioTrackPlan, audioOnly: boolean): string[] {
  if (plan.action === 'select') {
    return audioOnly
      ? ['-f', plan.track.formatId, '-x', '--audio-format', 'm4a']
      : ['-f', `bv*[ext=mp4]+${plan.track.formatId}/bv*+${plan.track.formatId}`, '--merge-output-format', 'mp4'];
  }
  return audioOnly
    ? ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a']
    : ['-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4'];
}

/**
 * A plain-English fallback for the refusal, used when the caller has no
 * catalogue (the main process does not run `useT`). The renderer prefers
 * `reasonKey`; this is what a log or an early-boot caller sees.
 */
export function audioLangRefusalMessage(plan: Extract<YtAudioTrackPlan, { action: 'refuse' }>): string {
  const wanted = plan.wanted.toUpperCase();
  switch (plan.reason) {
    case 'noSuchAudioLanguage':
      return `This video has no ${wanted} audio track. It ships: ${plan.available.join(', ')}.`;
    case 'noTaggedAudioTracks':
      return `This video has a single untagged audio track, so there is no ${wanted} dub to choose. Download it as-is, or pick "Original audio".`;
    case 'audioProbeFailed':
      return `Could not read this video's audio tracks, so the ${wanted} dub was not downloaded. Nothing was fetched.`;
  }
}
