/**
 * Step 2 of the Deck Workbench: the smart Browser.
 *
 * All of the model — columns, rows, search, sort, selection — is pure and lives
 * in `shared/ankiWorkbenchBrowser.ts`. This file virtualizes it and nothing more,
 * so a 100k-note draft costs the same DOM as a 10-note one (the plan's gate 9).
 *
 * The honesty problem this surface has to solve: the draft in memory is ONE PAGE.
 * "Select all matching" against a filter that could only be evaluated on that
 * page would claim a selection nobody computed, so it is offered only when the
 * filter is empty (where "all matching" means the whole source and is
 * well-defined) or when the whole source is loaded. With a query active on a
 * paged source the user gets the honest alternative: select the rows found here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  EMPTY_SELECTION,
  browserFieldNames,
  buildBrowserRows,
  defaultBrowserColumns,
  isRowSelected,
  nextBrowserSort,
  selectAllMatching,
  selectRowRange,
  selectionCount,
  selectionIsWholeSource,
  sortBrowserRows,
  toggleBrowserColumn,
  toggleRowSelection,
  visibleBrowserColumns,
  type BrowserSelection,
  type BrowserSort,
} from '../../../shared/ankiWorkbenchBrowser';
import { filterBrowserRows, type BrowserQueryErrorCode } from '../../../shared/ankiBrowserQuery';
import { buildCardHealthContext } from '../../../shared/ankiCardHealth';
import { buildMediaHealthContext } from '../../../shared/ankiMediaHealth';
import { buildSiblingAuditContext } from '../../../shared/ankiSiblingAudit';
import { buildStaleContext } from '../../../shared/ankiStaleCards';
import {
  QUERY_EXPLAIN_KEY_PREFIX,
  explainBrowserQuery,
  type QueryExplainNode,
} from '../../../shared/ankiQueryExplain';
import {
  buildVocabContext,
  collectVocabTerms,
  type VocabKnownPrecedence,
} from '../../../shared/ankiVocabContext';
import { MAX_FREQUENCY_BATCH } from '../../../shared/lexiconFrequency';
import { getLevel, onKnowledgeChanged } from '../../knownWords';
import {
  EMPTY_SAVED_VIEWS,
  SAVED_VIEWS_STORAGE_KEY,
  applyBrowserView,
  browserViewSort,
  captureBrowserView,
  parseSavedBrowserViews,
  removeBrowserView,
  saveBrowserView,
  serializeSavedBrowserViews,
} from '../../../shared/ankiBrowserViews';
import type { AnkiDraftEditJournal, AnkiDraftEditResult } from '../../../shared/ankiDraftEdit';
import { editedNoteIds, noteIsEdited } from '../../../shared/ankiDraftEdit';
import VirtualList from '../VirtualList';
import { useT } from '../../i18n';
import DeckWorkbenchInspector from './DeckWorkbenchInspector';
import DeckWorkbenchSamples from './DeckWorkbenchSamples';
import DeckWorkbenchDuplicates from './DeckWorkbenchDuplicates';
import DeckWorkbenchMedia from './DeckWorkbenchMedia';
import DeckWorkbenchSiblings from './DeckWorkbenchSiblings';
import DeckWorkbenchStale from './DeckWorkbenchStale';
import DeckWorkbenchWorkload from './DeckWorkbenchWorkload';

const ROW_HEIGHT = 34;
/** How far PageUp/PageDown moves the cursor. */
const PAGE_ROWS = 10;
/** DOM id of a row, so `aria-activedescendant` has something to point at. */
const rowDomId = (noteId: string): string => `wb-row-${noteId}`;

/** The plan's Browser modes. `gallery` is the representative sample set. */
type BrowserView = 'grid' | 'samples';

/** Parse-failure code → i18n key. Kept exhaustive so a new code cannot go mute. */
const QUERY_ERROR_KEY: Record<BrowserQueryErrorCode, string> = {
  'unknown-key': 'ankiWorkbench.browser.query.unknownKey',
  'bad-regex': 'ankiWorkbench.browser.query.badRegex',
  'unbalanced-paren': 'ankiWorkbench.browser.query.unbalancedParen',
  'empty-group': 'ankiWorkbench.browser.query.emptyGroup',
  'dangling-operator': 'ankiWorkbench.browser.query.danglingOperator',
  'no-vocab-context': 'ankiWorkbench.browser.query.noVocabContext',
  'no-render-context': 'ankiWorkbench.browser.query.noRenderContext',
  'no-media-context': 'ankiWorkbench.browser.query.noMediaContext',
  'no-sibling-context': 'ankiWorkbench.browser.query.noSiblingContext',
  'no-stale-context': 'ankiWorkbench.browser.query.noStaleContext',
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * One explanation node as a list item, recursing into groups.
 *
 * A `vars` value that is itself an explain key (the script names) is translated
 * before it is interpolated — "Latin" is a proper noun in English and is not one
 * in Japanese, so it cannot travel through `shared/` as literal text.
 */
function ExplainItem({ node, t }: { node: QueryExplainNode; t: Translate }): JSX.Element {
  if (node.kind === 'clause') {
    const vars = node.vars
      ? Object.fromEntries(
          Object.entries(node.vars).map(([name, value]) => [
            name,
            typeof value === 'string' && value.startsWith(QUERY_EXPLAIN_KEY_PREFIX) ? t(value) : value,
          ]),
        )
      : undefined;
    return <li>{t(node.key, vars)}</li>;
  }
  const label = node.kind === 'not' ? `${QUERY_EXPLAIN_KEY_PREFIX}not` : `${QUERY_EXPLAIN_KEY_PREFIX}group.${node.op}`;
  const children = node.kind === 'not' ? [node.child] : node.children;
  return (
    <li>
      {t(label)}
      <ul>
        {children.map((child, i) => (
          // The tree has no ids and is rebuilt from the query text on every
          // keystroke, so position is the only key there is — and it is stable
          // for a given query, which is all this list needs.
          <ExplainItem key={i} node={child} t={t} />
        ))}
      </ul>
    </li>
  );
}

export default function DeckWorkbenchBrowser({
  draft,
  totalNotes,
  journal,
  onSelection,
  onEdit,
}: {
  draft: AnkiDraft;
  /** Notes in the whole source, which may exceed the page in `draft`. */
  totalNotes: number;
  journal: AnkiDraftEditJournal;
  /**
   * `ids` are the selected notes that are actually loaded. `count` can exceed
   * them on a paged source, and the tray has to be able to say so.
   */
  onSelection: (count: number, wholeSource: boolean, ids: string[]) => void;
  onEdit: (result: AnkiDraftEditResult) => void;
}) {
  const { t } = useT();
  const [columns, setColumns] = useState(() => defaultBrowserColumns(draft));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<BrowserSort | null>(null);
  const [selection, setSelection] = useState<BrowserSelection>(EMPTY_SELECTION);
  /** The row the inspector is about. Focus is not selection — a user reads one
   *  note while a batch of others stays selected. */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [view, setView] = useState<BrowserView>('grid');
  /** Recipe 9's scan is a tool, not part of the grid: off until asked for. */
  const [dupesOpen, setDupesOpen] = useState(false);
  /** Recipe 11's media audit, same rule. */
  const [mediaOpen, setMediaOpen] = useState(false);
  const [siblingsOpen, setSiblingsOpen] = useState(false);
  /** Recipe 18's schedule scan, same rule. */
  const [staleOpen, setStaleOpen] = useState(false);
  /** Recipe 26's workload estimate. Reports only — see the panel's own note. */
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const anchor = useRef<string | null>(null);

  /**
   * Saved views live in renderer localStorage, not in the draft or in settings:
   * they outlive one package and belong to no deck, and a read that throws must
   * not cost the workbench its Browser. Read once; every write goes through
   * `persistViews` so the in-memory list and the store cannot drift.
   */
  const [savedViews, setSavedViews] = useState(() => {
    try {
      return parseSavedBrowserViews(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY));
    } catch {
      return EMPTY_SAVED_VIEWS;
    }
  });
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState('');
  /** What the last applied view could not restore in this deck. */
  const [viewGap, setViewGap] = useState<{ missing: number; sortDropped: boolean } | null>(null);

  /**
   * Which source wins when the local knowledge store and Anki's own scheduling
   * disagree about the same word (the plan's gate 4). A user setting rather
   * than a constant, because the honest answer differs per learner: someone who
   * grades by hand trusts `local`, someone driven by their review history
   * trusts `anki`.
   */
  const [precedence, setPrecedence] = useState<VocabKnownPrecedence>('local');
  /**
   * Ranks for this page's words. `undefined` until the lookup answers — the
   * distinction matters, because with no context at all `freq:`/`known:` are a
   * refusal, and a refusal is the right thing to show while the answer is
   * genuinely unknown.
   */
  const [ranks, setRanks] = useState<ReadonlyMap<string, number | null> | undefined>(undefined);
  /** Bumped by the knowledge store so a level changed elsewhere reaches the filter. */
  const [knowledgeTick, setKnowledgeTick] = useState(0);

  const rows = useMemo(() => buildBrowserRows(draft, columns), [draft, columns]);
  const vocabTerms = useMemo(
    () => collectVocabTerms(draft.notes, draft.noteTypes).slice(0, MAX_FREQUENCY_BATCH),
    [draft],
  );

  useEffect(() => {
    let live = true;
    // No word field anywhere in this deck is still an answered lookup: the
    // filters must work and report "no word", not sit refusing forever. Same
    // for a host whose bridge predates the channel — `known:` still answers
    // from card state, and every rank is honestly absent.
    if (!vocabTerms.length || typeof window.api?.dictFrequencyRanks !== 'function') {
      setRanks(new Map(vocabTerms.map((term) => [term, null])));
      return () => {
        live = false;
      };
    }
    setRanks(undefined);
    void window.api
      .dictFrequencyRanks(vocabTerms)
      .then((found) => {
        if (!live) return;
        // Every term asked about gets a key: a word the corpora do not rank maps
        // to `null`, which is a measured absence rather than a missing lookup.
        setRanks(new Map(vocabTerms.map((term) => [term, found[term] ?? null])));
      })
      .catch(() => {
        if (live) setRanks(new Map(vocabTerms.map((term) => [term, null])));
      });
    return () => {
      live = false;
    };
  }, [vocabTerms]);

  useEffect(() => onKnowledgeChanged(() => setKnowledgeTick((n) => n + 1)), []);

  const vocab = useMemo(() => {
    if (!ranks) return undefined;
    void knowledgeTick;
    const localLevels = new Map<string, number>();
    for (const term of vocabTerms) {
      // Only words the store actually holds: `getLevel` returns 0 for a word it
      // has never seen, and recording that would turn "never asked" into "not
      // known" for the entire deck.
      const level = getLevel(term);
      if (level > 0) localLevels.set(term, level);
    }
    return buildVocabContext({
      notes: draft.notes,
      noteTypes: draft.noteTypes,
      cards: draft.cards,
      ranks,
      localLevels,
      precedence,
    });
  }, [draft, ranks, vocabTerms, precedence, knowledgeTick]);

  // `render:` verdicts, computed once per draft rather than per row: the filter
  // re-runs on every keystroke and rendering the deck's cards inside it would
  // re-render every note each time. Keyed on `draft` alone — a card's render is
  // a function of its note and its note type and of nothing else, so unlike
  // `vocab` it does not move when the knowledge store does.
  const render = useMemo(() => buildCardHealthContext(draft), [draft]);

  // `media:` verdicts, same reasoning and the same key. Absent — not an empty
  // map — when the source reported no media at all, so the parser can refuse
  // `media:` rather than hand back a filter that matches nothing.
  const media = useMemo(
    () => (draft.media ? buildMediaHealthContext(draft) : undefined),
    [draft],
  );

  // `sibling:` verdicts. Same key again, and the heaviest of the three: it
  // renders a bounded sample of every note type before it can judge one row, so
  // it must never move with the query. Always present, unlike `media` — every
  // draft has note types, and a source whose templates cannot be read reports
  // that as its own diagnostic rather than as a missing filter.
  const sibling = useMemo(() => buildSiblingAuditContext(draft), [draft]);

  // `stale:` verdicts, and the only context whose clock matters. `Date.now()` is
  // read once per draft and not per render, so the whole filter session judges
  // every row against one "today" — a scan that re-read the clock could put two
  // rows of the same query on opposite sides of a day boundary. Absent, like
  // `media`, when the scan refuses: a source with no `col.crt` cannot answer
  // "how overdue" at all, and `stale:` is then a named refusal rather than a
  // filter that quietly matches nothing.
  const stale = useMemo(() => buildStaleContext(draft, Date.now()) ?? undefined, [draft]);

  // The draft's own field names, so `Expression:食べる` is a field predicate and
  // `Expresion:食べる` is a refusal instead of a filter that quietly matches all.
  const schema = useMemo(
    () => ({
      fieldNames: browserFieldNames(draft),
      render,
      sibling,
      ...(media ? { media } : {}),
      ...(stale ? { stale } : {}),
      ...(vocab ? { vocab } : {}),
    }),
    [draft, vocab, render, media, sibling, stale],
  );
  const filtered = useMemo(() => filterBrowserRows(rows, query, schema), [rows, query, schema]);
  const shown = useMemo(() => sortBrowserRows(filtered.rows, sort), [filtered, sort]);
  // What the query means in words. Parsed a second time rather than lifted out
  // of `filterBrowserRows`, which returns rows and an error and not the tree —
  // and the parse is cheap next to the filter it already runs on every row.
  const explain = useMemo(() => explainBrowserQuery(query, schema), [query, schema]);
  const fieldNames = schema.fieldNames;
  /** The scan's universe: what the filter is showing, and nothing else. */
  const shownIds = useMemo(() => shown.map((row) => row.noteId), [shown]);
  const shownCols = useMemo(() => visibleBrowserColumns(columns), [columns]);

  /**
   * How many notes are actually in memory. `draft.counts` describes the whole
   * COLLECTION and `draft.notes` is the window (`ankiDraft.ts:1023` says so), so
   * `draft.counts.notes < totalNotes` compared the collection total against
   * itself and was false for every paged source — the one condition it exists to
   * detect. Measured live on the 100,000-note fixture at a page of 500: the
   * "only one page is loaded" notice never rendered, the row line read "1 of
   * 100,000 loaded notes shown", and `canSelectWholeSource` stayed true under an
   * active filter, so a one-row result offered a button that selects all 100,000.
   */
  const loadedNotes = draft.notes.length;
  const partial = loadedNotes < totalNotes;
  // With a filter on a paged source, "everything matching" is a claim nobody
  // computed. See the file comment. A query that failed to parse is not a
  // filter at all, so it cannot license a whole-source claim either.
  const canSelectWholeSource = !filtered.error && (!partial || query.trim() === '');
  /**
   * How many notes the current filter stands for. With no query that is the
   * whole source; with one it is only what the loaded rows matched. The live
   * run caught the version that always used `totalNotes`: the button offered
   * "select all 3,221" under a filter showing four rows, and then selected
   * four. A count in a button is a promise about what the click will do.
   */
  const matchedTotal = query.trim() === '' && !filtered.error ? totalNotes : shown.length;

  const applySelection = useCallback(
    (next: BrowserSelection) => {
      setSelection(next);
      onSelection(
        selectionCount(next, matchedTotal),
        selectionIsWholeSource(next),
        // Resolved against the rows in memory, which is the only set anything
        // downstream can actually edit.
        shown.filter((row) => isRowSelected(next, row.noteId)).map((row) => row.noteId),
      );
    },
    [onSelection, matchedTotal, shown],
  );

  const persistViews = useCallback((next: ReturnType<typeof parseSavedBrowserViews>) => {
    setSavedViews(next);
    try {
      window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedBrowserViews(next));
    } catch {
      // A full or blocked store must not lose the user the view they just made
      // in this session; it is simply not there next time.
    }
  }, []);

  const onSaveView = useCallback(() => {
    const name = viewName.trim();
    if (!name) return;
    const saved = captureBrowserView(name, query, sort, columns, Math.floor(Date.now() / 1000));
    persistViews(saveBrowserView(savedViews, saved));
    setActiveViewId(saved.id);
    setViewName('');
    setViewGap(null);
  }, [columns, persistViews, query, savedViews, sort, viewName]);

  const onApplyView = useCallback(
    (id: string) => {
      setActiveViewId(id);
      const found = savedViews.views.find((v) => v.id === id);
      if (!found) {
        setViewGap(null);
        return;
      }
      const applied = applyBrowserView(columns, found);
      setColumns(applied.columns);
      setQuery(found.query);
      setSort(browserViewSort(applied.columns, found));
      setViewGap(
        applied.missingColumnIds.length || applied.sortDropped
          ? { missing: applied.missingColumnIds.length, sortDropped: applied.sortDropped }
          : null,
      );
    },
    [columns, savedViews],
  );

  const onRowClick = useCallback(
    (noteId: string, shiftKey: boolean) => {
      if (shiftKey && anchor.current) {
        applySelection(selectRowRange(selection, shown, anchor.current, noteId));
      } else {
        anchor.current = noteId;
        applySelection(toggleRowSelection(selection, noteId));
      }
    },
    [applySelection, selection, shown],
  );

  /** Where the keyboard cursor is, or -1 before it has been anywhere. */
  const cursor = focusedId ? shown.findIndex((r) => r.noteId === focusedId) : -1;

  /**
   * The grid is one tab stop with a moving cursor, not N tab stops.
   *
   * A hundred thousand rows cannot be tabbed through, and only a windowful of
   * them exists in the DOM at any moment, so the row controls are taken out of
   * the tab order and every row action is reachable from here instead. The
   * cursor doubles as what the inspector is showing, which is how Anki's own
   * browser behaves: arrowing down walks the notes and the editor follows.
   */
  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (shown.length === 0) return;
      const last = shown.length - 1;
      const move = (to: number): void => {
        e.preventDefault();
        const clamped = Math.max(0, Math.min(last, to));
        const target = shown[clamped];
        if (!target) return;
        if (e.shiftKey && anchor.current) {
          applySelection(selectRowRange(selection, shown, anchor.current, target.noteId));
        } else if (!e.shiftKey) {
          // Plain movement leaves the batch alone; only the anchor follows, so
          // a later Shift+Arrow extends from where the user actually is.
          anchor.current = target.noteId;
        }
        setFocusedId(target.noteId);
      };

      switch (e.key) {
        case 'ArrowDown':
          return move(cursor < 0 ? 0 : cursor + 1);
        case 'ArrowUp':
          return move(cursor < 0 ? last : cursor - 1);
        case 'PageDown':
          return move(cursor < 0 ? 0 : cursor + PAGE_ROWS);
        case 'PageUp':
          return move(cursor < 0 ? last : cursor - PAGE_ROWS);
        case 'Home':
          return move(0);
        case 'End':
          return move(last);
        case ' ':
        case 'Spacebar': {
          if (cursor < 0) return;
          e.preventDefault();
          const row = shown[cursor];
          if (!row) return;
          if (e.shiftKey && anchor.current) {
            applySelection(selectRowRange(selection, shown, anchor.current, row.noteId));
          } else {
            anchor.current = row.noteId;
            applySelection(toggleRowSelection(selection, row.noteId));
          }
          return;
        }
        case 'a':
        case 'A': {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          // Exactly what the footer button does, including its honesty rule:
          // "all matching" is only offered where it is a claim we can keep.
          applySelection(
            canSelectWholeSource
              ? selectAllMatching()
              : { mode: 'explicit', ids: shown.map((r) => r.noteId) },
          );
          return;
        }
        case 'Escape':
          if (!focusedId) return;
          e.preventDefault();
          setFocusedId(null);
          return;
        default:
      }
    },
    [applySelection, canSelectWholeSource, cursor, focusedId, selection, shown],
  );

  const selected = selectionCount(selection, matchedTotal);
  const gridTemplate = shownCols.map((c) => `${c.width}fr`).join(' ');
  // Re-read from the draft every render: an edit replaces the note object, and
  // a stale copy would show the inspector its own pre-edit text.
  const focused = focusedId ? draft.notes.find((n) => n.id === focusedId) : undefined;
  const editedCount = editedNoteIds(journal).length;

  return (
    <div className="wb-browser">
      <div className="wb-browser-tools">
        <input
          type="search"
          className="wb-browser-search"
          value={query}
          placeholder={t('ankiWorkbench.browser.search')}
          aria-label={t('ankiWorkbench.browser.search')}
          title={t('ankiWorkbench.browser.query.hint')}
          aria-invalid={filtered.error ? true : undefined}
          aria-describedby={filtered.error ? 'wb-browser-query-error' : undefined}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">
          {t('ankiWorkbench.browser.rows', { shown: shown.length, loaded: loadedNotes })}
        </span>
        {/* Only shown once a deck actually has words to rank: on a deck whose
            note types declare no word field, `known:` can never resolve a
            conflict, and a control that decides nothing is a lie. */}
        {vocabTerms.length > 0 && (
          <label className="wb-browser-precedence">
            <span className="muted">{t('ankiWorkbench.browser.known.precedence')}</span>
            <select
              value={precedence}
              onChange={(e) => setPrecedence(e.target.value as VocabKnownPrecedence)}
            >
              {(['local', 'anki', 'either', 'both'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`ankiWorkbench.browser.known.precedence.${value}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={`btn${dupesOpen ? ' primary' : ''}`}
          aria-pressed={dupesOpen}
          aria-expanded={dupesOpen}
          onClick={() => setDupesOpen((open) => !open)}
        >
          {t('ankiWorkbench.browser.dupes.title')}
        </button>
        <button
          type="button"
          className={`btn${mediaOpen ? ' primary' : ''}`}
          aria-pressed={mediaOpen}
          aria-expanded={mediaOpen}
          onClick={() => setMediaOpen((open) => !open)}
        >
          {t('ankiWorkbench.media.title')}
        </button>
        <button
          type="button"
          className={`btn${siblingsOpen ? ' primary' : ''}`}
          aria-pressed={siblingsOpen}
          aria-expanded={siblingsOpen}
          onClick={() => setSiblingsOpen((open) => !open)}
        >
          {t('ankiWorkbench.siblings.title')}
        </button>
        <button
          type="button"
          className={`btn${staleOpen ? ' primary' : ''}`}
          aria-pressed={staleOpen}
          aria-expanded={staleOpen}
          onClick={() => setStaleOpen((open) => !open)}
        >
          {t('ankiWorkbench.stale.title')}
        </button>
        <button
          type="button"
          className={`btn${workloadOpen ? ' primary' : ''}`}
          aria-pressed={workloadOpen}
          aria-expanded={workloadOpen}
          onClick={() => setWorkloadOpen((open) => !open)}
        >
          {t('ankiWorkbench.workload.title')}
        </button>
        {/* Switching view never touches the selection — the plan requires a
            batch to survive a look at the sample cards. */}
        <div role="group" aria-label={t('ankiWorkbench.browser.view')}>
          {(['grid', 'samples'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`btn${view === value ? ' primary' : ''}`}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {t(`ankiWorkbench.browser.view.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Saved views: the query, the sort and the visible columns, under a name
          the user chose. Never a selection — see `ankiBrowserViews.ts`. */}
      <div className="wb-browser-views" role="group" aria-label={t('ankiWorkbench.browser.views')}>
        <select
          className="wb-browser-view-pick"
          aria-label={t('ankiWorkbench.browser.views')}
          value={activeViewId}
          onChange={(e) => onApplyView(e.target.value)}
        >
          <option value="">
            {savedViews.views.length === 0
              ? t('ankiWorkbench.browser.views.none')
              : t('ankiWorkbench.browser.views.pick')}
          </option>
          {savedViews.views.map((v) => (
            /* The name is the user's own text and is never translated. */
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <input
          className="wb-browser-view-name"
          value={viewName}
          placeholder={t('ankiWorkbench.browser.views.name')}
          aria-label={t('ankiWorkbench.browser.views.name')}
          onChange={(e) => setViewName(e.target.value)}
        />
        <button type="button" className="btn" disabled={viewName.trim() === ''} onClick={onSaveView}>
          {t('ankiWorkbench.browser.views.save')}
        </button>
        {activeViewId !== '' && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              persistViews(removeBrowserView(savedViews, activeViewId));
              setActiveViewId('');
              setViewGap(null);
            }}
          >
            {t('ankiWorkbench.browser.views.delete')}
          </button>
        )}
      </div>

      {/* A view saved on another deck restores what it can. Saying so is the
          point: showing fewer columns than the view promised, silently, is the
          failure this line exists to prevent. */}
      {viewGap && (
        <p className="muted wb-browser-view-gap">
          {viewGap.missing > 0 && t('ankiWorkbench.browser.views.partial', { count: viewGap.missing })}
          {viewGap.sortDropped && ` ${t('ankiWorkbench.browser.views.sortDropped')}`}
        </p>
      )}

      {/* A refused query shows why, next to the box that refused it. Without
          this the grid empties and reads exactly like "nothing matched". */}
      {filtered.error && (
        <p className="wb-browser-query-error" id="wb-browser-query-error" role="alert">
          {t(QUERY_ERROR_KEY[filtered.error.code], { token: filtered.error.token })}
        </p>
      )}

      {/* Gate 3: `freq:<=5000` is a corpus rank, not a card count and not a
          score, and nothing on this surface said so. The explanation is built
          from the parsed tree, so it cannot describe a filter other than the one
          that ran; a query that failed to parse explains nothing at all. */}
      {explain && (
        <div className="wb-browser-explain">
          <p className="muted">{t(`${QUERY_EXPLAIN_KEY_PREFIX}title`)}</p>
          <ul>
            <ExplainItem node={explain} t={t} />
          </ul>
        </div>
      )}

      {/* Recipe 9's consumer. It scans what the filter is showing and hands back
          an explicit selection, so "find the duplicates" and "clear selection"
          are the same reversible pair every other batch here uses. */}
      {dupesOpen && (
        <DeckWorkbenchDuplicates
          draft={draft}
          scopeNoteIds={shownIds}
          fieldNames={fieldNames}
          onSelect={(ids) => applySelection({ mode: 'explicit', ids })}
        />
      )}

      {/* Recipe 11's consumer. Unlike the duplicate scan it audits the whole
          draft and not the filtered rows: a package's media folder is a
          property of the package, and scoping it to a filter would report
          "1 file missing" as though the other 22,167 had been checked. */}
      {mediaOpen && <DeckWorkbenchMedia draft={draft} onQuery={setQuery} />}

      {/* Recipe 17's consumer. Whole-draft like recipe 11's and for the same
          reason, one step stronger: a template is redundant because of how it
          renders across its note type's notes, so a version scoped to the
          filtered rows would answer a different question than the one asked. */}
      {siblingsOpen && <DeckWorkbenchSiblings draft={draft} onQuery={setQuery} />}

      {/* Recipe 18's consumer. Whole-draft, and here it has to be: a card's due
          day is a property of the schedule, not of whichever rows a text filter
          is currently showing, and scoping the scan would report a backlog the
          user could not act on because most of it was never counted. */}
      {staleOpen && <DeckWorkbenchStale draft={draft} onQuery={setQuery} />}

      {/* Recipe 26's consumer. Whole-draft for the strongest version of the
          reason above: workload is a property of the schedule, and a version
          scoped to the filtered rows would answer "how much of my daily
          reviewing happens to be on screen", which nobody asked. It hands
          nothing back to the search box because it proposes no query — the
          thing it estimates is not a card property. */}
      {workloadOpen && <DeckWorkbenchWorkload draft={draft} />}

      {view === 'samples' && (
        <DeckWorkbenchSamples
          draft={draft}
          totalNotes={totalNotes}
          onOpenNote={(noteId) => {
            setFocusedId(noteId);
            setView('grid');
          }}
        />
      )}

      <div
        className="wb-browser-columns"
        role="group"
        aria-label={t('ankiWorkbench.browser.columns')}
        hidden={view !== 'grid'}
      >
        <span className="muted">{t('ankiWorkbench.browser.columns')}</span>
        {columns.map((col) => (
          <label key={col.id} className="wb-browser-column-toggle">
            <input
              type="checkbox"
              checked={col.visible}
              onChange={() => setColumns((prev) => toggleBrowserColumn(prev, col.id))}
            />
            {col.kind === 'field' ? col.fieldName : t(col.labelKey ?? '')}
          </label>
        ))}
      </div>

      {partial && (
        <p className="muted wb-browser-partial">
          {t('ankiWorkbench.browser.pageOnly', { loaded: loadedNotes, total: totalNotes })}
        </p>
      )}

      <div
        className="wb-browser-head"
        style={{ gridTemplateColumns: `2.5rem ${gridTemplate}` }}
        hidden={view !== 'grid'}
      >
        <span />
        {shownCols.map((col) => {
          const dir = sort?.columnId === col.id ? sort.dir : undefined;
          return (
            <button
              key={col.id}
              type="button"
              className="wb-browser-sort"
              aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
              onClick={() => setSort((prev) => nextBrowserSort(prev, col.id))}
            >
              {col.kind === 'field' ? col.fieldName : t(col.labelKey ?? '')}
              {dir === 'asc' ? ' ▲' : dir === 'desc' ? ' ▼' : ''}
            </button>
          );
        })}
      </div>

      <div className="wb-browser-split" hidden={view !== 'grid'}>
        <div
          className="wb-browser-grid"
          role="grid"
          tabIndex={0}
          aria-label={t('ankiWorkbench.browser.grid')}
          aria-rowcount={shown.length}
          aria-multiselectable
          aria-activedescendant={focusedId ? rowDomId(focusedId) : undefined}
          onKeyDown={onGridKeyDown}
        >
          <VirtualList
            className="wb-browser-rows"
            items={shown}
            itemHeight={ROW_HEIGHT}
            getKey={(row) => row.noteId}
            gridRole="rowgroup"
            scrollToIndex={cursor >= 0 ? cursor : undefined}
            emptyState={<p className="muted">{t('ankiWorkbench.browser.empty')}</p>}
            renderItem={(row, index) => {
              const checked = isRowSelected(selection, row.noteId);
              return (
                <div
                  id={rowDomId(row.noteId)}
                  role="row"
                  aria-rowindex={index + 1}
                  aria-selected={checked}
                  className={`wb-browser-row${checked ? ' selected' : ''}${
                    focusedId === row.noteId ? ' focused' : ''
                  }${noteIsEdited(journal, row.noteId) ? ' edited' : ''}`}
                  style={{ height: ROW_HEIGHT, gridTemplateColumns: `2.5rem ${gridTemplate}` }}
                >
                  {/* Every control here is `tabIndex={-1}`: the grid is one tab
                      stop with a cursor, because a windowed list of 100k rows
                      has no tabbable order to walk. */}
                  <input
                    type="checkbox"
                    tabIndex={-1}
                    checked={checked}
                    aria-label={t('ankiWorkbench.browser.selectRow', { id: row.noteId })}
                    onClick={(e) => onRowClick(row.noteId, e.shiftKey)}
                    onChange={() => undefined}
                  />
                  {shownCols.map((col) => (
                    // Opening a note is not selecting it: a user reads one row
                    // while a batch of others stays ticked.
                    <button
                      key={col.id}
                      type="button"
                      tabIndex={-1}
                      role="gridcell"
                      className="wb-browser-cell"
                      title={row.cells[col.id]}
                      onClick={() => setFocusedId(row.noteId)}
                    >
                      {row.cells[col.id]}
                    </button>
                  ))}
                </div>
              );
            }}
          />
        </div>
        {focused && (
          <DeckWorkbenchInspector
            draft={draft}
            journal={journal}
            note={focused}
            onEdit={onEdit}
          />
        )}
      </div>

      <div className="wb-browser-foot">
        <span>{t('ankiWorkbench.browser.selected', { count: selected })}</span>
        {canSelectWholeSource ? (
          <button type="button" className="btn" onClick={() => applySelection(selectAllMatching())}>
            {t('ankiWorkbench.browser.selectAll', { count: matchedTotal })}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() =>
              applySelection({ mode: 'explicit', ids: shown.map((r) => r.noteId) })
            }
          >
            {t('ankiWorkbench.browser.selectFound', { count: shown.length })}
          </button>
        )}
        <button type="button" className="btn" onClick={() => applySelection(EMPTY_SELECTION)}>
          {t('ankiWorkbench.browser.clear')}
        </button>
        {selectionIsWholeSource(selection) && partial && (
          <span className="muted">{t('ankiWorkbench.browser.wholeSource')}</span>
        )}
        {editedCount > 0 && (
          <span className="wb-browser-edited">
            {t('ankiWorkbench.browser.edited', { count: editedCount })}
          </span>
        )}
      </div>
    </div>
  );
}
