/**
 * The inspector's preview: a glance at what the selected row holds.
 *
 * Only what an existing reader in this app can draw cheaply — an image, the
 * text of a note, a subtitle or transcript, a plain-text file, and a PDF's
 * first page (drawn by the same sandboxed pdf.js the OCR import uses). Rows
 * with nothing to show render nothing, rather than an empty frame.
 */
import { useEffect, useState } from 'react';
import type { FilesItem } from '../../../shared/filesApp/catalog';
import { previewPlanFor, type FilesPreview } from '../../../shared/filesApp/preview';
import { loadNotebookTimeline } from '../../notebookTimeline';

type Translate = (key: string, values?: Record<string, string | number>) => string;

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: FilesPreview };

/** Whether this row has anything the pane could show, decided without I/O. */
export function hasFilesPreview(item: FilesItem): boolean {
  if (item.id.startsWith('notebook:')) return true;
  if (item.location.store !== 'file' || item.flags.brokenLink) return false;
  return previewPlanFor({ kind: item.kind, path: item.location.path }) !== null;
}

function notePreview(item: FilesItem): FilesPreview {
  const id = item.id.slice('notebook:'.length);
  let entries: ReturnType<typeof loadNotebookTimeline> = [];
  try {
    entries = loadNotebookTimeline();
  } catch {
    entries = [];
  }
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return { kind: 'none', reasonKey: 'filesApp.preview.none.missing' };
  const text = [entry.title, entry.detail].filter(Boolean).join('\n\n');
  return { kind: 'text', text, truncated: false };
}

export function FilesPreviewPane({ item, t }: { item: FilesItem; t: Translate }) {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });

  useEffect(() => {
    if (!hasFilesPreview(item)) {
      setState({ status: 'idle' });
      return undefined;
    }
    if (item.id.startsWith('notebook:')) {
      setState({ status: 'ready', preview: notePreview(item) });
      return undefined;
    }
    const api = window.api as (typeof window.api & { filesPreview?: (id: string) => Promise<FilesPreview> }) | undefined;
    if (typeof api?.filesPreview !== 'function') {
      setState({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .filesPreview(item.id)
      .then((preview) => {
        if (!cancelled) setState({ status: 'ready', preview });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'ready', preview: { kind: 'none', reasonKey: 'filesApp.preview.none.failed' } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (state.status === 'idle') return null;
  return (
    <section className="fa-preview" aria-label={t('filesApp.preview.label')}>
      {state.status === 'loading' ? (
        <p className="fa-details-note">{t('filesApp.preview.loading')}</p>
      ) : state.preview.kind === 'image' ? (
        <img className="fa-preview-image" src={state.preview.url} alt={item.name} />
      ) : state.preview.kind === 'text' ? (
        <>
          <pre className="fa-preview-text">{state.preview.text}</pre>
          {state.preview.truncated ? (
            <p className="fa-details-note">{t('filesApp.preview.truncated')}</p>
          ) : null}
        </>
      ) : (
        <p className="fa-details-note">{t(state.preview.reasonKey)}</p>
      )}
    </section>
  );
}
