export type DesktopIndex = 0 | 1;

export const DESKTOP_COUNT = 2 as const;
export const DESKTOP_STUDY: DesktopIndex = 0;
export const DESKTOP_CITY: DesktopIndex = 1;
export const SLIDE_DURATION_MS = 380;

export type DesktopWinSection =
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
  windows: WindowSnapshot[];
  icons: IconSnapshot[];
  notes: Record<string, NoteSnapshot>;
  /** Home Workspace widgets placed on this desktop. */
  widgets: WidgetSnapshot[];
  wallpaper: WallpaperSnapshot;
  layoutEpoch: number;
}

export interface DesktopLayoutStoreSchema {
  /** 2 = pin-from-start: default empty desktop; apps added via Start menu. */
  schemaVersion: 1 | 2;
  activeDesktopIndex: DesktopIndex;
  viewports: Record<DesktopIndex, DesktopLayout>;
  globalZTop: number;
}

/** Current on-disk layout schema. */
export const DESKTOP_LAYOUT_SCHEMA_VERSION = 2 as const;

export interface DesktopLayoutSnapshot {
  activeDesktopIndex: DesktopIndex;
  viewports: DesktopLayout[];
  globalZTop: number;
  switching: boolean;
}

export const DESKTOP_LAYOUT_EVENT = 'desktop-changed';

export const SEED_CITY_ICONS: IconSnapshot[] = [];

export const SEED_WALLPAPER: WallpaperSnapshot = { kind: 'preset', id: 'crimsonveil' };
