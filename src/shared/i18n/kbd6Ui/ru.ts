// Product pass 6: key sequences, palette scopes and search-by-key (kbd6.) — ru.

import type { Catalog } from '../core';

export const KBD6_UI_RU: Catalog = {
  'kbd6.keys.sequence': '{first}, затем {next}',
  'kbd6.seq.waiting': 'Нажато {keys}. Ожидание следующей клавиши…',
  'kbd6.seq.noCommand': '{keys} — не сочетание клавиш.',
  'kbd6.palette.group.here': 'В этом окне',
  'kbd6.palette.group.keys': 'Назначено на {keys}',
  'kbd6.palette.worksHere': 'Работает здесь',
  'kbd6.palette.switchTo': 'Сначала перейдите в «{place}»',
  'kbd6.palette.openFirst': 'Сначала откройте «{place}»',
  'kbd6.conflict.startsTheirs': '{lead} начинает последовательность {sequence} для «{name}»',
  'kbd6.conflict.startsMine': '«{name}» использует {lead}, а с этого начинается эта последовательность',
  'kbd6.settings.sequenceStart': 'Нажмите первую клавишу последовательности…',
  'kbd6.settings.stepsSoFar': '{keys} … нажмите следующую клавишу или сделайте паузу, чтобы сохранить',
  'kbd6.settings.recordSequence': 'Записать последовательность',
  'kbd6.settings.recordSequenceHint': 'Несколько клавиш подряд, например Ctrl+K, затем S. Сохраняется после паузы; Esc — отмена.',
  'kbd6.settings.findByKeys': 'Найти по клавишам',
  'kbd6.settings.findByKeysHint': 'Нажмите сочетание, чтобы увидеть, что на него назначено',
  'kbd6.settings.findListening': 'Нажмите клавиши для поиска и сделайте паузу. Esc — отмена.',
  'kbd6.settings.findListeningShort': 'Слушаю…',
  'kbd6.settings.keyFilter': 'Клавиши: {keys}',
  'kbd6.settings.clearKeyFilter': 'Сбросить фильтр по клавишам ({keys})',
  'kbd6.settings.keyFilterCount': {
    one: '{keys}: {count} сочетание',
    few: '{keys}: {count} сочетания',
    many: '{keys}: {count} сочетаний',
    other: '{keys}: {count} сочетания',
  },
};
