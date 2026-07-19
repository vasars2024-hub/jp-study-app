import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GRAMMAR,
  LEVELS,
  GUIDES,
  GUIDE_CATEGORIES,
  type GrammarFunctionId,
  type GrammarLevel,
  type GrammarPoint,
  type JlptLevel,
  type Guide,
  type GuideCategory,
} from '../data/grammar';
import type { ExampleSentence } from '../../shared/types';
import { useT } from '../i18n';
import {
  AppChrome,
  Button,
  IconButton,
  SplitPane,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSeparator,
  useAeroMaterials,
  type MenuBarMenu,
} from '../components/ui';
import Icon from '../components/Icons';
import GrammarPracticePanel from '../components/grammar/GrammarPracticePanel';
import GrammarCurationPanel from '../components/grammar/GrammarCurationPanel';
import type { PracticeFilters } from '../data/grammar/practiceFilters';

type ExState = 'idle' | 'loading' | 'done' | 'error';

// Turn a grammar title (e.g. "〜ないではいられない", "も〜ば〜も") into the most
// distinctive searchable chunk for Tatoeba: drop (…) notes, split on the ～
// placeholder and slashes, and keep the longest fragment.
function exampleQuery(point: GrammarPoint): string {
  const cleaned = point.title.replace(/[（(][^）)]*[）)]/g, '').trim();
  const parts = cleaned
    .split(/[～〜/／・,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const longest = parts.sort((a, b) => b.length - a.length)[0] ?? cleaned;
  return longest;
}

type Mode = 'grammar' | 'practice' | 'guides' | 'review';
type LevelFilter = 'All' | JlptLevel;
type CatFilter = 'All' | GuideCategory;
type GrammarScope = LevelFilter | 'Favorites' | 'Study Queue' | 'Recent';

type Translate = ReturnType<typeof useT>['t'];

const GUIDE_CAT_KEYS: Record<GuideCategory, string> = {
  Hacks: 'grammar.aero.cat.hacks',
  Reading: 'grammar.aero.cat.reading',
  Writing: 'grammar.aero.cat.writing',
  Literature: 'grammar.aero.cat.literature',
  Speaking: 'grammar.aero.cat.speaking',
  Culture: 'grammar.aero.cat.culture',
};

function guideCategoryFilterLabel(cat: CatFilter, t: Translate): string {
  if (cat === 'All') return t('grammar.filter.all');
  return t(GUIDE_CAT_KEYS[cat]);
}

function grammarScopeLabel(scope: GrammarScope, t: Translate): string {
  if (scope === 'All') return t('grammar.aero.scope.all');
  if (scope === 'Favorites') return t('grammar.aero.scope.favorites');
  if (scope === 'Study Queue') return t('grammar.aero.scope.studyQueue');
  if (scope === 'Recent') return t('grammar.aero.scope.recent');
  return scope;
}

function matchesPoint(g: GrammarPoint, q: string): boolean {
  const hay = `${g.title} ${g.meaning} ${g.structure} ${g.explanation}`.toLowerCase();
  return hay.includes(q);
}

function matchesGuide(g: Guide, q: string): boolean {
  const body = g.sections.map((s) => `${s.heading} ${s.body.join(' ')}`).join(' ');
  const hay = `${g.title} ${g.summary} ${g.category} ${body}`.toLowerCase();
  return hay.includes(q);
}

function parsePracticeDeepLink(detail: unknown): Partial<PracticeFilters> | undefined {
  if (!detail || typeof detail !== 'object') return undefined;
  const d = detail as Record<string, unknown>;
  const out: Partial<PracticeFilters> = {};
  if (d.lang === 'ja' || d.lang === 'zh' || d.lang === 'all') out.lang = d.lang;
  if (typeof d.level === 'string') out.levels = [d.level as GrammarLevel];
  if (Array.isArray(d.levels)) out.levels = d.levels as GrammarLevel[];
  if (typeof d.functions === 'string') out.functions = [d.functions as GrammarFunctionId];
  if (Array.isArray(d.functions)) out.functions = d.functions as GrammarFunctionId[];
  return out;
}

export default function GrammarView() {
  const aero = useAeroMaterials();
  const [mode, setMode] = useState<Mode>('grammar');
  const [practiceSeed, setPracticeSeed] = useState<Partial<PracticeFilters> | undefined>();
  const { t } = useT();

  useEffect(() => {
    const onPractice = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      setPracticeSeed(parsePracticeDeepLink(detail));
      setMode('practice');
    };
    window.addEventListener('grammar:open-practice', onPractice);
    return () => window.removeEventListener('grammar:open-practice', onPractice);
  }, []);

  /*
   * The Aero explorer has no practice mode, so returning it unconditionally
   * made Practice and Test unreachable in that theme — including the
   * `grammar:open-practice` deep link above, which set the mode on a component
   * that then never rendered, so the extension's "practise this" action
   * silently did nothing. Let practice win over the theme branch until the two
   * explorers are unified.
   */
  if (aero && mode !== 'practice') return <AeroGrammarExplorer />;

  const modeLabel =
    mode === 'grammar'
      ? t('grammar.mode.points')
      : mode === 'practice'
        ? t('grammar.mode.practice')
        : mode === 'review'
          ? t('grammar.mode.review')
          : t('grammar.mode.guides');

  const classicStatus = (
    <>
      <StatusBarField>SYN / PARSE UNIT READY</StatusBarField>
      <StatusBarField>{modeLabel}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{t('grammar.count', { count: GRAMMAR.length })}</StatusBarField>
    </>
  );

  return (
    <AppChrome status={classicStatus} className="gram-chrome">
    <div className="gram-view">
      <div className="view-head">
        <p className="muted">{t('grammar.intro')}</p>
        <div className="gram-mode-toggle">
          <button
            className={`gram-mode-btn ${mode === 'grammar' ? 'active' : ''}`}
            onClick={() => setMode('grammar')}
          >
            {t('grammar.mode.points')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'practice' ? 'active' : ''}`}
            onClick={() => setMode('practice')}
          >
            {t('grammar.mode.practice')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'guides' ? 'active' : ''}`}
            onClick={() => setMode('guides')}
          >
            {t('grammar.mode.guides')}
          </button>
          <button
            className={`gram-mode-btn ${mode === 'review' ? 'active' : ''}`}
            onClick={() => setMode('review')}
          >
            {t('grammar.mode.review')}
          </button>
        </div>
      </div>

      {mode === 'grammar' ? (
        <GrammarBrowser />
      ) : mode === 'practice' ? (
        <GrammarPracticePanel initialFilters={practiceSeed} />
      ) : mode === 'review' ? (
        <GrammarCurationPanel />
      ) : (
        <GuidesBrowser />
      )}
    </div>
    </AppChrome>
  );
}

/* -------------------------- Aero Grammar Explorer -------------------------- */

function AeroGrammarExplorer() {
  const { t, lang } = useT();
  const [mode, setMode] = useState<Mode>('grammar');
  const [scope, setScope] = useState<GrammarScope>('All');
  const [cat, setCat] = useState<CatFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedPointId, setSelectedPointId] = useState(GRAMMAR[0]?.id ?? '');
  const [selectedGuideId, setSelectedGuideId] = useState(GUIDES[0]?.id ?? '');
  const [history, setHistory] = useState<string[]>(() => (GRAMMAR[0]?.id ? [GRAMMAR[0].id] : []));
  const [historyIndex, setHistoryIndex] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [studyIds, setStudyIds] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const recentIds = useMemo(() => Array.from(new Set(history.slice().reverse())).slice(0, 12), [history]);

  const pointList = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = GRAMMAR;
    if (scope === 'Favorites') base = base.filter((g) => favoriteIds.has(g.id));
    else if (scope === 'Study Queue') base = base.filter((g) => studyIds.has(g.id));
    else if (scope === 'Recent') base = recentIds.map((id) => GRAMMAR.find((g) => g.id === id)).filter((g): g is GrammarPoint => !!g);
    else if (scope !== 'All') base = base.filter((g) => g.level === scope);
    return base.filter((g) => !q || matchesPoint(g, q));
  }, [favoriteIds, query, recentIds, scope, studyIds]);

  const guideList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUIDES.filter((g) => (cat === 'All' || g.category === cat) && (!q || matchesGuide(g, q)));
  }, [cat, query]);

  const selectedPoint =
    pointList.find((g) => g.id === selectedPointId) ??
    GRAMMAR.find((g) => g.id === selectedPointId) ??
    pointList[0] ??
    null;
  const selectedGuide = guideList.find((g) => g.id === selectedGuideId) ?? GUIDES.find((g) => g.id === selectedGuideId) ?? guideList[0] ?? null;

  function selectPoint(point: GrammarPoint, record = true): void {
    setMode('grammar');
    setSelectedPointId(point.id);
    if (!record) return;
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      if (trimmed[trimmed.length - 1] === point.id) return trimmed;
      const next = [...trimmed, point.id].slice(-40);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }

  function selectGuide(guide: Guide): void {
    setMode('guides');
    setSelectedGuideId(guide.id);
  }

  function goHistory(delta: number): void {
    const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    const point = GRAMMAR.find((g) => g.id === history[next]);
    if (!point) return;
    setHistoryIndex(next);
    selectPoint(point, false);
  }

  function toggleFavorite(): void {
    if (!selectedPoint) return;
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(selectedPoint.id)) next.delete(selectedPoint.id);
      else next.add(selectedPoint.id);
      return next;
    });
  }

  function toggleStudy(): void {
    if (!selectedPoint) return;
    setStudyIds((prev) => {
      const next = new Set(prev);
      if (next.has(selectedPoint.id)) next.delete(selectedPoint.id);
      else next.add(selectedPoint.id);
      return next;
    });
  }

  function setGrammarScope(next: GrammarScope): void {
    setMode('grammar');
    setScope(next);
  }

  function setGuideScope(next: CatFilter): void {
    setMode('guides');
    setCat(next);
  }

  async function copySelectedReference(): Promise<void> {
    if (!selectedPoint) return;
    const text = `${selectedPoint.title} - ${selectedPoint.meaning}\n${selectedPoint.structure}`;
    await navigator.clipboard?.writeText(text);
  }

  const isFavorite = favoriteIds.has(selectedPoint?.id ?? '');
  const isQueued = studyIds.has(selectedPoint?.id ?? '');

  const menus: MenuBarMenu[] = useMemo(
    () => [
      {
        id: 'file',
        label: t('grammar.aero.menu.file'),
        items: [
          {
            id: 'copy-ref',
            label: t('grammar.aero.menu.copyRef'),
            disabled: !selectedPoint,
            onSelect: () => void copySelectedReference(),
          },
          { id: 'sep-file', separator: true, label: '' },
          {
            id: 'focus-search',
            label: t('grammar.aero.menu.findGrammar'),
            onSelect: () => searchRef.current?.focus(),
          },
        ],
      },
      {
        id: 'edit',
        label: t('grammar.aero.menu.edit'),
        items: [
          {
            id: 'clear-search',
            label: t('grammar.aero.menu.clearSearch'),
            disabled: !query,
            onSelect: () => setQuery(''),
          },
          {
            id: 'copy-structure',
            label: t('grammar.aero.menu.copyStructure'),
            disabled: !selectedPoint,
            onSelect: () => void navigator.clipboard?.writeText(selectedPoint?.structure ?? ''),
          },
        ],
      },
      {
        id: 'view',
        label: t('grammar.aero.menu.view'),
        items: [
          { id: 'grammar', label: t('grammar.mode.points'), onSelect: () => setMode('grammar') },
          { id: 'guides', label: t('grammar.mode.guides'), onSelect: () => setMode('guides') },
          { id: 'sep-view', separator: true, label: '' },
          { id: 'all', label: t('grammar.aero.menu.allGrammar'), onSelect: () => setGrammarScope('All') },
          ...LEVELS.map((lv) => ({ id: `level-${lv}`, label: lv, onSelect: () => setGrammarScope(lv) })),
        ],
      },
      {
        id: 'grammar',
        label: t('grammar.aero.menu.grammar'),
        items: [
          {
            id: 'favorite',
            label: isFavorite ? t('grammar.aero.favorite.remove') : t('grammar.aero.favorite.add'),
            disabled: !selectedPoint,
            onSelect: toggleFavorite,
          },
          {
            id: 'study',
            label: isQueued ? t('grammar.aero.study.remove') : t('grammar.aero.study.add'),
            disabled: !selectedPoint,
            onSelect: toggleStudy,
          },
          { id: 'sep-grammar', separator: true, label: '' },
          {
            id: 'show-favorites',
            label: t('grammar.aero.menu.favoritesCount', { count: favoriteIds.size }),
            onSelect: () => setGrammarScope('Favorites'),
          },
          {
            id: 'show-study',
            label: t('grammar.aero.menu.studyCount', { count: studyIds.size }),
            onSelect: () => setGrammarScope('Study Queue'),
          },
        ],
      },
      {
        id: 'help',
        label: t('grammar.aero.menu.help'),
        items: [
          { id: 'open-guides', label: t('grammar.aero.menu.openGuides'), onSelect: () => setMode('guides') },
          {
            id: 'recent',
            label: t('grammar.aero.menu.recent'),
            disabled: recentIds.length === 0,
            onSelect: () => setGrammarScope('Recent'),
          },
        ],
      },
    ],
    [
      favoriteIds.size,
      isFavorite,
      isQueued,
      lang,
      query,
      recentIds.length,
      selectedPoint,
      studyIds.size,
    ],
  );

  const scopeStatusLabel = grammarScopeLabel(scope, t);
  const catStatusLabel = cat === 'All' ? t('grammar.aero.scope.allGuides') : t(GUIDE_CAT_KEYS[cat]);

  const status = (
    <>
      <StatusBarField>
        {mode === 'grammar'
          ? t('grammar.count', { count: pointList.length })
          : t('grammar.guideCount', { count: guideList.length })}
      </StatusBarField>
      <StatusBarField>
        {mode === 'grammar'
          ? t('grammar.aero.status.scope', { scope: scopeStatusLabel })
          : t('grammar.aero.status.category', { category: catStatusLabel })}
      </StatusBarField>
      {selectedPoint && mode === 'grammar' && <StatusBarField>{selectedPoint.title}</StatusBarField>}
      {selectedGuide && mode === 'guides' && <StatusBarField>{selectedGuide.title}</StatusBarField>}
      <StatusBarSpacer />
      <StatusBarField>{t('grammar.aero.status.favorites', { count: favoriteIds.size })}</StatusBarField>
      <StatusBarField live>{t('grammar.aero.status.queued', { count: studyIds.size })}</StatusBarField>
    </>
  );

  return (
    <AppChrome menus={menus} status={status} className="aero-gram-chrome">
      <div className="aero-gram">
        <Toolbar className="aero-gram-toolbar" aria-label={t('grammar.aero.toolbar.aria')}>
          <IconButton label={t('grammar.aero.back')} size="sm" disabled={historyIndex <= 0} onClick={() => goHistory(-1)}>
            <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
          </IconButton>
          <IconButton
            label={t('grammar.aero.forward')}
            size="sm"
            disabled={historyIndex >= history.length - 1}
            onClick={() => goHistory(1)}
          >
            <Icon name="chevron" size={14} />
          </IconButton>
          <ToolbarSeparator />
          <Button size="sm" variant={mode === 'grammar' ? 'primary' : 'default'} onClick={() => setMode('grammar')}>
            {t('grammar.aero.toolbar.grammar')}
          </Button>
          <Button size="sm" variant={mode === 'guides' ? 'primary' : 'default'} onClick={() => setMode('guides')}>
            {t('grammar.aero.toolbar.guides')}
          </Button>
          <ToolbarSeparator />
          {mode === 'grammar' ? (
            <select
              className="aero-gram-select"
              value={scope}
              onChange={(e) => setGrammarScope(e.target.value as GrammarScope)}
              aria-label={t('grammar.aero.scope.aria')}
            >
              <option value="All">{t('grammar.aero.scope.all')}</option>
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
              <option value="Favorites">{t('grammar.aero.scope.favorites')}</option>
              <option value="Study Queue">{t('grammar.aero.scope.studyQueue')}</option>
              <option value="Recent">{t('grammar.aero.scope.recent')}</option>
            </select>
          ) : (
            <select
              className="aero-gram-select"
              value={cat}
              onChange={(e) => setGuideScope(e.target.value as CatFilter)}
              aria-label={t('grammar.aero.cat.aria')}
            >
              <option value="All">{t('grammar.aero.scope.allGuides')}</option>
              {GUIDE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(GUIDE_CAT_KEYS[c])}
                </option>
              ))}
            </select>
          )}
          <div className="aero-gram-search">
            <Icon name="search" size={14} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'grammar' ? t('grammar.aero.search.placeholder') : t('grammar.guideSearch.placeholder')
              }
              lang={mode === 'grammar' ? 'ja' : undefined}
            />
          </div>
          <ToolbarSeparator />
          <IconButton
            label={isFavorite ? t('grammar.aero.favorite.remove') : t('grammar.aero.favorite.add')}
            size="sm"
            disabled={!selectedPoint || mode !== 'grammar'}
            onClick={toggleFavorite}
          >
            <Icon name="star" size={15} fill={isFavorite} />
          </IconButton>
          <IconButton
            label={isQueued ? t('grammar.aero.study.remove') : t('grammar.aero.study.add')}
            size="sm"
            disabled={!selectedPoint || mode !== 'grammar'}
            onClick={toggleStudy}
          >
            <Icon name="check" size={15} />
          </IconButton>
        </Toolbar>

        <SplitPane initial={190} min={150} max={260} storageKey="aero-grammar-nav-pane" className="aero-gram-shell">
          <AeroGrammarNav
            mode={mode}
            scope={scope}
            cat={cat}
            favoriteCount={favoriteIds.size}
            studyCount={studyIds.size}
            recentCount={recentIds.length}
            onGrammarScope={setGrammarScope}
            onGuideScope={setGuideScope}
          />
          <SplitPane initial={350} min={260} max={520} storageKey="aero-grammar-list-pane" className="aero-gram-workspace">
            {mode === 'grammar' ? (
              <AeroPointList
                points={pointList}
                selectedId={selectedPoint?.id ?? ''}
                favorites={favoriteIds}
                queued={studyIds}
                onSelect={selectPoint}
              />
            ) : (
              <AeroGuideList guides={guideList} selectedId={selectedGuide?.id ?? ''} onSelect={selectGuide} />
            )}
            {mode === 'grammar' ? (
              selectedPoint ? (
                <AeroGrammarDetail
                  key={selectedPoint.id}
                  point={selectedPoint}
                  favorite={favoriteIds.has(selectedPoint.id)}
                  queued={studyIds.has(selectedPoint.id)}
                  onFavorite={toggleFavorite}
                  onStudy={toggleStudy}
                />
              ) : (
                <div className="aero-gram-empty">{t('grammar.aero.empty.pointsMatch')}</div>
              )
            ) : selectedGuide ? (
              <AeroGuideDetail guide={selectedGuide} />
            ) : (
              <div className="aero-gram-empty">{t('grammar.aero.empty.guidesMatch')}</div>
            )}
          </SplitPane>
        </SplitPane>
      </div>
    </AppChrome>
  );
}

function AeroGrammarNav({
  mode,
  scope,
  cat,
  favoriteCount,
  studyCount,
  recentCount,
  onGrammarScope,
  onGuideScope,
}: {
  mode: Mode;
  scope: GrammarScope;
  cat: CatFilter;
  favoriteCount: number;
  studyCount: number;
  recentCount: number;
  onGrammarScope: (scope: GrammarScope) => void;
  onGuideScope: (cat: CatFilter) => void;
}) {
  const { t, lang } = useT();

  const grammarItems = useMemo(
    () => [
      { id: 'All' as const, label: t('grammar.aero.scope.all'), count: GRAMMAR.length },
      ...LEVELS.map((lv) => ({ id: lv, label: lv, count: GRAMMAR.filter((g) => g.level === lv).length })),
      { id: 'Favorites' as const, label: t('grammar.aero.scope.favorites'), count: favoriteCount },
      { id: 'Study Queue' as const, label: t('grammar.aero.scope.studyQueue'), count: studyCount },
      { id: 'Recent' as const, label: t('grammar.aero.scope.recent'), count: recentCount },
    ],
    [favoriteCount, lang, recentCount, studyCount],
  );

  const guideItems = useMemo(
    () => [
      { id: 'All' as const, label: t('grammar.aero.scope.allGuides'), count: GUIDES.length },
      ...GUIDE_CATEGORIES.map((c) => ({
        id: c,
        label: t(GUIDE_CAT_KEYS[c]),
        count: GUIDES.filter((g) => g.category === c).length,
      })),
    ],
    [lang],
  );

  return (
    <aside className="aero-gram-nav" aria-label={t('grammar.aero.nav.aria')}>
      <div className="aero-gram-nav-group">
        <div className="aero-gram-nav-title">{t('grammar.aero.nav.library')}</div>
        {grammarItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`aero-gram-nav-row${mode === 'grammar' && scope === item.id ? ' active' : ''}`}
            onClick={() => onGrammarScope(item.id)}
          >
            <Icon
              name={
                item.id === 'Favorites'
                  ? 'star'
                  : item.id === 'Study Queue'
                    ? 'check'
                    : item.id === 'Recent'
                      ? 'refresh'
                      : 'grammar'
              }
              size={14}
            />
            <span>{item.label}</span>
            <span className="aero-gram-nav-count">{item.count}</span>
          </button>
        ))}
      </div>
      <div className="aero-gram-nav-group">
        <div className="aero-gram-nav-title">{t('grammar.aero.nav.guides')}</div>
        {guideItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`aero-gram-nav-row${mode === 'guides' && cat === item.id ? ' active' : ''}`}
            onClick={() => onGuideScope(item.id)}
          >
            <Icon name="library" size={14} />
            <span>{item.label}</span>
            <span className="aero-gram-nav-count">{item.count}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function AeroPointList({
  points,
  selectedId,
  favorites,
  queued,
  onSelect,
}: {
  points: GrammarPoint[];
  selectedId: string;
  favorites: Set<string>;
  queued: Set<string>;
  onSelect: (point: GrammarPoint) => void;
}) {
  const { t } = useT();
  return (
    <section className="aero-gram-list-pane" aria-label={t('grammar.aero.list.aria.points')}>
      <div className="aero-gram-list-head">
        <span>{t('grammar.aero.list.pattern')}</span>
        <span>{t('grammar.aero.list.meaning')}</span>
        <span>{t('grammar.aero.list.level')}</span>
        <span>{t('grammar.aero.list.state')}</span>
      </div>
      <div className="aero-gram-list" role="listbox" aria-label={t('grammar.aero.list.aria.pointList')}>
        {points.length === 0 && <div className="aero-gram-empty">{t('grammar.empty')}</div>}
        {points.map((point) => (
          <button
            key={point.id}
            type="button"
            role="option"
            aria-selected={selectedId === point.id}
            className={`aero-gram-row${selectedId === point.id ? ' active' : ''}`}
            onClick={() => onSelect(point)}
          >
            <span className="aero-gram-row-title" lang="ja">{point.title}</span>
            <span className="aero-gram-row-meaning">{point.meaning}</span>
            <span className={`aero-gram-level lv-${point.level}`}>{point.level}</span>
            <span className="aero-gram-row-flags">
              {favorites.has(point.id) && <Icon name="star" size={12} fill />}
              {queued.has(point.id) && <Icon name="check" size={12} />}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AeroGuideList({ guides, selectedId, onSelect }: { guides: Guide[]; selectedId: string; onSelect: (guide: Guide) => void }) {
  const { t } = useT();
  return (
    <section className="aero-gram-list-pane" aria-label={t('grammar.aero.list.aria.guides')}>
      <div className="aero-gram-list-head aero-gram-guide-head">
        <span>{t('grammar.aero.list.guide')}</span>
        <span>{t('grammar.aero.list.category')}</span>
      </div>
      <div className="aero-gram-list" role="listbox" aria-label={t('grammar.aero.list.aria.guideList')}>
        {guides.length === 0 && <div className="aero-gram-empty">{t('grammar.guidesEmpty')}</div>}
        {guides.map((guide) => (
          <button
            key={guide.id}
            type="button"
            role="option"
            aria-selected={selectedId === guide.id}
            className={`aero-gram-guide-row${selectedId === guide.id ? ' active' : ''}`}
            onClick={() => onSelect(guide)}
          >
            <span className="aero-gram-guide-title">{guide.title}</span>
            <span className="aero-gram-guide-summary">{guide.summary}</span>
            <span className="aero-gram-guide-cat">{t(GUIDE_CAT_KEYS[guide.category])}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AeroGrammarDetail({
  point,
  favorite,
  queued,
  onFavorite,
  onStudy,
}: {
  point: GrammarPoint;
  favorite: boolean;
  queued: boolean;
  onFavorite: () => void;
  onStudy: () => void;
}) {
  const { t } = useT();
  const [exState, setExState] = useState<ExState>('idle');
  const [examples, setExamples] = useState<ExampleSentence[]>([]);
  const [exError, setExError] = useState('');

  async function loadExamples() {
    setExState('loading');
    setExError('');
    const r = await window.api.searchExamples(exampleQuery(point));
    if (r.error) {
      setExState('error');
      setExError(r.error);
      return;
    }
    setExamples(r.examples);
    setExState('done');
  }

  return (
    <article className="aero-gram-detail">
      <header className="aero-gram-detail-head">
        <div>
          <div className="aero-gram-detail-kicker">{t('grammar.aero.detail.kicker')}</div>
          <h2 lang="ja">{point.title}</h2>
          <p>{point.meaning}</p>
        </div>
        <span className={`aero-gram-level lv-${point.level}`}>{point.level}</span>
      </header>
      <div className="aero-gram-detail-actions">
        <Button
          size="sm"
          variant={favorite ? 'primary' : 'default'}
          leftIcon={<Icon name="star" size={13} fill={favorite} />}
          onClick={onFavorite}
        >
          {favorite ? t('grammar.aero.favorite.on') : t('grammar.aero.favorite.off')}
        </Button>
        <Button
          size="sm"
          variant={queued ? 'primary' : 'default'}
          leftIcon={<Icon name="check" size={13} />}
          onClick={onStudy}
        >
          {queued ? t('grammar.aero.study.queued') : t('grammar.aero.study.addShort')}
        </Button>
      </div>
      <section className="aero-gram-property">
        <h3>{t('grammar.structure')}</h3>
        <div className="aero-gram-structure" lang="ja">{point.structure}</div>
      </section>
      <section className="aero-gram-property">
        <h3>{t('grammar.howToUse')}</h3>
        <p>{point.explanation}</p>
      </section>
      <section className="aero-gram-property">
        <div className="aero-gram-section-row">
          <h3>{t('grammar.examples')}</h3>
          <Button size="sm" onClick={loadExamples} disabled={exState === 'loading'}>
            {exState === 'loading' ? t('grammar.searchingTatoeba') : t('grammar.aero.moreExamples')}
          </Button>
        </div>
        <ul className="aero-gram-examples">
          {point.examples.map((ex, i) => (
            <li key={i}>
              <span className="aero-gram-ex-jp" lang="ja">{ex.jp}</span>
              {ex.reading && <span className="aero-gram-ex-reading" lang="ja">{ex.reading}</span>}
              <span className="aero-gram-ex-en">{ex.en}</span>
            </li>
          ))}
          {examples.map((ex, i) => (
            <li key={`extra-${i}`} className="extra">
              <span className="aero-gram-ex-jp" lang="ja">{ex.jp}</span>
              <span className="aero-gram-ex-en">{ex.en}</span>
            </li>
          ))}
        </ul>
        {/*
          CC-BY 2.0 FR obliges us to credit imported sentences. These ship
          inside the app rather than being fetched, so the notice has to ship
          with them; it appears only when a shown example actually came from
          Tatoeba.
        */}
        {point.examples.some((ex) => ex.source === 'tatoeba') && (
          <p className="aero-gram-attribution">{t('grammar.examples.tatoebaCredit')}</p>
        )}
        {exState === 'error' && <p className="aero-gram-message">{exError}</p>}
        {exState === 'done' && examples.length === 0 && (
          <p className="aero-gram-message">{t('grammar.noExtraExamples', { query: exampleQuery(point) })}</p>
        )}
      </section>
    </article>
  );
}

function AeroGuideDetail({ guide }: { guide: Guide }) {
  const { t } = useT();
  return (
    <article className="aero-gram-detail aero-gram-guide-detail">
      <header className="aero-gram-detail-head">
        <div>
          <div className="aero-gram-detail-kicker">{t(GUIDE_CAT_KEYS[guide.category])}</div>
          <h2>{guide.title}</h2>
          <p>{guide.summary}</p>
        </div>
        {guide.level && <span className="aero-gram-guide-level">{guide.level}</span>}
      </header>
      {guide.sections.map((sec, i) => (
        <section className="aero-gram-property" key={i}>
          <h3>{sec.heading}</h3>
          {sec.body.map((para, j) => <p key={j}>{para}</p>)}
          {sec.tips && sec.tips.length > 0 && (
            <ul className="aero-gram-tips">
              {sec.tips.map((tip, k) => <li key={k}>{tip}</li>)}
            </ul>
          )}
          {sec.examples && sec.examples.length > 0 && (
            <ul className="aero-gram-examples">
              {sec.examples.map((ex, k) => (
                <li key={k}>
                  <span className="aero-gram-ex-jp" lang="ja">{ex.jp}</span>
                  {ex.reading && <span className="aero-gram-ex-reading" lang="ja">{ex.reading}</span>}
                  <span className="aero-gram-ex-en">{ex.en}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}

/* ------------------------------ Grammar points ------------------------------ */

function GrammarBrowser() {
  const [filter, setFilter] = useState<LevelFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { t } = useT();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GRAMMAR.filter(
      (g) => (filter === 'All' || g.level === filter) && (!q || matchesPoint(g, q)),
    );
  }, [filter, query]);

  const selected = list.find((g) => g.id === selectedId) ?? list[0] ?? null;

  return (
    <>
      <div className="gram-controls">
        <div className="gram-levels">
          {(['All', ...LEVELS] as LevelFilter[]).map((lv) => (
            <button
              key={lv}
              className={`gram-level-btn ${filter === lv ? 'active' : ''}`}
              onClick={() => setFilter(lv)}
            >
              {lv === 'All' ? t('grammar.filter.all') : lv}
            </button>
          ))}
        </div>
        <input
          className="gram-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('grammar.search.placeholder')}
          lang="ja"
        />
      </div>

      <div className="gram-count muted">{t('grammar.count', { count: list.length })}</div>

      <div className="gram-body">
        <div className="gram-list">
          {list.length === 0 && <div className="gram-empty muted">{t('grammar.empty')}</div>}
          {list.map((g) => (
            <button
              key={g.id}
              className={`gram-item ${selected?.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedId(g.id)}
            >
              <span className="gram-item-top">
                <span className="gram-item-title" lang="ja">
                  {g.title}
                </span>
                <span className={`gram-badge lv-${g.level}`}>{g.level}</span>
              </span>
              <span className="gram-item-meaning">{g.meaning}</span>
            </button>
          ))}
        </div>

        <div className="gram-detail">
          {selected ? (
            <GrammarDetail key={selected.id} point={selected} />
          ) : (
            <div className="gram-detail-empty muted">{t('grammar.selectPrompt')}</div>
          )}
        </div>
      </div>
    </>
  );
}

function GrammarDetail({ point }: { point: GrammarPoint }) {
  const [exState, setExState] = useState<ExState>('idle');
  const [examples, setExamples] = useState<ExampleSentence[]>([]);
  const [exError, setExError] = useState('');
  const { t } = useT();

  async function loadExamples() {
    setExState('loading');
    setExError('');
    const r = await window.api.searchExamples(exampleQuery(point));
    if (r.error) {
      setExState('error');
      setExError(r.error);
      return;
    }
    setExamples(r.examples);
    setExState('done');
  }

  return (
    <article className="gram-card">
      <header className="gram-card-head">
        <h2 lang="ja">{point.title}</h2>
        <span className={`gram-badge lv-${point.level}`}>{point.level}</span>
      </header>
      <p className="gram-gloss">{point.meaning}</p>

      <div className="gram-block">
        <h3>{t('grammar.structure')}</h3>
        <p className="gram-structure" lang="ja">
          {point.structure}
        </p>
      </div>

      <div className="gram-block">
        <h3>{t('grammar.howToUse')}</h3>
        <p>{point.explanation}</p>
      </div>

      <div className="gram-block">
        <h3>{t('grammar.examples')}</h3>
        <ul className="gram-examples">
          {point.examples.map((ex, i) => (
            <li key={i}>
              <span className="gram-ex-jp" lang="ja">
                {ex.jp}
              </span>
              {ex.reading && (
                <span className="gram-ex-reading" lang="ja">
                  {ex.reading}
                </span>
              )}
              <span className="gram-ex-en">{ex.en}</span>
            </li>
          ))}
        </ul>

        {exState === 'idle' && (
          <button className="gram-more-btn" onClick={loadExamples}>
            {t('grammar.moreExamples')}
          </button>
        )}
        {exState === 'loading' && (
          <p className="gram-more-status muted">{t('grammar.searchingTatoeba')}</p>
        )}
        {exState === 'error' && <p className="gram-more-status muted">{exError}</p>}
        {exState === 'done' && examples.length === 0 && (
          <p className="gram-more-status muted">
            {t('grammar.noExtraExamples', { query: exampleQuery(point) })}
          </p>
        )}
        {exState === 'done' && examples.length > 0 && (
          <ul className="gram-examples gram-examples-extra">
            {examples.map((ex, i) => (
              <li key={i}>
                <span className="gram-ex-jp" lang="ja">
                  {ex.jp}
                </span>
                <span className="gram-ex-en">{ex.en}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/* ------------------------------ Guides & hacks ------------------------------ */

function GuidesBrowser() {
  const [cat, setCat] = useState<CatFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { t } = useT();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUIDES.filter(
      (g) => (cat === 'All' || g.category === cat) && (!q || matchesGuide(g, q)),
    );
  }, [cat, query]);

  const selected = list.find((g) => g.id === selectedId) ?? list[0] ?? null;

  return (
    <>
      <div className="gram-controls">
        <div className="gram-levels">
          {(['All', ...GUIDE_CATEGORIES] as CatFilter[]).map((c) => (
            <button
              key={c}
              className={`gram-level-btn ${cat === c ? 'active' : ''}`}
              onClick={() => setCat(c)}
            >
              {guideCategoryFilterLabel(c, t)}
            </button>
          ))}
        </div>
        <input
          className="gram-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('grammar.guideSearch.placeholder')}
        />
      </div>

      <div className="gram-count muted">{t('grammar.guideCount', { count: list.length })}</div>

      <div className="gram-body">
        <div className="gram-list guide-list">
          {list.length === 0 && <div className="gram-empty muted">{t('grammar.guidesEmpty')}</div>}
          {list.map((g) => (
            <button
              key={g.id}
              className={`guide-item ${selected?.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedId(g.id)}
            >
              <span className="guide-item-text">
                <span className="guide-item-top">
                  <span className="guide-item-title">{g.title}</span>
                  <span className="guide-cat-badge">{t(GUIDE_CAT_KEYS[g.category])}</span>
                </span>
                <span className="guide-item-summary">{g.summary}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="gram-detail">
          {selected ? (
            <GuideArticle guide={selected} />
          ) : (
            <div className="gram-detail-empty muted">{t('grammar.selectGuidePrompt')}</div>
          )}
        </div>
      </div>
    </>
  );
}

function GuideArticle({ guide }: { guide: Guide }) {
  const { t } = useT();
  return (
    <article className="guide-article">
      <header className="guide-article-head">
        <div>
          <h2>{guide.title}</h2>
          <p className="guide-article-summary">{guide.summary}</p>
          <div className="guide-article-meta">
            <span className="guide-cat-badge">{t(GUIDE_CAT_KEYS[guide.category])}</span>
            {guide.level && <span className="guide-level-tag">{guide.level}</span>}
          </div>
        </div>
      </header>

      {guide.sections.map((sec, i) => (
        <section className="guide-section" key={i}>
          <h3>{sec.heading}</h3>
          {sec.body.map((para, j) => (
            <p key={j}>{para}</p>
          ))}

          {sec.tips && sec.tips.length > 0 && (
            <ul className="guide-tips">
              {sec.tips.map((tip, k) => (
                <li key={k}>{tip}</li>
              ))}
            </ul>
          )}

          {sec.examples && sec.examples.length > 0 && (
            <ul className="gram-examples guide-examples">
              {sec.examples.map((ex, k) => (
                <li key={k}>
                  <span className="gram-ex-jp" lang="ja">
                    {ex.jp}
                  </span>
                  {ex.reading && (
                    <span className="gram-ex-reading" lang="ja">
                      {ex.reading}
                    </span>
                  )}
                  <span className="gram-ex-en">{ex.en}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
