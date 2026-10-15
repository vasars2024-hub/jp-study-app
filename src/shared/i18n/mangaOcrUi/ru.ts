// The manga reader's automatic OCR -- Russian. See ./en.ts for scope.
import type { Catalog } from '../core';

export const MANGA_OCR_UI_RU: Catalog = {
  'mangaOcrUi.autoOcr': 'Распознавать страницы автоматически',
  'mangaOcrUi.autoOcr.hint':
    'Распознаёт текст страницы при открытии и заранее — следующей, чтобы слово можно было сразу навести и посмотреть. Каждая страница распознаётся один раз и сохраняется.',
  'mangaOcrUi.phase.loading': 'Запуск распознавания текста…',
  'mangaOcrUi.phase.detect': 'Поиск текста на странице…',
  'mangaOcrUi.phase.read': 'Распознаётся реплика {current} из {total}…',
  'mangaOcrUi.models.autoOffer':
    'Страницы распознаются автоматически после установки моделей Manga OCR. Они загружаются один раз и работают без интернета.',
};
