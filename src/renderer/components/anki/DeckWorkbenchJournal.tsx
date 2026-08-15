/**
 * The Deck Workbench's audit journal — Phase 3's last unbuilt item.
 *
 * Undo/redo already told a user *how many* steps there were. This tells them
 * what each one was, in the same units the Undo button uses, so pressing Undo
 * and reading the list can never disagree. All of the model is pure and lives
 * in `shared/ankiEditAudit.ts`; this only renders it.
 *
 * Collapsed by default: it is a record to consult, not a thing to work in, and
 * a growing list must not push the grid down the panel.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import type { AnkiDraftEditJournal } from '../../../shared/ankiDraftEdit';
import { appliedStepCount, auditedNoteCount, summarizeJournal } from '../../../shared/ankiEditAudit';
import { useT } from '../../i18n';

export default function DeckWorkbenchJournal({
  draft,
  journal,
}: {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => summarizeJournal(journal, draft), [journal, draft]);

  if (entries.length === 0) return null;

  const applied = appliedStepCount(entries);

  return (
    <section className="wb-journal">
      <button
        type="button"
        className="btn wb-journal-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {t('ankiWorkbench.journal.title', { applied, notes: auditedNoteCount(journal) })}
      </button>
      {open && (
        <ol className="wb-journal-list">
          {entries.map((entry) => (
            <li
              key={`${entry.id}-${entry.index}`}
              className={`wb-journal-entry${entry.undone ? ' wb-journal-undone' : ''}`}
            >
              <span className="wb-journal-index">{entry.index}</span>
              <span className="wb-journal-what">
                {entry.batch
                  ? t('ankiWorkbench.journal.batch', { notes: entry.noteCount, ops: entry.opCount })
                  : t('ankiWorkbench.journal.single', { notes: entry.noteCount })}
              </span>
              <span className="wb-journal-where">
                {/* Field names are the user's own data and are never translated;
                    the joining sentence around them is. */}
                {entry.fieldNames.length > 0 &&
                  t('ankiWorkbench.journal.fields', { fields: entry.fieldNames.join(', ') })}
                {entry.tagsChanged && ` ${t('ankiWorkbench.journal.tags')}`}
              </span>
              {entry.undone && (
                <span className="wb-journal-flag">{t('ankiWorkbench.journal.undone')}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
