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
import { addDeckCards, createDeckFolder } from '../../flashcardDeck';
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
  addPreset,
  loadPresets,
  savePresets,
  snapshotFilters,
  type FilterPreset,
} from '../../grammarPresets';
import { useT } from '../../i18n';
import { Button } from '../ui';
import VirtualList from '../VirtualList';
import GrammarBandControl from './GrammarBandControl';
import GrammarFilterPanel from './GrammarFilterPanel';

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

const FAVORITES_KEY = 'jp-grammarx-explorer-favorites-v1';
const STUDY_KEY = 'jp-grammarx-explorer-study-v1';
const MAX_HISTORY = 40;
const ROW_HEIGHT = 58;
const FAMILIARITY_KEYS = ['new', 'learning', 'familiar', 'known'] as const;

function loadIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveIds(key: string, ids: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

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
  const [favorites, setFavorites] = useState<Set<string>>(() => loadIds(FAVORITES_KEY));
  const [studyQueue, setStudyQueue] = useState<Set<string>>(() => loadIds(STUDY_KEY));
  const [familiarity, setFamiliarityState] = useState<FamiliarityState>(() => loadFamiliarity());
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets());
  const [presetName, setPresetName] = useState('');
  const [status, setStatus] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => savePresets(presets), [presets]);

  useEffect(() => savePracticeFilters(filters, EXPLORER_FILTERS_KEY), [filters]);
  useEffect(() => saveIds(FAVORITES_KEY, favorites), [favorites]);
  useEffect(() => saveIds(STUDY_KEY, studyQueue), [studyQueue]);

  // A practice session grading a card, or another window, writes familiarity;
  // re-read so the badges and band controls here never show a stale level.
  useEffect(() => onFamiliarityChanged(() => setFamiliarityState(loadFamiliarity())), []);

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

  // Dedupe is static; decoration re-runs only when learner state changes.
  const baseCorpus = useMemo(() => dedupeGrammarByTitle(GRAMMAR), []);
  const corpus = useMemo(() => applyFamiliarity(baseCorpus, familiarity), [baseCorpus, familiarity]);
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

  const toggleIn = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [],
  );

  const selectedPoints = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter((p): p is NormalizedGrammarPoint => !!p),
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
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>, msgKey: string) => {
      if (!selectedPoints.length) return;
      setter((prev) => new Set([...prev, ...selectedPoints.map((p) => p.id)]));
      setStatus(t(msgKey, { count: selectedPoints.length }));
    },
    [selectedPoints, t],
  );

  const addToDeck = useCallback(() => {
    if (!deckEligible.length) return;
    createDeckFolder('Grammar');
    addDeckCards(
      deckEligible.map((p) => ({
        word: p.title,
        reading: '',
        meaning: p.meaning,
        sentence: p.examples[0]?.jp,
        front: p.title,
        back: `${p.meaning}${p.structure ? `\n${p.structure}` : ''}`,
        source: 'import' as const,
        folder: 'Grammar',
      })),
    );
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
              <span className="gram-x-title" lang="ja">
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
      <div className="gram-x-controls">
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
          lang="ja"
        />
        <Button size="sm" onClick={() => setShowFilters((v) => !v)}>
          {t('grammar.explorer.filters')}
        </Button>
        {hasActiveFilters(filters) && (
          <Button size="sm" onClick={() => setFilters({ ...DEFAULT_PRACTICE_FILTERS })}>
            {t('grammar.explorer.reset')}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => setShowDrawer((v) => !v)}
          disabled={noSelection}
          title={selectionReason}
        >
          {t('grammar.explorer.drawer', { count: selectedPoints.length })}
        </Button>
      </div>

      <div className="gram-x-presets">
        <select
          className="gram-x-preset-select"
          value=""
          aria-label={t('grammar.explorer.presets')}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            if (p) applyPreset(p);
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
        {status && (
          <span className="gram-x-status muted" role="status">
            {status}
          </span>
        )}
      </div>

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
          <div className="gram-x-filters">
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
          <aside className="gram-x-drawer" aria-label={t('grammar.explorer.drawerTitle')}>
            <div className="gram-x-drawer-head">
              <strong>{t('grammar.explorer.drawerTitle')}</strong>
              <Button size="sm" onClick={() => setSelected(new Set())}>
                {t('grammar.explorer.clearSelection')}
              </Button>
            </div>

            <div className="gram-x-drawer-actions">
              <Button size="sm" disabled={noSelection} title={selectionReason}
                onClick={() => bulkInto(setFavorites, 'grammar.explorer.status.favorited')}>
                {t('grammar.explorer.bulkFavorite')}
              </Button>
              <Button size="sm" disabled={noSelection} title={selectionReason}
                onClick={() => bulkInto(setStudyQueue, 'grammar.explorer.status.queued')}>
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
                  <span lang="ja">{p.title}</span>
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
              <div className="gram-x-detail-actions">
                <Button size="sm" onClick={() => toggleIn(setFavorites, focused.id)}>
                  {t(
                    favorites.has(focused.id)
                      ? 'grammar.explorer.unfavorite'
                      : 'grammar.explorer.favorite',
                  )}
                </Button>
                <Button size="sm" onClick={() => toggleIn(setStudyQueue, focused.id)}>
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
