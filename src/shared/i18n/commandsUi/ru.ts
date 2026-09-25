// Command labels, command palette, keyboard shortcut help and player key names (round-2 keyboard pass). — Russian. See ./en.ts for scope.

import type { Catalog } from '../core';

export const COMMANDS_UI_RU: Catalog = {
  // ---- shortcut manager: toasts, custom-shortcut descriptions, undo ----
  'shortcut.toast.toolboxGlobal': 'Глобальное сочетание панели инструментов: {error}',
  'shortcut.toast.appToggle': 'Сочетание «Скрыть/показать Gum»: {error}',
  'shortcut.toast.appRestart': 'Сочетание полного перезапуска: {error}',
  'shortcut.toast.startupHelper': 'Помощник автозапуска: {error}',
  'shortcut.custom.opens': 'Открывает {name}',
  'shortcut.custom.runs': 'Запускает «{name}»',
  'shortcut.custom.stack': 'Цепочка: {names}',
  'shortcut.custom.dispatches': 'Отправляет {event}',
  'shortcut.custom.dispatchesDetail': 'Отправляет {event} ({detail})',
  'shortcut.undo.nothing': 'Нечего отменять',
  'shortcut.undo.done': 'Отменено: {action}',
  'shortcut.undo.doneGeneric': 'Отменено',
  // ---- Settings > Study: subtitle style (the searchable door to the player's own settings) ----
  'playerUi.subtitleStyle.title': 'Стиль субтитров',
  'playerUi.subtitleStyle.desc': 'Как выглядят субтитры в видеоплеере',
  'playerUi.subtitleStyle.size': 'Размер субтитров',
  'playerUi.subtitleStyle.px': '{size} пкс',
  'playerUi.subtitleStyle.more':
    'Положение и фон — в разделе «Смотреть» > «Настройки медиа». Цвет, шрифт и обводка — в меню «Учёба» плеера во время просмотра.',
  'playerUi.subtitleStyle.open': 'Открыть настройки субтитров плеера',
};
