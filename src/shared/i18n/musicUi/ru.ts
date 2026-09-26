// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — Russian. See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_UI_RU: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': 'Не удалось открыть файл. Возможно, он был перемещён?',
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
