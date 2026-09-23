// Watch-tracking library — Russian. See ./en.ts.
import type { Catalog } from '../core';

export const WATCH_LIBRARY_RU: Catalog = {
  'watchLibrary.status.watching': 'Смотрю',
  'watchLibrary.status.completed': 'Просмотрено',
  'watchLibrary.status.plan': 'В планах',
  'watchLibrary.status.on_hold': 'Отложено',
  'watchLibrary.status.dropped': 'Брошено',
  'watchLibrary.status.rewatching': 'Пересматриваю',

  'watchLibrary.kind.anime': 'Аниме',
  'watchLibrary.kind.tv': 'Сериал',
  'watchLibrary.kind.film': 'Фильм',
  'watchLibrary.kind.other': 'Другое',

  'watchLibrary.source.mal-export': 'Экспорт MyAnimeList',
  'watchLibrary.source.mal-sync': 'Синхронизация MyAnimeList',
  'watchLibrary.source.letterboxd': 'Экспорт Letterboxd',
  'watchLibrary.source.local': 'Просмотрено в приложении',
  'watchLibrary.source.manual': 'Добавлено вручную',

  'watchLibrary.sort.title': 'Название',
  'watchLibrary.sort.year': 'Год',
  'watchLibrary.sort.score': 'Моя оценка',
  'watchLibrary.sort.added': 'Дата добавления',
  'watchLibrary.sort.lastWatched': 'Последний просмотр',
  'watchLibrary.sort.finished': 'Дата завершения',
  'watchLibrary.sort.progress': 'Прогресс',
  'watchLibrary.sort.runtime': 'Длительность',
  'watchLibrary.sort.updated': 'Последнее изменение',

  'watchLibrary.import.dialogTitle': 'Импорт экспорта MyAnimeList или Letterboxd',
  'watchLibrary.import.filterExports': 'Экспорт MyAnimeList и Letterboxd',
  'watchLibrary.import.filterAll': 'Все файлы',
  'watchLibrary.import.error.notFound': 'Файл не найден.',
  'watchLibrary.import.error.unreadable': 'Не удалось прочитать файл: {detail}',
  'watchLibrary.import.error.unrecognized':
    'Это не экспорт MyAnimeList или Letterboxd. Выберите файл animelist .xml.gz из MyAnimeList или архив .zip экспорта Letterboxd.',
  'watchLibrary.import.error.empty': 'В экспорте нет ни одного тайтла.',
  'watchLibrary.import.error.mangaOnly':
    'Это список манги MyAnimeList. В библиотеку просмотров можно импортировать только списки аниме.',
  'watchLibrary.import.error.tooLarge': 'Файл слишком большой для экспорта списка ({size}).',

  'watchLibrary.error.notFound': 'Этого тайтла больше нет в библиотеке.',
  'watchLibrary.error.unknownMedia': 'Этого файла нет в медиатеке.',
  'watchLibrary.error.notTrackable': 'Отслеживать можно только файлы аниме, сериалов и фильмов.',
  'watchLibrary.error.invalidTitle': 'У тайтла должны быть название и тип.',
  'watchLibrary.error.addFailed': 'Не удалось добавить тайтл.',
};
