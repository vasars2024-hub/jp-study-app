/**
 * Settings -> Help -> Updates: "Update history" (every version this copy has run,
 * and when it first started as it) and "What's new" (shown once after an update,
 * until the user dismisses it).
 *
 * Kept in `app-update-state.json` beside the channel and the last check time.
 * Pure: main/release.ts reads and writes the file; tests drive this directly.
 */
import { isReleaseVersion, normalizeVersion, compareVersions } from '../shared/release';
import type { AppUpdateHistoryEntry, AppUpdateWhatsNew } from '../shared/appUpdate';

export const UPDATE_HISTORY_MAX = 50;

export interface UpdateHistoryState {
  history: AppUpdateHistoryEntry[];
  whatsNew: AppUpdateWhatsNew | null;
}

function sanitizeEntry(raw: unknown): AppUpdateHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'string' || !isReleaseVersion(r.version)) return null;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at <= 0) return null;
  const from = typeof r.from === 'string' && isReleaseVersion(r.from) ? normalizeVersion(r.from) : undefined;
  return { version: normalizeVersion(r.version), at: r.at, ...(from ? { from } : {}) };
}

/** What `app-update-state.json` holds about versions, validated; junk is dropped. */
export function readUpdateHistory(state: Record<string, unknown>): UpdateHistoryState {
  const history = Array.isArray(state.history)
    ? state.history.map(sanitizeEntry).filter((e): e is AppUpdateHistoryEntry => e !== null).slice(-UPDATE_HISTORY_MAX)
    : [];
  const w = state.whatsNew as Record<string, unknown> | null | undefined;
  const whatsNew = w && typeof w === 'object'
    && typeof w.version === 'string' && isReleaseVersion(w.version)
    && typeof w.from === 'string' && isReleaseVersion(w.from)
    ? { version: normalizeVersion(w.version), from: normalizeVersion(w.from), ...(w.announced === true ? { announced: true } : {}) }
    : null;
  return { history, whatsNew };
}

/**
 * Called once per start with the running version. Records it when it differs
 * from the last one that ran; an upgrade (not the first run, not a downgrade)
 * also arms "What's new". `changed` = there is something to write.
 */
export function noteRunningVersion(
  prev: UpdateHistoryState,
  running: string,
  now: number,
): UpdateHistoryState & { changed: boolean } {
  const version = normalizeVersion(running);
  if (!isReleaseVersion(version)) return { ...prev, changed: false };
  const last = prev.history[prev.history.length - 1];
  if (last && last.version === version) return { ...prev, changed: false };
  const entry: AppUpdateHistoryEntry = { version, at: now, ...(last ? { from: last.version } : {}) };
  const history = [...prev.history, entry].slice(-UPDATE_HISTORY_MAX);
  const upgraded = Boolean(last && compareVersions(version, last.version) > 0);
  return {
    history,
    // A downgrade (or a reinstall of an older build) has nothing new to show.
    whatsNew: upgraded ? { version, from: last!.version } : null,
    changed: true,
  };
}

/** Newest first, for the panel. */
export function historyForPanel(state: UpdateHistoryState): AppUpdateHistoryEntry[] {
  return [...state.history].reverse();
}
