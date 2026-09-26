/**
 * "Sentence deck from a video" — the pure half.
 *
 * The feature takes one episode, cuts its study-language subtitle track into
 * sentences, cuts the audio for each sentence, and files the result as one
 * deck of audio sentence cards. Everything here is the part that decides WHAT
 * gets cut: which lines are dialogue, where one sentence ends, which lines are
 * too short to hear or too long to be one card, and the exact ffmpeg argument
 * vector for each clip. None of it needs a child process or a DOM, so it is
 * tested directly (`__tests__/sentenceDeck.test.ts`) and the two sides that do
 * need them — the batch extractor in main and the dialog in the renderer —
 * agree through this file rather than through two copies of the rules.
 *
 * Nothing here is Japanese-only. The study language decides which lines hold
 * study text (kana/kanji, hanzi, Cyrillic — `passageInStudyLang`, the rule the
 * Files app's one-click mine already uses), how two subtitle lines are joined
 * (no space between CJK, a space between Russian words), and how long a line
 * may be before it is split.
 */
import type { MineNoteRequest } from './anki';
import { dedupeKey, passageInStudyLang } from './filesApp/mining';
import type { StudyLang } from './studyLang';
import { isSignCue, isSongCue } from './subtitleFusionCore';
import { MAX_CLIP_SEC, MIN_CLIP_SEC } from './videoClip';

/* ------------------------------------------------------------------ *
 * Sources — what the dialog can build from.
 * ------------------------------------------------------------------ */

/**
 * One text track the dialog can offer. `id` is opaque to the renderer and is
 * handed back to main to read the track:
 *
 * - `record:<id>`   a track in the library row (downloaded, attached, Whisper);
 * - `sidecar:<path>` a subtitle file beside the video;
 * - `embedded:<n>`  the n-th text subtitle stream inside the container;
 * - `file:<path>`   the subtitle file the Files app was opened on.
 */
export interface SentenceDeckTrack {
  id: string;
  /** Track name as the source labels it — study content, shown as-is. '' for an untitled stream. */
  label: string;
  /** An untitled stream inside the file: its 1-based position, which the dialog names it by. */
  streamNumber?: number;
  /** Normalised language tag (`ja`, `zh-hans`, `en`), or '' when unknown. */
  lang: string;
  kind: 'downloaded' | 'sidecar' | 'embedded' | 'transcript' | 'translation' | 'file';
}

export interface SentenceDeckSources {
  ok: boolean;
  /** Why nothing can be built, as an i18n key. */
  reasonKey?: string;
  videoPath?: string;
  /** Library row id, when the video is in the library (Whisper needs one). */
  mediaId?: string;
  /** File name without extension — the default deck name is derived from it. */
  title?: string;
  tracks: SentenceDeckTrack[];
  /** The track the player would study with, when one exists. */
  primaryId?: string;
  /** The helper-language track the player would show under it. */
  secondaryId?: string;
}

/** A cue as the planner reads it: milliseconds, cleaned or not. */
export interface SentenceDeckCue {
  startMs: number;
  endMs: number;
  text: string;
  /** ASS style, when the track had one; the only evidence a line is a sign. */
  style?: string;
}

export interface SentenceDeckTrackRead {
  ok: boolean;
  reasonKey?: string;
  cues: SentenceDeckCue[];
}

/* ------------------------------------------------------------------ *
 * Options.
 * ------------------------------------------------------------------ */

export interface SentenceDeckOptions {
  studyLang: StudyLang;
  /** Join a line under a second (or of one or two letters) to its neighbour. */
  mergeShort: boolean;
  /** Cut a line that runs past `maxDurationMs` (or is very long) at sentence punctuation. */
  splitLong: boolean;
  /** Skip songs, signs, sound effects, speaker-only lines. */
  skipNonDialogue: boolean;
  /** Skip lines whose text is already a card in the deck. */
  skipExisting: boolean;
  minDurationMs: number;
  maxDurationMs: number;
  /** Only lines starting at or after this point. */
  rangeStartMs?: number;
  /** Only lines starting before this point. */
  rangeEndMs?: number;
}

export const SENTENCE_DECK_DEFAULTS: Omit<SentenceDeckOptions, 'studyLang'> = {
  mergeShort: true,
  splitLong: true,
  skipNonDialogue: true,
  skipExisting: true,
  minDurationMs: 600,
  maxDurationMs: 15_000,
};

/** Gap under which two lines count as one utterance for merging. */
export const SENTENCE_MERGE_GAP_MS = 600;
/** A line shorter than this is a fragment ("え？", "はい") rather than a sentence. */
export const SENTENCE_SHORT_MS = 1_000;
/** Padding each side of a clip: a cue that starts on the first mora clips it. */
export const SENTENCE_CLIP_PAD_MS = 200;
/** A deck from one episode is a few hundred lines; this bounds a runaway track. */
export const SENTENCE_DECK_MAX_CARDS = 1_500;

/* ------------------------------------------------------------------ *
 * Text clean-up.
 * ------------------------------------------------------------------ */

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;
/** Sentence-final punctuation in the three study languages. */
const TERMINAL = /[。！？!?．…‥]$|(?<!\.)\.$/u;
/** A line that ends mid-sentence. */
const CONTINUATION = /[、，,：:～〜\-–—]$/u;
/** Bracketed annotations: sound effects, speaker names, translator notes. */
const BRACKETED = /\[[^\]]*\]|［[^］]*］|\([^)]*\)|（[^）]*）|【[^】]*】|〔[^〕]*〕|＜[^＞]*＞|《[^》]*》/gu;
/**
 * A speaker label at the start of a line: `田中：`, `Маша:`, `JOHN:`. At most a
 * few words and no sentence punctuation inside, so `彼は言った：…` is left alone
 * only when it is too long to be a name.
 */
const SPEAKER_LABEL = /^(?=\p{L})(?:[^\s\d:：。！？!?.,、「」]{1,10}|[A-ZА-ЯЁ][\p{L}'-]{0,15}(?:\s[A-ZА-ЯЁ][\p{L}'-]{0,15})?)\s*[:：]\s*/u;
/** Letters of any script: what "how long is this line" counts. */
const LETTER = /[\p{L}\p{N}]/gu;

export function letterCount(text: string): number {
  return (text.match(LETTER) ?? []).length;
}

/**
 * Join the lines of one cue (or two neighbouring cues). Between two CJK
 * characters there is no space; between anything else there is one — a
 * Russian line broken at a word boundary must not glue two words together.
 */
export function joinSubtitleText(parts: readonly string[]): string {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) {
      out = part;
      continue;
    }
    const last = out.at(-1) ?? '';
    const first = part[0] ?? '';
    out += CJK_CHAR.test(last) && CJK_CHAR.test(first) ? part : ` ${part}`;
  }
  return out;
}

/** HTML/ASS tags, line breaks and dialogue dashes out; the words themselves untouched. */
export function cleanSubtitleText(text: string): string {
  const lines = String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\[Nn]/g, '\n')
    .split(/\n+/)
    // "- Hi." / "－はい" mark alternating speakers; the dash is not said.
    .map((line) => line.replace(/^\s*[-－―–—]\s*/u, '').trim());
  return joinSubtitleText(lines).replace(/\s{2,}/g, ' ').trim();
}

/**
 * The spoken part of a line: annotations and a leading speaker label removed.
 * An empty result means the line was ONLY an annotation — `（笑）`, `[拍手]`,
 * `(смеётся)`, `田中：` — and is not a sentence to hear.
 */
export function spokenText(text: string): string {
  let out = text.replace(BRACKETED, ' ');
  // A label directly after a removed bracket still counts as leading.
  out = out.trim().replace(SPEAKER_LABEL, '');
  out = out.replace(/^[\s・…‥、，,。.]+/u, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * Planning.
 * ------------------------------------------------------------------ */

export interface SentenceSegment {
  /** 1-based position in the plan, in playback order. */
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  /** The helper-language line(s) spoken over the same time, when a track was chosen. */
  translation?: string;
}

export interface SentencePlanSkips {
  outOfRange: number;
  nonDialogue: number;
  noStudyText: number;
  tooShort: number;
  tooLong: number;
  duplicate: number;
  overCap: number;
}

export interface SentencePlan {
  segments: SentenceSegment[];
  /** Lines the track held. */
  read: number;
  /** Lines joined into a neighbour. */
  merged: number;
  /** Extra sentences produced by splitting long lines. */
  split: number;
  skipped: SentencePlanSkips;
}

interface Working {
  startMs: number;
  endMs: number;
  text: string;
}

function isShort(entry: Working): boolean {
  return entry.endMs - entry.startMs < SENTENCE_SHORT_MS || letterCount(entry.text) <= 3;
}

function maxLettersFor(lang: StudyLang): number {
  // A CJK letter is a syllable; a Russian one is a phoneme.
  return lang === 'ru' ? 160 : 55;
}

function fullStopEnds(chars: readonly string[], at: number): boolean {
  let word = '';
  for (let j = at - 1; j >= 0 && !/\s/u.test(chars[j]); j -= 1) word = chars[j] + word;
  if (word.includes('.') || letterCount(word) <= 1) return false;
  let k = at + 1;
  while (k < chars.length && /[.\s"»”)]/u.test(chars[k])) k += 1;
  return k >= chars.length || /[\p{Lu}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}«"“]/u.test(chars[k]);
}

/** A line cut into its sentences, punctuation kept with the sentence it ends. */
export function splitCueSentences(text: string): string[] {
  const chars = [...text];
  const pieces: string[] = [];
  let current = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    current += ch;
    // A full stop ends a sentence only at the end or before a capital, and not
    // after an abbreviation ("т.е.", "г.") or inside a number ("3.5"); the CJK
    // and exclamation/question marks always do.
    const terminal = /[。！？!?．…‥]/u.test(ch) || (ch === '.' && fullStopEnds(chars, i));
    if (!terminal) continue;
    // Keep a run of terminals and any closing quote with the sentence it ends.
    while (i + 1 < chars.length && /[。！？!?．…‥.」』）)"»”]/u.test(chars[i + 1])) {
      i += 1;
      current += chars[i];
    }
    if (current.trim()) pieces.push(current.trim());
    current = '';
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

/**
 * Cut one over-long line at sentence punctuation, sharing its time out by
 * letter count. A piece of three letters or fewer rides with the one before it
 * (a trailing "ね。" is not a card). Returns the line unchanged when it has no
 * internal sentence boundary to cut at.
 */
export function splitAtSentences(entry: Working): Working[] {
  const pieces = splitCueSentences(entry.text);
  const joined: string[] = [];
  for (const piece of pieces) {
    if (joined.length && letterCount(piece) <= 3) joined[joined.length - 1] = joinSubtitleText([joined.at(-1) ?? '', piece]);
    else joined.push(piece);
  }
  if (joined.length < 2) return [entry];
  const total = joined.reduce((sum, piece) => sum + Math.max(1, letterCount(piece)), 0);
  const span = entry.endMs - entry.startMs;
  const out: Working[] = [];
  let cursor = entry.startMs;
  joined.forEach((piece, i) => {
    const share = Math.max(1, letterCount(piece)) / total;
    const end = i === joined.length - 1 ? entry.endMs : Math.round(cursor + span * share);
    out.push({ startMs: cursor, endMs: end, text: piece });
    cursor = end;
  });
  return out;
}

/**
 * The helper-language text spoken over `[startMs, endMs)`: every secondary cue
 * at least half inside the segment, or holding at least half of it.
 */
export function translationFor(
  startMs: number,
  endMs: number,
  secondary: readonly SentenceDeckCue[],
): string | undefined {
  const span = Math.max(1, endMs - startMs);
  const parts: string[] = [];
  for (const cue of secondary) {
    if (cue.endMs <= startMs || cue.startMs >= endMs) continue;
    const overlap = Math.min(endMs, cue.endMs) - Math.max(startMs, cue.startMs);
    const own = Math.max(1, cue.endMs - cue.startMs);
    if (overlap / own >= 0.5 || overlap / span >= 0.5) {
      const text = cleanSubtitleText(cue.text);
      if (text && !parts.includes(text)) parts.push(text);
    }
  }
  const joined = joinSubtitleText(parts);
  return joined || undefined;
}

/**
 * Turn a subtitle track into sentences. Every line that does not become one
 * is counted in a named bucket, so the dialog can say where the rest went.
 */
export function planSentenceDeck(
  primary: readonly SentenceDeckCue[],
  options: SentenceDeckOptions,
  context: {
    secondary?: readonly SentenceDeckCue[];
    /** Deck text folded by `dedupeKey` (`existingDeckKeys`). */
    existingKeys?: ReadonlySet<string>;
    maxCards?: number;
  } = {},
): SentencePlan {
  const skipped: SentencePlanSkips = {
    outOfRange: 0, nonDialogue: 0, noStudyText: 0, tooShort: 0, tooLong: 0, duplicate: 0, overCap: 0,
  };
  const lang = options.studyLang;
  const ordered = [...primary]
    .filter((cue) => Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs))
    .sort((a, b) => a.startMs - b.startMs);

  // 1. Clean, and drop what is not dialogue in the study language.
  const lines: Working[] = [];
  for (const cue of ordered) {
    if (options.rangeStartMs != null && cue.startMs < options.rangeStartMs) { skipped.outOfRange += 1; continue; }
    if (options.rangeEndMs != null && cue.startMs >= options.rangeEndMs) { skipped.outOfRange += 1; continue; }
    const cleaned = cleanSubtitleText(cue.text);
    const fusion = { start: cue.startMs / 1000, end: cue.endMs / 1000, text: cleaned, style: cue.style };
    let text = cleaned;
    if (options.skipNonDialogue) {
      if (!cleaned || isSongCue(fusion) || isSignCue(fusion)) { skipped.nonDialogue += 1; continue; }
      text = spokenText(cleaned);
      if (!text) { skipped.nonDialogue += 1; continue; }
    }
    if (!text || !passageInStudyLang(text, lang)) { skipped.noStudyText += 1; continue; }
    lines.push({ startMs: Math.max(0, cue.startMs), endMs: Math.max(cue.startMs, cue.endMs), text });
  }

  // 2. Merge fragments into their neighbour.
  let merged = 0;
  const utterances: Working[] = [];
  for (const line of lines) {
    const last = utterances.at(-1);
    if (
      options.mergeShort
      && last
      && line.startMs - last.endMs <= SENTENCE_MERGE_GAP_MS
      && Math.max(line.endMs, last.endMs) - last.startMs <= options.maxDurationMs
      && (isShort(last) || isShort(line) || (CONTINUATION.test(last.text) && !TERMINAL.test(last.text)))
    ) {
      last.endMs = Math.max(last.endMs, line.endMs);
      last.text = joinSubtitleText([last.text, line.text]);
      merged += 1;
      continue;
    }
    utterances.push({ ...line });
  }

  // 3. Split the over-long, then 4. filter by length and duplicates.
  let split = 0;
  const segments: SentenceSegment[] = [];
  const seen = new Set<string>(options.skipExisting ? context.existingKeys ?? [] : []);
  const maxCards = context.maxCards ?? SENTENCE_DECK_MAX_CARDS;
  const maxLetters = maxLettersFor(lang);
  for (const utterance of utterances) {
    const tooLong = utterance.endMs - utterance.startMs > options.maxDurationMs
      || letterCount(utterance.text) > maxLetters;
    const pieces = options.splitLong && tooLong ? splitAtSentences(utterance) : [utterance];
    split += pieces.length - 1;
    for (const piece of pieces) {
      const duration = piece.endMs - piece.startMs;
      if (duration < options.minDurationMs) { skipped.tooShort += 1; continue; }
      if (duration > options.maxDurationMs || duration > MAX_CLIP_SEC * 1000) { skipped.tooLong += 1; continue; }
      const key = dedupeKey(piece.text);
      if (seen.has(key)) { skipped.duplicate += 1; continue; }
      if (segments.length >= maxCards) { skipped.overCap += 1; continue; }
      seen.add(key);
      const translation = context.secondary?.length
        ? translationFor(piece.startMs, piece.endMs, context.secondary)
        : undefined;
      segments.push({
        index: segments.length + 1,
        startMs: piece.startMs,
        endMs: piece.endMs,
        text: piece.text,
        ...(translation ? { translation } : {}),
      });
    }
  }

  return { segments, read: primary.length, merged, split, skipped };
}

/* ------------------------------------------------------------------ *
 * Audio — bounds and the ffmpeg argument vectors.
 * ------------------------------------------------------------------ */

export interface SentenceClipBounds {
  startSec: number;
  durationSec: number;
}

/**
 * The padded window to cut for one sentence, clamped at the start of the file
 * and at `MAX_CLIP_SEC` — a mistimed cue that runs for minutes must not become
 * a multi-megabyte card.
 */
export function sentenceClipBounds(
  startMs: number,
  endMs: number,
  padMs: number = SENTENCE_CLIP_PAD_MS,
): SentenceClipBounds {
  const pad = Math.max(0, padMs) / 1000;
  const rawStart = Math.min(startMs, endMs) / 1000;
  const rawEnd = Math.max(startMs, endMs) / 1000;
  const startSec = Math.max(0, rawStart - pad);
  const durationSec = Math.min(MAX_CLIP_SEC, Math.max(MIN_CLIP_SEC, rawEnd + pad - startSec));
  // Millisecond precision: what ffmpeg is given, and what a test can compare.
  const ms = (value: number): number => Math.round(value * 1000) / 1000;
  return { startSec: ms(startSec), durationSec: ms(durationSec) };
}

export interface SentenceAudioArgsInput {
  filePath: string;
  bounds: SentenceClipBounds;
  /** Index among the file's AUDIO streams (`0:a:<n>`). */
  audioStream?: number;
}

/**
 * One sentence as speech-sized MP3 on stdout.
 *
 * - Input seek (`-ss` before `-i`): instant on a 24-minute file, and accurate —
 *   ffmpeg decodes from the keyframe and discards up to the exact point.
 * - Mono, 44.1 kHz, 64 kb/s MP3: a three-second line is ~25 KB, and MP3 is the
 *   one format every Anki client (desktop, AnkiDroid, AnkiMobile) plays; Opus
 *   would be smaller and is not reliably playable on iOS.
 * - `loudnorm` single pass so a whispered line and a shouted one review at the
 *   same level, then a 20 ms fade in and 60 ms fade out so the cut does not click.
 */
export function sentenceAudioFfmpegArgs(input: SentenceAudioArgsInput): string[] {
  const { startSec, durationSec } = input.bounds;
  const stream = Math.max(0, Math.floor(input.audioStream ?? 0));
  const fadeOut = Math.max(0, durationSec - 0.06);
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-ss', startSec.toFixed(3),
    '-i', input.filePath,
    '-t', durationSec.toFixed(3),
    '-map', `0:a:${stream}`,
    '-vn', '-sn', '-dn',
    '-ac', '1',
    '-af', [
      'loudnorm=I=-18:TP=-1.5:LRA=11',
      'aresample=44100',
      'afade=t=in:d=0.02',
      `afade=t=out:st=${fadeOut.toFixed(3)}:d=0.06`,
    ].join(','),
    '-c:a', 'libmp3lame',
    '-b:a', '64k',
    '-f', 'mp3',
    'pipe:1',
  ];
}

/** A still from the middle of the sentence, as a small JPEG on stdout. */
export function sentenceStillFfmpegArgs(filePath: string, bounds: SentenceClipBounds): string[] {
  const middle = bounds.startSec + bounds.durationSec / 2;
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-ss', middle.toFixed(3),
    '-i', filePath,
    '-frames:v', '1',
    '-map', '0:v:0',
    '-vf', "scale=-2:'min(360,ih)'",
    '-q:v', '5',
    '-f', 'image2',
    '-c:v', 'mjpeg',
    'pipe:1',
  ];
}

/**
 * Which audio stream carries the study language. A dual-audio release often
 * puts the dub first; cutting stream 0 would give a Japanese deck English audio.
 * Falls back to the first stream when nothing is tagged.
 */
export function studyAudioStreamIndex(languages: readonly (string | null)[], lang: StudyLang): number {
  const wanted = lang === 'ja' ? ['ja', 'jpn'] : lang === 'zh' ? ['zh', 'chi', 'zho', 'cmn'] : ['ru', 'rus'];
  const index = languages.findIndex((tag) => {
    const value = (tag ?? '').toLowerCase();
    return wanted.some((code) => value === code || value.startsWith(`${code}-`));
  });
  return index >= 0 ? index : 0;
}

/* ------------------------------------------------------------------ *
 * Names and identity.
 * ------------------------------------------------------------------ */

/**
 * The default deck name for an episode file: its name without the release
 * group, resolution and checksum tags. `[SubsPlease] Yuru Camp - 01 (1080p)
 * [ABCD1234].mkv` becomes `Yuru Camp - 01`. Editable in the dialog; study
 * content, never translated.
 */
export function sentenceDeckNameFromPath(filePath: string): string {
  const base = String(filePath ?? '').split(/[\\/]/).pop() ?? '';
  let name = base.replace(/\.[a-z0-9]{2,4}$/i, '');
  name = name.replace(/^(?:\s*\[[^\]]*\]\s*)+/, '');
  name = name.replace(/(?:\s*[[(][^\])]*[\])]\s*)+$/, '');
  if (!/\s/.test(name) && /[._]/.test(name)) name = name.replace(/[._]+/g, ' ');
  return name.replace(/\s{2,}/g, ' ').trim() || base || 'Sentence deck';
}

/** Stable deck-group id for one video file, so every card from it groups together. */
export function sentenceDeckBookId(filePath: string): string {
  const key = String(filePath ?? '').replace(/\\/g, '/').toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `sentence-deck:${hash.toString(36)}`;
}

/** `mm:ss` (or `h:mm:ss`) for a card's scene reference. */
export function sentenceTimeLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The Anki half of one sentence card, through the shared `MineNoteRequest`
 * contract — a sentence card routed by the user's mining rules like any other
 * subtitle mine, with the clip as `[sound:…]` and the scene as the image.
 */
export function buildSentenceDeckNoteRequest(
  segment: Pick<SentenceSegment, 'text' | 'translation'>,
  input: {
    studyLang: StudyLang;
    audioBase64?: string;
    audioFilename?: string;
    imageBase64?: string;
    imageFilename?: string;
  },
): MineNoteRequest {
  return {
    route: { source: 'subtitle', cardKind: 'sentence', language: input.studyLang },
    term: segment.text,
    sentence: segment.text,
    surface: segment.text,
    ...(segment.translation ? { sentenceTranslation: segment.translation } : {}),
    ...(input.audioBase64 && input.audioFilename
      ? { audioBase64: input.audioBase64, audioFilename: input.audioFilename }
      : {}),
    ...(input.imageBase64 && input.imageFilename
      ? { imageBase64: input.imageBase64, imageFilename: input.imageFilename }
      : {}),
    extraTags: ['gum-sentence-deck'],
  };
}
