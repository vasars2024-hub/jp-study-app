/**
 * The flashcard surfaces' doors into the optional AI study helpers. Everything
 * behind them is lazy: the panels, their request hook and their stylesheet are
 * fetched the first time one is shown, so neither Study OS nor Blanc pays for
 * them at startup. (The card-extras chunk is also fetched on the first answer
 * reveal, AI on or off, because it shows what the learner already approved.)
 */
import { lazy } from 'react';
import type { DeckFlashcard } from '../../flashcardDeck';
import { ensureUiPack } from '../../i18n';
import type { AiWhyWrongCard } from './AiWhyWrongPanel';

/**
 * A panel's chunk together with the AI strings it renders (a lazy i18n pack,
 * `shared/i18n/catalogs.ts`), so the first paint after Suspense is real text
 * rather than placeholders. Both are fetched in parallel.
 */
function withAiStrings<T>(load: () => Promise<T>): Promise<T> {
  let strings: Promise<unknown> = Promise.resolve();
  try {
    strings = ensureUiPack('ai');
  } catch {
    // An i18n module mocked without it (a unit test): t() still asks on use.
  }
  return Promise.all([load(), strings]).then(([module]) => module);
}

export const LazyAiWhyWrongPanel = lazy(() => withAiStrings(() => import('./AiWhyWrongPanel')));
export const LazyAiCardExtras = lazy(() => withAiStrings(() => import('./AiCardExtras')));
export const LazyAiLeechRescuePanel = lazy(() => withAiStrings(() => import('./AiLeechRescuePanel')));

type CardLike = Pick<DeckFlashcard, 'id' | 'word' | 'reading' | 'meaning'>
  & Partial<Pick<DeckFlashcard, 'front' | 'back' | 'sentence' | 'studyLang'>>;

/**
 * The card a "Why was I wrong?" is about, from the cards the practice round was
 * dealt from (the host already holds them; no second deck read).
 */
export function whyWrongCardFor(cards: readonly CardLike[], cardId: string | undefined): AiWhyWrongCard | null {
  if (!cardId) return null;
  const card = cards.find((entry) => entry.id === cardId);
  if (!card) return null;
  const word = card.word || card.front || '';
  if (!word) return null;
  return {
    id: card.id,
    word,
    reading: card.reading || '',
    meaning: card.meaning || card.back || '',
    ...(card.sentence ? { sentence: card.sentence } : {}),
    ...(card.studyLang ? { studyLang: card.studyLang } : {}),
  };
}
