import type { MineNoteRequest, MineNoteResult } from './anki';
import type { VideoCoreStudyCue } from './videoCoreStudy';
import type { StudyLang } from './studyLang';

export const VIDEO_CORE_MINING_HISTORY_KEY = 'jp-video-core-mining-history-v1';
/**
 * Every mine is recorded now (queued and local ones too), so the log fills faster than
 * when only immediate Anki answers were kept; 500 is a few weeks of heavy mining.
 */
export const VIDEO_CORE_MINING_HISTORY_LIMIT = 500;
/** Dispatched on `window` after any writer changes the mining history. */
export const VIDEO_CORE_MINING_HISTORY_EVENT = 'video-core-mining-history-changed';

export type VideoCoreMiningCardKind = 'word' | 'sentence';
/**
 * `queued`: saved in the app, the Anki note waits for Anki to come back.
 * `local`: saved in the app only (no Anki set up here).
 */
export type VideoCoreMiningHistoryStatus =
  | 'exported'
  | 'duplicate'
  | 'failed'
  | 'undone'
  | 'queued'
  | 'local';

const HISTORY_STATUSES: readonly VideoCoreMiningHistoryStatus[] = [
  'exported', 'duplicate', 'failed', 'undone', 'queued', 'local',
];

/** Statuses that mean "this line is a card you have" (the mined marker). */
export function isMinedHistoryStatus(status: VideoCoreMiningHistoryStatus): boolean {
  return status !== 'failed' && status !== 'undone';
}

/**
 * One mine request from the player: the shortcut, a Mine button, or the popup's Mine.
 * `seq` strictly increases per request so the same line mined twice is two requests.
 */
export interface VideoCoreMineRequest {
  seq: number;
  /**
   * Unique per request (`media/mineRequestGuard.ts`): a panel that remounts with the same
   * request must not mine it again. Absent on older callers.
   */
  id?: string;
  /** Line to mine; absent = the panel's current `cue`. */
  cue?: VideoCoreStudyCue;
  /** Stripped display text for `cue`. */
  text?: string;
  /** User-chosen word; absent = the first unknown content word (i+1). */
  target?: { surface: string; reading?: string; meaning?: string };
}

/** A cue's identity for the mined-line markers: its rounded start and end. */
export function minedCueKey(cue: { startMs: number; endMs: number }): string {
  return `${Math.round(cue.startMs)}:${Math.round(cue.endMs)}`;
}

export interface VideoCoreMiningSource {
  playbackId: string;
  playbackType: string;
  streamType: string;
  streamPath?: string;
  localFilePath?: string;
  mediaId?: number;
  mediaTitle?: string;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface VideoCoreMiningAsset {
  filename: string;
  mimeType: string;
  bytes: number;
}

export interface VideoCoreCueProvenance {
  schemaVersion: 1;
  cue: {
    index: number;
    trackNumber: number;
    rawText: string;
    text: string;
    startMs: number;
    endMs: number;
  };
  source: VideoCoreMiningSource;
  assets: {
    screenshot?: VideoCoreMiningAsset;
    audio?: VideoCoreMiningAsset;
    clip?: VideoCoreMiningAsset;
  };
  capturedAt: number;
}

export interface VideoCoreMiningDraft {
  cardKind: VideoCoreMiningCardKind;
  term: string;
  /**
   * The target word as it appears in `sentence` (食べた for the term 食べる), for the
   * cloze split. Absent means the term itself.
   */
  surface?: string;
  reading: string;
  meaning: string;
  translation: string;
  sentence: string;
  deckName: string;
  screenshotBase64?: string;
  screenshot?: VideoCoreMiningAsset;
  audioBase64?: string;
  audio?: VideoCoreMiningAsset;
  /** The scene the sentence was said in, for the {clip} variable. */
  clipBase64?: string;
  clip?: VideoCoreMiningAsset;
  /**
   * The language of the line (the study track's language). Optional only for
   * drafts kept from before it existed; those were Japanese.
   */
  language?: StudyLang;
  provenance: VideoCoreCueProvenance;
}

export interface VideoCoreMiningHistoryEntry {
  id: string;
  createdAt: number;
  status: VideoCoreMiningHistoryStatus;
  noteId?: number;
  /** Actual Anki media names returned by the mining gateway (after image renaming). */
  mediaFilenames?: string[];
  destination?: string;
  error?: string;
  term: string;
  sentence: string;
  provenance: VideoCoreCueProvenance;
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asset(value: unknown): VideoCoreMiningAsset | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Partial<VideoCoreMiningAsset>;
  const filename = text(raw.filename, 160);
  const mimeType = text(raw.mimeType, 80);
  const bytes = finite(raw.bytes);
  if (!filename || !mimeType || bytes == null || bytes < 0) return undefined;
  return { filename, mimeType, bytes: Math.round(bytes) };
}

function provenance(value: unknown): VideoCoreCueProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<VideoCoreCueProvenance>;
  const cue = raw.cue;
  const source = raw.source;
  if (!cue || !source) return null;
  const index = finite(cue.index);
  const trackNumber = finite(cue.trackNumber);
  const startMs = finite(cue.startMs);
  const endMs = finite(cue.endMs);
  const playbackId = text(source.playbackId, 240);
  if (
    index == null
    || trackNumber == null
    || startMs == null
    || endMs == null
    || !playbackId
  ) return null;
  return {
    schemaVersion: 1,
    cue: {
      index: Math.round(index),
      trackNumber: Math.round(trackNumber),
      rawText: text(cue.rawText, 4000),
      text: text(cue.text, 4000),
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(0, Math.round(endMs)),
    },
    source: {
      playbackId,
      playbackType: text(source.playbackType, 80),
      streamType: text(source.streamType, 80),
      ...(text(source.streamPath, 1200) ? { streamPath: text(source.streamPath, 1200) } : {}),
      ...(text(source.localFilePath, 1200)
        ? { localFilePath: text(source.localFilePath, 1200) }
        : {}),
      ...(finite(source.mediaId) != null ? { mediaId: finite(source.mediaId) } : {}),
      ...(text(source.mediaTitle, 500) ? { mediaTitle: text(source.mediaTitle, 500) } : {}),
      ...(finite(source.episodeNumber) != null
        ? { episodeNumber: finite(source.episodeNumber) }
        : {}),
      ...(text(source.episodeTitle, 500)
        ? { episodeTitle: text(source.episodeTitle, 500) }
        : {}),
    },
    assets: {
      ...(asset(raw.assets?.screenshot) ? { screenshot: asset(raw.assets?.screenshot) } : {}),
      ...(asset(raw.assets?.audio) ? { audio: asset(raw.assets?.audio) } : {}),
      ...(asset(raw.assets?.clip) ? { clip: asset(raw.assets?.clip) } : {}),
    },
    capturedAt: Math.max(0, Math.round(finite(raw.capturedAt) ?? Date.now())),
  };
}

/**
 * `translation` seeds the card's sentence-translation field, and is last in the parameter
 * list purely so the existing `capturedAt` callers keep working unchanged.
 *
 * It carries the second subtitle line — whatever language the study overlay is showing
 * underneath the Japanese — so that the line the user was reading along with is the one
 * that lands on the card, rather than the field starting empty and being retyped.
 */
export function createVideoCoreMiningDraft(
  cue: VideoCoreStudyCue,
  displayText: string,
  source: VideoCoreMiningSource,
  capturedAt = Date.now(),
  translation = '',
  language?: StudyLang,
): VideoCoreMiningDraft {
  const sentence = displayText.trim();
  const cueProvenance: VideoCoreCueProvenance = {
    schemaVersion: 1,
    cue: {
      index: cue.index,
      trackNumber: cue.trackNumber,
      rawText: cue.text,
      text: sentence,
      startMs: cue.startMs,
      endMs: cue.endMs,
    },
    source,
    assets: {},
    capturedAt,
  };
  return {
    cardKind: 'sentence',
    term: sentence,
    reading: '',
    meaning: '',
    translation: translation.trim(),
    sentence,
    deckName: '',
    ...(language ? { language } : {}),
    provenance: cueProvenance,
  };
}

export function withVideoCoreMiningAsset(
  draft: VideoCoreMiningDraft,
  kind: 'screenshot' | 'audio' | 'clip',
  input: { base64: string; asset: VideoCoreMiningAsset },
): VideoCoreMiningDraft {
  // Capture helpers return `{ base64, filename, mimeType, bytes }`. Structural
  // typing permits that richer object to be passed as `asset`, so never retain
  // the object by reference: doing so persisted the full binary payload inside
  // provenance/history as well as in the transient draft.
  const metadata: VideoCoreMiningAsset = {
    filename: input.asset.filename,
    mimeType: input.asset.mimeType,
    bytes: input.asset.bytes,
  };
  return {
    ...draft,
    [`${kind}Base64`]: input.base64,
    [kind]: metadata,
    provenance: {
      ...draft.provenance,
      assets: { ...draft.provenance.assets, [kind]: metadata },
    },
  };
}

export function buildVideoCoreMineRequest(draft: VideoCoreMiningDraft): MineNoteRequest {
  const cueTag = `cue-${draft.provenance.cue.trackNumber}-${draft.provenance.cue.index}`;
  const mediaTag = draft.provenance.source.mediaId != null
    ? `media-${draft.provenance.source.mediaId}`
    : 'media-local';
  return {
    route: {
      source: 'subtitle',
      cardKind: draft.cardKind,
      // The line's own language routes the note; a draft from before the field
      // existed was Japanese.
      language: draft.language ?? 'ja',
    },
    term: draft.term.trim(),
    ...(draft.reading.trim() ? { reading: draft.reading.trim() } : {}),
    ...(draft.meaning.trim() ? { meaning: draft.meaning.trim() } : {}),
    ...(draft.translation.trim() ? { translation: draft.translation.trim() } : {}),
    sentence: draft.sentence.trim(),
    surface: draft.surface?.trim() || draft.term.trim(),
    ...(draft.translation.trim()
      ? { sentenceTranslation: draft.translation.trim() }
      : {}),
    ...(draft.deckName.trim() ? { deckName: draft.deckName.trim() } : {}),
    ...(draft.screenshotBase64 && draft.screenshot
      ? {
          imageBase64: draft.screenshotBase64,
          imageFilename: draft.screenshot.filename,
        }
      : {}),
    ...(draft.clipBase64 && draft.clip
      ? {
          clipBase64: draft.clipBase64,
          clipFilename: draft.clip.filename,
        }
      : {}),
    ...(draft.audioBase64 && draft.audio
      ? {
          audioBase64: draft.audioBase64,
          audioFilename: draft.audio.filename,
        }
      : {}),
    extraTags: ['video-core', cueTag, mediaTag],
  };
}

export function createVideoCoreMiningHistoryEntry(
  draft: VideoCoreMiningDraft,
  result: MineNoteResult,
  now = Date.now(),
): VideoCoreMiningHistoryEntry {
  const historyProvenance = provenance(draft.provenance);
  if (!historyProvenance) {
    throw new Error('Cannot record mining history without valid cue provenance.');
  }
  const status: VideoCoreMiningHistoryStatus = result.ok
    ? 'exported'
    : result.error === 'duplicate'
      ? 'duplicate'
      : 'failed';
  return {
    id: `video-core-mine-${now.toString(36)}-${draft.provenance.cue.trackNumber}-${draft.provenance.cue.index}`,
    createdAt: now,
    status,
    ...(result.noteId ? { noteId: result.noteId } : {}),
    ...(result.mediaFilenames?.length ? { mediaFilenames: result.mediaFilenames.slice() } : {}),
    // Prefer the deck the note actually landed in; the profile label is a coarser
    // fallback and hides a rule-routed deck override.
    ...(result.deckName || result.profileName
      ? { destination: result.deckName ?? result.profileName }
      : {}),
    ...(result.error ? { error: result.error } : {}),
    term: draft.term.trim(),
    sentence: draft.sentence.trim(),
    provenance: historyProvenance,
  };
}

/** How `mineToStudy` settled the Anki half (renderer/studyMining.ts `MineAnkiOutcome`). */
export type VideoCoreMineOutcome = 'added' | 'duplicate' | 'queued' | 'failed' | 'local';

/**
 * A history entry for EVERY mine outcome, not only an immediate Anki answer: a card
 * queued for Anki or kept in the app is still a line you mined, and leaving it out
 * made the log (and the mined markers built on it) forget it.
 *
 * `added` without a fresh Anki result means the same card was mined before and reused;
 * it is recorded as `duplicate` (you already had it), like Anki's own refusal.
 */
export function createVideoCoreMiningOutcomeEntry(
  draft: VideoCoreMiningDraft,
  outcome: VideoCoreMineOutcome,
  result?: MineNoteResult,
  error?: string,
  now = Date.now(),
): VideoCoreMiningHistoryEntry {
  if (result && (outcome === 'added' || outcome === 'duplicate' || outcome === 'failed')) {
    const entry = createVideoCoreMiningHistoryEntry(draft, result, now);
    return error && !entry.error ? { ...entry, error } : entry;
  }
  const status: VideoCoreMiningHistoryStatus = outcome === 'added' || outcome === 'duplicate'
    ? 'duplicate'
    : outcome;
  const synthetic: MineNoteResult = { ok: false, ...(error ? { error } : {}) };
  return { ...createVideoCoreMiningHistoryEntry(draft, synthetic, now), status };
}

export function markVideoCoreMiningHistoryUndone(
  history: readonly VideoCoreMiningHistoryEntry[],
  noteId: number,
): VideoCoreMiningHistoryEntry[] {
  return history.map((entry) =>
    entry.noteId === noteId && entry.status === 'exported'
      ? { ...entry, status: 'undone' }
      : entry);
}

export function normalizeVideoCoreMiningHistory(value: unknown): VideoCoreMiningHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-VIDEO_CORE_MINING_HISTORY_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Partial<VideoCoreMiningHistoryEntry>;
    const normalizedProvenance = provenance(raw.provenance);
    const status = raw.status;
    const id = text(raw.id, 240);
    const createdAt = finite(raw.createdAt);
    const noteId = finite(raw.noteId);
    const term = text(raw.term, 500);
    if (
      !id
      || createdAt == null
      || !normalizedProvenance
      || !HISTORY_STATUSES.includes(status as VideoCoreMiningHistoryStatus)
    ) return [];
    return [{
      id,
      createdAt: Math.max(0, Math.round(createdAt)),
      status: status as VideoCoreMiningHistoryStatus,
      ...(noteId != null ? { noteId: Math.round(noteId) } : {}),
      ...(Array.isArray(raw.mediaFilenames)
        ? {
            mediaFilenames: [...new Set(
              raw.mediaFilenames.map((filename) => text(filename, 180)).filter(Boolean),
            )],
          }
        : {}),
      ...(text(raw.destination, 240) ? { destination: text(raw.destination, 240) } : {}),
      ...(text(raw.error, 1000) ? { error: text(raw.error, 1000) } : {}),
      term,
      sentence: text(raw.sentence, 4000),
      provenance: normalizedProvenance,
    }];
  });
}

export function appendVideoCoreMiningHistory(
  history: readonly VideoCoreMiningHistoryEntry[],
  entry: VideoCoreMiningHistoryEntry,
): VideoCoreMiningHistoryEntry[] {
  return [...history, entry].slice(-VIDEO_CORE_MINING_HISTORY_LIMIT);
}

/**
 * Fold a list held in memory together with the one currently in storage. Audit item 6.2.
 *
 * This log has two owners. `useMusicMining` appends with a fresh read every time, so it never
 * loses anything. `VideoCoreMiningPanel` is the opposite: it seeds `history` into React state
 * once at mount, never subscribes, and writes the **whole array** back on every change. So a
 * note mined from the music player while the video panel is open is erased by the panel's very
 * next append or undo — the panel writes the snapshot it took before that note existed.
 *
 * A log is the one shape where the merge is unambiguous: an entry is identified by `id`, both
 * owners only ever add, and an entry that exists on either side belongs in the result. `mine`
 * wins on conflict because the only in-place edit is `markVideoCoreMiningHistoryUndone`, which
 * is a deliberate user action taken against the copy the user is looking at.
 *
 * Ordering is by `createdAt` so a merged entry lands in real chronological position rather
 * than at whichever end it happened to be appended, and the cap is applied last — trimming
 * before the union would drop the oldest entries of one side while keeping the other's.
 */
export function mergeVideoCoreMiningHistory(
  mine: readonly VideoCoreMiningHistoryEntry[],
  live: readonly VideoCoreMiningHistoryEntry[],
): VideoCoreMiningHistoryEntry[] {
  const byId = new Map<string, VideoCoreMiningHistoryEntry>();
  for (const entry of live) byId.set(entry.id, entry);
  for (const entry of mine) byId.set(entry.id, entry);
  return [...byId.values()]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(-VIDEO_CORE_MINING_HISTORY_LIMIT);
}
