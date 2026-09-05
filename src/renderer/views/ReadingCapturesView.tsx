import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReadingLensHistoryEntry } from '../../shared/readingLensHistory';
import type { ReadingPassageHandoff } from '../../shared/readingPassageHandoff';
import Icon from '../components/Icons';
import VirtualList from '../components/VirtualList';
import LiveCaptionsPanel from '../components/reading/LiveCaptionsPanel';
import {
  ReadingCanvas,
  useReadingDocumentCover,
  type ReadingCanvasTool,
} from '../components/liquid/ReadingCanvas';
import { useT } from '../i18n';
import './readingCaptures.css';

/**
 * The Reading workspace's destination for a lens passage.
 *
 * `resolveReadingLensWorkflow` has always routed paragraph- and document-scale
 * captures to `target: 'reading'`, and until now there was nowhere for one to
 * land: the workspace offered Library, Finder and Novels, all of which are
 * catalogues of *works*, and an ad-hoc screen passage is not a work. This is the
 * missing surface, and it is deliberately a reader rather than a fourth
 * catalogue — the gesture the user made was "read this", not "file this".
 *
 * The list beside it is the persisted capture history (`lens:history:list`),
 * which already exists and is already searchable in Settings. It is here so the
 * section is not blank when opened cold, and so a passage read yesterday is
 * reachable without going through Settings to find it.
 */

const HISTORY_LIMIT = 60;
/** 49px measured row plus the 3px gap the old flex list contributed. */
export const READING_CAPTURE_ROW_HEIGHT = 52;

/** Sentinel rather than `null`, so "every source" is a value a chip can carry. */
export const ALL_SOURCES = 'all';
export type CaptureOrder = 'newest' | 'oldest';

type HistoryState = {
  kind: 'loading' | 'ready' | 'error';
  /** Keep the last successful read visible while refreshing or recovering. */
  entries: ReadingLensHistoryEntry[];
};

/** The just-handed-off passage, projected into the same row shape as history. */
interface PassageRow {
  captureId: string;
  title: string;
  text: string;
  lines: string[];
  source: string;
  sourceLabel: string;
  capturedAt: number;
  /** True only for the passage this mount received from the lens. */
  live: boolean;
}

function rowFromHandoff(handoff: ReadingPassageHandoff): PassageRow {
  return {
    captureId: handoff.captureId || `passage:${handoff.stagedAt}`,
    title: handoff.sourceLabel || handoff.text.slice(0, 40),
    text: handoff.text,
    lines: handoff.lines,
    source: handoff.source,
    sourceLabel: handoff.sourceLabel,
    capturedAt: handoff.stagedAt,
    live: true,
  };
}

function rowFromHistory(entry: ReadingLensHistoryEntry): PassageRow {
  return {
    captureId: entry.captureId,
    title: entry.sourceLabel || entry.text.slice(0, 40),
    text: entry.text,
    lines: [],
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    capturedAt: entry.capturedAt,
    live: false,
  };
}

export interface ReadingCapturesViewProps {
  /** The passage claimed from main for this mount, or null when opened cold. */
  passage: ReadingPassageHandoff | null;
}

export default function ReadingCapturesView({ passage }: ReadingCapturesViewProps) {
  const { t } = useT();
  const [history, setHistory] = useState<HistoryState>({ kind: 'loading', entries: [] });
  const historyRequest = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Open by default: this is the section's navigation, and a cold open with the
  // list closed shows an empty reader and no visible way to fill it.
  const [listOpen, setListOpen] = useState(true);
  /**
   * Closed by default, unlike the capture list: Live Captions is an arming
   * control the user reaches for deliberately, and opening a second sheet on a
   * cold open would cover the passage this section exists to show.
   */
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const cover = useReadingDocumentCover();

  /**
   * The result of the LAST MANUAL refresh, or null when none has completed.
   *
   * The Refresh button was a dead end: rubric category 2 clicked it live and
   * sampled the surface at 345 ms, 483 ms and 1257 ms with `any: false` at every
   * sample and no live region — `deadEnd: true`. The cause is not a missing
   * handler. `load()` does set `kind: 'loading'`, and the loading note carries
   * `aria-live`, but a local IPC read of the capture history resolves faster than
   * a paint, so the only feedback the surface had was a state nobody can see. On
   * an unchanged store the user clicks Refresh and nothing whatsoever happens.
   *
   * So the announcement is of the RESULT, not of the request, and it survives
   * until the next read rather than being cleared on a timer: "Refreshed — 42
   * captures" stays true for exactly as long as that read is the current one, and
   * a self-clearing banner would put the surface back to silent for anyone who
   * looked a second later. Only manual refreshes announce; the mount does not,
   * because a live region that fires on open is noise, not feedback.
   */
  const [refreshedCount, setRefreshedCount] = useState<number | null>(null);

  const load = useCallback((announce = false) => {
    const request = ++historyRequest.current;
    if (announce) setRefreshedCount(null);
    const list = window.api?.lensHistoryList;
    if (typeof list !== 'function') {
      setHistory((previous) => ({ ...previous, kind: 'error' }));
      return () => undefined;
    }
    setHistory((previous) => ({ ...previous, kind: 'loading' }));
    void Promise.resolve()
      .then(() => list({ limit: HISTORY_LIMIT }))
      .then((entries) => {
        if (request !== historyRequest.current) return;
        if (Array.isArray(entries)) {
          setHistory({ kind: 'ready', entries });
          // Only a read that actually produced rows may claim it refreshed
          // anything. A failed read falls through to the error note below, which
          // is the honest state for it.
          if (announce) setRefreshedCount(entries.length);
        } else setHistory((previous) => ({ ...previous, kind: 'error' }));
      })
      .catch(() => {
        if (request === historyRequest.current) {
          setHistory((previous) => ({ ...previous, kind: 'error' }));
        }
      });
    return () => {
      if (request === historyRequest.current) historyRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    load();
    // This also invalidates manual refreshes, whose cleanup is not an effect.
    return () => { historyRequest.current += 1; };
  }, [load]);

  // A newly arrived passage is recorded into history by the lens, so refresh
  // rather than splicing: the stored row carries the seen-count and pinned flag
  // the handoff does not, and a second copy of the same capture in the list
  // would be a lie about what is on disk.
  useEffect(() => {
    if (!passage) return undefined;
    setSelectedId(passage.captureId || `passage:${passage.stagedAt}`);
    /*
     * A passage arriving IS the "read this" gesture, so the document it lands in
     * has to be the thing on screen.
     *
     * At a narrow canvas the capture list is a sheet, and a sheet covers the
     * document outright — there is no partial cover to fall back on. Measured
     * live before this line existed: staging a 47-character paragraph put the
     * section on `captures`, the reader head on the new `sourceLabel` and
     * `aria-current` on the new row, all correct, while `data-covered` was
     * `"true"` and the document was `inert` + `aria-hidden`. The user asked to
     * read a passage and got the index of passages.
     *
     * Only when it actually covers: a DOCKED list is beside the document, not
     * over it, and closing it there would throw away the navigation for nothing.
     * The reopen control lives in the reader's own header, so this is reversible
     * the moment the document is live again.
     */
    if (cover.covered()) setListOpen(false);
    return load();
  }, [passage, load, cover]);

  const rows = useMemo<PassageRow[]>(() => {
    const stored = history.entries.map(rowFromHistory);
    if (!passage) return stored;
    const live = rowFromHandoff(passage);
    return [live, ...stored.filter((row) => row.captureId !== live.captureId)];
  }, [history, passage]);

  /*
   * The index over the history, which the surface did not have.
   *
   * `lensHistoryList` returns up to 60 rows and this list rendered every one of
   * them in capture order with no way to reach a particular passage except
   * scrolling — measured live at 42 stored captures. Settings has a search over
   * the same store, so the capability existed; the surface that is FOR reading a
   * captured passage was the one place without it.
   *
   * Three deliberate choices, each of which has cost this repo a defect before:
   *
   *  - the filter is over the INDEX, never the reader. `selected` still resolves
   *    against every row, so narrowing the list cannot blank the passage you are
   *    in the middle of reading;
   *  - a source chip is offered only when it can return something — the same
   *    rule the Library's eleven dead filter chips were removed under. `sources`
   *    is derived from the rows present, not from the union of everything the
   *    lens can produce;
   *  - sort is real state, not a display trick: it reorders the projection and
   *    leaves `rows` alone, so identity and selection survive a flip.
   */
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<string>(ALL_SOURCES);
  const [order, setOrder] = useState<CaptureOrder>('newest');

  const sources = useMemo(() => {
    const seen: string[] = [];
    for (const row of rows) if (row.source && !seen.includes(row.source)) seen.push(row.source);
    return seen;
  }, [rows]);

  // A chip for a source that has since disappeared would filter to nothing and
  // read as an empty history. Fall back rather than strand the user in it.
  const activeSource = source !== ALL_SOURCES && !sources.includes(source) ? ALL_SOURCES : source;

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (activeSource !== ALL_SOURCES && row.source !== activeSource) return false;
      if (!needle) return true;
      return `${row.title}\n${row.sourceLabel}\n${row.text}`.toLowerCase().includes(needle);
    });
    // A copy: `rows` is the identity list and sorting it in place would reorder
    // the memo every consumer downstream reads.
    return order === 'oldest'
      ? matched.slice().sort((a, b) => a.capturedAt - b.capturedAt)
      : matched.slice().sort((a, b) => b.capturedAt - a.capturedAt);
  }, [rows, query, activeSource, order]);

  // No `filtered` flag: `rows.length > 0 && visibleRows.length === 0` is only
  // reachable through a filter, because an unfiltered projection IS `rows`.
  const clearFilter = useCallback(() => {
    setQuery('');
    setSource(ALL_SOURCES);
  }, []);

  const selected = rows.find((row) => row.captureId === selectedId) ?? rows[0] ?? null;

  const readerLines = useMemo(() => {
    if (!selected) return [];
    return selected.lines.length ? selected.lines : selected.text.split(/\r?\n/).filter(Boolean);
  }, [selected]);

  const listBody = (
    <>
      {history.kind === 'loading' ? (
        <p className="reading-captures-note muted" aria-live="polite">
          {t('reading.captures.loading')}
        </p>
      ) : null}
      {history.kind === 'error' ? (
        <p className="reading-captures-note reading-captures-error" role="status">
          {t('reading.captures.loadFailed')}
        </p>
      ) : null}
      {/*
        `ready`, not "not loading". A failed read is also not loading and also has
        no rows, so the old condition rendered this note UNDER the failure note:
        "Could not read the capture history." immediately followed by "Nothing
        captured yet." One of those is always false, and it is this one that reads
        like a fact about the user's data — it invites them to go and capture
        something when sixty captures may be on disk behind a broken IPC.
      */}
      {history.kind === 'ready' && rows.length === 0 ? (
        <p className="reading-captures-note muted">{t('reading.captures.empty')}</p>
      ) : null}
      {refreshedCount !== null && history.kind === 'ready' ? (
        <p className="reading-captures-note reading-captures-refreshed muted" role="status">
          {t('reading.captures.refreshed', { count: refreshedCount })}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="reading-captures-filter">
          <input
            type="search"
            className="reading-captures-search"
            value={query}
            placeholder={t('reading.captures.searchPlaceholder')}
            aria-label={t('reading.captures.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/*
            Collapsed: source and order are the advanced half of this index and
            the search field is the common one. Everything inside stays one click
            away and the disclosure closes with the same click that opened it.
          */}
          <details className="reading-captures-more">
            <summary>{t('reading.captures.moreFilters')}</summary>
            <div className="reading-captures-more-body">
              <div className="reading-captures-chips" role="group" aria-label={t('reading.captures.sourceLabel')}>
                <button
                  type="button"
                  className={`reading-captures-chip${activeSource === ALL_SOURCES ? ' active' : ''}`}
                  aria-pressed={activeSource === ALL_SOURCES}
                  onClick={() => setSource(ALL_SOURCES)}
                >
                  {t('settings.lens.history.source.all')}
                </button>
                {/*
                  Only sources actually present get a chip. The Library shipped
                  eleven chips that could only ever return nothing; a filter that
                  cannot match is not a filter, it is a dead control.
                */}
                {sources.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`reading-captures-chip${activeSource === id ? ' active' : ''}`}
                    aria-pressed={activeSource === id}
                    onClick={() => setSource(id)}
                  >
                    {t(`settings.lens.history.source.${id}`)}
                  </button>
                ))}
              </div>
              <label className="reading-captures-order">
                <span className="muted">{t('reading.captures.orderLabel')}</span>
                <select value={order} onChange={(e) => setOrder(e.target.value as CaptureOrder)}>
                  <option value="newest">{t('reading.captures.orderNewest')}</option>
                  <option value="oldest">{t('reading.captures.orderOldest')}</option>
                </select>
              </label>
            </div>
          </details>
        </div>
      ) : null}
      {/*
        A filtered-to-nothing list is NOT an empty history, and saying so would be
        the same lie `reading.captures.empty` used to tell under a failed read: it
        invites the user to go and capture something while their captures sit
        behind a filter. The way out is offered next to the sentence.
      */}
      {rows.length > 0 && visibleRows.length === 0 ? (
        <p className="reading-captures-note muted" role="status">
          {t('reading.captures.noMatch', { total: rows.length })}{' '}
          <button type="button" className="reading-captures-clear" onClick={clearFilter}>
            {t('reading.captures.clearFilter')}
          </button>
        </p>
      ) : null}
      {visibleRows.length > 0 ? (
        <VirtualList
          items={visibleRows}
          itemHeight={READING_CAPTURE_ROW_HEIGHT}
          className="reading-captures-rows"
          listRole="list"
          itemRole="listitem"
          getKey={(row) => row.captureId}
          renderItem={(row) => (
            <button
              type="button"
              className="reading-captures-row"
              aria-current={selected?.captureId === row.captureId}
              onClick={(event) => {
                setSelectedId(row.captureId);
                // Selecting a passage is the read gesture. Dismiss only this
                // list's covering sheet; a docked list remains useful navigation.
                if (event.currentTarget.closest('[data-reading-tool]')?.getAttribute('data-placement') === 'sheet') {
                  setListOpen(false);
                }
              }}
            >
              <span className="reading-captures-row-title">{row.title}</span>
              <span className="reading-captures-row-meta">
                {row.live ? (
                  <span className="reading-captures-badge">
                    {t('reading.captures.justCaptured')}
                  </span>
                ) : null}
                <span>{t(`settings.lens.history.source.${row.source}`)}</span>
              </span>
            </button>
          )}
        />
      ) : null}
    </>
  );

  /**
   * The capture list is a reading side tool, and L6's canvas decides where it
   * goes — this surface no longer does.
   *
   * What that fixes is not cosmetic. The old layout was a CSS grid with a
   * `minmax(180px, 260px)` list column and a `@media (max-width: 720px)` stack,
   * and a media query reads the WINDOW. This section renders inside the Reading
   * workspace, which is regularly a pop-out or a docked pane: at a 500 px pane
   * inside a 1400 px window the media query never fires, the list keeps its
   * column, and the passage is left ~290 px — about 17 characters a line at the
   * 17 px reading type. `ReadingCanvas` measures its OWN box, so the same pane
   * turns the list into a dismissible sheet and gives the passage all 500 px.
   */
  const tools = useMemo<ReadingCanvasTool[]>(() => {
    const open: ReadingCanvasTool[] = [];
    if (captionsOpen) {
      // Trailing, and after the list in source order: it is a producer of
      // passages, not navigation into one, so `leading` would be a lie about
      // what it does and would push the capture list off its own edge.
      open.push({
        id: 'live-captions',
        label: t('reading.liveCaptions.title'),
        side: 'trailing',
        minWidth: 260,
        preferredWidth: 340,
        onClose: () => setCaptionsOpen(false),
        content: <LiveCaptionsPanel headless />,
      });
    }
    if (!listOpen) return open;
    return [
      {
        id: 'captures',
        label: t('reading.captures.recent'),
        // LEADING, and this is a repair to the migration above rather than a new
        // preference. Before it, the markup was `<aside
        // className="reading-captures-list">` FIRST and `<section
        // className="reading-captures-reader">` second, against a
        // `minmax(180px, 260px) minmax(0, 1fr)` grid — so the list was the left
        // column. `ReadingCanvas` renders tools after the document, so the fix
        // for the media query quietly moved the list to the right edge: a
        // regression nothing measured, because every assertion was about width.
        // The list is navigation INTO the passage, which is what `leading` means.
        side: 'leading',
        minWidth: 200,
        preferredWidth: 260,
        onClose: () => setListOpen(false),
        actions: (
          <button
            type="button"
            className="reading-captures-refresh"
            onClick={() => load(true)}
            title={t('reading.captures.refresh')}
          >
            <Icon name="refresh" size={13} />
          </button>
        ),
        content: listBody,
      },
      ...open,
    ];
  }, [listOpen, captionsOpen, listBody, load, t]);

  return (
    <div className="reading-captures">
      <ReadingCanvas
        tools={tools}
        closeLabel={t('common.close')}
        aria-label={t('reading.captures.title')}
        onDocumentCoveredChange={cover.onDocumentCoveredChange}
      >
        <section className="reading-captures-reader" aria-label={t('reading.captures.readerLabel')}>
          <header className="reading-captures-reader-head">
            <button
              type="button"
              className="reading-captures-list-toggle"
              aria-pressed={listOpen}
              aria-label={t('reading.captures.listLabel')}
              title={t('reading.captures.listLabel')}
              onClick={() => setListOpen((open) => !open)}
            >
              <Icon name="clipboard" size={14} />
            </button>
            <button
              type="button"
              className="reading-captures-list-toggle"
              aria-pressed={captionsOpen}
              aria-label={t('reading.liveCaptions.title')}
              title={t('reading.liveCaptions.title')}
              onClick={() => setCaptionsOpen((open) => !open)}
            >
              <Icon name="caption" size={14} />
            </button>
            {selected ? (
              <>
                <Icon name="scan" size={15} />
                <h2>{selected.sourceLabel || t('reading.captures.untitled')}</h2>
                <span className="reading-captures-reader-meta">
                  {t('reading.captures.lineCount', { count: readerLines.length })}
                </span>
              </>
            ) : null}
          </header>
          {selected ? (
            <div className="reading-captures-passage" lang="ja">
              {readerLines.map((line, index) => (
                <p key={`${selected.captureId}:${index}`}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="reading-captures-note muted">{t('reading.captures.selectHint')}</p>
          )}
        </section>
      </ReadingCanvas>
    </div>
  );
}
