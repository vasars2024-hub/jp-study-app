// @vitest-environment node
//
// Home rearranging and the Library's remembered preferences: parsing what was stored,
// moving sections, and the "smart" arrangement rule (pinned keeps its slot, Continue
// watching floats while something is in progress, empty sections hide themselves).
import { describe, expect, it } from 'vitest';
import {
  FRESH_IMPORT_MS,
  GUM_BUILTIN_SECTIONS,
  JUST_ADDED_WINDOW_MS,
  POSTER_SIZE_MAX,
  arrangeSections,
  defaultHomeLayout,
  defaultLibraryPrefs,
  densityOf,
  moveSection,
  moveSectionTo,
  newSavedViewId,
  normalizeArrivals,
  normalizeFilters,
  normalizeHomeLayout,
  normalizeLibraryPrefs,
  normalizeSavedViews,
  pickSort,
  recordArrival,
  setSectionDensity,
  setSectionHidden,
  setSectionPinned,
  setViewOnHome,
  type GumHomeLayout,
  type GumHomeSignals,
} from '../components/media/gum/gumLayout';

const quiet: GumHomeSignals = { counts: {}, inProgress: false, freshImport: false };

function layout(order: GumHomeLayout['order'], patch: Partial<GumHomeLayout> = {}): GumHomeLayout {
  return { version: 1, order, hidden: [], pinned: [], density: {}, ...patch };
}

describe('normalizeHomeLayout', () => {
  it('falls back to the default arrangement for nothing or garbage', () => {
    expect(normalizeHomeLayout(undefined)).toEqual(defaultHomeLayout());
    expect(normalizeHomeLayout('nonsense')).toEqual(defaultHomeLayout());
    expect(normalizeHomeLayout({ order: 42, hidden: 'x' }).order).toEqual([...GUM_BUILTIN_SECTIONS]);
  });

  it('keeps the viewer order and slots a section added later after its default predecessor', () => {
    const stored = { order: ['plan', 'continue', 'justAdded'], hidden: [] };
    const next = normalizeHomeLayout(stored);
    // Each missing section lands right after its default predecessor: `upNext` after
    // `continue`, `completed` after `plan`. The viewer's own relative order survives.
    expect(next.order[next.order.indexOf('continue') + 1]).toBe('upNext');
    expect(next.order[next.order.indexOf('plan') + 1]).toBe('completed');
    expect(next.order.indexOf('plan')).toBeLessThan(next.order.indexOf('continue'));
    expect(next.order.indexOf('continue')).toBeLessThan(next.order.indexOf('justAdded'));
    expect(new Set(next.order)).toEqual(new Set(GUM_BUILTIN_SECTIONS));
  });

  it('drops unknown ids, duplicates and views that no longer exist', () => {
    const next = normalizeHomeLayout({
      order: ['continue', 'continue', 'bogus', 'view:gone', 'view:kept'],
      hidden: ['view:gone'],
      pinned: ['bogus', 'continue'],
      density: { continue: 'large', plan: 'huge', 'view:gone': 'compact' },
    }, ['kept']);
    expect(next.order.filter((id) => id === 'continue')).toHaveLength(1);
    expect(next.order).toContain('view:kept');
    expect(next.order).not.toContain('view:gone');
    expect(next.hidden).toEqual([]);
    expect(next.pinned).toEqual(['continue']);
    expect(next.density).toEqual({ continue: 'large' });
  });

  it('does not add a known saved view the viewer has not put on Home', () => {
    expect(normalizeHomeLayout({ order: ['continue'] }, ['v1']).order).not.toContain('view:v1');
  });
});

describe('moving sections', () => {
  const base = layout(['continue', 'upNext', 'plan']);

  it('moves by a step and clamps at the ends', () => {
    expect(moveSection(base, 'plan', -1).order).toEqual(['continue', 'plan', 'upNext']);
    expect(moveSection(base, 'continue', -1)).toBe(base);
    expect(moveSection(base, 'plan', 5)).toBe(base);
  });

  it('moves to where another section is (drag and drop)', () => {
    expect(moveSectionTo(base, 'plan', 'continue').order).toEqual(['plan', 'continue', 'upNext']);
    expect(moveSectionTo(base, 'continue', 'plan').order).toEqual(['upNext', 'plan', 'continue']);
    expect(moveSectionTo(base, 'continue', 'continue')).toBe(base);
  });

  it('hides, pins and sizes', () => {
    const hidden = setSectionHidden(base, 'plan', true);
    expect(hidden.hidden).toEqual(['plan']);
    expect(setSectionHidden(hidden, 'plan', false).hidden).toEqual([]);
    expect(setSectionPinned(base, 'upNext', true).pinned).toEqual(['upNext']);
    const large = setSectionDensity(base, 'plan', 'large');
    expect(densityOf(large, 'plan')).toBe('large');
    // `regular` is the default, so it is not stored.
    expect(setSectionDensity(large, 'plan', 'regular').density).toEqual({});
  });

  it('adds a saved view to Home and removes every trace of it', () => {
    const on = setViewOnHome(base, 'v1', true);
    expect(on.order[on.order.length - 1]).toBe('view:v1');
    const pinned = setSectionPinned(on, 'view:v1', true);
    const off = setViewOnHome(pinned, 'v1', false);
    expect(off.order).not.toContain('view:v1');
    expect(off.pinned).not.toContain('view:v1');
  });
});

describe('arrangeSections — the smart order', () => {
  const order: GumHomeLayout['order'] = ['plan', 'upNext', 'justAdded', 'continue', 'genres'];

  it('keeps the viewer order when nothing is happening', () => {
    expect(arrangeSections(layout(order), quiet)).toEqual(order);
  });

  it('hides hidden and empty sections, but shows unknown counts', () => {
    const next = arrangeSections(layout(order, { hidden: ['genres'] }), { ...quiet, counts: { upNext: 0, plan: 3 } });
    expect(next).toEqual(['plan', 'justAdded', 'continue']);
  });

  it('floats Continue watching to the top while something is in progress, then Just added after an import', () => {
    expect(arrangeSections(layout(order), { ...quiet, inProgress: true })[0]).toBe('continue');
    expect(arrangeSections(layout(order), { ...quiet, inProgress: true, freshImport: true }).slice(0, 2)).toEqual(['continue', 'justAdded']);
    expect(arrangeSections(layout(order), { ...quiet, freshImport: true })[0]).toBe('justAdded');
  });

  it('never moves a pinned section, floats or not', () => {
    const pinned = layout(order, { pinned: ['plan'] });
    const next = arrangeSections(pinned, { ...quiet, inProgress: true });
    expect(next[0]).toBe('plan');
    expect(next[1]).toBe('continue');
    expect(next).toHaveLength(order.length);
  });

  it('does not float a pinned Continue watching out of its slot', () => {
    const pinned = layout(order, { pinned: ['continue'] });
    expect(arrangeSections(pinned, { ...quiet, inProgress: true })).toEqual(order);
  });

  it('shows everything, in the viewer order, while customising', () => {
    const hidden = layout(order, { hidden: ['plan'] });
    expect(arrangeSections(hidden, { ...quiet, counts: { upNext: 0 }, inProgress: true }, true)).toEqual(order);
  });
});

describe('library preferences', () => {
  it('reads defaults for nothing, and repairs every bad field', () => {
    expect(normalizeLibraryPrefs(undefined)).toEqual(defaultLibraryPrefs());
    const repaired = normalizeLibraryPrefs({
      status: 'nope',
      type: 'film',
      view: 'list',
      posterSize: 9_999,
      badges: { type: false, score: 'yes' },
      byStatus: { watching: { sort: 'score', dir: 'sideways', filters: { genres: ['Drama', 3], yearMin: 'x', onDisk: true, runtime: ['short', 'epic'] } } },
    });
    expect(repaired.status).toBe('all');
    expect(repaired.type).toBe('film');
    expect(repaired.view).toBe('list');
    expect(repaired.posterSize).toBe(POSTER_SIZE_MAX);
    expect(repaired.badges).toEqual({ type: false, progress: true, onDisk: true, score: true });
    expect(repaired.byStatus.watching).toEqual({ sort: 'score', dir: 'desc', filters: { genres: ['Drama'], onDisk: true, runtime: ['short'] } });
  });

  it('opens each status tab on the sort that tab is for', () => {
    const prefs = defaultLibraryPrefs();
    expect(prefs.byStatus.watching.sort).toBe('lastWatched');
    expect(prefs.byStatus.completed.sort).toBe('finished');
    expect(prefs.byStatus.plan.sort).toBe('added');
    expect(prefs.byStatus.all.sort).toBe('title');
  });

  it('flips direction on the same key and starts a new key in its natural direction', () => {
    const tab = { sort: 'title' as const, dir: 'asc' as const, filters: {} };
    expect(pickSort(tab, 'title').dir).toBe('desc');
    expect(pickSort(tab, 'score')).toEqual({ sort: 'score', dir: 'desc', filters: {} });
  });

  it('drops filter values it does not know', () => {
    expect(normalizeFilters({ sources: ['letterboxd', 'myspace'], added: '2d', watched: '30d', unrated: 1 })).toEqual({ sources: ['letterboxd'], watched: '30d' });
  });
});

describe('saved views', () => {
  it('keeps valid views and drops the rest', () => {
    const views = normalizeSavedViews([
      { id: 'v1', name: '  Short anime  ', status: 'plan', type: 'anime', sort: 'runtime', dir: 'asc', filters: { runtime: ['short'] }, createdAt: 5 },
      { id: 'v1', name: 'duplicate' },
      { id: 'bad id!', name: 'x' },
      { id: 'v2', name: '' },
      'junk',
    ]);
    expect(views).toEqual([{ id: 'v1', name: 'Short anime', status: 'plan', type: 'anime', sort: 'runtime', dir: 'asc', filters: { runtime: ['short'] }, createdAt: 5 }]);
  });

  it('mints an id that does not collide', () => {
    const first = newSavedViewId([], 1000);
    const views = normalizeSavedViews([{ id: first, name: 'a' }]);
    expect(newSavedViewId(views, 1000)).not.toBe(first);
  });
});

describe('arrivals (Just added)', () => {
  const now = Date.UTC(2026, 8, 23);

  it('keeps arrivals inside the window, newest first', () => {
    const arrivals = normalizeArrivals([
      { at: now - JUST_ADDED_WINDOW_MS - 1, itemIds: ['old'], title: 'Old' },
      { at: now - 10, itemIds: ['b'], title: 'B' },
      { at: now - 20, itemIds: ['a'], title: 'A' },
      { at: now, itemIds: [], title: 'Empty' },
    ], now);
    expect(arrivals.map((arrival) => arrival.title)).toEqual(['B', 'A']);
  });

  it('records a new arrival at the front', () => {
    const next = recordArrival([{ at: now - FRESH_IMPORT_MS, itemIds: ['a'], title: 'A', source: 'qbittorrent' }], { at: now, itemIds: ['b'], title: 'B', source: 'watch-folder' }, now);
    expect(next[0].title).toBe('B');
    expect(next).toHaveLength(2);
  });
});
