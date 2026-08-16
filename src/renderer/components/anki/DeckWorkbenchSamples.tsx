/**
 * The representative-card gallery — the second half of acceptance gate 13.
 *
 * The Browser's spreadsheet shows the notes a user searched for. This shows the
 * cards a user would never think to search for: the blank one, the longest one,
 * the one whose media is missing, every sibling of a cloze note, the duplicate.
 * `buildRepresentativeSample` picks them; this renders them side by side so a
 * rendering failure is visible before Apply rather than after it.
 *
 * The honesty rule this surface turns on: a sample set is a claim about a deck.
 * So it says how far the scan actually got, and it names the cases it could not
 * find rather than quietly presenting eight cards as full coverage.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  buildRepresentativeSample,
  type SampleCase,
} from '../../../shared/ankiTemplateRender';
import { useT } from '../../i18n';
import { previewFrameDocument, type PreviewTheme } from './ankiPreviewFrame';
import { ProblemLine } from './DeckWorkbenchPreview';

function SampleCard({
  sample,
  side,
  theme,
  onOpen,
}: {
  sample: SampleCase;
  side: 'question' | 'answer';
  theme: PreviewTheme;
  onOpen?: () => void;
}) {
  const { t } = useT();
  const { render } = sample;
  const html = side === 'question' ? render.questionHtml : render.answerHtml;

  return (
    <li className="wb-sample">
      <div className="wb-sample-head">
        <span className="wb-sample-reasons">
          {sample.reasons.map((reason) => (
            <span key={reason} className={`wb-sample-reason ${reason}`}>
              {t(`ankiWorkbench.samples.reason.${reason}`)}
            </span>
          ))}
        </span>
        <span className="muted">{render.label}</span>
      </div>

      <iframe
        className="wb-sample-frame"
        title={t('ankiWorkbench.preview.frameTitle', { card: render.label })}
        sandbox=""
        srcDoc={previewFrameDocument(html, render.css, theme)}
      />

      {render.problems.length === 0 ? (
        <p className="muted">{t('ankiWorkbench.preview.clean')}</p>
      ) : (
        <ul className="wb-preview-problems">
          {render.problems.map((problem) => (
            <ProblemLine
              key={`${problem.code}:${problem.side}:${problem.detail ?? ''}`}
              problem={problem}
            />
          ))}
        </ul>
      )}

      {onOpen && (
        <button type="button" className="btn" onClick={onOpen}>
          {t('ankiWorkbench.samples.open')}
        </button>
      )}
    </li>
  );
}

export default function DeckWorkbenchSamples({
  draft,
  totalNotes,
  onOpenNote,
}: {
  draft: AnkiDraft;
  /** Notes in the whole source, which may exceed the page held in `draft`. */
  totalNotes: number;
  /** Absent on step 6, where there is no Browser to open the note into —
   *  offering a button that navigates nowhere would be a dead control. */
  onOpenNote?: (noteId: string) => void;
}) {
  const { t } = useT();
  const [side, setSide] = useState<'question' | 'answer'>('question');
  const [theme, setTheme] = useState<PreviewTheme>('light');

  // Rebuilt on every edit by design: the whole point is that a sample stops
  // being clean the moment an edit breaks it.
  const sample = useMemo(() => buildRepresentativeSample(draft), [draft]);

  if (sample.cases.length === 0) {
    return <p className="muted">{t('ankiWorkbench.samples.empty')}</p>;
  }

  // Two separate truths, and conflating them is the lie this surface avoids:
  // the sampler may have been capped, and the draft itself may be one page.
  const scannedWhole = sample.scannedNotes >= draft.counts.notes;
  const wholeSource = draft.counts.notes >= totalNotes;

  return (
    <section className="wb-samples" aria-label={t('ankiWorkbench.samples.title')}>
      <div className="wb-samples-head">
        <div>
          <h4>{t('ankiWorkbench.samples.title')}</h4>
          <p className="muted">{t('ankiWorkbench.samples.lead')}</p>
        </div>
        <div className="wb-preview-controls">
          <div role="group" aria-label={t('ankiWorkbench.preview.sideGroup')}>
            {(['question', 'answer'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`btn${side === value ? ' primary' : ''}`}
                aria-pressed={side === value}
                onClick={() => setSide(value)}
              >
                {t(`ankiWorkbench.preview.side.${value}`)}
              </button>
            ))}
          </div>
          <div role="group" aria-label={t('ankiWorkbench.preview.themeGroup')}>
            {(['light', 'dark'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`btn${theme === value ? ' primary' : ''}`}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                {t(`ankiWorkbench.preview.theme.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="muted">
        {scannedWhole && wholeSource
          ? t('ankiWorkbench.samples.scannedAll', { scanned: sample.scannedNotes })
          : t('ankiWorkbench.samples.scannedPartial', {
              scanned: sample.scannedNotes,
              total: totalNotes,
            })}
      </p>

      {sample.absentReasons.length > 0 && (
        <p className="muted">
          {t('ankiWorkbench.samples.absent', {
            reasons: sample.absentReasons
              .map((reason) => t(`ankiWorkbench.samples.reason.${reason}`))
              .join(', '),
          })}
        </p>
      )}

      <ul className="wb-sample-grid">
        {sample.cases.map((item) => (
          <SampleCard
            key={`${item.noteId}:${item.cardOrd}`}
            sample={item}
            side={side}
            theme={theme}
            onOpen={onOpenNote && (() => onOpenNote(item.noteId))}
          />
        ))}
      </ul>
    </section>
  );
}
