import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import type {
  DesktopIndex,
  DesktopLayout,
  DesktopLayoutSnapshot,
  DesktopLayoutStoreSchema,
  IconSnapshot,
  NoteSnapshot,
  WallpaperSnapshot,
  WidgetSnapshot,
  WindowSnapshot,
} from '../shared/desktop';
import {
  DESKTOP_CITY,
  DESKTOP_LAYOUT_SCHEMA_VERSION,
  DESKTOP_STUDY,
  SEED_CITY_ICONS,
  SEED_WALLPAPER,
  SLIDE_DURATION_MS,
} from '../shared/desktop';

interface CommitLayoutPayload {
  desktopIndex: DesktopIndex;
  layout: DesktopLayout;
}

interface LegacyDesktopPayload {
  wins?: unknown;
  icons?: unknown;
  notes?: unknown;
  wall?: unknown;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function desktopStorePath(): string {
  return path.join(app.getPath('userData'), 'desktop-layout.json');
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const next = `${filePath}.tmp`;
  fs.writeFileSync(next, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(next, filePath);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function seedLayout(desktopIndex: DesktopIndex): DesktopLayout {
  return {
    desktopIndex,
    windows: [],
    icons: desktopIndex === DESKTOP_CITY ? clone(SEED_CITY_ICONS) : [],
    notes: {},
    widgets: [],
    wallpaper: clone(SEED_WALLPAPER),
    layoutEpoch: 1,
  };
}

function seedStore(): DesktopLayoutStoreSchema {
  return {
    schemaVersion: DESKTOP_LAYOUT_SCHEMA_VERSION,
    activeDesktopIndex: DESKTOP_STUDY,
    viewports: {
      0: seedLayout(DESKTOP_STUDY),
      1: seedLayout(DESKTOP_CITY),
    },
    globalZTop: 10,
  };
}

/**
 * v1→v2: desktop no longer auto-seeds every app icon. Drop built-in app/action
 * tiles so the desktop starts empty; keep user-added external shortcuts.
 */
function migrateIconsToPinFromStart(icons: IconSnapshot[]): IconSnapshot[] {
  return icons.filter((icon) => icon.kind === 'shortcut');
}

function sanitizeWallpaper(value: unknown): WallpaperSnapshot {
  if (!isObject(value)) return clone(SEED_WALLPAPER);
  const kind = value.kind;
  if (kind === 'slideshow') {
    const folder = typeof value.folder === 'string' ? value.folder : undefined;
    if (!folder) return clone(SEED_WALLPAPER);
    const intervalRaw = value.intervalSec;
    const intervalSec =
      typeof intervalRaw === 'number' && Number.isFinite(intervalRaw)
        ? Math.max(5, Math.min(86400, Math.round(intervalRaw)))
        : 60;
    return {
      kind: 'slideshow',
      folder,
      intervalSec,
      shuffle: value.shuffle === true,
    };
  }
  if (kind !== 'preset' && kind !== 'image' && kind !== 'video') return clone(SEED_WALLPAPER);
  return {
    kind,
    id: typeof value.id === 'string' ? value.id : undefined,
    path: typeof value.path === 'string' ? value.path : undefined,
  };
}

function sanitizeWindow(value: unknown): WindowSnapshot | null {
  if (!isObject(value)) return null;
  if (typeof value.id !== 'string' || typeof value.section !== 'string') return null;
  const num = (k: string): number => (typeof value[k] === 'number' ? value[k] : 0);
  const restoreRect =
    isObject(value.rect) || isObject(value.restoreRect)
      ? (value.restoreRect ?? value.rect) as Record<string, unknown>
      : null;
  return {
    id: value.id,
    section: value.section as WindowSnapshot['section'],
    x: num('x'),
    y: num('y'),
    w: num('w'),
    h: num('h'),
    z: num('z'),
    visible: value.min === true ? false : value.visible !== false,
    maximized: value.max === true || value.maximized === true,
    restoreRect: restoreRect
      ? {
          x: typeof restoreRect.x === 'number' ? restoreRect.x : 0,
          y: typeof restoreRect.y === 'number' ? restoreRect.y : 0,
          w: typeof restoreRect.w === 'number' ? restoreRect.w : 0,
          h: typeof restoreRect.h === 'number' ? restoreRect.h : 0,
        }
      : undefined,
  };
}

function sanitizeIcon(value: unknown): IconSnapshot | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.kind !== 'string') return null;
  return {
    id: value.id,
    kind: value.kind as IconSnapshot['kind'],
    section: typeof value.section === 'string' ? (value.section as IconSnapshot['section']) : undefined,
    target: typeof value.target === 'string' ? value.target : undefined,
    action: typeof value.action === 'string' ? (value.action as IconSnapshot['action']) : undefined,
    name: typeof value.name === 'string' ? value.name : value.id,
    glyph: typeof value.glyph === 'string' ? value.glyph : undefined,
    icon: typeof value.icon === 'string' ? value.icon : undefined,
    x: typeof value.x === 'number' ? value.x : 0,
    y: typeof value.y === 'number' ? value.y : 0,
  };
}

function sanitizeWidget(value: unknown): WidgetSnapshot | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return null;
  const num = (k: string, d: number): number => (typeof value[k] === 'number' ? (value[k] as number) : d);
  return {
    id: value.id,
    type: value.type,
    x: num('x', 0),
    y: num('y', 0),
    w: num('w', 240),
    h: num('h', 180),
    z: num('z', 1),
    locked: value.locked === true ? true : undefined,
    collapsed: value.collapsed === true ? true : undefined,
    hidden: value.hidden === true ? true : undefined,
    // Persisted verbatim — the widget owns its own settings shape.
    settings: isObject(value.settings) ? (value.settings as Record<string, unknown>) : undefined,
  };
}

function sanitizeWidgets(value: unknown): WidgetSnapshot[] {
  return Array.isArray(value) ? (value.map(sanitizeWidget).filter(Boolean) as WidgetSnapshot[]) : [];
}

function sanitizeNotes(value: unknown): Record<string, NoteSnapshot> {
  if (!isObject(value)) return {};
  const next: Record<string, NoteSnapshot> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isObject(raw)) continue;
    next[key] = {
      id: key,
      text: typeof raw.text === 'string' ? raw.text : '',
      color: typeof raw.color === 'string' ? raw.color : '#fff3a3',
    };
  }
  return next;
}

function isNoctisIcon(icon: IconSnapshot): boolean {
  return (
    icon.section === 'city' ||
    icon.action === 'city' ||
    icon.id === 'app-city' ||
    icon.id === 'app-noctis'
  );
}

function isNoctisWindow(win: WindowSnapshot): boolean {
  return win.section === 'city';
}

function stripNoctisFromLayout(layout: DesktopLayout): DesktopLayout {
  if (layout.desktopIndex === DESKTOP_STUDY) return layout;
  return {
    ...layout,
    icons: layout.icons.filter((icon) => !isNoctisIcon(icon)),
    windows: layout.windows.filter((win) => !isNoctisWindow(win)),
  };
}

class DesktopStore {
  private schema: DesktopLayoutStoreSchema;
  private switching = false;
  private switchTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.schema = this.load();
  }

  private load(): DesktopLayoutStoreSchema {
    const filePath = desktopStorePath();
    try {
      if (!fs.existsSync(filePath)) {
        const seed = seedStore();
        atomicWriteJson(filePath, seed);
        return seed;
      }
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<DesktopLayoutStoreSchema>;
      const seed = seedStore();
      const fromVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1;
      const next: DesktopLayoutStoreSchema = {
        schemaVersion: DESKTOP_LAYOUT_SCHEMA_VERSION,
        activeDesktopIndex: parsed.activeDesktopIndex === DESKTOP_CITY ? DESKTOP_CITY : DESKTOP_STUDY,
        globalZTop: typeof parsed.globalZTop === 'number' ? parsed.globalZTop : seed.globalZTop,
        viewports: {
          0: this.normalizeLayout(parsed.viewports?.[0], DESKTOP_STUDY),
          1: stripNoctisFromLayout(this.normalizeLayout(parsed.viewports?.[1], DESKTOP_CITY)),
        },
      };

      let dirty = fromVersion < DESKTOP_LAYOUT_SCHEMA_VERSION;

      // One-time: strip auto-seeded app tiles when moving to pin-from-start (v2).
      if (fromVersion < 2) {
        for (const idx of [DESKTOP_STUDY, DESKTOP_CITY] as DesktopIndex[]) {
          const layout = next.viewports[idx];
          const cleaned = migrateIconsToPinFromStart(layout.icons);
          if (cleaned.length !== layout.icons.length) {
            layout.icons = cleaned;
            layout.layoutEpoch += 1;
            dirty = true;
          }
        }
      }

      const rawCity = this.normalizeLayout(parsed.viewports?.[1], DESKTOP_CITY);
      const migratedCity = stripNoctisFromLayout(rawCity);
      if (
        rawCity.icons.length !== migratedCity.icons.length ||
        rawCity.windows.length !== migratedCity.windows.length
      ) {
        // Re-apply noctis strip on the already-migrated city viewport.
        next.viewports[1] = stripNoctisFromLayout(next.viewports[1]);
        next.viewports[1].layoutEpoch += 1;
        dirty = true;
      }

      if (dirty || fromVersion !== DESKTOP_LAYOUT_SCHEMA_VERSION) {
        atomicWriteJson(filePath, next);
      }

      return next;
    } catch {
      const seed = seedStore();
      atomicWriteJson(filePath, seed);
      return seed;
    }
  }

  private normalizeLayout(raw: unknown, desktopIndex: DesktopIndex): DesktopLayout {
    if (!isObject(raw)) return seedLayout(desktopIndex);
    const windows =
      desktopIndex === DESKTOP_CITY
        ? (Array.isArray(raw.windows) ? raw.windows.map(sanitizeWindow).filter(Boolean) as WindowSnapshot[] : []).filter(
            (win) => !isNoctisWindow(win),
          )
        : Array.isArray(raw.windows)
          ? raw.windows.map(sanitizeWindow).filter(Boolean) as WindowSnapshot[]
          : [];
    const icons = Array.isArray(raw.icons) ? raw.icons.map(sanitizeIcon).filter(Boolean) as IconSnapshot[] : [];
    const cleanedIcons =
      desktopIndex === DESKTOP_CITY ? icons.filter((icon) => !isNoctisIcon(icon)) : icons;
    return {
      desktopIndex,
      windows,
      icons: cleanedIcons,
      notes: sanitizeNotes(raw.notes),
      widgets: sanitizeWidgets(raw.widgets),
      wallpaper: sanitizeWallpaper(raw.wallpaper),
      layoutEpoch: typeof raw.layoutEpoch === 'number' ? raw.layoutEpoch : 1,
    };
  }

  private persist(): void {
    atomicWriteJson(desktopStorePath(), this.schema);
  }

  private broadcast(): void {
    const snapshot = this.snapshot();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('desktop:changed', snapshot);
    }
  }

  snapshot(): DesktopLayoutSnapshot {
    return {
      activeDesktopIndex: this.schema.activeDesktopIndex,
      viewports: [clone(this.schema.viewports[0]), clone(this.schema.viewports[1])],
      globalZTop: this.schema.globalZTop,
      switching: this.switching,
    };
  }

  migrateLegacy(payload: LegacyDesktopPayload): DesktopLayoutSnapshot {
    const next = this.schema.viewports[DESKTOP_STUDY];
    if (Array.isArray(payload.wins)) next.windows = payload.wins.map(sanitizeWindow).filter(Boolean) as WindowSnapshot[];
    // Only external shortcuts from legacy localStorage — never re-seed app tiles.
    if (Array.isArray(payload.icons)) {
      const icons = payload.icons.map(sanitizeIcon).filter(Boolean) as IconSnapshot[];
      next.icons = migrateIconsToPinFromStart(icons);
    }
    if (payload.notes) next.notes = sanitizeNotes(payload.notes);
    if (payload.wall) next.wallpaper = sanitizeWallpaper(payload.wall);
    next.layoutEpoch += 1;
    this.persist();
    this.broadcast();
    return this.snapshot();
  }

  commitLayout(payload: CommitLayoutPayload): { ok: boolean; error?: string } {
    if (this.switching) return { ok: false, error: 'desktop-switch-in-progress' };
    const index = payload.desktopIndex;
    this.schema.viewports[index] = this.normalizeLayout(payload.layout, index);
    this.schema.viewports[index].layoutEpoch += 1;
    this.schema.globalZTop = Math.max(
      this.schema.globalZTop,
      ...this.schema.viewports[index].windows.map((win) => win.z),
    );
    this.persist();
    this.broadcast();
    return { ok: true };
  }

  switchDesktop(targetIndex: DesktopIndex): { ok: boolean; error?: string; snapshot: DesktopLayoutSnapshot } {
    if (targetIndex !== DESKTOP_STUDY && targetIndex !== DESKTOP_CITY) {
      return { ok: false, error: 'invalid-desktop-index', snapshot: this.snapshot() };
    }
    if (this.schema.activeDesktopIndex === targetIndex) {
      return { ok: true, snapshot: this.snapshot() };
    }
    this.switching = true;
    this.broadcast();
    if (this.switchTimer) clearTimeout(this.switchTimer);
    this.switchTimer = setTimeout(() => {
      this.schema.activeDesktopIndex = targetIndex;
      this.switching = false;
      this.persist();
      this.broadcast();
    }, SLIDE_DURATION_MS);
    return { ok: true, snapshot: this.snapshot() };
  }
}

const store = new DesktopStore();

export function registerDesktopIpc(): void {
  ipcMain.handle('desktop:getLayout', () => store.snapshot());
  ipcMain.handle('desktop:commitLayout', (_e, payload: CommitLayoutPayload) => store.commitLayout(payload));
  ipcMain.handle('desktop:switch', (_e, payload: { targetIndex: DesktopIndex }) =>
    store.switchDesktop(payload?.targetIndex ?? DESKTOP_STUDY),
  );
  ipcMain.handle('desktop:migrateLegacy', (_e, payload: LegacyDesktopPayload) => store.migrateLegacy(payload ?? {}));
}
