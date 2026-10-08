/**
 * Blanc's Cards tab.
 *
 * Its own module (it used to share BlancMediaPanels.tsx with the Media tab), so
 * opening Cards does not fetch the media library and study player, and opening
 * Media does not fetch the flashcard review, mining and CSV/AI stacks.
 *
 * Pillar 0 fix for the `flashcards` tab bail-out, which mounted `FlashcardsView`
 * (and therefore `AppChrome`) inside `BlancViewHost`. Composes the shared
 * `flashcards/FlashcardsContent` mode components in Blanc chrome. AI Studio is
 * hidden in Blanc (`hideAiStudio`), matching the old embed.
 *
 * Pillar 7: mining runs through the same `FlashcardMiningMode` (and thus the
 * same `EpubMiningPanel` / `JitenMiningPanel` and `flashcards:openEpubMining`
 * handoff) as Study OS — Blanc mines through the identical path.
 *
 * The mode components are full-screen replacements in Study OS; here they sit
 * inside `.blanc-flashcards-embed`, which gives the review card and deck
 * explorer a bounded, scrolling frame (see `theme/blanc-media.css`).
 */
import { useEffect, type ReactElement } from 'react';
import {
  FlashcardAiMode,
  FlashcardCsvMode,
  FlashcardDeckOverview,
  FlashcardMiningMode,
  FlashcardReviewMode,
  useFlashcards,
} from '../flashcards/FlashcardsContent';

export function BlancFlashcardsPanel({
  searchRequest,
}: {
  searchRequest?: { query: string; key: number } | null;
}) {
  const state = useFlashcards(true);
  const { setFolderFilter, setMode, setOverviewTab, setSearch } = state;

  useEffect(() => {
    if (!searchRequest?.query) return;
    setMode('overview');
    setOverviewTab('epub');
    setFolderFilter('all');
    setSearch(searchRequest.query);
  }, [searchRequest, setFolderFilter, setMode, setOverviewTab, setSearch]);

  let body: ReactElement;
  if (state.mode === 'review') body = <FlashcardReviewMode state={state} />;
  else if (state.mode === 'epub-mining') body = <FlashcardMiningMode state={state} />;
  else if (state.mode === 'csv-tool') body = <FlashcardCsvMode state={state} />;
  else if (state.mode === 'ai-studio') body = <FlashcardAiMode state={state} />;
  else body = <FlashcardDeckOverview state={state} />;

  return (
    <div className="blanc-tool-detail">
      <div className="blanc-flashcards-embed">{body}</div>
    </div>
  );
}
