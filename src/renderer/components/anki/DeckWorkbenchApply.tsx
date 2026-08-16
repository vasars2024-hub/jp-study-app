/**
 * Step 7 — "Apply or export": the first control in the workbench that touches
 * a file.
 *
 * Everything before this step was a dry run on the draft; this surface says
 * what will actually be written — the same net change set step 6's review
 * described, recomputed here from the same builder so the two cannot drift —
 * and then ships it over `apkg:export`. The request deliberately carries no
 * `outPath` and no `sourcePath`: the user chooses the destination in the save
 * dialog, and the main process resolves the source from the fingerprint it
 * remembers, so the renderer never holds a path.
 *
 * Only a package source can be exported. The local deck has no file to copy,
 * and writing back to live Anki is a later phase — both say so instead of
 * offering a button that would refuse.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import type { AnkiDraftEditJournal } from '../../../shared/ankiDraftEdit';
import {
  buildApkgExportChanges,
  exportChangesEmpty,
  type ApkgExportResult,
} from '../../../shared/ankiApkgExport';
import { useT } from '../../i18n';

export default function DeckWorkbenchApply({
  draft,
  journal,
  onExported,
}: {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
  /** Called once per successful export, with the exporter's own numbers. */
  onExported: (result: ApkgExportResult) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApkgExportResult | null>(null);

  // Recomputed on every edit or undo, exactly as the review's numbers are: an
  // undo run from this step must change what the button claims it will write.
  const changes = useMemo(() => buildApkgExportChanges(draft, journal), [draft, journal]);
  const empty = exportChangesEmpty(changes);
  const blocked = draft.diagnostics.some((d) => d.severity === 'blocking');
  const isPackage = draft.source.kind === 'apkg' || draft.source.kind === 'colpkg';

  const runExport = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await window.api.exportApkgDraft({
        fingerprint: draft.source.fingerprint,
        changes,
      });
      // A cancelled save dialog is a decision, not a failure, and must not
      // shout — the same rule step 1 follows for a cancelled open dialog.
      if (res.errorCode !== 'cancelled') setResult(res);
      if (res.ok) onExported(res);
    } catch (err) {
      setResult({ ok: false, errorCode: 'io', error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!isPackage) {
    return <p className="muted wb-apply-nofile">{t('ankiWorkbench.apply.noFile')}</p>;
  }

  return (
    <div className="wb-apply">
      <section aria-label={t('ankiWorkbench.step.apply')}>
        {blocked ? (
          <p className="deck-workbench-error" role="alert">
            {t('ankiWorkbench.apply.blocked')}
          </p>
        ) : (
          <>
            {empty ? (
              <p className="muted wb-apply-empty">{t('ankiWorkbench.apply.empty')}</p>
            ) : (
              <ul className="deck-workbench-facts">
                {changes.notes.length > 0 && (
                  <li>{t('ankiWorkbench.apply.notes', { count: changes.notes.length })}</li>
                )}
                {changes.cardMoves.length > 0 && (
                  <li>{t('ankiWorkbench.apply.cardMoves', { count: changes.cardMoves.length })}</li>
                )}
              </ul>
            )}
            <p className="muted">{t('ankiWorkbench.apply.original')}</p>
            <button
              type="button"
              className="btn primary wb-apply-export"
              disabled={empty || busy}
              onClick={() => void runExport()}
            >
              {t('ankiWorkbench.apply.export')}
            </button>
            {busy && (
              <p className="muted" role="status">
                {t('ankiWorkbench.apply.writing')}
              </p>
            )}
          </>
        )}
      </section>

      {result && result.ok && (
        <section className="wb-apply-result" aria-label={t('ankiWorkbench.apply.export')} role="status">
          <ul className="deck-workbench-facts">
            {/* The path is the user's own save choice, echoed back — the one
                place in the workbench a full path is deliberately shown. */}
            <li>{t('ankiWorkbench.apply.ok.file', { path: result.filePath ?? '' })}</li>
            <li>
              {t('ankiWorkbench.apply.ok.counts', {
                notes: result.notesUpdated ?? 0,
                cards: result.cardsUpdated ?? 0,
              })}
            </li>
            {result.verified && <li>{t('ankiWorkbench.apply.ok.verified')}</li>}
          </ul>
        </section>
      )}

      {result && !result.ok && (
        <div className="wb-apply-result">
          <p className="deck-workbench-error" role="alert">
            {t(`ankiWorkbench.apply.error.${result.errorCode ?? 'io'}`)}
          </p>
          {/* The adapter's own words, for a report — never instead of the
              translated line above. */}
          {result.error && <p className="muted wb-apply-error-detail">{result.error}</p>}
        </div>
      )}
    </div>
  );
}
