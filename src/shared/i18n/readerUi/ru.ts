// Novel/manga reader, dictionary popup and reader mining chrome (round-2 reader pass). — Russian. See ./en.ts for scope.

import type { Catalog } from '../core';

export const READER_UI_RU: Catalog = {
  'readerUi.dictPopup.aria': 'Словарь: {query}',
  'readerUi.dictPopup.levels': 'Насколько хорошо вы знаете это слово',
  'readerUi.dictPopup.mine': 'Собрать',
  'reader.pdf.page': 'Страница {page}',
  'reader.pdf.blankPage': '(На странице {page} нет текста)',
  'readerUi.dictPopup.mineTitle': 'Сохранить слово и предложение в коллекцию читалки',
  'readerUi.lookup.noSelection': 'Выделите слово или наведите указатель на слово в тексте и нажмите сочетание клавиш ещё раз.',
  'readerUi.gloss.langs': 'Языки значений',
  'readerUi.gloss.otherHidden': 'Значения на других языках скрыты. Включите язык выше, чтобы их показать.',
  'readerUi.translate.popupAria': 'Перевод: {text}',
  'readerUi.translate.preparing': 'Подготовка переводчика…',
  'readerUi.translate.loadingModel': 'Загрузка модели… {pct}%',
  'readerUi.translate.translating': 'Перевод…',
  'readerUi.translate.to': 'Перевести на',
  'readerUi.translate.openAiSettings': 'Открыть настройки ИИ',
  'readerUi.study.askAgent': 'Спросить агента',
  'readerUi.study.askPassage': 'Спросить об абзаце',
  'readerUi.study.collection': 'Коллекция',
  'readerUi.manga.ocrAuto': 'Авто',
  'readerUi.manga.ocrAutoTitle': 'Определять вертикальный или горизонтальный текст по форме страницы или рамки',
  'readerUi.manga.drawBox': 'Выделить рамкой',
  'readerUi.manga.drawBoxTitle': 'Обведите текст на странице рамкой, чтобы распознать его',
  'readerUi.manga.drawBoxHint': 'Обведите рамкой текст, который нужно прочитать.',
  'readerUi.manga.handwriting': 'Рукописный ввод',
  'readerUi.manga.handwritingTitle': 'Нарисуйте иероглиф от руки, чтобы найти его',
};
