import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import type {
  DesktopIndex,
  DesktopLayout,
  DesktopLayoutSnapshot,
  DesktopLayoutStoreSchema,
  DisplayAssignment,
  IconSnapshot,
  NoteSnapshot,
  TaskbarMode,
  WallpaperSnapshot,
  WidgetSnapshot,
  WindowSnapshot,
} from '../shared/desktop';
import { parsePresentation } from '../shared/liquidWindowState';
import {
  DEFAULT_ASSIGNMENT,
  DESKTOP_CITY,
  DESKTOP_COUNT,
  DESKTOP_LAYOUT_SCHEMA_VERSION,
  DESKTOP_STUDY,
  MAX_DESKTOPS,
  SEED_CITY_ICONS,
  SEED_WALLPAPER,
  SLIDE_DURATION_MS,
  normalizeWinSection,
} from '../shared/desktop';
import {
  PRIMARY_DISPLAY_KEY,
  displayLabelOfKey,
  isSimulatedDisplayKey,
} from '../shared/displayIdentity';

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

/** Default label for a desktop the user has not renamed. */
function defaultDesktopName(desktopIndex: DesktopIndex): string {
  if (desktopIndex === DESKTOP_STUDY) return 'Study';
  if (desktopIndex === DESKTOP_CITY) return 'City';
  return `Desktop ${desktopIndex + 1}`;
}

function seedLayout(desktopIndex: DesktopIndex): DesktopLayout {
  return {
    desktopIndex,
    name: defaultDesktopName(desktopIndex),
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
    desktops: Array.from({ length: DESKTOP_COUNT }, (_, i) => seedLayout(i)),
    // Deliberately empty. Seeding it needs `screen`, which is unavailable until
    // `app.whenReady()`, and this store can be constructed before that.
    // `syncAssignments()` fills it once the display service is live.
    assignments: [],
    globalZTop: 10,
  };
}

function sanitizeTaskbarMode(value: unknown): TaskbarMode | undefined {
  return value === 'full' || value === 'windows-only' || value === 'none' ? value : undefined;
}

function sanitizeAssignment(value: unknown): DisplayAssignment | null {
  if (!isObject(value) || typeof value.displayKey !== 'string' || !value.displayKey) return null;
  const idx = typeof value.desktopIndex === 'number' ? Math.floor(value.desktopIndex) : 0;
  return {
    displayKey: value.displayKey,
    desktopIndex: Math.max(0, Math.min(MAX_DESKTOPS - 1, idx)),
    enabled: value.enabled !== false,
    aero: value.aero === false ? false : true,
    taskbar: sanitizeTaskbarMode(value.taskbar) ?? DEFAULT_ASSIGNMENT.taskbar,
    showAllWindows: value.showAllWindows === true,
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

/** Exported for tests — every field here must round-trip, see desktop.test.ts. */
export function sanitizeWindow(value: unknown): WindowSnapshot | null {
  if (!isObject(value)) return null;
  if (typeof value.id !== 'string' || typeof value.section !== 'string') return null;
  const num = (k: string): number => (typeof value[k] === 'number' ? value[k] : 0);
  // Liquid presentation (L3). This function is an ALLOWLIST — a field it does
  // not name is silently deleted on the way to disk, which is how the renderer
  // could go liquid, commit, and be reverted 600ms later by its own re-hydration.
  // Validated here with the same total parser the renderer uses, so a corrupt
  // blob on disk is dropped in main rather than shipped to every window.
  const presentation = parsePresentation(value.presentation);
  const restoreRect =
    isObject(value.rect) || isObject(value.restoreRect)
      ? (value.restoreRect ?? value.rect) as Record<string, unknown>
      : null;
  // A retired section id used to persist forever and render a blank body. The
  // alias map repairs the ones we know; an id we cannot resolve is KEPT as-is
  // (dropping it would delete part of the user's layout with no restore point)
  // and `AppSection` renders an honest, closable unavailable state for it.
  const section = normalizeWinSection(value.section) ?? (value.section as WindowSnapshot['section']);
  return {
    id: value.id,
    section,
    x: num('x'),
    y: num('y'),
    w: num('w'),
    h: num('h'),
    z: num('z'),
    visible: value.min === true ? false : value.visible !== false,
    maximized: value.max === true || value.maximized === true,
    pinned: value.pin === true || value.pinned === true,
    restoreRect: restoreRect
      ? {
          x: typeof restoreRect.x === 'number' ? restoreRect.x : 0,
          y: typeof restoreRect.y === 'number' ? restoreRect.y : 0,
          w: typeof restoreRect.w === 'number' ? restoreRect.w : 0,
          h: typeof restoreRect.h === 'number' ? restoreRect.h : 0,
        }
      : undefined,
    // Omitted, not `undefined`: conventional IS the absence of the key, and a
    // conditional spread keeps every layout saved before L3 byte-identical.
    ...(presentation ? { presentation } : {}),
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
  /** Desktops the main window is sliding between; both are locked mid-slide. */
  private switchFrom: DesktopIndex | null = null;
  private switchTo: DesktopIndex | null = null;
  /** Display hosting the main window, so secondary claims can be told apart. */
  private mainDisplayKey: string | null = null;
  /**
   * Keys that answered the last `syncAssignments`, so a claim can be told from a
   * memory of one. `null` until the display service has reported even once, and
   * that case deliberately keeps the older, stricter behaviour: an unknown
   * display set must not silently switch the guard off.
   */
  private presentKeyCache: { keys: Set<string>; bases: Set<string> } | null = null;
  /** Desktops torn off the taskbar into their own window, so they count as owned. */
  private spawned = new Set<DesktopIndex>();

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
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<DesktopLayoutStoreSchema> & {
        /** v1/v2 shape — a record keyed 0/1, replaced by `desktops` in v3. */
        viewports?: Record<number, unknown>;
      };
      const seed = seedStore();
      const fromVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1;

      // v2 -> v3: `viewports: {0,1}` becomes the `desktops` list. Read whichever
      // key this file carries; a v3 file has `desktops`, older ones `viewports`.
      const rawDesktops: unknown[] = Array.isArray(parsed.desktops)
        ? parsed.desktops
        : [parsed.viewports?.[0], parsed.viewports?.[1]];

      const desktops = rawDesktops
        .slice(0, MAX_DESKTOPS)
        .map((raw, index) =>
          index === DESKTOP_CITY
            ? stripNoctisFromLayout(this.normalizeLayout(raw, index))
            : this.normalizeLayout(raw, index),
        );
      // Never fewer than the seeded pair — Study and City must always exist.
      while (desktops.length < DESKTOP_COUNT) desktops.push(seedLayout(desktops.length));

      const activeRaw = parsed.activeDesktopIndex;
      const next: DesktopLayoutStoreSchema = {
        schemaVersion: DESKTOP_LAYOUT_SCHEMA_VERSION,
        activeDesktopIndex:
          typeof activeRaw === 'number' && activeRaw >= 0 && activeRaw < desktops.length
            ? Math.floor(activeRaw)
            : DESKTOP_STUDY,
        globalZTop: typeof parsed.globalZTop === 'number' ? parsed.globalZTop : seed.globalZTop,
        desktops,
        assignments: Array.isArray(parsed.assignments)
          ? ((parsed.assignments.map(sanitizeAssignment).filter(Boolean) as DisplayAssignment[])
              // Simulated displays do not survive a restart, so neither should
              // their configuration — see SIMULATED_DISPLAY_KEY_PREFIX.
              .filter((a) => !isSimulatedDisplayKey(a.displayKey)))
          : [],
      };

      let dirty = fromVersion < DESKTOP_LAYOUT_SCHEMA_VERSION;

      // One-time: strip auto-seeded app tiles when moving to pin-from-start (v2).
      if (fromVersion < 2) {
        for (const layout of next.desktops) {
          const cleaned = migrateIconsToPinFromStart(layout.icons);
          if (cleaned.length !== layout.icons.length) {
            layout.icons = cleaned;
            layout.layoutEpoch += 1;
            dirty = true;
          }
        }
      }

      const rawCity = this.normalizeLayout(rawDesktops[DESKTOP_CITY], DESKTOP_CITY);
      const migratedCity = stripNoctisFromLayout(rawCity);
      if (
        rawCity.icons.length !== migratedCity.icons.length ||
        rawCity.windows.length !== migratedCity.windows.length
      ) {
        // Re-apply noctis strip on the already-migrated city viewport.
        next.desktops[DESKTOP_CITY] = stripNoctisFromLayout(next.desktops[DESKTOP_CITY]);
        next.desktops[DESKTOP_CITY].layoutEpoch += 1;
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
    const dim = (k: string): number | undefined => {
      const value = raw[k];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
      return Math.round(value);
    };
    return {
      desktopIndex,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : defaultDesktopName(desktopIndex),
      authoredW: dim('authoredW'),
      authoredH: dim('authoredH'),
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
      // Wire name stays `viewports` — see DesktopLayoutSnapshot in shared/desktop.ts.
      viewports: this.schema.desktops.map((layout) => clone(layout)),
      assignments: this.schema.assignments.map((a) => ({ ...a })),
      globalZTop: this.schema.globalZTop,
      switching: this.switching,
    };
  }

  /** Desktops currently in the store. Callers index into `snapshot().viewports`. */
  desktopCount(): number {
    return this.schema.desktops.length;
  }

  private ensureDesktop(index: DesktopIndex): DesktopLayout {
    while (this.schema.desktops.length <= index && this.schema.desktops.length < MAX_DESKTOPS) {
      this.schema.desktops.push(seedLayout(this.schema.desktops.length));
    }
    return this.schema.desktops[index] ?? this.schema.desktops[DESKTOP_STUDY];
  }

  /**
   * A desktop index no shell is currently showing, creating it if needed.
   *
   * "Free" means neither the desktop the main window is on nor one assigned to a
   * display. Tearing an app off the taskbar needs somewhere to put it that no
   * other shell already owns — reusing an owned desktop would put two writers on
   * one layout (B2) and each would rewrite the other's geometry.
   *
   * Returns null when every desktop slot is spoken for, which the caller must
   * surface rather than silently reusing one.
   */
  allocateDesktop(): DesktopIndex | null {
    const taken = new Set<number>([this.schema.activeDesktopIndex]);
    for (const assignment of this.schema.assignments) taken.add(assignment.desktopIndex);
    for (const index of this.spawned) taken.add(index);

    const claim = (index: DesktopIndex): DesktopIndex => {
      this.ensureDesktop(index);
      this.spawned.add(index);
      this.persist();
      this.broadcast();
      return index;
    };

    // Prefer a free desktop that is already empty: the caller puts exactly one
    // app on it, so handing back a desktop with the user's windows on it would
    // either destroy them or contradict "only that app".
    for (let index = 0; index < this.schema.desktops.length; index += 1) {
      if (taken.has(index)) continue;
      if ((this.schema.desktops[index]?.windows.length ?? 0) === 0) return claim(index);
    }

    // Otherwise grow a brand-new one, which is empty by construction.
    if (this.schema.desktops.length < MAX_DESKTOPS) return claim(this.schema.desktops.length);

    // Every desktop is either owned or has content. Say so rather than
    // silently reusing one and wiping it.
    return null;
  }

  /** Release a torn-off desktop so its index can be reused. */
  releaseDesktop(index: DesktopIndex): void {
    this.spawned.delete(index);
  }

  /**
   * Reconcile stored assignments against the displays that actually exist.
   *
   * Absent displays keep their assignment — the user unplugged a monitor, they
   * did not reset its configuration. New displays get one desktop each, taking
   * the lowest index not already claimed, creating desktops as needed.
   */
  syncAssignments(present: { key: string; primary: boolean; virtual?: boolean }[]): DesktopLayoutSnapshot {
    let dirty = false;
    const claimed = new Set(this.schema.assignments.map((a) => a.desktopIndex));

    /*
     * A stored key nothing currently answers to.
     *
     * Mirrors `resolveDisplayKey`'s first two tiers — exact key, then base key
     * ignoring the `#n` positional suffix — so "stale" here means exactly what
     * "absent" means everywhere else. `primary` and simulated keys are never
     * stale: the first always resolves, the second is stripped on load.
     */
    const presentKeys = new Set(present.map((d) => d.key));
    const presentBases = new Set(present.map((d) => d.key.split('#')[0]));
    this.presentKeyCache = { keys: presentKeys, bases: presentBases };
    const isStaleKey = (key: string): boolean => !this.isDisplayAttached(key);

    const unmatched = present.filter(
      (d) => !this.schema.assignments.some((a) => a.displayKey === d.key),
    );
    const adoptedKeys = new Set<string>();

    for (const display of present) {
      if (this.schema.assignments.some((a) => a.displayKey === display.key)) continue;

      /*
       * Adopt this panel's previous assignment when its key changed underneath
       * it, rather than handing it a fresh default row.
       *
       * `baseDisplayKey` is `label|WxH|scale`. It deliberately excludes
       * `bounds.x/y` so rearranging monitors keeps their settings — but the
       * resolution IS in the key, so *changing a monitor's resolution* silently
       * orphans everything the user configured for it and leaves a dead row
       * holding a desktop index. Observed live 2026-08-17: one physical panel
       * held two assignments, `vdd-by-mtt|800x600|1` and
       * `vdd-by-mtt|1920x1080|1`, inside a single session.
       *
       * A label is weaker than a key — two identical panels share one — so this
       * only fires on an unambiguous 1:1 match: exactly one unmatched display
       * with this label, and exactly one stale stored row with it. Anything
       * less specific falls through to a fresh row, which is the safe default.
       * The old key is not kept: rekeying is what stops the orphan accumulating.
       */
      const label = displayLabelOfKey(display.key);
      const peers = unmatched.filter((d) => displayLabelOfKey(d.key) === label);
      const stale = this.schema.assignments.filter(
        (a) =>
          isStaleKey(a.displayKey) &&
          !adoptedKeys.has(a.displayKey) &&
          displayLabelOfKey(a.displayKey) === label,
      );
      if (label && peers.length === 1 && stale.length === 1) {
        const row = stale[0];
        adoptedKeys.add(row.displayKey);
        row.displayKey = display.key;
        // The user's own index for this panel is kept — unless it is the one the
        // main window is showing, which is the two-shells-one-desktop break the
        // fresh-row path below guards against at length. Re-home rather than
        // refuse, so the rest of their configuration still survives.
        const isMain = this.mainDisplayKey != null && display.key === this.mainDisplayKey;
        if (!isMain && row.desktopIndex === this.schema.activeDesktopIndex) {
          claimed.delete(row.desktopIndex);
          let free = 0;
          while (
            (claimed.has(free) || free === this.schema.activeDesktopIndex) &&
            free < MAX_DESKTOPS - 1
          ) {
            free += 1;
          }
          row.desktopIndex = free;
        }
        claimed.add(row.desktopIndex);
        this.ensureDesktop(row.desktopIndex);
        dirty = true;
        continue;
      }

      /*
       * A secondary display must never be handed the desktop the MAIN window is
       * currently showing.
       *
       * `switchDesktop` already refuses to move main ONTO a secondary's desktop,
       * but nothing guarded the reverse until now, and the reverse is the case
       * that actually happens: the user switches main to Desktop 2, *then*
       * attaches a monitor (or turns simulation on), and the new display is
       * handed the lowest unclaimed index — which is the one main is on.
       *
       * Two shells then own one desktop, breaking the single-writer rule (B2).
       * They do not merely race: each hydrates the shared layout into its own
       * viewport and commits the result, so a 1920-wide arrangement viewed on a
       * 960-wide monitor is persisted back at 960 and the big monitor's
       * arrangement is destroyed. Observed live 2026-08-07 — desktop 1's windows
       * went 1920x1009 -> 960x686 permanently.
       */
      const isMainDisplay = this.mainDisplayKey != null && display.key === this.mainDisplayKey;
      const reserved = new Set(claimed);
      if (!isMainDisplay) reserved.add(this.schema.activeDesktopIndex);

      let desktopIndex = display.primary ? DESKTOP_STUDY : -1;
      if (desktopIndex < 0 || reserved.has(desktopIndex)) {
        desktopIndex = 0;
        while (reserved.has(desktopIndex) && desktopIndex < MAX_DESKTOPS - 1) desktopIndex += 1;
      }
      claimed.add(desktopIndex);
      this.ensureDesktop(desktopIndex);
      this.schema.assignments.push({
        displayKey: display.key,
        desktopIndex,
        ...DEFAULT_ASSIGNMENT,
        // A newly attached *physical* monitor opening a full-screen desktop
        // window unprompted would be a hostile default, so only the primary is
        // enabled on first sight and the user turns the rest on in
        // Settings > Monitors.
        //
        // A *simulated* display is the exception, and enabling it is the whole
        // point: the user switched simulation on explicitly, and it exists only
        // to render a second desktop beside the first. Leaving it off meant
        // turning simulation on appeared to do nothing at all.
        enabled: display.primary || display.virtual === true,
      });
      dirty = true;
    }

    if (dirty) {
      this.persist();
      this.broadcast();
    }
    return this.snapshot();
  }

  setAssignment(patch: Partial<DisplayAssignment> & { displayKey: string }): DesktopLayoutSnapshot {
    const existing = this.schema.assignments.find((a) => a.displayKey === patch.displayKey);
    if (existing) {
      const merged = sanitizeAssignment({ ...existing, ...patch });
      if (merged) Object.assign(existing, merged);
    } else {
      const created = sanitizeAssignment({
        ...DEFAULT_ASSIGNMENT,
        desktopIndex: DESKTOP_STUDY,
        ...patch,
      });
      if (created) this.schema.assignments.push(created);
    }
    const target = this.schema.assignments.find((a) => a.displayKey === patch.displayKey);
    if (target) this.ensureDesktop(target.desktopIndex);
    this.persist();
    this.broadcast();
    return this.snapshot();
  }

  renameDesktop(index: DesktopIndex, name: string): DesktopLayoutSnapshot {
    const layout = this.schema.desktops[index];
    if (layout) {
      layout.name = name.trim().slice(0, 40) || defaultDesktopName(index);
      layout.layoutEpoch += 1;
      this.persist();
      this.broadcast();
    }
    return this.snapshot();
  }

  /** Forget every per-display setting; desktops and their contents are untouched. */
  resetAssignments(): DesktopLayoutSnapshot {
    this.schema.assignments = [];
    this.persist();
    this.broadcast();
    return this.snapshot();
  }

  migrateLegacy(payload: LegacyDesktopPayload): DesktopLayoutSnapshot {
    const next = this.schema.desktops[DESKTOP_STUDY];
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
    const index = payload.desktopIndex;
    if (typeof index !== 'number' || index < 0 || index >= MAX_DESKTOPS) {
      return { ok: false, error: 'invalid-desktop-index' };
    }
    // The slide only animates the MAIN window, between two specific desktops.
    // A secondary window committing an unrelated desktop mid-slide is not a
    // race, and refusing it would silently drop the user's edit.
    if (this.switching && (index === this.switchFrom || index === this.switchTo)) {
      return { ok: false, error: 'desktop-switch-in-progress' };
    }
    this.ensureDesktop(index);
    const previous = this.schema.desktops[index];
    const nextLayout = this.normalizeLayout(payload.layout, index);
    // A commit carries geometry only; the name is owned by renameDesktop.
    nextLayout.name = previous?.name ?? defaultDesktopName(index);
    // Epochs belong to main. An echoed snapshot (including an older epoch) is
    // not a layout edit and must not write/broadcast again: a synchronous
    // Windows rename here was observed blocking the main loop for 1.22 s.
    nextLayout.layoutEpoch = previous.layoutEpoch;
    if (JSON.stringify(nextLayout) === JSON.stringify(previous)) return { ok: true };
    this.schema.desktops[index] = nextLayout;
    this.schema.desktops[index].layoutEpoch += 1;
    this.schema.globalZTop = Math.max(
      this.schema.globalZTop,
      ...this.schema.desktops[index].windows.map((win) => win.z),
      0,
    );
    this.persist();
    this.broadcast();
    return { ok: true };
  }

  /**
   * Desktop the MAIN window may switch to.
   *
   * A desktop hosted by an enabled secondary display is off-limits: if the main
   * window also showed it, two shells would own one desktop and each would
   * treat the other's commit as a foreign edit — the B2 ping-pong. Ownership is
   * disjoint by construction, so it never arises.
   */
  /**
   * True when this key currently maps to a connected display.
   *
   * Same three tiers `resolveDisplayKey` uses — exact key, base key ignoring the
   * `#n` positional suffix, then the primary alias — so "attached" here means
   * exactly what "absent" means everywhere else in the module. Before the
   * display service has reported once the cache is `null` and every key reads as
   * attached, which keeps the pre-existing behaviour rather than opening the
   * guard during startup.
   */
  private isDisplayAttached(key: string): boolean {
    if (key === PRIMARY_DISPLAY_KEY || isSimulatedDisplayKey(key)) return true;
    const cache = this.presentKeyCache;
    if (!cache) return true;
    return cache.keys.has(key) || cache.bases.has(key.split('#')[0]);
  }

  /**
   * A desktop is claimed only by a secondary shell that CAN exist right now.
   *
   * An assignment deliberately outlives its monitor (`resolveDisplayKey`: "the
   * user unplugged a monitor, they did not reset its configuration"), and
   * `syncDesktopWindows` only ever builds windows for displays in
   * `listDisplays()`. Without the presence test the two disagreed, and the
   * disagreement was a one-way door: the guard reads only the TARGET, so the
   * shell happily let the user LEAVE a desktop whose display had been unplugged
   * and then refused every attempt to return, stranding that desktop's windows,
   * icons, notes and widgets with no way back. Measured live 2026-08-31 on a
   * single-monitor machine holding six assignment rows from earlier sessions:
   * `display|1920x1080|1` still held desktop 0 `enabled`, no display answered
   * it, no secondary window existed for it, and `switchDesktop(0)` returned
   * `desktop-on-another-display` forever.
   */
  private isDesktopClaimedBySecondary(index: DesktopIndex): boolean {
    return this.schema.assignments.some(
      (a) =>
        a.enabled &&
        a.desktopIndex === index &&
        a.displayKey !== this.mainDisplayKey &&
        this.isDisplayAttached(a.displayKey),
    );
  }

  /** Told by `desktopWindows.ts` which display the main window sits on. */
  setMainDisplayKey(key: string | null): void {
    this.mainDisplayKey = key;
  }

  switchDesktop(targetIndex: DesktopIndex): { ok: boolean; error?: string; snapshot: DesktopLayoutSnapshot } {
    if (
      typeof targetIndex !== 'number' ||
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= this.schema.desktops.length
    ) {
      return { ok: false, error: 'invalid-desktop-index', snapshot: this.snapshot() };
    }
    if (this.isDesktopClaimedBySecondary(targetIndex)) {
      return { ok: false, error: 'desktop-on-another-display', snapshot: this.snapshot() };
    }
    if (this.schema.activeDesktopIndex === targetIndex) {
      return { ok: true, snapshot: this.snapshot() };
    }
    this.switching = true;
    this.switchFrom = this.schema.activeDesktopIndex;
    this.switchTo = targetIndex;
    this.broadcast();
    if (this.switchTimer) clearTimeout(this.switchTimer);
    this.switchTimer = setTimeout(() => {
      this.schema.activeDesktopIndex = targetIndex;
      this.switching = false;
      this.switchFrom = null;
      this.switchTo = null;
      this.persist();
      this.broadcast();
    }, SLIDE_DURATION_MS);
    return { ok: true, snapshot: this.snapshot() };
  }
}

/**
 * Constructed on FIRST USE, never at module scope.
 *
 * The constructor calls `load()`, which resolves `desktopStorePath()` against
 * `app.getPath('userData')`. `main.ts` redirects that path for
 * `JP_USER_DATA_DIR` at line 142 — but an ES import is evaluated before any
 * statement in the importing module, so an eager `new DesktopStore()` read the
 * REAL profile while every later `persist()` wrote the redirected one.
 *
 * Measured live 2026-09-01: a genuinely empty userData (0 entries before
 * launch, `[main] JP_USER_DATA_DIR -> userData = …` in the log) came up
 * holding the real profile's eight desktops, its `aurora` City wallpaper and
 * its `wgt-mrmkpxj7-tpja` mini-player — while `profiles.json` beside it was
 * correctly seeded, which is what named this module as the single cause.
 *
 * The read half is the visible symptom; the write half is the reason this is
 * worth a comment. `load()` calls `atomicWriteJson(filePath, next)` whenever
 * the file needs a schema migration, and at import time `filePath` is the real
 * profile — so a scratch-profile run could rewrite the 8.6 GB profile that has
 * no restore point. Never make this eager again.
 */
let store: DesktopStore | null = null;

/** The layout store, for `desktopWindows.ts` and `deskDrag.ts`. */
export function desktopStore(): DesktopStore {
  if (!store) store = new DesktopStore();
  return store;
}

export function registerDesktopIpc(): void {
  ipcMain.handle('desktop:getLayout', () => desktopStore().snapshot());
  ipcMain.handle('desktop:commitLayout', (_e, payload: CommitLayoutPayload) =>
    desktopStore().commitLayout(payload),
  );
  ipcMain.handle('desktop:switch', (_e, payload: { targetIndex: DesktopIndex }) =>
    desktopStore().switchDesktop(payload?.targetIndex ?? DESKTOP_STUDY),
  );
  ipcMain.handle('desktop:migrateLegacy', (_e, payload: LegacyDesktopPayload) =>
    desktopStore().migrateLegacy(payload ?? {}),
  );
  ipcMain.handle('desktop:setAssignment', (_e, patch: Partial<DisplayAssignment> & { displayKey: string }) =>
    desktopStore().setAssignment(patch),
  );
  ipcMain.handle('desktop:renameDesktop', (_e, payload: { index: DesktopIndex; name: string }) =>
    desktopStore().renameDesktop(payload?.index ?? DESKTOP_STUDY, payload?.name ?? ''),
  );
  ipcMain.handle('desktop:resetAssignments', () => desktopStore().resetAssignments());
}
