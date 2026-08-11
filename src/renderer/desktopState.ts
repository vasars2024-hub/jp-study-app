import type {
  DesktopIndex,
  DesktopLayout,
  DesktopLayoutSnapshot,
  DisplayAssignment,
} from '../shared/desktop';
import {
  DESKTOP_CITY,
  DESKTOP_LAYOUT_EVENT,
  DESKTOP_STUDY,
  SEED_CITY_ICONS,
  SEED_WALLPAPER,
} from '../shared/desktop';

function seedLayout(desktopIndex: DesktopIndex): DesktopLayout {
  return {
    desktopIndex,
    windows: [],
    icons: desktopIndex === DESKTOP_CITY ? [...SEED_CITY_ICONS] : [],
    notes: {},
    widgets: [],
    wallpaper: { ...SEED_WALLPAPER },
    layoutEpoch: 1,
  };
}

function seedSnapshot(): DesktopLayoutSnapshot {
  return {
    activeDesktopIndex: DESKTOP_STUDY,
    viewports: [seedLayout(DESKTOP_STUDY), seedLayout(DESKTOP_CITY)],
    assignments: [],
    globalZTop: 10,
    switching: false,
  };
}

let snapshot: DesktopLayoutSnapshot = seedSnapshot();
let initPromise: Promise<void> | null = null;
let pendingDesktopIndex: DesktopIndex | null = null;
const LEGACY_WINS_KEY = 'jp-os-wins';
const LEGACY_ICONS_KEY = 'jp-os-icons';
const LEGACY_NOTES_KEY = 'jp-desktop-notes';
const LEGACY_WALL_KEY = 'jp-os-wall';

function applySnapshot(next: DesktopLayoutSnapshot): void {
  const resolved: DesktopLayoutSnapshot =
    pendingDesktopIndex != null && next.switching
      ? { ...next, activeDesktopIndex: pendingDesktopIndex }
      : next;
  if (!next.switching) pendingDesktopIndex = null;
  snapshot = resolved;
  window.dispatchEvent(new CustomEvent<DesktopLayoutSnapshot>(DESKTOP_LAYOUT_EVENT, { detail: resolved }));
}

export function getActiveDesktopIndex(): DesktopIndex {
  return snapshot.activeDesktopIndex;
}

export function getDesktopLayout(index: DesktopIndex): DesktopLayout {
  return snapshot.viewports.find((layout) => layout.desktopIndex === index) ?? seedLayout(index);
}

export function getDesktopCount(): number {
  return Math.max(1, snapshot.viewports.length);
}

export function getDesktopName(index: DesktopIndex): string {
  return snapshot.viewports.find((layout) => layout.desktopIndex === index)?.name ?? `Desktop ${index + 1}`;
}

export function getAssignments(): DisplayAssignment[] {
  return snapshot.assignments ?? [];
}

/** Assignment for one display, or null when that display is unconfigured. */
export function getAssignment(displayKey: string): DisplayAssignment | null {
  return getAssignments().find((a) => a.displayKey === displayKey) ?? null;
}

export function onDesktopChanged(cb: (snap: DesktopLayoutSnapshot) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<DesktopLayoutSnapshot>).detail);
  window.addEventListener(DESKTOP_LAYOUT_EVENT, handler);
  return () => window.removeEventListener(DESKTOP_LAYOUT_EVENT, handler);
}

export async function switchDesktop(target: DesktopIndex): Promise<{ ok: boolean; error?: string }> {
  const previous = snapshot;
  pendingDesktopIndex = target;
  applySnapshot({ ...snapshot, activeDesktopIndex: target, switching: true });
  const res = await window.api.desktopSwitch(target);
  if (res.snapshot) applySnapshot(res.snapshot);
  if (!res.ok) {
    pendingDesktopIndex = null;
    applySnapshot(previous);
  }
  return { ok: res.ok, error: res.error };
}

export async function commitLayout(index: DesktopIndex, layout: DesktopLayout): Promise<void> {
  const res = await window.api.desktopCommitLayout(index, layout);
  if (!res.ok) throw new Error(res.error ?? 'Failed to commit desktop layout.');
}

export function initDesktopState(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      window.api.onDesktopChanged((next) => applySnapshot(next));
      const next = await window.api.desktopGetLayout();
      applySnapshot(next);
      try {
        const wins = localStorage.getItem(LEGACY_WINS_KEY);
        const icons = localStorage.getItem(LEGACY_ICONS_KEY);
        const notes = localStorage.getItem(LEGACY_NOTES_KEY);
        const wall = localStorage.getItem(LEGACY_WALL_KEY);
        if (wins || icons || notes || wall) {
          const migrated = await window.api.desktopMigrateLegacy({
            wins: wins ? JSON.parse(wins) : undefined,
            icons: icons ? JSON.parse(icons) : undefined,
            notes: notes ? JSON.parse(notes) : undefined,
            wall: wall ? JSON.parse(wall) : undefined,
          });
          applySnapshot(migrated);
          // Consume once so legacy icons are not re-applied every launch.
          localStorage.removeItem(LEGACY_WINS_KEY);
          localStorage.removeItem(LEGACY_ICONS_KEY);
          localStorage.removeItem(LEGACY_NOTES_KEY);
          localStorage.removeItem(LEGACY_WALL_KEY);
        }
      } catch {
        /* ignore malformed legacy storage */
      }
    })();
  }
  return initPromise;
}
