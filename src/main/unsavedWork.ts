/**
 * What a restart would cut short, from every window and from main itself.
 *
 * "Restart to update" asks this registry before it quits (main/squirrelUpdater.ts
 * `requestRestart`). Two kinds of reporter:
 *   - a window's renderer sends its WHOLE current list over IPC whenever it
 *     changes (`unsavedWork:report`, renderer/unsavedWork.ts `useUnsavedWork`).
 *     A snapshot, not a delta: the latest message is the truth, which is also what
 *     the lock's IPC gate keeps of a `send` while Gum is locked. Entries are keyed
 *     by the reporting webContents and dropped when that window goes away, so a
 *     pop-out that closes (or crashes) cannot leave a stale warning behind;
 *   - a main-process job holds a kind while it runs (`holdUnsavedWork`) and lets
 *     go in its `finally`.
 *
 * No Electron import: the IPC handler lives in main/release.ts.
 */
import { APP_UPDATE_UNSAVED_KINDS, isAppUpdateUnsavedKind, type AppUpdateUnsavedKind } from '../shared/appUpdate';

/** How many entries one window may report; more is a bug, not a bigger warning. */
export const MAX_UNSAVED_PER_WINDOW = 64;

const byWindow = new Map<number, AppUpdateUnsavedKind[]>();
const mainHolds = new Map<number, AppUpdateUnsavedKind>();
let holdSeq = 0;

/**
 * A window's current list (one kind per open draft / session). Anything that is
 * not a known kind is ignored; an empty list clears the window. False = rejected.
 */
export function setWindowUnsavedWork(windowId: number, raw: unknown): boolean {
  if (!Number.isInteger(windowId) || windowId <= 0) return false;
  if (!Array.isArray(raw)) return false;
  const kinds = raw.filter(isAppUpdateUnsavedKind).slice(0, MAX_UNSAVED_PER_WINDOW);
  if (kinds.length) byWindow.set(windowId, kinds);
  else byWindow.delete(windowId);
  return true;
}

/** A window closed (or its page went away): whatever it reported goes with it. */
export function forgetWindowUnsavedWork(windowId: number): void {
  byWindow.delete(windowId);
}

/**
 * A main-process job holds `kind` until the returned release is called (twice is
 * harmless). Call the release in a `finally`, so a throw cannot leave it behind.
 */
export function holdUnsavedWork(kind: AppUpdateUnsavedKind): () => void {
  const id = ++holdSeq;
  mainHolds.set(id, kind);
  return () => {
    mainHolds.delete(id);
  };
}

/** Every kind held right now, once each, in the order the warning lists them. */
export function listUnsavedWork(): AppUpdateUnsavedKind[] {
  const held = new Set<AppUpdateUnsavedKind>(mainHolds.values());
  for (const kinds of byWindow.values()) kinds.forEach((kind) => held.add(kind));
  return APP_UPDATE_UNSAVED_KINDS.filter((kind) => held.has(kind));
}

export function resetUnsavedWorkForTests(): void {
  byWindow.clear();
  mainHolds.clear();
  holdSeq = 0;
}
