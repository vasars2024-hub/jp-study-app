// Video study, round 2 (vstudy.) — Russian.

import type { Catalog } from '../core';

export const VIDEO_STUDY2_UI_RU: Catalog = {
  'vstudy.pad.group': 'Аудио карточки',
  'vstudy.pad.before': 'Запас до',
  'vstudy.pad.after': 'Запас после',
  'vstudy.pad.ms': '{ms} мс',
  'vstudy.pad.stopAtNeighbours': 'Не заходить на предыдущую и следующую реплику',
  'vstudy.pad.note': 'Применяется к аудио и клипам карточек, а также к сжатому аудио.',

  'vstudy.condensed.button': 'Сжатое аудио (MP3)',
  'vstudy.condensed.hint': 'Все реплики этой серии подряд, одним MP3 — слушать где угодно.',
  'vstudy.condensed.progress': 'Вырезаю реплики… {done} из {total}',
  'vstudy.condensed.cancel': 'Стоп',
  'vstudy.condensed.done': 'Сжатое аудио сохранено: {minutes} мин речи.',
  'vstudy.condensed.skipped': {
    one: '{count} реплику не удалось вырезать, она пропущена.',
    few: '{count} реплики не удалось вырезать, они пропущены.',
    many: '{count} реплик не удалось вырезать, они пропущены.',
    other: '{count} реплики не удалось вырезать, они пропущены.',
  },
  'vstudy.condensed.failed': 'Не удалось сделать сжатое аудио: из этого файла не вырезалась ни одна реплика.',
  'vstudy.condensed.empty': 'На этой дорожке нет реплик для сжатого аудио.',
  'vstudy.condensed.cancelled': 'Создание сжатого аудио остановлено.',

  'vstudy.align.previous': 'Предыдущая реплика — сейчас',
  'vstudy.align.next': 'Следующая реплика — сейчас',
  'vstudy.align.hint': 'Нажмите, пока звучит реплика: задержка субтитров будет такой, чтобы эта реплика начиналась в этот момент.',
  'vstudy.align.none': 'Здесь не к чему выровнять.',
  'vstudy.align.done': 'Задержка субтитров: {delay} с.',

  'vstudy.keys.title': 'Сочетания клавиш',
  'vstudy.keys.study': 'Клавиши для учёбы',
  'vstudy.keys.unbound': 'не задано',
  'vstudy.keys.note': 'Клавиша ? показывает и скрывает этот список. Клавиши для учёбы меняются в «Настройки › Сочетания клавиш».',

  'vstudy.frame.notOnScreen': 'Воспроизведите реплику, чтобы снять кадр: у потока нет файла, из которого можно вырезать кадр.',
};
