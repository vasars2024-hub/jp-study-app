/**
 * Step 6 — "Review examples": the whole session as one reviewable claim.
 *
 * Everything on this surface was measured on the draft, and the surface says
 * so out loud: the numbers are a complete dry run because in this workbench
 * the dry run and the draft are the same object — nothing here has touched
 * Anki or a file, and Apply (step 7) is the first thing that will.
 *
 * The numbers come from `buildWorkbenchReview`, which nets the journal's
 * before-images against the draft's current bytes. That is deliberately not
 * the sum of the step outcomes: a field edited on step 4 and undone from
 * step 5, or written twice by two trays, must not be double-counted here of
 * all places. The one thing this step reports that is *not* pending is the
 * local-knowledge writes — those landed live when their tray was applied, and
 * pretending they wait for Apply would be the exact lie in the other
 * direction.
 */
import { useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import type { WorkbenchReviewSummary } from '../../../shared/ankiWorkbenchReview';
import { useT } from '../../i18n';
import DeckWorkbenchSamples from './DeckWorkbenchSamples';

function Value({ text }: { text: string }) {
  const { t } = useT();
  return text === '' ? (
    <em className="wb-review-empty-value">{t('ankiWorkbench.review.emptyValue')}</em>
  ) : (
    <span className="wb-review-value">{text}</span>
  );
}

export default function DeckWorkbenchReview({
  draft,
  summary,
  totalNotes,
  masteryWrites,
}: {
  draft: AnkiDraft;
  summary: WorkbenchReviewSummary;
  /** Notes in the whole source, which may exceed the page held in `draft`. */
  totalNotes: number;
  /** Local knowledge levels already written live by applied trays. */
  masteryWrites: number;
}) {
  const { t } = useT();
  const [diffsOpen, setDiffsOpen] = useState(false);

  return (
    <div className="wb-review">
      <section aria-label={t('ankiWorkbench.review.title')}>
        <h4>{t('ankiWorkbench.review.title')}</h4>
        <p className="muted">{t('ankiWorkbench.review.dryRun')}</p>

        {summary.totalDiffs === 0 && masteryWrites === 0 ? (
          <p className="muted">{t('ankiWorkbench.review.empty')}</p>
        ) : (
          <ul className="deck-workbench-facts">
            <li>
              {t('ankiWorkbench.review.changed', {
                count: summary.changedNotes,
                total: totalNotes,
              })}
            </li>
            {summary.fieldCounts.map(({ name, notes }) => (
              // Field names are the user's own data and are never translated.
              <li key={name}>{t('ankiWorkbench.review.field', { name, count: notes })}</li>
            ))}
            {summary.tagNotes > 0 && (
              <li>{t('ankiWorkbench.review.tags', { count: summary.tagNotes })}</li>
            )}
            {summary.cardMoves > 0 && (
              <li>{t('ankiWorkbench.review.cardMoves', { count: summary.cardMoves })}</li>
            )}
            {summary.cardDeckMoves > 0 && (
              <li>{t('ankiWorkbench.review.cardDeckMoves', { count: summary.cardDeckMoves })}</li>
            )}
            {summary.revertedNotes > 0 && (
              <li>{t('ankiWorkbench.review.reverted', { count: summary.revertedNotes })}</li>
            )}
            {summary.overwrites > 0 && (
              <li className="wb-review-overwrites">
                {t('ankiWorkbench.review.overwrites', { count: summary.overwrites })}
              </li>
            )}
            {masteryWrites > 0 && (
              <li>{t('ankiWorkbench.review.mastery', { count: masteryWrites })}</li>
            )}
          </ul>
        )}
        <p className="muted">{t('ankiWorkbench.review.cost')}</p>
      </section>

      {summary.totalDiffs > 0 && (
        <section aria-label={t('ankiWorkbench.review.diffs', { count: summary.totalDiffs })}>
          <button
            type="button"
            className="btn wb-review-diffs-toggle"
            aria-expanded={diffsOpen}
            onClick={() => setDiffsOpen((prev) => !prev)}
          >
            {t('ankiWorkbench.review.diffs', { count: summary.totalDiffs })}
          </button>
          {diffsOpen && (
            <>
              {summary.diffs.length < summary.totalDiffs && (
                <p className="muted">
                  {t('ankiWorkbench.review.diffsShown', {
                    shown: summary.diffs.length,
                    total: summary.totalDiffs,
                  })}
                </p>
              )}
              <ul className="wb-review-diff-list">
                {summary.diffs.map((line) => (
                  <li key={`${line.kind}:${line.noteId}:${line.fieldName ?? ''}`} className="wb-review-diff">
                    <span className="wb-review-diff-note">{line.noteLabel}</span>
                    <span className="wb-review-diff-where muted">
                      {line.kind === 'field'
                        ? line.fieldName
                        : line.kind === 'tags'
                          ? t('ankiWorkbench.review.tagsLabel')
                          : t('ankiWorkbench.review.queueLabel')}
                    </span>
                    <span className="wb-review-diff-change">
                      <Value text={line.before} />
                      <span aria-hidden="true"> → </span>
                      <Value text={line.after} />
                    </span>
                    {line.overwritten && (
                      <span className="wb-review-diff-flag">
                        {t('ankiWorkbench.review.overwrittenFlag')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <DeckWorkbenchSamples draft={draft} totalNotes={totalNotes} />
    </div>
  );
}
