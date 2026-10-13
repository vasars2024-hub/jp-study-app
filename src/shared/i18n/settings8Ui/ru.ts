// Settings pass 8 and widgets pass 7 (set8., wid7.) — ru.

import type { Catalog } from '../core';

export const SETTINGS8_UI_RU: Catalog = {
  'set8.reset.dialogMessage': 'Все параметры этого раздела вернутся к значениям по умолчанию. Сразу после сброса его можно отменить.',
  'set8.reset.done': 'Раздел «{section}» сброшен к значениям по умолчанию.',
  'set8.reset.undo': 'Отменить',
  'set8.reset.undone': 'Раздел «{section}» восстановлен.',
  'set8.reset.undoFailed': 'Не удалось восстановить раздел «{section}».',
  'set8.desktopReset.dialogTitle': 'Сбросить этот рабочий стол?',
  'set8.desktopReset.dialogMessage': 'Все окна закроются, а значки, виджеты и обои активного рабочего стола вернутся к исходным. Заметки останутся. Сразу после сброса его можно отменить.',
  'set8.desktopReset.desc': 'Только для активного рабочего стола: закрывает окна и сбрасывает значки, виджеты и обои. Заметки остаются. У рабочих столов 1 и 2 раздельные макеты.',
  'set8.desktopReset.popoutHint': 'Сбросьте рабочий стол в настройках главного окна — у этого отдельного окна нет своего рабочего стола.',
  'set8.monitors.dialogMessage': 'Забыть все настройки отдельных экранов? Рабочие столы и всё на них сохранятся, но ни один рабочий стол больше не будет привязан к дисплею. Сразу после сброса его можно отменить.',
  'set8.shortcuts.error.nameRequired': 'Дайте сочетанию клавиш название.',
  'set8.shortcuts.error.pickAction': 'Выберите действие.',
  'set8.shortcuts.error.notFound': 'Этого пользовательского сочетания больше нет.',
  'set8.shortcuts.error.generic': 'Не удалось сохранить сочетание клавиш.',
  'wid7.menu.label': 'Параметры: {name}',
};
