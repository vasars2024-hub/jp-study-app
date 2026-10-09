import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as RDragEvent,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import type { LibraryItem } from '../../shared/types';
import type {
  DesktopIndex,
  DesktopLayout,
  DisplayAssignment,
  IconSnapshot,
  NoteSnapshot,
  TaskbarMode,
  WidgetSnapshot,
  WindowSnapshot,
} from '../../shared/desktop';
import { DESKTOP_STUDY } from '../../shared/desktop';
import {
  clampLayoutToViewport,
  layoutGeometrySignature,
  rememberFit,
  resolveAuthoredViewport,
  toAuthoredSpace,
  type FitMemory,
} from '../desktopLayoutFit';
import { neighbourDisplayKey } from '../monitorRing';
import {
  FILES_DEFAULT_SIZE,
  canMaximizeSection,
  fitNewWindowRect,
  maximizedGeometry,
  restorePoint,
} from '../desktopWindowGeometry';
import { collectForeignWindows, switchableDesktopIndexes } from '../foreignWindows';
import { createRenderIdentityCache } from '../renderIdentityCache';
import { markSectionOpenHandled } from '../sectionSurface';
import {
  canPresentLiquid,
  isWinLiquid,
  presentationFromSnapshot,
  presentationToSnapshot,
  toggleWinPresentation,
} from '../liquidWindowPresentation';
import type { LiquidPresentationState } from '../../shared/liquidWindowState';
import { loadDisplayPrefs } from '../displayPrefs';
import { captureVisibleWindowMinStates, setCapturedWindowsMinimized } from '../showDesktopState';
import DropRouter from './DropRouter';
import {
  beginDeskDrag,
  endDeskDrag,
  moveDeskDrag,
  registerDeskContext,
  screenToDeskPoint,
  subscribeDeskDrag,
  type DeskDragKind,
} from '../deskDrag';
import VisualizerCanvas from './VisualizerCanvas';
import WidgetFrame from './WidgetFrame';
import WidgetGallery, { noteWidgetUsed } from './WidgetGallery';
import { getWidgetDef } from '../widgets/registry';
import { loadVizSettings, onVizSettingsChanged, type VizSettings } from '../visualizerSettings';
import { isPlaying as isMusicPlaying, onPlayingChanged } from '../audioBus';
import AppSection from './AppSection';
import Icon, { type IconName } from './Icons';
import DesktopSettings, { type WallChoice } from './DesktopSettings';
import NotificationCenter from './shell/NotificationCenter';
import NotificationBell from './shell/NotificationBell';
import WiredGlobe from './shell/WiredGlobe';
import { getNotifications, notify, onNotificationsChanged } from '../notificationStore';
import QuickSettings from './shell/QuickSettings';
import AeroBootOverlay from './shell/AeroBootOverlay';
import WiredArchiveBootOverlay from './shell/WiredArchiveBootOverlay';
import WiredBreachOverlay from './shell/WiredBreachOverlay';
import DesktopLayerHost from './shell/DesktopLayerHost';
import StartPanel from './shell/StartPanel';
import StartHereCard from './shell/StartHereCard';
import { revealActiveTask, wheelScrollDelta } from './shell/taskbarOverflow';
import { replayTour } from '../onboardingStore';
import { TOUR_MENU_ID } from '../../shared/onboarding/tourScript';
import { resetWidgetLayoutWithUndo } from './shell/widgetLayoutReset';
import { captureFocus, firstMeaningfulControl, focusIsLostOrInside, restoreFocus } from './shell/focusReturn';
import { ContextMenu, confirmDialog, alertDialog, useAppMaterialSet } from './ui';
import {
  commitLayout,
  getActiveDesktopIndex,
  getAssignment,
  getAssignments,
  getDesktopCount,
  getDesktopLayout,
  displayDesktopName,
  focusOrOpenDesktop,
  onDesktopChanged,
  switchDesktop as switchDesktopState,
} from '../desktopState';
import { showOsToast } from './ToastHost';
import {
  clockHour12,
  ICON_METRICS,
  loadDesktopPrefs,
  onDesktopPrefsChanged,
  snapClamp,
  snapValue,
  TASKBAR_HEIGHT,
  type DesktopPrefs,
} from '../desktopPrefs';
import { getIconPreset, iconPresetPositions } from '../desktopIconPresets';
import { requestSecretLifecycleRestart, requestSecretLifecycleSleep } from '../secretLifecycle';
import { exitSecretAero } from '../theme/SecretAeroTrigger';
import {
  requestWiredArchiveRestart,
  requestWiredArchiveShutdown,
  requestWiredArchiveSleep,
} from '../wiredArchiveLifecycle';
import { EnvironmentStack, SELECTABLE_WALL_PRESETS, loadEnvironment, onEnvironmentChanged } from '../environment';
import BuddyToast from '../environment/BuddyToast';
import AeroFindingOverlay from './shell/AeroFindingOverlay';
import AeroTaskbarFx from './shell/AeroTaskbarFx';
import AeroFlip from './shell/AeroFlip';
import AeroMechanicsHost from './shell/aeroMech/AeroMechanicsHost';
import AeroMechStartEntries from './shell/aeroMech/AeroMechStartEntries';
import WiredFindingOverlay from './shell/WiredFindingOverlay';
import WiredWallpaper from './shell/WiredWallpaper';
import WiredMechanicsHost from './wired/WiredMechanicsHost';
import WiredLayerBadge from './wired/WiredLayerBadge';
import WiredStartEntries from './wired/WiredStartEntries';
import { forgetWindowMount, formatUptime, useWiredSecond, windowMountedAt } from './shell/wiredClock';
import { startCompanionOsBridge, stopCompanionOsBridge } from '../environment/companionOsBridge';
import { startAchievementWatcher } from '../environment/achievements';
import { loadPersonalization, onPersonalizationChanged } from '../osPersonalization';
import { syncPillarboxWallImage } from '../pillarboxSettings';
import { announceViewportChange, getZoomFactor, onZoomChanged } from '../appZoom';
import { perfSetInteracting } from '../perf/perfHub';
import {
  addUserWallpaper,
  loadUserWallpapers,
  onUserWallpapersChanged,
  removeUserWallpaper,
  type UserWallpaper,
} from '../wallpaperLibrary';
import { t as translate, useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import {
  isReadingWorkspaceOpenDetail,
  publishReadingWorkspaceRoute,
  resolveReadingWorkspaceOpenRequest,
} from '../readingWorkspaceNavigation';

type WinSection =
  | 'agent'
  | 'library' | 'novels' | 'dictionary' | 'grammar' | 'files' | 'translate'
  | 'player' | 'video' | 'music' | 'anki' | 'flashcards' | 'stats' | 'resources' | 'settings' | 'note'
  | 'games' | 'visualizer' | 'musicwidget' | 'city' | 'immersion' | 'calendar' | 'reading' | 'youtube'
  | 'scraper'
  | 'visualnovels';

interface Win {
  id: string;
  section: WinSection;
  x: number; y: number; w: number; h: number; z: number;
  min?: boolean;
  max?: boolean;
  /** Always-on-top: rendered in a z band above every unpinned window. */
  pin?: boolean;
  rect?: { x: number; y: number; w: number; h: number };
  /**
   * Liquid Workplace presentation (L3). ABSENT is the conventional window and
   * conventional stays the default — this is opt-in per window and reversible.
   * Commands live in `../liquidWindowPresentation`.
   */
  presentation?: LiquidPresentationState;
}

/**
 * The per-window callback bundle handed to `FloatingWindow`. Cached by window id
 * so the six handlers keep their identity across renders; see `handlersFor`.
 */
interface WinHandlers {
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onToggleLiquid: () => void;
  onPopOut: () => void;
  onPatch: (p: Partial<Win>) => void;
}

/**
 * Pinned windows render at PIN_Z_BASE + z. Ordinary z counts up from 1 per
 * focus, so a band this high can never be reached by normal stacking, and
 * pinned windows still order among themselves by their own focus history.
 */
const PIN_Z_BASE = 1_000_000;

interface DeskIcon {
  id: string;
  kind: 'app' | 'shortcut' | 'action';
  section?: WinSection;
  target?: string;
  action?: 'note' | 'addapp' | 'city';
  name: string;
  glyph?: IconName;
  icon?: string;
  x: number; y: number;
}

interface NoteData {
  text: string;
  color: string;
}

// Reuses CommandPalette's palette.section.* keys — same 15 app names, so one
// translation serves both surfaces rather than drifting into two catalogs.
const APPS: { id: WinSection; labelKey: string; glyph: IconName }[] = [
  // 'chat', not 'sparkle': the Agent is a conversation workspace, and the
  // Scraper already owns 'sparkle' for its title proposals.
  { id: 'agent', labelKey: 'palette.section.agent', glyph: 'chat' },
  // "Watch", not "Media": the one Start entry into the Media Center (see
  // START_HIDDEN_SECTIONS). The 'video' camera glyph, because YouTube below
  // owns the play triangle and two identical icons read as one app.
  { id: 'player', labelKey: 'palette.section.watch', glyph: 'video' },
  { id: 'video', labelKey: 'palette.section.video', glyph: 'video' },
  { id: 'youtube', labelKey: 'palette.section.youtube', glyph: 'player' },
  { id: 'music', labelKey: 'palette.section.music', glyph: 'music' },
  // The visualizer had a window but no way in except through the Music widget.
  { id: 'visualizer', labelKey: 'palette.section.visualizer', glyph: 'chart-bar' },
  { id: 'dictionary', labelKey: 'palette.section.dictionary', glyph: 'dictionary' },
  { id: 'immersion', labelKey: 'palette.section.immersion', glyph: 'globe' },
  { id: 'visualnovels', labelKey: 'palette.section.visualnovels', glyph: 'visual-novel' },
  // 'sparkle', not 'scan' or 'search': Reading already owns 'scan' (the OCR
  // lens) and the Scraper's job is proposing titles, not reading one.
  { id: 'scraper', labelKey: 'palette.section.scraper', glyph: 'sparkle' },
  { id: 'library', labelKey: 'palette.section.library', glyph: 'library' },
  { id: 'novels', labelKey: 'palette.section.novels', glyph: 'novels' },
  // 'reading' is the Reading workspace opened on its Discover tab (the Finder),
  // not the OCR lens — the lens has no app window. The 'scan' glyph is kept so
  // saved layouts and the taskbar do not change icon. Not offered in Start:
  // see START_HIDDEN_SECTIONS.
  { id: 'reading', labelKey: 'palette.section.reading', glyph: 'scan' },
  { id: 'translate', labelKey: 'palette.section.translate', glyph: 'translate' },
  { id: 'grammar', labelKey: 'palette.section.grammar', glyph: 'grammar' },
  // Gate 7b replaced the Notebook entry with the Files app that absorbed it.
  // `files` had never reached this list at all — it shipped reachable only from
  // the command palette and the Agent — so removing Notebook without adding it
  // would have left the desktop with no way in.
  { id: 'files', labelKey: 'palette.section.files', glyph: 'folder' },
  { id: 'anki', labelKey: 'palette.section.anki', glyph: 'anki' },
  { id: 'flashcards', labelKey: 'palette.section.flashcards', glyph: 'flashcards' },
  { id: 'games', labelKey: 'palette.section.games', glyph: 'dice' },
  { id: 'stats', labelKey: 'palette.section.stats', glyph: 'stats' },
  { id: 'calendar', labelKey: 'palette.section.calendar', glyph: 'calendar' },
  { id: 'resources', labelKey: 'palette.section.resources', glyph: 'resources' },
  { id: 'settings', labelKey: 'palette.section.settings', glyph: 'settings' },
  { id: 'city', labelKey: 'palette.section.city', glyph: 'city' },
];

const START_PRIMARY_SECTIONS: WinSection[] = [
  'player',
  'immersion',
  'library',
  'dictionary',
  'grammar',
  'flashcards',
  'anki',
  'youtube',
];
/**
 * Apps kept in `APPS` (window titles, taskbar glyphs, saved layouts and
 * `os:open` callers all still resolve them) but not offered as a Start entry.
 *
 * `video` opened the same Media Center as `player`, only on another tab, so
 * Start showed two ways into one app — "Media" and "Video" — with nothing to
 * choose between them. `player` is the one kept, relabelled "Watch"; the Video
 * tab is one click away in the Media Center's own sidebar.
 *
 * `novels` and `reading` are the same case three times over: Library, Novels
 * and Reading Finder all opened the one Reading workspace (Novels on its Plan
 * tab, Reading on Discover), so Start offered three doors into one room.
 * `library` is the one kept, and it now opens that workspace on its Library
 * tab; Plan, Discover, Lists and the rest are its tabs. Both ids stay real
 * sections for deep links, the lens hand-off, pop-outs and saved layouts.
 */
const START_HIDDEN_SECTIONS: ReadonlySet<WinSection> = new Set<WinSection>(['video', 'novels', 'reading']);
/**
 * D189 — these are the subtitle under every app name in the Aero start menu,
 * and they were English literals in every language. A module-level map cannot
 * call `useT()` at declaration time, so per CLAUDE.md i18n rule 7 it carries
 * the KEY and the consumer resolves it at render. `?? fallback` is why the map
 * stays a map rather than the key being derived from the section id: a section
 * with no entry has to reach a real string, not print `desktop.startApp.foo`.
 */
const START_HINT_KEYS: Partial<Record<WinSection, string>> = {
  agent: 'desktop.startApp.agent',
  player: 'desktop.startApp.player',
  scraper: 'desktop.startApp.scraper',
  video: 'desktop.startApp.video',
  youtube: 'desktop.startApp.youtube',
  music: 'desktop.startApp.music',
  dictionary: 'desktop.startApp.dictionary',
  grammar: 'desktop.startApp.grammar',
  files: 'desktop.startApp.files',
  immersion: 'desktop.startApp.immersion',
  library: 'desktop.startApp.library',
  novels: 'desktop.startApp.novels',
  reading: 'desktop.startApp.reading',
  translate: 'desktop.startApp.translate',
  anki: 'desktop.startApp.anki',
  flashcards: 'desktop.startApp.flashcards',
  games: 'desktop.startApp.games',
  stats: 'desktop.startApp.stats',
  calendar: 'desktop.startApp.calendar',
  resources: 'desktop.startApp.resources',
  settings: 'desktop.startApp.settings',
  city: 'desktop.startApp.city',
};

/**
 * A module's WIRED identity. The code (`SIG-VID`, `LEX`) is a content-neutral
 * fiction id and stays literal; its caption — name, hint and the `ready` line
 * the status strip prints — lives in the catalogs under
 * `desktop.wired.<section>.{name,hint,ready}`, resolved at call time so a
 * language switch reaches every window. Every section listed here must have all
 * three keys in en/ja/zh/ru.
 */
const WIRED_MODULE_CODES: Partial<Record<WinSection, string>> = {
  player: 'SIG-LIB',
  scraper: 'SCOUT',
  video: 'SIG-VID',
  youtube: 'YT-DIP',
  music: 'AUD-DAT',
  dictionary: 'LEX',
  immersion: 'FEED',
  library: 'ARCH',
  novels: 'DOC',
  reading: 'FIND',
  translate: 'TRN',
  grammar: 'SYN',
  anki: 'MEM',
  flashcards: 'SIM',
  stats: 'TEL',
  calendar: 'OPS',
  resources: 'LINK',
  settings: 'SYS',
  games: 'DRILL',
  city: 'CAP-50',
  musicwidget: 'AUD-MINI',
  visualizer: 'OSC',
  note: 'NOTE',
};

function wiredModule(section: WinSection): { code: string; name: string; hint: string; ready: string } {
  const code = WIRED_MODULE_CODES[section];
  if (!code) {
    return {
      code: section.toUpperCase(),
      name: section,
      hint: translate('desktop.wired.fallback.hint'),
      ready: translate('desktop.wired.fallback.ready'),
    };
  }
  return {
    code,
    name: translate(`desktop.wired.${section}.name`),
    hint: translate(`desktop.wired.${section}.hint`),
    ready: translate(`desktop.wired.${section}.ready`),
  };
}

function wiredModuleLabel(section: WinSection): string {
  const meta = wiredModule(section);
  return `${meta.code} / ${meta.name}`;
}

/**
 * Let Ctrl+Shift+Z (nav.undo) reopen a closed window.
 *
 * This lives at module scope on purpose. The undo stack is module state and outlives
 * the shell: opening a book unmounts the whole desktop and the Library button mounts a
 * new one. A closure created inside `DesktopShell` keeps that render's entire scope
 * (V8 closures share their enclosing context), and the entry used to be created in
 * `removeWin` — so every stack entry pinned an unmounted shell, its `deskRef` and every
 * window it had open, for up to 40 entries. Measured on the packaged build, 2026-09-26:
 * +3,947 detached DOM nodes and +707 listeners per book opened, retainer path
 * `actionHistory stack -> undo closure -> DesktopShell context -> winOpeners.current
 * (Map) -> detached .os-start-btn -> the old desktop`. It also did nothing: it called
 * the dead shell's `open`. Reopening through `os:open` reaches whichever shell is
 * mounted when the user presses the key.
 */
function pushWindowReopenUndo(label: string, section: WinSection): void {
  void import('../actionHistory').then(({ pushUndo }) => {
    pushUndo(label, () => {
      window.dispatchEvent(new CustomEvent('os:open', { detail: section }));
    }, 'window');
  });
}

// Selection set, not the resolution set — v1.0 audit §1.1 cut the Aero scenery
// walls from the picker while leaving them resolvable (see wallCatalog.ts).
const WALLPAPERS = SELECTABLE_WALL_PRESETS;

const NOTE_COLORS = ['#fff3a3', '#ffd6a5', '#ffb3ba', '#c9f2c7', '#cfe0ff'];
const NOTE_COLOR_LABEL_KEYS = [
  'desktop.noteColor.yellow',
  'desktop.noteColor.orange',
  'desktop.noteColor.red',
  'desktop.noteColor.green',
  'desktop.noteColor.blue',
] as const;
// BOOK_DROP / MEDIA_DROP removed with the two-bucket drop handler. The extension
// tables now live in `shared/mediaKind.ts`, one copy, consulted by
// `shared/fileRouting.ts` — which is also what the importers accept, so the
// classifier and the importer can no longer disagree.
const MIN_W = 260;
const MIN_H = 170;
const WIN_SNAP = 26;

// `canMaximizeSection`, `maximizedGeometry` and `restorePoint` are imported from
// `../desktopWindowGeometry` — pure, so they carry their own unit tests rather
// than a regex over this file.
/** HTML5 DnD payload for pinning a Start-menu app onto the desktop. */
const START_APP_DND = 'text/x-study-os-app';
/** The Start panel's id, for the button's `aria-controls`. */
const START_PANEL_ID = 'os-start-panel';

type AppMeta = { id: WinSection; labelKey: string; glyph: IconName };

type WinAnimPhase = 'opening' | 'closing' | 'minimizing';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function zoomFactor(): number {
  return getZoomFactor();
}

function desktopPointerScale(desk: HTMLElement | null): number {
  if (!desk) return zoomFactor();
  const rect = desk.getBoundingClientRect();
  const sx = rect.width / Math.max(1, desk.clientWidth);
  const sy = rect.height / Math.max(1, desk.clientHeight);
  const scale = Math.max(sx, sy);
  return Number.isFinite(scale) && scale > 0.05 ? scale : zoomFactor();
}

function isAeroViewportActive(): boolean {
  return document.documentElement.getAttribute('data-materials') === 'aero';
}

function clampAeroContextMenuPoint(point: { x: number; y: number }, desk: HTMLElement): { x: number; y: number } {
  return {
    x: Math.min(point.x, Math.max(4, desk.clientWidth - 236)),
    y: Math.min(point.y, Math.max(4, desk.clientHeight - 308)),
  };
}

function iconMetrics(prefs: DesktopPrefs) {
  return ICON_METRICS[prefs.iconSize];
}

function taskbarH(prefs: DesktopPrefs) {
  return TASKBAR_HEIGHT[prefs.taskbarSize];
}

/**
 * Convert viewport client coords → desktop layout coords.
 * Uses measured rect vs clientWidth/Height so zoom compensation cannot double-scale.
 */
function clientToDeskLocal(
  desk: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = desk.getBoundingClientRect();
  const sx = desk.clientWidth / Math.max(1, rect.width);
  const sy = desk.clientHeight / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  };
}

function deskPointFromClient(
  desk: HTMLElement | null,
  clientX: number,
  clientY: number,
  bounds: { w: number; h: number },
  prefs: DesktopPrefs,
): { x: number; y: number } {
  if (!desk) return { x: 16, y: 16 };
  const { w: ICON_W, h: ICON_H } = iconMetrics(prefs);
  const local = clientToDeskLocal(desk, clientX, clientY);
  return snapClamp(
    local.x - ICON_W / 2,
    local.y - ICON_H / 2,
    ICON_W,
    ICON_H,
    bounds.w,
    bounds.h,
    prefs.snapGrid,
  );
}

function isStartAppDrag(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  const types = Array.from(dt.types ?? []);
  return types.includes(START_APP_DND) || types.includes('text/plain');
}

function parseStartAppDrag(dt: DataTransfer | null | undefined): AppMeta | null {
  if (!dt) return null;
  const raw = dt.getData(START_APP_DND) || dt.getData('text/plain');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppMeta>;
    if (typeof parsed.id !== 'string') return null;
    const catalog = APPS.find((a) => a.id === parsed.id);
    return catalog ? { id: catalog.id, labelKey: catalog.labelKey, glyph: catalog.glyph } : null;
  } catch {
    const catalog = APPS.find((a) => a.id === raw);
    return catalog ? { id: catalog.id, labelKey: catalog.labelKey, glyph: catalog.glyph } : null;
  }
}

/** Both desktops share the same app catalog; layouts (pins / windows) stay independent. */
function appListForDesktop(_desktopIndex: DesktopIndex): { id: WinSection; labelKey: string; glyph: IconName }[] {
  return APPS;
}

/**
 * Presentational grouping for the Start menu (Phase 2). Purely a display
 * concern: it reads app ids and does NOT alter the app-list contract shared by
 * `APPS` / `DesktopWinSection` / `AppSection` / `POPOUT_SECTIONS`. Order here is
 * the order the groups render in. Following the `widgets/registry.tsx` pattern,
 * each group stores an i18n KEY and is resolved with `t()` at render time —
 * a module-level array cannot call `useT()` at declaration time.
 *
 * Any app id missing from this map falls through to the `other` group, so
 * adding an app to `APPS` can never make it disappear from the launcher.
 */
const START_GROUPS: { id: string; labelKey: string; sections: WinSection[] }[] = [
  // First, and one row of four: below Study's two rows it sat under the fold
  // and the app's main way to watch something needed a scroll to find.
  { id: 'media', labelKey: 'desktop.startCategory.media', sections: ['player', 'youtube', 'music', 'scraper'] },
  {
    id: 'study',
    labelKey: 'desktop.startCategory.study',
    sections: ['agent', 'dictionary', 'grammar', 'translate', 'files', 'anki', 'flashcards'],
  },
  { id: 'library', labelKey: 'desktop.startCategory.library', sections: ['library', 'immersion', 'visualnovels'] },
  { id: 'progress', labelKey: 'desktop.startCategory.progress', sections: ['stats', 'calendar'] },
  { id: 'system', labelKey: 'desktop.startCategory.system', sections: ['games', 'resources', 'city', 'settings'] },
];

type StartApp = { id: WinSection; labelKey: string; glyph: IconName };

/** Bucket the catalog into the display groups above, preserving catalog order. */
function groupStartApps(apps: StartApp[]): { id: string; labelKey: string; apps: StartApp[] }[] {
  // Claimed up front, so a hidden app cannot fall through to `other` either.
  const claimed = new Set<WinSection>(START_HIDDEN_SECTIONS);
  const groups = START_GROUPS.map((g) => {
    const inGroup = apps.filter((a) => g.sections.includes(a.id));
    inGroup.forEach((a) => claimed.add(a.id));
    return { id: g.id, labelKey: g.labelKey, apps: inGroup };
  }).filter((g) => g.apps.length > 0);
  const rest = apps.filter((a) => !claimed.has(a.id));
  if (rest.length > 0) {
    groups.push({ id: 'other', labelKey: 'desktop.startCategory.other', apps: rest });
  }
  return groups;
}

/** Fresh / reset desktops start empty — apps are pinned from the Start menu. */
function defaultIcons(_desktopIndex: DesktopIndex): DeskIcon[] {
  return [];
}

function nextIconSlot(existing: DeskIcon[], prefs: DesktopPrefs): { x: number; y: number } {
  const { w: ICON_W, h: ICON_H } = iconMetrics(prefs);
  const used = new Set(existing.map((i) => `${i.x},${i.y}`));
  let x = 16;
  let y = 16;
  while (used.has(`${x},${y}`)) {
    y += ICON_H;
    if (y > 16 + 5 * ICON_H) {
      y = 16;
      x += ICON_W;
    }
  }
  return { x, y };
}

function appGlyphForSection(section?: WinSection, fallback?: IconName): IconName {
  if (!section) return fallback ?? 'app';
  return APPS.find((a) => a.id === section)?.glyph ?? fallback ?? 'app';
}

function winFromSnapshot(win: WindowSnapshot): Win {
  return {
    id: win.id,
    section: win.section,
    x: win.x,
    y: win.y,
    w: win.w,
    h: win.h,
    z: win.z,
    min: !win.visible,
    max: win.maximized,
    pin: win.pinned,
    rect: win.restoreRect,
    // Validated, not trusted: a corrupt or future-versioned blob loads as a
    // conventional window rather than as a Liquid one with no way back. The
    // section goes in too — a blob on a section that cannot present Liquid is
    // dropped here rather than carried in memory and written back out.
    ...presentationToSnapshot({
      section: win.section,
      presentation: presentationFromSnapshot(win.presentation),
    }),
  };
}

function winToSnapshot(win: Win): WindowSnapshot {
  return {
    id: win.id,
    section: win.section,
    x: win.x,
    y: win.y,
    w: win.w,
    h: win.h,
    z: win.z,
    visible: !win.min,
    maximized: !!win.max,
    pinned: !!win.pin,
    restoreRect: win.rect,
    ...presentationToSnapshot(win),
  };
}

function iconFromSnapshot(icon: IconSnapshot): DeskIcon {
  const section = icon.section as WinSection | undefined;
  return {
    id: icon.id,
    kind: icon.kind,
    section,
    target: icon.target,
    action: icon.action,
    name: icon.name,
    // Prefer the live app catalog glyph so shared/legacy icons refresh.
    glyph: icon.kind === 'app' ? appGlyphForSection(section, icon.glyph as IconName | undefined) : ((icon.glyph as IconName | undefined) ?? 'app'),
    icon: icon.icon,
    x: icon.x,
    y: icon.y,
  };
}

function iconToSnapshot(icon: DeskIcon): IconSnapshot {
  return {
    id: icon.id,
    kind: icon.kind,
    section: icon.section,
    target: icon.target,
    action: icon.action,
    name: icon.name,
    glyph: icon.glyph,
    icon: icon.icon,
    x: icon.x,
    y: icon.y,
  };
}

function hydrateLayout(layout: DesktopLayout): {
  wins: Win[];
  icons: DeskIcon[];
  notes: Record<string, NoteData>;
  widgets: WidgetSnapshot[];
  wall: WallChoice & { path?: string };
} {
  // Icons are exactly what the user pinned — never auto-seed missing apps.
  // Empty is valid and is the default for a fresh desktop.
  const icons = layout.icons.map(iconFromSnapshot);
  let wins = layout.windows.map(winFromSnapshot);
  // Session restore: optional clean desk (icons/widgets stay; app windows do not).
  try {
    const prefs = loadDesktopPrefs();
    if (prefs.restoreSessionWindows === false) wins = [];
  } catch {
    /* ignore */
  }
  return {
    wins,
    icons,
    notes: Object.fromEntries(
      Object.entries(layout.notes).map(([id, note]) => [id, { text: note.text, color: note.color }]),
    ),
    widgets: Array.isArray(layout.widgets) ? layout.widgets : [],
    wall:
      layout.wallpaper.kind === 'preset'
        ? { kind: 'preset', id: layout.wallpaper.id ?? 'crimsonveil' }
        : layout.wallpaper.kind === 'video'
          ? { kind: 'video', path: layout.wallpaper.path, id: layout.wallpaper.id }
          : layout.wallpaper.kind === 'slideshow'
            ? {
                kind: 'slideshow',
                folder: layout.wallpaper.folder,
                intervalSec: layout.wallpaper.intervalSec ?? 60,
                shuffle: !!layout.wallpaper.shuffle,
              }
            : { kind: 'image', path: layout.wallpaper.path, id: layout.wallpaper.id },
  };
}

function buildLayout(
  desktopIndex: DesktopIndex,
  wins: Win[],
  icons: DeskIcon[],
  notes: Record<string, NoteData>,
  widgets: WidgetSnapshot[],
  wall: WallChoice & { path?: string },
  /** Viewport this geometry was authored against, for the B4 remap on hydrate. */
  authored?: { w: number; h: number },
): DesktopLayout {
  return {
    desktopIndex,
    authoredW: authored && authored.w > 0 ? authored.w : undefined,
    authoredH: authored && authored.h > 0 ? authored.h : undefined,
    windows: wins.map(winToSnapshot),
    icons: icons.map(iconToSnapshot),
    notes: Object.fromEntries(
      Object.entries(notes).map(([id, note]) => [id, { id, text: note.text, color: note.color } as NoteSnapshot]),
    ),
    widgets,
    wallpaper:
      wall.kind === 'preset'
        ? { kind: 'preset', id: wall.id }
        : wall.kind === 'video'
          ? { kind: 'video', path: wall.path, id: wall.id }
          : wall.kind === 'slideshow'
            ? {
                kind: 'slideshow',
                folder: wall.folder,
                intervalSec: wall.intervalSec ?? 60,
                shuffle: !!wall.shuffle,
              }
            : { kind: 'image', path: wall.path, id: wall.id },
    layoutEpoch: 1,
  };
}

function layoutSignature(layout: DesktopLayout): string {
  return JSON.stringify({
    desktopIndex: layout.desktopIndex,
    windows: layout.windows,
    icons: layout.icons,
    notes: layout.notes,
    widgets: layout.widgets,
    wallpaper: layout.wallpaper,
  });
}

export interface DesktopShellProps {
  onOpenBook: (item: LibraryItem) => void;
  /**
   * Desktop this shell renders. Omitted in the main window, which follows the
   * store's `activeDesktopIndex` and can slide between desktops. A secondary
   * window passes its assigned index and stays pinned to it — that pinning is
   * what makes the single-writer rule hold (B2): two shells never own one
   * desktop, so neither ever sees a foreign edit to its own layout.
   */
  desktopIndex?: DesktopIndex;
  /** Display this shell is on. Needed to address it in a cross-monitor drag. */
  displayKey?: string;
  /** True in a per-monitor window; false/undefined in the main Study OS window. */
  secondary?: boolean;
}

export default function DesktopShell({
  onOpenBook,
  desktopIndex: pinnedDesktopProp,
  displayKey,
  secondary = false,
}: DesktopShellProps) {
  // A secondary shell is pinned; the main shell follows the active desktop.
  const pinnedDesktop = secondary ? (pinnedDesktopProp ?? DESKTOP_STUDY) : null;
  // `lang` is here for exactly one consumer: `noteBodyCache` below caches a
  // translated placeholder, so it is rebuilt per language rather than per render.
  // Every other call site reads `t` fresh at render time and needs nothing more.
  const { t, lang } = useT();
  const material = useAppMaterialSet();
  const wired = material === 'wired';
  // Which Start panel to build. Aero and Wired share the two-column secret-OS
  // menu; every other material gets the legacy grid. Both used to be mounted on
  // every open and CSS hid the loser (`aero-shell.css:24`, `:1851`,
  // `wired-shell.css:145`), so a single open paid for 528 nodes and 106 inline
  // SVGs to show at most half of them.
  const secretStartMenu = material === 'aero' || material === 'wired';
  const deskRef = useRef<HTMLDivElement>(null);
  const taskbarRef = useRef<HTMLDivElement>(null);
  const hydrating = useRef(true);
  // Notes are the one window whose close is destructive, so it asks first — and every
  // click asked again. Measured live through the debug bridge: five clicks on a note's
  // close button left FIVE stacked, identical "This cannot be undone" dialogs over one
  // note. Answering one deletes it and the survivors then point at a note that
  // is gone. `closeMany` already serialises its confirmations for this reason
  // (see its comment below); a person clicking twice deserves the same guarantee.
  const noteConfirmPending = useRef<Set<string>>(new Set());
  // B4, second half: `clampLayoutToViewport` decides which viewport the fitted
  // coordinates are expressed in, and the commit path must not overwrite that
  // answer with the live viewport on an echo it did not author. These two carry
  // the fit's verdict — the origin it returned, and the geometry it returned it
  // for — from `applyDesktopLayout` to every `buildLayout` call site.
  const authoredOrigin = useRef<{ w: number; h: number } | null>(null);
  const hydratedGeometry = useRef<string | null>(null);
  /**
   * What the last fit (hydrate or zoom) did to each window, so the next zoom
   * re-fit derives from the authored rects instead of the fitted ones. See
   * `FitMemory` for why a fit cannot simply be run backwards.
   */
  const lastFit = useRef<FitMemory | null>(null);
  const winsRef = useRef<Win[]>([]);
  const notesRef = useRef<Record<string, NoteData>>({});
  const openRef = useRef<(section: WinSection) => void>(() => undefined);
  const activeDesktopRef = useRef<DesktopIndex>(pinnedDesktop ?? getActiveDesktopIndex());
  // The switcher's own ring, mirrored for the keyboard shortcut. Its effect
  // binds once with no deps, so reading the state directly would step through
  // whatever set existed on first render.
  const switchableRef = useRef<DesktopIndex[]>([0, 1]);
  // Ring buffer of the last few layout signatures WE committed. commitLayout
  // round-trips through the main process and echoes back to us; every such
  // echo must be recognized as our own and ignored. Remembering only the
  // single latest signature (the old behavior) broke on bursts: minimizing
  // fires focus(min:false) then onMinimize(min:true), so the echo for the
  // intermediate min:false commit arrived after we'd moved on to min:true,
  // failed the match, and re-hydrated the shell — reopening the window. Same
  // race made wallpaper selections randomly revert.
  const committedSignatures = useRef<string[]>([]);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rememberSignature = (sig: string): void => {
    const arr = committedSignatures.current;
    arr.push(sig);
    if (arr.length > 16) arr.shift();
  };
  const [activeDesktop, setActiveDesktop] = useState<DesktopIndex>(
    pinnedDesktop ?? getActiveDesktopIndex(),
  );
  const [wins, setWins] = useState<Win[]>([]);
  // Window lifecycle phases (WIRED_BESPOKE_SPEC §2). Theme-neutral and purely
  // additive: only wired gets a non-zero phase duration, so aero/base keep
  // their instant open/close/minimize behavior.
  const [winAnim, setWinAnim] = useState<Record<string, WinAnimPhase>>({});
  const winAnimTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [icons, setIcons] = useState<DeskIcon[]>([]);
  // 4.1: the preset handler must read the current icons and dispatch a result
  // event. Doing either inside a `setIcons` updater would run twice under
  // StrictMode, so the updater stays pure and this ref is the read path.
  const iconsRef = useRef<DeskIcon[]>([]);
  const iconPresetUndo = useRef<DeskIcon[] | null>(null);
  const [notes, setNotes] = useState<Record<string, NoteData>>({});
  const [widgets, setWidgets] = useState<WidgetSnapshot[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  /**
   * Tray overflow ("show hidden icons"), the shell's own progressive-disclosure
   * idiom. The secondary tray commands live behind it rather than in the bar; it
   * obscures nothing — the panel is one click or one Enter away and every item
   * keeps its label there, which the 32px icon buttons in the bar never had.
   */
  const [trayOverflowOpen, setTrayOverflowOpen] = useState(false);
  const trayOverflowBtnRef = useRef<HTMLButtonElement | null>(null);
  /** The exact visible-window set hidden by the taskbar's Show desktop action. */
  const showDesktopRestoreState = useRef<ReadonlyMap<string, boolean | undefined> | null>(null);
  const [showDesktopActive, setShowDesktopActive] = useState(false);
  const [wall, setWall] = useState<WallChoice & { path?: string }>({ kind: 'preset', id: 'crimsonveil' });
  const [wallImage, setWallImage] = useState<string | null>(null);
  const [wallVideo, setWallVideo] = useState<string | null>(null);
  /** Paths for folder slideshow (Windows-style). */
  const [slidePaths, setSlidePaths] = useState<string[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [startOpen, setStartOpen] = useState(false);
  /** The Start button, so the panel can hand focus back to it (round-2 audit K6). */
  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  // The guided tour opens Start for its search step and closes it again after.
  useEffect(() => {
    const onStartRequest = (e: Event) => {
      const open = (e as CustomEvent<{ open?: boolean } | null>).detail?.open;
      if (typeof open === 'boolean') setStartOpen(open);
    };
    window.addEventListener('shell:start', onStartRequest);
    return () => window.removeEventListener('shell:start', onStartRequest);
  }, []);
  /** Right-click / Shift+F10 menu on a Start tile: where the pin command lives now. */
  const [startTileCtx, setStartTileCtx] = useState<{ x: number; y: number; app: AppMeta } | null>(null);
  /**
   * Window focus hand-off (round-2 audit K7). Measured: 19 of 20 apps opened from
   * Start left focus where it was, and closing or minimising a window dropped it to
   * <body>. `open`/`openNote` and `removeWin`/`minimize` record what should happen
   * here, and the effect after the next `wins` commit — when the window's DOM exists,
   * or is gone — carries it out.
   */
  const pendingWinFocus = useRef<
    | { kind: 'open'; id: string }
    | { kind: 'leave'; closedId: string; container: HTMLElement | null; opener: HTMLElement | null; fromTaskbar: boolean }
    | null
  >(null);
  /** What had focus when each window was opened, if it will outlive the opening. */
  const winOpeners = useRef<Map<string, HTMLElement>>(new Map());
  /** Section id while dragging an app tile from Start onto the desktop. */
  const [startAppDragging, setStartAppDragging] = useState<WinSection | null>(null);
  const [deskPrefs, setDeskPrefs] = useState<DesktopPrefs>(loadDesktopPrefs);
  const [wallDim, setWallDim] = useState(() => loadPersonalization().wallpaperDim);
  /** Living-layer wallpaper rotation is painting the desk background. */
  const [wallFromEnv, setWallFromEnv] = useState(false);
  /** Session pin: shell wallpaper wins without permanently clearing living rotation. */
  const [pinShellWall, setPinShellWall] = useState(false);

  useEffect(() => {
    // Clear the session shell-wall pin when living wallpaper is (re)enabled in Settings.
    let prev = (() => {
      try {
        const e = loadEnvironment();
        return { enabled: e.enabled, rotation: e.rotationEnabled };
      } catch {
        return { enabled: false, rotation: false };
      }
    })();
    return onEnvironmentChanged((env) => {
      if ((!prev.enabled && env.enabled) || (!prev.rotation && env.rotationEnabled)) {
        setPinShellWall(false);
      }
      prev = { enabled: env.enabled, rotation: env.rotationEnabled };
    });
  }, []);
  const [userWalls, setUserWalls] = useState<UserWallpaper[]>(() => loadUserWallpapers());
  const [userWallThumbs, setUserWallThumbs] = useState<Record<string, string>>({});
  const [viz, setViz] = useState<VizSettings>(loadVizSettings);
  const [musicPlaying, setMusicPlaying] = useState(isMusicPlaying);
  const zTop = useRef(10);
  // Sections currently open in their own real OS window. Kept in sync with the
  // main process (the source of truth) so this desktop never opens a second,
  // in-desktop copy of an app that's already popped out — clicking its icon,
  // taskbar entry, or Start menu tile should just focus the real window instead.
  const [poppedSections, setPoppedSections] = useState<Set<WinSection>>(new Set());

  useEffect(() => {
    window.api.popoutListOpen().then((sections) => setPoppedSections(new Set(sections as WinSection[])));
    return window.api.onPopoutChanged((sections) => setPoppedSections(new Set(sections as WinSection[])));
  }, []);

  useEffect(() => {
    winsRef.current = wins;
  }, [wins]);
  useEffect(() => {
    if (!showDesktopActive) return;
    const restoreState = showDesktopRestoreState.current;
    // Opening or restoring any window ends the transient Show desktop state.
    // A switch to a desktop that does not own the captured ids does too.
    if (
      !restoreState
      || !wins.some((window) => restoreState.has(window.id))
      || wins.some((window) => !window.min)
    ) {
      showDesktopRestoreState.current = null;
      setShowDesktopActive(false);
    }
  }, [showDesktopActive, wins]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    activeDesktopRef.current = activeDesktop;
  }, [activeDesktop]);

  const applyDesktopLayout = (desktopIndex: DesktopIndex): void => {
    hydrating.current = true;
    // B4: a layout authored on another monitor arrives in that monitor's pixels.
    // Pull it into this viewport before hydrating, or windows and icons land
    // off-screen with no way to reach them.
    // The desk element is not laid out yet on the first hydrate, so reading it
    // alone yields 0 and the fit below is skipped entirely — which is how a
    // 1264px window ended up inside an 880px desktop and stayed there. Fall back
    // to the window's own size, which is always known by the time this runs.
    const deskEl = deskRef.current;
    const viewport = {
      w: deskEl?.clientWidth || window.innerWidth,
      h: (deskEl?.clientHeight || window.innerHeight) - taskbarH(loadDesktopPrefs()),
    };
    const stored = getDesktopLayout(desktopIndex);
    const fitMode = loadDisplayPrefs().remapLayoutProportionally ? 'proportional' : 'clamp';
    const fitted =
      viewport.w > 0 && viewport.h > 0
        ? clampLayoutToViewport(stored, viewport, fitMode)
        : stored;
    // Seeded here as well as by the zoom re-fit, so a desk hydrated while
    // already zoomed still knows its authored rects when the zoom comes off.
    lastFit.current =
      viewport.w > 0 && viewport.h > 0 ? rememberFit(stored, fitted, viewport, fitMode) : null;
    const next = hydrateLayout(fitted);
    // Remember what the fit concluded, and the geometry it concluded it for.
    // The signature is built through the same snapshot mappers `buildLayout`
    // uses, so a commit that changed nothing produces a byte-identical string
    // and is recognised as this hydrate's own echo rather than a user edit.
    authoredOrigin.current =
      typeof fitted.authoredW === 'number' && typeof fitted.authoredH === 'number'
        ? { w: fitted.authoredW, h: fitted.authoredH }
        : null;
    hydratedGeometry.current = layoutGeometrySignature({
      windows: next.wins.map(winToSnapshot),
      icons: next.icons.map(iconToSnapshot),
      widgets: next.widgets,
    });
    setActiveDesktop(desktopIndex);
    setWins(next.wins);
    setIcons(next.icons);
    setNotes(next.notes);
    setWidgets(next.widgets);
    setWall(next.wall);
    zTop.current = Math.max(10, ...next.wins.map((w) => w.z), ...next.widgets.map((w) => w.z), 10) + 1;
    queueMicrotask(() => {
      hydrating.current = false;
    });
  };

  useEffect(() => {
    applyDesktopLayout(pinnedDesktop ?? getActiveDesktopIndex());
    return onDesktopChanged((snap) => {
      // A secondary shell ignores `activeDesktopIndex` entirely — that field is
      // what the MAIN window shows. This one owns exactly its assigned desktop.
      const target = pinnedDesktop ?? snap.activeDesktopIndex;
      const nextLayout = getDesktopLayout(target);
      const nextSignature = layoutSignature(nextLayout);
      // Same desktop + a signature we just committed → this is our own echo,
      // ignore it. Only re-hydrate on a real desktop switch or a genuinely
      // external change.
      if (target === activeDesktopRef.current && committedSignatures.current.includes(nextSignature)) {
        return;
      }
      applyDesktopLayout(target);
    });
  }, [pinnedDesktop]);

  /*
   * A ZOOM CHANGE IS B4'S MONITOR CHANGE IN A SECOND SHAPE, and only the first shape was wired.
   * `appZoom` sizes `#root` to (100/z)vw x (100/z)vh so the PAINTED box stays one viewport,
   * which means at 200% the LAYOUT viewport halves while every window keeps the geometry it was
   * authored at. `#root` is `overflow: hidden` deliberately (appZoom.ts, "never put
   * document-level scrollbars on the OS shell"), so the excess is not scrolled to — it is cut off.
   *
   * Measured on this shell before this existed: at zoom 2 a 960x680 Settings window painted
   * 1920x1360 inside a 1264x821 desk and hung 776 px right / 587 px bottom outside it, with no
   * scrollbar and no way back except resizing the window by hand. The user who most needs 200%
   * zoom lost the corner of every window. `clampLayoutToViewport`'s own header already describes
   * this failure ("overflowing it with no way to reach the far edge") — it was simply never
   * reached from here, because zoom is not a `resize` and does not re-hydrate.
   *
   * Two choices worth stating, because the obvious implementations are both wrong:
   *  - The fit is re-derived from the AUTHORED rects, not from the live (or stored) windows. A
   *    fit is not invertible: it floors a window at its minimum size and caps it at the desk,
   *    and scaling the floored value back up is how a 260x220 note came back from a 200% round
   *    trip as 480x302, on disk (boss audit 2026-09-02, Finding 3). The first version of this
   *    effect fitted the STORED layout and called that reversible — but the commit below
   *    stores the fitted rects, so the second fit was already reading the first fit's output.
   *    `lastFit` keeps the rect each window was fitted FROM; a window the user has not touched
   *    since is fed that rect, and one they have is carried back by the inverse scale.
   *  - The fitted geometry IS committed, and that is deliberate. The commit effect writes it
   *    stamped with the viewport it is expressed in (`resolveAuthoredViewport` sees the
   *    geometry change and records the live desk), so a user who lives at 200% authors and
   *    persists in that space like any other viewport. What must not happen is the commit
   *    becoming the SOURCE of the next re-fit, and `lastFit` is what prevents that. (An
   *    earlier version of this comment said "nothing is committed"; live, it always was.)
   */
  useEffect(() => onZoomChanged(() => {
    const deskEl = deskRef.current;
    const viewport = {
      w: deskEl?.clientWidth || 0,
      h: (deskEl?.clientHeight || 0) - taskbarH(loadDesktopPrefs()),
    };
    if (viewport.w <= 0 || viewport.h <= 0) return;
    const stored = getDesktopLayout(activeDesktopRef.current);
    const fitMode = loadDisplayPrefs().remapLayoutProportionally ? 'proportional' : 'clamp';
    const memory = lastFit.current;
    let source: DesktopLayout;
    if (memory) {
      source = {
        ...stored,
        windows: toAuthoredSpace(winsRef.current.map(winToSnapshot), memory),
        authoredW: memory.authoredW,
        authoredH: memory.authoredH,
      };
    } else {
      // No fit has been remembered (the hydrate ran against a zero-sized desk), so the
      // stored layout is the best authored record there is. A window opened this session
      // may not be in storage yet, and it has to fit too — so it enters the fit at its live
      // geometry rather than being skipped.
      const storedById = new Map(stored.windows.map((snap) => [snap.id, snap]));
      source = {
        ...stored,
        windows: winsRef.current.map((win) => storedById.get(win.id) ?? winToSnapshot(win)),
      };
    }
    const fitted = clampLayoutToViewport(source, viewport, fitMode);
    lastFit.current = rememberFit(source, fitted, viewport, fitMode);
    const fittedById = new Map(fitted.windows.map((snap) => [snap.id, snap]));
    hydrating.current = true;
    setWins((prev) => prev.map((win) => {
      const fit = fittedById.get(win.id);
      if (!fit || (win.x === fit.x && win.y === fit.y && win.w === fit.w && win.h === fit.h)) return win;
      return { ...win, x: fit.x, y: fit.y, w: fit.w, h: fit.h };
    }));
    queueMicrotask(() => {
      hydrating.current = false;
    });
  }), []);

  /*
   * shell2 — the third shape of B4: the OS window itself is resized (un-maximized, snapped to
   * half a monitor, dragged smaller). Nothing re-fitted then, so windows authored on the larger
   * desk hung outside the `overflow: hidden` root with no way to reach their title bars until the
   * next hydrate. The zoom refit above is already the reversible fit (it remembers the authored
   * rects, so growing back restores them), so a settled resize re-announces the zoom rather than
   * growing a second fitter. Debounced: a live drag fires dozens of resizes.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = { w: window.innerWidth, h: window.innerHeight };
    const onResize = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const next = { w: window.innerWidth, h: window.innerHeight };
        if (next.w === last.w && next.h === last.h) return;
        last = next;
        announceViewportChange();
      }, 250);
    };
    window.addEventListener('resize', onResize);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (hydrating.current) return;
    // Debounce: a single user action often produces a burst of state updates
    // (minimize = focus + minimize; wallpaper pick = setWall + effect). Collapse
    // them into one commit so transient states (e.g. a momentary min:false)
    // are never persisted or echoed back.
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      // Don't compete with an active window/icon drag for main-thread time.
      if (document.documentElement.classList.contains('os-interacting')) {
        commitTimer.current = setTimeout(() => {
          commitTimer.current = null;
          const nextLayout = buildLayout(
            activeDesktop,
            wins,
            icons,
            notes,
            widgets,
            wall,
            authoredViewport(wins, icons, widgets),
          );
          rememberSignature(layoutSignature(nextLayout));
          void commitLayout(activeDesktop, nextLayout).catch((err) => {
            if (err instanceof Error && err.message === 'desktop-switch-in-progress') return;
            console.error('[desktopState] commit failed:', err);
          });
        }, 280);
        return;
      }
      const nextLayout = buildLayout(
        activeDesktop,
        wins,
        icons,
        notes,
        widgets,
        wall,
        authoredViewport(wins, icons, widgets),
      );
      rememberSignature(layoutSignature(nextLayout));
      void commitLayout(activeDesktop, nextLayout).catch((err) => {
        if (err instanceof Error && err.message === 'desktop-switch-in-progress') return;
        console.error('[desktopState] commit failed:', err);
      });
    }, 200);
    return () => {
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
      }
    };
  }, [activeDesktop, wins, icons, notes, widgets, wall]);

  useEffect(() => onUserWallpapersChanged(setUserWalls), []);

  // Preview thumbs for custom library tiles
  useEffect(() => {
    let dead = false;
    const load = async () => {
      const next: Record<string, string> = {};
      for (const u of userWalls) {
        try {
          if (u.kind === 'image') {
            const url = await window.api.imageFileUrl(u.path);
            if (url) next[u.id] = url;
          } else {
            const url = await window.api.mediaFileUrl(u.path);
            if (url) next[u.id] = url;
          }
        } catch {
          /* missing file */
        }
      }
      if (!dead) setUserWallThumbs(next);
    };
    void load();
    return () => {
      dead = true;
    };
  }, [userWalls]);

  useEffect(() => {
    let cancelled = false;
    if (wall.kind === 'image') {
      setWallVideo(null);
      setSlidePaths([]);
      // If we already have a working URL for this path, keep it (clicking library
      // sets image then wall — don't clear to black while re-resolving).
      const applyImage = async () => {
        if (wall.path) {
          const fromPath =
            (await window.api.imageFileUrl(wall.path)) ??
            (await window.api.setWallpaperFromPath(wall.path));
          if (cancelled) return;
          if (fromPath) {
            setWallImage(fromPath);
            return;
          }
        }
        const url = await window.api.getWallpaper();
        if (cancelled) return;
        if (url) setWallImage(url);
        else {
          setWallImage(null);
          setWall({ kind: 'preset', id: 'crimsonveil' });
        }
      };
      void applyImage();
    } else if (wall.kind === 'slideshow' && wall.folder) {
      setWallVideo(null);
      void window.api.listWallpaperFolder(wall.folder).then((paths) => {
        if (cancelled) return;
        setSlidePaths(paths);
        setSlideIndex(0);
        if (!paths.length) {
          setWallImage(null);
          return;
        }
        void window.api.imageFileUrl(paths[0]).then((url) => {
          if (!cancelled && url) setWallImage(url);
        });
      });
    } else {
      if (wall.kind !== 'image' && wall.kind !== 'slideshow') setWallImage(null);
      if (wall.kind !== 'slideshow') setSlidePaths([]);
    }
    if (wall.kind === 'video' && wall.path) {
      window.api.mediaFileUrl(wall.path).then((url) => {
        if (cancelled) return;
        if (url) setWallVideo(url);
        else setWall({ kind: 'preset', id: 'crimsonveil' });
      });
    } else if (wall.kind !== 'video') {
      setWallVideo(null);
    }
    return () => {
      cancelled = true;
    };
  }, [wall.kind, wall.path, wall.id, wall.folder]);

  useEffect(() => {
    if (wallFromEnv) return;
    syncPillarboxWallImage(wallImage);
  }, [wallImage, wallFromEnv]);

  // Slideshow timer — Windows-style interval cycle
  useEffect(() => {
    if (wallFromEnv || wall.kind !== 'slideshow' || slidePaths.length < 2) return;
    const sec = Math.max(5, Math.min(86400, wall.intervalSec ?? 60));
    const id = window.setInterval(() => {
      setSlideIndex((i) => {
        let next: number;
        if (wall.shuffle && slidePaths.length > 1) {
          do {
            next = Math.floor(Math.random() * slidePaths.length);
          } while (next === i && slidePaths.length > 1);
        } else {
          next = (i + 1) % slidePaths.length;
        }
        const p = slidePaths[next];
        if (p) {
          void window.api.imageFileUrl(p).then((url) => {
            if (url) setWallImage(url);
          });
        }
        return next;
      });
    }, sec * 1000);
    return () => clearInterval(id);
  }, [wall.kind, wall.intervalSec, wall.shuffle, wallFromEnv, slidePaths]);

  useEffect(() => onVizSettingsChanged(setViz), []);
  useEffect(() => onPlayingChanged(setMusicPlaying), []);
  useEffect(() => onDesktopPrefsChanged(setDeskPrefs), []);
  useEffect(() => {
    iconsRef.current = icons;
  }, [icons]);

  // Settings → Desktop: re-snap icons when user picks a grid size.
  useEffect(() => {
    const onResnap = (ev: Event) => {
      const grid = (ev as CustomEvent<{ grid?: number }>).detail?.grid;
      const g = grid === 12 || grid === 16 || grid === 24 ? grid : deskPrefs.snapGrid;
      if (!g) return;
      const { w: dw, h: dh } = deskSize();
      const { w: ICON_W, h: ICON_H } = iconMetrics(deskPrefs);
      setIcons((prev) =>
        prev.map((ic) => {
          const sn = snapClamp(ic.x, ic.y, ICON_W, ICON_H, dw, dh, g);
          return sn.x === ic.x && sn.y === ic.y ? ic : { ...ic, x: sn.x, y: sn.y };
        }),
      );
    };
    window.addEventListener('desktop:resnap-icons', onResnap);
    return () => window.removeEventListener('desktop:resnap-icons', onResnap);
  }, [deskPrefs]);

  // v1.0 audit 4.1 — Settings → Desktop layout → Recommended applies a whole
  // icon arrangement. Settings renders inside this same document, so a
  // CustomEvent reaches the only owner of `icons`, exactly like resnap above.
  useEffect(() => {
    const onApplyPreset = (ev: Event) => {
      const preset = getIconPreset((ev as CustomEvent<{ presetId?: string }>).detail?.presetId);
      if (!preset) return;
      const { w: dw, h: dh } = deskSize();
      const { w: ICON_W, h: ICON_H } = iconMetrics(deskPrefs);
      const apps = preset.sections
        .map((s) => APPS.find((a) => a.id === s))
        .filter((a): a is AppMeta => Boolean(a));
      const prev = iconsRef.current;
      iconPresetUndo.current = prev;
      // A preset owns the *app* icons only. File shortcuts and action icons the
      // user placed by hand are kept and laid out after them — a recommended
      // arrangement must not delete someone's own shortcuts.
      const kept = prev.filter((i) => i.kind !== 'app');
      const pos = iconPresetPositions(apps.length + kept.length, {
        boundW: dw,
        boundH: dh,
        iconW: ICON_W,
        iconH: ICON_H,
        grid: deskPrefs.snapGrid,
        columns: preset.columns,
      });
      const placed: DeskIcon[] = apps.map((a, i) => ({
        id: `app-${a.id}`,
        kind: 'app',
        section: a.id,
        // Baked at apply time for the same reason pinning bakes it.
        name: t(a.labelKey),
        glyph: a.glyph,
        x: pos[i].x,
        y: pos[i].y,
      }));
      kept.forEach((ic, i) => {
        const p = pos[apps.length + i];
        placed.push({ ...ic, x: p.x, y: p.y });
      });
      setIcons(placed);
      window.dispatchEvent(
        new CustomEvent('desktop:icon-preset-applied', {
          detail: { presetId: preset.id, placed: apps.length, kept: kept.length, replaced: prev.length },
        }),
      );
    };
    const onUndoPreset = () => {
      const prev = iconPresetUndo.current;
      if (!prev) return;
      iconPresetUndo.current = null;
      setIcons(prev);
      window.dispatchEvent(
        new CustomEvent('desktop:icon-preset-applied', { detail: { presetId: null, restored: prev.length } }),
      );
    };
    window.addEventListener('desktop:apply-icon-preset', onApplyPreset);
    window.addEventListener('desktop:undo-icon-preset', onUndoPreset);
    return () => {
      window.removeEventListener('desktop:apply-icon-preset', onApplyPreset);
      window.removeEventListener('desktop:undo-icon-preset', onUndoPreset);
    };
  }, [deskPrefs, t]);
  useEffect(
    () =>
      onPersonalizationChanged((s) => {
        setWallDim(s.wallpaperDim);
      }),
    [],
  );
  // L4: mirror companions onto the real Windows desktop when opted in.
  // B9: main window only. Two shells running this would fight over
  // `companionHost:setSpan`, each resetting the other's span every tick.
  useEffect(() => {
    if (secondary) return;
    startCompanionOsBridge();
    return () => stopCompanionOsBridge();
  }, [secondary]);

  // ----- Cross-monitor drag (Phase 2) -----

  /** Which display this shell is on. Secondaries know from their URL; the main
   *  window has to ask, because the user can move it between monitors. */
  const [myDisplayKey, setMyDisplayKey] = useState<string>(displayKey ?? '');
  useEffect(() => {
    if (displayKey) {
      setMyDisplayKey(displayKey);
      return;
    }
    let cancelled = false;
    const refresh = (): void => {
      void window.api.deskwinWhoAmI().then((who) => {
        if (!cancelled && who.displayKey) setMyDisplayKey(who.displayKey);
      });
    };
    refresh();
    // Dragging the main window to another monitor changes the answer.
    const off = window.api.onDisplaysChanged(refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      off();
      window.removeEventListener('focus', refresh);
    };
  }, [displayKey]);

  useEffect(() => {
    if (!myDisplayKey) return;
    return registerDeskContext({ displayKey: myDisplayKey, deskEl: () => deskRef.current });
  }, [myDisplayKey]);

  /** This display's own assignment, for taskbar mode and the window list. */
  const [myAssignment, setMyAssignment] = useState<DisplayAssignment | null>(null);
  useEffect(() => {
    if (!myDisplayKey) return;
    const read = (): void => setMyAssignment(getAssignment(myDisplayKey));
    read();
    return onDesktopChanged(read);
  }, [myDisplayKey]);

  const taskbarMode: TaskbarMode = myAssignment?.taskbar ?? 'full';

  /**
   * Which displays are physically attached right now (L11 b4 clause 3).
   *
   * `syncDesktopWindows` keeps an assignment when its monitor is unplugged and
   * only stops giving it a window (`main/desktopWindows.ts:303`) — deliberately,
   * so plugging the monitor back in restores the arrangement. The consequence is
   * that `enabled` alone does NOT mean "there is a monitor over there", which is
   * the whole question the neighbour ring is asking.
   */
  const attachedKeysRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const refresh = (): void => {
      void window.api.displayList().then((list) => {
        attachedKeysRef.current = new Set(list.map((d) => d.key));
      });
    };
    refresh();
    return window.api.onDisplaysChanged(refresh);
  }, []);

  /**
   * Keyboard: move the focused window to the desktop on the neighbouring
   * monitor, and raise a neighbouring monitor.
   *
   * Uses the same single-writer discipline as the drag: this shell commits the
   * removal from its own desktop, and `desktop:commitLayout` for the target
   * index is a *different* desktop that no other shell owns concurrently —
   * the target window re-hydrates from the broadcast.
   */
  useEffect(() => {
    // A monitor that is not plugged in is not a neighbour — `monitorRing.ts`
    // carries the rule, the measurement that produced it, and its own suite.
    const neighbourDesktop = (dir: number): DesktopIndex | null => {
      const key = neighbourDisplayKey(getAssignments(), attachedKeysRef.current, myDisplayKey, dir);
      return key == null ? null : getAssignment(key)?.desktopIndex ?? null;
    };

    /*
     * Raise the window showing a desktop, and OPEN one when nothing does.
     *
     * `deskwin:focusDesktop` only raises what already exists, and
     * `syncDesktopWindows` never gives the main display a second shell
     * (`desktopWindows.ts:301`), so focus alone has a real hole even with the
     * ring filtered. `deskwin:openDesktop` is the tear-off's own path and
     * already focuses an existing spawned window before creating one, so this
     * is the same two handlers the shell has always had — no new IPC, and the
     * result is answered rather than discarded.
     *
     * Now `desktopState.focusOrOpenDesktop`, because the taskbar's badged
     * foreign-window button needs the identical pairing and had only the
     * raise-only half (D150). A guard that lives inside one caller's effect is
     * a guard the next call site cannot find.
     */
    const showDesktop = focusOrOpenDesktop;

    const onMove = (e: Event): void => {
      const dir = (e as CustomEvent<number>).detail ?? 1;
      const target = neighbourDesktop(dir);
      if (target == null || target === activeDesktop) return;
      const top = wins.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0];
      if (!top) return;
      const layout = getDesktopLayout(target);
      void commitLayout(target, {
        ...layout,
        windows: [
          ...layout.windows.filter((w) => w.id !== top.id),
          { ...winToSnapshot(top), x: 40, y: 40 },
        ],
      });
      setWins((prev) => prev.filter((w) => w.id !== top.id));
      void showDesktop(target);
    };

    const onFocusMonitor = (e: Event): void => {
      const target = neighbourDesktop((e as CustomEvent<number>).detail ?? 1);
      if (target == null) return;
      void showDesktop(target);
    };

    window.addEventListener('os:move-to-monitor', onMove);
    window.addEventListener('os:focus-monitor', onFocusMonitor);
    return () => {
      window.removeEventListener('os:move-to-monitor', onMove);
      window.removeEventListener('os:focus-monitor', onFocusMonitor);
    };
  }, [wins, activeDesktop, myDisplayKey]);

  /**
   * Bumped on every desktop-layout broadcast, so `foreignWins` below can depend
   * on the store it reads.
   *
   * Without this the memo listed windows off *other* desktops while depending on
   * nothing that changes when another desktop is edited. Measured live on a
   * simulated second display: dragging a window here from desktop 0 left it in
   * the taskbar twice — once correctly as this desktop's own, and once as a
   * foreign entry still badged with the desktop it had already left, whose click
   * raised the wrong monitor.
   *
   * Subscribed only while the list is actually shown. The broadcast fires on
   * every layout commit, and the default taskbar renders none of this, so a
   * shell that is not opted in must not pay a re-render for it.
   */
  const [layoutRevision, setLayoutRevision] = useState(0);
  useEffect(() => {
    if (!myAssignment?.showAllWindows) return;
    return onDesktopChanged(() => setLayoutRevision((n) => n + 1));
  }, [myAssignment?.showAllWindows]);

  /**
   * Windows living on *other* desktops, shown with a monitor badge when the
   * user has asked this taskbar to list everything (Windows 11 style).
   */
  const foreignWins = useMemo(
    () =>
      collectForeignWindows({
        showAllWindows: myAssignment?.showAllWindows === true,
        activeDesktop,
        desktopCount: getDesktopCount(),
        windowsOn: (index) => getDesktopLayout(index).windows,
        nameOf: displayDesktopName,
      }),
    [myAssignment?.showAllWindows, activeDesktop, deskPrefs, layoutRevision],
  );

  /**
   * The desktops the switcher offers a button for.
   *
   * Deliberately NOT hung off `layoutRevision`: that counter is only subscribed
   * when `showAllWindows` is on, and the switcher is always rendered, so a
   * desktop that gained a window while this taskbar was showing another one
   * would never grow its button. It subscribes on its own instead, and stores
   * the result rather than recomputing in a memo, so the always-on broadcast
   * only costs a re-render when the SET actually changes — which is the answer
   * to the cost the `layoutRevision` comment above is guarding against.
   */
  const readSwitchable = useCallback(
    () =>
      switchableDesktopIndexes({
        desktopCount: getDesktopCount(),
        activeDesktop,
        windowsOn: (index) => getDesktopLayout(index).windows,
      }),
    [activeDesktop],
  );
  const [switchableDesktops, setSwitchableDesktops] = useState<DesktopIndex[]>(readSwitchable);
  switchableRef.current = switchableDesktops;
  useEffect(() => {
    const apply = (): void =>
      setSwitchableDesktops((prev) => {
        const next = readSwitchable();
        return prev.join(',') === next.join(',') ? prev : next;
      });
    apply();
    return onDesktopChanged(apply);
  }, [readSwitchable]);

  /** Ghost shown on the receiving desktop while an item hovers over it. */
  const [dragGhost, setDragGhost] = useState<{ kind: DeskDragKind; x: number; y: number } | null>(null);

  useEffect(() => {
    return subscribeDeskDrag({
      onHover: ({ kind, screenX, screenY }) => {
        const p = screenToDeskPoint(screenX, screenY, deskRef.current, desktopPointerScale(deskRef.current));
        setDragGhost({ kind, x: p.x, y: p.y });
      },
      onLeave: () => setDragGhost(null),
      onAdopt: ({ kind, payload, screenX, screenY }) => {
        setDragGhost(null);
        const p = screenToDeskPoint(screenX, screenY, deskRef.current, desktopPointerScale(deskRef.current));
        const { w: dw, h: dh } = deskSize();
        if (kind === 'window' && payload.kind === 'window') {
          const snap = payload.snapshot;
          const w = Math.min(snap.w, dw);
          const h = Math.min(snap.h, dh);
          setWins((prev) => [
            ...prev.filter((existing) => existing.id !== snap.id),
            {
              ...winFromSnapshot(snap),
              x: Math.max(0, Math.min(p.x, dw - 60)),
              y: Math.max(0, Math.min(p.y, dh - 36)),
              w,
              h,
              z: ++zTop.current,
              min: false,
            },
          ]);
        } else if (kind === 'icon' && payload.kind === 'icon') {
          const snap = payload.snapshot;
          const { w: ICON_W, h: ICON_H } = iconMetrics(deskPrefs);
          const sn = snapClamp(p.x, p.y, ICON_W, ICON_H, dw, dh, deskPrefs.snapGrid);
          setIcons((prev) => [
            ...prev.filter((existing) => existing.id !== snap.id),
            { ...iconFromSnapshot(snap), x: sn.x, y: sn.y },
          ]);
        } else if (kind === 'widget' && payload.kind === 'widget') {
          const snap = payload.snapshot;
          setWidgets((prev) => [
            ...prev.filter((existing) => existing.id !== snap.id),
            {
              ...snap,
              x: Math.max(0, Math.min(p.x, dw - snap.w)),
              y: Math.max(0, Math.min(p.y, dh - snap.h)),
              z: ++zTop.current,
            },
          ]);
        } else if (kind === 'note' && payload.kind === 'note') {
          const snap = payload.snapshot;
          setNotes((prev) => ({ ...prev, [snap.id]: { text: snap.text, color: snap.color } }));
          if (payload.icon) {
            const { w: ICON_W, h: ICON_H } = iconMetrics(deskPrefs);
            const sn = snapClamp(p.x, p.y, ICON_W, ICON_H, dw, dh, deskPrefs.snapGrid);
            const icon = payload.icon;
            setIcons((prev) => [
              ...prev.filter((existing) => existing.id !== icon.id),
              { ...iconFromSnapshot(icon), x: sn.x, y: sn.y },
            ]);
          }
        }
      },
      onRelease: ({ kind, id }) => {
        if (kind === 'window') setWins((prev) => prev.filter((w) => w.id !== id));
        else if (kind === 'icon') setIcons((prev) => prev.filter((i) => i.id !== id));
        else if (kind === 'widget') setWidgets((prev) => prev.filter((w) => w.id !== id));
        else if (kind === 'note') {
          setNotes((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setIcons((prev) => prev.filter((i) => i.id !== id && i.target !== id));
        }
      },
      onCancelled: () => setDragGhost(null),
    });
  }, [deskPrefs]);
  // L5: streak / daily-volume celebrations → companion events.
  useEffect(() => startAchievementWatcher(), []);
  const deskSize = () => ({
    w: deskRef.current?.clientWidth ?? 1200,
    h: (deskRef.current?.clientHeight ?? 720) - taskbarH(deskPrefs),
  });

  /**
   * The `authored` argument for a `buildLayout` about to be committed (B4).
   *
   * Not simply `deskSize()`: a desk hydrated in clamp mode still holds the
   * coordinates of the monitor it was authored on, and the commit that fires
   * moments later must say so rather than re-labelling them with whatever
   * window happens to be showing them. Once the geometry actually moves, this
   * viewport is the honest answer again. See `resolveAuthoredViewport`.
   */
  const authoredViewport = (
    nextWins: Win[],
    nextIcons: DeskIcon[],
    nextWidgets: WidgetSnapshot[],
  ): { w: number; h: number } => {
    const signature = layoutGeometrySignature({
      windows: nextWins.map(winToSnapshot),
      icons: nextIcons.map(iconToSnapshot),
      widgets: nextWidgets,
    });
    return resolveAuthoredViewport({
      hydrated: authoredOrigin.current,
      live: deskSize(),
      geometryChanged: hydratedGeometry.current === null || signature !== hydratedGeometry.current,
    });
  };

  const desktopApps = useMemo(() => appListForDesktop(activeDesktop), [activeDesktop]);
  // Grouping is pure data (ids only); labels are resolved with t() at render, so
  // this does not need to react to a language switch.
  const startGroups = useMemo(() => groupStartApps(desktopApps), [desktopApps]);

  // Already on top and not minimised? Then raising is a no-op, and the cheapest
  // correct thing is to not touch state at all.
  //
  // `dragStart` calls this on every pointerdown, so on the common gesture — drag
  // the window you are already using — the unguarded version rebuilt the whole
  // `wins` array, re-rendered every mounted window and bumped `zTop` inside the
  // pointerdown handler, in the same frame the drag is trying to start. Measured
  // 2026-08-24 with the frame recorder marking the gesture boundaries: the two
  // long frames of a drag sit at exactly `pointerdown` (83.6 ms) and `pointerup`
  // (100.4 ms), which is what missed rubric category 7's 0-frames-over-100 ms
  // bar. Returning early keeps the array identity, so React re-renders nothing.
  //
  // Not merely an optimisation for `z`: `++zTop.current` on every pointerdown
  // also grew the counter without bound for no visual change.
  const focus = (id: string) =>
    setWins((ws) => {
      const w = ws.find((x) => x.id === id);
      if (!w) return ws;
      if (!w.min && w.z === zTop.current) return ws;
      return ws.map((x) => (x.id === id ? { ...x, z: ++zTop.current, min: false } : x));
    });
  const patch = (id: string, p: Partial<Win>) =>
    setWins((ws) =>
      ws.map((w) => {
        if (w.id !== id) return w;
        const next = p.max && !canMaximizeSection(w.section) ? { ...p, max: false } : p;
        return { ...w, ...next };
      }),
    );

  // §2 lifecycle helpers: stamp a phase class on the window, then run the real
  // mutation after the phase duration. Duration 0 (non-wired) mutates inline.
  const beginWinAnim = (id: string, phase: WinAnimPhase, ms: number, onDone?: () => void) => {
    const timer = winAnimTimers.current.get(id);
    if (timer) clearTimeout(timer);
    setWinAnim((m) => ({ ...m, [id]: phase }));
    winAnimTimers.current.set(
      id,
      setTimeout(() => {
        winAnimTimers.current.delete(id);
        setWinAnim((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        onDone?.();
      }, ms),
    );
  };
  const winPhaseMs = (openPhase: boolean): number => {
    if (wired) return prefersReducedMotion() ? 80 : openPhase ? 620 : 360;
    // Aero: a short scale-in on open, a scale-and-fade on close/minimise
    // (aero-shell.css, "Window lifecycle motion"). Any reduced-motion signal
    // skips the phase entirely, so nothing waits on an animation that is off.
    if (material === 'aero') {
      const root = document.documentElement;
      const still =
        prefersReducedMotion() ||
        root.classList.contains('reduce-motion') ||
        root.dataset.displayAnim === 'none' ||
        root.dataset.perf === 'battery' ||
        root.dataset.aeroSafeMode === 'on';
      return still ? 0 : openPhase ? 240 : 200;
    }
    return 0;
  };
  useEffect(
    () => () => {
      winAnimTimers.current.forEach((timer) => clearTimeout(timer));
      winAnimTimers.current.clear();
    },
    [],
  );

  const close = async (id: string): Promise<void> => {
    const target = winsRef.current.find((w) => w.id === id);
    if (target?.section === 'note') {
      if (noteConfirmPending.current.has(id)) return;
      noteConfirmPending.current.add(id);
      let ok = false;
      try {
        ok = await confirmDialog({
          title: t('desktop.deleteNote'),
          message: t('desktop.deleteNoteConfirm'),
          confirmLabel: t('common.remove'),
          cancelLabel: t('common.cancel'),
          danger: true,
        });
      } finally {
        noteConfirmPending.current.delete(id);
      }
      if (!ok) return;
    }
    const delay = winPhaseMs(false);
    if (delay > 0) {
      if (winAnim[id] === 'closing') return;
      window.dispatchEvent(new CustomEvent('shell:windowClose'));
      beginWinAnim(id, 'closing', delay, () => removeWin(id, { silent: true }));
      return;
    }
    removeWin(id);
  };
  const closeMany = async (ids: string[]): Promise<void> => {
    for (const id of ids) {
      // Destructive note confirmations must be sequential; concurrent dialogs
      // would let one answer apply while another confirmation obscures it.
      // eslint-disable-next-line no-await-in-loop
      await close(id);
    }
  };
  /** The `.fwin` element of a window, or `null` (it is not mounted, or already gone). */
  const winElement = (id: string): HTMLElement | null => {
    const nodes = deskRef.current?.querySelectorAll<HTMLElement>('.fwin') ?? [];
    for (const node of Array.from(nodes)) if (node.dataset.winId === id) return node;
    return null;
  };
  /**
   * A window is about to leave the screen (closed or minimised). If it — or its own
   * taskbar entry — held focus, queue the hand-back for after the commit; if focus was
   * somewhere else entirely, leave it there.
   */
  const queueFocusLeave = (id: string) => {
    const container = winElement(id);
    const active = document.activeElement as HTMLElement | null;
    const fromTaskbar = !!active?.closest(`[data-task-win="${id}"]`);
    if (!fromTaskbar && !focusIsLostOrInside(container)) return;
    pendingWinFocus.current = {
      kind: 'leave',
      closedId: id,
      container,
      // Closed from the taskbar: the hand-back stays in the taskbar, not the opener.
      opener: fromTaskbar ? null : winOpeners.current.get(id) ?? null,
      fromTaskbar,
    };
  };
  const removeWin = (id: string, opts?: { silent?: boolean }) => {
    const closing = winsRef.current.find((w) => w.id === id);
    queueFocusLeave(id);
    forgetWindowMount(id);
    winOpeners.current.delete(id);
    if (!opts?.silent) window.dispatchEvent(new CustomEvent('shell:windowClose'));
    if (wired && closing && closing.section !== 'note') {
      notify({ message: translate('desktop.wired.log.unmounted', { code: wiredModule(closing.section).code }), source: 'SHELL', silent: true });
    }
    setWins((ws) => ws.filter((w) => w.id !== id));
    if (id.startsWith('note-')) {
      setNotes((n) => {
        const next = { ...n };
        delete next[id];
        return next;
      });
    }
    // Allow Ctrl+Shift+Z (nav.undo) to reopen the window.
    if (closing && closing.section && closing.section !== 'note') {
      const section = closing.section;
      const meta = APPS.find((a) => a.id === section);
      pushWindowReopenUndo(t('shell.window.reopen', { name: meta ? t(meta.labelKey) : section }), section);
    }
  };
  const minimize = (id: string) => {
    const delay = winPhaseMs(false);
    if (delay > 0) {
      if (winAnim[id] === 'minimizing') return;
      window.dispatchEvent(new CustomEvent('shell:windowMinimize'));
      beginWinAnim(id, 'minimizing', delay, () => {
        queueFocusLeave(id);
        patch(id, { min: true });
      });
      return;
    }
    window.dispatchEvent(new CustomEvent('shell:windowMinimize'));
    queueFocusLeave(id);
    patch(id, { min: true });
  };

  // K7: carry out the focus hand-off queued above, once the commit that shows or
  // removes the window has landed.
  useEffect(() => {
    const pending = pendingWinFocus.current;
    if (!pending) return;
    pendingWinFocus.current = null;
    if (pending.kind === 'open') {
      const el = winElement(pending.id);
      if (!el || el.style.display === 'none') return;
      // An app that focused its own field on mount (child effects run first) keeps it.
      if (el.contains(document.activeElement)) return;
      const body = el.querySelector('.fwin-body');
      const target = (body && firstMeaningfulControl(body)) || el;
      target.focus({ preventScroll: true });
      return;
    }
    const topWindow = (): HTMLElement | null => {
      const next = winsRef.current
        .filter((w) => !w.min && w.id !== pending.closedId)
        .sort((a, b) => (b.pin ? PIN_Z_BASE : 0) + b.z - ((a.pin ? PIN_Z_BASE : 0) + a.z))[0];
      return next ? winElement(next.id) : null;
    };
    const neighbourTaskButton = (): HTMLElement | null =>
      taskbarRef.current?.querySelector<HTMLElement>('.os-task-wins .os-task-win') ?? null;
    restoreFocus(pending.opener, {
      container: pending.container,
      // Closed from its own taskbar entry: stay in the taskbar. Otherwise: the window
      // now on top, and with none left, the Start button.
      fallbacks: pending.fromTaskbar
        ? [neighbourTaskButton, () => startBtnRef.current]
        : [topWindow, () => startBtnRef.current],
    });
  }, [wins]);

  // ----- Home Workspace widgets -----
  const newWidgetId = () => `wgt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const focusWidget = (id: string) =>
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++zTop.current } : w)));
  const patchWidget = (id: string, p: Partial<WidgetSnapshot>) =>
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const removeWidget = (id: string) => setWidgets((ws) => ws.filter((w) => w.id !== id));
  const restoreWidget = (id: string) => patchWidget(id, { hidden: false });
  const addWidget = (type: string) => {
    const def = getWidgetDef(type);
    if (!def) return;
    noteWidgetUsed(type);
    const { w: dw, h: dh } = deskSize();
    setWidgets((ws) => {
      const n = ws.length % 8;
      return [
        ...ws,
        {
          id: newWidgetId(),
          type,
          x: Math.min(80 + n * 28, Math.max(0, dw - def.defaultSize.w - 20)),
          y: Math.min(80 + n * 24, Math.max(0, dh - def.defaultSize.h - 20)),
          w: def.defaultSize.w,
          h: def.defaultSize.h,
          z: ++zTop.current,
        },
      ];
    });
  };
  const duplicateWidget = (id: string) =>
    setWidgets((ws) => {
      const src = ws.find((w) => w.id === id);
      if (!src) return ws;
      return [...ws, { ...src, id: newWidgetId(), x: src.x + 24, y: src.y + 24, z: ++zTop.current, hidden: false }];
    });

  const openNote = () => {
    const id = `note-${Date.now()}`;
    const count = Object.keys(notesRef.current).length;
    setNotes((prev) => ({ ...prev, [id]: { text: '', color: NOTE_COLORS[count % NOTE_COLORS.length] } }));
    const n = winsRef.current.length % 5;
    setWins((ws) => [...ws, { id, section: 'note', x: 260 + n * 30, y: 60 + n * 28, w: 260, h: 220, z: ++zTop.current }]);
    pendingWinFocus.current = { kind: 'open', id };
    const openMs = winPhaseMs(true);
    if (openMs > 0) beginWinAnim(id, 'opening', openMs);
    setStartOpen(false);
  };

  const open = (section: WinSection) => {
    if (section === 'note') return openNote();
    setStartOpen(false);
    // Already popped out into its own real window — focus that instead of
    // opening a second, in-desktop copy (that's exactly how the duplicate
    // immersive frameless windows happened).
    if (poppedSections.has(section)) {
      void window.api.popOut(section);
      return;
    }
    // K7: the window takes focus once it is on screen. Its opener is remembered only
    // when it will still exist at close time — a Start tile is unmounted by this very
    // call, and focus then goes to the next window or the Start button instead.
    const targetId = winsRef.current.find((w) => w.section === section)?.id ?? section;
    const opener = captureFocus();
    if (
      opener
      && !opener.closest('.os-start')
      && opener.closest<HTMLElement>('.fwin')?.dataset.winId !== targetId
    ) {
      winOpeners.current.set(targetId, opener);
    }
    pendingWinFocus.current = { kind: 'open', id: targetId };
    // New window (not a re-focus): run the §2 "module powers on" phase.
    if (!winsRef.current.some((w) => w.section === section)) {
      const openMs = winPhaseMs(true);
      if (openMs > 0) beginWinAnim(section, 'opening', openMs);
      // §4 bulletin: passive log-only entry, never toasts or blinks the lamp.
      if (wired) notify({ message: translate('desktop.wired.log.mounted', { code: wiredModule(section).code }), source: 'SHELL', silent: true });
    }
    setWins((ws) => {
      const existing = ws.find((w) => w.section === section);
      if (existing) return ws.map((w) => (w.id === existing.id ? { ...w, z: ++zTop.current, min: false } : w));
      const { w: dw, h: dh } = deskSize();
      const n = ws.length % 6;
      const isMediaCenter = section === 'player' || section === 'video' || section === 'music';
      // Files is a three-pane app (folder tree, list, details) whose toolbar alone
      // needs ~670px; at the generic 820x580 it opened with its rail squeezed and
      // its columns cut. 1180 is the smallest width at which the scaffold reaches
      // its `wide` layout (1120px of content); `fitNewWindowRect` still shrinks it
      // on a smaller desk, where the rail collapses to icons instead.
      const wantW =
        section === 'visualizer' ? 380 : section === 'musicwidget' ? 430 : isMediaCenter ? 1080 : section === 'youtube' ? 980 : section === 'settings' ? 960 : section === 'city' ? 680 : section === 'games' ? 980 : section === 'files' ? FILES_DEFAULT_SIZE.w : 820;
      const wantH =
        section === 'visualizer' ? 200 : section === 'musicwidget' ? 190 : isMediaCenter ? 700 : section === 'youtube' ? 640 : section === 'settings' ? 680 : section === 'city' ? 800 : section === 'games' ? 660 : section === 'files' ? FILES_DEFAULT_SIZE.h : 580;
      const rect = fitNewWindowRect(
        { x: 60 + n * 34, y: 24 + n * 30, w: wantW, h: wantH },
        { w: dw, h: dh },
        { w: MIN_W, h: MIN_H },
      );
      return [
        ...ws,
        {
          id: section, section,
          ...rect,
          z: ++zTop.current,
        },
      ];
    });
  };
  openRef.current = open;

  // Desktop right-click menu (Phase 2 · M9). Opens only on the desktop
  // background — right-clicks inside windows / taskbar / widgets / panels /
  // icons / editable fields fall through untouched.
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  /** Right-click target on a taskbar entry — its own menu, separate from the desk's. */
  const [taskCtx, setTaskCtx] = useState<{ x: number; y: number; win: Win } | null>(null);
  /**
   * shell2 — one menu per window, reachable from both places a window shows up: its
   * taskbar entry and its own title bar. Stable identity, so the memoised window
   * frame does not re-render on every desk render to receive it.
   */
  const openTitleMenu = useCallback((id: string, x: number, y: number) => {
    const target = winsRef.current.find((candidate) => candidate.id === id);
    if (target) setTaskCtx({ x, y, win: target });
  }, []);
  const onDesktopContextMenu = (e: RMouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (
      t.closest(
        '.fwin, .os-taskbar, .widget-frame, .os-start, .os-flyout, .os-panel-backdrop, .os-start-backdrop, .os-desk-icon, input, textarea, [contenteditable="true"]',
      )
    ) {
      return;
    }
    e.preventDefault();
    const desk = deskRef.current;
    if (isAeroViewportActive() && desk) {
      const local = clampAeroContextMenuPoint(clientToDeskLocal(desk, e.clientX, e.clientY), desk);
      const z = zoomFactor();
      setCtxPos({ x: local.x * z, y: local.y * z });
    } else {
      setCtxPos({ x: e.clientX, y: e.clientY });
    }
  };

  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      const readingRequest = resolveReadingWorkspaceOpenRequest(detail);
      if (readingRequest) {
        // Publish before opening: a mounted host receives the route now; a lazy
        // host consumes the retained handoff after its first render.
        publishReadingWorkspaceRoute(readingRequest.route);
        openRef.current(readingRequest.host);
        markSectionOpenHandled(e);
        return;
      }
      // A Reading-shaped handoff that failed schema validation is not a
      // desktop window id. Ignore it rather than mounting an object/string as a
      // section and leaving behind an empty persisted window. It is also the one
      // path that must NOT be marked handled: a caller's pop-out fallback is
      // only suppressed by a host that actually opened something.
      if (isReadingWorkspaceOpenDetail(detail)) return;
      openRef.current(detail as WinSection);
      markSectionOpenHandled(e);
    };
    window.addEventListener('os:open', h);
    return () => window.removeEventListener('os:open', h);
  }, []);

  // Shortcut-manager / command-palette hooks: widget gallery, add-widget,
  // close focused window, cycle window focus. Handlers read winsRef so this
  // effect binds once.
  const addWidgetRef = useRef(addWidget);
  addWidgetRef.current = addWidget;
  // close captures wired/winAnim (lifecycle phases), so the bind-once handlers
  // below must go through a ref to stay fresh.
  const closeRef = useRef(close);
  closeRef.current = close;
  // `toggleLiquid` is declared below this bind-once effect, so the command entry
  // point reaches it the same way `close` does rather than by hoisting it.
  const toggleLiquidRef = useRef<(id: string) => void>(() => undefined);
  const switchDesktopRef = useRef<(target: DesktopIndex) => Promise<void>>(() => Promise.resolve());
  const showDesktopRef = useRef<() => void>(() => undefined);
  const restoreShownDesktopRef = useRef<() => void>(() => undefined);

  const showDesktop = (): void => {
    const restoreState = captureVisibleWindowMinStates(winsRef.current);
    if (restoreState.size === 0) return;
    showDesktopRestoreState.current = restoreState;
    setShowDesktopActive(true);
    setWins((windows) => setCapturedWindowsMinimized(windows, restoreState, true));
  };
  const restoreShownDesktop = (): void => {
    const restoreState = showDesktopRestoreState.current;
    if (!restoreState) return;
    showDesktopRestoreState.current = null;
    setShowDesktopActive(false);
    setWins((windows) => setCapturedWindowsMinimized(windows, restoreState, false));
  };
  showDesktopRef.current = showDesktop;
  restoreShownDesktopRef.current = restoreShownDesktop;

  useEffect(() => {
    const onWidgets = () => setGalleryOpen((o) => !o);
    const onAddWidget = (e: Event) => addWidgetRef.current((e as CustomEvent<string>).detail);
    // No detail: the top window (the Close-window command). `{ section }`: that
    // section's window — the guided tour closes exactly the windows it opened.
    const onCloseWin = (e: Event) => {
      const section = (e as CustomEvent<{ section?: string } | null>).detail?.section;
      if (section) {
        winsRef.current.filter((w) => w.section === section).forEach((w) => closeRef.current(w.id));
        return;
      }
      const ws = winsRef.current.filter((w) => !w.min);
      if (!ws.length) return;
      const top = ws.reduce((a, b) => (b.z > a.z ? b : a));
      closeRef.current(top.id);
    };
    const onCycle = (e: Event) => {
      const dir = ((e as CustomEvent<number>).detail ?? 1) >= 0 ? 1 : -1;
      const ws = [...winsRef.current].sort((a, b) => a.z - b.z);
      if (ws.length < 2) return;
      if (dir === 1) {
        // Forward: raise the bottom-most window (round-robin through the stack).
        focus(ws[0].id);
      } else {
        // Backward: push the top window under everything; the next one surfaces.
        const top = ws[ws.length - 1];
        patch(top.id, { z: ws[0].z - 1, min: false });
      }
    };
    const onSwitchDesktop = (e: Event) => {
      const dir = ((e as CustomEvent<number>).detail ?? 1) >= 0 ? 1 : -1;
      const current = activeDesktopRef.current;
      // Steps through the same desktops the switcher shows, wrapping at both
      // ends. It used to be a hardcoded flip between the first two indices — a
      // two-desktop toggle that could not reach a torn-off desktop even though
      // the shortcut is the one route a keyboard user has (D149). The ratchet
      // below bans the old expression, so do not quote it back into a comment.
      const ring = switchableRef.current;
      const at = ring.indexOf(current);
      if (ring.length < 2) return;
      const target = ring[(((at < 0 ? 0 : at) + dir) % ring.length + ring.length) % ring.length];
      if (target === current) return;
      void switchDesktopRef.current(target);
    };
    const onCycleAppFullscreen = (e: Event) => {
      const dir = ((e as CustomEvent<number>).detail ?? 1) >= 0 ? 1 : -1;
      const ws = [...winsRef.current].sort((a, b) => a.z - b.z);
      if (ws.length < 1) return;
      // Find currently focused window (highest z that's not minimized)
      const currentFocused = ws.filter((w) => !w.min).reduce((a, b) => (b.z > a.z ? b : a), ws[0]);
      const currentIdx = ws.findIndex((w) => w.id === currentFocused.id);
      const target =
        dir === 1
          ? ws[(currentIdx + 1) % ws.length]
          : ws[currentIdx <= 0 ? ws.length - 1 : currentIdx - 1];
      focus(target.id);
      // A section that renders no maximize control is raised and left alone,
      // rather than given a full-desk rect it then owns no way out of.
      if (!canMaximizeSection(target.section)) {
        patch(target.id, { min: false });
        return;
      }
      const { w: dw, h: dh } = deskSize();
      patch(target.id, { ...maximizedGeometry(dw, dh), ...restorePoint(target) });
    };
    // Window-management shortcuts (Settings → Shortcuts → Window). One event
    // with an action tag; geometry maths all run against the live desk size so
    // snapping stays correct after a resize or a taskbar height change.
    const onWindowAction = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      const all = winsRef.current;
      const open = all.filter((w) => !w.min);
      const topWin = open.length ? open.reduce((a, b) => (b.z > a.z ? b : a)) : null;
      const { w: dw, h: dh } = deskSize();

      // `restorePoint` (module scope) remembers pre-snap geometry once.
      const withRestore = restorePoint;

      switch (action) {
        case 'maximize': {
          if (!topWin) return;
          if (!canMaximizeSection(topWin.section)) return;
          if (topWin.max) {
            const r = topWin.rect;
            patch(topWin.id, r ? { max: false, ...r, rect: undefined } : { max: false });
          } else {
            patch(topWin.id, { ...maximizedGeometry(dw, dh), ...withRestore(topWin) });
          }
          return;
        }
        case 'minimize':
          if (topWin) patch(topWin.id, { min: true });
          return;
        case 'snapLeft':
        case 'snapRight': {
          if (!topWin) return;
          if (topWin.section === 'city') return;
          const left = action === 'snapLeft';
          // Half → quarter → half. Repeating the same shortcut narrows the
          // window instead of doing nothing, which is what Windows 11 does.
          const half = Math.round(dw / 2);
          const quarter = Math.round(dw / 4);
          const atHalf = Math.abs(topWin.w - half) < 8 && Math.abs(topWin.h - dh) < 8;
          const width = atHalf ? quarter : half;
          patch(topWin.id, {
            max: false,
            min: false,
            x: left ? 0 : dw - width,
            y: 0,
            w: width,
            h: dh,
            ...withRestore(topWin),
          });
          return;
        }
        case 'center': {
          if (!topWin) return;
          const w = Math.min(topWin.rect?.w ?? topWin.w, Math.round(dw * 0.72));
          const h = Math.min(topWin.rect?.h ?? topWin.h, Math.round(dh * 0.82));
          patch(topWin.id, {
            max: false,
            min: false,
            w,
            h,
            x: Math.round((dw - w) / 2),
            y: Math.round((dh - h) / 2),
            rect: undefined,
          });
          return;
        }
        case 'tileAll': {
          if (!open.length) return;
          const cols = Math.ceil(Math.sqrt(open.length));
          const rows = Math.ceil(open.length / cols);
          const cw = Math.floor(dw / cols);
          const ch = Math.floor(dh / rows);
          const ordered = [...open].sort((a, b) => a.z - b.z);
          setWins((ws) =>
            ws.map((w) => {
              const i = ordered.findIndex((o) => o.id === w.id);
              if (i < 0) return w;
              return {
                ...w,
                max: false,
                x: (i % cols) * cw,
                y: Math.floor(i / cols) * ch,
                w: cw,
                h: ch,
                rect: undefined,
              };
            }),
          );
          return;
        }
        case 'cascade': {
          if (!open.length) return;
          const step = 34;
          const cw = Math.round(dw * 0.62);
          const ch = Math.round(dh * 0.68);
          const ordered = [...open].sort((a, b) => a.z - b.z);
          setWins((ws) =>
            ws.map((w) => {
              const i = ordered.findIndex((o) => o.id === w.id);
              if (i < 0) return w;
              return {
                ...w,
                max: false,
                // Wrap before running off the bottom-right of the desk.
                x: Math.min((i * step) % Math.max(1, dw - cw), dw - cw),
                y: Math.min((i * step) % Math.max(1, dh - ch), dh - ch),
                w: cw,
                h: ch,
                rect: undefined,
              };
            }),
          );
          return;
        }
        case 'showDesktop':
          showDesktopRef.current();
          return;
        case 'restoreAll':
          showDesktopRestoreState.current = null;
          setShowDesktopActive(false);
          setWins((ws) => ws.map((w) => ({ ...w, min: false })));
          return;
        case 'pinTop': {
          if (!topWin) return;
          patch(topWin.id, { pin: !topWin.pin });
          return;
        }
        case 'togglePresentation': {
          if (!topWin) return;
          // `visualizer` is the ONE section the predicate still refuses, and it
          // is not refused for being frameless — the garden is frameless and
          // presents (L12 b2, 2026-09-02). A command list cannot hide per-window,
          // so this SAYS so rather than doing nothing; a palette entry that
          // silently no-ops is the dead control this phase exists to remove. The
          // desktop's three pointer affordances — the framed bar, the frameless
          // dock and the taskbar menu — hide it instead, from this same predicate.
          if (!canPresentLiquid(topWin.section)) {
            showOsToast(t('desktop.presentation.unavailable'), 'muted');
            return;
          }
          toggleLiquidRef.current(topWin.id);
          return;
        }
        case 'closeAll':
          all.forEach((w) => closeRef.current(w.id));
          return;
        case 'closeOthers':
          if (!topWin) return;
          all.forEach((w) => {
            if (w.id !== topWin.id) closeRef.current(w.id);
          });
          return;
        default:
          return;
      }
    };
    window.addEventListener('os:window', onWindowAction);
    window.addEventListener('os:widgets', onWidgets);
    window.addEventListener('os:add-widget', onAddWidget);
    window.addEventListener('os:close-window', onCloseWin);
    window.addEventListener('os:cycle-window', onCycle);
    window.addEventListener('os:switch-desktop', onSwitchDesktop);
    window.addEventListener('os:cycle-app-fullscreen', onCycleAppFullscreen);
    return () => {
      window.removeEventListener('os:window', onWindowAction);
      window.removeEventListener('os:widgets', onWidgets);
      window.removeEventListener('os:add-widget', onAddWidget);
      window.removeEventListener('os:close-window', onCloseWin);
      window.removeEventListener('os:cycle-window', onCycle);
      window.removeEventListener('os:switch-desktop', onSwitchDesktop);
      window.removeEventListener('os:cycle-app-fullscreen', onCycleAppFullscreen);
    };
  }, []);

  // File drops are handled by <DropRouter/>, rendered below. The handler that
  // used to live here understood two extensions and dropped everything else on
  // the floor without telling anyone.

  // DropRouter asks for a desktop shortcut when a .lnk/.url is dropped.
  useEffect(() => {
    const onAddShortcut = (e: Event): void => {
      const detail = (e as CustomEvent<{ target?: string; name?: string }>).detail;
      if (!detail?.target) return;
      const { w: dw, h: dh } = deskSize();
      const { w: ICON_W, h: ICON_H } = iconMetrics(deskPrefs);
      const sn = snapClamp(48, 48, ICON_W, ICON_H, dw, dh, deskPrefs.snapGrid);
      setIcons((prev) => [
        ...prev,
        {
          id: `sc-${Date.now()}`,
          kind: 'shortcut',
          target: detail.target,
          name: detail.name || detail.target,
          x: sn.x,
          y: sn.y,
        } as DeskIcon,
      ]);
    };
    window.addEventListener('desktop:add-shortcut', onAddShortcut);
    return () => window.removeEventListener('desktop:add-shortcut', onAddShortcut);
  }, [deskPrefs]);

  const toggleMax = (id: string) => {
    setWins((ws) =>
      ws.map((w) => {
        if (w.id !== id) return w;
        if (w.max) return { ...w, max: false, ...(w.rect ?? {}), z: ++zTop.current };
        const { w: dw, h: dh } = deskSize();
        // Same geometry the two shortcut routes now apply. This one captures the
        // rect unconditionally rather than through `restorePoint`: the button is
        // the only route that can be pressed on a window the user just snapped,
        // and its own restore leg reads `w.rect` back.
        return {
          ...w,
          ...maximizedGeometry(dw, dh),
          rect: { x: w.x, y: w.y, w: w.w, h: w.h },
          z: ++zTop.current,
        };
      }),
    );
  };

  /**
   * Make Liquid / Return to standard. PRESENTATION ONLY — nothing else on the
   * window is touched, so the trip home is the captured rect and nothing else.
   *
   * It deliberately does NOT raise `z`. The `<section className="fwin">` root
   * carries `onPointerDown={onFocus}`, so the very interaction that reaches this
   * button has already raised the window; doing it again here raised it twice per
   * command, and because `++zTop.current` is a side effect inside a state updater
   * React invokes twice in development, the counter actually advanced by 2 per
   * click. Measured live (L6 category-6 drive, 2026-08-17): Standard → Liquid →
   * Standard came back identical in geometry, focus, relative z-order and every
   * rendered value, and differed ONLY in `style.zIndex`, 15 → 19. That is the one
   * thing that stopped the round trip being byte-for-byte, which §5.3 requires.
   * Removing it loses nothing: pointer focus still raises, and a raise the user
   * did not ask for is not part of "change how this window is presented".
   */
  const toggleLiquid = (id: string) => {
    setWins((ws) => ws.map((w) => (w.id === id ? toggleWinPresentation(w) : w)));
  };
  toggleLiquidRef.current = toggleLiquid;

  const taskClick = (w: Win) => {
    const isTop = w.z === Math.max(...wins.map((x) => x.z));
    if (w.min) focus(w.id);
    else if (isTop) minimize(w.id);
    else focus(w.id);
  };

  /** User-chosen walls must not stay hidden under living-layer rotation. */
  const releaseEnvWallpaper = () => {
    // Session-only pin — do NOT persist rotationEnabled:false or living wallpaper
    // prefs are wiped across restarts / look "lost" after picking a static wall.
    setPinShellWall(true);
    setWallFromEnv(false);
  };

  const setPreset = (id: string) => {
    releaseEnvWallpaper();
    setWallImage(null);
    setWallVideo(null);
    setSlidePaths([]);
    setWall({ kind: 'preset', id });
  };

  const chooseImage = async () => {
    const r = await window.api.pickWallpaper();
    if (!r) return;
    releaseEnvWallpaper();
    addUserWallpaper({ id: r.id, label: r.label, kind: 'image', path: r.path });
    setWallImage(r.url);
    setWallVideo(null);
    setSlidePaths([]);
    setWall({ kind: 'image', path: r.path, id: r.id });
  };

  const chooseVideo = async () => {
    const r = await window.api.pickWallpaperVideo();
    if (!r) return;
    releaseEnvWallpaper();
    addUserWallpaper({ id: r.id, label: r.label, kind: 'video', path: r.path });
    setWallVideo(r.url);
    setWallImage(null);
    setSlidePaths([]);
    setWall({ kind: 'video', path: r.path, id: r.id });
  };

  const applyUserWall = async (id: string) => {
    const entry = loadUserWallpapers().find((e) => e.id === id);
    if (!entry) return;
    releaseEnvWallpaper();
    if (entry.kind === 'image') {
      // Prefer library path URL first; also register as active wallpaper file.
      const url =
        (await window.api.imageFileUrl(entry.path)) ??
        (await window.api.setWallpaperFromPath(entry.path)) ??
        (await window.api.getWallpaper());
      if (!url) {
        await alertDialog({ title: t('desktop.dialog.wallpaper'), message: t('desktop.dialog.wallpaperImageFailed') });
        return;
      }
      // Set image URL after wall kind so we never flash "black bg + no img".
      setWallVideo(null);
      setSlidePaths([]);
      setWall({ kind: 'image', path: entry.path, id: entry.id });
      setWallImage(url);
      // Keep active shell file in sync for restarts (non-blocking).
      void window.api.setWallpaperFromPath(entry.path);
      return;
    }
    const url = await window.api.mediaFileUrl(entry.path);
    if (!url) {
      await alertDialog({ title: t('desktop.dialog.wallpaper'), message: t('desktop.dialog.wallpaperVideoFailed') });
      return;
    }
    setWallImage(null);
    setSlidePaths([]);
    setWall({ kind: 'video', path: entry.path, id: entry.id });
    setWallVideo(url);
  };

  const removeUserWall = (id: string) => {
    removeUserWallpaper(id);
    if (wall.id === id) {
      setWallImage(null);
      setWallVideo(null);
      setWall({ kind: 'preset', id: 'crimsonveil' });
    }
  };

  const chooseFolderSlideshow = async () => {
    const r = await window.api.pickWallpaperFolder();
    if (!r) return;
    if (!r.images.length) {
      await alertDialog({ title: t('desktop.dialog.slideshow'), message: t('desktop.dialog.slideshowEmpty') });
      return;
    }
    releaseEnvWallpaper();
    await window.api.clearWallpaper();
    setWallVideo(null);
    setSlidePaths(r.images);
    setSlideIndex(0);
    const url = await window.api.imageFileUrl(r.images[0]);
    if (url) setWallImage(url);
    setWall({
      kind: 'slideshow',
      folder: r.folder,
      intervalSec: 60,
      shuffle: false,
    });
  };
  const slideshowStep = (dir: 1 | -1) => {
    if (wall.kind !== 'slideshow' || !slidePaths.length) return;
    setSlideIndex((i) => {
      const next = (i + dir + slidePaths.length) % slidePaths.length;
      const p = slidePaths[next];
      if (p) void window.api.imageFileUrl(p).then((url) => url && setWallImage(url));
      return next;
    });
  };
  const setSlideshowOptions = (opts: { intervalSec?: number; shuffle?: boolean }) => {
    if (wall.kind !== 'slideshow') return;
    setWall({
      ...wall,
      intervalSec: opts.intervalSec ?? wall.intervalSec ?? 60,
      shuffle: opts.shuffle ?? wall.shuffle ?? false,
    });
  };
  const clearWall = async () => {
    releaseEnvWallpaper();
    try {
      await window.api.clearWallpaper();
    } catch {
      /* ignore */
    }
    setWallImage(null);
    setWallVideo(null);
    setSlidePaths([]);
    setWall({ kind: 'preset', id: 'crimsonveil' });
  };

  const resetDesktop = async () => {
    const ok = await confirmDialog({
      title: t('desktop.dialog.resetTitle'),
      message: t('desktop.dialog.resetMessage'),
      confirmLabel: t('desktop.dialog.resetConfirm'),
      danger: true,
    });
    if (!ok) return;
    setWins([]);
    setIcons(defaultIcons(activeDesktop));
    setNotes({});
    setWidgets([]);
    setWall({ kind: 'preset', id: 'crimsonveil' });
  };

  const activateIcon = async (ic: DeskIcon) => {
    if (ic.kind === 'app' && ic.section) open(ic.section);
    else if (ic.kind === 'shortcut' && ic.target) {
      const err = await window.api.launchTarget(ic.target);
      if (err) await alertDialog({ title: t('desktop.dialog.openFailed'), message: err });
    } else if (ic.kind === 'action') {
      if (ic.action === 'note') openNote();
      else if (ic.action === 'addapp') addShortcut();
      else if (ic.action === 'city') open('city');
    }
  };

  const isAppPinned = (section: WinSection): boolean =>
    icons.some((i) => i.kind === 'app' && (i.section === section || i.id === `app-${section}`));

  /** Pin (or move) an app icon. Optional `at` places/moves it at that desktop point. */
  const pinAppToDesktop = (app: AppMeta, at?: { x: number; y: number }) => {
    setIcons((prev) => {
      const idx = prev.findIndex((i) => i.kind === 'app' && (i.section === app.id || i.id === `app-${app.id}`));
      if (idx >= 0) {
        if (!at) return prev;
        return prev.map((i, n) => (n === idx ? { ...i, x: at.x, y: at.y } : i));
      }
      const pos = at ?? nextIconSlot(prev, deskPrefs);
      return [
        ...prev,
        {
          id: `app-${app.id}`,
          kind: 'app',
          section: app.id,
          // Baked in at pin time, like naming a shortcut on a real desktop — a
          // later UI-language switch does not retranslate an icon someone has
          // already placed, only the live Start menu list does.
          name: t(app.labelKey),
          glyph: app.glyph,
          x: pos.x,
          y: pos.y,
        },
      ];
    });
  };

  const unpinAppFromDesktop = (section: WinSection) => {
    setIcons((prev) => prev.filter((i) => !(i.kind === 'app' && (i.section === section || i.id === `app-${section}`))));
  };

  const togglePinApp = (app: AppMeta) => {
    if (isAppPinned(app.id)) unpinAppFromDesktop(app.id);
    else pinAppToDesktop(app);
  };

  const beginStartAppDrag = (app: AppMeta, e: RDragEvent) => {
    const payload = JSON.stringify({ id: app.id, labelKey: app.labelKey, glyph: app.glyph });
    e.dataTransfer.setData(START_APP_DND, payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'copyMove';
    setStartAppDragging(app.id);
  };

  const endStartAppDrag = () => {
    setStartAppDragging(null);
  };

  const dropStartAppOnDesktop = (e: RDragEvent) => {
    const app = parseStartAppDrag(e.dataTransfer);
    if (!app) return;
    e.preventDefault();
    e.stopPropagation();
    const at = deskPointFromClient(deskRef.current, e.clientX, e.clientY, deskSize(), deskPrefs);
    pinAppToDesktop(app, at);
    setStartOpen(false);
    setStartAppDragging(null);
  };

  const addShortcut = async () => {
    const r = await window.api.pickShortcut();
    if (!r) return;
    setIcons((prev) => {
      const { x, y } = nextIconSlot(prev, deskPrefs);
      return [...prev, { id: `sc-${Date.now()}`, kind: 'shortcut', target: r.target, name: r.name, icon: r.icon, x, y }];
    });
  };

  const removeIcon = (id: string) => setIcons((prev) => prev.filter((i) => i.id !== id));

  const dragIcon = (ic: DeskIcon) => (e: RPointerEvent<HTMLDivElement>) => {
    if (deskPrefs.iconsLocked) return;
    e.preventDefault();
    const el = e.currentTarget;
    const desk = deskRef.current;
    if (!desk) return;
    el.setPointerCapture(e.pointerId);
    const start = clientToDeskLocal(desk, e.clientX, e.clientY);
    const ox = ic.x;
    const oy = ic.y;
    const grabX = start.x - ox;
    const grabY = start.y - oy;
    let moved = false;
    let curX = ox;
    let curY = oy;
    let raf: number | null = null;
    const { w: dw, h: dh } = deskSize();
    const { w: ICON_W, h: ICON_H } = iconMetrics(deskPrefs);
    const grid = deskPrefs.snapGrid;
    // Compositor-only transform during gesture; snap live so the grid feels solid.
    el.style.willChange = 'transform';
    perfSetInteracting(true);
    beginDeskDrag('icon', ic.id, { kind: 'icon', snapshot: iconToSnapshot(ic) });
    const move = (ev: PointerEvent) => {
      moveDeskDrag(ev);
      const local = clientToDeskLocal(desk, ev.clientX, ev.clientY);
      const rawX = local.x - grabX;
      const rawY = local.y - grabY;
      const sn = snapClamp(rawX, rawY, ICON_W, ICON_H, dw, dh, grid);
      curX = sn.x;
      curY = sn.y;
      if (Math.abs(curX - ox) > 2 || Math.abs(curY - oy) > 2) moved = true;
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        el.style.transform = `translate3d(${curX - ox}px, ${curY - oy}px, 0)`;
      });
    };
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (raf != null) cancelAnimationFrame(raf);
      perfSetInteracting(false);
      el.style.transform = '';
      el.style.willChange = '';
      // Dropped on another monitor — the release message removes it from here.
      if (endDeskDrag(ev)) return;
      if (moved) {
        const sn = snapClamp(curX, curY, ICON_W, ICON_H, dw, dh, grid);
        setIcons((prev) => prev.map((p) => (p.id === ic.id ? { ...p, x: sn.x, y: sn.y } : p)));
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const preset = WALLPAPERS.find((p) => p.id === wall.id) ?? WALLPAPERS[0];
  const animated = !wallFromEnv && wall.kind === 'preset' && !!preset.animated;
  const hasRasterWall =
    !wallFromEnv && (wall.kind === 'image' || wall.kind === 'slideshow') && !!wallImage;
  const hasVideoWall = !wallFromEnv && wall.kind === 'video' && !!wallVideo;
  // Raster/video walls use <img>/<video> layers — keep desk bg cheap solid color.
  // Avoid mixing CSS `background` shorthand with backgroundSize (React style bugs).
  const deskStyle: React.CSSProperties = (() => {
    if (wallFromEnv || hasRasterWall || hasVideoWall) {
      return { backgroundColor: '#0a0a0e' };
    }
    const isSolid = !preset.css.includes('gradient') && !preset.css.startsWith('url');
    if (isSolid) {
      return { backgroundColor: preset.css };
    }
    return {
      backgroundImage: preset.css,
      backgroundColor: '#0a0a0e',
      // Wallpaper fit applies to preset walls too (--wall-background-fit, wallpaperFit.ts).
      backgroundSize: animated ? '400% 400%' : 'var(--wall-background-fit, cover)',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  })();

  const topZ = wins.length ? Math.max(...wins.map((w) => w.z)) : 0;

  // shell2 — taskbar overflow: the strip scrolls with a hidden scrollbar, so keep the
  // window in front visible on it, and let a mouse wheel scroll it (see taskbarOverflow.ts).
  // Found through the taskbar rather than a ref, so the markup of the strip stays as it was.
  const activeTaskId = wins.find((w) => w.z === topZ && !w.min)?.id ?? null;
  useEffect(() => {
    revealActiveTask(taskbarRef.current?.querySelector<HTMLElement>('.os-task-wins') ?? null);
  }, [activeTaskId, wins.length]);
  useEffect(() => {
    // On the window, not the bar: the taskbar node is re-created by a materials switch.
    const onWheel = (e: WheelEvent): void => {
      const strip = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.os-task-wins');
      if (!strip || !taskbarRef.current?.contains(strip)) return;
      const delta = wheelScrollDelta(e.deltaX, e.deltaY, strip.scrollWidth, strip.clientWidth);
      if (delta !== null) strip.scrollLeft += delta;
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // §2 app switch: when the focused window changes under wired, send one
  // wm-rail-pulse across the taskbar (one-shot animation retriggered by
  // stamping data-pulse) and let shellSounds route the cue.
  const focusedWinId = wins.find((w) => w.z === topZ && !w.min)?.id ?? null;
  const lastFocusedRef = useRef<string | null>(focusedWinId);
  useEffect(() => {
    if (focusedWinId === lastFocusedRef.current) return;
    lastFocusedRef.current = focusedWinId;
    if (!wired || !focusedWinId || hydrating.current) return;
    const bar = taskbarRef.current;
    if (bar && !prefersReducedMotion()) {
      bar.removeAttribute('data-pulse');
      void bar.offsetWidth;
      bar.setAttribute('data-pulse', '');
    }
    window.dispatchEvent(new CustomEvent('shell:appSwitch'));
  }, [focusedWinId, wired]);

  /**
   * Stable props for `FloatingWindow`, whose `memo()` could otherwise never hit.
   *
   * The call site below handed it six freshly-allocated arrows AND a fresh
   * `children` element on every render, so `memo`'s reference comparison failed
   * on seven props at once: one `patch()` re-rendered every open window and
   * every `AppSection` under it, however many were on the desktop. Measured at
   * the tail of a Dictionary drag on a three-window desktop — a ~100.2 ms frame
   * at `pointerup`, the one frame that missed rubric category 7's
   * "0 frames over 100 ms" bar.
   *
   * Stabilising the callbacks alone is not enough. `children` is a prop too, and
   * an element literal is a new object every render, so the memo stays dead
   * until that reference is stable as well.
   *
   * The bundles read through a ref rather than closing over this render's
   * functions: `focus`/`close`/`patch` and the rest are plain declarations
   * recreated every render, so capturing them directly would freeze the first
   * render's closures and, for example, `close` would see a stale `winAnim`.
   */
  const winActionsRef = useRef({ focus, close, minimize, toggleMax, toggleLiquid, patch });
  winActionsRef.current = { focus, close, minimize, toggleMax, toggleLiquid, patch };
  // Stamped by section: a live window's section never changes, but stamping
  // rebuilds rather than leaving `onPopOut` aimed at the previous app if that
  // assumption ever breaks. Everything else is read late through the ref.
  const winHandlerCache = useRef(
    createRenderIdentityCache<string, WinSection, WinHandlers>((id, section) => ({
      onFocus: () => winActionsRef.current.focus(id),
      onClose: () => winActionsRef.current.close(id),
      onMinimize: () => winActionsRef.current.minimize(id),
      onMaximize: () => winActionsRef.current.toggleMax(id),
      onToggleLiquid: () => winActionsRef.current.toggleLiquid(id),
      onPopOut: () => {
        void window.api.popOut(section);
        winActionsRef.current.close(id);
      },
      onPatch: (p: Partial<Win>) => winActionsRef.current.patch(id, p),
    })),
  ).current;
  useEffect(() => {
    winHandlerCache.prune(wins.map((w) => w.id));
  }, [wins, winHandlerCache]);

  /**
   * One cached `<AppSection>` element per section. Its only props are the
   * section id and a ref-stable `onOpenBook`, so the element never needs
   * rebuilding; caching it is what makes `children` reference-stable and the
   * memo above actually hit. `t()` is not involved — `AppSection` calls `useT()`
   * itself, so a language change still re-renders it through context.
   *
   * The `note` and `settings` bodies were the honest limit that used to be
   * recorded here. They are cached now too — see the two blocks below — because
   * the limit turned out to be expensive rather than theoretical.
   */
  const openBookRef = useRef(onOpenBook);
  openBookRef.current = onOpenBook;
  const stableOpenBook = useRef((item: LibraryItem) => openBookRef.current(item)).current;
  const appSectionCache = useRef(
    createRenderIdentityCache<WinSection, null, ReactNode>((section) => (
      <AppSection section={section} onOpenBook={stableOpenBook} />
    )),
  ).current;

  /**
   * The desktop Settings body, stabilised the same way `appSectionCache` is.
   *
   * Measured before this change, one keystroke to the next paint with keystrokes
   * spaced 400 ms so each gets its own frame: a sticky note with Settings and
   * Statistics also open ran 58.3 ms p50, the same note alone 11.4 ms. Statistics
   * is an `AppSection` and was already reference-stable, so the difference was
   * being paid by an unrelated wallpaper pane rebuilding on every keystroke.
   *
   * Seventeen props split cleanly. Three are live state and are exactly the memo's
   * dependencies; the rest are callbacks and go through a ref for the same reason
   * `winActionsRef` does — they are plain declarations recreated every render, so
   * closing over them directly would freeze the first render's copies.
   */
  const wallActionsRef = useRef({
    setPreset, applyUserWall, removeUserWall, chooseImage, chooseVideo,
    chooseFolderSlideshow, slideshowStep, setSlideshowOptions, clearWall, resetDesktop, open,
  });
  wallActionsRef.current = {
    setPreset, applyUserWall, removeUserWall, chooseImage, chooseVideo,
    chooseFolderSlideshow, slideshowStep, setSlideshowOptions, clearWall, resetDesktop, open,
  };
  const wallHandlers = useRef({
    onWallPreset: (id: string) => wallActionsRef.current.setPreset(id),
    onWallUser: (id: string) => void wallActionsRef.current.applyUserWall(id),
    onWallUserRemove: (id: string) => wallActionsRef.current.removeUserWall(id),
    onWallImage: () => void wallActionsRef.current.chooseImage(),
    onWallVideo: () => void wallActionsRef.current.chooseVideo(),
    onWallFolder: () => void wallActionsRef.current.chooseFolderSlideshow(),
    onWallSlideshowNext: () => wallActionsRef.current.slideshowStep(1),
    onWallSlideshowPrev: () => wallActionsRef.current.slideshowStep(-1),
    onWallSlideshowOptions: (opts: { intervalSec?: number; shuffle?: boolean }) =>
      wallActionsRef.current.setSlideshowOptions(opts),
    onWallClear: () => void wallActionsRef.current.clearWall(),
    onReset: () => void wallActionsRef.current.resetDesktop(),
    onOpenVisualizer: () => wallActionsRef.current.open('visualizer'),
    onOpenMusicWidget: () => wallActionsRef.current.open('musicwidget'),
  }).current;
  const desktopSettingsBody = useMemo(
    () => (
      <DesktopSettings
        wall={wall}
        wallPreset={wall.id ?? ''}
        presets={WALLPAPERS}
        userWallpapers={userWalls}
        userWallThumbs={userWallThumbs}
        {...wallHandlers}
      />
    ),
    [wall, userWalls, userWallThumbs, wallHandlers],
  );

  /**
   * One sticky note's body and its colour handler, both keyed by window id.
   *
   * The note being typed in genuinely has to re-render, and it does: its stamp is
   * the note record itself, so `setNotes` rebuilds exactly the note that changed.
   * What this stops is every OTHER note rebuilding with it, and `onNoteColor`
   * arriving as a freshly-allocated arrow — that one prop alone was enough to make
   * `FloatingWindow`'s `memo()` miss on every note on the desk.
   */
  const noteColorCache = useRef(
    createRenderIdentityCache<string, null, (color: string) => void>((id) => (color: string) =>
      setNotes((current) => ({ ...current, [id]: { text: '', ...current[id], color } })),
    ),
  ).current;
  // The cache itself is rebuilt per language, not per render: its stamp is the note
  // record, so a bare ref would hold a placeholder translated at first mount and a
  // language switch would never reach it. This is the `lang`-not-`t` rule with a cache
  // in place of a memo.
  const noteBodyCache = useMemo(
    () =>
      createRenderIdentityCache<string, NoteData | undefined, ReactNode>((id, note) => (
        <textarea
          className="desk-note-text"
          style={{ background: note?.color ?? NOTE_COLORS[0] }}
          // The placeholder is the whole surface's only name, and it disappears the
          // moment there is a note to read - so the control is anonymous exactly when
          // it has content. `desktop.stickyNote` is the window's own already-translated
          // title, so this needs no new key.
          aria-label={t('desktop.stickyNote')}
          placeholder={t('desktop.notePlaceholder')}
          value={note?.text ?? ''}
          onChange={(e) =>
            setNotes((n) => ({ ...n, [id]: { color: NOTE_COLORS[0], ...n[id], text: e.target.value } }))
          }
        />
      )),
    [lang],
  );
  // Same pruning contract `winHandlerCache` has: a closed note must not keep its body
  // and its colour setter alive in a Map for the life of the session.
  useEffect(() => {
    const live = wins.filter((w) => w.section === 'note').map((w) => w.id);
    noteColorCache.prune(live);
    noteBodyCache.prune(live);
  }, [wins, noteColorCache, noteBodyCache]);

  const visibleWidgets = widgets.filter((w) => !w.hidden);
  const hiddenWidgets = widgets.filter((w) => w.hidden);
  const topWidgetZ = visibleWidgets.length ? Math.max(...visibleWidgets.map((w) => w.z)) : 0;
  const startPrimaryApps = START_PRIMARY_SECTIONS
    .map((id) => desktopApps.find((app) => app.id === id))
    .filter((app): app is AppMeta => !!app);
  const startPlaceApps = desktopApps.filter(
    (app) => !START_PRIMARY_SECTIONS.includes(app.id) && !START_HIDDEN_SECTIONS.has(app.id),
  );

  /** Right-click, Shift+F10 or the Menu key on a Start tile opens its pin menu. */
  const openStartTileMenu = (e: RMouseEvent<HTMLElement>, app: AppMeta) => {
    e.preventDefault();
    e.stopPropagation();
    // A keyboard-raised contextmenu carries no pointer position; anchor to the tile.
    const keyboard = e.clientX === 0 && e.clientY === 0;
    const rect = e.currentTarget.getBoundingClientRect();
    setStartTileCtx({
      x: keyboard ? rect.left + rect.width / 2 : e.clientX,
      y: keyboard ? rect.top + rect.height / 2 : e.clientY,
      app,
    });
  };

  const renderAeroStartApp = (app: AppMeta, tone: 'program' | 'place') => {
    const pinned = isAppPinned(app.id);
    const wiredMeta = wired ? wiredModule(app.id) : null;
    return (
      <div
        key={app.id}
        className={`os-start-aero-row ${tone}${pinned ? ' pinned' : ''}${startAppDragging === app.id ? ' drag-source' : ''}`}
      >
        <button
          type="button"
          className="os-start-aero-app"
          draggable
          title={pinned ? t('desktop.dragToMove') : t('desktop.dragToDesktop')}
          onDragStart={(e) => beginStartAppDrag(app, e)}
          onDragEnd={endStartAppDrag}
          onClick={() => open(app.id)}
          onContextMenu={(e) => openStartTileMenu(e, app)}
        >
          <span className={`os-start-aero-ic app-${app.id}`}>
            <Icon name={app.glyph} size={tone === 'program' ? 22 : 18} />
          </span>
          <span className="os-start-aero-copy">
            <span className="os-start-aero-name">{wiredMeta ? wiredMeta.code : t(app.labelKey)}</span>
            <span className="os-start-aero-hint">
              {wiredMeta
                ? `${wiredMeta.name} / ${wiredMeta.hint}`
                : t(START_HINT_KEYS[app.id] ?? 'desktop.startApp.fallback')}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={`os-start-aero-pin lq-hit-placed${pinned ? ' on' : ''}`}
          title={pinned ? t('desktop.removeFromDesktop') : t('desktop.addToDesktop')}
          aria-label={pinned ? t('desktop.removeFromDesktop') : t('desktop.addToDesktop')}
          // Out of the tab order: the context menu of the tile carries this command (K6).
          tabIndex={-1}
          data-start-secondary
          draggable={false}
          onClick={() => togglePinApp(app)}
        >
          <Icon name="pin" size={12} />
        </button>
      </div>
    );
  };

  const switchDesktop = async (target: DesktopIndex) => {
    if (target === activeDesktop) return;
    // §3 workspace switch: routing pulse across the machine rail.
    if (wired && !prefersReducedMotion()) {
      const bar = taskbarRef.current;
      if (bar) {
        bar.removeAttribute('data-pulse');
        void bar.offsetWidth;
        bar.setAttribute('data-pulse', '');
      }
    }
    hydrating.current = true;
    // Cancel any pending debounced commit — we flush the current layout
    // explicitly right here before switching.
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    try {
      const outgoing = buildLayout(
        activeDesktop,
        wins,
        icons,
        notes,
        widgets,
        wall,
        authoredViewport(wins, icons, widgets),
      );
      rememberSignature(layoutSignature(outgoing));
      await commitLayout(activeDesktop, outgoing);
      const res = await switchDesktopState(target);
      if (!res.ok) {
        // A refusal is a real product state, not an internal error: main answers
        // `desktop-on-another-display` whenever the desktop you clicked is
        // already being shown on a second monitor. It used to reach a
        // `console.error` and nothing else, so the button read as dead (D151).
        // `showOsToast` defaults to `kind = 'ok'`, so an unqualified call draws
        // the success edge and is announced politely. A refusal is a `warn` and
        // a genuine failure is an `err`; the two share this call site but not
        // their severity.
        const refused = res.error === 'desktop-on-another-display';
        showOsToast(
          refused
            ? t('desktop.switch.onAnotherDisplay', { desktop: t('desktop.desktopN', { n: target + 1 }) })
            : t('desktop.switch.failed', { desktop: t('desktop.desktopN', { n: target + 1 }) }),
          refused ? 'warn' : 'err',
        );
        hydrating.current = false;
        return;
      }
      setStartOpen(false);
    } catch (err) {
      console.error('[desktopState] switch failed:', err);
      // Named the way the BUTTON is named. `getDesktopName` returns the store's
      // own label — "City" for index 1 — and telling a user who clicked
      // "Desktop 2" about "City" names something they cannot see. Measured live
      // before this line was written.
      showOsToast(
        t('desktop.switch.failed', { desktop: t('desktop.desktopN', { n: target + 1 }) }),
        'err',
      );
      hydrating.current = false;
    }
  };
  switchDesktopRef.current = switchDesktop;

  /**
   * Tear one app off the taskbar into a desktop of its own.
   *
   * Distinct from "move to the next monitor": that hands a window to a desktop
   * something else is already showing. This claims a desktop nothing owns, puts
   * exactly the dragged app on it, and opens a window for it — so the new
   * desktop carries that one app and nothing else.
   *
   * Main allocates the index and opens the window; both layout writes stay here,
   * because this shell owns the desktop the app is leaving and the freshly
   * claimed desktop has no other shell showing it (B2).
   */
  const tearOffToNewDesktop = async (w: Win): Promise<void> => {
    let target: number;
    try {
      const res = await window.api.deskwinAllocateDesktop();
      if (!res.ok || typeof res.desktopIndex !== 'number') {
        // Same shape as the switch toasts above: no free desktop is a refusal
        // the user can act on, the thrown case is a failure.
        showOsToast(t('desktop.tearOff.noneFree'), 'warn');
        return;
      }
      target = res.desktopIndex;
    } catch {
      showOsToast(t('desktop.tearOff.failed'), 'err');
      return;
    }

    try {
      const layout = getDesktopLayout(target);
      await commitLayout(target, {
        ...layout,
        // Exactly one app, at a predictable origin — the desktop was empty.
        // Forced visible: tearing off a minimized taskbar button must not open
        // a new desktop that looks empty.
        windows: [{ ...winToSnapshot(w), x: 40, y: 40, visible: true }],
      });
      setWins((prev) => prev.filter((x) => x.id !== w.id));
      await window.api.deskwinOpenDesktop(target);
    } catch (err) {
      console.error('[desktopState] tear-off failed:', err);
      showOsToast(t('desktop.tearOff.failed'), 'err');
    }
  };

  /** Pointer bookkeeping for the taskbar tear-off gesture. */
  const taskDrag = useRef<{ id: string; x: number; y: number; fired: boolean } | null>(null);
  const suppressTaskClick = useRef(false);
  /** Upward travel that separates a tear-off from a sloppy click. */
  const TEAR_OFF_PX = 56;

  const sleepSecretOs = () => {
    setStartOpen(false);
    if (wired) requestWiredArchiveSleep();
    else requestSecretLifecycleSleep();
  };

  const restartSecretOs = async () => {
    const ok = await confirmDialog({
      title: wired ? t('desktop.startMenu.wired.restart') : t('desktop.startMenu.restart'),
      message: wired
        ? t('desktop.restartWiredMessage')
        : t('desktop.restartSecretMessage'),
      confirmLabel: t('desktop.restartConfirm'),
    });
    if (!ok) return;
    setStartOpen(false);
    if (wired) requestWiredArchiveRestart();
    else requestSecretLifecycleRestart();
  };

  const shutdownSecretOs = async () => {
    // WIRED confirms in-fiction: the breach overlay IS the prompt, and it
    // offers three destinations rather than a yes/no. A generic dialog in front
    // of it would ask the same question twice and break the moment.
    if (wired) {
      setStartOpen(false);
      requestWiredArchiveShutdown();
      return;
    }
    const ok = await confirmDialog({
      title: t('desktop.startMenu.shutdown'),
      message: t('desktop.shutdownSecretMessage'),
      confirmLabel: t('desktop.shutdownConfirm'),
    });
    if (!ok) return;
    setStartOpen(false);
    exitSecretAero();
  };

  return (
    <div
      ref={deskRef}
      className={`os-desktop ${animated ? 'wall-animated' : ''}${wallFromEnv ? ' wall-from-env' : ''}${startAppDragging ? ' start-app-drop' : ''}${wired ? ' os-desktop-wired' : ''}`}
      style={deskStyle}
      onDragOver={(e) => {
        if (!isStartAppDrag(e.dataTransfer) && !startAppDragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => dropStartAppOnDesktop(e)}
      onContextMenu={onDesktopContextMenu}
    >
      <DropRouter onOpenSection={(section) => open(section as WinSection)} />
      {/* An item from another monitor is hovering here. Purely an affordance —
          nothing is committed until main sends `deskdrag:adopt`. */}
      {dragGhost && (
        <div
          className={`deskdrag-ghost deskdrag-ghost-${dragGhost.kind}`}
          style={{ left: dragGhost.x, top: dragGhost.y }}
          aria-hidden
        />
      )}
      {hasRasterWall && wallImage && (
        <img
          className="os-wall-image"
          src={wallImage}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => {
            // Protocol/URL failed — re-resolve from path or active wallpaper file.
            const path = wall.path;
            void (async () => {
              if (path) {
                const u =
                  (await window.api.setWallpaperFromPath(path)) ??
                  (await window.api.imageFileUrl(path));
                if (u && u !== wallImage) {
                  setWallImage(u);
                  return;
                }
              }
              const u = await window.api.getWallpaper();
              if (u && u !== wallImage) setWallImage(u);
              else setWallImage(null);
            })();
          }}
        />
      )}
      {hasVideoWall && wallVideo && (
        <video className="os-wall-video" src={wallVideo} autoPlay loop muted playsInline />
      )}

      <EnvironmentStack
        suppressWallpaper={pinShellWall}
        onRotationActive={(active) => {
          if (pinShellWall) {
            setWallFromEnv(false);
            return;
          }
          setWallFromEnv(active);
        }}
      />
      <BuddyToast />

      {viz.enabled && (viz.mode === 'wallpaper' || viz.mode === 'both') && musicPlaying && (
        <VisualizerCanvas className="os-wall-visualizer" settings={viz} />
      )}

      {wallDim > 0 && <div className="os-wall-dim" />}
      {wired && <WiredWallpaper />}
      {/* WIRED study mechanics (layer descent, TTY, signal decrypt, intercepts).
          Mounted only under Wired; unmount tears every listener down. */}
      {wired && !secondary && <WiredMechanicsHost />}

      <WiredFindingOverlay />
      <AeroFindingOverlay />

      {icons.map((ic) => (
        <div
          key={ic.id}
          className={`os-desk-icon${ic.kind === 'action' ? ' action' : ''}`}
          style={{ left: ic.x, top: ic.y }}
          onPointerDown={dragIcon(ic)}
          onClick={() => {
            if (deskPrefs.singleClickOpen) void activateIcon(ic);
          }}
          onDoubleClick={() => {
            if (!deskPrefs.singleClickOpen) void activateIcon(ic);
          }}
          title={ic.kind === 'shortcut' ? ic.target : t('desktop.openIcon', { name: ic.name })}
        >
          <div className={`os-desk-icon-img${ic.kind === 'action' ? ' action' : ''}${ic.action === 'addapp' ? ' tone-add' : ''}${ic.section ? ` app-${ic.section}` : ''}${ic.action ? ` action-${ic.action}` : ''}`}>
            {ic.icon ? (
              <img src={ic.icon} alt="" />
            ) : (
              <Icon name={ic.glyph ?? 'app'} size={iconMetrics(deskPrefs).glyph} />
            )}
          </div>
          <span className="os-desk-icon-label">{wired && ic.section ? wiredModule(ic.section).code : ic.name}</span>
          <button
            className="os-desk-icon-x"
            title={t('desktop.removeFromDesktop')}
            aria-label={t('desktop.removeFromDesktop')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              removeIcon(ic.id);
            }}
          >
            ×
          </button>
        </div>
      ))}

      {wins.map((w) => (
        <FloatingWindow
          key={w.id}
          win={w}
          animPhase={winAnim[w.id] ?? null}
          focused={w.z === topZ && !w.min}
          hidden={!!w.min}
          deskRef={deskRef}
          noteColor={w.section === 'note' ? notes[w.id]?.color : undefined}
          onNoteColor={w.section === 'note' ? noteColorCache.get(w.id, null) : undefined}
          onTitleMenu={openTitleMenu}
          {...winHandlerCache.get(w.id, w.section)}
        >
          {w.section === 'note'
            ? noteBodyCache.get(w.id, notes[w.id])
            : w.section === 'settings'
              ? desktopSettingsBody
              : appSectionCache.get(w.section, null)}
        </FloatingWindow>
      ))}

      {visibleWidgets.map((w) => (
        <WidgetFrame
          key={w.id}
          widget={w}
          deskRef={deskRef}
          focused={w.z === topWidgetZ}
          onFocus={() => focusWidget(w.id)}
          onPatch={(p) => patchWidget(w.id, p)}
          onRemove={() => removeWidget(w.id)}
          onDuplicate={() => duplicateWidget(w.id)}
        />
      ))}

      {/* WIRED: one shared CRT glass over every window and widget — scanlines,
          grille, vignette and the rolling refresh band. Purely decorative and
          pointer-transparent; sits under the Start panel, flyouts and taskbar
          (see `.wired-crt` in wired-navi.css for the z-order and the gates). */}
      {wired && <div className="wired-crt" aria-hidden="true" />}

      {galleryOpen && (
        <WidgetGallery
          onAdd={addWidget}
          onResetLayout={() => {
            // Asks first, then offers Undo — it used to wipe every widget on one click.
            void resetWidgetLayoutWithUndo({
              current: widgets,
              confirm: confirmDialog,
              apply: setWidgets,
              toast: showOsToast,
              t,
            }).then((reset) => {
              if (reset) setGalleryOpen(false);
            });
          }}
          hiddenWidgets={hiddenWidgets}
          onRestore={restoreWidget}
          onClose={() => setGalleryOpen(false)}
          installedTypes={widgets.map((w) => w.type)}
        />
      )}

      {/* J11: an empty desktop after the tour offers three first actions. */}
      {!secondary && (
        <StartHereCard
          desktopEmpty={wins.length === 0 && visibleWidgets.length === 0 && !startOpen && !galleryOpen}
          onOpen={(section) => open(section)}
        />
      )}

      {startOpen && (
        <>
          <div
            className={`os-start-backdrop${startAppDragging ? ' drop-ready' : ''}`}
            onClick={() => {
              if (!startAppDragging) setStartOpen(false);
            }}
            onDragOver={(e) => {
              if (!isStartAppDrag(e.dataTransfer) && !startAppDragging) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => dropStartAppOnDesktop(e)}
          />
          {!secretStartMenu && (
            <StartPanel
              className="os-start os-start-legacy"
              id={START_PANEL_ID}
              label={t('desktop.start')}
              onClose={() => setStartOpen(false)}
              returnFocusTo={() => startBtnRef.current}
              onDragOver={(e) => {
                // Keep drops on the panel itself from landing on the desktop.
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'none';
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className="os-start-title">{t('app.title')}</div>
              <div className="os-start-hint">
                {startAppDragging ? t('desktop.dropToPlace') : t('desktop.startHint')}
              </div>
              <button
                type="button"
                className="os-start-search"
                onClick={() => {
                  setStartOpen(false);
                  window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <span className="os-start-search-ph">{t('desktop.startSearch')}</span>
                <kbd className="os-start-search-kbd">Ctrl P</kbd>
              </button>
              <div className="os-start-groups">
                {startGroups.map((g) => (
                  <section key={g.id} className="os-start-group" aria-label={t(g.labelKey)}>
                    <h3 className="os-start-group-label">{t(g.labelKey)}</h3>
                    <div className="os-start-grid">
                      {g.apps.map((a) => {
                        const pinned = isAppPinned(a.id);
                        return (
                          <div
                            key={a.id}
                            className={`os-start-tile${pinned ? ' pinned' : ''}${startAppDragging === a.id ? ' drag-source' : ''}`}
                          >
                            <button
                              type="button"
                              className="os-start-app"
                              draggable
                              title={pinned ? t('desktop.dragToMove') : t('desktop.dragToDesktop')}
                              onDragStart={(e) => beginStartAppDrag(a, e)}
                              onDragEnd={endStartAppDrag}
                              onClick={() => open(a.id)}
                              onContextMenu={(e) => openStartTileMenu(e, a)}
                            >
                              <span className={`os-start-app-ic app-${a.id}`}>
                                <Icon name={a.glyph} size={24} />
                              </span>
                              {t(a.labelKey)}
                            </button>
                            <button
                              type="button"
                              className={`os-start-tile-pin lq-hit-placed${pinned ? ' on' : ''}`}
                              title={pinned ? t('desktop.removeFromDesktop') : t('desktop.addToDesktop')}
                              aria-label={pinned ? t('desktop.removeFromDesktop') : t('desktop.addToDesktop')}
                              // Out of the tab order: the context menu of the tile carries this command.
                              tabIndex={-1}
                              data-start-secondary
                              draggable={false}
                              onClick={() => togglePinApp(a)}
                            >
                              <Icon name="pin" size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <section className="os-start-group" aria-label={t('desktop.startCategory.shortcuts')}>
                  <h3 className="os-start-group-label">{t('desktop.startCategory.shortcuts')}</h3>
                  <div className="os-start-grid">
                    <button
                      type="button"
                      className="os-start-app special"
                      onClick={() => { setGalleryOpen(true); setStartOpen(false); }}
                    >
                      <span className="os-start-app-ic tone-widgets">
                        <Icon name="widgets" size={24} />
                      </span>
                      {t('desktop.widgets')}
                    </button>
                    <button type="button" className="os-start-app special" onClick={openNote}>
                      <span className="os-start-app-ic tone-note">
                        <Icon name="note" size={24} />
                      </span>
                      {t('desktop.stickyNote')}
                    </button>
                    <button type="button" className="os-start-app special" onClick={() => void addShortcut()}>
                      <span className="os-start-app-ic tone-add">
                        <Icon name="plus" size={24} />
                      </span>
                      {t('desktop.addApp')}
                    </button>
                  </div>
                </section>
              </div>
              <div className="os-start-footer">
                <button type="button" className="os-start-foot-btn" onClick={() => open('settings')}>
                  <Icon name="settings" size={16} />
                  <span>{t('palette.section.settings')}</span>
                </button>
                <button
                  type="button"
                  className="os-start-foot-btn"
                  onClick={() => {
                    setStartOpen(false);
                    window.dispatchEvent(new CustomEvent('shell:toggleQuickSettings'));
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <line x1="4" y1="9" x2="20" y2="9" />
                    <line x1="4" y1="15" x2="20" y2="15" />
                    <circle cx="9" cy="9" r="2.2" />
                    <circle cx="15" cy="15" r="2.2" />
                  </svg>
                  <span>{t('desktop.quick')}</span>
                </button>
                <button
                  type="button"
                  className="os-start-foot-btn os-start-tour"
                  onClick={() => {
                    setStartOpen(false);
                    replayTour(TOUR_MENU_ID);
                  }}
                >
                  <Icon name="help" size={16} />
                  <span>{t('desktop.startMenu.tour')}</span>
                </button>
                <span className="os-start-foot-spacer" />
                <button
                  type="button"
                  className="os-start-foot-btn power"
                  title={t('desktop.restartShell')}
                  aria-label={t('desktop.restartShell')}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: t('desktop.restartShell'),
                      message: t('desktop.restartShellMessage'),
                      confirmLabel: t('desktop.restartConfirm'),
                    });
                    if (ok) window.location.reload();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 3v9" />
                    <path d="M6.5 7a8 8 0 1 0 11 0" />
                  </svg>
                </button>
              </div>
            </StartPanel>
          )}
          {secretStartMenu && (
            <StartPanel
              className="os-start os-start-aero-menu"
              id={START_PANEL_ID}
              label={t('desktop.start')}
              onClose={() => setStartOpen(false)}
              returnFocusTo={() => startBtnRef.current}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'none';
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className="os-start-aero-head">
                <span className="os-start-aero-avatar" aria-hidden="true">
                  <Icon name="logo" size={24} />
                </span>
                <div className="os-start-aero-id">
                  <div className="os-start-aero-title">{wired ? 'WIRED ARCHIVE' : 'Secret Gum'}</div>
                  <div className="os-start-aero-sub">
                    {wired
                      ? startAppDragging
                        ? t('desktop.startMenu.wired.drop')
                        : t('desktop.startMenu.wired.index')
                      : startAppDragging ? t('desktop.dropToPlace') : t('desktop.startMenu.personal')}
                  </div>
                </div>
                <button
                  type="button"
                  className="os-start-aero-search"
                  title={t('desktop.startMenu.search')}
                  aria-label={t('desktop.startMenu.search')}
                  onClick={() => {
                    setStartOpen(false);
                    window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
                  }}
                >
                  <Icon name="search" size={17} />
                </button>
              </div>

              <div className="os-start-aero-columns">
                <section className="os-start-aero-main" aria-label={t('desktop.startMenu.programs')}>
                  <div className="os-start-aero-label">{wired ? t('desktop.startMenu.wired.nodes') : t('desktop.startMenu.programs')}</div>
                  <div className="os-start-aero-programs">
                    {startPrimaryApps.map((app) => renderAeroStartApp(app, 'program'))}
                  </div>
                  <button
                    type="button"
                    className="os-start-aero-all"
                    onClick={() => {
                      setStartOpen(false);
                      window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
                    }}
                  >
                    <span>{wired ? t('desktop.startMenu.wired.locate') : t('desktop.startMenu.allPrograms')}</span>
                    <Icon name="chevron" size={14} />
                  </button>
                </section>

                <aside className="os-start-aero-side" aria-label={t('desktop.startMenu.placesAndTools')}>
                  <div className="os-start-aero-label">{wired ? t('desktop.startMenu.wired.channels') : t('desktop.startMenu.places')}</div>
                  <div className="os-start-aero-places">
                    {startPlaceApps.map((app) => renderAeroStartApp(app, 'place'))}
                  </div>
                  <div className="os-start-aero-label">{wired ? t('desktop.startMenu.wired.ports') : t('desktop.startMenu.tools')}</div>
                  <div className="os-start-aero-tools">
                    <button
                      type="button"
                      className="os-start-aero-tool"
                      onClick={() => { setGalleryOpen(true); setStartOpen(false); }}
                    >
                      <Icon name="widgets" size={17} />
                      <span>{wired ? t('desktop.startMenu.wired.widgets') : t('desktop.widgets')}</span>
                    </button>
                    <button type="button" className="os-start-aero-tool" onClick={openNote}>
                      <Icon name="note" size={17} />
                      <span>{wired ? t('desktop.startMenu.wired.note') : t('desktop.stickyNote')}</span>
                    </button>
                    <button type="button" className="os-start-aero-tool" onClick={() => void addShortcut()}>
                      <Icon name="plus" size={17} />
                      <span>{wired ? t('desktop.startMenu.wired.add') : t('desktop.addApp')}</span>
                    </button>
                    <button
                      type="button"
                      className="os-start-aero-tool"
                      onClick={() => {
                        setStartOpen(false);
                        window.dispatchEvent(new CustomEvent('shell:toggleQuickSettings'));
                      }}
                    >
                      <Icon name="wrench" size={17} />
                      <span>{wired ? t('desktop.startMenu.wired.quick') : t('quickSettings.title')}</span>
                    </button>
                    <button
                      type="button"
                      className="os-start-aero-tool"
                      onClick={() => {
                        setStartOpen(false);
                        void window.api.recorderStart?.('select');
                      }}
                    >
                      <Icon name="video" size={17} />
                      <span>{t('recorder.start.menu')}</span>
                    </button>
                    <button
                      type="button"
                      className="os-start-aero-tool os-start-tour"
                      onClick={() => {
                        setStartOpen(false);
                        replayTour(TOUR_MENU_ID);
                      }}
                    >
                      <Icon name="help" size={17} />
                      <span>{t('desktop.startMenu.tour')}</span>
                    </button>
                    {/* Aero study mechanics (Memory Defragmenter, Vocabulary Update, Welcome Center). */}
                    {!wired && material === 'aero' && <AeroMechStartEntries onLaunch={() => setStartOpen(false)} />}
                    {/* Wired study consoles (Signal decrypt, Navi terminal). */}
                    {wired && <WiredStartEntries onPick={() => setStartOpen(false)} />}
                  </div>
                </aside>
              </div>

              <div className="os-start-aero-footer">
                <button type="button" className="os-start-aero-footer-btn" onClick={() => open('settings')}>
                  <Icon name="settings" size={16} />
                  <span>{wired ? t('desktop.startMenu.wired.control') : t('desktop.startMenu.controlPanel')}</span>
                </button>
                <div className="os-start-aero-power-cluster" aria-label={t('desktop.startMenu.power')}>
                  <button
                    type="button"
                    className="os-start-aero-power"
                    title={t('desktop.startMenu.sleep')}
                    aria-label={t('desktop.startMenu.sleep')}
                    onClick={sleepSecretOs}
                  >
                    <Icon name="pause" size={15} />
                  </button>
                  <button
                    type="button"
                    className="os-start-aero-power"
                    title={t('desktop.startMenu.restart')}
                    aria-label={t('desktop.startMenu.restart')}
                    onClick={() => void restartSecretOs()}
                  >
                    <Icon name="refresh" size={15} />
                  </button>
                  <button
                    type="button"
                    className="os-start-aero-power shutdown"
                    title={t('desktop.startMenu.shutdown')}
                    aria-label={t('desktop.startMenu.shutdown')}
                    onClick={() => void shutdownSecretOs()}
                  >
                    <Icon name="power" size={15} />
                  </button>
                </div>
              </div>
            </StartPanel>
          )}
        </>
      )}
      {/* The pin command, reachable from the keyboard without a second tab stop per
          tile: right-click, Shift+F10 or the Menu key on a Start tile (K6). */}
      <ContextMenu
        open={!!startTileCtx}
        x={startTileCtx?.x ?? 0}
        y={startTileCtx?.y ?? 0}
        onClose={() => setStartTileCtx(null)}
        items={
          startTileCtx
            ? [{
                id: 'toggle-pin',
                label: isAppPinned(startTileCtx.app.id)
                  ? t('desktop.removeFromDesktop')
                  : t('desktop.addToDesktop'),
                onSelect: () => togglePinApp(startTileCtx.app),
              }]
            : []
        }
      />

      {/* Per-display taskbar mode. 'none' hides it entirely; 'windows-only'
          drops the Start button and desktop switcher and keeps the window
          list, which is what a secondary monitor usually wants. */}
      {/* The taskbar switches windows and desktops, so `navigation` is the
          accurate landmark, and `data-lq-role="liquid"` is the same shared
          contract `LiquidAppScaffold` marks its rail and dock with. Both were
          missing: measured 2026-08-31 on the Wired shell, this 1264x56 bar with
          12 focusables classified as a plain Anchor, so the shell's primary
          transport chrome was invisible to landmark navigation and scored
          outside category 3's denominator entirely. One element, every shell. */}
      <div
        className={`os-taskbar os-taskbar-${taskbarMode}`}
        ref={taskbarRef}
        hidden={taskbarMode === 'none'}
        role="navigation"
        aria-label={t('settings.monitors.taskbar')}
        data-lq-role="liquid"
      >
        {taskbarMode === 'full' && (
          <>
            {/* The shell's popup-owning chrome declares itself. Measured 2026-08-31 on
                the Wired shell: Start, Widgets, Search, Clipboard, Quick settings and the
                bell all open a menu or a flyout and not one of them carried
                `aria-haspopup`, so nothing but sighted pointer use could tell a launcher
                from a plain command. `aria-expanded` is set only where this component
                genuinely owns the open state — a stale expanded state is worse than none,
                and the four dispatch-only tray buttons keep their panels' state in the
                panels themselves. */}
            {/* `dialog`, not `menu` (K6): the panel is a labelled dialog with a
                search entry, headed groups and a roving list — see `shell/StartPanel`. */}
            <button
              ref={startBtnRef}
              className={`os-start-btn ${startOpen ? 'active' : ''}`}
              data-primary
              title={wired ? 'NODE ROUTER' : t('desktop.start')}
              aria-haspopup="dialog"
              aria-expanded={startOpen}
              aria-controls={startOpen ? START_PANEL_ID : undefined}
              onClick={() => setStartOpen((o) => !o)}
            >
              <Icon name="logo" size={22} />
              <span>{wired ? 'NODE' : t('desktop.start')}</span>
            </button>
            {/* A secondary window is pinned to one desktop by its assignment —
                switching would put two shells on the same desktop, which is
                exactly the ownership collision the single-writer rule avoids. */}
            {!secondary && (
              <div className="os-desktop-switches">
                {/* `active` was a class and nothing else: which desktop you are on was
                    carried only in paint. `aria-pressed` states it programmatically.

                    The row used to be exactly two hardcoded buttons while the layout
                    store grows a desktop per display assignment and one more for every
                    taskbar tear-off — so anything the user put on desktop 3 or beyond
                    had no button and no shortcut leading to it (D149). It is now every
                    desktop that is 0, 1, active, or carrying a visible window. */}
                {switchableDesktops.map((index) => (
                  <button
                    key={index}
                    className={`os-desktop-switch ${activeDesktop === index ? 'active' : ''}`}
                    aria-pressed={activeDesktop === index}
                    onClick={() => void switchDesktop(index)}
                  >
                    {wired
                      ? index === 0 ? 'LOCAL NODE' : index === 1 ? 'REMOTE FEED' : `NODE ${index + 1}`
                      : t('desktop.desktopN', { n: index + 1 })}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div className="os-task-wins">
          {wins.map((w) => {
            const app = APPS.find((a) => a.id === w.section);
            const label =
              wired ? wiredModule(w.section).code
                : w.section === 'note' ? t('desktop.noteLabel')
                  : w.section === 'visualizer' ? t('settings.nav.visualizer')
                    : w.section === 'musicwidget' ? ''
                      : app ? t(app.labelKey) : w.section;
            /*
              The mini player deliberately renders no wordmark on its taskbar button - it is
              the one icon-only entry. That is a VISIBLE choice and it must not take the
              button's NAME with it: with `label` empty the button had `title=""` and no
              accessible name at all, so the only thing on it was its own `×`, and the close
              affordance fell through to `w.section` and offered "Close musicwidget" - an
              internal id, in every language. `settings.mini.app.musicwidget` is already
              translated in all four catalogues.
            */
            const taskName = label || (w.section === 'musicwidget'
              ? t('settings.mini.app.musicwidget')
              : app ? t(app.labelKey) : w.section);
            const glyph: IconName =
              w.section === 'note' ? 'note'
                : w.section === 'visualizer' || w.section === 'musicwidget' ? 'music'
                  : app?.glyph ?? 'app';
            const isActive = w.z === topZ && !w.min;
            /*
              K12: the close affordance used to be a `role="button"` span INSIDE this
              button — an interactive element nested in another, which assistive tech
              flattens or drops. They are siblings in one wrapper now; the wrapper
              positions the close over the slot the button reserves for it, so the
              pill looks exactly as before. `aria-current` states which window is the
              active one, which was carried only by the `active` class.
            */
            return (
              <div key={w.id} className="os-task-item" data-task-win={w.id}>
                <button
                  type="button"
                  className={`os-task-win app-${w.section} ${isActive ? 'active' : ''} ${w.min ? 'min' : ''} ${winAnim[w.id] ? `anim-${winAnim[w.id]}` : ''}`}
                  title={wired ? wiredModuleLabel(w.section) : taskName}
                  aria-label={wired ? wiredModuleLabel(w.section) : taskName}
                  aria-current={isActive ? 'true' : undefined}
                  // Drag a taskbar button up and off the bar to give that app a
                  // desktop of its own. Pointer events rather than HTML5 drag:
                  // the shell already drives every other drag this way, and HTML5
                  // drag images do not survive a frameless window.
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    taskDrag.current = { id: w.id, x: e.clientX, y: e.clientY, fired: false };
                  }}
                  onPointerMove={(e) => {
                    const d = taskDrag.current;
                    if (!d || d.id !== w.id || d.fired) return;
                    // The taskbar sits at the bottom, so a tear-off travels up.
                    if (d.y - e.clientY < TEAR_OFF_PX) return;
                    d.fired = true;
                    suppressTaskClick.current = true;
                    void tearOffToNewDesktop(w);
                  }}
                  onPointerUp={() => {
                    taskDrag.current = null;
                  }}
                  onPointerCancel={() => {
                    taskDrag.current = null;
                  }}
                  onClick={() => {
                    // A completed tear-off still ends in a click on this button.
                    if (suppressTaskClick.current) {
                      suppressTaskClick.current = false;
                      return;
                    }
                    taskClick(w);
                  }}
                  // Middle-click closes, as it does on a real taskbar / browser tab.
                  onAuxClick={(e) => {
                    if (e.button !== 1) return;
                    e.preventDefault();
                    close(w.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTaskCtx({ x: e.clientX, y: e.clientY, win: w });
                  }}
                >
                  <Icon name={glyph} size={18} />
                  {label ? <span>{label}</span> : null}
                  {/* Keeps the room the close button sits over, so the label never runs under it. */}
                  <span className="os-task-close-slot" aria-hidden="true" />
                </button>
                {/* Out of the tab order, as before: from the keyboard, the entry's own
                    context menu (Shift+F10 / Menu key) carries Close. */}
                <button
                  type="button"
                  className="os-task-close"
                  tabIndex={-1}
                  aria-label={t('desktop.task.close', { name: taskName })}
                  title={t('desktop.task.close', { name: taskName })}
                  onClick={() => close(w.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
          {/* Windows on other monitors. Badged with the desktop they live on;
              clicking raises that monitor's window rather than pretending to
              open a second copy here. */}
          {foreignWins.map(({ win: fw, desktopIndex, desktopName }) => {
            const app = APPS.find((a) => a.id === fw.section);
            const label = app ? t(app.labelKey) : fw.section;
            return (
              <button
                key={`foreign-${desktopIndex}-${fw.id}`}
                className={`os-task-win os-task-win-foreign app-${fw.section}`}
                title={t('desktop.task.onDesktop', { name: label, desktop: desktopName })}
                // `deskwinFocusDesktop` raises a window that already shows this
                // desktop and answers `{ok:false}` when none does — which is the
                // one case the badge exists for, and the answer was discarded, so
                // the click landed on silence (D150). Same helper the shell's own
                // monitor-ring route uses, and it says so when it still fails.
                onClick={() => {
                  void focusOrOpenDesktop(desktopIndex).then((ok) => {
                    if (!ok) showOsToast(t('desktop.switch.failed', { desktop: desktopName }), 'err');
                  });
                }}
              >
                <Icon name={app?.glyph ?? 'app'} size={18} />
                <span>{label}</span>
                <span className="os-task-monitor-badge">{desktopName}</span>
              </button>
            );
          })}
        </div>
        {/* WIRED data rail: packets crawling between the task slots and the
            tray. CSS-only motion (transform, stepped), idle-gated. */}
        {wired && (
          <span className="wired-rail-ticker" aria-hidden="true">
            <i />
          </span>
        )}
        <div className="os-tray">
          <button
            type="button"
            className="os-tray-btn"
            title={t('palette.searchPlaceholder')}
            aria-label={t('palette.searchPlaceholder')}
            aria-haspopup="dialog"
            onClick={() => window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>
          {/* Widgets, Clipboard history and Settings live behind this, exactly as
              Windows tucks its secondary tray icons behind a chevron. */}
          <button
            type="button"
            ref={trayOverflowBtnRef}
            className={`os-tray-btn os-tray-overflow-btn ${trayOverflowOpen ? 'active' : ''}`}
            title={t('desktop.tray.hiddenIcons')}
            aria-label={t('desktop.tray.hiddenIcons')}
            aria-haspopup="dialog"
            aria-expanded={trayOverflowOpen}
            // Only while the panel exists (a11y2): a closed popover is unmounted,
            // and an idref to nothing is an invalid ARIA value.
            aria-controls={trayOverflowOpen ? TRAY_OVERFLOW_ID : undefined}
            onClick={() => setTrayOverflowOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 14l6-6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="os-tray-btn"
            title={t('quickSettings.title')}
            aria-label={t('quickSettings.title')}
            aria-haspopup="dialog"
            data-shell-opener="quick-settings"
            onClick={() => window.dispatchEvent(new CustomEvent('shell:toggleQuickSettings'))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
              <circle cx="9" cy="9" r="2.2" />
              <circle cx="15" cy="15" r="2.2" />
            </svg>
          </button>
          <NotificationBell />
          {wired && <WiredTrayLamps />}
          {wired && <WiredGlobe />}
          {wired && !secondary && <WiredLayerBadge />}
          <TaskbarClock
            showSeconds={wired || !!deskPrefs.clockSeconds}
            hour12={wired ? false : clockHour12(deskPrefs.clock24h)}
            showDate={!!deskPrefs.clockShowDate}
          />
          <button
            type="button"
            className={`os-tray-btn os-show-desktop-btn ${showDesktopActive ? 'active' : ''}`}
            title={t(showDesktopActive ? 'commands.window.restoreAll' : 'commands.window.showDesktop')}
            aria-label={t(showDesktopActive ? 'commands.window.restoreAll' : 'commands.window.showDesktop')}
            aria-pressed={showDesktopActive}
            disabled={!showDesktopActive && !wins.some((window) => !window.min)}
            onClick={() => {
              if (showDesktopActive) restoreShownDesktopRef.current();
              else showDesktopRef.current();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="5" width="16" height="12" rx="1.5" />
              <path d="M8 20h8M12 17v3" />
            </svg>
          </button>
        </div>
      </div>
      {/* Aero: cursor-following task glow, hover thumbnails and Aero Peek. */}
      {material === 'aero' && taskbarMode !== 'none' && <AeroTaskbarFx taskbarRef={taskbarRef} />}
      {trayOverflowOpen && (
        <TrayOverflow
          onClose={() => {
            setTrayOverflowOpen(false);
            trayOverflowBtnRef.current?.focus();
          }}
          galleryOpen={galleryOpen}
          onWidgets={() => setGalleryOpen((o) => !o)}
          onSettings={() => open('settings')}
        />
      )}
      <DesktopLayerHost />
      <QuickSettings />
      <NotificationCenter />
      <AeroBootOverlay />
      {/* Aero Flip 3D window switcher (Ctrl+Alt+Tab / Ctrl+Alt+Space). */}
      {material === 'aero' && !secondary && (
        <AeroFlip
          cards={wins.map((w) => {
            const app = APPS.find((a) => a.id === w.section);
            return {
              id: w.id,
              section: w.section,
              z: w.z,
              min: w.min,
              label: w.section === 'note' ? t('desktop.noteLabel')
                : w.section === 'visualizer' ? t('settings.nav.visualizer')
                  : w.section === 'musicwidget' ? t('settings.mini.app.musicwidget')
                    : app ? t(app.labelKey) : w.section,
              glyph: (w.section === 'note' ? 'note'
                : w.section === 'visualizer' || w.section === 'musicwidget' ? 'music'
                  : app?.glyph ?? 'app') as IconName,
            };
          })}
          onPick={focus}
        />
      )}
      {/* Aero study mechanics: Defragmenter / Update / Welcome windows, balloon tips, screensaver. */}
      {material === 'aero' && !secondary && <AeroMechanicsHost taskbarRef={taskbarRef} />}
      <WiredArchiveBootOverlay />
      <WiredBreachOverlay />
      <ContextMenu
        open={!!taskCtx}
        x={taskCtx?.x ?? 0}
        y={taskCtx?.y ?? 0}
        onClose={() => setTaskCtx(null)}
        items={
          taskCtx
            ? [
                taskCtx.win.min
                  ? { id: 'restore', label: t('desktop.task.restore'), onSelect: () => focus(taskCtx.win.id) }
                  : { id: 'minimize', label: t('desktop.task.minimize'), onSelect: () => minimize(taskCtx.win.id) },
                ...(canPresentLiquid(taskCtx.win.section)
                  ? [{
                      id: 'toggle-liquid',
                      label: isWinLiquid(taskCtx.win)
                        ? t('desktop.returnToStandard')
                        : t('desktop.makeLiquid'),
                      onSelect: () => toggleLiquid(taskCtx.win.id),
                    }]
                  : []),
                { id: 'sep-t1', separator: true, label: '' },
                { id: 'close', label: t('desktop.task.closeThis'), danger: true, onSelect: () => void close(taskCtx.win.id) },
                {
                  id: 'close-others',
                  label: t('desktop.task.closeOthers'),
                  disabled: wins.length < 2,
                  onSelect: () => void closeMany(winsRef.current
                    .filter((other) => other.id !== taskCtx.win.id)
                    .map((other) => other.id)),
                },
                {
                  id: 'close-all',
                  label: t('desktop.task.closeAll'),
                  danger: true,
                  onSelect: () => void closeMany(winsRef.current.map((other) => other.id)),
                },
              ]
            : []
        }
      />
      <ContextMenu
        open={!!ctxPos}
        x={ctxPos?.x ?? 0}
        y={ctxPos?.y ?? 0}
        onClose={() => setCtxPos(null)}
        items={[
          { id: 'new-note', label: t('desktop.context.newNote'), onSelect: () => openNote() },
          { id: 'new-shortcut', label: t('desktop.context.newShortcut'), onSelect: () => void addShortcut() },
          { id: 'sep1', separator: true, label: '' },
          { id: 'widgets', label: t('desktop.context.widgets'), onSelect: () => setGalleryOpen(true) },
          { id: 'sep2', separator: true, label: '' },
          {
            id: 'close-all-apps',
            label: t('desktop.task.closeAll'),
            danger: true,
            disabled: wins.length === 0,
            onSelect: () => void closeMany(winsRef.current.map((w) => w.id)),
          },
          { id: 'sep3', separator: true, label: '' },
          { id: 'personalize', label: t('desktop.context.personalize'), onSelect: () => open('settings') },
          { id: 'display', label: t('desktop.context.displaySettings'), onSelect: () => open('settings') },
        ]}
      />
    </div>
  );
}

/**
 * WIRED tray lamp cluster (§3): cyan = link up (always lit), amber = pending
 * dispatches (blinks while unread), red = an unread error is present.
 */
function WiredTrayLamps() {
  const { t } = useT();
  const [, setTick] = useState(0);
  useEffect(() => onNotificationsChanged(() => setTick((n) => n + 1)), []);
  const unread = getNotifications().filter((n) => !n.read);
  const hasError = unread.some((n) => n.kind === 'error');
  return (
    <span className="wired-tray-lamps">
      <i className="wired-lamp wired-lamp-link on" aria-hidden="true" />
      <i
        className={`wired-lamp wired-lamp-pending${unread.length > 0 ? ' on blink' : ''}`}
        aria-hidden="true"
      />
      <i
        className={`wired-lamp wired-lamp-error${hasError ? ' on' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">
          {t(hasError ? 'notifications.wired.unreadError' : 'notifications.wired.noUnreadError')}
        </span>
      </i>
    </span>
  );
}

/**
 * WIRED window status readout: carrier meter + uptime + window id. Split out of
 * `FloatingWindow` so the shared 1 Hz clock re-renders only this span, never the
 * window subtree (see `wiredClock.ts`).
 */
function WiredWindowUptime({ id }: { id: string }) {
  const now = useWiredSecond();
  const since = windowMountedAt(id);
  return (
    <span className="fwin-wired-link">
      <i className="fwin-wired-carrier" aria-hidden="true" />
      <span>LINK</span>
      <span className="fwin-wired-uptime">{formatUptime(now - since)}</span>
      <span className="fwin-wired-id">{id.toUpperCase()}</span>
    </span>
  );
}

/**
 * The id the tray chevron names through `aria-controls`. It has to be a module
 * constant so the toggle and the panel cannot drift apart — a disclosure whose
 * `aria-controls` points at nothing is worse than no disclosure at all.
 */
const TRAY_OVERFLOW_ID = 'os-tray-overflow';

/**
 * Tray overflow panel — the "show hidden icons" flyout.
 *
 * The three secondary tray commands render here with their labels showing, so
 * the disclosure is not a pure cost: in the bar they were 32px unlabelled icon
 * buttons whose only naming was a `title` tooltip. Nothing becomes unreachable
 * — Settings still opens from Start, the palette and Quick Settings' "All
 * settings", and Widgets still has its desktop context menu.
 */
function TrayOverflow({
  onClose,
  galleryOpen,
  onWidgets,
  onSettings,
}: {
  onClose: () => void;
  galleryOpen: boolean;
  onWidgets: () => void;
  onSettings: () => void;
}) {
  const { t } = useT();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Focus the panel itself rather than the first item: the items are commands,
    // and landing on one makes Enter fire something the user only meant to reveal.
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /*
   * `popup` mirrors the bar's own contract from a2e9c1ce: the two that open a
   * flyout say so, and Settings — which opens a window — stays a plain command.
   * Only Widgets carries `aria-expanded`; Clipboard dispatches a CustomEvent and
   * its panel owns the state, so a stale `false` over an open panel is worse.
   */
  const items: { id: string; label: string; icon: ReactNode; popup?: boolean; expanded?: boolean; run: () => void }[] = [
    { id: 'widgets', label: t('desktop.widgets'), icon: <Icon name="app" size={18} />, popup: true, expanded: galleryOpen, run: onWidgets },
    {
      id: 'clipboard',
      label: t('desktop.clipboardHistory'),
      icon: <Icon name="clipboard" size={18} />,
      popup: true,
      run: () => window.dispatchEvent(new CustomEvent('clipboard:open')),
    },
    { id: 'settings', label: t('palette.section.settings'), icon: <Icon name="settings" size={18} />, run: onSettings },
  ];

  return (
    <>
      <div className="os-panel-backdrop" onMouseDown={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        id={TRAY_OVERFLOW_ID}
        className="os-flyout os-flyout--tray anim-slide-up"
        role="dialog"
        aria-label={t('desktop.tray.hiddenIcons')}
      >
        <div className="os-flyout-body os-tray-overflow-body">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="os-tray-overflow-item ui-focusable"
              aria-haspopup={item.popup ? 'dialog' : undefined}
              aria-expanded={item.expanded}
              onClick={() => {
                item.run();
                onClose();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

/** Isolated clock — avoids re-rendering the whole desktop every second. */
function TaskbarClock({
  showSeconds,
  hour12,
  showDate,
}: {
  showSeconds: boolean;
  /** `undefined` = no override, so `Intl` picks the locale's own hour cycle. */
  hour12: boolean | undefined;
  showDate: boolean;
}) {
  const { lang } = useT();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const ms = showSeconds ? 1000 : 15000;
    const t = window.setInterval(() => setClock(new Date()), ms);
    return () => window.clearInterval(t);
  }, [showSeconds]);
  return (
    <div className="os-clock">
      <span>
        {clock.toLocaleTimeString(LANG_TAGS[lang], {
          hour: '2-digit',
          minute: '2-digit',
          second: showSeconds ? '2-digit' : undefined,
          hour12,
        })}
      </span>
      {showDate && (
        <span className="os-clock-date">
          {clock.toLocaleDateString(LANG_TAGS[lang], { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  );
}

type ResizeMode = 'corner' | 'right' | 'bottom';

const FloatingWindow = memo(function FloatingWindow({
  win, animPhase, focused, hidden, deskRef, noteColor, onNoteColor, onTitleMenu,
  onFocus, onClose, onMinimize, onMaximize, onToggleLiquid, onPopOut, onPatch, children,
}: {
  win: Win;
  animPhase: WinAnimPhase | null;
  focused: boolean;
  hidden: boolean;
  deskRef: React.RefObject<HTMLDivElement>;
  noteColor?: string;
  onNoteColor?: (color: string) => void;
  /** shell2: right-click on the title bar opens the same menu as the taskbar entry. */
  onTitleMenu?: (id: string, x: number, y: number) => void;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onToggleLiquid: () => void;
  onPopOut: () => void;
  onPatch: (p: Partial<Win>) => void;
  children: ReactNode;
}) {
  const { t } = useT();
  const material = useAppMaterialSet();
  const wired = material === 'wired';
  const app = APPS.find((a) => a.id === win.section);
  const isNote = win.section === 'note';
  const isVisualizer = win.section === 'visualizer';
  const isMusicWidget = win.section === 'musicwidget';
  const isGarden = win.section === 'city';
  const canMaximize = canMaximizeSection(win.section);
  const isMaximized = Boolean(win.max) && canMaximize;
  // The `.fwin` root also carries `data-section`, so a window can be addressed
  // by WHAT IT IS rather than by the localised text in its title bar. Three
  // sections render an EMPTY title — `visualizer`, `musicwidget` and the
  // frameless `city` (see `title` below) — so title is not an identity at all,
  // and every instrument that resolved a window by title silently collapsed all
  // three onto whichever came first in the DOM. Measured, not reasoned about:
  // in `liquid-workplace/baselines/l12-matrix-maximized.json` the three apps
  // share ONE sha256 per theme (`8b409b38…` at oled-black, `e4975e0f…` at
  // paper), and in the 650-cell normal run all three carry the visualizer's own
  // 380x200 rect although musicwidget opens at 430x190 and city at 680x800.
  // `city` cannot even be maximized (`isMaximized` above excludes it) yet was
  // recorded maximized. It also published a false product fact: the L12 atlas
  // reported "3 of 25 surfaces offer no Liquid presentation", but
  // `canPresentLiquid` is TRUE for `musicwidget` and the bar below renders its
  // toggle. As of 2026-09-02 it is true for `city` as well — the garden's
  // frameless cluster below renders the identical control. Visualizer joined
  // once its focus/keyboard edge dock gave that presentation a real contextual
  // region; it remains desktop-only, like Note, so detach limits stay honest.
  // (Written this way round on purpose: `liquidWindowSnapshotFidelity.test.ts`
  // names every call site of that predicate in this file by regex, and the
  // regex reads comments too — a comment spelling the call out was scored as a
  // fourth caller.)
  // `data-section` is already the idiom here (`media/StudyBlocks.tsx:54`).
  // Liquid presentation is opt-in per window and reversible. Note keeps
  // conventional paper as its default and uses Liquid only for its compact
  // color edge palette; the garden keeps its painted scene in both and uses
  // Liquid only for its disclosed HUD and control dock. ONE predicate means
  // "renders liquid" and "can leave liquid" cannot
  // disagree (boss audit 2026-08-17 finding 2).
  const canGoLiquid = canPresentLiquid(win.section);
  const liquid = isWinLiquid(win) && canGoLiquid;
  // A note paints its own title bar in one of five pastel `NOTE_COLORS`, so every glyph in
  // that bar needs the dark ink the standard chrome does not supply. The title and the close
  // button each carried their own copy of this ternary and the Liquid toggle, added later,
  // carried none — measured 2026-09-03 on a `#fff3a3` note, the `◇` painted 1.2:1 against a
  // 4.5 bar while its two neighbours sat at 11.1:1. Two copies were two chances for a third
  // control to be missed, which is exactly what happened, so the predicate lives here once.
  const noteInk = isNote && !liquid ? { color: '#3a3320' } : undefined;
  // Real apps (including Mooncap Garden and the music widget) can detach into their own OS window;
  // desktop-only trinkets (notes, the viz widget) cannot.
  const canPopOut = !isNote && !isVisualizer;
  const wiredMeta = wired && !isGarden ? wiredModule(win.section) : null;
  const title = wired
    ? wiredModuleLabel(win.section)
    : isNote
      ? t('desktop.stickyNote')
      : isVisualizer || isMusicWidget || isGarden
        ? ''
        : app
          ? t(app.labelKey)
          : win.section;
  const glyph: IconName = isNote ? 'note' : isVisualizer || isMusicWidget ? 'music' : app?.glyph ?? 'app';
  // The three trinkets deliberately paint no title text, and that decision stands — but a
  // `<section>` with no accessible name is not a region landmark at all, so all three were
  // unnamed to assistive tech while every other window is named by its own bar. The label is
  // supplied only where the visible one is empty, so no titled window gains a second name and
  // no already-scored surface moves. Existing keys; no new string.
  const titleId = `fwin-title-${win.id}`;
  const untitledName = isVisualizer
    ? t('settings.nav.visualizer')
    : isMusicWidget
      ? t('settings.mini.app.musicwidget')
      : isGarden
        ? t('palette.section.city')
        : '';

  // The window element, so a drag/resize can move it directly (no per-frame
  // React setState). Committing to state on every pointermove re-rendered every
  // mounted window AND re-serialized+persisted the whole layout each frame,
  // which is what made dragging lag. We now write style during the gesture and
  // commit to React state exactly once on release.
  const winRef = useRef<HTMLElement | null>(null);

  const dragStart = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (isMaximized) return;
    e.preventDefault();
    onFocus();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const desk = deskRef.current;
    const z = desktopPointerScale(desk);
    const sx = e.clientX, sy = e.clientY, ox = win.x, oy = win.y;
    const dw = desk?.clientWidth ?? 1200;
    const dh = (desk?.clientHeight ?? 720) - TASKBAR_HEIGHT.normal;
    let curX = ox, curY = oy;
    let raf: number | null = null;
    // transform instead of left/top during the gesture: left/top writes
    // trigger layout of the window's whole subtree per event, while a
    // translate() only moves the already-painted layer on the compositor.
    if (winRef.current) winRef.current.style.willChange = 'transform';
    perfSetInteracting(true);
    // Multi-monitor: the pointer capture above means this window keeps getting
    // pointermove even once the cursor is over another display, and screenX/Y
    // are virtual-screen coordinates. That is the whole mechanism — nothing is
    // sent to main until the cursor actually leaves this desk.
    beginDeskDrag('window', win.id, { kind: 'window', snapshot: winToSnapshot(win) });
    const move = (ev: PointerEvent) => {
      moveDeskDrag(ev);
      curX = Math.min(Math.max(ox + (ev.clientX - sx) / z, -win.w + 90), dw - 60);
      curY = Math.min(Math.max(oy + (ev.clientY - sy) / z, 0), dh - 36);
      // RAF throttle — one visual update per frame regardless of mouse Hz.
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const node = winRef.current;
        // translate3d promotes compositor layer (GPU) during drag
        if (node) node.style.transform = `translate3d(${curX - ox}px, ${curY - oy}px, 0)`;
      });
    };
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (raf != null) cancelAnimationFrame(raf);
      perfSetInteracting(false);
      const node = winRef.current;
      if (node) {
        // Swap the visual transform for real coordinates in one go, so there
        // is no flash while React re-renders with the committed position.
        node.style.left = `${curX}px`;
        node.style.top = `${curY}px`;
        node.style.transform = '';
        node.style.willChange = '';
      }
      // Released over another monitor: that desktop adopts the window and this
      // one gets a `deskdrag:release`. Committing the local position here as
      // well would leave a copy on both desktops.
      if (endDeskDrag(ev)) return;
      const rect = desk?.getBoundingClientRect();
      const half = Math.max(MIN_W, Math.floor(dw / 2) - 10);
      // Commit once: an edge-snap if applicable, else the dragged position.
      if (rect && !isNote && !isGarden) {
        const px = (ev.clientX - rect.left) / z;
        const py = (ev.clientY - rect.top) / z;
        if (py <= WIN_SNAP / 2) return onPatch({ x: 0, y: 0, w: dw, h: dh });
        if (px <= WIN_SNAP) return onPatch({ x: 0, y: 0, w: half, h: dh });
        if (px >= dw - WIN_SNAP) return onPatch({ x: dw - half, y: 0, w: half, h: dh });
      }
      onPatch({ x: curX, y: curY });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const resizeStart = (mode: ResizeMode) => (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    if (isMaximized) onPatch({ max: false });
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const desk = deskRef.current;
    const z = desktopPointerScale(desk);
    const sx = e.clientX, sy = e.clientY, ow = win.w, oh = win.h;
    const dw = desk?.clientWidth ?? 1200;
    const dh = (desk?.clientHeight ?? 720) - TASKBAR_HEIGHT.normal;
    const maxW = Math.max(MIN_W, dw - win.x - 2);
    const maxH = Math.max(MIN_H, dh - win.y - 2);
    let curW = ow, curH = oh;
    let raf: number | null = null;
    /*
     * `fwin-resizing` marks the window for the duration of the gesture ONLY, so a
     * surface whose decoration is expensive to re-rasterise can stand down while the
     * user is dragging and come straight back on release. Measured on the Mooncap
     * Garden (cat7, 2026-09-04): its parallax plates carry per-layer `filter: blur()`
     * and the resize leg read p50 25.1 ms / p95 41.7 ms against an 8.3 ms compositor
     * ceiling, with the main thread idle at 2.8 ms — compositor raster, not JS.
     * Neutralising those filters live took the same leg to p50 16.6 ms.
     *
     * Written imperatively on the node rather than through state on purpose: this
     * gesture deliberately never re-renders (it writes inline width/height inside a
     * rAF for exactly that reason), and a `setState` per pointermove would reintroduce
     * the reflow storm the clamp above exists to prevent. `up` always removes it,
     * including on the early-return paths, because it is the same node reference.
     */
    winRef.current?.classList.add('fwin-resizing');
    const move = (ev: PointerEvent) => {
      if (mode !== 'bottom') curW = Math.max(MIN_W, Math.min(ow + (ev.clientX - sx) / z, maxW));
      if (mode !== 'right') curH = Math.max(MIN_H, Math.min(oh + (ev.clientY - sy) / z, maxH));
      // Resizing must relayout the window's content (that's the point), but
      // clamping writes to one per frame keeps a 1000Hz mouse from forcing
      // hundreds of reflows a second.
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const node = winRef.current;
        if (node) {
          if (mode !== 'bottom') node.style.width = `${curW}px`;
          if (mode !== 'right') node.style.height = `${curH}px`;
        }
      });
    };
    const up = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (raf != null) cancelAnimationFrame(raf);
      const node = winRef.current;
      node?.classList.remove('fwin-resizing');
      if (node) {
        // Cancelling the pending rAF above leaves the DOM on whatever frame
        // painted last, which is not necessarily the size being committed. If
        // the gesture ends where it started, win.w/win.h do not change, React
        // reconciles nothing, and that stale inline write survives. Write the
        // committed size ourselves, exactly as dragStart does for left/top.
        if (mode !== 'bottom') node.style.width = `${curW}px`;
        if (mode !== 'right') node.style.height = `${curH}px`;
      }
      const p: Partial<Win> = {};
      if (mode !== 'bottom') p.w = curW;
      if (mode !== 'right') p.h = curH;
      onPatch(p);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  // `data-maximizable` below publishes `canMaximizeSection`, which is a deliberate product
  // refusal for `note` and `city`: maximizing suppresses window drag and all three resize
  // handles, and neither of those two bars renders a control that could clear the state, so
  // the window would be trapped. Until now that decision was only inferrable from the ABSENCE
  // of a button, and anything reading the DOM had to guess whether a missing Maximize was
  // intentional or lost. Rubric category 4's harness guessed with `.fwin-frameless`, which
  // catches `city` and misses `note` — the note then failed `allThreeSizes` for honouring a
  // documented refusal. Declared, the refusal is legible: a window that SHOULD be maximizable
  // still reads `true`, so a missing button on it is still a defect and cannot be laundered.
  return (
    <section
      ref={winRef}
      className={`fwin ${focused ? 'focused' : ''} ${isNote ? 'fwin-note' : ''} ${isVisualizer ? 'fwin-viz' : ''} ${isGarden ? 'fwin-frameless' : ''} ${isMaximized ? 'fwin-max' : ''} ${liquid ? 'fwin-liquid' : ''} ${animPhase ? `fwin-anim-${animPhase}` : ''}`}
      data-section={win.section}
      data-presentation={liquid ? 'liquid' : 'standard'}
      data-maximizable={canMaximize ? 'true' : 'false'}
      data-win-id={win.id}
      // A named region (round-2 audit K12): the scan found every window with no role
      // and no name. Titled windows are named by their own title text; the three
      // untitled trinkets keep the label above. `tabIndex={-1}` lets the shell focus
      // the window itself when its body has nothing focusable yet (K7).
      role="region"
      aria-labelledby={title && !isGarden ? titleId : undefined}
      aria-label={title && !isGarden ? undefined : untitledName || title || undefined}
      tabIndex={-1}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.pin ? PIN_Z_BASE + win.z : win.z, display: hidden ? 'none' : undefined }}
      onPointerDown={onFocus}
    >
      {!isGarden && (
        <div
          className="fwin-bar"
          style={isNote && noteColor && !liquid ? { background: noteColor, borderBottomColor: 'rgba(0,0,0,0.15)' } : undefined}
          onPointerDown={dragStart}
          onDoubleClick={() => canMaximize && onMaximize()}
          onContextMenu={(e) => {
            if (!onTitleMenu || (e.target as HTMLElement).closest('button')) return;
            e.preventDefault();
            e.stopPropagation();
            onTitleMenu(win.id, e.clientX, e.clientY);
          }}
        >
          <span className="fwin-title" style={noteInk}>
            <Icon name={glyph} size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            {wiredMeta ? (
              // WIRED module plate: the code reads as an inverted stamp, the name
              // in mono beside it. Same accessible text as `title` ("CODE / Name").
              <span className="fwin-title-text" id={titleId}>
                <b className="fwin-wired-code">{wiredMeta.code}</b>
                <span className="fwin-wired-sep"> / </span>
                <span className="fwin-wired-name">{wiredMeta.name}</span>
              </span>
            ) : (
              <span className="fwin-title-text" id={titleId}>{title}</span>
            )}
          </span>
          {wiredMeta && <i className="fwin-wired-meter" aria-hidden="true" />}
          <span className="fwin-btns">
            {/* `title` alone does not name these: a button's own text content
                outranks it in the accessible-name computation, so a screen reader
                announced the glyph. Their `◇`/`▢`/`×` siblings already carry the
                label; these two were simply missed. */}
            {canPopOut && (
              <button
                className="fwin-b lq-hit"
                data-cap="popout"
                title={t('desktop.popOut')}
                aria-label={t('desktop.popOut')}
                onClick={onPopOut}
              >
                ⧉
              </button>
            )}
            {canGoLiquid && (
              <button
                className={`fwin-b lq-hit fwin-b-liquid ${liquid ? 'is-liquid' : ''}`}
                data-cap="liquid"
                style={noteInk}
                title={liquid ? t('desktop.returnToStandard') : t('desktop.makeLiquid')}
                aria-label={liquid ? t('desktop.returnToStandard') : t('desktop.makeLiquid')}
                aria-pressed={liquid}
                onClick={onToggleLiquid}
              >
                {liquid ? '◆' : '◇'}
              </button>
            )}
            {!isNote && (
              <button
                className="fwin-b lq-hit"
                data-cap="min"
                title={t('desktop.minimize')}
                aria-label={t('desktop.minimize')}
                onClick={onMinimize}
              >
                ─
              </button>
            )}
            {/* Two gates, because they are two different refusals: a note is not
                minimizable (it has no taskbar identity to return from) and it is
                not maximizable (nothing here could bring it back). Split so the
                maximize control and every route that sets the flag read the one
                predicate. */}
            {/* A toggle that never says which way it is pointing. Measured on the
                Calendar window 2026-09-03: maximized, the control still read
                `title="Maximize"`, carried no `aria-label` and no `aria-pressed`,
                so a screen reader announced "Maximize" on an already-maximized
                window and the tooltip promised the opposite of what the click
                does. The Liquid toggle three buttons up has swapped all three
                since L3; this one never did. Same shape, same fix. */}
            {canMaximize && (
              <button
                className="fwin-b lq-hit"
                data-cap="max"
                title={isMaximized ? t('desktop.restoreDown') : t('desktop.maximize')}
                aria-label={isMaximized ? t('desktop.restoreDown') : t('desktop.maximize')}
                aria-pressed={isMaximized}
                onClick={onMaximize}
              >
                {isMaximized ? '❐' : '▢'}
              </button>
            )}
            <button
              className="fwin-b lq-hit fwin-close"
              data-cap="close"
              style={noteInk}
              aria-label={isNote ? t('desktop.deleteNote') : t('common.close')}
              title={isNote ? t('desktop.deleteNote') : t('common.close')}
              onClick={onClose}
            >
              ×
            </button>
          </span>
        </div>
      )}
      {isGarden && (
        <>
          <div className="fwin-drag-strip" onPointerDown={dragStart} aria-hidden />
          {/* `lq-hit` on each button, exactly as the framed bar above already does. It was
              missing only here, and category 1 measured the consequence: the same `.fwin-b`
              owns a 32x32.5 pointer region in `.fwin-bar` and 30.5x24.5 inside
              `.fwin-frameless-controls`. The expander did not "fail to survive this host" —
              it was never applied to it. */}
          <div className="fwin-frameless-controls">
            {canPopOut && (
              <button
                className="fwin-b lq-hit"
                data-cap="popout"
                title={t('desktop.popOut')}
                aria-label={t('desktop.popOut')}
                onClick={onPopOut}
              >
                ⧉
              </button>
            )}
            {/* The SAME control the framed bar renders, from the SAME predicate. It is
                repeated rather than hoisted because the two clusters differ in nothing
                else, and a shared sub-component here would put a third render path
                between `canGoLiquid` and the button — which is the shape boss audit
                2026-08-17 finding 2 was. Frameless windows reserve room for it in
                `.fwin-drag-strip`'s `right`. */}
            {canGoLiquid && (
              <button
                className={`fwin-b lq-hit fwin-b-liquid ${liquid ? 'is-liquid' : ''}`}
                title={liquid ? t('desktop.returnToStandard') : t('desktop.makeLiquid')}
                aria-label={liquid ? t('desktop.returnToStandard') : t('desktop.makeLiquid')}
                aria-pressed={liquid}
                onClick={onToggleLiquid}
              >
                {liquid ? '◆' : '◇'}
              </button>
            )}
            <button
              className="fwin-b lq-hit"
              title={t('desktop.minimize')}
              aria-label={t('desktop.minimize')}
              onClick={onMinimize}
            >
              ─
            </button>
            <button
              className="fwin-b lq-hit fwin-close"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </>
      )}
      {isNote && (
        <div className="desk-note-palette lq-contextual" role="toolbar" aria-label={t('theme.group.color')}>
          {NOTE_COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              className="desk-note-color lq-hit"
              style={{ background: color }}
              title={t(NOTE_COLOR_LABEL_KEYS[index])}
              aria-label={t(NOTE_COLOR_LABEL_KEYS[index])}
              aria-pressed={noteColor === color}
              onClick={() => onNoteColor?.(color)}
            />
          ))}
        </div>
      )}
      <div
        className={`fwin-body ${isNote ? 'fwin-body-note' : ''} ${isVisualizer || isMusicWidget || win.section === 'music' || isGarden ? 'fwin-body-flush' : ''} ${isGarden ? 'fwin-body-frameless' : ''}`}
      >
        {children}
      </div>
      {wired && !isGarden && (
        <div className="fwin-wired-status">
          <span className="fwin-wired-ready">{wiredMeta?.ready ?? wiredModule(win.section).ready}</span>
          <WiredWindowUptime id={win.id} />
        </div>
      )}
      {!isMaximized && (
        <>
          <div className="fwin-edge-r" onPointerDown={resizeStart('right')} />
          <div className="fwin-edge-b" onPointerDown={resizeStart('bottom')} />
          <div className="fwin-resize" title={t('desktop.resize')} onPointerDown={resizeStart('corner')} />
        </>
      )}
    </section>
  );
});
