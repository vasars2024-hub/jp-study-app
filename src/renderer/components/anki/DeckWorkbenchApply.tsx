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
 * A local deck is the fourth: it writes the edited fields back into the app's
 * own flashcards (`DeckWorkbenchLocalApply`), never into Anki.
 *
 * Gate 8's second clause lives here too: once something HAS been written, the
 * draft's undo is powerless, so a successful commit leaves a record and the
 * panel below it offers to put that commit back. The reversal is an ordinary
 * change set on the same IPC against the fingerprint the commit produced — the
 * main process already remembers the file it wrote by that fingerprint, so the
 * renderer still never holds a path.
 */
import { useMemo, useRef, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import type { AnkiDraftEditJournal } from '../../../shared/ankiDraftEdit';
import {
  buildApkgExportChanges,
  exportChangesEmpty,
  type ApkgExportResult,
} from '../../../shared/ankiApkgExport';
import {
  buildCommitRecord,
  buildCommitReversal,
  type AnkiCommitRecord,
} from '../../../shared/ankiCommitReversal';
import type { AnkiCsvExportResult } from '../../../shared/ankiCsvExport';
import type { ConnectCommitResult } from '../../../shared/ankiConnectCommit';
import DeckWorkbenchParity from './DeckWorkbenchParity';
import DeckWorkbenchLocalApply from './DeckWorkbenchLocalApply';
import { useT } from '../../i18n';

/** What a reversal reports, from either destination's own result shape. */
interface ReverseOutcome {
  ok: boolean;
  notes: number;
  cards: number;
  errorCode?: string;
  error?: string;
}

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
  /**
   * The last successful commit, kept for the reversal panel. Session-only and
   * said so in `reverse.oneWay`: persisting it would promise a reversal across a
   * restart that the destination's fingerprint can no longer honour.
   */
  const [record, setRecord] = useState<AnkiCommitRecord | null>(null);
  const [reversed, setReversed] = useState<ReverseOutcome | null>(null);
  const [reversing, setReversing] = useState(false);

  // Recomputed on every edit or undo, exactly as the review's numbers are: an
  // undo run from this step must change what the button claims it will write.
  const changes = useMemo(() => buildApkgExportChanges(draft, journal), [draft, journal]);
  const empty = exportChangesEmpty(changes);
  const blocked = draft.diagnostics.some((d) => d.severity === 'blocking');
  const isPackage = draft.source.kind === 'apkg' || draft.source.kind === 'colpkg';
  const isLive = draft.source.kind === 'ankiconnect';
  const isText = draft.source.kind === 'csv';

  /**
   * The token the Stop button names. Held in a ref rather than state because the
   * cancel must reach the commit that is running RIGHT NOW — a state update is a
   * render behind, and this is the one control where being a render behind means
   * cancelling nothing while the writes continue.
   */
  const commitIdRef = useRef<string | null>(null);
  const [stopping, setStopping] = useState(false);

  /**
   * The record is built from the change set that was SENT, so it cannot describe
   * a different commit. `fingerprint` is the destination's state AFTER the write
   * — reversing against the pre-commit one would target the untouched original.
   */
  const recordOf = (
    destination: 'package' | 'live',
    label: string,
    fingerprint: string | undefined,
  ): AnkiCommitRecord | null =>
    fingerprint
      ? buildCommitRecord({
          id: `commit:${Date.now()}`,
          at: new Date().toISOString(),
          destination,
          label,
          fingerprint,
          draft,
          journal,
          committed: changes,
        })
      : null;

  const reversal = useMemo(() => (record ? buildCommitReversal(record) : null), [record]);

  const runReverse = async () => {
    if (!record || !reversal || reversal.empty) return;
    setReversing(true);
    setReversed(null);
    try {
      if (record.destination === 'live') {
        const res = await window.api.commitAnkiConnectDraft({
          fingerprint: record.fingerprint,
          changes: reversal.changes,
          commitId: `connect-reverse:${record.id}`,
        });
        setReversed({
          ok: res.ok,
          notes: res.notesUpdated ?? 0,
          cards: res.cardsUpdated ?? 0,
          errorCode: res.errorCode,
          error: res.error,
        });
      } else {
        // No `sourcePath`: the main process remembered the file it wrote under
        // this fingerprint, so the renderer still never names a path to write.
        const res = await window.api.exportApkgDraft({
          fingerprint: record.fingerprint,
          changes: reversal.changes,
        });
        if (res.errorCode === 'cancelled') return;
        setReversed({
          ok: res.ok,
          notes: res.notesUpdated ?? 0,
          cards: res.cardsUpdated ?? 0,
          errorCode: res.errorCode,
          error: res.error,
        });
      }
    } catch (err) {
      setReversed({
        ok: false,
        notes: 0,
        cards: 0,
        errorCode: 'io',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setReversing(false);
    }
  };

  /**
   * Rendered under a successful commit on both writing destinations. It states
   * what would go back BEFORE the button, and names every committed operation
   * that cannot — a refusal here is the gate's "clearly explain any adapter
   * operation that cannot be reversed", not an error after the fact.
   */
  const reversePanel = () => {
    if (!record || !reversal) return null;
    const errorPrefix =
      record.destination === 'live'
        ? 'ankiWorkbench.apply.liveError'
        : 'ankiWorkbench.apply.error';
    return (
      <section className="wb-apply-reverse" aria-label={t('ankiWorkbench.apply.reverse.title')}>
        <p className="muted wb-apply-oneway">{t('ankiWorkbench.apply.reverse.oneWay')}</p>
        {reversal.empty ? (
          <p className="muted wb-apply-reverse-empty">{t('ankiWorkbench.apply.reverse.empty')}</p>
        ) : (
          <ul className="deck-workbench-facts wb-apply-reverse-facts">
            {reversal.counts.notes > 0 && (
              <li>{t('ankiWorkbench.apply.reverse.notes', { count: reversal.counts.notes })}</li>
            )}
            {reversal.counts.cards > 0 && (
              <li>{t('ankiWorkbench.apply.reverse.cards', { count: reversal.counts.cards })}</li>
            )}
            {reversal.counts.decks > 0 && (
              <li>{t('ankiWorkbench.apply.reverse.decks', { count: reversal.counts.decks })}</li>
            )}
            {reversal.counts.templates > 0 && (
              <li>
                {t('ankiWorkbench.apply.reverse.templates', {
                  count: reversal.counts.templates,
                })}
              </li>
            )}
          </ul>
        )}
        {reversal.refusals.length > 0 && (
          <ul className="deck-workbench-facts wb-apply-reverse-refusals">
            {reversal.refusals.map((refusal) => (
              <li key={`${refusal.code}-${refusal.subject}`}>
                {t(`ankiWorkbench.apply.reverse.refused.${refusal.code}`, {
                  subject: refusal.subject,
                  count: refusal.count ?? 0,
                })}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="btn wb-apply-reverse"
          disabled={reversal.empty || reversing || busy}
          onClick={() => void runReverse()}
        >
          {t('ankiWorkbench.apply.reverse.button')}
        </button>
        {reversing && (
          <p className="muted" role="status">
            {t('ankiWorkbench.apply.reverse.working')}
          </p>
        )}
        {reversed && reversed.ok && (
          <p className="wb-apply-reverse-ok" role="status">
            {t('ankiWorkbench.apply.reverse.ok', {
              notes: reversed.notes,
              cards: reversed.cards,
            })}
          </p>
        )}
        {reversed && !reversed.ok && (
          <>
            <p className="deck-workbench-error" role="alert">
              {t(`${errorPrefix}.${reversed.errorCode ?? 'io'}`)}
            </p>
            {reversed.error && <p className="muted wb-apply-error-detail">{reversed.error}</p>}
          </>
        )}
      </section>
    );
  };

  const runCommit = async () => {
    const commitId = `connect-commit:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    commitIdRef.current = commitId;
    setBusy(true);
    setStopping(false);
    setCommit(null);
    try {
      const res = await window.api.commitAnkiConnectDraft({
        fingerprint: draft.source.fingerprint,
        changes,
        commitId,
      });
      setCommit(res);
      // A cancelled commit wrote SOME of the change set, and the record folds the
      // whole of it — reversing that would write back values the destination
      // never received. Only a clean commit leaves a record.
      if (res.ok) setRecord(recordOf('live', res.profile ?? draft.source.label, res.fingerprint));
    } catch (err) {
      setCommit({ ok: false, errorCode: 'io', error: err instanceof Error ? err.message : String(err) });
    } finally {
      commitIdRef.current = null;
      setBusy(false);
      setStopping(false);
    }
  };

  /**
   * Asks the main process to stop after the write it is in. It cannot un-send
   * one, so the button says "stop", never "cancel" — and the result that comes
   * back reports what did land instead of pretending the batch never happened.
   */
  const stopCommit = () => {
    const commitId = commitIdRef.current;
    if (!commitId) return;
    setStopping(true);
    void window.api.cancelAnkiConnectCommit(commitId);
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
      if (res.ok) {
        onExported(res);
        // The written package, not the untouched original: `res.fingerprint` is
        // the new file's, and main remembers the path under exactly that key.
        setRecord(recordOf('package', res.fileName ?? '', res.fingerprint));
      }
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
                <>
                  <p className="muted" role="status">
                    {t('ankiWorkbench.apply.live.writing')}
                  </p>
                  <button
                    type="button"
                    className="btn wb-apply-stop"
                    disabled={stopping}
                    onClick={stopCommit}
                  >
                    {t('ankiWorkbench.apply.live.stop')}
                  </button>
                  {/* Said next to the button, not after the fact: this is the
                      one stop in the workbench that leaves writes behind. */}
                  <p className="muted wb-apply-stop-note">
                    {t(`ankiWorkbench.apply.live.${stopping ? 'stopping' : 'stopHint'}`)}
                  </p>
                </>
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
            {/* A stopped commit's numbers are the answer, not a footnote: some
                of the change set is in the user's collection and the rest is
                not, and `unwritten` is what Anki's own re-read still could not
                find — never `planned - sent`, which would be a guess. */}
            {commit.errorCode === 'cancelled' && (
              <ul className="deck-workbench-facts wb-apply-cancelled">
                <li>
                  {t('ankiWorkbench.apply.live.cancelled.written', {
                    notes: commit.notesUpdated ?? 0,
                    cards: commit.cardsUpdated ?? 0,
                    profile: commit.profile ?? draft.source.label,
                  })}
                </li>
                {commit.unwritten !== undefined && (
                  <li>
                    {t('ankiWorkbench.apply.live.cancelled.unwritten', {
                      count: commit.unwritten,
                    })}
                  </li>
                )}
              </ul>
            )}
            {/* A partial commit is the one state a total would hide: some
                changes are in the user's collection and some are not, so each
                one that failed is named with Anki's own words. */}
            {commit.failures && commit.failures.length > 0 && (
              <ul className="deck-workbench-facts wb-apply-failures">
                {commit.failures.map((failure) => (
                  <li key={`${failure.kind}-${failure.id}`}>
                    {failure.code === 'preset-not-applied'
                      ? t('ankiWorkbench.apply.live.failed.preset', { id: failure.id, deck: failure.deck ?? '' })
                      : t(`ankiWorkbench.apply.live.failed.${failure.kind}`, {
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

        {/* Gated on the RECORD, not on the last result: it describes what was
            written, and a commit that refused or stopped leaves none. */}
        {reversePanel()}
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
              {/* The field-level marker the user reviewed became a note-level
                  one, which is a real downgrade of what they approved. It is
                  stated on the success panel rather than left for them to
                  notice a missing highlight on the card. */}
              {(textResult.provenanceTagged ?? 0) > 0 && (
                <li>
                  {t('ankiWorkbench.apply.text.ok.provenance', {
                    count: textResult.provenanceTagged ?? 0,
                  })}
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

  if (draft.source.kind === 'local-deck') {
    return <DeckWorkbenchLocalApply draft={draft} journal={journal} />;
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
            {/* Rendered only when a swap was part of it. Without this line a
                change set of nothing but a front/back swap reports "0 notes and
                0 cards", which reads as an export that did nothing. */}
            {(result.templatesFormatted ?? 0) > 0 && (
              <li>
                {t('ankiWorkbench.apply.ok.templatesFormatted', {
                  count: result.templatesFormatted ?? 0,
                })}
              </li>
            )}
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

      {/* Gated on the RECORD, not on the last result: it describes what was
          written, and an export that refused leaves none. */}
      {reversePanel()}
    </div>
  );
}
