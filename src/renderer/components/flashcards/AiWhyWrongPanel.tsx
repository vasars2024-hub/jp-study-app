/**
 * "Why was I wrong?" (docs/AI_AUDIT.md N1) — offered after an Again in review
 * and after a near-miss or wrong typed answer in Write and Learn.
 *
 * Opening it shows at once what the app can say on its own (similar cards in
 * the deck, the other card the typed answer belongs to, a typo), then asks the
 * configured AI engine for an explanation. When the model judges the typed
 * answer a valid synonym it offers "Accept my answer as correct" — a button, never
 * an automatic change: the card's accepted answers only grow when it is pressed.
 *
 * Lazy-loaded by its hosts; the whole panel is a `data-ai-entry`, so it is not
 * offered while "Use AI features" is off and the surfaces look as they did.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptedAnswerSide,
  pickWhyWrongNeighbours,
  whyWrongFallback,
  type WhyWrongDeckCard,
  type WhyWrongDirection,
  type WhyWrongResult,
  type WhyWrongVerdict,
} from '../../../shared/aiWhyWrong';
import { normalizeStudyLang } from '../../../shared/studyLang';
import { useAiReadiness } from '../../aiSetupClient';
import { addDeckCardAcceptedAnswer, loadDeck } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { cardContentLang } from '../../studyEnvironment';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';

export interface AiWhyWrongCard {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  studyLang?: string;
}

export interface AiWhyWrongPanelProps {
  card: AiWhyWrongCard;
  /** What was typed; omit for a flip-card review. */
  typed?: string;
  /** The canonical answer the surface showed. */
  expected?: string;
  direction: WhyWrongDirection;
  verdict: WhyWrongVerdict;
  /** Called after the learner accepted their typed answer for this card. */
  onAccepted?: (answer: string) => void;
}

function deckCardsLike(studyLang: string): WhyWrongDeckCard[] {
  try {
    return loadDeck()
      .filter((entry) => normalizeStudyLang(entry.studyLang) === studyLang)
      .map((entry) => ({ id: entry.id, word: entry.word || entry.front || '', reading: entry.reading || '', meaning: entry.meaning || entry.back || '' }))
      .filter((entry) => entry.word);
  } catch {
    return [];
  }
}

export default function AiWhyWrongPanel({ card, typed = '', expected, direction, verdict, onAccepted }: AiWhyWrongPanelProps) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState('');
  const request = useAiStudyRequest<WhyWrongResult>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const studyLang = normalizeStudyLang(card.studyLang);
  const expectedAnswer = expected ?? (direction === 'target-to-meaning' ? card.meaning : card.word);

  const self: WhyWrongDeckCard = useMemo(
    () => ({ id: card.id, word: card.word, reading: card.reading, meaning: card.meaning }),
    [card.id, card.word, card.reading, card.meaning],
  );
  // Read the deck only once the panel is opened: a review must not pay for it per card.
  const deck = useMemo(() => (open ? deckCardsLike(studyLang) : []), [open, studyLang]);
  const notes = useMemo(
    () => (open ? whyWrongFallback({ card: self, typed, expected: expectedAnswer, direction, deck }) : []),
    [open, self, typed, expectedAnswer, direction, deck],
  );

  const ask = (refresh = false): void => {
    const neighbours = pickWhyWrongNeighbours(self, deck).map(({ word, reading, meaning }) => ({ word, reading, meaning }));
    void request.run((requestId) => window.api.aiStudyWhyWrong({
      requestId,
      card: { word: card.word, reading: card.reading, meaning: card.meaning, sentence: card.sentence ?? '' },
      typed,
      expected: expectedAnswer,
      direction,
      verdict,
      neighbours,
      studyLang,
      answerLang: uiLang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  const aiUsable = ai.loaded && ai.enabled;

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    // The press that opened the panel is the request: no second click to ask.
    if (aiUsable && request.state.status === 'idle') ask();
  }, [open]);

  const side = acceptedAnswerSide(direction);
  const result = request.state.status === 'done' ? request.state.result : null;

  const accept = (): void => {
    const answer = typed.trim();
    if (!side || !answer) return;
    // False when it was already accepted: the outcome the learner asked for either way.
    const changed = addDeckCardAcceptedAnswer(card.id, side, answer);
    setAccepted(answer);
    if (changed) onAccepted?.(answer);
  };

  if (!open) {
    return (
      <div className="ai-study is-collapsed" data-ai-entry>
        <button
          type="button"
          className="btn small ai-study-btn"
          aria-expanded={false}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          {t('aiStudy.whyWrong.button')}
        </button>
      </div>
    );
  }

  return (
    <section
      className="ai-study ai-study-why"
      data-ai-entry
      aria-label={t('aiStudy.whyWrong.title')}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="ai-study-head">
        <h4 ref={headingRef} tabIndex={-1}>
          {t('aiStudy.whyWrong.title')}{' '}
          <span lang={cardContentLang(card)}>{card.word}</span>
        </h4>
        <button
          type="button"
          className="btn small ai-study-btn"
          aria-label={t('aiStudy.close')}
          title={t('aiStudy.close')}
          onClick={() => {
            request.reset();
            setOpen(false);
          }}
        >
          ×
        </button>
      </div>

      <p className="ai-study-section-label">{t('aiStudy.whyWrong.fromDeck')}</p>
      <ul className="ai-study-notes">
        {notes.map((note, index) => (
          <li key={`${note.kind}-${index}`}>{t(`aiStudy.whyWrong.note.${note.kind}`, note.vars)}</li>
        ))}
      </ul>

      {aiUsable && (
        <>
          <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiStudy.whyWrong.busy" />
          {result && (
            <div className="ai-study-answer" lang={uiLang}>
              <AiSuggestionBadge />
              <p>{result.explanation}</p>
              {result.tip && <p>{t('aiStudy.whyWrong.tip', { tip: result.tip })}</p>}
              {request.state.status === 'done' && request.state.cached && (
                <p className="muted ai-study-meta">{t('aiStudy.cached')}</p>
              )}
            </div>
          )}
          {result?.acceptable && side && typed.trim() && (
            accepted ? (
              <p className="ai-study-note" role="status">{t('aiStudy.whyWrong.accepted', { answer: accepted })}</p>
            ) : (
              <div className="ai-study-actions">
                <p className="ai-study-note">{t('aiStudy.whyWrong.acceptable', { reason: result.acceptableReason })}</p>
                <button type="button" className="btn small primary ai-study-btn" onClick={accept}>
                  {t('aiStudy.whyWrong.accept', { answer: typed.trim() })}
                </button>
              </div>
            )
          )}
          {request.state.status !== 'running' && (
            <div className="ai-study-actions">
              <button type="button" className="btn small ai-study-btn" onClick={() => ask(Boolean(result))}>
                {t(result ? 'aiStudy.askAgain' : 'aiStudy.whyWrong.ask')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
