/**
 * Step 7 for a LOCAL deck source: write the edited fields back into the app's
 * own flashcards.
 *
 * The workbench could load the local deck and edit it, and then offered no
 * destination for it — the panel told the user to "export the deck from Anki",
 * which is not where this deck lives. This writes through the deck store in one
 * persisted write, refuses when the deck changed since it was loaded (the same
 * rule every other destination follows), says before the button which kinds of
 * change a local deck cannot hold, and keeps the old values so the write can be
 * put back in this session.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import type { AnkiDraftEditJournal } from '../../../shared/ankiDraftEdit';
import { buildApkgExportChanges } from '../../../shared/ankiApkgExport';
import {
  LOCAL_DECK_WRITABLE_FIELDS,
  planLocalDeckApply,
  type LocalDeckFieldPatch,
  type LocalDeckWritableField,
} from '../../../shared/ankiWorkbenchPersistence';
import { applyDeckFieldPatches, loadDeck, loadDeckAsAnkiDraft } from '../../flashcardDeck';
import { useT } from '../../i18n';

type Outcome =
  | { kind: 'ok'; updated: number; missing: number }
  | { kind: 'stale' }
  | { kind: 'reversed'; count: number };

function currentFields(): Map<string, Record<LocalDeckWritableField, string | undefined>> {
  const map = new Map<string, Record<LocalDeckWritableField, string | undefined>>();
  for (const card of loadDeck()) {
    map.set(card.id, {
      word: card.word,
      reading: card.reading,
      meaning: card.meaning,
      sentence: card.sentence,
      front: card.front,
      back: card.back,
    });
  }
  return map;
}

export default function DeckWorkbenchLocalApply({
  draft,
  journal,
}: {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
}) {
  const { t } = useT();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** The values the last write replaced, so it can be put back. Session-only. */
  const [previous, setPrevious] = useState<Array<{ id: string; patch: LocalDeckFieldPatch }> | null>(null);

  const plan = useMemo(
    () => planLocalDeckApply(buildApkgExportChanges(draft, journal), currentFields()),
    [draft, journal, outcome],
  );
  const blocked = draft.diagnostics.some((d) => d.severity === 'blocking');

  const write = (): void => {
    // The deck may have changed since the workbench read it — a review, a mined
    // card, an edit in Flashcards. Writing a patch computed against the old
    // deck could overwrite that, so it is refused and the reason said.
    if (loadDeckAsAnkiDraft().draft.source.fingerprint !== draft.source.fingerprint) {
      setOutcome({ kind: 'stale' });
      return;
    }
    const before = currentFields();
    const undo = plan.patches.map(({ id, patch }) => {
      const old: LocalDeckFieldPatch = {};
      for (const field of LOCAL_DECK_WRITABLE_FIELDS) {
        if (field in patch) old[field] = before.get(id)?.[field] ?? '';
      }
      return { id, patch: old };
    });
    const result = applyDeckFieldPatches(plan.patches);
    setPrevious(undo.filter((entry) => result.updated.includes(entry.id)));
    setOutcome({ kind: 'ok', updated: result.updated.length, missing: result.missing.length });
  };

  const putBack = (): void => {
    if (!previous?.length) return;
    const result = applyDeckFieldPatches(previous);
    setPrevious(null);
    setOutcome({ kind: 'reversed', count: result.updated.length });
  };

  return (
    <div className="wb-apply">
      <section aria-label={t('ankiWorkbench.step.apply')}>
        {blocked ? (
          <p className="deck-workbench-error" role="alert">
            {t('ankiWorkbench.apply.blocked')}
          </p>
        ) : (
          <>
            {plan.patches.length === 0 ? (
              <p className="muted wb-apply-empty">{t('ankiWorkbench.apply.empty')}</p>
            ) : (
              <ul className="deck-workbench-facts">
                <li>{t('ankiWorkbench.apply.local.cards', { count: plan.patches.length })}</li>
              </ul>
            )}
            <p className="muted">{t('ankiWorkbench.apply.local.scope')}</p>
            {plan.unsupported.length > 0 && (
              <p className="muted wb-apply-local-unsupported">
                {t('ankiWorkbench.apply.local.unsupported', {
                  kinds: plan.unsupported.map((entry) => `${entry.kind} (${entry.count})`).join(', '),
                })}
              </p>
            )}
            <button
              type="button"
              className="btn primary wb-apply-local"
              disabled={plan.patches.length === 0}
              onClick={write}
            >
              {t('ankiWorkbench.apply.local.button')}
            </button>
          </>
        )}
      </section>

      {outcome?.kind === 'ok' && (
        <section className="wb-apply-result" role="status" aria-label={t('ankiWorkbench.apply.local.button')}>
          <ul className="deck-workbench-facts">
            <li>{t('ankiWorkbench.apply.local.ok', { count: outcome.updated })}</li>
            {outcome.missing > 0 && (
              <li>{t('ankiWorkbench.apply.local.missing', { count: outcome.missing })}</li>
            )}
          </ul>
        </section>
      )}
      {outcome?.kind === 'stale' && (
        <p className="deck-workbench-error" role="alert">
          {t('ankiWorkbench.apply.local.stale')}
        </p>
      )}
      {outcome?.kind === 'reversed' && (
        <p className="wb-apply-reverse-ok" role="status">
          {t('ankiWorkbench.apply.local.reversed', { count: outcome.count })}
        </p>
      )}
      {previous && previous.length > 0 && (
        <section className="wb-apply-reverse" aria-label={t('ankiWorkbench.apply.local.putBack')}>
          <button type="button" className="btn wb-apply-reverse" onClick={putBack}>
            {t('ankiWorkbench.apply.local.putBack')}
          </button>
        </section>
      )}
    </div>
  );
}
