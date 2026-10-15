// Novel reader extras (search, link import, coded errors) — Russian. See ./en.ts.
import type { Catalog } from '../core';

export const NOVEL_READER_UI_RU: Catalog = {
  'novelReaderUi.translate.autoFailed': 'Автоматический перевод не удался. Нажмите «Перевести», чтобы попробовать снова.',
  'novelReaderUi.link.importing': 'Импорт страницы в виде книги…',
  'novelReaderUi.link.saved': 'Сохранено в библиотеку: {title}',
  'novelReaderUi.link.openedInBrowser': '{reason} Вместо этого страница открыта в браузере.',
  'novelReaderUi.import.noArticle': 'На этой странице нет читаемой статьи, поэтому импортировать нечего.',
  'novelReaderUi.import.failed': 'Не удалось импортировать эту страницу. Попробуйте ещё раз чуть позже.',
  'novelReaderUi.import.wikiFailed': 'Википедия не прислала статью. Попробуйте ещё раз чуть позже.',
  'novelReaderUi.novels.jitenNetwork': 'Не удалось подключиться к Jiten. Проверьте соединение и попробуйте снова.',
  'novelReaderUi.novels.jitenHttp': 'Jiten ответил ошибкой {status}. Попробуйте позже.',
  'novelReaderUi.novels.jitenFailed': 'Не удалось загрузить каталог Jiten. Попробуйте позже.',
  'novelReaderUi.novels.sourcesFailed': 'Не удалось сохранить настройки источников. Проверьте адрес и ключ и попробуйте снова.',
  'novelReaderUi.search.open': 'Поиск по книге (Ctrl+F)',
  'novelReaderUi.search.aria': 'Поиск по этой книге',
  'novelReaderUi.search.placeholder': 'Искать в книге',
  'novelReaderUi.search.prev': 'Предыдущее совпадение',
  'novelReaderUi.search.next': 'Следующее совпадение',
  'novelReaderUi.search.count': '{current} из {total}',
  'novelReaderUi.search.none': 'Нет совпадений',
  'novelReaderUi.search.capped': 'Показаны только первые совпадения: {max}.',
  'novelReaderUi.search.ignoreWidth': 'Кана и ширина',
  'novelReaderUi.search.ignoreWidthTitle': 'Считать хирагану и катакану, а также полноширинные и обычные буквы и цифры одинаковыми',
  'novelReaderUi.search.results': 'Совпадения',
  'novelReaderUi.search.chapter': 'Часть {n}',
};
