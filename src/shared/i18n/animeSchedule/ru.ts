// Airing schedule -> release matching (audit C1-3) — Russian.
//
// No key here is count-bearing: the numbers are interpolated next to a fixed
// label ("Совпало 3") rather than inflecting a noun, so none of these need
// CLDR plural forms. That is deliberate — a plural form invented for a label
// that never inflects is dead weight the next translator has to reason about.

import type { Catalog } from '../core';

export const ANIME_SCHEDULE_RU: Catalog = {
  'schedule.title': 'Расписание выхода',
  'schedule.sub': 'Выходящие серии и найденные для них раздачи из торрент-индекса.',
  'schedule.load': 'Загрузить расписание',
  'schedule.refresh': 'Обновить',
  'schedule.loading': 'Читаем расписание…',
  'schedule.empty': 'В этом интервале ничего не запланировано.',
  'schedule.unavailable': 'Не удалось прочитать расписание: {detail}',
  'schedule.summary': 'Совпало {exact} · Требует проверки {review} · Без раздачи {none}',
  'schedule.episode': 'Серия {episode}',
  'schedule.window.day': 'Ближайшие 24 часа',
  'schedule.window.week': 'Ближайшие 7 дней',
  'schedule.allowBatches': 'Принимать сборники сезона',

  'schedule.state.exact': 'Раздача найдена',
  'schedule.state.review': 'Возможное совпадение — не подтверждено',
  'schedule.state.none': 'Раздача не найдена',

  'schedule.reason.searchFailed': 'Не удалось обратиться к индексу по этому названию.',
  'schedule.reason.noReleases': 'Индекс ничего не вернул по этому названию.',
  'schedule.reason.noEpisodeMatch': 'Раздачи для этого названия есть, но не для этой серии.',
  'schedule.reason.belowConfidence': 'Ничто из найденного не совпало с названием достаточно точно.',

  'schedule.matchedAs': 'Сопоставлено как «{title}», уверенность {percent}%',
  'schedule.source': 'Расписание: AniList · Раздача: {source}',
  'schedule.sourceNone': 'Расписание: AniList · раздачи нет',
  'schedule.seeders': 'Сидеров',
  'schedule.considered': 'Рассмотрено {count}',
  'schedule.copyMagnet': 'Скопировать magnet',
  'schedule.copied': 'Magnet скопирован',
};
