/**
 * Mining a lyric line, through the SAME study loop video uses.
 *
 * Until now music was the one immersion surface with no way out of it. It has live lyrics,
 * an active-line highlight and word lookup — everything needed to *read* a song — and no
 * mine action, so a line you worked out could not become a card. Video's loop is
 * `VideoCoreStudyCue → createVideoCoreMiningDraft → buildVideoCoreMineRequest →
 * window.api.ankiMineNote → appendVideoCoreMiningHistory`, and Review
 * (`SeanimeWatchLoopPanel`) reads that history. Music was outside all of it.
 *
 * **This file does not build a second loop.** It is the adapter that lets a song enter the
 * existing one: `VideoCoreMiningSource` already carries `playbackType`, `streamType`,
 * `localFilePath` and `mediaTitle`, and `VideoCoreStudyCue` is just an index, a track
 * number, text and a time range — none of that is video-specific. Two histories would mean
 * two Review panels and two chances to disagree about what the user has mined, which is the
 * shape this track has been paying for elsewhere all week.
 *
 * ## The one honest difficulty: plain lyrics have no timing
 *
 * `useLiveLyrics` yields either `synced` cues (from an `.lrc`, with real timestamps) or
 * `plain` lines (no timing at all). Provenance exists so a card can be traced back to the
 * moment it came from, so inventing a timestamp for a plain line would be a lie told in the
 * one place whose whole job is to be true.
 *
 * Both are minable, and they are distinguished rather than blurred:
 *
 * - `synced` → `streamType: 'music-lrc'`, and the cue's OWN start/end.
 * - `plain`  → `streamType: 'music-plain'`, and a zero-length range at the playback
 *   position when the user pressed mine. That is not the line's timing and does not claim
 *   to be; it is where the listener was. `startMs === endMs` is the marker of that.
 *
 * A reader of the history can therefore always tell which kind of locator it has.
 */
import { adjacentStudyCue, type VideoCoreStudyCue } from './videoCoreStudy';
import type { VideoCoreMiningSource } from './videoCoreMining';
import type { MediaItem } from './types';

/** Distinguishes a real lyric timestamp from a listening position. */
export type MusicLyricsKind = 'synced' | 'plain';

export const MUSIC_STREAM_TYPE: Record<MusicLyricsKind, string> = {
  synced: 'music-lrc',
  plain: 'music-plain',
};

/** `trackNumber` is a subtitle-track index for video. A song has exactly one lyric track. */
export const MUSIC_LYRICS_TRACK_NUMBER = 0;

export interface MusicMiningLine {
  /** Position in the lyric list, which is the locator for a plain line. */
  index: number;
  text: string;
  /** Seconds. Absent for a plain line. */
  startSec?: number;
  endSec?: number;
}

function seconds(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Where a mined line came from. `playbackId` must be stable for one song so that two lines
 * mined from the same track group together in Review; the file path is the only identifier
 * a local song reliably has (`MediaItem.id` is regenerated when a library is re-imported).
 */
export function musicMiningSource(
  item: Pick<MediaItem, 'id' | 'title' | 'path' | 'fileName'>,
  kind: MusicLyricsKind,
): VideoCoreMiningSource {
  const path = item.path?.trim() ?? '';
  return {
    playbackId: path || `music:${item.id}`,
    playbackType: 'music',
    streamType: MUSIC_STREAM_TYPE[kind],
    ...(path ? { localFilePath: path } : {}),
    mediaTitle: item.title?.trim() || item.fileName || '',
  };
}

/**
 * Build the cue the shared mining path expects.
 *
 * `positionSec` is only consulted for a plain line. Passing it for a synced line is
 * harmless and ignored — the cue's own timing always wins, because that is the truthful
 * locator when one exists.
 */
export function musicStudyCue(
  line: MusicMiningLine,
  kind: MusicLyricsKind,
  positionSec: number,
): VideoCoreStudyCue | null {
  const text = line.text?.trim() ?? '';
  // An empty line is a spacer in a lyric sheet, never a card. Refusing here rather than in
  // the UI means no caller can mine one by wiring the button up slightly differently.
  if (!text) return null;
  if (!Number.isInteger(line.index) || line.index < 0) return null;

  if (kind === 'synced') {
    const start = seconds(line.startSec);
    const end = seconds(line.endSec);
    // A cue claiming to be synced without usable timing is a contradiction; the caller has
    // mislabelled it, and silently downgrading to a listening position would hide that.
    if (start == null || end == null || end < start) return null;
    return {
      index: line.index,
      trackNumber: MUSIC_LYRICS_TRACK_NUMBER,
      text,
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
    };
  }

  const at = seconds(positionSec) ?? 0;
  const ms = Math.round(at * 1000);
  return {
    index: line.index,
    trackNumber: MUSIC_LYRICS_TRACK_NUMBER,
    text,
    // Zero-length on purpose — see the header. This is where the listener was, not the
    // line's duration, and a reader must be able to tell.
    startMs: ms,
    endMs: ms,
  };
}

/**
 * The cue list the lyrics transport steps through — slice 20.
 *
 * Built by running every line through `musicStudyCue` rather than by mapping the lyric
 * cues straight across, so "what counts as a music cue" has exactly ONE answer. The
 * lyrics pane had its own inline conversion, which meant the Mine button and the
 * prev/replay/next buttons could disagree about a line: `musicStudyCue` refuses a blank
 * line and a `synced` line whose timing is unusable, and the inline version accepted both.
 * Today's three parsers all drop empty-text cues (`subtitles.ts`), so that divergence is
 * not reachable through them — this is not a bug fix, it is removing the second answer
 * before a fourth parser or a hand-picked file makes it one.
 *
 * **A refused line is dropped, so array position and lyric index diverge.** Every reader
 * below therefore addresses a cue by `cue.index` — the position in the lyric list, which
 * is what `useLiveLyrics`'s `activeIndex` counts — never by where it sits in this array.
 *
 * Synced only, by construction: `musicStudyCue(_, 'plain', _)` yields a zero-length range
 * at the listening position, which is a truthful locator for a card and a meaningless one
 * to seek to. A plain sheet has nothing to navigate.
 */
export function musicTransportCues(
  lines: readonly MusicMiningLine[],
): VideoCoreStudyCue[] {
  const cues: VideoCoreStudyCue[] = [];
  for (const line of lines) {
    // `positionSec` is ignored for a synced line — the cue's own timing always wins.
    const cue = musicStudyCue(line, 'synced', 0);
    if (cue) cues.push(cue);
  }
  return cues;
}

/**
 * Where previous/next line should seek to, in seconds, or `null` when there is nowhere.
 *
 * The stepping itself is `adjacentStudyCue` — the same function the video overlay's
 * previous/next uses, including its 50 ms tolerance for "which cue am I on". Re-deriving
 * that rule here would be a second answer to a question video already answers.
 */
export function musicCueStepSec(
  cues: readonly VideoCoreStudyCue[],
  positionSec: number,
  direction: -1 | 1,
): number | null {
  const at = seconds(positionSec) ?? 0;
  const target = adjacentStudyCue(cues, Math.round(at * 1000), direction);
  return target ? target.startMs / 1000 : null;
}

/**
 * Where replay-line should seek to: the start of the line currently being sung.
 *
 * `activeIndex` is a position in the LYRIC list, not in `cues`, so this looks the cue up
 * by `cue.index`. Indexing `cues[activeIndex]` happens to agree whenever nothing was
 * refused and silently targets the wrong line the moment something is — the failure mode
 * being designed out here.
 */
export function musicCueReplaySec(
  cues: readonly VideoCoreStudyCue[],
  activeIndex: number,
): number | null {
  if (!Number.isInteger(activeIndex) || activeIndex < 0) return null;
  const cue = cues.find((c) => c.index === activeIndex);
  return cue ? cue.startMs / 1000 : null;
}

/** True when provenance carries a real lyric timestamp rather than a listening position. */
export function isSyncedMusicProvenance(
  source: Pick<VideoCoreMiningSource, 'playbackType' | 'streamType'>,
): boolean {
  return source.playbackType === 'music' && source.streamType === MUSIC_STREAM_TYPE.synced;
}

/** True for anything mined from a song, however its lyrics were sourced. */
export function isMusicProvenance(
  source: Pick<VideoCoreMiningSource, 'playbackType'>,
): boolean {
  return source.playbackType === 'music';
}
