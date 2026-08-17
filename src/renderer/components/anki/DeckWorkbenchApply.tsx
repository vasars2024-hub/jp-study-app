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
 * There are three destinations and they are not interchangeable. A package
 * source exports a NEW file and never touches the original. A live Anki source
 * has no file to copy: it writes into the collection the user has open, so that
 * branch says so before the button, reports the profile it landed in, and names
 * every change that did not commit rather than a single total. A CSV/TSV source
 * writes a new TEXT file — the same "never the original" rule as a package, but
 * with two things a package never has to say: a text file stores notes only, so
 * a card-level edit is refused by name rather than silently dropped, and without
 * a guid column the round trip is positional, which is stated before the button
 * because it decides whether the result merges in Anki or arrives as new notes.
 * A local deck is none of the three and offers no button at all.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import type { AnkiDraftEditJournal } from '../../../shared/ankiDraftEdit';
import {
  buildApkgExportChanges,
  exportChangesEmpty,
  type ApkgExportResult,
} from '../../../shared/ankiApkgExport';
import type { AnkiCsvExportResult } from '../../../shared/ankiCsvExport';
import type { ConnectCommitResult } from '../../../shared/ankiConnectCommit';
import DeckWorkbenchParity from './DeckWorkbenchParity';
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
  const [commit, setCommit] = useState<ConnectCommitResult | null>(null);
  const [textResult, setTextResult] = useState<AnkiCsvExportResult | null>(null);

  // Recomputed on every edit or undo, exactly as the review's numbers are: an
  // undo run from this step must change what the button claims it will write.
  const changes = useMemo(() => buildApkgExportChanges(draft, journal), [draft, journal]);
  const empty = exportChangesEmpty(changes);
  const blocked = draft.diagnostics.some((d) => d.severity === 'blocking');
  const isPackage = draft.source.kind === 'apkg' || draft.source.kind === 'colpkg';
  const isLive = draft.source.kind === 'ankiconnect';
  const isText = draft.source.kind === 'csv';

  const runCommit = async () => {
    setBusy(true);
    setCommit(null);
    try {
      const res = await window.api.commitAnkiConnectDraft({
        fingerprint: draft.source.fingerprint,
        changes,
      });
      setCommit(res);
    } catch (err) {
      setCommit({ ok: false, errorCode: 'io', error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const runTextExport = async () => {
    setBusy(true);
    setTextResult(null);
    try {
      const res = await window.api.exportAnkiCsvDraft({
        fingerprint: draft.source.fingerprint,
        changes,
      });
      // A cancelled save dialog is a decision, not a failure — same rule the
      // package branch follows.
      if (res.errorCode !== 'cancelled') setTextResult(res);
    } catch (err) {
      setTextResult({
        ok: false,
        errorCode: 'io',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

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

  if (isLive) {
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
              {/* Said before the button, not after it: this one has no undo on
                  our side, and the collection it edits is the one Anki has open. */}
              <p className="muted wb-apply-live-warning">
                {t('ankiWorkbench.apply.live.warning', { profile: draft.source.label })}
              </p>
              <button
                type="button"
                className="btn primary wb-apply-commit"
                disabled={empty || busy}
                onClick={() => void runCommit()}
              >
                {t('ankiWorkbench.apply.live.commit')}
              </button>
              {busy && (
                <p className="muted" role="status">
                  {t('ankiWorkbench.apply.live.writing')}
                </p>
              )}
            </>
          )}
          {/* Scoped to `connect`: this branch writes the collection Anki has
              open, where a deck rename and a template removal are refused. It
              is rendered even when the change set is empty, because "what will
              this never write" is a question asked before there is anything to
              write. */}
          <DeckWorkbenchParity destination="connect" />
        </section>

        {commit && commit.ok && (
          <section
            className="wb-apply-result"
            aria-label={t('ankiWorkbench.apply.live.commit')}
            role="status"
          >
            <ul className="deck-workbench-facts">
              <li>
                {t('ankiWorkbench.apply.live.ok.counts', {
                  notes: commit.notesUpdated ?? 0,
                  cards: commit.cardsUpdated ?? 0,
                  profile: commit.profile ?? draft.source.label,
                })}
              </li>
              {commit.verified && <li>{t('ankiWorkbench.apply.live.ok.verified')}</li>}
            </ul>
          </section>
        )}

        {commit && !commit.ok && (
          <div className="wb-apply-result">
            <p className="deck-workbench-error" role="alert">
              {t(`ankiWorkbench.apply.liveError.${commit.errorCode ?? 'io'}`)}
            </p>
            {/* A partial commit is the one state a total would hide: some
                changes are in the user's collection and some are not, so each
                one that failed is named with Anki's own words. */}
            {commit.failures && commit.failures.length > 0 && (
              <ul className="deck-workbench-facts wb-apply-failures">
                {commit.failures.map((failure) => (
                  <li key={`${failure.kind}-${failure.id}`}>
                    {t(`ankiWorkbench.apply.live.failed.${failure.kind}`, {
                      id: failure.id,
                      reason: failure.reason,
                    })}
                  </li>
                ))}
              </ul>
            )}
            {commit.error && <p className="muted wb-apply-error-detail">{commit.error}</p>}
          </div>
        )}
      </div>
    );
  }

  if (isText) {
    // One non-empty guid proves the file declares a `#guid column:` — it is a
    // file-level directive, so a single row settles it for the whole file. All
    // empty means either no such column or an empty one, and both are equally
    // unusable as identity, which is what the warning actually says.
    const hasGuid = draft.notes.some((note) => note.guid !== '');
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
                </ul>
              )}
              <p className="muted">{t('ankiWorkbench.apply.text.original')}</p>
              {/* Before the button: it decides whether the exported file merges
                  in Anki or arrives as a second copy of every note, and that is
                  not something to discover after the write. */}
              <p className="muted wb-apply-text-identity">
                {t(
                  hasGuid
                    ? 'ankiWorkbench.apply.text.identity.guid'
                    : 'ankiWorkbench.apply.text.identity.rowOrder',
                )}
              </p>
              <button
                type="button"
                className="btn primary wb-apply-text-export"
                disabled={empty || busy}
                onClick={() => void runTextExport()}
              >
                {t('ankiWorkbench.apply.text.export')}
              </button>
              {busy && (
                <p className="muted" role="status">
                  {t('ankiWorkbench.apply.text.writing')}
                </p>
              )}
            </>
          )}
        </section>

        {textResult && textResult.ok && (
          <section
            className="wb-apply-result"
            aria-label={t('ankiWorkbench.apply.text.export')}
            role="status"
          >
            <ul className="deck-workbench-facts">
              <li>{t('ankiWorkbench.apply.text.ok.file', { path: textResult.filePath ?? '' })}</li>
              <li>
                {t('ankiWorkbench.apply.text.ok.counts', {
                  notes: textResult.notesUpdated ?? 0,
                  rows: textResult.rowsWritten ?? 0,
                })}
              </li>
              {(textResult.tagsUpdated ?? 0) > 0 && (
                <li>
                  {t('ankiWorkbench.apply.text.ok.tags', { count: textResult.tagsUpdated ?? 0 })}
                </li>
              )}
              {textResult.verified && <li>{t('ankiWorkbench.apply.text.ok.verified')}</li>}
            </ul>
          </section>
        )}

        {textResult && !textResult.ok && (
          <div className="wb-apply-result">
            <p className="deck-workbench-error" role="alert">
              {t(`ankiWorkbench.apply.textError.${textResult.errorCode ?? 'io'}`)}
            </p>
            {/* The refused kinds by their contract names, so "undo them" names
                something the user can actually find rather than a total. */}
            {textResult.unsupported && textResult.unsupported.length > 0 && (
              <ul className="deck-workbench-facts wb-apply-unsupported">
                {textResult.unsupported.map((kind) => (
                  <li key={kind}>{kind}</li>
                ))}
              </ul>
            )}
            {textResult.error && <p className="muted wb-apply-error-detail">{textResult.error}</p>}
          </div>
        )}
      </div>
    );
  }

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
        {/* Scoped to `package`: this branch writes a NEW file, so both of the
            capabilities the live commit refuses are written here for real. */}
        <DeckWorkbenchParity destination="package" />
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
