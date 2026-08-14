/**
 * The pure half of EN→JA subtitle fusion: which English cues are worth
 * transcribing, and what stretches of audio to hand Whisper.
 *
 * Plan: `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md`, stages F1 and F2. The one
 * idea behind the whole feature is that an English subtitle track already knows
 * something Whisper does not — *when* each line is spoken. Today's transcription
 * job slices audio on a fixed 30-second grid (`chunksToSrt`), so its cues are
 * 30-second blocks: unusable for reading along, and impossible to compare against
 * a per-line translation. Slicing on the English track's own cue boundaries fixes
 * both at once, and costs nothing but this arithmetic.
 *
 * No Electron and no Node imports, like `translateCore.ts`: everything here is a
 * function of its arguments so it can be tested without a media file.
 */

/** A parsed subtitle cue, in seconds. Structurally the `Cue` of `subtitleCues.ts`. */
export interface FusionCue {
  start: number;
  end: number;
  text: string;
  /** ASS style name, when the source was an ASS/SSA file. */
  style?: string;
}

/** Why a cue will not be transcribed. */
export type CueExclusionReason =
  /** Song lyrics — marked with a music glyph, or carried by a karaoke style. */
  | 'music'
  /** A sign, title card, caption or credit: typeset, not spoken. */
  | 'sign'
  /** Nothing left after trimming, or a non-positive duration. */
  | 'empty';

export interface CueSelection {
  /** The cues to transcribe, in time order. */
  cues: FusionCue[];
  excluded: { reason: CueExclusionReason; cue: FusionCue }[];
}

/** One stretch of audio to send Whisper, and the cues it covers. */
export interface AsrWindow {
  /** Padded window start, seconds, never negative. */
  startSec: number;
  /** Padded window end, seconds. */
  endSec: number;
  /** Indices into {@link CueSelection.cues}, ascending and contiguous. */
  cueIndices: number[];
}

/**
 * Adjacent cues closer together than this become one ASR window.
 *
 * Whisper is markedly better with a sentence of context than with a clause, and
 * two lines 300 ms apart are usually one breath. Provisional — the plan's F7
 * harness calibrates it; it is not a measured constant yet.
 */
export const FUSION_MERGE_GAP_SEC = 0.4;

/**
 * Padding on each side of a window.
 *
 * Subtitle timing is authored to be readable, not to be sample-accurate: a cue
 * routinely appears a beat before the first syllable and vanishes on the last.
 * Without padding the window clips the word it exists to capture.
 */
export const FUSION_WINDOW_PAD_SEC = 0.25;

/**
 * Hard cap on one window, matching `CHUNK_SECONDS` in `main/transcriptionJobs.ts`.
 *
 * The per-window IPC payload is a Float32 slice, so this is also what keeps the
 * message size exactly where the existing grid already puts it (~1.9 MB).
 */
export const FUSION_MAX_WINDOW_SEC = 30;

/**
 * How long a *merged* window is allowed to get. Well under the hard cap, and that
 * gap is the whole point.
 *
 * Measured on a real track before this constant existed — the English captions of
 * `Introduction and why I start this podcast … #1`, 38 cues over 305 s: **37 of 37
 * gaps are below the merge threshold and 36 are exactly zero.** A caption track is
 * routinely authored contiguously, so "merge while the gap is small" alone merges
 * *everything*, and the run stops only at the 30 s cap — rebuilding precisely the
 * 30-second blocks this feature exists to escape. Merging is for giving Whisper a
 * sentence of context around a short line; past about this length it has all the
 * context it can use and is only losing timing resolution.
 */
export const FUSION_TARGET_WINDOW_SEC = 12;

/** A window shorter than this carries no word worth a Whisper round trip. */
export const FUSION_MIN_WINDOW_SEC = 0.3;

/** Music glyphs releases use to mark sung lines. */
const MUSIC_GLYPHS = /[♪-♭\u{1F3B5}\u{1F3B6}]/u;

/**
 * Style-name tokens that mean "not a spoken line".
 *
 * Matched against the ASS style name split on separators and camel-case humps, so
 * `OP-JP`, `SignsTitles` and `Karaoke_Romaji` all resolve. Whole tokens only:
 * matching substrings would make `Top` a sign.
 */
const SIGN_STYLE_TOKENS = new Set([
  'sign', 'signs', 'title', 'titles', 'caption', 'captions',
  'credit', 'credits', 'staff', 'typeset', 'typesetting', 'ts',
  'overlay', 'screen', 'banner', 'note', 'notes',
]);

/** Style-name tokens that mean "sung", kept separate so the reason is accurate. */
const SONG_STYLE_TOKENS = new Set([
  'op', 'ed', 'opening', 'ending', 'song', 'songs',
  'lyric', 'lyrics', 'karaoke', 'kara', 'romaji', 'insert',
]);

/**
 * A style name reduced to comparable tokens.
 *
 * Trailing digits are stripped as well as kept, because `OP1`, `ED2` and
 * `Karaoke2` are how a release names its second opening — dropping the digit is
 * the difference between recognizing those and transcribing a theme song.
 */
function styleTokens(style: string | undefined): string[] {
  if (!style) return [];
  const parts = style
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    out.push(part);
    const bare = part.replace(/\d+$/, '');
    if (bare && bare !== part) out.push(bare);
  }
  return out;
}

/** True when the cue is a song lyric rather than dialogue. */
export function isSongCue(cue: FusionCue): boolean {
  if (MUSIC_GLYPHS.test(cue.text)) return true;
  return styleTokens(cue.style).some((token) => SONG_STYLE_TOKENS.has(token));
}

/** True when the cue is typeset screen text rather than something spoken. */
export function isSignCue(cue: FusionCue): boolean {
  return styleTokens(cue.style).some((token) => SIGN_STYLE_TOKENS.has(token));
}

/**
 * Split a cue list into the dialogue worth transcribing and everything else.
 *
 * Songs are excluded rather than transcribed because they are the exact input
 * Whisper hallucinates on — a padded window over an instrumental bridge is how
 * "ご視聴ありがとうございました" ends up in a subtitle file. Signs are excluded
 * because nobody says them, so the audio under them is either silence or the
 * unrelated line that happens to overlap.
 *
 * Order is preserved and the excluded cues are returned rather than counted, so a
 * caller can report *what* it dropped instead of only how many.
 */
export function selectDialogueCues(cues: readonly FusionCue[]): CueSelection {
  const selection: CueSelection = { cues: [], excluded: [] };
  for (const cue of [...cues].sort((a, b) => a.start - b.start)) {
    if (!cue.text.trim() || !(cue.end > cue.start)) {
      selection.excluded.push({ reason: 'empty', cue });
      continue;
    }
    if (isSongCue(cue)) {
      selection.excluded.push({ reason: 'music', cue });
      continue;
    }
    if (isSignCue(cue)) {
      selection.excluded.push({ reason: 'sign', cue });
      continue;
    }
    selection.cues.push(cue);
  }
  return selection;
}

export interface AsrWindowOptions {
  mergeGapSec?: number;
  padSec?: number;
  /** Soft cap: cues stop merging past this. Defaults to {@link FUSION_TARGET_WINDOW_SEC}. */
  targetWindowSec?: number;
  /** Hard cap: one window never exceeds it, even for a single over-long cue. */
  maxWindowSec?: number;
  /** Media runtime, when known, so no window runs off the end of the audio. */
  durationSec?: number;
}

/**
 * Group cues into padded ASR windows, keeping the window→cue map.
 *
 * A group grows while the next cue is within the merge gap *and* the padded span
 * stays under the soft target; the target wins over the gap, which is what keeps a
 * contiguously-authored caption track from collapsing into one 30-second block
 * (see {@link FUSION_TARGET_WINDOW_SEC} for the measurement). A single cue longer
 * than the hard cap is truncated to it rather than dropped: the first 30 seconds of
 * an unusually long line is worth more than nothing, and the cue keeps its own
 * timing either way.
 */
export function planAsrWindows(
  cues: readonly FusionCue[],
  options: AsrWindowOptions = {},
): AsrWindow[] {
  const mergeGap = options.mergeGapSec ?? FUSION_MERGE_GAP_SEC;
  const pad = options.padSec ?? FUSION_WINDOW_PAD_SEC;
  const maxWindow = options.maxWindowSec ?? FUSION_MAX_WINDOW_SEC;
  const target = Math.min(options.targetWindowSec ?? FUSION_TARGET_WINDOW_SEC, maxWindow);
  const duration = options.durationSec;
  if (!cues.length || maxWindow <= 0) return [];

  const groups: { start: number; end: number; indices: number[] }[] = [];
  cues.forEach((cue, index) => {
    const open = groups[groups.length - 1];
    const wouldEnd = open ? Math.max(open.end, cue.end) : cue.end;
    const fits = open
      && cue.start - open.end < mergeGap
      && (wouldEnd - open.start) + pad * 2 <= target;
    if (fits && open) {
      open.end = wouldEnd;
      open.indices.push(index);
      return;
    }
    groups.push({ start: cue.start, end: cue.end, indices: [index] });
  });

  const windows: AsrWindow[] = [];
  for (const group of groups) {
    const startSec = Math.max(0, round3(group.start - pad));
    let endSec = round3(group.end + pad);
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
      endSec = Math.min(endSec, round3(duration));
    }
    endSec = Math.min(endSec, round3(startSec + maxWindow));
    if (endSec - startSec < FUSION_MIN_WINDOW_SEC) continue;
    windows.push({ startSec, endSec, cueIndices: group.indices });
  }
  return windows;
}

/** Milliseconds are the resolution subtitle formats express; keep the noise out. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Turn one transcript per window back into cues on the English track's timing.
 *
 * A window that merged several cues yields **one** cue spanning them, not a copy
 * of the blob per cue. Splitting a merged transcript back onto its cues needs the
 * per-cue reference translation (plan stages F4/F5); inventing a split here would
 * be a guess presented as timing, and duplicating the text would be worse.
 */
export function windowCuesToSubtitleCues(
  windows: readonly AsrWindow[],
  cues: readonly FusionCue[],
  texts: readonly string[],
): { start: number; end: number; text: string }[] {
  return windowDecisionsToFusedCues(
    windows,
    cues,
    texts.map((text, index) => ({
      windowIndex: index,
      text: text ?? '',
      basis: 'whisper' as const,
      score: 0,
      confidence: 0,
    })),
  ).map(({ start, end, text }) => ({ start, end, text }));
}

// Serialization is deliberately not here: `shared/subtitlesExport.ts` already owns
// `cuesToSrt`, and `windowCuesToSubtitleCues` never emits a blank cue, so that
// writer needs no fusion-specific variant.

// ---------------------------------------------------------------------------
// F3/F4 — the reference translation, and the agreement scoring that uses it
// ---------------------------------------------------------------------------
//
// F3 alone changes nothing a user can see: a per-cue translation nobody consults
// is the same dead data the dictionary's `etymology` table was for seven schema
// versions. So the two stages land together. F4 is what turns the reference into
// a decision, and the decision into something observable — a window Whisper
// returned nothing for now carries the translated English line instead of
// vanishing from the track.
//
// The policy the plan fixes and this implements: **Whisper's text wins.** The
// reference is a referee, not an author. Offline — which is the only path here,
// F5's cloud arbitration being a later stage — a disagreement therefore still
// yields Whisper's words, at reduced confidence. For a study app the
// verbatim-but-possibly-misheard line still matches the audio the learner hears;
// a fluent paraphrase does not.

/** What a fused cue's text came from. */
export type FusionBasis =
  /** Whisper's transcript, and the reference agrees with it. */
  | 'whisper'
  /** Whisper's transcript, kept despite the reference disagreeing. */
  | 'whisper-unverified'
  /** Whisper produced nothing usable; the translated English line stands in. */
  | 'reference'
  /** Neither side produced text. The cue is dropped from the track. */
  | 'empty';

export interface FusedWindowDecision {
  /** Index into the window list this decision belongs to. */
  windowIndex: number;
  text: string;
  basis: FusionBasis;
  /** Bigram Dice overlap of the two candidates, 0–1. Zero when either is empty. */
  score: number;
  /** How much to trust the line, 0–1. Drives the transcript UI's badge. */
  confidence: number;
}

/**
 * Above this overlap the two candidates are telling the same story.
 *
 * **Provisional, and deliberately so.** The plan's F7 harness calibrates this
 * against human Japanese tracks; until it runs, this is a starting point, not a
 * measured constant. It is set low because the two strings being compared are not
 * two attempts at the same sentence: one is a transcript and the other a machine
 * translation of a *translation*, so even a perfect pair shares only content
 * words. A high threshold here would mark almost every correct cue as disputed.
 */
export const FUSION_AGREE_SCORE = 0.34;

/** Confidence for a cue both sides agree on, before the overlap bonus. */
const CONFIDENCE_AGREED = 0.6;
/** Whisper kept over an objecting reference: usable, flagged, not trusted. */
const CONFIDENCE_UNVERIFIED = 0.35;
/** Whisper with nothing to check it against — no reference was produced. */
const CONFIDENCE_UNREFEREED = 0.45;
/** The translated line standing in for silence. Meaning, not words. */
const CONFIDENCE_REFERENCE = 0.25;

/**
 * Fold a candidate down to the characters that carry the comparison.
 *
 * NFKC first, so full-width Latin and half-width kana compare with their normal
 * forms. Then katakana→hiragana: Whisper writes ジュース where a translator writes
 * じゅーす often enough that scoring them as different words would flag correct
 * cues. Then every character that is not a letter or digit goes — Japanese
 * punctuation, spaces and the ASCII punctuation a translator adds are pure noise
 * in a bigram comparison, and Whisper's comma placement is not evidence about
 * meaning.
 *
 * The prolonged sound mark ー is **kept**: it is a mora, not punctuation, and
 * dropping it merges ビル and ビール.
 */
export function normalizeForFusionCompare(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[^\p{Letter}\p{Number}ー]/gu, '');
}

/**
 * Sørensen–Dice coefficient over character bigrams.
 *
 * Bigrams rather than characters because Japanese has a small alphabet and a high
 * base rate of coincidental character overlap — two unrelated sentences routinely
 * share の, に and し. Bigrams rather than words because there is no whitespace to
 * split on and running a tokenizer here would drag a dictionary into a pure module.
 *
 * A one-character string has no bigrams, so it is compared as itself; without that
 * every single-character cue would score 0 against everything.
 */
export function bigramDice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string): Map<string, number> => {
    const out = new Map<string, number>();
    const units = [...s];
    if (units.length === 1) return new Map([[units[0], 1]]);
    for (let i = 0; i < units.length - 1; i += 1) {
      const key = units[i] + units[i + 1];
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  };
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  let leftTotal = 0;
  let rightTotal = 0;
  for (const count of left.values()) leftTotal += count;
  for (const [key, count] of right) {
    rightTotal += count;
    const other = left.get(key);
    if (other) shared += Math.min(other, count);
  }
  if (!leftTotal || !rightTotal) return 0;
  return (2 * shared) / (leftTotal + rightTotal);
}

/**
 * Decide one window's text from its two candidates.
 *
 * Pure, so the whole classification is testable without audio, a model, or a
 * media file — which is the point of the plan putting scoring in this module.
 */
export function decideFusedWindow(
  windowIndex: number,
  whisper: string,
  reference: string,
): FusedWindowDecision {
  const whisperText = whisper.trim();
  const referenceText = reference.trim();

  if (!whisperText && !referenceText) {
    return { windowIndex, text: '', basis: 'empty', score: 0, confidence: 0 };
  }
  if (!whisperText) {
    return {
      windowIndex,
      text: referenceText,
      basis: 'reference',
      score: 0,
      confidence: CONFIDENCE_REFERENCE,
    };
  }
  if (!referenceText) {
    return {
      windowIndex,
      text: whisperText,
      basis: 'whisper',
      score: 0,
      confidence: CONFIDENCE_UNREFEREED,
    };
  }

  const score = bigramDice(
    normalizeForFusionCompare(whisperText),
    normalizeForFusionCompare(referenceText),
  );
  if (score >= FUSION_AGREE_SCORE) {
    // The bonus is bounded so a perfect overlap still reads as machine output.
    const confidence = Math.min(0.95, CONFIDENCE_AGREED + 0.35 * score);
    return { windowIndex, text: whisperText, basis: 'whisper', score, confidence };
  }
  return {
    windowIndex,
    text: whisperText,
    basis: 'whisper-unverified',
    score,
    confidence: CONFIDENCE_UNVERIFIED,
  };
}

/**
 * The English text a window's cues contribute to one translation request.
 *
 * A merged window covers several cues, and translating them separately then
 * gluing the results back together would produce Japanese that reads as a list of
 * fragments. The reference is compared against a transcript of the *whole* window,
 * so it has to be a translation of the whole window.
 */
export function windowSourceText(
  window: AsrWindow,
  cues: readonly FusionCue[],
): string {
  return window.cueIndices
    .map((index) => cues[index]?.text.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

/**
 * Score every window, in window order.
 *
 * `references` is indexed by window, and a missing entry is an empty string
 * rather than an error: the translator is optional (no model installed, a
 * cancelled batch, a chunk the model declined), and the plan requires the offline
 * path to degrade rather than fail. With no references at all this returns
 * exactly what F2 alone produced, every cue marked `whisper`.
 */
export function decideFusedWindows(
  whisperTexts: readonly string[],
  references: readonly string[],
): FusedWindowDecision[] {
  return whisperTexts.map((text, index) =>
    decideFusedWindow(index, text ?? '', references[index] ?? ''));
}

/**
 * Mean confidence over the windows that produced text.
 *
 * Dropped windows are excluded rather than counted as zero. They are not lines
 * the track claims badly; they are lines it does not claim at all, and averaging
 * them in would make a short episode with a lot of silence look untrustworthy.
 * Returns 0 when nothing survived, which is the honest reading of an empty track.
 */
export function meanFusionConfidence(decisions: readonly FusedWindowDecision[]): number {
  const kept = decisions.filter((decision) => decision.text.trim().length > 0);
  if (!kept.length) return 0;
  const total = kept.reduce((sum, decision) => sum + decision.confidence, 0);
  return Math.round((total / kept.length) * 1000) / 1000;
}

/** One line as it will appear in the fused track, with why it says what it says. */
export interface FusedCueRow {
  start: number;
  end: number;
  text: string;
  /** Which ASR window produced it; several cues can share one merged window. */
  windowIndex: number;
  basis: FusionBasis;
  score: number;
  confidence: number;
}

/**
 * The fused track's cues *and* their provenance, from one skip rule.
 *
 * `windowCuesToSubtitleCues` is defined in terms of this deliberately. The F6
 * sidecar is indexed by cue position in the written SRT, so if the writer and the
 * sidecar builder each decided independently which windows to drop, one silent
 * divergence would mis-attribute every badge after it — a confidence number
 * pointing at the wrong line is worse than no confidence number.
 */
export function windowDecisionsToFusedCues(
  windows: readonly AsrWindow[],
  cues: readonly FusionCue[],
  decisions: readonly FusedWindowDecision[],
): FusedCueRow[] {
  const out: FusedCueRow[] = [];
  windows.forEach((window, index) => {
    const decision = decisions[index];
    const text = (decision?.text ?? '').trim();
    if (!text) return;
    const first = cues[window.cueIndices[0]];
    const last = cues[window.cueIndices[window.cueIndices.length - 1]];
    if (!first || !last) return;
    out.push({
      start: first.start,
      end: Math.max(last.end, first.start + 0.001),
      text,
      windowIndex: index,
      basis: decision?.basis ?? 'whisper',
      score: decision?.score ?? 0,
      confidence: decision?.confidence ?? 0,
    });
  });
  return out;
}
