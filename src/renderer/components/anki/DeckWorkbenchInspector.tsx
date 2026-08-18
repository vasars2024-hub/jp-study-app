/**
 * The note inspector — the editing half of Phase 2's Browser.
 *
 * It edits the *draft*, never the collection: nothing here writes to Anki or to
 * a file, and every change goes through `shared/ankiDraftEdit.ts` so it lands in
 * a journal that can undo it. The plan's rule for this phase is that an edit is
 * honest about its consequences, which is why the three things the model can
 * work out — an orphaned media file, a reference the source does not contain,
 * and the cards a cloze change would add or remove — are shown as notes under
 * the field rather than discovered at export time.
 *
 * A field commits on blur, not on every keystroke: one journal entry per visit
 * to a field is what makes undo mean "take back that edit" instead of "take back
 * one character".
 *
 * It is also where written provenance is *read back* (plan gate 11). Enrichment
 * wraps a value it wrote in a span naming the dictionaries behind it; that
 * wrapper survives an export and a reimport as ordinary field markup, so this
 * panel is what turns it from bytes in a field into an answer to "where did
 * this come from?". Deliberately derived from `field.raw` on every render
 * rather than cached: editing the wrapper away must make the line disappear.
 */
import { useEffect, useState } from 'react';
import type { AnkiDraft, AnkiDraftNote } from '../../../shared/ankiDraft';
import type { AnkiDraftEditResult } from '../../../shared/ankiDraftEdit';
import {
  draftFieldNormalizer,
  normalizeTags,
  setNoteField,
  setNoteTags,
  type AnkiDraftEditJournal,
} from '../../../shared/ankiDraftEdit';
import { readEnrichProvenance } from '../../../shared/ankiEnrich';
import { noteCardCensus } from '../../../shared/ankiTemplateRender';
import { useT } from '../../i18n';
import DeckWorkbenchPreview from './DeckWorkbenchPreview';

export interface InspectorConsequence {
  fieldOrd: number;
  mediaDropped: string[];
  mediaMissing: string[];
  clozeAdded: number[];
  clozeRemoved: number[];
}

export default function DeckWorkbenchInspector({
  draft,
  journal,
  note,
  onEdit,
}: {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
  note: AnkiDraftNote;
  onEdit: (result: AnkiDraftEditResult) => void;
}) {
  const { t } = useT();
  const [tagText, setTagText] = useState(note.tags.join(' '));
  const [last, setLast] = useState<InspectorConsequence | null>(null);

  // Focusing a different note replaces what the panel is about; carrying the
  // previous note's tag draft over would silently write it onto this one.
  useEffect(() => {
    setTagText(note.tags.join(' '));
    setLast(null);
  }, [note.id, note.tags]);

  const noteType = draft.noteTypes.find((nt) => nt.id === note.noteTypeId);
  // Recomputed on every render, like the provenance line and for the same
  // reason: a field edit changes what the note generates without changing what
  // it holds, and a cached count would keep claiming the pre-edit shape.
  const census = noteCardCensus(draft, note);
  const deckNames = draft.cards
    .filter((c) => c.noteId === note.id)
    .map((c) => draft.decks.find((d) => d.id === c.deckId)?.name)
    .filter((name, i, all): name is string => Boolean(name) && all.indexOf(name) === i);

  const commitField = (fieldOrd: number, raw: string) => {
    const result = setNoteField(draft, journal, note.id, fieldOrd, raw, draftFieldNormalizer(draft.source));
    if (!result.changed) return;
    setLast({
      fieldOrd,
      mediaDropped: result.mediaDropped ?? [],
      mediaMissing: result.mediaMissing ?? [],
      clozeAdded: result.clozeOrdinalsAdded ?? [],
      clozeRemoved: result.clozeOrdinalsRemoved ?? [],
    });
    onEdit(result);
  };

  const commitTags = () => {
    const next = normalizeTags(tagText.split(/\s+/));
    const result = setNoteTags(draft, journal, note.id, next);
    setTagText(next.join(' '));
    if (result.changed) onEdit(result);
  };

  return (
    <aside className="wb-inspector" aria-label={t('ankiWorkbench.inspector.title')}>
      <h4>{t('ankiWorkbench.inspector.title')}</h4>
      <ul className="wb-inspector-facts">
        <li>{t('ankiWorkbench.inspector.noteType', { name: noteType?.name ?? '—' })}</li>
        <li>{t('ankiWorkbench.inspector.decks', { names: deckNames.join(', ') || '—' })}</li>
        <li>{t('ankiWorkbench.inspector.cards', { count: census.existing })}</li>
        {census.differs && (
          <li className="wb-inspector-warning" data-generated={census.generated} role="status">
            {t(
              census.generated > census.existing
                ? 'ankiWorkbench.inspector.cardsWouldGrow'
                : 'ankiWorkbench.inspector.cardsWouldShrink',
              { has: census.existing, will: census.generated },
            )}
          </li>
        )}
      </ul>

      {note.fields.map((field) => {
        const wrote = readEnrichProvenance(field.raw)?.sources ?? [];
        return (
        <label key={field.ord} className="wb-inspector-field">
          <span className="wb-inspector-field-name">{field.name}</span>
          <textarea
            className="wb-inspector-input"
            defaultValue={field.raw}
            // `key` on the note id, so switching notes reloads the text rather
            // than leaving the previous note's value in an uncontrolled box.
            key={`${note.id}:${field.ord}:${field.raw}`}
            rows={2}
            onBlur={(e) => commitField(field.ord, e.target.value)}
          />
          {wrote.length > 0 && (
            <span className="wb-inspector-provenance" data-field-ord={field.ord}>
              {t('ankiWorkbench.inspector.provenance', { sources: wrote.join(', ') })}
            </span>
          )}
          {last?.fieldOrd === field.ord && last.clozeAdded.length > 0 && (
            <span className="wb-inspector-note" role="status">
              {t('ankiWorkbench.inspector.clozeAdded', { ords: last.clozeAdded.join(', ') })}
            </span>
          )}
          {last?.fieldOrd === field.ord && last.clozeRemoved.length > 0 && (
            <span className="wb-inspector-note" role="status">
              {t('ankiWorkbench.inspector.clozeRemoved', { ords: last.clozeRemoved.join(', ') })}
            </span>
          )}
          {last?.fieldOrd === field.ord && last.mediaDropped.length > 0 && (
            <span className="wb-inspector-note">
              {t('ankiWorkbench.inspector.mediaDropped', { names: last.mediaDropped.join(', ') })}
            </span>
          )}
          {last?.fieldOrd === field.ord && last.mediaMissing.length > 0 && (
            <span className="wb-inspector-warning">
              {t('ankiWorkbench.inspector.mediaMissing', { names: last.mediaMissing.join(', ') })}
            </span>
          )}
        </label>
        );
      })}

      <label className="wb-inspector-field">
        <span className="wb-inspector-field-name">{t('ankiWorkbench.inspector.tags')}</span>
        <input
          className="wb-inspector-input"
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          onBlur={commitTags}
        />
        <span className="muted">{t('ankiWorkbench.inspector.tagsHint')}</span>
      </label>

      {/* Below the fields on purpose: the card an edit produces is the thing the
          edit is *for*, and it re-renders as soon as the field commits. */}
      <DeckWorkbenchPreview draft={draft} note={note} />
    </aside>
  );
}
