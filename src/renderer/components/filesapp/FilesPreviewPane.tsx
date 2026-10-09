/**
 * The inspector's preview: a glance at what the selected row holds.
 *
 * Only what an existing reader in this app can draw cheaply — an image, the
 * text of a note, a subtitle or transcript, a plain-text file, and a PDF's
 * first page (drawn by the same sandboxed pdf.js the OCR import uses). Rows
 * with nothing to show render nothing, rather than an empty frame.
 *
 * files2: audio and video play right here, through the player's own
 * `playfile://` stream (`media:fileUrl`), so a clip can be checked without
 * opening the player and losing your place in the list.
 */
import { useEffect, useState } from 'react';
import type { FilesItem } from '../../../shared/filesApp/catalog';
import { mediaPreviewKind, previewPlanFor, type FilesPreview } from '../../../shared/filesApp/preview';
import { loadNotebookTimeline } from '../../notebookTimeline';

type Translate = (key: string, values?: Record<string, string | number>) => string;

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: FilesPreview }
  | { status: 'media'; kind: 'audio' | 'video'; url: string };

/** Whether this row has anything the pane could show, decided without I/O. */
export function hasFilesPreview(item: FilesItem): boolean {
  if (item.id.startsWith('notebook:')) return true;
  if (item.location.store !== 'file' || item.flags.brokenLink) return false;
  if (mediaPreviewKind(item.location.path)) return true;
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

type PreviewApi = typeof window.api & {
  filesPreview?: (id: string) => Promise<FilesPreview>;
  mediaFileUrl?: (path: string) => Promise<string | null>;
};

export function FilesPreviewPane({ item, t }: { item: FilesItem; t: Translate }) {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    setMediaFailed(false);
    if (!hasFilesPreview(item)) {
      setState({ status: 'idle' });
      return undefined;
    }
    if (item.id.startsWith('notebook:')) {
      setState({ status: 'ready', preview: notePreview(item) });
      return undefined;
    }
    const api = window.api as PreviewApi | undefined;
    let cancelled = false;
    const media = item.location.store === 'file' ? mediaPreviewKind(item.location.path) : null;
    if (media && item.location.store === 'file') {
      if (typeof api?.mediaFileUrl !== 'function') {
        setState({ status: 'ready', preview: { kind: 'none', reasonKey: 'filesApp.preview.none.unsupported' } });
        return undefined;
      }
      setState({ status: 'loading' });
      api
        .mediaFileUrl(item.location.path)
        .then((url) => {
          if (cancelled) return;
          setState(
            url
              ? { status: 'media', kind: media, url }
              : { status: 'ready', preview: { kind: 'none', reasonKey: 'filesApp.preview.none.unsupported' } },
          );
        })
        .catch(() => {
          if (!cancelled) setState({ status: 'ready', preview: { kind: 'none', reasonKey: 'filesApp.preview.none.failed' } });
        });
      return () => {
        cancelled = true;
      };
    }
    if (typeof api?.filesPreview !== 'function') {
      setState({ status: 'idle' });
      return undefined;
    }
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
      ) : state.status === 'media' ? (
        mediaFailed ? (
          <p className="fa-details-note">{t('files2.preview.mediaFailed')}</p>
        ) : state.kind === 'audio' ? (
          <audio
            className="fa-preview-audio"
            src={state.url}
            controls
            preload="metadata"
            aria-label={t('files2.preview.audio', { name: item.name })}
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <video
            className="fa-preview-video"
            src={state.url}
            controls
            preload="metadata"
            aria-label={t('files2.preview.video', { name: item.name })}
            onError={() => setMediaFailed(true)}
          />
        )
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
