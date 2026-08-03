/**
 * Phase 6 slice 1 — Study Mode over the unified library.
 *
 * The phase's goal (`SEANIME_MIGRATION_PLAN.md` §9) is readiness and difficulty filters
 * across the *Seanime* library, deterministic first. Study OS already has the whole
 * deterministic readiness engine (`mediaStudyOrchestrator.ts`,
 * `studyEpisodeReadiness.ts`) and it is keyed on Study OS `MediaItem.id`. So the first
 * slice is not a new engine — it is the **join**, plus a projection that reuses the
 * existing readiness states verbatim.
 *
 * ## Why the join is by path, and only in one direction
 *
 * The risk register calls out "two identity systems drift" with the mitigation
 * "external-id columns only, one direction". Both libraries independently record an
 * absolute filesystem path for the same file — Seanime's `Anime_LocalFile.path`
 * (`vendor/seanime/generated/types.ts:1710`) and Study OS's `MediaItem.path`
 * ("Absolute source path on disk", `types.ts:112`) — so the path is the only shared fact
 * that neither side had to be taught. Nothing here writes an id back into either store:
 * this module is a pure projection, and a wrong guess costs a missing row rather than a
 * corrupted library.
 *
 * Paths are compared through `studyLibraryPathKey`, not raw. The one real Seanime path on
 * record (`proof/gplay-20260728/`) is native Windows
 * (`C:\Users\...\cue-library\Sousou no Frieren - 01.mkv`), which is the same form Study OS
 * stores — but that is a single sample from a fixture library, and the sidecar is a Go
 * process that has no obligation to keep emitting it. The key therefore normalises
 * separators, case and a trailing separator rather than trusting one observation. It does
 * **not** resolve relative paths or follow links: an absolute path is what both contracts
 * promise, and inventing a resolution step here would put filesystem access into a pure
 * module.
 *
 * ## What "readiness" means here
 *
 * Exactly what it already means elsewhere in the app — `StudyEpisodeReadinessState`, with
 * one added arm for the case only the unified library can produce:
 *
 *   - `unlinked` — the Seanime library has this file but Study OS has never imported it,
 *     so no readiness can exist yet. This is the actionable state Phase 6 exists to
 *     surface, and it is deliberately distinct from `unanalyzed` (imported, not analysed)
 *     and from `missing-subtitles` (imported and analysed, but no Japanese track).
 *
 * Nothing in this module reads subtitle bytes, opens a file, or calls the sidecar. It is
 * a projection over state that is already persisted, which is the same rule
 * `studyEpisodeReadinessRail` follows.
 */
import {
  selectJapaneseStudySubtitle,
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
} from './mediaStudyOrchestrator';
import { resolveProfileMatch, type ProfileRule } from './profileRules';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { SubtitleRecord } from './subtitleRecord';
import type { MediaItem } from './types';

/**
 * Re-exported so consumers depend on *this* module for the whole Phase 6 contract.
 *
 * `mediaStudyOrchestrator.ts` and `studyEpisodeReadiness.ts` are currently **untracked**
 * and owned by another track, and `docs/migration/NEXT_SESSION.md` forbids the migration
 * line from importing that track's in-flight contracts. Reusing its readiness engine is
 * nevertheless what the plan asks for (Phase 6 explicitly builds *over* Study Mode), so
 * the dependency is real — it is confined to this one module on purpose, so that if those
 * files churn, exactly one import block breaks instead of every consumer.
 */
export type { StudyOrchestratorDocument, StudyReadinessSnapshot } from './mediaStudyOrchestrator';
export type { StudyReadinessFingerprints } from './studyEpisodeReadiness';

/**
 * The subset of `Anime_LocalFile` this projection needs.
 *
 * Declared structurally rather than importing the generated Seanime type: `src/shared`
 * must stay buildable without the vendor tree (the architecture audit and the four build
 * configs all treat `vendor/` as the media workspace's concern), and this keeps the
 * dependency pointing one way. `src/main/seanime` adapts the real type onto this.
 */
export interface SeanimeLibraryFile {
  /** `Anime_LocalFile.path` — absolute, as the sidecar reports it. */
  path: string;
  /** `Anime_LocalFile.mediaId` — the AniList id the sidecar matched this file to. */
  mediaId: number;
  /** `Anime_LocalFile.metadata.episode`. Absent for an unmatched or non-episodic file. */
  episode?: number;
  /** Display title from the collection entry, when the file belongs to a matched entry. */
  title?: string;
}

export type SeanimeStudyReadinessState =
  /** In both libraries, analysed, and every cache-invalidation signal still matches. */
  | 'ready'
  /** In both libraries and analysed, but a fingerprint moved — re-analysis is cheap. */
  | 'stale'
  /** In both libraries with a Japanese subtitle attached, but never analysed. */
  | 'unanalyzed'
  /** In both libraries but no Japanese subtitle is attached, so analysis cannot start. */
  | 'missing-subtitles'
  /** Only in the Seanime library. Study OS has never imported it. */
  | 'unlinked';

export interface SeanimeStudyLibraryEntry {
  /** Normalised join key. Stable for a given path across both libraries. */
  pathKey: string;
  path: string;
  title: string;
  seanimeMediaId: number;
  episode?: number;
  state: SeanimeStudyReadinessState;
  /** Present only when the file is in both libraries. */
  studyMediaId?: string;
  subtitleRecordId?: string;
  readiness?: StudyReadinessSnapshot;
}

/**
 * Normalises an absolute path into a comparison key.
 *
 * Case-folded and separator-agnostic because this app is Windows-only (`win32` in every
 * build config) and the two producers are a Node main process and a Go server. Returns
 * `''` for anything that is not a usable path, which callers treat as unjoinable rather
 * than as a match — an empty key must never collide with another empty key, so
 * `joinSeanimeStudyLibrary` skips them explicitly.
 */
export function studyLibraryPathKey(path: string | undefined | null): string {
  if (typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/[\\/]+/g, '/')
    // A trailing separator is meaningless for a file and would split one file into two keys.
    .replace(/\/+$/, '')
    .toLocaleLowerCase();
}

/** Indexes Study OS media by join key. Later duplicates lose, so the index is stable. */
export function studyLibraryPathIndex(
  items: readonly MediaItem[],
): Map<string, MediaItem> {
  const index = new Map<string, MediaItem>();
  for (const item of items) {
    const key = studyLibraryPathKey(item.path);
    if (!key || index.has(key)) continue;
    index.set(key, item);
  }
  return index;
}

function readinessFor(
  document: StudyOrchestratorDocument,
  mediaId: string,
): StudyReadinessSnapshot | undefined {
  let newest: StudyReadinessSnapshot | undefined;
  for (const snapshot of Object.values(document.readiness)) {
    if (snapshot.mediaId !== mediaId) continue;
    if (!newest || snapshot.generatedAt > newest.generatedAt) newest = snapshot;
  }
  return newest;
}

/**
 * True when every cheap cache-invalidation signal still matches, which is the exact
 * condition `studyEpisodeReadinessRail` uses before it is willing to show a score.
 * Anything less is `stale` — never silently presented as current.
 */
function readinessIsCurrent(
  snapshot: StudyReadinessSnapshot,
  subtitle: SubtitleRecord | undefined,
  fingerprints: StudyReadinessFingerprints,
): boolean {
  return snapshot.analyzerVersion === STUDY_ANALYZER_VERSION
    && snapshot.subtitleReady
    && snapshot.knowledgeFingerprint === fingerprints.knowledgeFingerprint
    && snapshot.levelListsFingerprint === fingerprints.levelListsFingerprint
    // Optional on the snapshot: an older record predates frequency fingerprinting, and
    // treating "absent" as a match would show a score built from different lists.
    && snapshot.frequencyListsFingerprint === fingerprints.frequencyListsFingerprint
    && Boolean(subtitle)
    && snapshot.subtitleRecordId === subtitle?.id;
}

function entryTitle(file: SeanimeLibraryFile, item: MediaItem | undefined): string {
  const fromSeanime = file.title?.trim();
  if (fromSeanime) return fromSeanime;
  const fromStudyOs = item?.title?.trim();
  if (fromStudyOs) return fromStudyOs;
  // Last resort, and deliberately not translated: a file name is study content.
  return file.path.split(/[\\/]/).pop() ?? file.path;
}

/**
 * Projects the Seanime library onto Study OS readiness. Deterministic and side-effect
 * free: same inputs, same output, no I/O.
 *
 * Ordering is the caller's `files` order, so a UI can present the sidecar's own grouping
 * without this module imposing one. Files with an unusable path are dropped rather than
 * emitted with an empty key, which would make every such file look like the same entry.
 */
export function joinSeanimeStudyLibrary(
  files: readonly SeanimeLibraryFile[],
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): SeanimeStudyLibraryEntry[] {
  const index = studyLibraryPathIndex(items);
  const seen = new Set<string>();
  const entries: SeanimeStudyLibraryEntry[] = [];

  for (const file of files) {
    const pathKey = studyLibraryPathKey(file.path);
    if (!pathKey || seen.has(pathKey)) continue;
    seen.add(pathKey);

    const item = index.get(pathKey);
    const base = {
      pathKey,
      path: file.path,
      title: entryTitle(file, item),
      seanimeMediaId: file.mediaId,
      ...(Number.isFinite(file.episode) ? { episode: file.episode } : {}),
    };

    if (!item) {
      entries.push({ ...base, state: 'unlinked' });
      continue;
    }

    const subtitle = selectJapaneseStudySubtitle(item.subtitles);
    if (!subtitle) {
      entries.push({ ...base, state: 'missing-subtitles', studyMediaId: item.id });
      continue;
    }

    const snapshot = readinessFor(document, item.id);
    if (!snapshot) {
      entries.push({
        ...base,
        state: 'unanalyzed',
        studyMediaId: item.id,
        subtitleRecordId: subtitle.id,
      });
      continue;
    }

    entries.push({
      ...base,
      state: readinessIsCurrent(snapshot, subtitle, fingerprints) ? 'ready' : 'stale',
      studyMediaId: item.id,
      subtitleRecordId: subtitle.id,
      readiness: snapshot,
    });
  }

  return entries;
}

export interface SeanimeStudyLibraryHealth {
  total: number;
  ready: number;
  stale: number;
  unanalyzed: number;
  missingSubtitles: number;
  unlinked: number;
}

/**
 * The "subtitle and Anki health" summary Phase 6 asks for, over whatever set the caller
 * has already filtered. Counting here rather than in a component keeps the numbers
 * testable and keeps a filtered view from quietly reporting library-wide totals.
 */
export function seanimeStudyLibraryHealth(
  entries: readonly SeanimeStudyLibraryEntry[],
): SeanimeStudyLibraryHealth {
  const health: SeanimeStudyLibraryHealth = {
    total: entries.length,
    ready: 0,
    stale: 0,
    unanalyzed: 0,
    missingSubtitles: 0,
    unlinked: 0,
  };
  for (const entry of entries) {
    switch (entry.state) {
      case 'ready': health.ready += 1; break;
      case 'stale': health.stale += 1; break;
      case 'unanalyzed': health.unanalyzed += 1; break;
      case 'missing-subtitles': health.missingSubtitles += 1; break;
      case 'unlinked': health.unlinked += 1; break;
    }
  }
  return health;
}

/**
 * The preparation queue: what to act on next, and nothing that needs no action.
 *
 * Order is by how little work each state needs, so the cheapest wins come first —
 * `unanalyzed` (a subtitle is already attached; just analyse it), then
 * `stale` (analysed once, a fingerprint moved), then `missing-subtitles` (needs a
 * subtitle first), then `unlinked` (needs importing into Study OS at all).
 * `ready` entries are excluded: a queue that lists finished work is not a queue.
 * Ties keep the caller's incoming order, so the result is stable.
 */
const QUEUE_ORDER: Record<SeanimeStudyReadinessState, number> = {
  unanalyzed: 0,
  stale: 1,
  'missing-subtitles': 2,
  unlinked: 3,
  ready: 4,
};

export function seanimeStudyPreparationQueue(
  entries: readonly SeanimeStudyLibraryEntry[],
): SeanimeStudyLibraryEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.state !== 'ready')
    .sort((a, b) => {
      const byState = QUEUE_ORDER[a.entry.state] - QUEUE_ORDER[b.entry.state];
      return byState !== 0 ? byState : a.index - b.index;
    })
    .map(({ entry }) => entry);
}

/**
 * Difficulty filtering — the second half of Phase 6's "readiness and difficulty filters".
 *
 * Difficulty is not re-derived here. It is read off the readiness snapshot the existing
 * engine already produced (`contentLevel`, `knownCoverage`, `category`), so a filtered view
 * can never disagree with the score shown next to it.
 *
 * The load-bearing rule is what happens to an entry with **no** snapshot. On the user's real
 * library that is 30 of 30 entries, so getting it wrong would empty the surface. An entry
 * whose difficulty is *unknown* is *not* evidence that it fails the filter — so a difficulty
 * constraint only ever removes entries whose snapshot says so. Anything unscored is kept and
 * flagged by `hasDifficulty`, letting a caller show it as "unknown" rather than silently
 * dropping it.
 */
export interface SeanimeStudyDifficultyFilter {
  /** Keep only these JLPT-ish content levels. Empty or absent means "any". */
  levels?: readonly string[];
  /** Keep only these readiness categories. Empty or absent means "any". */
  categories?: readonly string[];
  /** Inclusive lower bound on known-word coverage, 0–1. */
  minCoverage?: number;
  /** Inclusive upper bound on known-word coverage, 0–1. */
  maxCoverage?: number;
}

/** True when the entry carries a readiness snapshot any difficulty can be read from. */
export function hasDifficulty(entry: SeanimeStudyLibraryEntry): boolean {
  return entry.readiness != null;
}

export function matchesSeanimeStudyDifficulty(
  entry: SeanimeStudyLibraryEntry,
  filter: SeanimeStudyDifficultyFilter,
): boolean {
  const snapshot = entry.readiness;
  // Unknown difficulty is not a failed difficulty. See the note above.
  if (!snapshot) return true;

  if (filter.levels?.length) {
    const level = snapshot.contentLevel;
    if (!level || !filter.levels.includes(level)) return false;
  }
  if (filter.categories?.length && !filter.categories.includes(snapshot.category)) {
    return false;
  }
  const coverage = snapshot.knownCoverage;
  // A null coverage is again unknown, not out of range.
  if (typeof coverage === 'number') {
    if (typeof filter.minCoverage === 'number' && coverage < filter.minCoverage) return false;
    if (typeof filter.maxCoverage === 'number' && coverage > filter.maxCoverage) return false;
  }
  return true;
}

export function filterSeanimeStudyDifficulty(
  entries: readonly SeanimeStudyLibraryEntry[],
  filter: SeanimeStudyDifficultyFilter,
): SeanimeStudyLibraryEntry[] {
  return entries.filter((entry) => matchesSeanimeStudyDifficulty(entry, filter));
}

/**
 * The distinct content levels present, in the order first seen, for building a filter
 * control that offers only what the library actually contains rather than a fixed N5–N1
 * list the user's library may not cover.
 */
export function seanimeStudyDifficultyLevels(
  entries: readonly SeanimeStudyLibraryEntry[],
): string[] {
  const levels: string[] = [];
  for (const entry of entries) {
    const level = entry.readiness?.contentLevel;
    if (level && !levels.includes(level)) levels.push(level);
  }
  return levels;
}

/**
 * Anki health — the other half of Phase 6's "subtitle and Anki health".
 *
 * Defined by the user as *"everything works as the user intended"*, which for this surface
 * operationalises to one question with a deterministic answer: **would mining from this
 * library actually land a card right now?** Not "is a deck configured somewhere" — whether
 * the pipeline is live end to end.
 *
 * Three things have to hold, and each failure is reported separately because each has a
 * different fix:
 *
 *   1. Anki is reachable (`AnkiStatus.connected`). If not, the reason is carried through.
 *   2. The collection has at least one deck to mine into.
 *   3. A profile resolves for a subtitle-sourced card — which is exactly the route
 *      `videoCoreMining.ts` uses (`source: 'subtitle'`). A matched *rule* owns the deck and
 *      silently overrides a per-panel choice, so which rule matched is surfaced rather than
 *      swallowed. That was a real finding from the G-PLAY run.
 *
 * Pure: takes the already-fetched status and rules, performs no I/O. Deliberately
 * **library-level, not per-entry** — every file in this library mines through the same
 * subtitle route, so a per-row copy of the same verdict would be noise, not information.
 */
export interface SeanimeStudyAnkiInputs {
  connected: boolean;
  decks: readonly string[];
  error?: string;
  rules?: readonly ProfileRule[];
  /** The profile used when no rule matches. */
  defaultProfileId: string;
}

export type SeanimeStudyAnkiProblem =
  | 'disconnected'
  | 'no-decks'
  | 'no-profile';

export interface SeanimeStudyAnkiHealth {
  /** True only when a card mined from this library would actually be created. */
  ok: boolean;
  problem?: SeanimeStudyAnkiProblem;
  /** Present when `problem` is `disconnected` and Anki gave a reason. */
  reason?: string;
  deckCount: number;
  /** The profile a subtitle-sourced card routes to, when one resolves. */
  profileId?: string;
  /** Set when a mining rule — not the default — owns that routing. */
  matchedRuleLabel?: string;
}

export function seanimeStudyAnkiHealth(
  inputs: SeanimeStudyAnkiInputs,
): SeanimeStudyAnkiHealth {
  const deckCount = inputs.decks.length;

  if (!inputs.connected) {
    return {
      ok: false,
      problem: 'disconnected',
      deckCount,
      ...(inputs.error ? { reason: inputs.error } : {}),
    };
  }
  if (deckCount === 0) {
    return { ok: false, problem: 'no-decks', deckCount };
  }

  const resolved = resolveProfileMatch(
    inputs.rules ? [...inputs.rules] : [],
    // The exact route videoCoreMining.ts builds for a mined cue.
    { source: 'subtitle', cardKind: 'sentence', language: 'ja' },
    inputs.defaultProfileId,
  );
  if (!resolved.profileId.trim()) {
    return { ok: false, problem: 'no-profile', deckCount };
  }

  return {
    ok: true,
    deckCount,
    profileId: resolved.profileId,
    ...(resolved.matchedRule ? { matchedRuleLabel: resolved.matchedRule.label } : {}),
  };
}
