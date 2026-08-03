import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import ReadingGarden from '../components/reading-garden/ReadingGarden';

const root = document.getElementById('root');
if (root) {
  const requestedStage = Number(new URLSearchParams(window.location.search).get('stage'));
  const stage = Number.isFinite(requestedStage)
    ? Math.min(50, Math.max(1, Math.floor(requestedStage)))
    : 1;
  createRoot(root).render(
    <StrictMode>
      <ReadingGarden
        previewProgress={{
          version: 2,
          pagesRead: (stage - 1) * 50,
          bankedPages: 0,
          stage,
          lastEvolutionDay: null,
          lastEvolutionAt: null,
          lastReadAt: null,
          lastBookId: null,
        }}
      />
    </StrictMode>,
  );
}
