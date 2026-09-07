/**
 * Notebook aggregation, filtering, and timeline rendering — shared by Study OS's
 * `NotebookView` and Blanc's `BlancNotebookPanel`.
 *
 * Pillar 0 (BLANC_REFINEMENT_PLAN.md): Blanc had no notebook at all, only the
 * deliberately separate local `quick-notes` scratchpad. The aggregation already
 * lived in `renderer/notebook/*`; what was view-local was the view tabs, the
 * stream chips, the folder rail, and the timeline with its lineage chains.
 *
 * Navigation is injected rather than hardcoded: Study OS dispatches `os:open`,
 * but that bus does not move Blanc's tabs, so a Blanc-specific opener is passed
 * in instead of silently doing nothing. Nothing here may import
 * `AppChrome`/`MenuBar`/`StatusBar`.
 */
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import {
  aggregateNotebook,
  loadNotebookSources,
  type NotebookSources,
} from '../../notebook/aggregate';
import type { NotebookStream } from '../../notebookTimeline';
import { NOTEBOOK_VIEWS, streamsForView, type NotebookViewId } from '../../notebook/views';
import { buildLineageIndex, lineageForEntry } from '../../notebook/lineage';
import { collectAllAnnotationsMap } from '../../annotations';
import { loadDeck } from '../../flashcardDeck';
import { ContextualSurface } from '../liquid/LiquidSurface';
import './notebookLiquid.css';

export const STREAM_KEYS: NotebookStream[] = [
  'saved-words',
  'lookups',
  'flashcards',
  'anki',
  'mining',
  'known',
  'translations',
  'plan',
  'highlights',
  'ocr',
  'audio',
  'clipboard',
  'extension',
  'transcript',
];

/** How many timeline rows we ever render — the same cap Study OS has always had. */
export const TIMELINE_CAP = 400;

export interface NotebookState {
  view: NotebookViewId;
  selectView: (next: NotebookViewId) => void;
  stream: NotebookStream | 'all';
  setStream: (s: NotebookStream | 'all') => void;
  folder: string;
  setFolder: (f: string) => void;
  counts: Record<string, number>;
  viewStreams: NotebookStream[];
  inView: ReturnType<typeof aggregateNotebook>['entries'];
  visible: ReturnType<typeof aggregateNotebook>['entries'];
  folders: { id: string; label: string; count: number }[];
  lineage: ReturnType<typeof buildLineageIndex>;
  refresh: () => void;
  /** True when the timeline is showing fewer rows than matched — reported, never silent. */
  truncated: boolean;
}

export function useNotebook(): NotebookState {
  const [view, setView] = useState<NotebookViewId>('overview');
  const [folder, setFolder] = useState<string>('all');
  const [stream, setStream] = useState<NotebookStream | 'all'>('all');
  const [tick, setTick] = useState(0);

  // Library + Jiten plan come over IPC. They resolve after the first paint, so
  // the localStorage-backed streams render immediately and these fill in.
  const [sources, setSources] = useState<NotebookSources>({});

  useEffect(() => {
    let alive = true;
    void loadNotebookSources().then((s) => {
      if (alive) setSources(s);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const data = useMemo(() => aggregateNotebook(sources), [sources]);

  // Built once per refresh rather than per row: resolving a chain inline would
  // re-scan the whole deck for each of up to 400 rendered entries.
  const lineage = useMemo(
    () =>
      buildLineageIndex({
        library: sources.library,
        plan: sources.plan,
        deck: loadDeck(),
        annotations: collectAllAnnotationsMap(),
      }),
    [sources],
  );

  const viewStreams = useMemo(() => streamsForView(view, STREAM_KEYS), [view]);

  /** Everything the active view owns, before the stream/folder chips narrow it. */
  const inView = useMemo(() => {
    const allowed = new Set(viewStreams);
    return data.entries.filter((e) => allowed.has(e.stream));
  }, [data.entries, viewStreams]);

  const visible = useMemo(
    () =>
      inView.filter((e) => {
        if (folder !== 'all' && (e.folder || 'Other') !== folder) return false;
        if (stream !== 'all' && e.stream !== stream) return false;
        return true;
      }),
    [inView, folder, stream],
  );

  // Folder counts must describe the active view, not the whole notebook —
  // otherwise a sidebar count promises rows that the view will not show.
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of inView) {
      const f = e.folder || 'Other';
      m.set(f, (m.get(f) || 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, label: id, count }))
      .sort((a, b) => b.count - a.count);
  }, [inView]);

  // Switching views can strand a filter on a stream/folder the new view does
  // not contain, which reads as an empty notebook rather than a stale filter.
  // The overview can own 400 rows plus provenance chains. Treat the replacement
  // as non-urgent so the click paints acknowledgement before React reconciles
  // the large history; the selected tab remains the only source of truth.
  const selectView = useCallback((next: NotebookViewId) => {
    startTransition(() => {
      setView(next);
      setStream('all');
      setFolder('all');
    });
  }, []);

  return {
    view,
    selectView,
    stream,
    setStream,
    folder,
    setFolder,
    counts: data.counts,
    viewStreams,
    inView,
    visible,
    folders,
    lineage,
    refresh: () => setTick((n) => n + 1),
    truncated: visible.length > TIMELINE_CAP,
  };
}

/** Study OS's `os:open` bus. Blanc passes its own opener instead. */
export function studyOsOpenHref(href?: string): void {
  if (!href) return;
  if (href === 'clipboard') {
    window.dispatchEvent(new CustomEvent('clipboard:open'));
    return;
  }
  window.dispatchEvent(new CustomEvent('os:open', { detail: href }));
}

export function NotebookViewTabs({ state }: { state: NotebookState }) {
  const { t } = useT();
  return (
    <ContextualSurface
      as="nav"
      className="gx-notebook-views"
      role="tablist"
      aria-label={t('notebook.status')}
    >
      {NOTEBOOK_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={state.view === v}
          className={`gx-notebook-view ${state.view === v ? 'active' : ''}`}
          onClick={() => state.selectView(v)}
        >
          {t(`notebook.view.${v}`)}
        </button>
      ))}
    </ContextualSurface>
  );
}

export function NotebookStreamCounts({ state }: { state: NotebookState }) {
  const { t } = useT();
  return (
    <div className="gx-notebook-counts">
      {state.viewStreams.map((s) => (
        <button
          key={s}
          type="button"
          className={`gx-notebook-count ${state.stream === s ? 'active' : ''}`}
          onClick={() => state.setStream(state.stream === s ? 'all' : s)}
        >
          <span className="gx-notebook-count-n">{state.counts[s] || 0}</span>
          <span className="gx-notebook-count-l">{t(`notebook.stream.${s}`)}</span>
        </button>
      ))}
    </div>
  );
}

export function NotebookFolders({ state }: { state: NotebookState }) {
  const { t } = useT();
  return (
    <>
      <button
        type="button"
        className={`gx-notebook-folder ${state.folder === 'all' ? 'active' : ''}`}
        onClick={() => state.setFolder('all')}
      >
        {t('grammar.filter.all')} ({state.inView.length})
      </button>
      {state.folders.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`gx-notebook-folder ${state.folder === f.id ? 'active' : ''}`}
          onClick={() => state.setFolder(f.id)}
        >
          {f.label} ({f.count})
        </button>
      ))}
    </>
  );
}

export function NotebookTimeline({
  state,
  onOpen,
}: {
  state: NotebookState;
  onOpen: (href?: string) => void;
}) {
  const { t, lang } = useT();

  if (state.visible.length === 0) {
    return (
      <div className="gx-notebook-empty">
        <p>{t('notebook.empty.title')}</p>
        <p className="muted">{t('notebook.empty.body')}</p>
      </div>
    );
  }

  return (
    <ul className="gx-notebook-list">
      {state.visible.slice(0, TIMELINE_CAP).map((e) => {
        const chain = lineageForEntry(e, state.lineage);
        return (
          <li key={e.id} className="gx-notebook-item">
            <button type="button" className="gx-notebook-item-btn" onClick={() => onOpen(e.href)}>
              <div className="gx-notebook-item-top">
                <span className="gx-notebook-item-title">{e.title}</span>
                <span className="muted">{t(`notebook.stream.${e.stream}`)}</span>
              </div>
              {e.detail ? <p className="muted gx-notebook-item-detail">{e.detail}</p> : null}
              <div className="gx-notebook-item-meta muted">
                {e.folder ? <span>{e.folder}</span> : null}
                <span>{new Date(e.ts).toLocaleString(LANG_TAGS[lang])}</span>
              </div>
            </button>
            {chain.length > 0 ? (
              <ol className="gx-notebook-lineage" aria-label={t('notebook.lineage.label')}>
                {chain.map((n, i) => (
                  <li key={`${n.stage}-${i}`} className="gx-notebook-lineage-node">
                    <button
                      type="button"
                      className="gx-notebook-lineage-btn"
                      onClick={() => onOpen(n.href)}
                    >
                      <span className="gx-notebook-lineage-stage">
                        {t(`notebook.lineage.${n.stage}`)}
                      </span>
                      {n.label ? <span className="gx-notebook-lineage-label">{n.label}</span> : null}
                      {typeof n.count === 'number' ? (
                        <span className="gx-notebook-lineage-count">{n.count}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
