// The manga reader's automatic OCR: the auto-read toggle and the scan's
// progress lines. A lazy pack (renderer/mangaOcrUiStrings.ts) — English is the
// source of truth and the fallback.

import type { Catalog } from '../core';

export const MANGA_OCR_UI_EN: Catalog = {
  'mangaOcrUi.autoOcr': 'Read each page automatically',
  'mangaOcrUi.autoOcr.hint':
    'Reads the text of each page as you open it, and the next page ahead, so you can point at a word right away. Each page is read once and kept.',
  'mangaOcrUi.phase.loading': 'Starting the text reader…',
  'mangaOcrUi.phase.detect': 'Finding the text on the page…',
  'mangaOcrUi.phase.read': 'Reading bubble {current} of {total}…',
  'mangaOcrUi.models.autoOffer':
    'Pages are read automatically once the Manga OCR models are installed. They download once and work offline.',
};
