/**
 * A saved note's body in the Files inspector. Files listed Notebook entries by
 * title only, so "Save as note" produced a row nobody could read; this shows
 * the text under the row's properties. Only for rows the Notebook timeline
 * owns (`source: 'notebook'`) — everything else in Files keeps its own panel.
 */
import { useEffect, useState } from 'react';
import type { FilesItem } from '../../../shared/filesApp/catalog';
import { findNotebookEntry, onNotebookTimelineChanged } from '../../notebookTimeline';
import { useT } from '../../i18n';
import NoteBody from './NoteBody';

export function notebookEntryIdOf(item: Pick<FilesItem, 'source' | 'location'>): string | null {
  if (item.source !== 'notebook' || item.location.store !== 'localStorage') return null;
  return item.location.pointer ?? null;
}

export default function FilesNoteDetails({ item }: { item: FilesItem }): JSX.Element | null {
  const { t } = useT();
  const id = notebookEntryIdOf(item);
  const [text, setText] = useState(() => (id ? findNotebookEntry(id)?.detail ?? '' : ''));
  useEffect(() => {
    if (!id) return undefined;
    setText(findNotebookEntry(id)?.detail ?? '');
    return onNotebookTimelineChanged(() => setText(findNotebookEntry(id)?.detail ?? ''));
  }, [id]);
  if (!id) return null;
  return (
    <section className="fa-note-body" aria-label={t('notes.details.aria')}>
      {text ? <NoteBody text={text} /> : <p className="fa-details-note">{t('notes.viewer.empty')}</p>}
    </section>
  );
}
