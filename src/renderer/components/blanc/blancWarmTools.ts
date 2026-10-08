/**
 * Blanc's memory budget: which toolbox tools are LOADED right now.
 *
 * Before this the toolbox mounted only the active tool, so every switch threw
 * the previous tool's React tree, state and caches away and rebuilt the next
 * one from nothing — cheap on memory, slow and forgetful in use. Now a tool
 * you leave stays WARM (mounted inside a hidden `<Activity>`: its state and
 * DOM kept, its effects — timers, listeners, polls — torn down) until it falls
 * out of a small most-recently-used window. Beyond the window it is UNLOADED:
 * its tree is gone, only the browser's cached chunk of code remains.
 *
 *  - `limit` is how many recent tools besides the active one stay warm
 *    (Settings > Speed & memory; 0 restores the old one-tool behaviour).
 *  - Pinned tools ("keep warm") never fall out of the window.
 *  - Trim unloads every unpinned tool except the one on screen.
 *
 * The functions below are pure (tested in blancWarmTools.test.ts); the store
 * at the bottom is the single owner the toolbox and the RAM chip both read.
 */
import { loadBlancMechSettings, onBlancMechSettingsChanged } from './blancMechSettings';

export interface WarmChange {
  /** Loaded tools, most recently used first; the active tool is element 0. */
  loaded: string[];
  /** Tools this change unloaded. */
  evicted: string[];
}

function keepPolicy(mru: readonly string[], active: string, limit: number, pinned: readonly string[]): WarmChange {
  const pinSet = new Set(pinned);
  const safeLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 0));
  const loaded: string[] = [];
  const evicted: string[] = [];
  let unpinnedKept = 0;
  for (const id of mru) {
    if (id === active || pinSet.has(id)) {
      loaded.push(id);
    } else if (unpinnedKept < safeLimit) {
      loaded.push(id);
      unpinnedKept += 1;
    } else {
      evicted.push(id);
    }
  }
  return { loaded, evicted };
}

/** `active` was just opened: move it to the front and apply the budget. */
export function touchWarm(
  loaded: readonly string[],
  active: string,
  limit: number,
  pinned: readonly string[] = [],
): WarmChange {
  const mru = [active, ...loaded.filter((id) => id !== active)];
  return keepPolicy(mru, active, limit, pinned);
}

/** Unload everything that is neither on screen nor pinned. */
export function trimWarm(loaded: readonly string[], active: string | null, pinned: readonly string[] = []): WarmChange {
  const pinSet = new Set(pinned);
  const kept: string[] = [];
  const evicted: string[] = [];
  for (const id of loaded) {
    if (id === active || pinSet.has(id)) kept.push(id);
    else evicted.push(id);
  }
  return { loaded: kept, evicted };
}

/** Unload one tool (never the one on screen). */
export function unloadWarm(loaded: readonly string[], id: string, active: string | null): WarmChange {
  if (id === active || !loaded.includes(id)) return { loaded: [...loaded], evicted: [] };
  return { loaded: loaded.filter((item) => item !== id), evicted: [id] };
}

// ---------------------------------------------------------------------------
// Store

export interface WarmToolsSnapshot {
  /** Most recently used first; `active` (when set) is element 0. */
  loaded: readonly string[];
  /** The toolbox's tool on screen, or null when the toolbox is not showing. */
  active: string | null;
  /**
   * Whether the whole toolbox stays mounted (hidden) while another tab or a
   * book is on screen. Dropped by Trim, and never held when the budget is 0.
   */
  toolboxRetained: boolean;
  /** Bumped on every Trim, so a host can release its own caches too. */
  trimCount: number;
}

type Listener = (snapshot: WarmToolsSnapshot) => void;
const listeners = new Set<Listener>();
let snapshot: WarmToolsSnapshot = { loaded: [], active: null, toolboxRetained: false, trimCount: 0 };

function emit(next: WarmToolsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}

export function getWarmTools(): WarmToolsSnapshot {
  return snapshot;
}

export function subscribeWarmTools(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** The toolbox opened (or re-applied the budget for) `active`. */
export function touchWarmTool(active: string): void {
  const settings = loadBlancMechSettings();
  const { loaded } = touchWarm(snapshot.loaded, active, settings.warmToolLimit, settings.keepWarm);
  const toolboxRetained = settings.warmToolLimit > 0 || settings.keepWarm.length > 0;
  if (sameList(loaded, snapshot.loaded) && snapshot.active === active && snapshot.toolboxRetained === toolboxRetained) return;
  emit({ ...snapshot, loaded, active, toolboxRetained });
}

/** The toolbox is no longer on screen (another tab or a book is). */
export function leaveToolbox(): void {
  if (snapshot.active === null) return;
  emit({ ...snapshot, active: null });
}

/** The toolbox unmounted: nothing it held is loaded any more. */
export function toolboxUnmounted(): void {
  if (!snapshot.loaded.length && snapshot.active === null && !snapshot.toolboxRetained) return;
  emit({ ...snapshot, loaded: [], active: null, toolboxRetained: false });
}

export function unloadWarmTool(id: string): void {
  const { loaded, evicted } = unloadWarm(snapshot.loaded, id, snapshot.active);
  if (evicted.length) emit({ ...snapshot, loaded });
}

/**
 * Unload every unpinned tool except the one on screen. When the toolbox is not
 * on screen and nothing in it is pinned, the toolbox itself is released too.
 * Returns how many tools were unloaded.
 */
export function trimWarmTools(): number {
  const pinned = loadBlancMechSettings().keepWarm;
  const { loaded, evicted } = trimWarm(snapshot.loaded, snapshot.active, pinned);
  const releaseToolbox = snapshot.active === null && loaded.length === 0;
  emit({
    ...snapshot,
    loaded: releaseToolbox ? [] : loaded,
    toolboxRetained: releaseToolbox ? false : snapshot.toolboxRetained,
    trimCount: snapshot.trimCount + 1,
  });
  return evicted.length;
}

/**
 * Re-apply the budget when its settings change, so lowering the limit or
 * unpinning a tool takes effect now rather than at the next tool switch.
 */
onBlancMechSettingsChanged((settings) => {
  const anchor = snapshot.active;
  const { loaded } = anchor
    ? touchWarm(snapshot.loaded, anchor, settings.warmToolLimit, settings.keepWarm)
    : keepPolicy(snapshot.loaded, '', settings.warmToolLimit, settings.keepWarm);
  const toolboxRetained = snapshot.toolboxRetained && (settings.warmToolLimit > 0 || settings.keepWarm.length > 0);
  if (sameList(loaded, snapshot.loaded) && toolboxRetained === snapshot.toolboxRetained) return;
  emit({ ...snapshot, loaded, toolboxRetained });
});

/** Test seam. */
export function resetWarmToolsForTests(): void {
  listeners.clear();
  snapshot = { loaded: [], active: null, toolboxRetained: false, trimCount: 0 };
}
