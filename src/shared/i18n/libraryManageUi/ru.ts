import type { Catalog } from '../core';

export const LIBRARY_MANAGE_UI_RU: Catalog = {
  // Import job
  'libManage.menu.importBooksFolder': 'Импортировать папку с книгами…',
  'libManage.btn.importBooksFolder': 'Импортировать папку с книгами',
  'libManage.dialog.importBooksFolder': 'Импортировать все книги и архивы манги из папки',
  'libManage.import.aria': 'Импорт в библиотеку',
  'libManage.import.running': 'Импорт: {done} из {total}',
  'libManage.import.current': 'Сейчас: {name}',
  'libManage.import.stop': 'Остановить',
  'libManage.import.stopping': 'Остановка после этого файла…',
  'libManage.import.finished': 'Импорт завершён.',
  'libManage.import.stopped': 'Импорт остановлен.',
  'libManage.import.added': 'Добавлено: {count}',
  'libManage.import.duplicates': 'Уже в библиотеке: {count}',
  'libManage.import.failed': 'Не импортировано: {count}',
  'libManage.import.left': 'Не обработано: {count}',
  'libManage.import.failuresTitle': 'Файлы, которые не удалось импортировать',
  'libManage.import.fail.unreadable': '{name} — не удалось прочитать',
  'libManage.import.fail.noPages': '{name} — в архиве нет изображений',
  'libManage.import.fail.storageFull': '{name} — диск заполнен',
  'libManage.import.fail.badFile': '{name} — это не книга и не архив',
  'libManage.import.dismiss': 'Закрыть',
  'libManage.import.resumable': 'Импорт не был завершён. Осталось файлов: {count}.',
  'libManage.import.resume': 'Продолжить',
  'libManage.import.discard': 'Отменить',
  'libManage.import.noneFound': 'В этой папке нет файлов EPUB, PDF или архивов манги.',

  // Remove, Undo, Recently removed
  'libManage.remove.done': '«{title}» удалено.',
  'libManage.remove.undo': 'Отменить',
  'libManage.remove.failed': 'Не удалось удалить: один из файлов используется. Закройте его и попробуйте снова.',
  'libManage.trash.summary': 'Недавно удалённые ({count})',
  'libManage.trash.restore': 'Восстановить',
  'libManage.trash.restoreNamed': 'Восстановить «{title}»',
  'libManage.trash.keptUntil': 'Хранится до {date}',
  'libManage.trash.restoreFailed': 'Не удалось восстановить. Закройте открытые файлы и попробуйте снова.',
  'libManage.trash.release': 'Переместить всё в корзину',
  'libManage.trash.releaseTitle': 'Переместить удалённые элементы в корзину?',
  'libManage.trash.releaseMessage':
    'Восстановить их из библиотеки будет нельзя. Windows хранит их в корзине, пока вы её не очистите.',
  'libManage.trash.releaseFailed': 'Некоторые элементы не удалось переместить, они остались в списке.',

  // Details
  'libManage.meta.edit': 'Изменить сведения',
  'libManage.meta.dialogTitle': 'Изменить сведения',
  'libManage.meta.field.title': 'Название',
  'libManage.meta.field.author': 'Авторы',
  'libManage.meta.field.series': 'Серия',
  'libManage.meta.field.seriesIndex': 'Номер в серии',
  'libManage.meta.field.tags': 'Теги',
  'libManage.meta.tagsHint': 'Разделяйте теги запятыми.',
  'libManage.meta.authorHint': 'Нескольких авторов разделяйте знаком «&».',
  'libManage.meta.seriesWithIndex': '{series}, № {index}',
  'libManage.meta.error.invalid': 'Не удалось сохранить эти сведения.',
  'libManage.meta.error.notFound': 'Этого элемента больше нет в библиотеке.',
  'libManage.meta.error.titleRequired': 'Укажите название.',
  'libManage.meta.error.tooLong': 'Одно из полей слишком длинное (не более 300 символов).',
  'libManage.meta.error.seriesIndex': 'Номер в серии должен быть числом от 0 до 100000.',
  'libManage.meta.error.tags': 'Не более 50 тегов, каждый не длиннее 60 символов.',

  // Missing files
  'libManage.missing.badge': 'Файл отсутствует',
  'libManage.missing.explain': 'Сохранённая копия этого элемента была перемещена или удалена вне приложения.',
  'libManage.missing.relink': 'Указать файл…',
  'libManage.missing.relinked': 'Найдено — элемент снова можно открыть.',
  'libManage.missing.relinkFailed': 'Этот файл не подходит. Попробуйте другой.',
  'libManage.missing.noPages': 'В этом архиве нет изображений.',
  'libManage.missing.diskFull': 'Диск заполнен, поэтому файл не удалось скопировать.',
  'libManage.dialog.relinkManga': 'Укажите архив манги',

  // Library search
  'libManage.search.label': 'Поиск по библиотеке',
  'libManage.search.placeholder': 'Название, автор, серия или тег',

  // Files app
  'filesApp.mine.refuse.notIndexed': 'Этого файла больше нет в каталоге «Файлов». Обновите его и попробуйте снова.',
};
