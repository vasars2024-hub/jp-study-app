/**
 * Per-item subtitle automation status, for the library and the player.
 *
 * The library needs one answer per item — "Japanese: found (Jimaku), English:
 * machine translation" — without reading every record and re-deriving the pick
 * rules itself. This module is that answer, computed from the records plus what
 * the automation is doing right now, and nothing else.
 *
 * `types.ts` names `SubtitleAutoState` from here, so this file only imports
 * types and the pure pick module (which itself only imports types).
 */

import type { SubtitleRecord } from './subtitleRecord';
import { pickSubtitlePair, subtitleLangMatches } from './subtitleDiscoveryPick';

/** Where one line of an item stands. */
export type SubtitleTrackState =
  /** A human-authored track (embedded, sidecar, or downloaded) is attached. */
  | 'found'
  /** Only a machine-made track (Whisper, fusion, or translation) is attached. */
  | 'generated'
  /** A translation or transcription for this line is running or queued. */
  | 'generating'
  /** Discovery is searching for this item right now. */
  | 'searching'
  /** Nothing is attached, and nothing is running. */
  | 'none';

/** Where the chosen track came from, in words a label can be built from. */
export type SubtitleStatusSource =
  | 'embedded'
  | 'sidecar'
  | 'jimaku'
  | 'opensubtitles'
  | 'nyaa'
  | 'harvest'
  | 'provider'
  | 'whisper'
  | 'fusion'
  | 'machine-translation';

/**
 * Something the user can fix, shown once in the subtitle panel rather than as a
 * toast per episode.
 */
export type SubtitleAutoNotice =
  /** A translation was needed, but no cloud key is set and no offline model is installed. */
  | 'translation-unavailable'
  /** OpenSubtitles would have been asked, but no API key is stored. */
  | 'opensubtitles-key-missing'
  /** OpenSubtitles' daily download limit is used up. */
  | 'opensubtitles-quota';

export const SUBTITLE_AUTO_NOTICES: readonly SubtitleAutoNotice[] = [
  'translation-unavailable',
  'opensubtitles-key-missing',
  'opensubtitles-quota',
];

/** One background task the automation ran for an item, remembered so a failure is not retried every play. */
export interface SubtitleAutoAttempt {
  task: 'translate' | 'fuse' | 'transcribe';
  /** Source language, for a translation. */
  from?: string;
  to: string;
  at: number;
  outcome: 'done' | 'failed' | 'unavailable' | 'queued';
  reason?: string;
}

/** Persisted on `MediaItem.subtitleAuto`. */
export interface SubtitleAutoState {
  /** The study-line record the automation picked. `preferredSubtitleId` still wins over it. */
  primaryId?: string;
  /** The helper-line record the automation picked. */
  secondaryId?: string;
  /** Epoch ms of the last on-play / Watching preparation. */
  preparedAt?: number;
  attempts?: SubtitleAutoAttempt[];
}

/** The per-item answer `subtitleAuto:status` returns and `subtitleAuto:status` events carry. */
export interface SubtitleAutoStatus {
  mediaId: string;
  /** The Japanese study line. */
  ja: SubtitleTrackState;
  /** The helper line, in `helperLang` (English unless the user chose otherwise). */
  en: SubtitleTrackState;
  helperLang: string | null;
  source: { ja: SubtitleStatusSource | null; en: SubtitleStatusSource | null };
  /** Record the player's study line comes from (honours `preferredSubtitleId`). */
  primaryId: string | null;
  /** Record the player's helper line comes from. */
  secondaryId: string | null;
  /** True when that line is a machine translation. */
  machineTranslated: { ja: boolean; en: boolean };
  /** A fixable reason a line is missing, when there is one. */
  notice: SubtitleAutoNotice | null;
  updatedAt: number;
}

/** What the automation is doing for an item right now. */
export interface SubtitleAutoActivity {
  searching?: boolean;
  /** Languages being translated or transcribed. */
  generating?: readonly string[];
  notice?: SubtitleAutoNotice | null;
}

/** The global notices the subtitle panel shows, each at most once. */
export interface SubtitleAutoNotices {
  active: SubtitleAutoNotice[];
  /** When the OpenSubtitles download quota resets, epoch ms, if known. */
  quotaResetAt: number | null;
}

/** The helper-line track as `media:secondarySubtitleForPath` hands it over. */
export interface SecondarySubtitlePick {
  name: string;
  /** Raw cue text (.srt/.vtt/.ass), parsed in the renderer like the primary. */
  text: string;
  lang: string;
  recordId: string;
  source: SubtitleStatusSource;
  machineTranslated: boolean;
}

export function subtitleRecordStatusSource(record: SubtitleRecord): SubtitleStatusSource {
  if (record.source === 'embedded') return 'embedded';
  if (record.source === 'sidecar') return 'sidecar';
  if (record.source === 'generated') {
    if (record.derivation === 'machine-translation') return 'machine-translation';
    if (record.derivation === 'en-ja-fusion') return 'fusion';
    return 'whisper';
  }
  switch (record.providerId) {
    case 'jimaku':
    case 'opensubtitles':
    case 'nyaa':
    case 'harvest':
      return record.providerId;
    default:
      return 'provider';
  }
}

function lineState(
  record: SubtitleRecord | null,
  lang: string | null,
  activity: SubtitleAutoActivity,
): SubtitleTrackState {
  if (record) {
    // A running job for a line that only has machine output is still news: the
    // generated track is about to be replaced by a better one.
    if (record.source === 'generated' && lang && activity.generating?.some((l) => subtitleLangMatches(l, lang))) {
      return 'generating';
    }
    return record.source === 'generated' || record.machineGenerated ? 'generated' : 'found';
  }
  if (lang && activity.generating?.some((l) => subtitleLangMatches(l, lang))) return 'generating';
  if (activity.searching) return 'searching';
  return 'none';
}

/**
 * The status of one item. Pure: the caller supplies the records, the user's
 * choice, and what is running; nothing here reads a store or a clock it was not
 * given.
 */
export function deriveSubtitleAutoStatus(input: {
  mediaId: string;
  records: readonly SubtitleRecord[] | undefined;
  preferredSubtitleId?: string;
  studyLang?: string;
  helperLang: string | null;
  activity?: SubtitleAutoActivity;
  now: number;
}): SubtitleAutoStatus {
  const studyLang = input.studyLang ?? 'ja';
  const activity = input.activity ?? {};
  const records = input.records ?? [];
  const { primary, secondary } = pickSubtitlePair(records, studyLang, input.helperLang, input.preferredSubtitleId);
  // The study LINE is Japanese. When no Japanese track exists the player falls
  // back to showing another language as its primary, but that is not a Japanese
  // line having been found, and the status must not say it was.
  const study = primary && subtitleLangMatches(primary.lang, studyLang) ? primary : null;
  // With no Japanese line, whatever the player shows as primary is the helper
  // language's best track, so that is what the helper line's state describes.
  const helper = secondary
    ?? (primary && input.helperLang && subtitleLangMatches(primary.lang, input.helperLang) ? primary : null);
  return {
    mediaId: input.mediaId,
    ja: lineState(study, studyLang, activity),
    en: input.helperLang ? lineState(helper, input.helperLang, activity) : 'none',
    helperLang: input.helperLang,
    source: {
      ja: study ? subtitleRecordStatusSource(study) : null,
      en: helper ? subtitleRecordStatusSource(helper) : null,
    },
    primaryId: primary?.id ?? null,
    secondaryId: secondary?.id ?? null,
    machineTranslated: {
      ja: study?.derivation === 'machine-translation',
      en: helper?.derivation === 'machine-translation',
    },
    notice: activity.notice ?? null,
    updatedAt: input.now,
  };
}

/** Two statuses that would render identically, so an unchanged one is not re-broadcast. */
export function sameSubtitleAutoStatus(a: SubtitleAutoStatus | undefined, b: SubtitleAutoStatus): boolean {
  if (!a) return false;
  return a.ja === b.ja && a.en === b.en && a.helperLang === b.helperLang
    && a.source.ja === b.source.ja && a.source.en === b.source.en
    && a.primaryId === b.primaryId && a.secondaryId === b.secondaryId
    && a.machineTranslated.ja === b.machineTranslated.ja && a.machineTranslated.en === b.machineTranslated.en
    && a.notice === b.notice;
}

export type AudioLanguageVerdict = 'ja' | 'other' | 'unknown';

/**
 * Kana only. Kanji alone would claim every Chinese title (`甄嬛传`), and a
 * Chinese drama sent through Japanese Whisper is twenty minutes of nonsense.
 */
const JAPANESE_SCRIPT = /[぀-ヿ]/;

/**
 * Whether an item's audio is Japanese, which decides how a Japanese study track
 * is made when only English subtitles exist: Whisper on Japanese audio hears the
 * real words; on English audio it would transcribe nonsense, and translating the
 * English is the only honest option.
 *
 * Container tags decide when present. A file that tags any audio stream as a
 * language other than Japanese answers `other` even when a Japanese stream is
 * also there: the transcription job decodes ffmpeg's default audio stream, and
 * on a dual-audio release that is not reliably the Japanese one.
 *
 * Without tags: a provider's original language, then anime evidence, then the
 * item's own language tag, then a Japanese native title. Otherwise `unknown`,
 * which callers treat as not Japanese — an unneeded translation costs a little;
 * a Whisper pass over English audio costs twenty minutes and produces garbage.
 */
export interface AudioLanguageEvidence {
  streamLanguages?: readonly (string | null | undefined)[];
  originalLanguage?: string | null;
  category?: string | null;
  anilistId?: number | null;
  itemLang?: string | null;
  nativeTitle?: string | null;
}

/** A native title's script, as evidence of the audio's language. */
const NATIVE_TITLE_SCRIPT: Readonly<Record<'ja' | 'zh' | 'ru', (title: string) => boolean>> = {
  ja: (title) => JAPANESE_SCRIPT.test(title),
  zh: (title) => /\p{Script=Han}/u.test(title) && !JAPANESE_SCRIPT.test(title),
  ru: (title) => /\p{Script=Cyrillic}/u.test(title),
};

/**
 * Whether an item's audio is in a given study language — the same evidence and
 * the same caution as `decideAudioLanguage`, for Chinese and Russian too: a
 * Chinese learner's automatic transcription must not run Whisper over Japanese
 * anime audio, nor skip a Chinese drama because its audio is "not Japanese".
 * Anime evidence only ever says Japanese.
 */
export function decideAudioIsLanguage(
  input: AudioLanguageEvidence,
  lang: 'ja' | 'zh' | 'ru',
): 'match' | 'other' | 'unknown' {
  const is = (tag: string): boolean => subtitleLangMatches(tag, lang);
  const tagged = (input.streamLanguages ?? [])
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter((tag) => tag && tag !== 'und' && tag !== 'unknown');
  if (tagged.length) return tagged.every(is) ? 'match' : 'other';
  const original = input.originalLanguage?.trim().toLowerCase();
  if (original) return is(original) ? 'match' : 'other';
  if ((typeof input.anilistId === 'number' && input.anilistId > 0) || input.category === 'anime') {
    return lang === 'ja' ? 'match' : 'other';
  }
  const itemLang = input.itemLang?.trim().toLowerCase();
  if (itemLang) return is(itemLang) ? 'match' : 'other';
  if (input.nativeTitle && NATIVE_TITLE_SCRIPT[lang](input.nativeTitle)) return 'match';
  return 'unknown';
}

export function decideAudioLanguage(input: AudioLanguageEvidence): AudioLanguageVerdict {
  const tagged = (input.streamLanguages ?? [])
    .map((lang) => (typeof lang === 'string' ? lang.trim().toLowerCase() : ''))
    .filter((lang) => lang && lang !== 'und' && lang !== 'unknown');
  if (tagged.length) {
    const japanese = (lang: string): boolean => lang === 'ja' || lang === 'jpn' || lang.startsWith('ja-');
    return tagged.every(japanese) ? 'ja' : 'other';
  }
  const original = input.originalLanguage?.trim().toLowerCase();
  if (original) return original.startsWith('ja') ? 'ja' : 'other';
  if ((typeof input.anilistId === 'number' && input.anilistId > 0) || input.category === 'anime') return 'ja';
  const itemLang = input.itemLang?.trim().toLowerCase();
  if (itemLang) return itemLang.startsWith('ja') ? 'ja' : 'other';
  if (input.nativeTitle && JAPANESE_SCRIPT.test(input.nativeTitle)) return 'ja';
  return 'unknown';
}
