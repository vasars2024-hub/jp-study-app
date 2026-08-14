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
  const out: { start: number; end: number; text: string }[] = [];
  windows.forEach((window, index) => {
    const text = (texts[index] ?? '').trim();
    if (!text) return;
    const first = cues[window.cueIndices[0]];
    const last = cues[window.cueIndices[window.cueIndices.length - 1]];
    if (!first || !last) return;
    out.push({ start: first.start, end: Math.max(last.end, first.start + 0.001), text });
  });
  return out;
}

// Serialization is deliberately not here: `shared/subtitlesExport.ts` already owns
// `cuesToSrt`, and `windowCuesToSubtitleCues` never emits a blank cue, so that
// writer needs no fusion-specific variant.
