/**
 * Phase 6 slice 6 — the watch-to-review loop.
 *
 * The last item on the plan's Phase 6 line (`SEANIME_MIGRATION_PLAN.md` §9:
 * *"…preparation queues; subtitle and Anki health; watch-to-review loop. Deterministic
 * first, AI second."*). Everything it stands on already exists: mining writes a full cue
 * provenance record for every card it exports, and Anki's interval snapshot says how each
 * of those notes is actually doing. Nothing here is new machinery — it is the **return
 * path**, the half of the loop that had no surface.
 *
 * The loop it closes:
 *
 *   watch a line  →  mine it  →  review it in Anki  →  **come back to the line**
 *
 * That last arrow is the point. A card that keeps failing has a source: an exact file, an
 * exact track, an exact millisecond. `VideoCoreCueProvenance` has carried all of it since
 * `03d27a3`, and until now nothing read it back.
 *
 * ## Three honesty rules this module encodes
 *
 * 1. **An interval is not a due date, and this module never pretends otherwise.**
 *    `reviewForecast.ts` states the same rule for the same reason: interval *length*
 *    cannot become a due *date* without knowing when the card was last reviewed, which
 *    the snapshot does not record. So cards are described by maturity, never by
 *    "due today". Anki's own scheduler owns due-ness (`anki:dueForecast`), and its answer
 *    is collection-wide — it cannot be attributed to one title, so it is not used here.
 *
 * 2. **Absent from the snapshot is `untracked`, not `new`.** `IntervalSnapshot.sourceQueries`
 *    is the union of the *profiles'* sync queries, so a note that no profile query matches
 *    is never scanned at all. Folding those into "new" would report a confident zero-day
 *    interval for a card nobody looked at. It is a distinct arm with its own label.
 *
 * 3. **The join is by `noteId`, never by expression.** `createVideoCoreMiningDraft` sets
 *    `term` to the whole sentence, and the user may edit it before mining, so matching
 *    `IntervalEntry.expression` against the history's `term` would be a guess that fails
 *    silently on exactly the cards that matter. `noteId` is exact and both sides carry it.
 *
 * Pure: no I/O, no `localStorage`, no IPC. The caller supplies the already-loaded history
 * and snapshot, the same rule `seanimeStudyLibrary.ts` follows.
 */
import { levelForIntervalDays, type IntervalEntry, type IntervalSnapshot } from './anki';
import { studyLibraryPathKey } from './seanimeStudyLibrary';
import { videoCoreResumeKey } from './videoCoreStudy';
import type { VideoCoreMiningHistoryEntry } from './videoCoreMining';

/**
 * How a mined card is doing, deterministically, from what Anki actually reports.
 *
 * `leech` and `suspended` are Anki's own authoritative markers, not thresholds of ours.
 * The three maturity arms come from `levelForIntervalDays`, so this can never disagree
 * with the known/new rollup the rest of the app already uses.
 */
export type WatchLoopStage =
  /** Interval below the familiar threshold — mined, not yet retained. */
  | 'new'
  /** Between the familiar and known thresholds. */
  | 'learning'
  /** At or past the known threshold. */
  | 'known'
  /** Anki's own leech tag: this card keeps failing. The prime rewatch candidate. */
  | 'leech'
  /** Taken out of rotation. Deliberate, but still worth being able to return to. */
  | 'suspended'
  /** No interval record. Says nothing about the card — see rule 2 above. */
  | 'untracked';

/** The seed profile's thresholds (`levelForIntervalDays`'s documented defaults). */
export const WATCH_LOOP_DEFAULT_THRESHOLDS = { familiar: 1, known: 21 } as const;

/**
 * Seconds of run-up when replaying a cue.
 *
 * Seeking to the cue's exact `startMs` lands mid-syllable — the decoder settles a frame or
 * two late and the first mora is gone, which is the one part of the line a struggling card
 * usually needs. A short lead-in costs nothing and makes the replay usable. It is not
 * delay-aware: `subtitleDelay` is player state this pure module has no access to, and the
 * player applies it to the cue timeline anyway.
 */
export const WATCH_LOOP_REPLAY_LEAD_SEC = 1.2;

export interface WatchLoopCue {
  index: number;
  trackNumber: number;
  startMs: number;
  endMs: number;
}

export interface WatchLoopCard {
  /** The mining-history entry id. Stable across reloads, so it is a safe React key. */
  historyId: string;
  noteId: number;
  term: string;
  sentence: string;
  /**
   * Join key onto `SeanimeStudyLibraryEntry.pathKey`. Empty when the mine carried no local
   * file path (a stream, in practice) — such a card is still reportable but cannot be
   * replayed, and `canReplay` says so rather than rendering a button that does nothing.
   */
  pathKey: string;
  localFilePath: string;
  /** Never translated: a media title is study content, per `CLAUDE.md`'s i18n scope rule. */
  title: string;
  episodeNumber?: number;
  cue: WatchLoopCue;
  minedAt: number;
  stage: WatchLoopStage;
  /** Present only when an interval record exists. Absent is `untracked`, not zero. */
  ivlDays?: number;
  /** True when this card can be taken back to its exact moment in a real file. */
  canReplay: boolean;
}

/**
 * Where to seek to replay a card's line, in seconds.
 *
 * Exported rather than inlined so the surface and its tests agree on one definition, and
 * so the lead-in has a single place to change.
 */
export function watchLoopReplaySec(cue: Pick<WatchLoopCue, 'startMs'>): number {
  return Math.max(0, cue.startMs / 1000 - WATCH_LOOP_REPLAY_LEAD_SEC);
}

/**
 * Resolves one interval record onto a stage.
 *
 * Order matters and is deliberate. `suspended` outranks `leech` because a suspended leech
 * is a card the user has already acted on — reporting it as an active leech would ask them
 * to fix something they have already decided about. Both outrank maturity, because a
 * 40-day interval on a leech is not evidence the card works.
 */
export function watchLoopStage(
  entry: IntervalEntry | undefined,
  thresholds: { familiar: number; known: number } = WATCH_LOOP_DEFAULT_THRESHOLDS,
): WatchLoopStage {
  if (!entry) return 'untracked';
  if (entry.suspended === true) return 'suspended';
  if (entry.leech === true) return 'leech';
  const level = levelForIntervalDays(entry.ivlDays, thresholds);
  return level >= 3 ? 'known' : level >= 2 ? 'learning' : 'new';
}

/** Indexes an interval snapshot by note id — the only exact key both sides carry. */
export function watchLoopIntervalIndex(
  snapshot: IntervalSnapshot | null | undefined,
): Map<number, IntervalEntry> {
  const index = new Map<number, IntervalEntry>();
  for (const entry of snapshot?.entries ?? []) {
    if (!Number.isFinite(entry.noteId) || entry.noteId <= 0) continue;
    // First wins: `mergeIntervalEntries` has already folded siblings, and a later
    // duplicate note id would be a snapshot defect rather than new information.
    if (!index.has(entry.noteId)) index.set(entry.noteId, entry);
  }
  return index;
}

function cardTitle(entry: VideoCoreMiningHistoryEntry): string {
  const source = entry.provenance.source;
  const fromMedia = source.mediaTitle?.trim();
  if (fromMedia) return fromMedia;
  const fromEpisode = source.episodeTitle?.trim();
  if (fromEpisode) return fromEpisode;
  const path = source.localFilePath?.trim() ?? source.streamPath?.trim() ?? '';
  return path.split(/[\\/]/).pop() || path;
}

/**
 * Projects mining history onto review state.
 *
 * Only `exported` history survives. `undone` was deliberately removed from the collection,
 * `failed` never reached it, and `duplicate` means the note already existed and this mine
 * created nothing — it carries no `noteId`, so it cannot be tracked and must not be counted
 * as a card this session produced. `seanimeWatchLoopSummary` reports the duplicate count
 * separately so the number is visible rather than silently discarded.
 *
 * Newest first: the return path is about what you have been watching lately.
 */
export function seanimeWatchLoopCards(
  history: readonly VideoCoreMiningHistoryEntry[],
  snapshot: IntervalSnapshot | null | undefined,
  thresholds: { familiar: number; known: number } = WATCH_LOOP_DEFAULT_THRESHOLDS,
): WatchLoopCard[] {
  const intervals = watchLoopIntervalIndex(snapshot);
  const cards: WatchLoopCard[] = [];
  const seenNotes = new Set<number>();

  for (const entry of history) {
    if (entry.status !== 'exported') continue;
    const noteId = entry.noteId;
    if (typeof noteId !== 'number' || !Number.isFinite(noteId) || noteId <= 0) continue;
    // One card per note. Re-mining the same note appends a second history row, and two
    // rows for one Anki card would double every count on this surface.
    if (seenNotes.has(noteId)) continue;
    seenNotes.add(noteId);

    const localFilePath = entry.provenance.source.localFilePath?.trim() ?? '';
    const pathKey = studyLibraryPathKey(localFilePath);
    const interval = intervals.get(noteId);
    cards.push({
      historyId: entry.id,
      noteId,
      term: entry.term,
      sentence: entry.sentence,
      pathKey,
      localFilePath,
      title: cardTitle(entry),
      ...(entry.provenance.source.episodeNumber != null
        ? { episodeNumber: entry.provenance.source.episodeNumber }
        : {}),
      cue: {
        index: entry.provenance.cue.index,
        trackNumber: entry.provenance.cue.trackNumber,
        startMs: entry.provenance.cue.startMs,
        endMs: entry.provenance.cue.endMs,
      },
      minedAt: entry.createdAt,
      stage: watchLoopStage(interval, thresholds),
      ...(interval ? { ivlDays: interval.ivlDays } : {}),
      canReplay: Boolean(pathKey),
    });
  }

  return cards.sort((a, b) => b.minedAt - a.minedAt);
}

/**
 * The cards worth going back to the video for, most useful first.
 *
 * Restricted to Anki's two authoritative problem markers. A `new` card is *backlog* —
 * you have not studied it yet — and rewatching its line does not address that, so
 * padding this list with new cards would bury the two states a rewatch genuinely helps.
 * `leech` ranks above `suspended` because it is live: Anki is still scheduling it and
 * still watching you fail it, whereas a suspended card is already out of rotation.
 * Ties keep newest-mined first, inherited from `seanimeWatchLoopCards`.
 */
const ATTENTION_ORDER: Partial<Record<WatchLoopStage, number>> = {
  leech: 0,
  suspended: 1,
};

export function seanimeWatchLoopAttention(
  cards: readonly WatchLoopCard[],
): WatchLoopCard[] {
  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => ATTENTION_ORDER[card.stage] != null)
    .sort((a, b) => {
      const byStage = (ATTENTION_ORDER[a.card.stage] ?? 9) - (ATTENTION_ORDER[b.card.stage] ?? 9);
      return byStage !== 0 ? byStage : a.index - b.index;
    })
    .map(({ card }) => card);
}

export interface WatchLoopSummary {
  /** Live exported cards — the denominator for everything else here. */
  cards: number;
  new: number;
  learning: number;
  known: number;
  leech: number;
  suspended: number;
  untracked: number;
  /** `leech + suspended` — the size of the attention list. */
  attention: number;
  /**
   * Mines refused because Anki already had the note. Reported rather than dropped: a
   * session that mined thirty lines and exported four is not a quiet session.
   */
  duplicates: number;
  /** Cards whose note the user has since removed through the panel's Undo. */
  undone: number;
  /** Epoch ms of the newest live card, or 0 when there are none. */
  lastMinedAt: number;
}

export function seanimeWatchLoopSummary(
  cards: readonly WatchLoopCard[],
  history: readonly VideoCoreMiningHistoryEntry[] = [],
): WatchLoopSummary {
  const summary: WatchLoopSummary = {
    cards: cards.length,
    new: 0,
    learning: 0,
    known: 0,
    leech: 0,
    suspended: 0,
    untracked: 0,
    attention: 0,
    duplicates: 0,
    undone: 0,
    lastMinedAt: 0,
  };
  for (const card of cards) {
    summary[card.stage] += 1;
    if (card.minedAt > summary.lastMinedAt) summary.lastMinedAt = card.minedAt;
  }
  summary.attention = summary.leech + summary.suspended;
  for (const entry of history) {
    if (entry.status === 'duplicate') summary.duplicates += 1;
    else if (entry.status === 'undone') summary.undone += 1;
  }
  return summary;
}

/**
 * Per-library-entry rollup, keyed by the same `pathKey` the Phase 6 join produces.
 *
 * This is what lets a *preparation* row also say what watching it already produced, so
 * the two halves of Phase 6 are one surface rather than two lists of the same files.
 * Cards with no path key are excluded — they have nothing to attach to.
 */
export interface WatchLoopEntryRollup {
  cards: number;
  attention: number;
  known: number;
  lastMinedAt: number;
}

export function seanimeWatchLoopByEntry(
  cards: readonly WatchLoopCard[],
): Map<string, WatchLoopEntryRollup> {
  const byEntry = new Map<string, WatchLoopEntryRollup>();
  for (const card of cards) {
    if (!card.pathKey) continue;
    const rollup = byEntry.get(card.pathKey)
      ?? { cards: 0, attention: 0, known: 0, lastMinedAt: 0 };
    rollup.cards += 1;
    if (ATTENTION_ORDER[card.stage] != null) rollup.attention += 1;
    if (card.stage === 'known') rollup.known += 1;
    if (card.minedAt > rollup.lastMinedAt) rollup.lastMinedAt = card.minedAt;
    byEntry.set(card.pathKey, rollup);
  }
  return byEntry;
}

/**
 * Cross-session identity for a playback source, for "have I ever mined this line?".
 *
 * Reuses `videoCoreResumeKey` so this cannot drift from the resume store's notion of "the
 * same thing" — but **refuses its `playback:` fallback**, and that refusal is the whole
 * point. A `playbackId` is a directstream id minted fresh on every open, so it can never
 * establish that a cue was mined in an *earlier* session. Accepting it would make the
 * lookup appear to work (it matches fine within one session, which is exactly when you
 * least need it) and silently answer "never mined" after every restart.
 *
 * Returns `''` when no durable identity exists, which callers treat as "cannot say".
 */
export function watchLoopSourceKey(
  source: {
    localFilePath?: string;
    streamPath?: string;
    playbackId?: string;
    mediaId?: number;
    episodeNumber?: number;
  } | null | undefined,
): string {
  if (!source) return '';
  const key = videoCoreResumeKey(source);
  return key.startsWith('playback:') ? '' : key;
}

export interface WatchLoopCueIdentity {
  trackNumber: number;
  index: number;
  startMs: number;
}

/**
 * The already-mined marker the player never had.
 *
 * The G-PLAY run hit Anki's "Duplicate warning" by re-mining a line, which is a bad way to
 * find out: the work of framing, capturing a screenshot and clipping audio is already done
 * by then. The mining history has carried everything needed to say so up front since
 * `03d27a3` — this reads it back at the point of use.
 *
 * `exported` and `duplicate` both count as "you already have this card": a duplicate means
 * Anki refused precisely because the note exists. `undone` and `failed` do **not** — the
 * note was removed or never landed, so the line is genuinely minable again and warning
 * about it would be wrong in the direction that costs the user a card.
 *
 * Cue identity is track + index + `startMs` together. Index alone is not enough: selecting
 * a track mid-playback restarts the stream and re-indexes from the current position (a real
 * finding from the same run), so an index can point at different lines across two sessions.
 * `startMs` comes from the demuxer and is stable.
 */
export function findMinedCueEntry(
  history: readonly VideoCoreMiningHistoryEntry[],
  source: Parameters<typeof watchLoopSourceKey>[0],
  cue: WatchLoopCueIdentity | null | undefined,
): VideoCoreMiningHistoryEntry | undefined {
  const key = watchLoopSourceKey(source);
  if (!key || !cue) return undefined;
  // Newest first, so a re-mine after an undo reports the current state and not the
  // superseded one.
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (!entry) continue;
    // `queued` and `local` are cards too: saved in the app, Anki half pending or not set up.
    if (entry.status === 'failed' || entry.status === 'undone') continue;
    const { cue: minedCue, source: minedSource } = entry.provenance;
    if (
      minedCue.trackNumber === cue.trackNumber
      && minedCue.index === cue.index
      && minedCue.startMs === cue.startMs
      && watchLoopSourceKey(minedSource) === key
    ) return entry;
  }
  return undefined;
}

/** `123456` → `2:03.456`, the form the mining panel already prints cue positions in. */
export function formatWatchLoopTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
