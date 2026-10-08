/**
 * Scene round-trip: every surface that points at a moment in a video opens the ADOPTED
 * player at that moment.
 *
 * Before this module the app had four answers to "take me back to that line": the Study
 * OS raised `os:open 'video'` and then, 80 ms later, an event only the retired player
 * listened for; the flashcard review opened the adopted player with a 0.3 s run-up; the
 * watch-to-review panel used 1.2 s; and the grammar library and the palette had no way
 * back at all. One module now owns the three facts every caller needs:
 *
 *   - **Which scene** a card or a mining-history entry points at (`cardScene`,
 *     `historyScene`), including the fallback for player-mined cards written before cards
 *     carried a `sourceRef`: the mining history still holds their cue.
 *   - **Where to seek** (`sceneStartSec`): a little before the line, so the first mora is
 *     not clipped, clamped at zero. The lead is the watch-loop's, so a replay from any
 *     surface lands on the same frame.
 *   - **Whether the open can be heard** (`openSceneAt`): `reachMediaWorkspace` first, so a
 *     pop-out or a disabled sidecar gets an honest, translated sentence instead of a
 *     dispatch nobody hears.
 *
 * Deliberately light: no grammar data, no orchestrator. The command palette imports this,
 * and the palette is mounted in every window including Blanc.
 */
import {
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningHistoryEntry,
} from '../shared/videoCoreMining';
import { WATCH_LOOP_REPLAY_LEAD_SEC } from '../shared/seanimeWatchLoop';
import { studyLibraryPathKey } from '../shared/seanimeStudyLibrary';
import type { DeckFlashcard } from './flashcardDeck';
import {
  openMediaWorkspace,
  reachMediaWorkspace,
  type MediaWorkspaceReach,
} from './mediaWorkspaceBridge';
import { t } from './i18n';

/** Seconds of run-up before a line. One value app-wide: see the module comment. */
export const SCENE_LEAD_IN_SEC = WATCH_LOOP_REPLAY_LEAD_SEC;

/** One moment in a local video that a surface can offer to replay. */
export interface SceneTarget {
  /** Stable identity: the file's path key plus the cue start, in tenths of a second. */
  key: string;
  localFilePath: string;
  /** Start of the line, in playback seconds. */
  cueStartSec: number;
  cueEndSec?: number;
  /** The line itself. Study content, never translated. */
  sentence: string;
  /** Show / episode title, else the file name. Study content, never translated. */
  title: string;
  /** When it was mined (ms since epoch); orders "recent" lists. */
  at: number;
  /** The deck card this scene came from, when it came from one. */
  cardId?: string;
}

/** Where the player should start for a line that begins at `cueStartSec`. */
export function sceneStartSec(cueStartSec: number): number {
  if (!Number.isFinite(cueStartSec)) return 0;
  return Math.max(0, cueStartSec - SCENE_LEAD_IN_SEC);
}

/**
 * A path the adopted player can open as a local file. A web page, a stream URL or a
 * `data:` URI is a card source, not a file, and offering "Play in video" for one would be
 * a button that opens nothing.
 */
export function isLocalMediaPath(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return false;
  if (/^(data|blob|about|javascript):/i.test(trimmed)) return false;
  return true;
}

/** `m:ss` (or `h:mm:ss`) for a playback second. Not translated: digits and colons. */
export function formatSceneTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
    : `${minutes}:${secs}`;
}

function fileTitle(path: string): string {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return name.replace(/\.[a-z0-9]{1,5}$/i, '') || name;
}

function sceneKey(path: string, cueStartSec: number): string {
  return `${studyLibraryPathKey(path)}@${Math.round(cueStartSec * 10)}`;
}

function lineKey(path: string, line: string): string {
  return `${studyLibraryPathKey(path)}\u0000${line.normalize('NFKC').replace(/\s+/g, '').trim()}`;
}

/** The video-core mining history. A corrupt or missing store is an empty one. */
export function readMiningHistory(): VideoCoreMiningHistoryEntry[] {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
}

/**
 * The scene a mining-history entry points at, or null for a stream (no file) or a mine
 * the user took back (`undone`). A failed Anki export still wrote the local card, so it
 * still counts as a line the user mined.
 */
export function historyScene(entry: VideoCoreMiningHistoryEntry): SceneTarget | null {
  if (entry.status === 'undone') return null;
  const path = entry.provenance.source.localFilePath;
  if (!isLocalMediaPath(path)) return null;
  const cueStartSec = entry.provenance.cue.startMs / 1000;
  const cueEndSec = entry.provenance.cue.endMs / 1000;
  const source = entry.provenance.source;
  const title = [source.mediaTitle, source.episodeNumber != null ? `#${source.episodeNumber}` : '']
    .filter(Boolean)
    .join(' ');
  return {
    key: sceneKey(path, cueStartSec),
    localFilePath: path,
    cueStartSec,
    ...(cueEndSec > cueStartSec ? { cueEndSec } : {}),
    sentence: entry.sentence || entry.provenance.cue.text || entry.term,
    title: title || fileTitle(path),
    at: entry.createdAt,
  };
}

/**
 * History entries by (file, line), newest last-wins. Built once per surface open, not
 * once per card: `cardScene` looks each card up in it.
 */
export type MiningHistoryIndex = ReadonlyMap<string, VideoCoreMiningHistoryEntry>;

export function indexMiningHistory(
  history: readonly VideoCoreMiningHistoryEntry[],
): MiningHistoryIndex {
  const index = new Map<string, VideoCoreMiningHistoryEntry>();
  for (const entry of history) {
    if (entry.status === 'undone') continue;
    const path = entry.provenance.source.localFilePath;
    if (!isLocalMediaPath(path)) continue;
    for (const line of [entry.sentence, entry.provenance.cue.text, entry.term]) {
      if (line?.trim()) index.set(lineKey(path, line), entry);
    }
  }
  return index;
}

type SceneCard = Pick<DeckFlashcard, 'id' | 'word' | 'sentence' | 'sourceUrl' | 'sourceRef' | 'bookTitle' | 'addedAt' | 'source'>;

/**
 * The scene a deck card points at, or null when it has no local video and cue time.
 *
 * Order of evidence:
 *   1. `sourceUrl` is a local file and `sourceRef.cueStartSec` is finite — player-mined
 *      cards (once the mining panel writes the ref) and sentence-deck cards.
 *   2. A player-mined card (`source: 'subtitle'`) from before cards carried a ref: the
 *      mining history wrote the cue for the same file and line, so it is looked up there.
 *
 * Study OS cards carry a library `mediaId` but no file path; `resolveCardScene` looks
 * those up in the media library on click, not here.
 */
export function cardScene(card: SceneCard, history?: MiningHistoryIndex): SceneTarget | null {
  const path = card.sourceUrl;
  if (!isLocalMediaPath(path)) return null;
  const ref = card.sourceRef;
  const title = card.bookTitle?.trim() || fileTitle(path);
  if (typeof ref?.cueStartSec === 'number' && Number.isFinite(ref.cueStartSec) && ref.cueStartSec >= 0) {
    const cueEndSec = ref.cueEndSec;
    return {
      key: sceneKey(path, ref.cueStartSec),
      localFilePath: path,
      cueStartSec: ref.cueStartSec,
      ...(typeof cueEndSec === 'number' && Number.isFinite(cueEndSec) && cueEndSec > ref.cueStartSec
        ? { cueEndSec }
        : {}),
      sentence: ref.sentence?.trim() || card.sentence?.trim() || card.word,
      title,
      at: card.addedAt,
      cardId: card.id,
    };
  }
  if (!history || card.source !== 'subtitle') return null;
  for (const line of [card.sentence, card.word]) {
    if (!line?.trim()) continue;
    const entry = history.get(lineKey(path, line));
    if (!entry) continue;
    const scene = historyScene(entry);
    if (!scene) continue;
    return { ...scene, title, at: card.addedAt, cardId: card.id };
  }
  return null;
}

/**
 * A Study OS card's library context: the media library id and the line's second. These
 * cards name no file (`source: 'media'`, `sourceRef.mediaId`), so the path is looked up
 * in the media library when the user asks — never per render.
 */
function libraryContextOf(card: SceneCard): { mediaId: string; cueStartSec: number } | null {
  const ref = card.sourceRef;
  if (card.source !== 'media' || !ref?.mediaId || ref.sourceKind === 'lookup-history') return null;
  if (typeof ref.cueStartSec !== 'number' || !Number.isFinite(ref.cueStartSec) || ref.cueStartSec < 0) {
    return null;
  }
  return { mediaId: ref.mediaId, cueStartSec: ref.cueStartSec };
}

/** Whether "Play in video" can be offered for this card without asking anything async. */
export function cardMayHaveScene(card: SceneCard, history?: MiningHistoryIndex): boolean {
  return cardScene(card, history) != null || libraryContextOf(card) != null;
}

/**
 * `cardScene`, plus the Study OS cards resolved through the media library. Null when the
 * card names nothing playable, or its library item is gone or has no local file.
 */
export async function resolveCardScene(
  card: SceneCard,
  history?: MiningHistoryIndex,
): Promise<SceneTarget | null> {
  const direct = cardScene(card, history);
  if (direct) return direct;
  const context = libraryContextOf(card);
  if (!context) return null;
  try {
    const items = await window.api.listMedia();
    const item = items.find((candidate) => candidate.id === context.mediaId);
    if (!item || !isLocalMediaPath(item.path)) return null;
    const cueEndSec = card.sourceRef?.cueEndSec;
    return {
      key: sceneKey(item.path, context.cueStartSec),
      localFilePath: item.path,
      cueStartSec: context.cueStartSec,
      ...(typeof cueEndSec === 'number' && Number.isFinite(cueEndSec) && cueEndSec > context.cueStartSec
        ? { cueEndSec }
        : {}),
      sentence: card.sourceRef?.sentence?.trim() || card.sentence?.trim() || card.word,
      title: item.title || fileTitle(item.path),
      at: card.addedAt,
      cardId: card.id,
    };
  } catch {
    return null;
  }
}

/**
 * Recently mined lines, newest first, one row per scene.
 *
 * The union of the deck and the mining history: a card can outlive its history entry
 * (the history keeps the last 100) and a history entry can outlive its card (deleted from
 * the deck, still in Anki). A scene in both is listed once, with the card's id kept so a
 * caller can still focus it.
 */
export function recentMinedScenes(
  cards: readonly SceneCard[],
  history: readonly VideoCoreMiningHistoryEntry[],
  limit = 40,
): SceneTarget[] {
  const index = indexMiningHistory(history);
  const byKey = new Map<string, SceneTarget>();
  const add = (scene: SceneTarget | null): void => {
    if (!scene) return;
    const existing = byKey.get(scene.key);
    if (!existing) {
      byKey.set(scene.key, scene);
      return;
    }
    byKey.set(scene.key, {
      ...existing,
      at: Math.max(existing.at, scene.at),
      cardId: existing.cardId ?? scene.cardId,
    });
  };
  for (const entry of history) add(historyScene(entry));
  for (const card of cards) {
    // Cheap reject first: almost every card in a large deck has no local file.
    if (!isLocalMediaPath(card.sourceUrl)) continue;
    add(cardScene(card, index));
  }
  return [...byKey.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, limit));
}

/** The translated sentence for an open that would not be heard, or null when it would. */
export function sceneReachMessage(reach: MediaWorkspaceReach): string | null {
  if (reach === 'no-host') return t('studyLoop.scene.noHost');
  if (reach === 'unavailable') return t('studyLoop.scene.unavailable');
  return null;
}

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind: 'muted' } }));
}

/**
 * Open `localFilePath` in the adopted player at `startAtSec` (absent: the file's stored
 * resume point). When the open could not be heard, says why — through `notify` when the
 * caller has a status line of its own, else as a toast — and dispatches nothing.
 */
export async function openInAdoptedPlayer(
  localFilePath: string,
  startAtSec: number | undefined,
  notify: (message: string) => void = toast,
): Promise<MediaWorkspaceReach> {
  const reach = await reachMediaWorkspace();
  const message = sceneReachMessage(reach);
  if (message) {
    notify(message);
    return reach;
  }
  openMediaWorkspace({
    localFilePath,
    ...(typeof startAtSec === 'number' && Number.isFinite(startAtSec)
      ? { startAtSec: Math.max(0, startAtSec) }
      : {}),
  });
  return reach;
}

/** Open a scene with the shared run-up before the line. */
export function openSceneAt(
  scene: Pick<SceneTarget, 'localFilePath' | 'cueStartSec'>,
  notify?: (message: string) => void,
): Promise<MediaWorkspaceReach> {
  return openInAdoptedPlayer(scene.localFilePath, sceneStartSec(scene.cueStartSec), notify);
}

/**
 * Where a Study OS context should start: the line (with the run-up) when it names one,
 * else its stored return position, else nothing — the player's own resume point.
 */
export function studyContextStartSec(context: {
  cueStartSec?: number;
  returnTarget?: { positionSec?: number };
}): number | undefined {
  if (typeof context.cueStartSec === 'number' && Number.isFinite(context.cueStartSec)) {
    return sceneStartSec(context.cueStartSec);
  }
  const position = context.returnTarget?.positionSec;
  return typeof position === 'number' && Number.isFinite(position) && position > 0
    ? position
    : undefined;
}
