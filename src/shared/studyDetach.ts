/**
 * Detached Study Blocks — the contract between the player and a block living in its
 * own OS window (prompt §5 "detached / pop-out window / second-monitor placement",
 * §20 multi-monitor, §26 "persist detached-window positions").
 *
 * ## Two kinds of detach, because the app already has two kinds of surface
 *
 *   · **hosted** — the block is drawn by the player and has no life of its own. Its
 *     window is a second renderer loaded with `?studyBlock=<id>`, and everything it
 *     shows arrives over the bus below. `transcript`, `grammar`, `aiWorkspace`,
 *     `miningQueue`, `mediaInfo` and `studyHud` work this way.
 *   · **app-section** — the block is a *pointer* to a real app surface that already
 *     has its own pop-out window (`popout:open`). Detaching Notes opens the Notebook
 *     app, not a copy of it. Nothing needs syncing because nothing was mirrored.
 *
 * Any other block is **not detachable and says so**. `cardEditor` captures a
 * screenshot and the line's audio off the live `<video>` element, and `dictionary`
 * is a popup positioned at the click — neither survives being moved to a process
 * with no video in it. A Detach item that produced a dead panel would be exactly the
 * placeholder the acceptance criteria forbid, so `studyBlockRegistry` marks those
 * `canDetach: false` and the menu never offers them.
 *
 * ## Why a snapshot rather than shared state
 *
 * Same shape as the music player's `player:publish` / `player:sync` (`main.ts`), for
 * the same reason: one window owns the live objects and the others mirror a plain,
 * structured-cloneable projection of them. A detached transcript that held a
 * reference to the host's `SubtitleManager` would be holding a dead object the
 * moment the episode changed.
 *
 * Pure module: no Electron, no DOM, no React. Both processes import it.
 */

import type { VideoCoreMiningSource } from './videoCoreMining';
import type { StudyBlockId } from './studyWorkspace';

/* ------------------------------------------------------------------------------ *
 * Which blocks can leave the window
 * ------------------------------------------------------------------------------ */

/** Blocks the detached host renders itself, fed by the snapshot below. */
export const HOSTED_DETACH_BLOCKS = [
  'transcript',
  'grammar',
  'aiWorkspace',
  'miningQueue',
  'mediaInfo',
  'studyHud',
] as const satisfies readonly StudyBlockId[];

export type HostedDetachBlockId = (typeof HOSTED_DETACH_BLOCKS)[number];

/**
 * Blocks that detach by opening the app surface that already owns them.
 *
 * The values are `popout:open` section names — the same strings the desktop, the
 * command palette and `--popout=` use. Keeping them here rather than inventing a
 * second routing table is what stops a block from opening a window the rest of the
 * app does not know about.
 */
export const APP_SECTION_DETACH_BLOCKS: Readonly<Partial<Record<StudyBlockId, string>>> = {
  notes: 'notebook',
  library: 'library',
  statistics: 'stats',
  review: 'anki',
};

export function isHostedDetachBlock(id: string): id is HostedDetachBlockId {
  return (HOSTED_DETACH_BLOCKS as readonly string[]).includes(id);
}

export function appSectionForBlock(id: StudyBlockId): string | null {
  return APP_SECTION_DETACH_BLOCKS[id] ?? null;
}

/** Every block that can leave the window, either way. */
export function isDetachableBlock(id: StudyBlockId): boolean {
  return isHostedDetachBlock(id) || appSectionForBlock(id) !== null;
}

/* ------------------------------------------------------------------------------ *
 * The window handle
 * ------------------------------------------------------------------------------ */

/**
 * Deterministic id for a detached window.
 *
 * Derived rather than random so the three parties agree without a handshake: main
 * keys its window map by it, the workspace document stores it on the block, and the
 * detached window recomputes it from its own URL. A random id would need a round
 * trip before the layout could record what it had just opened.
 */
export function detachWindowId(blockId: StudyBlockId, surface: string): string {
  return `study-block:${surface}:${blockId}`;
}

/** `?studyBlock=<id>&surface=<kind>` off a detached window's URL. */
export function parseDetachTarget(
  search: string,
): { blockId: HostedDetachBlockId; surface: string } | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const raw = params.get('studyBlock');
  if (!raw || !isHostedDetachBlock(raw)) return null;
  const surface = params.get('surface') || 'workspace';
  return { blockId: raw, surface };
}

/* ------------------------------------------------------------------------------ *
 * Snapshot: host -> detached windows
 * ------------------------------------------------------------------------------ */

/** A subtitle cue, flattened. Structurally `VideoCoreActiveCue`, without the import. */
export interface DetachCue {
  index: number;
  trackNumber: number;
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Where a mined card says it came from.
 *
 * The player's own type, not a copy of it: the HUD's "already mined?" answer comes from
 * `findMinedCueEntry(history, source, cue)`, and a re-declared source with one field
 * renamed would silently answer "no" for every line.
 */
export type DetachMiningSource = VideoCoreMiningSource;

export interface StudyDetachSnapshot {
  /** `webContents.id` of the publishing window. A window ignores its own echo. */
  sourceId: number;
  /** Which study surface published this — `workspace` or `player`. */
  surface: string;
  /** Bumped on every publish; a stale frame arriving late is dropped. */
  revision: number;

  /* media */
  mediaName: string;
  episode: number | null;
  streamType: string;
  durationSec: number;
  positionSec: number;
  paused: boolean;
  playbackRate: number;

  /* subtitles */
  /**
   * The whole track — or `null` for "unchanged since my last publish".
   *
   * A 24-minute episode is several hundred cues and the host republishes on every
   * `timeupdate`. Sending the track four times a second would be a few megabytes a
   * minute of structured cloning for a list that changes only when the *track* does.
   * `mergeDetachSnapshot` carries the last real list forward, so a receiver never sees
   * the null: main merges before it relays.
   */
  cues: DetachCue[] | null;
  activeIndex: number | null;
  trackLabel: string;
  trackCount: number;
  audioTrackCount: number;
  subtitleDelaySec: number;
  studyLang: string;

  /* study */
  /** `CueAnalysisState`, carried opaquely — the detached grammar panel re-renders it. */
  analysis: unknown;
  /** Selected span in the analysis. `-1` is the panel's own "nothing selected". */
  selectedAnnotation: number;
  aiMode: 'analysis' | 'translation';
  translation: string;
  translationBusy: boolean;
  miningSource: DetachMiningSource | null;
  /** The mining panel's export counter. Re-reads the shared history store. */
  mineSignal: number;
}

/**
 * What a detached window shows before the host has published anything.
 *
 * A detached window can be created faster than the host's first publish, and can also
 * outlive a host that navigated away. Both must render *something honest* rather than
 * crash on `snapshot.cues.map` — hence a real empty snapshot instead of `null`.
 */
export function emptyDetachSnapshot(): StudyDetachSnapshot {
  return {
    sourceId: 0,
    surface: 'workspace',
    revision: 0,
    mediaName: '',
    episode: null,
    streamType: '',
    durationSec: 0,
    positionSec: 0,
    paused: true,
    playbackRate: 1,
    cues: [],
    activeIndex: null,
    trackLabel: '',
    trackCount: 0,
    audioTrackCount: 0,
    subtitleDelaySec: 0,
    studyLang: 'ja',
    analysis: { kind: 'idle' },
    selectedAnnotation: -1,
    aiMode: 'analysis',
    translation: '',
    translationBusy: false,
    miningSource: null,
    mineSignal: 0,
  };
}

/**
 * Fold a new frame onto the last one, carrying the cue list forward.
 *
 * Applied by the relay in main, so every window downstream of it receives a complete
 * snapshot and no receiver has to know that light frames exist. Applied again in the
 * detached window as a defence, because a window that starts mid-stream can meet a
 * light frame before it has ever seen a full one.
 */
export function mergeDetachSnapshot(
  previous: StudyDetachSnapshot | null,
  next: StudyDetachSnapshot,
): StudyDetachSnapshot {
  if (next.cues !== null) return next;
  return { ...next, cues: previous?.cues ?? [] };
}

/**
 * Cap the cue list carried over IPC.
 *
 * A 24-minute episode runs to several hundred cues and the snapshot is republished
 * on every seek. Sending the whole track each time is the "careful multi-window
 * synchronisation" the performance rule asks for — so the transcript travels once
 * per *track*, and position updates carry only the active index.
 */
export const CUE_PUBLISH_LIMIT = 4_000;

export function trimCues(cues: readonly DetachCue[]): DetachCue[] {
  const list = cues.length > CUE_PUBLISH_LIMIT ? cues.slice(0, CUE_PUBLISH_LIMIT) : cues;
  return list.map((cue) => ({
    index: cue.index,
    trackNumber: cue.trackNumber,
    text: cue.text,
    startMs: cue.startMs,
    endMs: cue.endMs,
  }));
}

/* ------------------------------------------------------------------------------ *
 * Commands: detached window -> host
 * ------------------------------------------------------------------------------ */

export type StudyDetachCommand =
  /** Jump the video to a transcript line. */
  | { type: 'seek-cue'; index: number }
  | { type: 'toggle-play' }
  | { type: 'replay-line' }
  /** Analyse the current line now, from the detached grammar panel. */
  | { type: 'analyze-now' }
  | { type: 'select-annotation'; index: number }
  /** Open the host's dictionary card for a word clicked in a detached panel. */
  | { type: 'lookup'; query: string; context: string }
  | { type: 'set-ai-mode'; mode: 'analysis' | 'translation' }
  | { type: 'translate' }
  | { type: 'mine' }
  /** The detached window is going away; the host re-docks the block. */
  | { type: 'closing'; blockId: StudyBlockId };

const COMMAND_TYPES = new Set<StudyDetachCommand['type']>([
  'seek-cue', 'toggle-play', 'replay-line', 'analyze-now', 'select-annotation',
  'lookup', 'set-ai-mode', 'translate', 'mine', 'closing',
]);

/**
 * Validate a command that crossed a process boundary.
 *
 * IPC payloads are `unknown` no matter what the type says on the sending side, and
 * this one reaches `video.currentTime`. A malformed `seek-cue` with a NaN index
 * would put the player into a permanently broken seek.
 */
export function parseDetachCommand(value: unknown): StudyDetachCommand | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || !COMMAND_TYPES.has(type as StudyDetachCommand['type'])) {
    return null;
  }
  switch (type) {
    case 'seek-cue': {
      const index = record.index;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
      return { type: 'seek-cue', index };
    }
    case 'select-annotation': {
      const index = record.index;
      // -1 is a real value here — the panel's "nothing selected".
      if (typeof index !== 'number' || !Number.isInteger(index) || index < -1) return null;
      return { type: 'select-annotation', index };
    }
    case 'lookup': {
      const query = record.query;
      if (typeof query !== 'string' || !query) return null;
      return {
        type: 'lookup',
        query,
        context: typeof record.context === 'string' ? record.context : '',
      };
    }
    case 'set-ai-mode': {
      const mode = record.mode;
      if (mode !== 'analysis' && mode !== 'translation') return null;
      return { type: 'set-ai-mode', mode };
    }
    case 'closing': {
      const blockId = record.blockId;
      if (typeof blockId !== 'string') return null;
      return { type: 'closing', blockId: blockId as StudyBlockId };
    }
    default:
      return { type } as StudyDetachCommand;
  }
}

/* ------------------------------------------------------------------------------ *
 * Window geometry, persisted
 * ------------------------------------------------------------------------------ */

export interface DetachedWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Display the user last had it on, so a re-open lands on the right monitor. */
  displayKey?: string;
}

export const DETACHED_MIN_WIDTH = 320;
export const DETACHED_MIN_HEIGHT = 240;

/** Per-block opening size. A transcript column and a HUD strip are not the same shape. */
export function defaultDetachedSize(blockId: string): { width: number; height: number } {
  switch (blockId) {
    case 'transcript':
      return { width: 460, height: 820 };
    case 'studyHud':
      return { width: 420, height: 260 };
    case 'mediaInfo':
      return { width: 420, height: 320 };
    case 'miningQueue':
      return { width: 440, height: 560 };
    default:
      return { width: 520, height: 640 };
  }
}

/**
 * Accept stored geometry only if it is still usable.
 *
 * A monitor that has been unplugged leaves bounds pointing into empty virtual
 * screen space, and a window opened there is invisible with no way to get it back.
 * `screens` is the list of present work areas; a rectangle must overlap one of them
 * by enough to be grabbable.
 */
export function sanitizeDetachedBounds(
  value: unknown,
  screens: readonly { x: number; y: number; width: number; height: number }[],
): DetachedWindowBounds | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const nums = ['x', 'y', 'width', 'height'].map((key) => record[key]);
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
  const [x, y, width, height] = nums as number[];
  if (width < DETACHED_MIN_WIDTH || height < DETACHED_MIN_HEIGHT) return null;
  if (width > 10_000 || height > 10_000) return null;

  // 96px of title bar visible on some screen is the threshold for "the user can
  // reach this window with the mouse".
  const visible = screens.some((screen) => {
    const overlapX = Math.min(x + width, screen.x + screen.width) - Math.max(x, screen.x);
    const overlapY = Math.min(y + height, screen.y + screen.height) - Math.max(y, screen.y);
    return overlapX >= 96 && overlapY >= 48;
  });
  if (screens.length && !visible) return null;

  const displayKey = typeof record.displayKey === 'string' ? record.displayKey : undefined;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    ...(displayKey ? { displayKey } : {}),
  };
}

/** Centre a window of `size` on a display's work area. */
export function centreOnWorkArea(
  workArea: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
): DetachedWindowBounds {
  const width = Math.min(size.width, Math.max(DETACHED_MIN_WIDTH, workArea.width - 40));
  const height = Math.min(size.height, Math.max(DETACHED_MIN_HEIGHT, workArea.height - 40));
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** IPC channel names, in one place so main and preload cannot drift. */
export const DETACH_CHANNELS = {
  open: 'studyblock:open',
  close: 'studyblock:close',
  list: 'studyblock:list',
  moveToDisplay: 'studyblock:moveToDisplay',
  publish: 'studyblock:publish',
  sync: 'studyblock:sync',
  command: 'studyblock:command',
  changed: 'studyblock:changed',
  requestSnapshot: 'studyblock:requestSnapshot',
} as const;

/** One entry per open detached window, as main sees it. */
export interface DetachedWindowInfo {
  blockId: string;
  surface: string;
  displayKey: string | null;
}
