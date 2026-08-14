/**
 * A subtitle file the app actually holds for a media item.
 *
 * Distinct from §8's `SubtitleTrack`, and deliberately so. A `SubtitleTrack` is
 * *metadata about a release* — what some provider says exists, with no bytes and
 * no path. A `SubtitleRecord` is a file on this disk: where it came from, how
 * confident we were, and where it is. The discovery pipeline turns the former
 * into the latter.
 *
 * A leaf module (imports nothing) so `types.ts` can name it on `MediaItem`
 * without pulling in the provider model — the same reason `mediaCategories.ts`
 * and `mediaReleaseKind.ts` are leaves.
 */

/** Where a subtitle came from, which is what the UI labels it with. */
export type SubtitleSource =
  /** Extracted from a stream inside the video container. */
  | 'embedded'
  /** A file that was already sitting next to the video. */
  | 'sidecar'
  /** Downloaded from a configured provider. */
  | 'provider'
  /** Produced by Whisper on this machine. */
  | 'generated';

/** Cue file formats the app can read. `lrc` is lyrics, handled by the same parser. */
export type SubtitleRecordFormat = 'srt' | 'ass' | 'ssa' | 'vtt' | 'lrc';

export interface SubtitleRecord {
  id: string;
  /** BCP-47-ish language tag, normalized lowercase (`ja`, `en`, `zh-hans`). */
  lang: string;
  source: SubtitleSource;
  format: SubtitleRecordFormat;
  /** Path relative to userData for cached files; absolute for a sidecar in place. */
  path: string;
  /** True when `path` is absolute and outside the app's own storage. */
  external?: boolean;
  /** Provider id for `source: 'provider'`. */
  providerId?: string;
  /** Provider-side release id, so the same file is not fetched twice. */
  providerItemId?: string;
  /** Human label for the track: release name, stream title, or file name. */
  label?: string;
  /** 0–100 match score from the shared matcher. Absent for embedded/sidecar. */
  confidence?: number;
  /** Machine-generated transcripts are labelled and editable, never silently trusted. */
  machineGenerated?: boolean;
  /**
   * How a `generated` track was produced. Absent means the plain whole-file
   * Whisper pass, which is what every record written before EN→JA fusion is.
   *
   * Load-bearing rather than cosmetic: a generated track replaces the previous
   * generated track for its language, and the two derivations must not evict each
   * other — they are different artifacts with different timing.
   */
  derivation?: 'whisper' | 'en-ja-fusion';
  /** True once the user has corrected a generated transcript. */
  edited?: boolean;
  /** Stream index, for a track extracted from the container. */
  streamIndex?: number;
  hearingImpaired?: boolean;
  addedAt: number;
}

/**
 * Why a search for subtitles came back empty, remembered so the same fruitless
 * request is not repeated on every launch.
 */
export interface SubtitleSearchFailure {
  providerId: string;
  lang: string;
  /** Epoch ms. Callers apply their own staleness window before retrying. */
  attemptedAt: number;
  reason: string;
}

export function isJapaneseSubtitleLang(lang: string): boolean {
  return /^ja\b/i.test(lang.trim());
}

/** Languages present in a record list, de-duplicated and sorted. */
export function subtitleLanguages(records: readonly SubtitleRecord[] | undefined): string[] {
  if (!records?.length) return [];
  return [...new Set(records.map((record) => record.lang.trim().toLowerCase()).filter(Boolean))].sort();
}

/** Whether any usable Japanese track exists, which is what gates the study tools. */
export function hasJapaneseSubtitles(records: readonly SubtitleRecord[] | undefined): boolean {
  return (records ?? []).some((record) => isJapaneseSubtitleLang(record.lang));
}
