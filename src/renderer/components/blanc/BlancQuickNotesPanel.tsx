/**
 * Blanc Quick Notes: the Notes app inside Blanc's tool chrome.
 *
 * Same notes as the Study OS / Aero / Wired Notes dialog and the Files app,
 * from the same durable store. Ctrl+N (`quickNotes.newNote`) starts a new note
 * instead of emptying the old text box, and nothing is deleted without a
 * confirmation (it goes to a trash with restore).
 */
import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { registerCommandHandler } from '../../keyboardShortcuts';
import NotesManager from '../notes/NotesManager';
import { openBlancHref } from './blancNotebookLinks';
import { migrateBlancQuickNotes } from './blancQuickNotes';

export default function BlancQuickNotesPanel() {
  const { t } = useT();
  const newNoteRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void migrateBlancQuickNotes(t('blanc.tb.quickNotes'));
  }, [t]);

  useEffect(
    () =>
      registerCommandHandler('quickNotes.newNote', () => {
        newNoteRef.current?.();
        return true;
      }),
    [],
  );

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.quickNotes')}</legend>
        <p className="blanc-note">{t('blanc.tb.quickNotesWarning')}</p>
        <NotesManager
          variant="blanc"
          newNoteRef={newNoteRef}
          bodyPlaceholder={t('blanc.tb.quickNotesPlaceholder')}
          onOpenSection={(href) => {
            openBlancHref(href);
          }}
        />
      </fieldset>
    </div>
  );
}
