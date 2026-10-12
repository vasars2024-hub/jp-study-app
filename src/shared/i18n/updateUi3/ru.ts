// Updates, third pass (upd3) — Russian. See ./en.ts.

import type { Catalog } from '../core';

export const UPDATE3_UI_RU: Catalog = {
  'upd3.state.preparing': 'Подготовка к загрузке Gum {version}…',
  'upd3.state.downloading': 'Загружается Gum {version}. Тем временем Gum продолжает работать.',
  'upd3.state.downloadingDelta': 'Загружаются изменения для Gum {version} (дельта-обновление). Тем временем Gum продолжает работать.',
  'upd3.state.verifying': 'Проверка загруженного Gum {version}…',
  'upd3.state.installing': 'Gum {version} распаковывается в фоне…',
  'upd3.state.paused': 'Загрузка Gum {version} приостановлена.',
  'upd3.progress.bytes': '{received} из {total}',
  'upd3.progress.bytesNoTotal': 'получено {received}',
  'upd3.progress.value': '{percent}%, {received} из {total}',
  'upd3.cancel': 'Отменить загрузку',
  'upd3.resume': 'Продолжить загрузку',
  'upd3.retry': 'Попробовать снова',
  'upd3.pausedNote': 'Загруженные {received} из {total} сохранены. Загрузка продолжится с этого места.',
  'upd3.partialNote': 'Уже загруженные {received} сохранены; повторная попытка продолжит с этого места.',

  'upd3.restart.title': 'Перезапуск сейчас прервёт:',

  'upd3.notes.linkLabel': '{label} (откроется на GitHub)',

  'upd3.history.title': 'История обновлений',
  'upd3.history.empty': 'Версии ещё не записаны.',
  'upd3.history.first': 'Gum {version}, первый запуск {date}',
  'upd3.history.updated': 'Gum {version}, обновлено с {from} {date}',
  'upd3.history.downgraded': 'Gum {version}, заменено с {from} {date}',
  'upd3.history.current': 'запущена сейчас',
  'upd3.history.showAll': {
    one: 'Показать все версии ({count})',
    few: 'Показать все версии ({count})',
    many: 'Показать все версии ({count})',
    other: 'Показать все версии ({count})',
  },
  'upd3.history.showFewer': 'Показать меньше',

  'upd3.whatsNew.title': 'Что нового в Gum {version}',
  'upd3.whatsNew.body': 'Gum обновлён с {from} до {version}.',
  'upd3.whatsNew.show': 'Показать, что нового',
  'upd3.whatsNew.hide': 'Скрыть, что нового',
  'upd3.whatsNew.dismiss': 'Закрыть',
  'upd3.whatsNew.noticeTitle': 'Gum обновлён до {version}',
  'upd3.whatsNew.noticeBody': 'Что нового — в разделе «Настройки > Справка > Обновления».',
  'upd3.whatsNew.open': 'Что нового',
};
