import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GRAMMAR, type NormalizedGrammarPoint } from '../../data/grammar';
import {
  DEFAULT_PRACTICE_FILTERS,
  EXPLORER_FILTERS_KEY,
  dedupeGrammarByTitle,
  filterGrammarPoints,
  hasActiveFilters,
  loadPracticeFilters,
  savePracticeFilters,
  type PracticeFilters,
} from '../../data/grammar/practiceFilters';
import { createDeckFolder } from '../../flashcardDeck';
import { mineGrammarPoints } from '../../studyMiningRoutes';
import {
  applyFamiliarity,
  loadFamiliarity,
  onFamiliarityChanged,
  saveFamiliarity,
  setFamiliarity,
  type FamiliarityState,
  type GxLevel,
} from '../../grammarFamiliarity';
import {
  applyCuration,
  loadCuration,
  onCurationChanged,
  type CurationState,
} from '../../grammarCuration';
import {
  addPreset,
  loadPresets,
  sameFilters,
  savePresets,
  snapshotFilters,
  type FilterPreset,
} from '../../grammarPresets';
import {
  applyCollections,
  loadCollections,
  onGrammarCollectionsChanged,
  saveCollections,
  withListMembership,
  type GrammarCollections,
} from '../../grammarCollections';
import { useT } from '../../i18n';
import { Button } from '../ui';
import VirtualList from '../VirtualList';
import GrammarBandControl from './GrammarBandControl';
import GrammarFilterPanel from './GrammarFilterPanel';
import { contentLangOf, studyContentLang } from '../../studyEnvironment';

/** The two regions the toolbar's disclosures name through `aria-controls`. */
const FILTERS_PANEL_ID = 'gram-x-filters-panel';
const DRAWER_ID = 'gram-x-selection-drawer';

/**
 * The single grammar Explorer, shared by every skin.
 *
 * There used to be two: `AeroGrammarExplorer` and `GrammarBrowser`, picked by an
 * early return in GrammarView. They had drifted badly — Aero had favourites, a
 * study queue and back/forward history that the classic browser simply did not,
 * so which features you got depended on your theme.
 *
 * Worse, and the actual reason this needed doing: **neither of them used the
 * Phase 1 filter layer.** Both read raw `GRAMMAR`, so both listed all 2,227
 * rows including the 334 duplicate ones that `dedupeGrammarByTitle` exists to
 * collapse, and neither could filter by category, register, verified tags or
 * study-readiness. That entire investment was reachable only from the Practice
 * screen. Browsing — the thing people actually do — was the one place it was
 * missing.
 *
 * So this component is deliberately thin: it holds selection and navigation
 * state, and defers every question about *which records match* to
 * `filterGrammarPoints`, the same predicate that backs the counts and the
 * practice list. Skins differ by CSS class, never by behaviour.
 */

const MAX_HISTORY = 40;
const ROW_HEIGHT = 58;
const FAMILIARITY_KEYS = ['new', 'learning', 'familiar', 'known'] as const;

export interface GrammarExplorerProps {
  /** Renders the detail pane for the focused record. Supplied by the view. */
  renderDetail: (point: NormalizedGrammarPoint) => React.ReactNode;
  className?: string;
  /** Optional shell deep link. The key lets selecting the same record refocus it. */
  focusRequest?: { id: string; key: number } | null;
}

export default function GrammarExplorer({
  renderDetail,
  className = '',
  focusRequest,
}: GrammarExplorerProps) {
  const { t } = useT();
  const [filters, setFilters] = useState<PracticeFilters>(() =>
    loadPracticeFilters(EXPLORER_FILTERS_KEY),
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [collections, setCollections] = useState<GrammarCollections>(() => loadCollections());
  const favorites = collections.favorites;
  const studyQueue = collections.queue;
  const [familiarity, setFamiliarityState] = useState<FamiliarityState>(() => loadFamiliarity());
  const [curation, setCuration] = useState<CurationState>(() => loadCuration());
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets());
  /*
   * Which saved preset the current filters came from, or '' for none.
   *
   * The select used to pin `value=""`, so loading a named preset left the box
   * reading "Saved filters…" — the one control on screen that could tell you
   * which of your presets was active never did (audit T4). It is cleared below
   * the moment the filters stop matching, because a preset name over filters
   * that have since been edited is the same defect pointing the other way.
   */
  const [activePresetId, setActivePresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [status, setStatus] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => savePresets(presets), [presets]);

  useEffect(() => savePracticeFilters(filters, EXPLORER_FILTERS_KEY), [filters]);

  /*
   * Drop the preset name as soon as the filters stop being that preset.
   *
   * Naming a preset over filters the user has since edited would be the same
   * defect as T4 in the other direction — a label that does not describe what
   * is on screen. Compared structurally rather than by reference: `setFilters`
   * always produces a new object, so an identity check would clear the name on
   * every keystroke including the one that applied it.
   */
  useEffect(() => {
    if (!activePresetId) return;
    const active = presets.find((p) => p.id === activePresetId);
    if (!active || !sameFilters(active.filters, filters)) setActivePresetId('');
  }, [filters, presets, activePresetId]);
  // Lists are shared with Practice and Review; follow edits made there.
  useEffect(() => onGrammarCollectionsChanged(() => setCollections(loadCollections())), []);

  // A practice session grading a card, or another window, writes familiarity;
  // re-read so the badges and band controls here never show a stale level.
  useEffect(() => onFamiliarityChanged(() => setFamiliarityState(loadFamiliarity())), []);

  // Likewise for Review verdicts written in the sibling panel.
  useEffect(() => onCurationChanged(() => setCuration(loadCuration())), []);

  const setBand = useCallback(
    (id: string, level: GxLevel) => {
      setFamiliarityState((prev) => {
        const next = setFamiliarity(prev, id, level);
        saveFamiliarity(next);
        return next;
      });
    },
    [],
  );

  // Curated first, then deduped, then decorated — the same order Practice
  // uses, so the two screens cannot disagree about what the corpus is.
  // `applyCuration` reaching here is what makes a Review verdict mean
  // something outside the Review screen (audit F20).
  const curated = useMemo(() => applyCuration(GRAMMAR, curation), [curation]);
  const baseCorpus = useMemo(() => dedupeGrammarByTitle(curated), [curated]);
  const corpus = useMemo(
    () => applyCollections(applyFamiliarity(baseCorpus, familiarity), collections),
    [baseCorpus, familiarity, collections],
  );
  const list = useMemo(() => filterGrammarPoints(corpus, filters), [corpus, filters]);

  const byId = useMemo(() => new Map(corpus.map((p) => [p.id, p])), [corpus]);
  const focused = (focusedId && byId.get(focusedId)) || list[0] || null;

  /*
   * Now that the list really is windowed, the focused row can be outside the
   * rendered range — so a selection made from a search result, a filter change
   * or another surface would leave the detail pane showing a pattern the list
   * is not displaying. `VirtualList` only scrolls when this index CHANGES and
   * only as far as it takes, so scrolling away from your own selection is still
   * allowed; it just does not silently lose it.
   */
  const focusedIndex = useMemo(
    () => (focused ? list.findIndex((p) => p.id === focused.id) : -1),
    [list, focused],
  );

  /*
   * Selection survives filtering. Hiding a record must not silently drop it
   * from a pending bulk action — the count below tells you how many are
   * currently out of view instead.
   */
  const visibleIds = useMemo(() => new Set(list.map((p) => p.id)), [list]);
  const hiddenSelectedCount = useMemo(
    () => [...selected].filter((id) => !visibleIds.has(id)).length,
    [selected, visibleIds],
  );

  const focus = useCallback((id: string, record = true) => {
    setFocusedId(id);
    if (!record) return;
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      if (trimmed[trimmed.length - 1] === id) return trimmed;
      const next = [...trimmed, id].slice(-MAX_HISTORY);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [historyIndex]);

  useEffect(() => {
    if (focusRequest && byId.has(focusRequest.id)) focus(focusRequest.id);
  }, [byId, focus, focusRequest]);

  const goHistory = useCallback(
    (delta: number) => {
      const next = historyIndex + delta;
      if (next < 0 || next >= history.length) return;
      setHistoryIndex(next);
      setFocusedId(history[next]);
    },
    [history, historyIndex],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setListMembership = useCallback(
    (list: keyof GrammarCollections, ids: readonly string[], member: boolean) => {
      setCollections((prev) => {
        const next = withListMembership(prev, list, ids, member);
        saveCollections(next);
        return next;
      });
    },
    [],
  );

  const selectedPoints = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p),
    [byId, selected],
  );

  /*
   * Why an action is unavailable, in the action's own terms.
   *
   * "Greyed out with no explanation" is the failure this replaces. A deck card
   * built from a record with no example sentence is an empty card, so the
   * action is blocked when *every* selected record is in that state — and when
   * only some are, it runs and says how many it skipped rather than quietly
   * producing junk.
   */
  const deckEligible = useMemo(
    () => selectedPoints.filter((p) => p.examples.length > 0),
    [selectedPoints],
  );
  const deckSkipped = selectedPoints.length - deckEligible.length;

  const noSelection = selectedPoints.length === 0;
  const selectionReason = noSelection ? t('grammar.explorer.reason.noSelection') : undefined;
  const filtersActive = hasActiveFilters(filters);
  // A disabled control has to say what would enable it, the way Save already does. History starts
  // empty on every open, so Back and Forward are greyed out the moment the explorer mounts.
  const noBack = historyIndex <= 0;
  const noForward = historyIndex < 0 || historyIndex >= history.length - 1;
  const deckReason = noSelection
    ? selectionReason
    : deckEligible.length === 0
      ? t('grammar.explorer.reason.noExamples', { count: selectedPoints.length })
      : deckSkipped > 0
        ? t('grammar.explorer.reason.willSkip', { count: deckSkipped })
        : undefined;

  const bulkInto = useCallback(
    (list: keyof GrammarCollections, msgKey: string) => {
      if (!selectedPoints.length) return;
      setListMembership(list, selectedPoints.map((p) => p.id), true);
      setStatus(t(msgKey, { count: selectedPoints.length }));
    },
    [selectedPoints, setListMembership, t],
  );

  const addToDeck = useCallback(() => {
    if (!deckEligible.length) return;
    createDeckFolder('Grammar');
    // Through mineToStudy: a point already in the deck is not added twice.
    void mineGrammarPoints(deckEligible, 'Grammar');
    setStatus(
      deckSkipped > 0
        ? t('grammar.explorer.status.addedSkipped', {
            count: deckEligible.length,
            skipped: deckSkipped,
          })
        : t('grammar.explorer.status.added', { count: deckEligible.length }),
    );
  }, [deckEligible, deckSkipped, t]);

  // Snapshot on the way out too: a shallow spread would leave the live filter
  // state sharing arrays with the stored preset.
  const applyPreset = useCallback((preset: FilterPreset) => {
    setFilters(snapshotFilters(preset.filters));
    setActivePresetId(preset.id);
  }, []);

  const renderRow = useCallback(
    (p: NormalizedGrammarPoint & { familiarity?: GxLevel }) => {
      // New (0) is the default for most of the corpus; a badge on every row
      // would be noise, so it shows only once a point has been touched.
      const band = p.familiarity ?? 0;
      return (
        <div
          className={`gram-x-row ${focused?.id === p.id ? 'focused' : ''} ${
            selected.has(p.id) ? 'selected' : ''
          }`}
        >
          {/* The label is load-bearing, not decoration: `.lq-check` puts the 32px hit
              floor on the WRAPPER, and only a label forwards that click to the control
              inside it. A span here would be a dead 32px region over the checkbox. */}
          <label className="lq-check">
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggleSelected(p.id)}
              aria-label={t('grammar.explorer.select')}
            />
          </label>
          <button className="gram-x-row-main" onClick={() => focus(p.id)}>
            <span className="gram-x-row-top">
              <span className="gram-x-title" lang={contentLangOf(p.lang)}>
                {p.title}
              </span>
              <span className={`gram-badge lv-${p.level}`}>{p.level}</span>
              {band > 0 && (
                <span className={`gram-fam fam-${band}`} title={t(`grammar.familiarity.${FAMILIARITY_KEYS[band]}`)}>
                  {t(`grammar.familiarity.${FAMILIARITY_KEYS[band]}`).charAt(0)}
                </span>
              )}
              {favorites.has(p.id) && <span className="gram-x-flag">★</span>}
              {studyQueue.has(p.id) && <span className="gram-x-flag">＋</span>}
            </span>
            <span className="gram-x-meaning">{p.meaning}</span>
          </button>
        </div>
      );
    },
    [favorites, focus, focused, selected, studyQueue, t, toggleSelected],
  );

  return (
    <div className={`gram-x ${className}`}>
      <div className="gram-x-controls lq-hit-scope">
        <Button
          size="sm"
          disabled={noBack}
          title={noBack ? t('grammar.explorer.reason.noBack') : undefined}
          onClick={() => goHistory(-1)}
        >
          {t('grammar.explorer.back')}
        </Button>
        <Button
          size="sm"
          disabled={noForward}
          title={noForward ? t('grammar.explorer.reason.noForward') : undefined}
          onClick={() => goHistory(1)}
        >
          {t('grammar.explorer.forward')}
        </Button>
        <input
          ref={searchRef}
          className="gram-search"
          type="text"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          placeholder={t('grammar.search.placeholder')}
          lang={filters.lang === 'all' ? studyContentLang() : contentLangOf(filters.lang)}
        />
        {/* A real APG disclosure, not a button that happens to toggle something: the panel it
            opens is named, and its state is announced. Both this and the selection drawer
            below were plain buttons, so a screen reader was told a control existed and never
            told whether pressing it had opened anything. */}
        <Button
          size="sm"
          className={filtersActive ? 'gram-x-filters-btn is-on' : 'gram-x-filters-btn'}
          aria-expanded={showFilters}
          // a11y3: only while the panel exists; a reference to nothing is invalid ARIA.
          aria-controls={showFilters ? FILTERS_PANEL_ID : undefined}
          // Filters can be active while the panel is shut, and a list quietly showing 4 of
          // 2,410 rows for no visible reason is the surface lying by omission. The marker is
          // a dot AND this label, never colour alone.
          aria-label={filtersActive ? t('grammar.explorer.filtersOn') : undefined}
          // Deliberately NOT a `title`: `grammarDisabledReasons.test.ts` holds this row to
          // "a title is a disabled reason and nothing else", and this control is enabled.
          onClick={() => setShowFilters((v) => !v)}
        >
          {t('grammar.explorer.filters')}
        </Button>
        <Button
          size="sm"
          aria-expanded={showDrawer && !noSelection}
          aria-controls={showDrawer && !noSelection ? DRAWER_ID : undefined}
          onClick={() => setShowDrawer((v) => !v)}
          disabled={noSelection}
          title={selectionReason}
        >
          {t('grammar.explorer.drawer', { count: selectedPoints.length })}
        </Button>
      </div>

      {/* The status line stays OUT of the filter panel on purpose. `setStatus` is written by
          the bulk favourite/queue/deck actions too, so a live region that only exists while
          the filters are open would silently swallow the confirmation for three actions that
          have nothing to do with filtering. */}
      {status && (
        <div className="gram-x-status muted" role="status">
          {status}
        </div>
      )}

      <div className="gram-x-count muted">
        {t('grammar.count', { count: list.length })}
        {selected.size > 0 && (
          <span className="gram-x-selcount">
            {t('grammar.explorer.selectedCount', { count: selected.size })}
            {hiddenSelectedCount > 0 && (
              /* Say it out loud rather than letting a bulk action surprise them. */
              <span className="gram-x-hidden">
                {t('grammar.explorer.hiddenCount', { count: hiddenSelectedCount })}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="gram-x-body">
        {showFilters && (
          <div className="gram-x-filters" id={FILTERS_PANEL_ID}>
            {/* Reset belongs with the filters it resets, and it is only ever needed by
                someone who has come here to change them. Its toolbar slot is replaced by the
                is-on marker on the Filters button, so the STATE stays visible while the
                control moves one press away. */}
            {filtersActive && (
              <div className="gram-x-filters-reset lq-hit-scope">
                <Button size="sm" onClick={() => setFilters({ ...DEFAULT_PRACTICE_FILTERS })}>
                  {t('grammar.explorer.reset')}
                </Button>
              </div>
            )}
            {/* Saved filters are filter state, so the builder lives with the filters rather
                than as a permanent second toolbar row. Same three controls, same handlers. */}
            <div className="gram-x-presets lq-hit-scope">
              <select
                className="gram-x-preset-select"
                value={activePresetId}
                aria-label={t('grammar.explorer.presets')}
                onChange={(e) => {
                  const p = presets.find((x) => x.id === e.target.value);
                  if (p) applyPreset(p);
                  else setActivePresetId('');
                }}
              >
                <option value="">{t('grammar.explorer.presets')}</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className="gram-x-preset-name"
                type="text"
                value={presetName}
                placeholder={t('grammar.explorer.presetNamePlaceholder')}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!presetName.trim()}
                title={!presetName.trim() ? t('grammar.explorer.reason.noPresetName') : undefined}
                onClick={() => {
                  setPresets((prev) => addPreset(prev, presetName, filters));
                  setStatus(t('grammar.explorer.status.presetSaved', { name: presetName.trim() }));
                  setPresetName('');
                }}
              >
                {t('grammar.explorer.savePreset')}
              </Button>
            </div>
            <GrammarFilterPanel corpus={corpus} filters={filters} onChange={setFilters} />
          </div>
        )}

        <div className="gram-x-list">
          {list.length === 0 ? (
            <div className="gram-empty muted">{t('grammar.empty')}</div>
          ) : (
            <VirtualList
              items={list}
              itemHeight={ROW_HEIGHT}
              getKey={(p) => p.id}
              renderItem={renderRow}
              scrollToIndex={focusedIndex}
              listRole="list"
              itemRole="listitem"
            />
          )}
        </div>

        {showDrawer && !noSelection && (
          <aside
            className="gram-x-drawer"
            id={DRAWER_ID}
            aria-label={t('grammar.explorer.drawerTitle')}
          >
            <div className="gram-x-drawer-head">
              <strong>{t('grammar.explorer.drawerTitle')}</strong>
              <Button size="sm" onClick={() => setSelected(new Set())}>
                {t('grammar.explorer.clearSelection')}
              </Button>
            </div>

            <div className="gram-x-drawer-actions">
              <Button size="sm" disabled={noSelection} title={selectionReason}
                onClick={() => bulkInto('favorites', 'grammar.explorer.status.favorited')}>
                {t('grammar.explorer.bulkFavorite')}
              </Button>
              <Button size="sm" disabled={noSelection} title={selectionReason}
                onClick={() => bulkInto('queue', 'grammar.explorer.status.queued')}>
                {t('grammar.explorer.bulkQueue')}
              </Button>
              <Button
                size="sm"
                disabled={deckEligible.length === 0}
                title={deckReason}
                onClick={addToDeck}
              >
                {t('grammar.explorer.bulkDeck')}
              </Button>
            </div>

            {/* The drawer lists what a bulk action will touch, including the
                rows currently filtered out of the list behind it. */}
            <ul className="gram-x-drawer-list">
              {selectedPoints.map((p) => (
                <li key={p.id} className={visibleIds.has(p.id) ? '' : 'hidden-by-filter'}>
                  <span lang={contentLangOf(p.lang)}>{p.title}</span>
                  <span className="gram-x-drawer-level">{p.level}</span>
                  {!visibleIds.has(p.id) && (
                    <span className="gram-x-drawer-flag">{t('grammar.explorer.hiddenFlag')}</span>
                  )}
                  <button
                    className="gram-x-drawer-remove"
                    onClick={() => toggleSelected(p.id)}
                    aria-label={t('grammar.explorer.removeFromSelection')}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="gram-x-detail">
          {focused ? (
            <>
              <div className="gram-x-detail-actions lq-hit-scope">
                <Button
                  size="sm"
                  onClick={() => {
                    const adding = !favorites.has(focused.id);
                    setListMembership('favorites', [focused.id], adding);
                    setStatus(t(adding ? 'grammar.explorer.status.favoritedOne' : 'grammar.explorer.status.unfavoritedOne'));
                  }}
                >
                  {t(
                    favorites.has(focused.id)
                      ? 'grammar.explorer.unfavorite'
                      : 'grammar.explorer.favorite',
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const adding = !studyQueue.has(focused.id);
                    setListMembership('queue', [focused.id], adding);
                    setStatus(t(adding ? 'grammar.explorer.status.queuedOne' : 'grammar.explorer.status.unqueuedOne'));
                  }}
                >
                  {t(
                    studyQueue.has(focused.id)
                      ? 'grammar.explorer.removeFromQueue'
                      : 'grammar.explorer.addToQueue',
                  )}
                </Button>
              </div>
              <div className="gram-x-detail-band">
                <span className="muted gram-x-band-label">{t('grammar.familiarity.setLabel')}</span>
                <GrammarBandControl
                  level={familiarity[focused.id]?.l ?? 0}
                  manual={familiarity[focused.id]?.m === 1}
                  onSet={(level) => setBand(focused.id, level)}
                />
              </div>
              {renderDetail(focused)}
            </>
          ) : (
            <div className="gram-detail-empty muted">{t('grammar.selectPrompt')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
