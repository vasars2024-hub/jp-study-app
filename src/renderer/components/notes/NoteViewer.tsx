/**
 * The small note viewer/editor for notes saved with "Save as note".
 *
 * The Notebook section was removed (gate 7b) and its desktop entry opens
 * Files, which listed these notes by title only and refused to open them — so
 * a saved note could be written and never read again. This dialog is what
 * Open does for a note row in Files, and what "Save as note" in Translate
 * opens straight after saving. It reads, and edits the title and body in
 * place (`updateNotebookEntry`).
 *
 * Opened imperatively (`openNoteViewer`), the way `dialogService` opens its
 * dialogs, so no window or shell has to mount a host for it.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { findNotebookEntry, updateNotebookEntry, type NotebookTimelineEntry } from '../../notebookTimeline';
import { formatDate } from '../filesapp/format';
import { useT } from '../../i18n';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import NoteBody from './NoteBody';

export function NoteViewer({
  entry,
  onClose,
}: {
  entry: NotebookTimelineEntry;
  onClose: () => void;
}): JSX.Element {
  const { t, lang } = useT();
  const [current, setCurrent] = useState(entry);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.detail ?? '');

  const save = (): void => {
    const next = updateNotebookEntry(current.id, { title: title.trim() || current.title, detail: body });
    if (next) setCurrent(next);
    setEditing(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      className="note-viewer"
      title={editing ? t('notes.viewer.editTitle') : current.title}
      footer={
        editing ? (
          <>
            <Button onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={save}>
              {t('notes.viewer.save')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setEditing(true)}>{t('notes.viewer.edit')}</Button>
            <Button variant="primary" onClick={onClose}>
              {t('notes.viewer.close')}
            </Button>
          </>
        )
      }
    >
      <p className="muted note-viewer-meta">
        {[current.folder, formatDate(typeof current.ts === 'number' ? current.ts : null, lang)].filter(Boolean).join(' · ')}
      </p>
      {editing ? (
        <div className="note-viewer-edit">
          <label>
            {t('notes.viewer.titleLabel')}
            <input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            {t('notes.viewer.bodyLabel')}
            <textarea
              className="ui-input"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
        </div>
      ) : current.detail ? (
        <NoteBody text={current.detail} />
      ) : (
        <p className="muted">{t('notes.viewer.empty')}</p>
      )}
    </Dialog>
  );
}

/** Open the viewer for a timeline entry. `false` when no such note exists. */
export function openNoteViewer(entryId: string): boolean {
  const entry = findNotebookEntry(entryId);
  if (!entry) return false;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = (): void => {
    window.setTimeout(() => {
      root.unmount();
      host.remove();
    }, 0);
  };
  root.render(<NoteViewer entry={entry} onClose={close} />);
  return true;
}
