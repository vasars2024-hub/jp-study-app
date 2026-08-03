/**
 * YouTube discovery model — candidates, study signals, and scoring.
 *
 * Phase 8 item 3 (`SEANIME_MIGRATION_PLAN.md:634`), closing MASTER_PLAN §12's
 * "Search" and "Smart Recommendations" subsections — the two the parity ledger
 * records as "search incomplete" (`FEATURE_PARITY_LEDGER.md:66`).
 *
 * The app could already *manage* playlists (`main/ytPlaylists.ts`); it could not
 * *find* anything. This module is the finding half's brain, and like
 * `shared/mediaDiscovery.ts` it is completely pure: no network, no clock, no
 * storage, no `yt-dlp`. `main/youtubeDiscovery.ts` fetches; this ranks.
 *
 * ## Why the signals here are not the ones a video search normally shows
 *
 * View count and recency tell a learner nothing about whether a video is usable
 * study material. Three things do, and they are the axis of this file:
 *
 *   1. **Author-written captions vs machine ASR.** A human caption track is a
 *      transcript you can mine sentences from. An auto-caption is a guess with
 *      no punctuation, no speaker turns, and systematic errors on exactly the
 *      words a learner does not know. Treating them as the same thing is the
 *      single biggest way a "has subtitles" filter lies.
 *   2. **Whether the audio is actually Japanese.** A Japanese *title* is not
 *      Japanese *audio*.
 *   3. **Speech pace.** Comprehensible input is a rate, not a topic.
 *
 * Everything here is stated as an estimate wherever it surfaces, and every
 * verdict has an explicit `unknown` state rather than a default that reads as a
 * fact. `unknown` is scored at the midpoint, never at zero — the same rule
 * `mediaDiscovery.ts` uses for a missing rating, and for the same reason: an
 * absent signal is not a bad signal.
 */

import { STUDY_LEVELS, type StudyLevel } from './mediaDiscovery';

export const YOUTUBE_DISCOVERY_MODEL_VERSION = 1;

/** How a candidate list was asked for. */
export type YoutubeDiscoveryMode = 'search' | 'channel';

/** yt-dlp's `live_status`, plus our own catch-all. */
export type YoutubeLiveStatus =
  | 'is_live'
  | 'is_upcoming'
  | 'was_live'
  | 'post_live'
  | 'not_live'
  | 'unknown';

/**
 * One candidate video. Deliberately the *flat-playlist* subset — everything here
 * is available from a single `yt-dlp --flat-playlist` call over the whole result
 * page, with no per-video round trip. The expensive fields live on
 * {@link YoutubeProbe} instead.
 */
export interface YoutubeDiscoveryCandidate {
  /** Discriminant against `mediaDiscovery`'s jikan/anilist candidates. */
  provider: 'youtube';
  /** YouTube's video id. String, unlike the numeric catalogue ids. */
  videoId: string;
  title: string;
  url: string;
  channelTitle?: string;
  channelId?: string;
  channelUrl?: string;
  description?: string;
  durationSec?: number;
  viewCount?: number;
  /** Epoch ms. */
  publishedAt?: number;
  thumbUrl?: string;
  liveStatus?: YoutubeLiveStatus;
}

/**
 * How a fetch ended.
 *
 * `tool-missing` is its own state, not an error string. The console has to say
 * something actionable and specific — "install yt-dlp" is a different
 * instruction from "check your connection" — and a renderer cannot reliably tell
 * those apart by sniffing an error message. It is also the *not-configured*
 * state this feature reports in place of the API-key state it does not have.
 *
 * The IPC wire types live here rather than in `main/youtubeDiscovery.ts` so the
 * preload and the renderer's `window.d.ts` can name them without either one
 * reaching across the main/renderer boundary for a type.
 */
export type YoutubeFetchState = 'ready' | 'empty' | 'tool-missing' | 'error';

export interface YoutubeSearchResult {
  state: YoutubeFetchState;
  mode: YoutubeDiscoveryMode;
  query: string;
  candidates: YoutubeDiscoveryCandidate[];
  /** Present only when `state` is `error`. */
  message?: string;
  fetchedAt: number;
}

export function isYoutubeCandidate(value: unknown): value is YoutubeDiscoveryCandidate {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.provider === 'youtube'
    && typeof record.videoId === 'string'
    && record.videoId.length > 0
    && typeof record.title === 'string';
}

/** Stable key for React lists and the shortlist store. */
export function youtubeCandidateId(candidate: YoutubeDiscoveryCandidate): string {
  return `youtube:${candidate.videoId}`;
}

export function youtubeWatchUrlFor(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// ---------------------------------------------------------------------------
// Caption inventory
// ---------------------------------------------------------------------------

/**
 * `human` means the track came from `subtitles` — someone typed or uploaded it.
 * `auto` means it came from `automatic_captions` — ASR, or an ASR track machine-
 * translated into another language.
 *
 * The distinction is carried by *which container the track was listed under*,
 * never by parsing the language key. That matters: yt-dlp's auto-caption keys
 * have changed shape more than once (`ja`, `ja-en`, `en-orig`, …), and any rule
 * that reads the key would silently rot on the next yt-dlp release. The
 * container is stable and is the actual fact we care about.
 */
export type YoutubeCaptionKind = 'human' | 'auto';

export interface YoutubeCaptionTrack {
  /** The raw yt-dlp key, kept verbatim for the download path. */
  key: string;
  /** Primary subtag of {@link key}, lowercased: `ja-JP` → `ja`. */
  lang: string;
  kind: YoutubeCaptionKind;
}

/**
 * `subtitles` entries that are not captions at all.
 *
 * `live_chat` is the one that bites: every past livestream carries a
 * `subtitles.live_chat` track, so `Object.keys(info.subtitles).length > 0`
 * reports "this video has author-written captions" for a three-hour unsubtitled
 * stream. It is the most common false positive in this whole feature and it is
 * excluded by name.
 */
const NON_CAPTION_KEYS = new Set(['live_chat', 'rechat']);

/** `ja-JP` → `ja`; `ja` → `ja`; junk → `''`. */
export function captionPrimaryLang(key: string): string {
  const head = key.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return /^[a-z]{2,3}$/.test(head) ? head : '';
}

/**
 * Normalizes yt-dlp's two caption containers into one flat, kind-tagged list.
 *
 * Both arguments are the raw `info.subtitles` / `info.automatic_captions`
 * objects. Anything that is not a `{ lang: [...] }` shape is dropped rather than
 * throwing — this parses a subprocess's JSON, and a malformed field must not
 * take down a search that otherwise worked.
 */
export function parseCaptionTracks(
  subtitles: unknown,
  automaticCaptions: unknown,
): YoutubeCaptionTrack[] {
  const tracks: YoutubeCaptionTrack[] = [];
  const seen = new Set<string>();

  const collect = (container: unknown, kind: YoutubeCaptionKind): void => {
    if (typeof container !== 'object' || container === null || Array.isArray(container)) return;
    for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
      if (NON_CAPTION_KEYS.has(key.toLowerCase())) continue;
      // yt-dlp lists each track as an array of format descriptors. An empty
      // array means the key exists with nothing behind it, which is not a track.
      if (!Array.isArray(value) || value.length === 0) continue;
      const lang = captionPrimaryLang(key);
      if (!lang) continue;
      const dedupeKey = `${kind}:${key}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      tracks.push({ key, lang, kind });
    }
  };

  collect(subtitles, 'human');
  collect(automaticCaptions, 'auto');
  return tracks;
}

/**
 * The per-video facts that cost one extra `yt-dlp` extraction each.
 *
 * Split from the candidate on purpose: a 25-result search is one subprocess
 * call, and probing all 25 would be 26. Probing is explicit and per-candidate.
 */
export interface YoutubeProbe {
  videoId: string;
  captions: YoutubeCaptionTrack[];
  /** yt-dlp's `language` — the uploader-declared default audio language. */
  declaredAudioLang?: string;
  /** Distinct languages seen across audio formats (multi-audio uploads). */
  audioLangs: string[];
  chapterCount?: number;
  categories: string[];
  tags: string[];
  liveStatus?: YoutubeLiveStatus;
  /** Epoch ms, supplied by the caller's clock — never read here. */
  probedAt: number;
}

export interface YoutubeProbeResult {
  state: YoutubeFetchState;
  videoId: string;
  probe: YoutubeProbe | null;
  message?: string;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * `human-target` — an author-written track in the language being studied.
 * `human-other` — author-written, but not in the target language.
 * `auto-only`   — ASR only.
 * `none`        — no caption track of any kind.
 * `unknown`     — not probed yet. Distinct from `none`, and must stay distinct:
 *                 collapsing them would let an unprobed video be reported as
 *                 having no captions, which is a claim we have not checked.
 */
export type CaptionVerdict = 'human-target' | 'human-other' | 'auto-only' | 'none' | 'unknown';

export type AudioVerdict = 'target' | 'other' | 'unknown';

export type SpeechPace = 'slow' | 'moderate' | 'fast' | 'unknown';

export type DurationBand = 'short' | 'clip' | 'standard' | 'long' | 'unknown';

export interface YoutubeStudySignals {
  captions: CaptionVerdict;
  /** Primary subtags of the author-written tracks, deduped and sorted. */
  humanCaptionLangs: string[];
  /** True when an auto track exists in the target language. */
  hasAutoTarget: boolean;
  audio: AudioVerdict;
  /** 0–1: share of the title + description that is Japanese script. */
  japaneseScriptRatio: number;
  durationBand: DurationBand;
  pace: SpeechPace;
  /** Target-script characters per minute of captioned speech; see {@link estimateSpeechRate}. */
  charsPerMinute?: number;
  /** A live or upcoming stream: unstable audio, ASR-only captions. */
  live: boolean;
}

/** The language a learner is studying. Only `ja` is calibrated today. */
export type TargetLang = 'ja' | 'zh' | 'en' | 'ru';

// Kana, CJK ideographs, and the iteration marks that appear inside words. The
// half-width katakana block is included because YouTube titles use it.
const JAPANESE_SCRIPT = /[ぁ-ゟ゠-ヿ㐀-䶿一-鿿ｦ-ﾝ々〆]/u;
// Anything that carries no reading load: spaces, ASCII punctuation, digits, and
// the CJK punctuation that Japanese text shares with Chinese. The lenticular and
// angle brackets are here because Japanese YouTube titles are full of them
// (`【日本語】…`) and charging a title for its own furniture would rank a genuinely
// Japanese video below an English one carrying a single Japanese tag.
const NON_SCRIPT = /[\s\d!-/:-@[-`{-~。、「」『』【】〔〕《》〈〉・：；！？（）〜ー—–…“”‘’]/u;

/**
 * Share of the *meaningful* characters in `text` that are Japanese script.
 *
 * Punctuation and whitespace are excluded from the denominator rather than
 * counted against the ratio: "【日本語】 vlog #12" is Japanese content with a
 * lot of ASCII furniture, and charging it for the brackets would rank it below
 * an English video with a one-word Japanese tag.
 */
export function japaneseScriptRatio(text: string): number {
  if (typeof text !== 'string' || !text) return 0;
  let japanese = 0;
  let counted = 0;
  for (const char of text) {
    if (NON_SCRIPT.test(char)) continue;
    counted += 1;
    if (JAPANESE_SCRIPT.test(char)) japanese += 1;
  }
  return counted === 0 ? 0 : japanese / counted;
}

/** One caption cue. Times in seconds. */
export interface SpeechCue {
  start: number;
  end: number;
  text: string;
}

/**
 * Speech rate as target-script characters per minute of *captioned* time.
 *
 * Two decisions worth defending:
 *
 * 1. **The denominator is captioned time, not video length.** A 20-minute video
 *    with four minutes of talking is not slow speech; it is a fast talker with
 *    long silences. Dividing by wall-clock would call it slow and recommend it
 *    to a beginner who then cannot follow a word of it.
 * 2. **Overlapping cues are merged before summing.** Auto-captions roll — cue
 *    N+1 starts before cue N ends, repeating its tail — so a naive sum of cue
 *    durations can exceed the video's own length and halves the reported rate.
 *
 * The numerator counts only script characters (kana/kanji for `ja`), so a
 * bilingual caption track is not inflated by its English half.
 *
 * Returns `undefined` when there is nothing to divide by. **Calibration note:**
 * the bands in {@link paceFromCharsPerMinute} are reasoned from mora rate, not
 * measured against a labelled corpus; they are presented in the UI as an
 * estimate and should be re-fitted once real caption files are on hand.
 */
export function estimateSpeechRate(cues: readonly SpeechCue[], target: TargetLang = 'ja'): number | undefined {
  if (!Array.isArray(cues) || cues.length === 0) return undefined;

  const usable = cues
    .filter((cue) => Number.isFinite(cue?.start) && Number.isFinite(cue?.end) && cue.end > cue.start)
    .sort((a, b) => a.start - b.start);
  if (usable.length === 0) return undefined;

  let seconds = 0;
  let spanStart = usable[0].start;
  let spanEnd = usable[0].end;
  for (const cue of usable.slice(1)) {
    if (cue.start <= spanEnd) {
      spanEnd = Math.max(spanEnd, cue.end);
      continue;
    }
    seconds += spanEnd - spanStart;
    spanStart = cue.start;
    spanEnd = cue.end;
  }
  seconds += spanEnd - spanStart;
  if (seconds <= 0) return undefined;

  const script = target === 'ja' ? JAPANESE_SCRIPT : null;
  let characters = 0;
  for (const cue of usable) {
    for (const char of typeof cue.text === 'string' ? cue.text : '') {
      if (NON_SCRIPT.test(char)) continue;
      if (script && !script.test(char)) continue;
      characters += 1;
    }
  }
  if (characters === 0) return undefined;

  return (characters / seconds) * 60;
}

/**
 * Pace bands, in target-script characters per minute.
 *
 * Reasoned from mora rate: ordinary Japanese conversation runs ~7–8 morae/sec,
 * and written Japanese compresses those into mixed kanji/kana at roughly 0.8
 * characters per mora, which lands normal speech near 340–400 ch/min. Learner-
 * directed and slow-narration content sits below; news reading and rapid
 * comedy sit above. **Not fitted to a labelled corpus** — see
 * {@link estimateSpeechRate}.
 */
export const PACE_SLOW_MAX = 240;
export const PACE_FAST_MIN = 420;

export function paceFromCharsPerMinute(charsPerMinute: number | undefined): SpeechPace {
  if (typeof charsPerMinute !== 'number' || !Number.isFinite(charsPerMinute) || charsPerMinute <= 0) {
    return 'unknown';
  }
  if (charsPerMinute < PACE_SLOW_MAX) return 'slow';
  if (charsPerMinute > PACE_FAST_MIN) return 'fast';
  return 'moderate';
}

/** Seconds. Below this YouTube treats an upload as a Short. */
const SHORT_MAX_SEC = 60;
const CLIP_MAX_SEC = 6 * 60;
const STANDARD_MAX_SEC = 30 * 60;

export function durationBand(durationSec: number | undefined): DurationBand {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    return 'unknown';
  }
  if (durationSec <= SHORT_MAX_SEC) return 'short';
  if (durationSec <= CLIP_MAX_SEC) return 'clip';
  if (durationSec <= STANDARD_MAX_SEC) return 'standard';
  return 'long';
}

function isLive(status: YoutubeLiveStatus | undefined): boolean {
  return status === 'is_live' || status === 'is_upcoming';
}

/** Extra facts a caller may already have that the probe does not carry. */
export interface SignalInputs {
  target?: TargetLang;
  /** Cues from a fetched caption track, when one has been fetched. */
  cues?: readonly SpeechCue[];
  /**
   * A rate this caller measured earlier and cached. Wins over {@link cues} — the
   * console keeps the number, not the caption file, so re-deriving it on every
   * render would mean holding every fetched transcript in renderer memory.
   */
  charsPerMinute?: number;
}

/**
 * Derives every study signal for one candidate.
 *
 * `probe` is `null` until the user asks for one. That is not a degraded mode: a
 * search result with `captions: 'unknown'` is an honest row, and the console
 * says "not checked" rather than inventing a verdict.
 */
export function deriveStudySignals(
  candidate: YoutubeDiscoveryCandidate,
  probe: YoutubeProbe | null,
  inputs: SignalInputs = {},
): YoutubeStudySignals {
  const target = inputs.target ?? 'ja';
  const charsPerMinute = typeof inputs.charsPerMinute === 'number' && Number.isFinite(inputs.charsPerMinute)
    ? inputs.charsPerMinute
    : inputs.cues
      ? estimateSpeechRate(inputs.cues, target)
      : undefined;

  const humanCaptionLangs = probe
    ? [...new Set(probe.captions.filter((track) => track.kind === 'human').map((track) => track.lang))].sort()
    : [];
  const hasAutoTarget = probe
    ? probe.captions.some((track) => track.kind === 'auto' && track.lang === target)
    : false;

  let captions: CaptionVerdict;
  if (!probe) {
    captions = 'unknown';
  } else if (humanCaptionLangs.includes(target)) {
    captions = 'human-target';
  } else if (humanCaptionLangs.length > 0) {
    captions = 'human-other';
  } else if (probe.captions.length > 0) {
    captions = 'auto-only';
  } else {
    captions = 'none';
  }

  /*
   * Precedence: a stated language wins, and the caption track only fills a gap.
   *
   * It is tempting to read "someone hand-wrote a Japanese caption track" as
   * "the audio is Japanese", and it usually is — but hand-written *translation*
   * subtitles are just as common, so letting that inference override an explicit
   * `language: "en"` would confidently mislabel every fansubbed English video as
   * Japanese audio. The inference is therefore the last resort, not the first.
   */
  let audio: AudioVerdict = 'unknown';
  const declared = typeof probe?.declaredAudioLang === 'string'
    ? captionPrimaryLang(probe.declaredAudioLang)
    : '';
  const formatLangs = probe?.audioLangs.map(captionPrimaryLang).filter(Boolean) ?? [];
  if (declared === target || formatLangs.includes(target)) {
    audio = 'target';
  } else if (declared || formatLangs.length > 0) {
    audio = 'other';
  } else if (captions === 'human-target') {
    audio = 'target';
  }

  const text = `${candidate.title} ${candidate.description ?? ''}`;

  return {
    captions,
    humanCaptionLangs,
    hasAutoTarget,
    audio,
    japaneseScriptRatio: target === 'ja' ? japaneseScriptRatio(text) : 0,
    durationBand: durationBand(candidate.durationSec),
    pace: paceFromCharsPerMinute(charsPerMinute),
    charsPerMinute,
    live: isLive(probe?.liveStatus ?? candidate.liveStatus),
  };
}

// ---------------------------------------------------------------------------
// Channel consistency
// ---------------------------------------------------------------------------

/**
 * How reliably one channel produces study-usable material.
 *
 * Computed over the result set already in hand — no extra requests. Only
 * *probed* videos count towards the caption share, because an unprobed video
 * has no verdict to average and counting it as a miss would punish a channel
 * for the user not having clicked yet.
 */
export interface YoutubeChannelConsistency {
  channelId: string;
  channelTitle?: string;
  /** Videos from this channel in the current result set. */
  videos: number;
  /** Of those, how many have been probed. */
  probed: number;
  /** Of the probed ones, how many carry author-written target captions. */
  withHumanTargetCaptions: number;
  /** `withHumanTargetCaptions / probed`, or `null` below the sample floor. */
  humanCaptionShare: number | null;
  /** Share of this channel's titles written in Japanese script. */
  japaneseTitleShare: number;
}

/** Below this many probed videos the share is reported as unknown, not as 0 or 1. */
export const CONSISTENCY_MIN_SAMPLE = 2;

export function summariseChannelConsistency(
  entries: ReadonlyArray<{ candidate: YoutubeDiscoveryCandidate; signals: YoutubeStudySignals }>,
): YoutubeChannelConsistency[] {
  const byChannel = new Map<string, YoutubeChannelConsistency & { japaneseTitles: number }>();
  for (const entry of entries) {
    const channelId = entry.candidate.channelId || entry.candidate.channelTitle || '';
    if (!channelId) continue;
    const row = byChannel.get(channelId) ?? {
      channelId,
      channelTitle: entry.candidate.channelTitle,
      videos: 0,
      probed: 0,
      withHumanTargetCaptions: 0,
      humanCaptionShare: null,
      japaneseTitleShare: 0,
      japaneseTitles: 0,
    };
    row.videos += 1;
    if (entry.signals.captions !== 'unknown') row.probed += 1;
    if (entry.signals.captions === 'human-target') row.withHumanTargetCaptions += 1;
    if (japaneseScriptRatio(entry.candidate.title) >= 0.3) row.japaneseTitles += 1;
    byChannel.set(channelId, row);
  }

  return [...byChannel.values()].map(({ japaneseTitles, ...row }) => ({
    ...row,
    humanCaptionShare: row.probed >= CONSISTENCY_MIN_SAMPLE
      ? row.withHumanTargetCaptions / row.probed
      : null,
    japaneseTitleShare: row.videos === 0 ? 0 : japaneseTitles / row.videos,
  }));
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Why a video scored the way it did. Codes, not sentences — the renderer owns
 * the wording so all four UI languages stay in the catalogs, same contract as
 * `DiscoveryReasonCode`.
 */
export type YoutubeReasonCode =
  | 'captions-human'
  | 'captions-auto'
  | 'captions-none'
  | 'captions-unchecked'
  | 'audio-target'
  | 'audio-other'
  | 'japanese-title'
  | 'pace-fit'
  | 'pace-fast'
  | 'pace-slow'
  | 'length-fit'
  | 'length-long'
  | 'channel-consistent'
  | 'is-live';

export interface YoutubeReason {
  code: YoutubeReasonCode;
  /** Contribution in points; negative for penalties. */
  points: number;
  /** Caption language for the caption codes; ch/min for the pace codes. */
  detail?: string;
}

export interface YoutubeRanking {
  candidate: YoutubeDiscoveryCandidate;
  signals: YoutubeStudySignals;
  /** 0–100. Comparable only within one ranked list. */
  studyScore: number;
  reasons: YoutubeReason[];
  probed: boolean;
}

/**
 * Weights in points, summing to 100 before penalties. Captions dominate because
 * they are the difference between "material" and "a video": an uncaptioned clip
 * cannot be mined, shadowed, or dual-subbed, which is most of what this app
 * does with a video once it has one.
 */
const W_CAPTIONS = 40;
const W_AUDIO = 20;
const W_SCRIPT = 12;
const W_PACE = 16;
const W_LENGTH = 12;
/** A live or upcoming stream has no stable transcript to study from. */
const PENALTY_LIVE = 30;

function captionPoints(verdict: CaptionVerdict): number {
  switch (verdict) {
    case 'human-target': return W_CAPTIONS;
    case 'human-other': return W_CAPTIONS * 0.3;
    case 'auto-only': return W_CAPTIONS * 0.25;
    case 'none': return 0;
    // Unchecked is the midpoint, not a zero. Ranking every unprobed row to the
    // bottom would mean the list only ever sorts by what the user happened to
    // click, which is the opposite of a recommendation.
    case 'unknown':
    default: return W_CAPTIONS * 0.5;
  }
}

function audioPoints(verdict: AudioVerdict): number {
  if (verdict === 'target') return W_AUDIO;
  if (verdict === 'other') return 0;
  return W_AUDIO * 0.5;
}

function lengthPoints(band: DurationBand): number {
  switch (band) {
    case 'clip': return W_LENGTH;
    case 'standard': return W_LENGTH * 0.85;
    case 'long': return W_LENGTH * 0.4;
    // A Short is real immersion but too little of it to plan a session around.
    case 'short': return W_LENGTH * 0.25;
    case 'unknown':
    default: return W_LENGTH * 0.5;
  }
}

function levelOrdinal(level: StudyLevel): number {
  const index = STUDY_LEVELS.indexOf(level);
  return index < 0 ? 2 : index;
}

/**
 * Pace fit against the learner's band.
 *
 * The ideal rate rises with level — N5 wants deliberate speech, N1 wants native
 * pace — and the fall-off is asymmetric for the same reason as
 * `mediaDiscovery`'s level fit: too slow still teaches, too fast does not.
 */
function paceFit(pace: SpeechPace, level: StudyLevel): { points: number; code: YoutubeReasonCode | null } {
  if (pace === 'unknown') return { points: W_PACE * 0.5, code: null };
  const ordinal = levelOrdinal(level);
  // 0 = slow, 1 = moderate, 2 = fast.
  const observed = pace === 'slow' ? 0 : pace === 'moderate' ? 1 : 2;
  // N5/N4 → slow, N3/N2 → moderate, N1 → fast.
  const wanted = ordinal <= 1 ? 0 : ordinal <= 3 ? 1 : 2;
  const gap = observed - wanted;
  if (gap === 0) return { points: W_PACE, code: 'pace-fit' };
  if (gap > 0) return { points: Math.max(0, W_PACE * (1 - gap * 0.55)), code: 'pace-fast' };
  return { points: Math.max(0, W_PACE * (1 - -gap * 0.3)), code: 'pace-slow' };
}

export interface YoutubeScoreOptions {
  level: StudyLevel;
  /** Channel rows from {@link summariseChannelConsistency}, keyed by channel. */
  consistency?: ReadonlyMap<string, YoutubeChannelConsistency>;
}

/** A channel is called consistent at or above this probed human-caption share. */
export const CONSISTENT_CHANNEL_SHARE = 0.6;
const W_CONSISTENCY = 8;

/** Scores one candidate. Pure; same input, same output. */
export function scoreYoutubeCandidate(
  candidate: YoutubeDiscoveryCandidate,
  signals: YoutubeStudySignals,
  options: YoutubeScoreOptions,
): YoutubeRanking {
  const reasons: YoutubeReason[] = [];

  const captions = captionPoints(signals.captions);
  reasons.push({
    code: signals.captions === 'human-target' || signals.captions === 'human-other'
      ? 'captions-human'
      : signals.captions === 'auto-only'
        ? 'captions-auto'
        : signals.captions === 'none'
          ? 'captions-none'
          : 'captions-unchecked',
    points: round(captions),
    detail: signals.humanCaptionLangs.join(', ') || undefined,
  });

  const audio = audioPoints(signals.audio);
  if (signals.audio !== 'unknown') {
    reasons.push({ code: signals.audio === 'target' ? 'audio-target' : 'audio-other', points: round(audio) });
  }

  const script = W_SCRIPT * clamp(signals.japaneseScriptRatio, 0, 1);
  if (signals.japaneseScriptRatio >= 0.3) {
    reasons.push({ code: 'japanese-title', points: round(script) });
  }

  const pace = paceFit(signals.pace, options.level);
  if (pace.code) {
    reasons.push({
      code: pace.code,
      points: round(pace.points),
      detail: typeof signals.charsPerMinute === 'number'
        ? String(Math.round(signals.charsPerMinute))
        : undefined,
    });
  }

  const length = lengthPoints(signals.durationBand);
  if (signals.durationBand === 'long') {
    reasons.push({ code: 'length-long', points: round(length) });
  } else if (signals.durationBand === 'clip' || signals.durationBand === 'standard') {
    reasons.push({ code: 'length-fit', points: round(length) });
  }

  const channelKey = candidate.channelId || candidate.channelTitle || '';
  const channel = options.consistency?.get(channelKey);
  let consistency = 0;
  if (channel && channel.humanCaptionShare !== null && channel.humanCaptionShare >= CONSISTENT_CHANNEL_SHARE) {
    consistency = W_CONSISTENCY * channel.humanCaptionShare;
    reasons.push({
      code: 'channel-consistent',
      points: round(consistency),
      detail: `${channel.withHumanTargetCaptions}/${channel.probed}`,
    });
  }

  if (signals.live) reasons.push({ code: 'is-live', points: -PENALTY_LIVE });

  const total = captions + audio + script + pace.points + length + consistency
    - (signals.live ? PENALTY_LIVE : 0);

  return {
    candidate,
    signals,
    studyScore: round(clamp(total, 0, 100)),
    reasons,
    probed: signals.captions !== 'unknown',
  };
}

export interface YoutubeRankOptions extends YoutubeScoreOptions {
  limit?: number;
  /** Drop rows already confirmed to have no author-written target captions. */
  requireHumanCaptions?: boolean;
  /** Drop live and upcoming streams. */
  hideLive?: boolean;
}

/**
 * Ranks candidates best-first, deduping by video id.
 *
 * Ties break on view count and then title, so two runs over the same data
 * produce the same order — the same stability rule as
 * `rankDiscoveryCandidates`, and for the same reason.
 */
export function rankYoutubeCandidates(
  entries: ReadonlyArray<{ candidate: YoutubeDiscoveryCandidate; signals: YoutubeStudySignals }>,
  options: YoutubeRankOptions,
): YoutubeRanking[] {
  const byId = new Map<string, { candidate: YoutubeDiscoveryCandidate; signals: YoutubeStudySignals }>();
  for (const entry of entries) {
    if (!byId.has(entry.candidate.videoId)) byId.set(entry.candidate.videoId, entry);
  }

  const ranked = [...byId.values()]
    .filter((entry) => {
      if (options.hideLive && entry.signals.live) return false;
      // Only *checked* rows can fail this filter. An unprobed row is not
      // evidence of missing captions and is kept, so turning the filter on does
      // not silently empty a list nobody has probed yet.
      if (options.requireHumanCaptions
        && entry.signals.captions !== 'unknown'
        && entry.signals.captions !== 'human-target') return false;
      return true;
    })
    .map((entry) => scoreYoutubeCandidate(entry.candidate, entry.signals, options))
    .sort((a, b) => {
      if (b.studyScore !== a.studyScore) return b.studyScore - a.studyScore;
      const views = (b.candidate.viewCount ?? 0) - (a.candidate.viewCount ?? 0);
      if (views !== 0) return views;
      return a.candidate.title.localeCompare(b.candidate.title);
    });

  return typeof options.limit === 'number' ? ranked.slice(0, Math.max(0, options.limit)) : ranked;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// yt-dlp payload parsing
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const LIVE_STATUSES = new Set<YoutubeLiveStatus>([
  'is_live', 'is_upcoming', 'was_live', 'post_live', 'not_live',
]);

function asLiveStatus(value: unknown): YoutubeLiveStatus | undefined {
  return typeof value === 'string' && LIVE_STATUSES.has(value as YoutubeLiveStatus)
    ? (value as YoutubeLiveStatus)
    : undefined;
}

/**
 * yt-dlp reports upload time three different ways depending on the extractor
 * path: a unix `timestamp` (seconds), a `release_timestamp`, or an
 * `upload_date` of `YYYYMMDD`. Mirrors `ytPlaylists.ts`'s `parseUploadDate` so
 * discovery and the playlist manager agree on what a publish date is.
 */
export function parseYoutubeUploadDate(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 1e12 ? raw : raw * 1000;
  if (typeof raw === 'string' && /^\d{8}$/.test(raw)) {
    const time = Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8)));
    return Number.isFinite(time) ? time : undefined;
  }
  return undefined;
}

function thumbFrom(entry: Record<string, unknown>, videoId: string): string {
  const thumbs = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
  const last = asRecord(thumbs[thumbs.length - 1]);
  return asString(last?.url) ?? asString(entry.thumbnail) ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Pulls a video id out of an id field or any watch/short/youtu.be URL. */
export function videoIdFrom(entry: Record<string, unknown>): string {
  const direct = asString(entry.id);
  // `--flat-playlist` uses `_` as the id of an unavailable entry.
  if (direct && direct !== '_' && !direct.includes('/')) return direct;
  const url = asString(entry.url) ?? asString(entry.webpage_url) ?? '';
  return /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{6,})/.exec(url)?.[1] ?? '';
}

export interface YoutubeSearchPayload {
  /** The playlist/search title yt-dlp gave the result set. */
  title?: string;
  channelTitle?: string;
  channelId?: string;
  candidates: YoutubeDiscoveryCandidate[];
}

/**
 * Parses a `yt-dlp -J --flat-playlist` payload — the one call that answers a
 * whole search or channel page.
 *
 * Total-failure-tolerant on purpose: this is a subprocess's JSON, and one
 * malformed entry among twenty-five must cost that entry, not the search.
 */
export function parseYoutubeSearchPayload(data: unknown): YoutubeSearchPayload {
  const root = asRecord(data) ?? {};
  const rootChannel = asString(root.channel) ?? asString(root.uploader);
  const rootChannelId = asString(root.channel_id) ?? asString(root.uploader_id);
  const rawEntries = Array.isArray(root.entries) ? root.entries : [];

  const candidates: YoutubeDiscoveryCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of rawEntries) {
    const entry = asRecord(raw);
    if (!entry) continue;
    const videoId = videoIdFrom(entry);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    candidates.push({
      provider: 'youtube',
      videoId,
      title: asString(entry.title) ?? videoId,
      url: asString(entry.webpage_url) ?? youtubeWatchUrlFor(videoId),
      channelTitle: asString(entry.channel) ?? asString(entry.uploader) ?? rootChannel,
      channelId: asString(entry.channel_id) ?? asString(entry.uploader_id) ?? rootChannelId,
      channelUrl: asString(entry.channel_url) ?? asString(entry.uploader_url),
      description: asString(entry.description),
      durationSec: asFiniteNumber(entry.duration),
      viewCount: asFiniteNumber(entry.view_count),
      publishedAt: parseYoutubeUploadDate(entry.timestamp ?? entry.release_timestamp ?? entry.upload_date),
      thumbUrl: thumbFrom(entry, videoId),
      liveStatus: asLiveStatus(entry.live_status),
    });
  }

  return {
    title: asString(root.title),
    channelTitle: rootChannel,
    channelId: rootChannelId,
    candidates,
  };
}

/** Parses a full `yt-dlp -J --skip-download` payload for one video. */
export function parseYoutubeProbePayload(data: unknown, probedAt: number): YoutubeProbe | null {
  const root = asRecord(data);
  if (!root) return null;
  const videoId = videoIdFrom(root);
  if (!videoId) return null;

  const formats = Array.isArray(root.formats) ? root.formats : [];
  const audioLangs = [
    ...new Set(
      formats
        .map(asRecord)
        .filter((format): format is Record<string, unknown> => format !== null)
        // Video-only formats carry no language; including them would report the
        // page language as an audio language on every single video.
        .filter((format) => format.acodec !== 'none' && format.acodec !== undefined)
        .map((format) => asString(format.language))
        .filter((lang): lang is string => Boolean(lang)),
    ),
  ];

  return {
    videoId,
    captions: parseCaptionTracks(root.subtitles, root.automatic_captions),
    declaredAudioLang: asString(root.language),
    audioLangs,
    chapterCount: Array.isArray(root.chapters) ? root.chapters.length : undefined,
    categories: Array.isArray(root.categories)
      ? root.categories.filter((value): value is string => typeof value === 'string')
      : [],
    tags: Array.isArray(root.tags)
      ? root.tags.filter((value): value is string => typeof value === 'string')
      : [],
    liveStatus: asLiveStatus(root.live_status),
    probedAt,
  };
}
