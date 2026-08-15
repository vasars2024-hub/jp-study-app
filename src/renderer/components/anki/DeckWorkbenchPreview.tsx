/**
 * The representative card preview — Phase 2's last shell piece, and the surface
 * half of acceptance gate 13.
 *
 * Everything it shows comes from `shared/ankiTemplateRender.ts`, which renders
 * the card the way Anki generates it. This file only chooses what to look at:
 * which sibling card, which side, which viewport and which theme — the four axes
 * the plan asks the preview to catch a failure on before Apply.
 *
 * Two rules this file exists to keep:
 *
 * - **The rendered HTML is untrusted.** It comes out of a foreign package and
 *   may carry `<script>`, a remote `<img>` beacon or a full-page overlay. It goes
 *   into a `sandbox=""` iframe — no scripts, no same-origin, no navigation — and
 *   never into `dangerouslySetInnerHTML`. That is the only reason it is safe to
 *   render a stranger's deck at all.
 * - **A problem is shown, not counted.** "3 issues" tells a user nothing they can
 *   act on, so every problem prints its own sentence naming the field, filter or
 *   file involved.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft, AnkiDraftNote } from '../../../shared/ankiDraft';
import {
  noteLevelProblems,
  renderNoteCards,
  type AnkiRenderProblem,
  type RenderedAnkiCard,
} from '../../../shared/ankiTemplateRender';
import { useT } from '../../i18n';

type PreviewSide = 'question' | 'answer';
type PreviewViewport = 'desktop' | 'compact';
type PreviewTheme = 'light' | 'dark';

/** Anki's own default card colours, so a deck's CSS lands on the background it expects. */
const THEME_CSS: Record<PreviewTheme, string> = {
  light: 'background:#ffffff;color:#000000;',
  dark: 'background:#2f2f31;color:#fbfbfb;',
};

function frameDocument(html: string, css: string, theme: PreviewTheme): string {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    // A foreign template may reference a remote stylesheet or font; the CSP keeps
    // the preview offline rather than letting a deck phone home on render.
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ',
    "img-src data:; style-src 'unsafe-inline'; font-src data:\">",
    `<style>html,body{margin:0;padding:12px;${THEME_CSS[theme]}}`,
    `.card{${THEME_CSS[theme]}}`,
    css,
    '</style></head><body><div class="card">',
    html,
    '</div></body></html>',
  ].join('');
}

function ProblemLine({ problem }: { problem: AnkiRenderProblem }) {
  const { t } = useT();
  const text = t(`ankiWorkbench.preview.problem.${problem.code}`, {
    detail: problem.detail ?? '',
  });
  // A note-level problem has no side, and appending an empty parenthesis to it
  // would read as a missing value rather than as "this is about the note".
  const side =
    problem.side === 'note' ? '' : ` (${t(`ankiWorkbench.preview.side.${problem.side}`)})`;
  return (
    <li className="wb-preview-problem">
      {text}
      {side}
    </li>
  );
}

export default function DeckWorkbenchPreview({
  draft,
  note,
}: {
  draft: AnkiDraft;
  note: AnkiDraftNote;
}) {
  const { t } = useT();
  const [cardIndex, setCardIndex] = useState(0);
  const [side, setSide] = useState<PreviewSide>('question');
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');
  const [theme, setTheme] = useState<PreviewTheme>('light');

  // Re-renders on every field edit by design: the whole point of the panel is
  // that a blank side appears the moment the edit that blanked it commits.
  const cards: RenderedAnkiCard[] = useMemo(() => renderNoteCards(draft, note), [draft, note]);
  const noteProblems = useMemo(() => noteLevelProblems(draft, note), [draft, note]);

  // A cloze edit can remove the card that was being previewed; clamping beats
  // resetting, which would throw the user back to card 1 mid-edit.
  const active = cards[Math.min(cardIndex, cards.length - 1)];
  if (!active) return null;

  const problems = [...active.problems, ...noteProblems];
  const html = side === 'question' ? active.questionHtml : active.answerHtml;

  return (
    <section className="wb-preview" aria-label={t('ankiWorkbench.preview.title')}>
      <h4>{t('ankiWorkbench.preview.title')}</h4>

      {cards.length > 1 && (
        <div className="wb-preview-cards" role="tablist" aria-label={t('ankiWorkbench.preview.siblings')}>
          {cards.map((card, i) => (
            <button
              key={card.cardId}
              type="button"
              role="tab"
              aria-selected={i === cardIndex}
              className={`wb-preview-tab${i === cardIndex ? ' active' : ''}`}
              onClick={() => setCardIndex(i)}
            >
              {card.label}
              {card.problems.length > 0 && (
                <span className="wb-preview-tab-flag" aria-hidden="true">
                  !
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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
        <div role="group" aria-label={t('ankiWorkbench.preview.viewportGroup')}>
          {(['desktop', 'compact'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`btn${viewport === value ? ' primary' : ''}`}
              aria-pressed={viewport === value}
              onClick={() => setViewport(value)}
            >
              {t(`ankiWorkbench.preview.viewport.${value}`)}
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

      <div className={`wb-preview-stage ${viewport}`}>
        <iframe
          className="wb-preview-frame"
          title={t('ankiWorkbench.preview.frameTitle', { card: active.label })}
          // No scripts, no origin, no navigation: a foreign deck's template runs
          // nothing. See the file comment.
          sandbox=""
          srcDoc={frameDocument(html, active.css, theme)}
        />
      </div>

      {problems.length === 0 ? (
        <p className="muted">{t('ankiWorkbench.preview.clean')}</p>
      ) : (
        <ul className="wb-preview-problems" aria-label={t('ankiWorkbench.preview.problems')}>
          {problems.map((problem) => (
            <ProblemLine
              key={`${problem.code}:${problem.side}:${problem.detail ?? ''}`}
              problem={problem}
            />
          ))}
        </ul>
      )}

      <p className="muted wb-preview-hint">{t('ankiWorkbench.preview.hint')}</p>
    </section>
  );
}
