/**
 * Resources catalogue state and sections, shared by Study OS's `ResourcesView`
 * and Blanc's `BlancResourcesPanel`.
 *
 * Pillar 0: the catalogue fetch/cache, the "My tools" store, bundle checklists,
 * and the section renderers all live here so Blanc composes them into Blanc
 * chrome rather than mounting `ResourcesView`. Nothing here may import
 * `AppChrome`/`MenuBar`/`StatusBar` — the Aero shell keeps those in the view.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../Icons';
import { RESOURCES, type Resource, type ResourceCategory } from '../../data/resources';
import { CATALOG_FALLBACK } from '../../data/catalogFallback';
import BundleCard from './BundleCard';
import BundleDetail from './BundleDetail';
import type {
  Bundle,
  BundleDownload,
  NewEntry,
  ResourcesCatalog,
} from '../../../shared/resourcesCatalog';
import type { CollectedTool } from '../../../shared/collectedTools';
import { useT } from '../../i18n';
import { showToast } from '../ui';
import { confirmRemoveCollectedTool } from '../../collectedToolsActions';

export type Filter = 'All' | string;
export type RefreshState = 'idle' | 'refreshing' | 'updated' | 'cached' | 'offline';

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function openLink(url: string): void {
  // §5.12 LINK: route cue when hopping to an external relay (wired pack only).
  if (document.documentElement.getAttribute('data-materials') === 'wired') {
    window.dispatchEvent(new CustomEvent('wired:route'));
  }
  // Opens in the system browser via the safe main-process bridge.
  void window.api.openExternal(url);
}

function matchesResource(r: Resource, q: string): boolean {
  return `${r.name} ${r.description}`.toLowerCase().includes(q);
}

const CHECKLIST_PREFIX = 'resources.checklist.';

function loadChecklist(bundleId: string): string[] {
  try {
    const raw = localStorage.getItem(CHECKLIST_PREFIX + bundleId);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveChecklist(bundleId: string, ids: string[]): void {
  try {
    localStorage.setItem(CHECKLIST_PREFIX + bundleId, JSON.stringify(ids));
  } catch {
    /* quota — non-fatal */
  }
}

function isNew(addedAt: string): boolean {
  const t = Date.parse(addedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 30 * 24 * 60 * 60 * 1000;
}

/** Remote categories are shaped like the static ones; normalize for rendering. */
function catalogCategories(catalog: ResourcesCatalog): ResourceCategory[] {
  return (catalog.categories ?? []).map((c) => ({
    id: `remote-${c.id}`,
    icon: c.icon,
    title: c.title,
    blurb: c.blurb,
    items: c.items.map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description,
      cost: r.cost,
    })),
  }));
}

export type ResourcesState = ReturnType<typeof useResources>;

/**
 * The complete setup-link side effect: save a web link to My tools when that
 * store is available, refresh the visible list, then open the URL externally.
 * There is deliberately no downloader or installer on this path.
 */
export async function saveAndOpenBundleLink(
  bundle: Bundle,
  link: BundleDownload,
  note: string,
  reloadTools: () => Promise<void>,
): Promise<void> {
  try {
    await window.api.toolsAdd({
      name: link.name,
      url: link.url,
      note,
      tags: ['bundle', bundle.id, link.kind, ...(link.tags ?? [])],
      source: 'app',
    });
    await reloadTools();
  } catch {
    /* the external link still opens if the local tools store is unavailable */
  }
  openLink(link.url);
}

export function useResources() {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  // Remote catalogue: start from the bundled fallback so we never render empty,
  // then hydrate from the userData cache and a background network refresh.
  const [catalog, setCatalog] = useState<ResourcesCatalog>(CATALOG_FALLBACK);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [checklists, setChecklists] = useState<Record<string, string[]>>({});

  // "My tools" — sites the user collected from the Immersion browser.
  const [tools, setTools] = useState<CollectedTool[]>([]);
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const reloadTools = useCallback(async () => {
    try {
      const store = await window.api.toolsList();
      // The store also backs Blanc's App Drawer (app/file/tool shortcuts),
      // which are not web links — "My tools" only ever opens via
      // `openLink()`/`openExternal`, so non-link kinds are excluded here.
      setTools(store.tools.filter((t) => (t.kind ?? 'link') === 'link'));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void reloadTools();
  }, [reloadTools]);

  // D17, both halves. The ✕ removed a tool the user collected themselves — with
  // whatever note they wrote on it — on one click, with no confirm and no undo.
  // And the `catch { /* ignore */ }` was followed by an unconditional
  // `reloadTools()`, so a removal that FAILED left the row exactly where it was
  // and read as "the button did nothing". Silence is the worse half: it is
  // indistinguishable from a dead control.
  const removeTool = useCallback(
    async (id: string) => {
      // D143: the confirm moved to `collectedToolsActions` unchanged, because
      // Blanc's app drawer reaches the same channel and was not asking. Both
      // hosts now call one helper rather than keeping two copies in step.
      if (!await confirmRemoveCollectedTool(t, tools.find((candidate) => candidate.id === id))) return;
      try {
        await window.api.toolsRemove(id);
      } catch (error) {
        showToast({
          message: t('resources.myTools.removeFailed', {
            reason: error instanceof Error ? error.message : String(error),
          }),
          kind: 'error',
        });
      }
      await reloadTools();
    },
    [reloadTools, t, tools],
  );

  const saveNote = useCallback(
    async (id: string) => {
      try {
        await window.api.toolsUpdate(id, { note: noteDraft });
      } catch (error) {
        // Same silence, and here it costs the note itself: the editor closes and
        // the draft is dropped either way, so a swallowed failure looks exactly
        // like a save.
        showToast({
          message: t('resources.myTools.noteSaveFailed', {
            reason: error instanceof Error ? error.message : String(error),
          }),
          kind: 'error',
        });
      }
      setEditingTool(null);
      setNoteDraft('');
      await reloadTools();
    },
    [noteDraft, reloadTools, t],
  );

  // Load checklist ticks once.
  useEffect(() => {
    const map: Record<string, string[]> = {};
    for (const b of CATALOG_FALLBACK.bundles) map[b.id] = loadChecklist(b.id);
    setChecklists(map);
  }, []);

  // On mount: cached catalogue first (fast), then a background network refresh.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const cached = await window.api.catalogGet();
        if (alive && cached) setCatalog(cached);
      } catch {
        /* ignore */
      }
      if (!alive) return;
      setRefreshState('refreshing');
      try {
        const result = await window.api.catalogRefresh();
        if (!alive) return;
        if (result.catalog) setCatalog(result.catalog);
        setRefreshState(result.source === 'remote' ? 'updated' : result.source === 'cache' ? 'cached' : 'offline');
      } catch {
        if (alive) setRefreshState('offline');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const doRefresh = useCallback(async () => {
    setRefreshState('refreshing');
    try {
      const result = await window.api.catalogRefresh();
      if (result.catalog) setCatalog(result.catalog);
      setRefreshState(result.source === 'remote' ? 'updated' : result.source === 'cache' ? 'cached' : 'offline');
    } catch {
      setRefreshState('offline');
    }
  }, []);

  const toggleChecklistItem = useCallback((bundleId: string, itemId: string) => {
    setChecklists((prev) => {
      const cur = prev[bundleId] ?? [];
      const next = cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId];
      saveChecklist(bundleId, next);
      return { ...prev, [bundleId]: next };
    });
  }, []);

  // Static categories + any remote extras, filtered by category + search query.
  const allCategories = useMemo(() => [...RESOURCES, ...catalogCategories(catalog)], [catalog]);

  const groups: ResourceCategory[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCategories
      .filter((cat) => filter === 'All' || cat.id === filter)
      .map((cat) => ({
        ...cat,
        items: q ? cat.items.filter((r) => matchesResource(r, q)) : cat.items,
      }))
      .filter((cat) => cat.items.length > 0);
  }, [allCategories, filter, query]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const allTotal = allCategories.reduce((n, g) => n + g.items.length, 0);
  const activeCategory =
    filter === 'All' ? null : allCategories.find((cat) => cat.id === filter) ?? null;

  const bundles = catalog.bundles;
  const newEntries: NewEntry[] = useMemo(
    () => [...catalog.newSection].sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt)),
    [catalog.newSection],
  );

  // Bundles / New section only show on the unfiltered, unsearched landing view.
  const showLanding = filter === 'All' && !query.trim();

  const openBundle = useCallback((b: Bundle) => setSelectedBundle(b), []);
  const closeBundle = useCallback(() => setSelectedBundle(null), []);
  const openBundleSetupLink = useCallback(
    async (bundle: Bundle, link: BundleDownload) => {
      const note = t('bundleDetail.savedToolNote', {
        bundle: bundle.gem,
        description: link.description,
      });
      await saveAndOpenBundleLink(bundle, link, note, reloadTools);
    },
    [reloadTools, t],
  );

  return {
    filter,
    setFilter,
    query,
    setQuery,
    refreshState,
    doRefresh,
    selectedBundle,
    openBundle,
    closeBundle,
    checklists,
    toggleChecklistItem,
    openBundleSetupLink,
    tools,
    removeTool,
    editingTool,
    setEditingTool,
    noteDraft,
    setNoteDraft,
    saveNote,
    allCategories,
    groups,
    total,
    allTotal,
    activeCategory,
    bundles,
    newEntries,
    showLanding,
  };
}

export function ResourceBundles({ state }: { state: ResourcesState }) {
  const { t } = useT();
  return (
    <section className="bundles-section">
      <div className="bundles-head">
        <h2>{t('resources.bundles.title')}</h2>
        <p className="muted">{t('resources.bundles.blurb')}</p>
      </div>
      <div className="bundles-grid">
        {state.bundles.map((b) => (
          <BundleCard
            key={b.id}
            bundle={b}
            checkedCount={(state.checklists[b.id] ?? []).length}
            onOpen={state.openBundle}
          />
        ))}
      </div>
    </section>
  );
}

export function ResourceNewSection({ state }: { state: ResourcesState }) {
  const { t } = useT();
  if (state.newEntries.length === 0) return null;
  return (
    <details className="new-section">
      <summary className="bundles-head">
        <span className="resources-disclosure-title">{t('resources.new.title')}</span>
        <span className="muted">{t('resources.new.blurb')}</span>
      </summary>
      <div className="res-grid">
        {state.newEntries.map((r) => (
          <button key={r.url} className="res-card new-card" onClick={() => openLink(r.url)}>
            <span className="res-card-top">
              <span className="res-name">
                {r.name}
                {isNew(r.addedAt) ? <span className="new-badge">NEW</span> : null}
              </span>
              <span className={`res-cost cost-${r.cost.toLowerCase()}`}>{r.cost}</span>
            </span>
            <span className="res-desc">{r.description}</span>
            <span className="res-host">
              {hostOf(r.url)}
              <span className="res-open" aria-hidden="true">
                <Icon name="external" size={11} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}

export function ResourceMyTools({ state }: { state: ResourcesState }) {
  const { t } = useT();
  const { tools, removeTool, editingTool, setEditingTool, noteDraft, setNoteDraft, saveNote } =
    state;
  if (tools.length === 0) return null;
  return (
    <section className="mytools-section">
      <div className="bundles-head">
        <h2>{t('resources.myTools.title')}</h2>
        <p className="muted">{t('resources.myTools.blurb')}</p>
      </div>
      <div className="res-grid">
        {tools.map((tool) => (
          <div key={tool.id} className="res-card mytool-card">
            <span className="res-card-top">
              <button
                className="res-name mytool-name"
                onClick={() => openLink(tool.url)}
                title={tool.url}
              >
                {tool.name}
              </button>
              <button
                className="mytool-remove"
                title={t('resources.myTools.remove')}
                onClick={() => void removeTool(tool.id)}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
            {editingTool === tool.id ? (
              <div className="mytool-note-edit">
                <input
                  autoFocus
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveNote(tool.id);
                    if (e.key === 'Escape') {
                      setEditingTool(null);
                      setNoteDraft('');
                    }
                  }}
                  placeholder={t('resources.myTools.notePlaceholder')}
                />
                {/*
                  * Register row D16. This was the one control on the surface with
                  * NO accessible name at all — no text, no `title`, no
                  * `aria-label`, just an SVG. `.mytool-remove` beside it at least
                  * carries a `title`. Measured live: `textContent` "",
                  * `aria-label` null, `title` "". `common.save` already exists in
                  * all four catalogs, so this needs no catalog edit.
                  */}
                <button
                  aria-label={t('common.save')}
                  title={t('common.save')}
                  onClick={() => void saveNote(tool.id)}
                >
                  <Icon name="check" size={12} />
                </button>
              </div>
            ) : (
              <button
                className="res-desc mytool-note"
                onClick={() => {
                  setEditingTool(tool.id);
                  setNoteDraft(tool.note ?? '');
                }}
              >
                {tool.note ? tool.note : <span className="muted">{t('resources.myTools.addNote')}</span>}
              </button>
            )}
            <span className="res-host">
              {hostOf(tool.url)}
              <span className="res-open" aria-hidden="true">
                <Icon name="external" size={11} />
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The category → cards listing used by the standard Study OS shell and Blanc. */
export function ResourceGroups({ state }: { state: ResourcesState }) {
  const { t } = useT();
  if (state.groups.length === 0) {
    return <div className="res-empty muted">{t('resources.noMatches')}</div>;
  }
  return (
    <>
      {state.groups.map((cat) => (
        <section className="res-group" key={cat.id}>
          <div className="res-group-head">
            <h2>{cat.title}</h2>
            <p className="muted">{cat.blurb}</p>
          </div>

          <div className="res-grid">
            {cat.items.map((r) => (
              <button key={r.url} className="res-card" onClick={() => openLink(r.url)}>
                <span className="res-card-top">
                  <span className="res-name">{r.name}</span>
                  <span className={`res-cost cost-${r.cost.toLowerCase()}`}>{r.cost}</span>
                </span>
                <span className="res-desc">{r.description}</span>
                <span className="res-host">
                  {hostOf(r.url)}
                  <span className="res-open" aria-hidden="true">
                    <Icon name="external" size={11} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function ResourceBundleDetail({ state }: { state: ResourcesState }) {
  if (!state.selectedBundle) return null;
  const bundle = state.selectedBundle;
  return (
    <BundleDetail
      bundle={bundle}
      checkedIds={state.checklists[bundle.id] ?? []}
      onToggle={(itemId) => state.toggleChecklistItem(bundle.id, itemId)}
      onBack={state.closeBundle}
      onOpenLink={openLink}
      onOpenSetupLink={(link) => void state.openBundleSetupLink(bundle, link)}
    />
  );
}
