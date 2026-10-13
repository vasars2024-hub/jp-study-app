// onb3: first-run setup follow-ups and translated error text for the manga
// reader and the visual-novel panels. — Russian.

import type { Catalog } from '../core';

export const ONB3_UI_RU: Catalog = {
  'onb3.dl.builtInSettingUpDesc':
    'Японско-английский словарь входит в приложение и сейчас настраивается. Скачивать ничего не нужно.',
  'onb3.dl.builtInSettingUp': 'Настройка, {percent}%',
  'onb3.dl.builtInSettingUpIndeterminate': 'Настройка…',
  'onb3.finish.blancTour':
    'Экскурсия показывает рабочий стол Study OS. Blanc открывается в отдельном окне, поэтому экскурсия ждёт в справке, когда она вам понадобится.',

  'onb3.manga.pageMissing': 'Этой страницы больше нет в библиотеке. Откройте мангу заново и повторите сканирование.',
  'onb3.manga.regionTooSmall': 'Область слишком мала для распознавания. Выделите текст рамкой побольше.',
  'onb3.manga.phase.ocr': 'Распознавание текста',
  'onb3.manga.phase.translate': 'Перевод',

  'onb3.vn.scanFailed': 'Не удалось просканировать папку.',
  'onb3.vn.analyzeFailed': 'Не удалось разобрать эту строку.',
  'onb3.vn.agent.addFailed': 'Не удалось добавить визуальную новеллу.',
  'onb3.vn.agent.routesFailed': 'Не удалось сохранить рут.',
  'onb3.vn.agent.captureFailed': 'Не удалось сохранить захваченную строку.',
};
