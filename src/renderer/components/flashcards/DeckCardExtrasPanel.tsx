/**
 * One deck card's saved extras, opened from its row in a deck list — the Study
 * OS / WIRED deck overview (`FlashcardsContent.tsx`), the Aero deck browser
 * (`views/FlashcardsView.tsx`) and Blanc's Deck tool (`BlancShell.tsx`) — so the
 * three lists open the same panel rather than three copies of it.
 *
 * Not an AI surface: what it shows (memory aid, "not to confuse with" note, kept
 * example sentences, accepted answers) is the learner's own, approved data, so
 * it opens and edits with AI off. Only the AI "Generate" action inside
 * `AiCardExtras` is a `data-ai-entry`.
 */
import { Suspense } from 'react';
import type { DeckFlashcard } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { cardContentLang } from '../../studyEnvironment';
import Icon from '../Icons';
import { LazyAiCardExtras } from './aiStudyEntry';
import './DeckCardExtrasPanel.css';

export type DeckCardExtrasCard = Pick<DeckFlashcard, 'id' | 'word' | 'meaning'> & Partial<Pick<DeckFlashcard, 'back' | 'studyLang'>>;

export default function DeckCardExtrasPanel({
  card,
  onClose,
  className = '',
}: {
  card: DeckCardExtrasCard;
  onClose: () => void;
  className?: string;
}) {
  const { t } = useT();
  return (
    <section
      className={`flash-card-extras-host${className ? ` ${className}` : ''}`}
      data-deck-card-extras={card.id}
      aria-label={t('aiStudy.extras.panel', { word: card.word })}
    >
      <div className="flash-strip-head">
        <strong lang={cardContentLang(card)}>{card.word}</strong>
        <span className="muted">{card.meaning || card.back || ''}</span>
        <button
          type="button"
          className="btn small"
          aria-label={t('aiStudy.close')}
          title={t('aiStudy.close')}
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <Suspense fallback={null}>
        <LazyAiCardExtras key={card.id} cardId={card.id} inDeckPanel />
      </Suspense>
    </section>
  );
}
