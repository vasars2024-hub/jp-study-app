import type { Catalog } from '../core';

export const LENS_OCR_UI_RU: Catalog = {
  'lensOcr.stage.refining': 'Внимательнее распознаю мелкий текст…',
  'lensOcr.stage.basic': 'Распознаю встроенным модулем… {percent}%',
  'lensOcr.cancel': 'Отмена',
  'lensOcr.cancelHint': 'Остановить распознавание и выбрать область заново. Esc закрывает линзу.',

  'lensOcr.cached': 'Мгновенно',
  'lensOcr.cachedHint': 'Это же изображение было распознано только что, поэтому результат взят повторно.',

  'lensOcr.basic.badge': 'Базовое OCR',
  'lensOcr.basic.badgeHint': 'Распознано встроенным в приложение модулем, без загрузки.',
  'lensOcr.basic.notice': 'Распознано встроенным офлайн-модулем, потому что точная модель не установлена. Чёткий текст он читает хорошо; для стилизованного, очень мелкого или размытого текста установите модель.',

  // ---- Watch region ----
  'lensOcr.watch.start': 'Следить',
  'lensOcr.watch.startHint': 'Оставить эту область и самой перечитывать её, как только текст меняется (окно текста визуальной новеллы или игры).',
  'lensOcr.watch.selectHint': 'Обведите окно текста, за которым следить',
  'lensOcr.watch.panel': 'Отслеживаемая область',
  'lensOcr.watch.active': 'Слежу за этой областью',
  'lensOcr.watch.reading': 'Читаю новый текст…',
  'lensOcr.watch.empty': 'Сейчас в области нет текста.',
  'lensOcr.watch.waiting': 'Текст появится здесь, как только он сменится.',
  'lensOcr.watch.stop': 'Перестать следить',
  'lensOcr.watch.stopHint': 'Больше не перечитывать эту область. Последнее прочитанное останется здесь, пока Лупа открыта.',
};
