/**
 * What the viewer arranged: the Home sections (order, hidden, size, pinned), the
 * Library's remembered sort + filters per status tab, its poster size / view /
 * badges, and saved filter views.
 *
 * Pure: parse / normalise / arrange. Persistence is `useGumPrefs` (localStorage,
 * the same tier the old library used for `jp-medialib-view`), catalogued in
 * `storage/settingsCatalog.ts` under "Media library layout".
 *
 * "Smart" arrangement rule, in one sentence: a PINNED section stays exactly at the
 * slot you put it in; every other visible section fills the remaining slots in your
 * order, except that Continue watching floats to the front while something is in
 * progress and Just added follows it after a fresh import. Empty sections hide
 * themselves outside Customise mode.
 */

import {
  GUM_STATUS_TABS,
  compactFilters,
  isGumSortKey,
  isGumStatusTab,
  isGumTypeTab,
  naturalDirection,
  type GumFilters,
  type GumSortDir,
  type GumSortKey,
  type GumStatusTab,
  type GumTypeTab,
} from './gumModel';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export const GUM_HOME_LAYOUT_KEY = 'jp-gum-home-layout-v1';
export const GUM_LIBRARY_PREFS_KEY = 'jp-gum-library-prefs-v1';
export const GUM_SAVED_VIEWS_KEY = 'jp-gum-saved-views-v1';
export const GUM_JUST_ADDED_KEY = 'jp-gum-just-added-v1';
/** Every key above, for the settings catalog and "Reset". */
export const GUM_STORAGE_PREFIX = 'jp-gum-';

// ---------------------------------------------------------------------------
// Home sections
// ---------------------------------------------------------------------------

export const GUM_BUILTIN_SECTIONS = [
  'continue',
  'upNext',
  'justAdded',
  'plan',
  'completed',
  'lists',
  'genres',
  'anime',
  'tv',
  'films',
] as const;
export type GumBuiltinSection = (typeof GUM_BUILTIN_SECTIONS)[number];
/** A built-in section, or a saved view shown on Home (`view:<id>`). */
export type GumSectionId = GumBuiltinSection | `view:${string}`;

export const GUM_DENSITIES = ['compact', 'regular', 'large'] as const;
export type GumDensity = (typeof GUM_DENSITIES)[number];

export interface GumHomeLayout {
  version: 1;
  /** Every known section, in the viewer's order. */
  order: GumSectionId[];
  hidden: GumSectionId[];
  pinned: GumSectionId[];
  density: Partial<Record<GumSectionId, GumDensity>>;
}

/** Hidden by default: available in Customise, not on a fresh Home. */
const DEFAULT_HIDDEN: GumSectionId[] = ['completed', 'lists', 'anime', 'tv', 'films'];

export function defaultHomeLayout(): GumHomeLayout {
  return { version: 1, order: [...GUM_BUILTIN_SECTIONS], hidden: [...DEFAULT_HIDDEN], pinned: [], density: {} };
}

export function isBuiltinSection(value: unknown): value is GumBuiltinSection {
  return typeof value === 'string' && (GUM_BUILTIN_SECTIONS as readonly string[]).includes(value);
}

export function isSectionId(value: unknown): value is GumSectionId {
  return isBuiltinSection(value) || (typeof value === 'string' && /^view:[\w-]{1,64}$/.test(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sectionList(value: unknown): GumSectionId[] {
  if (!Array.isArray(value)) return [];
  const out: GumSectionId[] = [];
  for (const entry of value) if (isSectionId(entry) && !out.includes(entry)) out.push(entry);
  return out;
}

/**
 * Reads a stored layout back, tolerantly. A section added in a later version is
 * inserted at its default position (after its default predecessor), so an update
 * never hides a new section behind the ones the viewer already arranged.
 */
export function normalizeHomeLayout(value: unknown, savedViewIds: readonly string[] = []): GumHomeLayout {
  const raw = asRecord(value);
  const fallback = defaultHomeLayout();
  const knownViews = new Set(savedViewIds.map((id) => `view:${id}`));
  const valid = (id: GumSectionId): boolean => isBuiltinSection(id) || knownViews.has(id);
  const stored = sectionList(raw.order).filter(valid);
  const order: GumSectionId[] = stored.length ? [...stored] : [...fallback.order];
  GUM_BUILTIN_SECTIONS.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = GUM_BUILTIN_SECTIONS.slice(0, index).reverse().find((prev) => order.includes(prev));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  // Saved views appear only where the viewer put one on Home (`setViewOnHome`), so a
  // view id that is known but absent from the stored order is deliberately not added.
  const hidden = Array.isArray(raw.hidden) ? sectionList(raw.hidden).filter(valid) : [...fallback.hidden];
  const pinned = sectionList(raw.pinned).filter(valid);
  const density: GumHomeLayout['density'] = {};
  for (const [key, entry] of Object.entries(asRecord(raw.density))) {
    if (isSectionId(key) && valid(key) && (GUM_DENSITIES as readonly string[]).includes(entry as string)) {
      density[key] = entry as GumDensity;
    }
  }
  return { version: 1, order, hidden, pinned, density };
}

/** Moves a section by `delta` slots in the viewer's order (keyboard / buttons). */
export function moveSection(layout: GumHomeLayout, id: GumSectionId, delta: number): GumHomeLayout {
  const from = layout.order.indexOf(id);
  if (from < 0) return layout;
  const to = Math.max(0, Math.min(layout.order.length - 1, from + delta));
  if (to === from) return layout;
  const order = [...layout.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

/** Moves `id` to where `overId` is (drag and drop). */
export function moveSectionTo(layout: GumHomeLayout, id: GumSectionId, overId: GumSectionId): GumHomeLayout {
  const from = layout.order.indexOf(id);
  const to = layout.order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return layout;
  const order = [...layout.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

function toggle(list: GumSectionId[], id: GumSectionId, on: boolean): GumSectionId[] {
  const without = list.filter((entry) => entry !== id);
  return on ? [...without, id] : without;
}

export function setSectionHidden(layout: GumHomeLayout, id: GumSectionId, hidden: boolean): GumHomeLayout {
  return { ...layout, hidden: toggle(layout.hidden, id, hidden) };
}

export function setSectionPinned(layout: GumHomeLayout, id: GumSectionId, pinned: boolean): GumHomeLayout {
  return { ...layout, pinned: toggle(layout.pinned, id, pinned) };
}

export function setSectionDensity(layout: GumHomeLayout, id: GumSectionId, density: GumDensity): GumHomeLayout {
  const next = { ...layout.density };
  if (density === 'regular') delete next[id];
  else next[id] = density;
  return { ...layout, density: next };
}

export function densityOf(layout: GumHomeLayout, id: GumSectionId): GumDensity {
  return layout.density[id] ?? 'regular';
}

/** Adds a saved view's section (visible, at the end) or removes it. */
export function setViewOnHome(layout: GumHomeLayout, viewId: string, onHome: boolean): GumHomeLayout {
  const id = `view:${viewId}` as GumSectionId;
  if (onHome) {
    return {
      ...layout,
      order: layout.order.includes(id) ? layout.order : [...layout.order, id],
      hidden: layout.hidden.filter((entry) => entry !== id),
    };
  }
  return {
    ...layout,
    order: layout.order.filter((entry) => entry !== id),
    hidden: layout.hidden.filter((entry) => entry !== id),
    pinned: layout.pinned.filter((entry) => entry !== id),
  };
}

export interface GumHomeSignals {
  /** Items each section would show; 0 = empty, hides itself. Missing = unknown, shown. */
  counts: Partial<Record<GumSectionId, number>>;
  /** Something is started and not finished. */
  inProgress: boolean;
  /** An import landed recently enough that Just added should come forward. */
  freshImport: boolean;
}

/** Sections that float forward while their signal holds, in float order. */
function floaters(signals: GumHomeSignals): GumSectionId[] {
  const out: GumSectionId[] = [];
  if (signals.inProgress) out.push('continue');
  if (signals.freshImport) out.push('justAdded');
  return out;
}

/**
 * The sections Home renders, in order.
 *
 * Outside Customise: hidden and empty sections drop out, pinned sections keep their
 * slot, floaters jump to the front of the unpinned ones. In Customise (`editing`),
 * every section shows in the viewer's own order so drag targets never move under
 * the pointer.
 */
export function arrangeSections(layout: GumHomeLayout, signals: GumHomeSignals, editing = false): GumSectionId[] {
  if (editing) return [...layout.order];
  const visible = layout.order.filter((id) => !layout.hidden.includes(id) && signals.counts[id] !== 0);
  const pinnedSlots = new Map<number, GumSectionId>();
  visible.forEach((id, index) => {
    if (layout.pinned.includes(id)) pinnedSlots.set(index, id);
  });
  const float = floaters(signals);
  const loose = visible.filter((id) => !layout.pinned.includes(id));
  const ordered = [
    ...float.filter((id) => loose.includes(id)),
    ...loose.filter((id) => !float.includes(id)),
  ];
  const out: GumSectionId[] = [];
  for (let slot = 0; slot < visible.length; slot += 1) {
    const pinned = pinnedSlots.get(slot);
    const next = pinned ?? ordered.shift();
    if (next) out.push(next);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Library preferences
// ---------------------------------------------------------------------------

export interface GumTabPrefs {
  sort: GumSortKey;
  dir: GumSortDir;
  filters: GumFilters;
}

export const GUM_BADGES = ['type', 'progress', 'onDisk', 'score'] as const;
export type GumBadge = (typeof GUM_BADGES)[number];

export interface GumLibraryPrefs {
  version: 1;
  status: GumStatusTab;
  type: GumTypeTab;
  view: 'grid' | 'list';
  /** Poster column width in px. */
  posterSize: number;
  badges: Record<GumBadge, boolean>;
  byStatus: Record<GumStatusTab, GumTabPrefs>;
}

export const POSTER_SIZE_MIN = 120;
export const POSTER_SIZE_MAX = 260;
export const POSTER_SIZE_DEFAULT = 168;

/** The sort each status tab opens with: what that tab is usually *for*. */
export function defaultTabPrefs(status: GumStatusTab): GumTabPrefs {
  switch (status) {
    case 'watching':
      return { sort: 'lastWatched', dir: 'desc', filters: {} };
    case 'plan':
      return { sort: 'added', dir: 'desc', filters: {} };
    case 'completed':
      return { sort: 'finished', dir: 'desc', filters: {} };
    default:
      return { sort: 'title', dir: 'asc', filters: {} };
  }
}

export function defaultLibraryPrefs(): GumLibraryPrefs {
  const byStatus = {} as Record<GumStatusTab, GumTabPrefs>;
  for (const status of GUM_STATUS_TABS) byStatus[status] = defaultTabPrefs(status);
  return {
    version: 1,
    status: 'all',
    type: 'all',
    view: 'grid',
    posterSize: POSTER_SIZE_DEFAULT,
    badges: { type: true, progress: true, onDisk: true, score: true },
    byStatus,
  };
}

const NUMERIC_FILTERS = ['yearMin', 'yearMax', 'scoreMin', 'scoreMax', 'providerMin'] as const;
const BOOLEAN_FILTERS = ['unrated', 'onDisk', 'subsJa', 'subsEn', 'liked', 'favorite'] as const;
const LIST_FILTERS: Record<string, readonly string[] | null> = {
  genres: null,
  lists: null,
  runtime: ['short', 'feature', 'long'],
  episodes: ['single', 'short', 'season', 'long'],
  language: ['ja', 'other', 'unknown'],
  sources: ['files', 'local', 'mal-export', 'mal-sync', 'letterboxd', 'manual'],
  watch: ['unwatched', 'progress', 'finished'],
};
const DATE_PRESETS = ['7d', '30d', '90d', '365d'];

/** Re-validates a stored filter set: unknown keys and ill-typed values are dropped. */
export function normalizeFilters(value: unknown): GumFilters {
  const raw = asRecord(value);
  const out: Record<string, unknown> = {};
  for (const key of NUMERIC_FILTERS) {
    const entry = raw[key];
    if (typeof entry === 'number' && Number.isFinite(entry)) out[key] = entry;
  }
  for (const key of BOOLEAN_FILTERS) if (typeof raw[key] === 'boolean') out[key] = raw[key];
  for (const [key, allowed] of Object.entries(LIST_FILTERS)) {
    const entry = raw[key];
    if (!Array.isArray(entry)) continue;
    const values = entry.filter((item): item is string => typeof item === 'string' && item.trim() !== ''
      && (allowed === null || allowed.includes(item)));
    if (values.length) out[key] = [...new Set(values)].slice(0, 64);
  }
  for (const key of ['added', 'watched'] as const) {
    if (typeof raw[key] === 'string' && DATE_PRESETS.includes(raw[key] as string)) out[key] = raw[key];
  }
  return compactFilters(out as GumFilters);
}

function normalizeTab(value: unknown, status: GumStatusTab): GumTabPrefs {
  const raw = asRecord(value);
  const fallback = defaultTabPrefs(status);
  const sort = isGumSortKey(raw.sort) ? raw.sort : fallback.sort;
  const dir = raw.dir === 'asc' || raw.dir === 'desc' ? raw.dir : fallback.dir;
  return { sort, dir, filters: normalizeFilters(raw.filters) };
}

export function normalizeLibraryPrefs(value: unknown): GumLibraryPrefs {
  const raw = asRecord(value);
  const fallback = defaultLibraryPrefs();
  const rawTabs = asRecord(raw.byStatus);
  const byStatus = {} as Record<GumStatusTab, GumTabPrefs>;
  for (const status of GUM_STATUS_TABS) byStatus[status] = normalizeTab(rawTabs[status], status);
  const badgesRaw = asRecord(raw.badges);
  const badges = { ...fallback.badges };
  for (const badge of Object.keys(badges) as Array<keyof typeof badges>) {
    if (typeof badgesRaw[badge] === 'boolean') badges[badge] = badgesRaw[badge] as boolean;
  }
  const size = typeof raw.posterSize === 'number' && Number.isFinite(raw.posterSize)
    ? Math.round(Math.max(POSTER_SIZE_MIN, Math.min(POSTER_SIZE_MAX, raw.posterSize)))
    : fallback.posterSize;
  return {
    version: 1,
    status: isGumStatusTab(raw.status) ? raw.status : fallback.status,
    type: isGumTypeTab(raw.type) ? raw.type : fallback.type,
    view: raw.view === 'list' ? 'list' : 'grid',
    posterSize: size,
    badges,
    byStatus,
  };
}

/** Picking a sort key: same key flips direction; a new key starts in its natural direction. */
export function pickSort(tab: GumTabPrefs, key: GumSortKey): GumTabPrefs {
  if (tab.sort === key) return { ...tab, dir: tab.dir === 'asc' ? 'desc' : 'asc' };
  return { ...tab, sort: key, dir: naturalDirection(key) };
}

// ---------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------

export interface GumSavedView {
  id: string;
  name: string;
  status: GumStatusTab;
  type: GumTypeTab;
  sort: GumSortKey;
  dir: GumSortDir;
  filters: GumFilters;
  createdAt: number;
}

export function normalizeSavedViews(value: unknown): GumSavedView[] {
  if (!Array.isArray(value)) return [];
  const out: GumSavedView[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    const raw = asRecord(row);
    const id = typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      status: isGumStatusTab(raw.status) ? raw.status : 'all',
      type: isGumTypeTab(raw.type) ? raw.type : 'all',
      sort: isGumSortKey(raw.sort) ? raw.sort : 'title',
      dir: raw.dir === 'desc' ? 'desc' : 'asc',
      filters: normalizeFilters(raw.filters),
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    });
  }
  return out.slice(0, 50);
}

/** A url-safe id that does not collide with the existing ones. */
export function newSavedViewId(existing: readonly GumSavedView[], now: number): string {
  let id = `v${now.toString(36)}`;
  let n = 0;
  while (existing.some((view) => view.id === id)) {
    n += 1;
    id = `v${now.toString(36)}-${n}`;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Just added
// ---------------------------------------------------------------------------

/** One arrival the ingest pipeline announced, kept so Just added survives a restart. */
export interface GumArrival {
  at: number;
  itemIds: string[];
  title: string;
  season?: number;
  episode?: number;
  episodeEnd?: number;
  source: string;
}

export const JUST_ADDED_WINDOW_MS = 14 * 86_400_000;
export const FRESH_IMPORT_MS = 48 * 3_600_000;
const ARRIVAL_LIMIT = 40;

export function normalizeArrivals(value: unknown, now: number): GumArrival[] {
  if (!Array.isArray(value)) return [];
  const out: GumArrival[] = [];
  for (const row of value) {
    const raw = asRecord(row);
    const at = typeof raw.at === 'number' ? raw.at : NaN;
    if (!Number.isFinite(at) || now - at > JUST_ADDED_WINDOW_MS) continue;
    const itemIds = Array.isArray(raw.itemIds) ? raw.itemIds.filter((id): id is string => typeof id === 'string') : [];
    if (!itemIds.length) continue;
    out.push({
      at,
      itemIds: itemIds.slice(0, 200),
      title: typeof raw.title === 'string' ? raw.title : '',
      season: typeof raw.season === 'number' ? raw.season : undefined,
      episode: typeof raw.episode === 'number' ? raw.episode : undefined,
      episodeEnd: typeof raw.episodeEnd === 'number' ? raw.episodeEnd : undefined,
      source: typeof raw.source === 'string' ? raw.source : 'watch-folder',
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, ARRIVAL_LIMIT);
}

export function recordArrival(arrivals: readonly GumArrival[], arrival: GumArrival, now: number): GumArrival[] {
  return normalizeArrivals([arrival, ...arrivals], now);
}

