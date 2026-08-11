/**
 * Schema v3 widened this from `0 | 1` to a plain number: desktops are now a
 * list sized to the user's monitors, not a fixed pair. The two named indices
 * below keep their meaning as the seeded defaults.
 */
export type DesktopIndex = number;

/** Number of desktops seeded on a fresh install. Not an upper bound. */
export const DESKTOP_COUNT = 2 as const;
export const DESKTOP_STUDY: DesktopIndex = 0;
export const DESKTOP_CITY: DesktopIndex = 1;
/** Hard cap on desktops, so a pathological display topology can't unbound the store. */
export const MAX_DESKTOPS = 8;
export const SLIDE_DURATION_MS = 380;

export type DesktopWinSection =
  | 'agent'
  | 'library'
  | 'novels'
  | 'dictionary'
  | 'grammar'
  | 'notebook'
  | 'translate'
  | 'player'
  | 'video'
  | 'music'
  | 'anki'
  | 'flashcards'
  | 'games'
  | 'stats'
  | 'resources'
  | 'settings'
  | 'note'
  | 'visualizer'
  | 'musicwidget'
  | 'city'
  | 'immersion'
  | 'calendar'
  | 'reading'
  | 'youtube'
  | 'scraper';

export interface WindowSnapshot {
  id: string;
  section: DesktopWinSection;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  visible: boolean;
  maximized: boolean;
  /** Always-on-top. Optional so pre-existing saved layouts still parse. */
  pinned?: boolean;
  restoreRect?: { x: number; y: number; w: number; h: number };
}

export interface IconSnapshot {
  id: string;
  kind: 'app' | 'shortcut' | 'action';
  section?: DesktopWinSection;
  target?: string;
  action?: 'note' | 'addapp' | 'city';
  name: string;
  glyph?: string;
  icon?: string;
  x: number;
  y: number;
}

export interface NoteSnapshot {
  id: string;
  text: string;
  color: string;
}

/**
 * A Home Workspace widget instance placed on the desktop. `type` keys into the
 * renderer widget registry; `settings` is an opaque per-widget bag persisted
 * verbatim. Free-positioned like icons/notes, so it carries its own geometry.
 */
export interface WidgetSnapshot {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  locked?: boolean;
  collapsed?: boolean;
  hidden?: boolean;
  settings?: Record<string, unknown>;
}

export interface WallpaperSnapshot {
  kind: 'preset' | 'image' | 'video' | 'slideshow';
  id?: string;
  path?: string;
  /** Slideshow: absolute folder path. */
  folder?: string;
  /** Seconds between slides (Windows-style). */
  intervalSec?: number;
  shuffle?: boolean;
}

export interface DesktopLayout {
  desktopIndex: DesktopIndex;
  /** User-renamable label, shown in the Monitors page and taskbar badges. */
  name?: string;
  /**
   * Viewport this layout's geometry was authored against. Used to remap
   * absolute-px positions onto a differently-sized monitor on hydrate.
   */
  authoredW?: number;
  authoredH?: number;
  windows: WindowSnapshot[];
  icons: IconSnapshot[];
  notes: Record<string, NoteSnapshot>;
  /** Home Workspace widgets placed on this desktop. */
  widgets: WidgetSnapshot[];
  wallpaper: WallpaperSnapshot;
  layoutEpoch: number;
}

export type TaskbarMode = 'full' | 'windows-only' | 'none';

/** Which desktop a physical display hosts, and how that display renders it. */
export interface DisplayAssignment {
  /** Stable identity from `shared/displayIdentity.ts` — not Electron's `Display.id`. */
  displayKey: string;
  desktopIndex: DesktopIndex;
  enabled: boolean;
  /** Opt out of the fixed 1280x960 Aero canvas on this display. */
  aero?: boolean;
  taskbar?: TaskbarMode;
  /** Taskbar lists windows from every desktop, not just this display's. */
  showAllWindows?: boolean;
}

export interface DesktopLayoutStoreSchema {
  /**
   * 2 = pin-from-start: default empty desktop; apps added via Start menu.
   * 3 = N desktops <-> N monitors: `viewports` record became the `desktops`
   *     list and per-display `assignments` appeared.
   */
  schemaVersion: 1 | 2 | 3;
  activeDesktopIndex: DesktopIndex;
  /** v3. Replaces the `Record<0 | 1, DesktopLayout>` named `viewports` in v1/v2. */
  desktops: DesktopLayout[];
  /** v3. One entry per display the user has configured. */
  assignments: DisplayAssignment[];
  globalZTop: number;
}

/** Current on-disk layout schema. */
export const DESKTOP_LAYOUT_SCHEMA_VERSION = 3 as const;

export interface DesktopLayoutSnapshot {
  /** What the MAIN window shows. Secondary windows are pinned by assignment. */
  activeDesktopIndex: DesktopIndex;
  /**
   * Wire name kept from v2 — the renderer, the settings catalog and the
   * storage importer all read `viewports`. On disk this is `desktops`.
   */
  viewports: DesktopLayout[];
  /**
   * Optional so a v2-era snapshot literal (and the fixtures in
   * `aeroDesktopPersonality.test.ts`) still satisfies the type. Main always
   * sends it; renderers read it as `assignments ?? []`.
   */
  assignments?: DisplayAssignment[];
  globalZTop: number;
  switching: boolean;
}

export const DEFAULT_ASSIGNMENT: Omit<DisplayAssignment, 'displayKey' | 'desktopIndex'> = {
  enabled: true,
  aero: true,
  taskbar: 'full',
  showAllWindows: false,
};

export const DESKTOP_LAYOUT_EVENT = 'desktop-changed';

export const SEED_CITY_ICONS: IconSnapshot[] = [];

export const SEED_WALLPAPER: WallpaperSnapshot = { kind: 'preset', id: 'crimsonveil' };
