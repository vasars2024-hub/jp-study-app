// Product pass 6: Soundscape engine (snd6.) and widget polish (wid6.) — ru.

import type { Catalog } from '../core';

export const PRODUCT6_UI_RU: Catalog = {
  // ---- Soundscape: per-layer tone and pan ----
  'snd6.shape.open': 'Тембр и панорама: {name}',
  'snd6.shape.openShaped': 'Тембр и панорама: {name} (изменено)',
  'snd6.shape.groupOf': 'Тембр и панорама: {name}',
  'snd6.shape.tone': 'Тембр',
  'snd6.shape.pan': 'Панорама',
  'snd6.shape.toneOf': '{name}: тембр',
  'snd6.shape.panOf': '{name}: панорама',
  'snd6.shape.toneNeutral': 'Нейтрально',
  'snd6.shape.darker': 'Темнее, {percent}%',
  'snd6.shape.brighter': 'Ярче, {percent}%',
  'snd6.shape.centre': 'По центру',
  'snd6.shape.left': 'Левее, {percent}%',
  'snd6.shape.right': 'Правее, {percent}%',
  'snd6.shape.reset': 'Сбросить тембр и панораму',

  // ---- Soundscape: saved mixes as a file ----
  'snd6.mixes.heading': 'Файл миксов',
  'snd6.mixes.export': 'Экспорт',
  'snd6.mixes.copy': 'Копировать',
  'snd6.mixes.import': 'Импорт',
  'snd6.mixes.paste': 'Вставить',
  'snd6.mixes.pasteLabel': 'Миксы для импорта',
  'snd6.mixes.pastePlaceholder': 'Вставьте сюда экспортированные миксы',
  'snd6.mixes.importPasted': 'Импортировать вставленные миксы',
  'snd6.mixes.exported': 'Сохранено: {name}',
  'snd6.mixes.exportFailed': 'Не удалось сохранить файл.',
  'snd6.mixes.copied': {
    one: 'Скопирован {count} микс.',
    few: 'Скопировано {count} микса.',
    many: 'Скопировано {count} миксов.',
    other: 'Скопировано {count} микса.',
  },
  'snd6.mixes.copyFailed': 'Не удалось скопировать в буфер обмена.',
  'snd6.mixes.added': {
    one: 'Добавлен {count} микс.',
    few: 'Добавлено {count} микса.',
    many: 'Добавлено {count} миксов.',
    other: 'Добавлено {count} микса.',
  },
  'snd6.mixes.duplicates': {
    one: '{count} уже был сохранён.',
    few: '{count} уже были сохранены.',
    many: '{count} уже были сохранены.',
    other: '{count} уже были сохранены.',
  },
  'snd6.mixes.overflow': {
    one: 'Не поместился ещё {count} (предел {max}).',
    few: 'Не поместились ещё {count} (предел {max}).',
    many: 'Не поместились ещё {count} (предел {max}).',
    other: 'Не поместились ещё {count} (предел {max}).',
  },
  'snd6.mixes.importFailed': 'Не удалось импортировать: {error}',
  'snd6.mixes.error.notJson': 'это не файл JSON.',
  'snd6.mixes.error.notMixes': 'это не файл миксов Звукового фона.',
  'snd6.mixes.error.empty': 'ни в одном миксе нет звука.',

  // ---- Soundscape: ducking for speech and video ----
  'snd6.duck.speech': 'Приглушать при речи и видео',
  'snd6.duck.nowSpeech': 'Приглушено: звучит речь или видео',
  'snd6.duck.nowMusic': 'Приглушено: играет музыка',

  // ---- Widgets: gallery preview ----
  'wid6.gallery.preview': 'Предпросмотр',
  'wid6.gallery.previewOf': 'Предпросмотр: {name}',
  'wid6.gallery.defaultSize': 'Размер по умолчанию {w} × {h}',
  'wid6.gallery.favoriteNamed': 'Добавить «{name}» в избранное',
  'wid6.gallery.unfavoriteNamed': 'Убрать «{name}» из избранного',
  'wid6.gallery.addNamed': 'Добавить «{name}»',
  'wid6.gallery.addAnotherNamed': 'Добавить ещё «{name}»',

  // ---- Widgets: alignment guides ----
  'wid6.drag.hint': 'Перетащите, чтобы переместить. Края прилипают к другим виджетам; удерживайте Alt, чтобы ставить свободно.',
  'wid6.drag.hintAero': '{drag}. Края прилипают к другим гаджетам; удерживайте Alt, чтобы ставить свободно.',
  'wid6.guides.readout': 'Поз. X:{x} Y:{y}',
  'wid6.guides.size': 'Размер {w}×{h}',
};
