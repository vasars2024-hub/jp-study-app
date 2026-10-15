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
  'upd3.pausedNote': 'Загруженные данные ({received} из {total}) сохранены. Загрузка продолжится с этого места.',
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

  'upd3.auto.label': 'Проверять обновления автоматически',
  'upd3.auto.desc': 'Если выключено, Gum проверяет обновления только по кнопке «Проверить сейчас».',
  'upd3.pause.button': {
    one: 'Приостановить обновления на {count} день',
    few: 'Приостановить обновления на {count} дня',
    many: 'Приостановить обновления на {count} дней',
    other: 'Приостановить обновления на {count} дня',
  },
  'upd3.pause.until': 'Обновления приостановлены до {date}. Кнопка «Проверить сейчас» по-прежнему работает.',
  'upd3.pause.resume': 'Возобновить обновления',
  'upd3.diag.crash.label': 'Сохранять отчёты о сбоях на этом компьютере',
  'upd3.diag.crash.desc': 'Когда Gum аварийно завершается, в папке Gum сохраняется небольшой файл сбоя. Он никуда не отправляется. Добавить его в отчёт о проблеме можно только вручную.',
  'upd3.diag.crash.restart': 'Выключение вступит в силу при следующем запуске Gum.',
  'upd3.diag.report.save': 'Сохранить отчёт о проблеме…',
  'upd3.diag.report.desc': 'Zip-файл для отчёта об ошибке: недавний журнал ошибок, версии Gum и Windows, настройки без ключей, токенов и путей к вашей личной папке, а также файлы сбоев. Он остаётся на компьютере, пока вы сами им не поделитесь.',
  'upd3.diag.report.dialogTitle': 'Сохранить отчёт о проблеме',
  'upd3.diag.report.saved': 'Отчёт о проблеме сохранён: {file}',
  'upd3.diag.report.failed': 'Не удалось сохранить отчёт о проблеме.',
  'upd3.diag.report.show': 'Показать в папке',
  'upd3.state.manualOnly': 'Проверки ещё не было. Gum проверяет обновления только по кнопке «Проверить сейчас».',
};
