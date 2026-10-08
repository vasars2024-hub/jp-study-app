/**
 * Phase 6 slice 7 — "continue watching", the loop's missing *entry* point.
 *
 * Slice 6 closed the return leg: a mined card can take you back to the exact second it came
 * from. But there was still only one way *in* — open the media workspace, then find the file
 * again in a library grid. Meanwhile the player has been recording where you stopped in every
 * file you ever watched (`jp-video-core-resume-v1`, written by `StudyPlayerSlice`), and
 * **nothing outside the player has ever read it back**. That store is the whole feature; this
 * module is the join that makes it usable somewhere else.
 *
 * It is also the first place the migration's own resume store meets Study OS's. The legacy
 * Media Center writes `MediaItem.positionSec` / `lastPlayedAt`; VideoCore writes its own
 * entries. Two players, two positions for the same file, and no surface has ever had to
 * reconcile them. This one does — see rule 2.
 *
 * ## Five rules, each with an obvious wrong alternative
 *
 * 1. **Only `file:` resume keys become rows.** `videoCoreResumeKey` also mints `media:`,
 *    `stream:` and `playback:` keys, and `playback:` is a directstream id minted fresh on
 *    every open — it cannot identify anything across sessions (the same refusal
 *    `watchLoopSourceKey` makes, for the same reason). More decisively: the only way to
 *    reopen a local file is `MediaWorkspaceOpenRequest.localFilePath`, so a row built from
 *    any other key would render a control that cannot work. Such entries are **excluded**,
 *    not rendered disabled — a row you can see but never use is worse than no row.
 *
 * 2. **Two stores, newest write wins.** When both the VideoCore store and the Study OS media
 *    library hold a position for the same file, the later timestamp is where the user
 *    actually stopped. Preferring one player unconditionally would silently discard the
 *    session the user just finished. A library item with a position but no `lastPlayedAt`
 *    timestamps as 0, so a real VideoCore write always outranks an undated one.
 *
 * 3. **A percentage is only reported when a duration was measured.** The resume store records
 *    `positionSec` and nothing else — no duration, ever. `MediaItem.durationSec` exists only
 *    when Study OS probed the file. So `percent` is optional and the surface renders a
 *    progress bar only where it is present; everywhere else it states the timestamp, which is
 *    a fact. Inventing a denominator to fill the bar is the 1×1-GIF shape in miniature.
 *
 * 4. **"Finished" needs a duration to be knowable.** With one, a file the app-wide rule
 *    (`isWatchFinished`, `./watchFinished`) calls finished is done and is dropped — offering
 *    to "continue" the credits is worse than an empty list. Without one, no claim is made and
 *    the row stays. That is not a gap: `StudyPlayerSlice` already clears its resume entry near
 *    EOF, so VideoCore-sourced rows are unfinished by construction.
 *
 * 5. **Card counts come from provenance, never from Anki.** `seanimeWatchLoopByEntry` rolls
 *    mining history up onto the same `pathKey` this join produces, so a row can say what
 *    watching it already produced without asking Anki anything. Deliberate: this surface is
 *    meant for a desktop widget that refreshes on a timer, and a per-tick interval snapshot
 *    over a real collection is far too expensive for that — but the honest reason to keep it
 *    out is slice 6's: with Anki unreachable, every Anki-derived number becomes a confident
 *    zero. Maturity and attention stay where Anki can be asked properly, in the Review panel.
 *
 * Pure: no I/O, no `localStorage`, no IPC. The caller supplies both stores already loaded,
 * the same rule `seanimeStudyLibrary.ts` and `seanimeWatchLoop.ts` follow.
 */
import type { MediaItem } from './types';
import { studyLibraryPathKey } from './seanimeStudyLibrary';
import { seanimeWatchLoopByEntry, type WatchLoopCard } from './seanimeWatchLoop';
import type { VideoCoreResumePosition } from './videoCoreStudy';
import { isWatchFinished } from './watchFinished';

/**
 * Seconds of run-up when resuming.
 *
 * Picking up mid-sentence costs the line you were on; a few seconds of context is the
 * difference between resuming and re-finding your place. Same reasoning as
 * `WATCH_LOOP_REPLAY_LEAD_SEC`, a longer value because this returns to a *scene* rather than
 * to one cue.
 */
export const CONTINUE_WATCHING_REWIND_SEC = 5;

/**
 * Below this, "continue" and "start" are the same action, so the row is noise. The legacy
 * player writes a position for anything it opens, including a file glanced at and closed.
 */
export const CONTINUE_WATCHING_MIN_POSITION_SEC = 10;

/** Which store supplied the position. Reported so a surface can explain a disagreement. */
export type ContinueWatchingSource = 'videocore' | 'library';

export interface ContinueWatchingEntry {
  /** `studyLibraryPathKey` — the join key every Phase 6 surface already shares. */
  pathKey: string;
  /**
   * The path to hand to `MediaWorkspaceOpenRequest`. Original-cased when a real recorded
   * path was recoverable (the media library, else mining history); otherwise reconstructed
   * from the resume key, which `videoCoreResumeKey` lower-cases — fine to open on Windows,
   * which is why it is a usable fallback rather than a reason to drop the row.
   */
  localFilePath: string;
  /** Never translated: a media title is study content, per `CLAUDE.md`'s i18n scope rule. */
  title: string;
  /** Basename, for the secondary line and the `title` tooltip. */
  fileName: string;
  positionSec: number;
  /** Epoch ms of the write this row is based on. The sort key. */
  updatedAt: number;
  source: ContinueWatchingSource;
  /** Present only when Study OS probed the file — see rule 3. */
  durationSec?: number;
  /** 0–1, present only alongside `durationSec`. */
  percent?: number;
  /** Cards mined from this file. Provenance, so true whatever Anki is doing. */
  cards: number;
  /** Epoch ms of the newest mine from this file, or 0. */
  lastMinedAt: number;
}

/** Where to seek to, in seconds — the position with the rewind applied, never below 0. */
export function continueWatchingResumeSec(
  entry: Pick<ContinueWatchingEntry, 'positionSec'>,
): number {
  return Math.max(0, entry.positionSec - CONTINUE_WATCHING_REWIND_SEC);
}

/** `file:c:/media/ep1.mkv` → `c:/media/ep1.mkv`. Any other key shape → `''` (rule 1). */
export function continueWatchingPathFromKey(key: string): string {
  return typeof key === 'string' && key.startsWith('file:') ? key.slice(5) : '';
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? '';
}

interface Candidate {
  pathKey: string;
  localFilePath: string;
  positionSec: number;
  updatedAt: number;
  source: ContinueWatchingSource;
}

/**
 * The newer write wins (rule 2). Ties go to the incoming candidate only when it is strictly
 * newer, so a stable input order gives a stable result.
 */
function keepNewer(existing: Candidate | undefined, next: Candidate): Candidate {
  if (!existing) return next;
  return next.updatedAt > existing.updatedAt ? next : existing;
}

/**
 * One row of the study ledger's `shows` tally — structurally `ShowStat` from
 * `renderer/stats.ts`, redeclared here so `src/shared` stays independent of the renderer
 * (the same rule `SeanimeLibraryFile` follows against `vendor/`).
 */
export interface ContinueWatchingLedgerShow {
  /** A `videoCoreResumeKey`. Only `file:` keys can join, for rule 1's reason. */
  id: string;
  title: string;
}

export interface ContinueWatchingInput {
  /** `normalizeVideoCoreResumePositions` output — the migration player's store. */
  resumePositions?: readonly VideoCoreResumePosition[];
  /** `window.api.listMedia()` output — Study OS's own library, and its own resume field. */
  mediaItems?: readonly MediaItem[];
  /** `seanimeWatchLoopCards` output. Optional: the card rollup is an enrichment, not a gate. */
  cards?: readonly WatchLoopCard[];
  /**
   * `getSummary().shows` — what Statistics calls these files. See rule 6.
   */
  ledgerShows?: readonly ContinueWatchingLedgerShow[];
}

/**
 * Everything the user has started and not finished, newest first.
 *
 * Titles resolve media library → mining history → **study ledger** → file name, in that
 * order: the library holds a cleaned human title, the mining provenance holds whatever the
 * media server knew, the ledger holds what `StudyPlayerSlice` recorded while you actually
 * watched, and a bare file name is always better than an empty row.
 *
 * 6. **The ledger's title is preferred over the file name, and only over the file name.**
 *    An `unlinked` file — in the Seanime library but never imported into Study OS — has no
 *    library item and, until it has been mined, no provenance either, so it used to fall
 *    straight through to its basename. Statistics meanwhile named the same file properly,
 *    because `ledgerTitleForPlayback` builds `<userPreferred> — <episode>` from the
 *    sidecar's own metadata as it records watch time. The result was one file with two
 *    names on two surfaces of the same app: `Sousou no Frieren — 1` in Statistics,
 *    `sousou no frieren - 01.mkv` in the palette and the widget. It is inserted *below*
 *    the library and provenance titles rather than above them because those two are the
 *    ones a user can curate, and above the basename because anything is.
 */
export function seanimeContinueWatching(
  input: ContinueWatchingInput,
): ContinueWatchingEntry[] {
  const byKey = new Map<string, Candidate>();

  for (const position of input.resumePositions ?? []) {
    const path = continueWatchingPathFromKey(position.key);
    if (!path) continue;
    const pathKey = studyLibraryPathKey(path);
    if (!pathKey) continue;
    byKey.set(pathKey, keepNewer(byKey.get(pathKey), {
      pathKey,
      localFilePath: path,
      positionSec: position.positionSec,
      updatedAt: position.updatedAt,
      source: 'videocore',
    }));
  }

  const items = new Map<string, MediaItem>();
  for (const item of input.mediaItems ?? []) {
    const pathKey = studyLibraryPathKey(item.path);
    if (!pathKey) continue;
    // First wins, matching `studyLibraryPathIndex`, so two rows for one path stay stable.
    if (!items.has(pathKey)) items.set(pathKey, item);
    if (typeof item.positionSec !== 'number' || !Number.isFinite(item.positionSec)) continue;
    byKey.set(pathKey, keepNewer(byKey.get(pathKey), {
      pathKey,
      localFilePath: item.path,
      positionSec: Math.max(0, item.positionSec),
      // An undated position must never outrank a real VideoCore write.
      updatedAt: typeof item.lastPlayedAt === 'number' && Number.isFinite(item.lastPlayedAt)
        ? item.lastPlayedAt
        : 0,
      source: 'library',
    }));
  }

  // The ledger keys by `videoCoreResumeKey`, this join keys by `studyLibraryPathKey`, and
  // rule 1 already owns the conversion — so a `media:`/`stream:`/`playback:` ledger row
  // simply produces no path and is skipped, exactly as its resume entry would have been.
  const ledgerTitles = new Map<string, string>();
  for (const show of input.ledgerShows ?? []) {
    const title = typeof show?.title === 'string' ? show.title.trim() : '';
    if (!title) continue;
    const pathKey = studyLibraryPathKey(continueWatchingPathFromKey(show.id ?? ''));
    if (!pathKey || ledgerTitles.has(pathKey)) continue;
    ledgerTitles.set(pathKey, title);
  }

  const rollup = seanimeWatchLoopByEntry(input.cards ?? []);
  const minedTitles = new Map<string, string>();
  const minedPaths = new Map<string, string>();
  for (const card of input.cards ?? []) {
    if (!card.pathKey) continue;
    if (card.title && !minedTitles.has(card.pathKey)) minedTitles.set(card.pathKey, card.title);
    if (card.localFilePath && !minedPaths.has(card.pathKey)) {
      minedPaths.set(card.pathKey, card.localFilePath);
    }
  }

  const entries: ContinueWatchingEntry[] = [];
  for (const candidate of byKey.values()) {
    if (candidate.positionSec < CONTINUE_WATCHING_MIN_POSITION_SEC) continue;

    const item = items.get(candidate.pathKey);
    const durationSec = typeof item?.durationSec === 'number'
      && Number.isFinite(item.durationSec)
      && item.durationSec > 0
      ? item.durationSec
      : undefined;
    if (isWatchFinished(candidate.positionSec, durationSec)) continue;

    // The resume key is lower-cased by construction, so prefer any path that was actually
    // recorded. Display quality only — all three open the same file on Windows.
    const localFilePath = item?.path
      || minedPaths.get(candidate.pathKey)
      || candidate.localFilePath;
    const fileName = baseName(localFilePath);
    const rolled = rollup.get(candidate.pathKey);

    entries.push({
      pathKey: candidate.pathKey,
      localFilePath,
      title: item?.title?.trim()
        || minedTitles.get(candidate.pathKey)
        || ledgerTitles.get(candidate.pathKey)
        || fileName,
      fileName,
      positionSec: candidate.positionSec,
      updatedAt: candidate.updatedAt,
      source: candidate.source,
      ...(durationSec != null
        ? {
            durationSec,
            percent: Math.max(0, Math.min(1, candidate.positionSec / durationSec)),
          }
        : {}),
      cards: rolled?.cards ?? 0,
      lastMinedAt: rolled?.lastMinedAt ?? 0,
    });
  }

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * `3725` → `1:02:05`, `125` → `2:05`.
 *
 * Deliberately not `formatWatchLoopTimestamp`: that one prints a cue position inside a line
 * and never needs hours, whereas a resume position halfway through a film does.
 */
export function formatContinueWatchingPosition(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(secs).padStart(2, '0')}`;
}
