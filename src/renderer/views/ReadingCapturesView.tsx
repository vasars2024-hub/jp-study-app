import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReadingLensHistoryEntry } from '../../shared/readingLensHistory';
import type { ReadingPassageHandoff } from '../../shared/readingPassageHandoff';
import Icon from '../components/Icons';
import {
  ReadingCanvas,
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

type HistoryState =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: ReadingLensHistoryEntry[] }
  | { kind: 'error' };

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
  const [history, setHistory] = useState<HistoryState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Open by default: this is the section's navigation, and a cold open with the
  // list closed shows an empty reader and no visible way to fill it.
  const [listOpen, setListOpen] = useState(true);

  const load = useCallback(() => {
    const list = window.api?.lensHistoryList;
    if (typeof list !== 'function') {
      setHistory({ kind: 'error' });
      return () => undefined;
    }
    let cancelled = false;
    setHistory({ kind: 'loading' });
    void Promise.resolve(list({ limit: HISTORY_LIMIT }))
      .then((entries) => {
        if (cancelled) return;
        setHistory({ kind: 'ready', entries: Array.isArray(entries) ? entries : [] });
      })
      .catch(() => {
        if (!cancelled) setHistory({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  // A newly arrived passage is recorded into history by the lens, so refresh
  // rather than splicing: the stored row carries the seen-count and pinned flag
  // the handoff does not, and a second copy of the same capture in the list
  // would be a lie about what is on disk.
  useEffect(() => {
    if (!passage) return undefined;
    setSelectedId(passage.captureId || `passage:${passage.stagedAt}`);
    return load();
  }, [passage, load]);

  const rows = useMemo<PassageRow[]>(() => {
    const stored = history.kind === 'ready' ? history.entries.map(rowFromHistory) : [];
    if (!passage) return stored;
    const live = rowFromHandoff(passage);
    return [live, ...stored.filter((row) => row.captureId !== live.captureId)];
  }, [history, passage]);

  const selected = rows.find((row) => row.captureId === selectedId) ?? rows[0] ?? null;

  const readerLines = useMemo(() => {
    if (!selected) return [];
    return selected.lines.length ? selected.lines : selected.text.split(/\r?\n/).filter(Boolean);
  }, [selected]);

  const listBody = (
    <>
      {history.kind === 'loading' && rows.length === 0 ? (
        <p className="reading-captures-note muted" aria-live="polite">
          {t('reading.captures.loading')}
        </p>
      ) : null}
      {history.kind === 'error' ? (
        <p className="reading-captures-note reading-captures-error" role="status">
          {t('reading.captures.loadFailed')}
        </p>
      ) : null}
      {history.kind !== 'loading' && rows.length === 0 ? (
        <p className="reading-captures-note muted">{t('reading.captures.empty')}</p>
      ) : null}
      <ul className="reading-captures-rows">
        {rows.map((row) => (
          <li key={row.captureId}>
            <button
              type="button"
              className="reading-captures-row"
              aria-current={selected?.captureId === row.captureId}
              onClick={() => setSelectedId(row.captureId)}
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
          </li>
        ))}
      </ul>
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
    if (!listOpen) return [];
    return [
      {
        id: 'captures',
        label: t('reading.captures.recent'),
        minWidth: 200,
        preferredWidth: 260,
        onClose: () => setListOpen(false),
        actions: (
          <button
            type="button"
            className="reading-captures-refresh"
            onClick={() => load()}
            title={t('reading.captures.refresh')}
          >
            <Icon name="refresh" size={13} />
          </button>
        ),
        content: listBody,
      },
    ];
  }, [listOpen, listBody, load, t]);

  return (
    <div className="reading-captures">
      <ReadingCanvas
        tools={tools}
        closeLabel={t('common.close')}
        aria-label={t('reading.captures.title')}
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
