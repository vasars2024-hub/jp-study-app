// Словарь на уровне Yomitan: путь спряжения, вид результатов, источники аудио,
// пояснения к приоритетам JMdict, «уже в Anki» по нескольким колодам. Ключи dict3.

import type { Catalog } from '../core';

export const DICT3_UI_RU: Catalog = {
  // ---- Путь спряжения ----
  'dict3.trace.aria': '{source} сведено к {term}: {steps}',
  'dict3.trace.openGrammar': 'Открыть «{step}» в обозревателе грамматики',

  // ---- Приоритеты JMdict ----
  'dict3.prio.title': 'Списки слов JMdict:',
  'dict3.prio.news1': 'Частотный список «Майнити симбун», первые 12 000 слов',
  'dict3.prio.news2': 'Частотный список «Майнити симбун», слова 12 001–24 000',
  'dict3.prio.ichi1': '«Итиманго гои бунруйсю» — около 10 000 частых слов',
  'dict3.prio.ichi2': '«Итиманго гои бунруйсю», но в газетах встречается реже',
  'dict3.prio.spec1': 'Отмечено редакторами JMdict как частое',
  'dict3.prio.spec2': 'Отмечено редакторами JMdict как довольно частое',
  'dict3.prio.gai1': 'Частое заимствование',
  'dict3.prio.gai2': 'Менее частое заимствование',
  'dict3.prio.nf': 'Место в газетном частотном списке: {from}–{to}',

  // ---- Уже в Anki ----
  'dict3.presence.ankiWhere': 'Уже в Anki: {targets}',

  // ---- Разделы ----
  'dict3.sections.showMore': {
    one: 'Показать ещё {count} словарь',
    few: 'Показать ещё {count} словаря',
    many: 'Показать ещё {count} словарей',
    other: 'Показать ещё {count} словаря',
  },
  'dict3.sections.showFewer': 'Скрыть другие словари',

  // ---- Выбор аудио ----
  'dict3.audio.picker': 'Источник аудио для {word}',
  'dict3.audio.auto': 'Автоматически',
  'dict3.audio.optionHas': '{name} (есть)',
  'dict3.audio.optionMissing': '{name} (нет)',

  // ---- Настройки ----
  'dict3.settings.layoutTitle': 'Вид результатов',
  'dict3.settings.layoutIntro':
    'Как показывать слово, найденное в нескольких словарях, — в приложении, во всплывающем окне и в расширении браузера.',
  'dict3.settings.grouped': 'Группировать по словарям (раздел на каждый словарь)',
  'dict3.settings.merged': 'Объединить в один список (у каждого значения — его словарь)',
  'dict3.settings.collapse': 'Сворачивать словари после первого, пока их не раскроют',
  'dict3.settings.dragHint': 'Перетащите словарь или воспользуйтесь стрелками, чтобы изменить порядок.',
  'dict3.settings.audioTitle': 'Источники аудио',
  'dict3.settings.audioIntro':
    'Произношение ищется в этом порядке; если в источнике нет записи, используется следующий. Для каждой статьи можно выбрать и один источник.',
  'dict3.settings.audioUse': 'Использовать этот источник аудио',
  'dict3.settings.audioCdn': 'Записи JapanesePod101: загружаются только при нажатии на воспроизведение, затем доступны офлайн',
  'dict3.settings.audioMissingFolder': 'Папка не найдена',
  'dict3.settings.audioFiles': {
    one: 'Найдена {files} запись',
    few: 'Найдено {files} записи',
    many: 'Найдено {files} записей',
    other: 'Найдено {files} записи',
  },
  'dict3.settings.audioUp': 'Пробовать раньше',
  'dict3.settings.audioDown': 'Пробовать позже',
  'dict3.settings.audioAddFolder': 'Добавить локальную папку с аудио',
  'dict3.settings.audioLayouts':
    'Локальные папки только читаются, в них ничего не загружается. Распознаются файлы «чтение - слово.mp3» (формат JapanesePod101) и «слово.mp3» в любой подпапке (формат Forvo): mp3, ogg, opus, m4a, aac, wav и flac.',
};
