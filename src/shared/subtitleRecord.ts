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
  derivation?: 'whisper' | 'en-ja-fusion' | 'machine-translation';
  /**
   * For `derivation: 'machine-translation'`: the record whose cues were
   * translated. Kept so a translation made from a track that is no longer the
   * study track can be recognised as stale and redone.
   */
  translatedFromId?: string;
  /**
   * For a machine translation: the source track's own label (blank when it had none)
   * and its language, so the UI can name the track in the interface language.
   */
  translatedFromLabel?: string;
  translatedFromLang?: string;
  /** Which engine produced a machine translation (`gemini-2.5-flash`, `local-qwen`, …). */
  translationEngine?: string;
  /**
   * Seconds the cue times were shifted onto this file's audio when the track was
   * downloaded (`shared/subtitleSync.ts`). Absent when no shift was applied.
   */
  syncOffsetSec?: number;
  /** How cleanly the timing locked onto the audio (see shared/subtitleTrackGrade). */
  syncGrade?: 'A' | 'B' | 'C';
  /** OpenSubtitles matched this exact file's hash: timing is right by construction. */
  hashMatch?: boolean;
  /** The release / translation group that made the track, when the provider names one. */
  releaseGroup?: string;
  /** The learner's own 1–5 rating of the track; absent when unrated. */
  userRating?: number;
  /** True once the user has corrected a generated transcript. */
  edited?: boolean;
  /** Stream index, for a track extracted from the container. */
  streamIndex?: number;
  /**
   * 1-based position among the container's subtitle streams, for an extracted
   * stream. An untitled stream is shown by it ("Subtitle stream 2") in the UI
   * language; `label` stays empty rather than holding English.
   */
  subtitleNumber?: number;
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

/** A track this app machine-translated from another language's track. */
/** What discovery wrote into `label` for an untitled container stream before 2026-09. */
const LEGACY_STREAM_LABEL = /^Stream (\d+)$/;

/**
 * The number an untitled embedded stream is shown by, or undefined when the
 * record carries a real label (stream title, release or file name).
 *
 * A record from before `subtitleNumber` keeps the number its old English label
 * showed, so the same track does not change its number under the user.
 */
export function untitledStreamNumber(
  record: Pick<SubtitleRecord, 'source' | 'label' | 'subtitleNumber' | 'streamIndex'>,
): number | undefined {
  if (record.source !== 'embedded') return undefined;
  const label = record.label?.trim() ?? '';
  const legacy = LEGACY_STREAM_LABEL.exec(label);
  if (label && !legacy) return undefined;
  if (typeof record.subtitleNumber === 'number' && record.subtitleNumber > 0) return record.subtitleNumber;
  if (legacy) return Number(legacy[1]);
  return typeof record.streamIndex === 'number' ? record.streamIndex : undefined;
}

/** What discovery wrote into `label` for a machine translation before 2026-09. */
const LEGACY_MT_LABEL = / · machine translation of (.+)$/;

/** A language code's name in the interface language (`Intl`), or the code itself. */
function languageName(code: string | undefined, locale: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A record's name for the UI. An untitled container stream is named in the
 * interface language through `translate('sentenceDeck.track.stream', { n })`, and a
 * machine translation through `translate('subtitleTrack.machineTranslation', …)` with
 * its languages named in `locale` (records from before 2026-09 carried an English
 * sentence; its source part is recovered). Everything else is its own label
 * (undefined when it has none).
 */
export function subtitleRecordLabel(
  record: Pick<SubtitleRecord, 'source' | 'label' | 'subtitleNumber' | 'streamIndex'>
    & Partial<Pick<SubtitleRecord, 'lang' | 'derivation' | 'translatedFromLabel' | 'translatedFromLang'>>,
  translate: (key: string, vars: Record<string, string | number>) => string,
  locale = 'en',
): string | undefined {
  if (record.derivation === 'machine-translation') {
    const legacy = LEGACY_MT_LABEL.exec(record.label ?? '');
    const source = record.translatedFromLabel?.trim()
      || languageName(record.translatedFromLang, locale)
      || legacy?.[1]?.trim();
    if (source) {
      return translate('subtitleTrack.machineTranslation', { lang: languageName(record.lang, locale), source });
    }
  }
  const n = untitledStreamNumber(record);
  return n === undefined ? record.label : translate('sentenceDeck.track.stream', { n });
}

export function isMachineTranslatedSubtitle(record: Pick<SubtitleRecord, 'derivation'>): boolean {
  return record.derivation === 'machine-translation';
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
