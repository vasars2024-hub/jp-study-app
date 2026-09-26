// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — Russian. See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_UI_RU: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': 'Не удалось открыть файл. Возможно, он был перемещён?',
  // User playlists: the picker, its actions and the song menu.
  'musicUi.playlists.label': 'Плейлист',
  'musicUi.playlists.allSongs': 'Все песни',
  'musicUi.playlists.option': {
    one: '{name} ({count} песня)',
    few: '{name} ({count} песни)',
    many: '{name} ({count} песен)',
    other: '{name} ({count} песни)',
  },
  'musicUi.playlists.new': 'Новый плейлист',
  'musicUi.playlists.defaultName': 'Плейлист {n}',
  'musicUi.playlists.play': 'Слушать',
  'musicUi.playlists.rename': 'Переименовать',
  'musicUi.playlists.delete': 'Удалить',
  'musicUi.playlists.deleteConfirm': 'Удалить «{name}»?',
  'musicUi.playlists.nameLabel': 'Название плейлиста',
  'musicUi.playlists.save': 'Сохранить',
  'musicUi.playlists.cancel': 'Отмена',
  'musicUi.playlists.empty': 'Плейлист пуст. Щёлкните правой кнопкой по песне в разделе «Все песни», чтобы добавить её.',
  'musicUi.playlists.addTo': 'Добавить в «{name}»',
  'musicUi.playlists.alreadyIn': 'Уже в «{name}»',
  'musicUi.playlists.newWithSong': 'Новый плейлист с этой песней',
  'musicUi.playlists.moveUp': 'Переместить выше',
  'musicUi.playlists.moveDown': 'Переместить ниже',
  'musicUi.playlists.remove': 'Убрать из плейлиста',
  'musicUi.playlists.added': 'Добавлено в «{name}».',
  'musicUi.playlists.nothingToPlay': 'Ни одной песни из этого плейлиста сейчас нет в медиатеке.',
  'musicUi.playlists.paletteGroup': 'Плейлисты',
  'musicUi.playlists.paletteSub': {
    one: 'Слушать плейлист · {count} песня',
    few: 'Слушать плейлист · {count} песни',
    many: 'Слушать плейлист · {count} песен',
    other: 'Слушать плейлист · {count} песни',
  },
  'musicUi.viz.wallpaperOnly': 'Визуализатор настроен показываться только на обоях',
  'musicUi.viz.off': 'Визуализатор выключен',
  'musicUi.viz.showHereToo': 'Показывать и здесь',
  'musicUi.viz.turnOn': 'Включить',
  'musicUi.viz.fftOption': 'БПФ {size}',
  // The empty song list offers the import itself.
  'musicUi.empty.addFolder': 'Добавить папку с музыкой…',
  'musicUi.empty.noneAdded': 'В этой папке не найдено аудиофайлов.',
  'musicUi.empty.addFailed': 'Не удалось добавить папку. Попробуйте ещё раз или положите файлы в отслеживаемую папку медиа.',
};
