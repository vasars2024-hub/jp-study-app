/**
 * Secret OS History — a small, original changelog-as-lore for the fictional
 * Secret OS, discoverable from the Aero/Wired terminal's `history` command
 * (Phase 5 · M13).
 *
 * Deliberately small and paced rather than dumped: each `history` call reveals
 * the next entry and remembers where the user left off, so this reads as a log
 * being paged through, not a wall of text. Content is wholly original — no
 * real operating system's release notes, names, or history are referenced.
 */

const KEY = 'jp-os-secret-history-v1';

export interface HistoryEntry {
  id: string;
  /** In-universe version tag, e.g. "v0.1". Flavour only — not a real build number. */
  version: string;
  titleKey: string;
  bodyKey: string;
}

export const SECRET_HISTORY: readonly HistoryEntry[] = [
  { id: 'first-light', version: 'v0.1', titleKey: 'secretHistory.firstLight.title', bodyKey: 'secretHistory.firstLight.body' },
  { id: 'second-door', version: 'v0.4', titleKey: 'secretHistory.secondDoor.title', bodyKey: 'secretHistory.secondDoor.body' },
  { id: 'warm-static', version: 'v0.7', titleKey: 'secretHistory.warmStatic.title', bodyKey: 'secretHistory.warmStatic.body' },
  { id: 'open-water', version: 'v1.0', titleKey: 'secretHistory.openWater.title', bodyKey: 'secretHistory.openWater.body' },
  { id: 'companions-arrive', version: 'v1.2', titleKey: 'secretHistory.companionsArrive.title', bodyKey: 'secretHistory.companionsArrive.body' },
  { id: 'keepsakes', version: 'v1.4', titleKey: 'secretHistory.keepsakes.title', bodyKey: 'secretHistory.keepsakes.body' },
];

interface HistoryState {
  /** Index of the next entry `history` will reveal. */
  nextIndex: number;
  /** Distinct entries read at least once, capped at the log length. */
  totalSeen: number;
}

function empty(): HistoryState {
  return { nextIndex: 0, totalSeen: 0 };
}

function load(): HistoryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<HistoryState>;
    const n = Number(parsed.nextIndex);
    const s = Number(parsed.totalSeen);
    return {
      nextIndex: Number.isInteger(n) && n >= 0 ? n : 0,
      totalSeen: Number.isInteger(s) && s >= 0 ? Math.min(s, SECRET_HISTORY.length) : 0,
    };
  } catch {
    return empty();
  }
}

function save(state: HistoryState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full/unavailable — the log just replays from the start next time */
  }
}

/** Advance and return the next entry to reveal; wraps after the last one. */
export function nextHistoryEntry(): HistoryEntry {
  const state = load();
  const entry = SECRET_HISTORY[state.nextIndex % SECRET_HISTORY.length];
  save({
    nextIndex: (state.nextIndex + 1) % SECRET_HISTORY.length,
    totalSeen: Math.min(state.totalSeen + 1, SECRET_HISTORY.length),
  });
  return entry;
}

/** How many distinct entries have been read at least once, for a "3/6" readout. */
export function historyProgress(): { seen: number; total: number } {
  const state = load();
  return { seen: state.totalSeen, total: SECRET_HISTORY.length };
}

/** Test/reset hook — also used by the Memory & storage "reset" action. */
export function resetSecretHistory(): void {
  save(empty());
}
