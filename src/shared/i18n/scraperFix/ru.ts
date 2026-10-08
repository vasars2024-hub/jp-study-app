// Scraper audit fixes (2026-10) -- Russian.
//
// One block per work package of the scraper audit, so the packages that ran
// side by side never edited the same lines. Keys live under `scraperFix.`;
// English is the source of truth and every key exists in all four languages.
import type { Catalog } from '../core';

export const SCRAPER_FIX_RU: Catalog = {
  // ---- http (P3 / P8) ----
  'scraperDrawer.field.safety.allowPrivateNetwork.label': 'Разрешить частную сеть',
  'scraperDrawer.field.safety.allowPrivateNetwork.hint': 'Разрешает обходу, проверке источников и HTTP-инспектору обращаться к localhost и адресам локальной сети. Если выключено, такие запросы отклоняются; qBittorrent и Seanime это не затрагивает.',
  // ---- subtitles (P1 / P4 / P7) ----
  // ---- qbittorrent and ingest (P5) ----
  'scraperDrawer.field.qbittorrent.pathMappings.label': 'Сопоставление путей',
  'scraperDrawer.field.qbittorrent.pathMappings.hint': 'Для qBittorrent на другой машине: папка, которую он сообщает, и та же папка так, как её видит этот компьютер.',
  'scraperFix.qbit.mappings.hint': 'qBittorrent в Docker или на NAS сообщает собственные пути, например /downloads. Сопоставьте каждый с той же папкой на этом компьютере, чтобы завершённые загрузки попадали в библиотеку.',
  'scraperFix.qbit.mappings.remote': 'Путь в qBittorrent',
  'scraperFix.qbit.mappings.local': 'Путь на этом компьютере',
  'scraperFix.qbit.unresolved': { one: '{count} завершённая загрузка пока не найдена на этом компьютере. Если qBittorrent работает на другой машине, добавьте сопоставление путей в его настройках.', few: '{count} завершённые загрузки пока не найдены на этом компьютере. Если qBittorrent работает на другой машине, добавьте сопоставление путей в его настройках.', many: '{count} завершённых загрузок пока не найдено на этом компьютере. Если qBittorrent работает на другой машине, добавьте сопоставление путей в его настройках.', other: '{count} завершённой загрузки пока не найдено на этом компьютере. Если qBittorrent работает на другой машине, добавьте сопоставление путей в его настройках.' },
  // ---- engine (P4 / P6 / P8) ----
  'scraperFix.rule.nextPageSelector': 'Ссылка на следующую страницу',
  'scraperFix.rule.maxPages': 'Максимум страниц',
  'scraperFix.rule.maxPagesHint': 'При значении 1 читается только первая страница. Переходы выполняются только в пределах того же сайта.',
  // ---- outputs, logs, notifications, scheduler (P6 / P7) ----
  'scraperFix.notice.complete.title': 'Сбор завершён',
  'scraperFix.notice.complete.body': { one: '{subject} — {count} эпизод.', few: '{subject} — {count} эпизода.', many: '{subject} — {count} эпизодов.', other: '{subject} — {count} эпизода.' },
  'scraperFix.notice.error.title': 'Сбор не удался',
  'scraperFix.notice.error.body': 'Ошибка: {subject}',
  'scraperFix.notice.new-episode.title': 'Найден новый эпизод',
  'scraperFix.notice.new-episode.body': { one: '{subject} — {count} новый эпизод.', few: '{subject} — {count} новых эпизода.', many: '{subject} — {count} новых эпизодов.', other: '{subject} — {count} новых эпизода.' },
  'scraperFix.notice.schedule-run.title': 'Запущен запуск по расписанию',
  'scraperFix.notice.schedule-run.body': 'Запуск: {subject}',
  'scraperFix.notice.study-ready.title': 'Субтитры готовы к изучению',
  'scraperFix.notice.study-ready.body': { one: '{subject} — {count} эпизод с дорожкой субтитров.', few: '{subject} — {count} эпизода с дорожкой субтитров.', many: '{subject} — {count} эпизодов с дорожкой субтитров.', other: '{subject} — {count} эпизода с дорожкой субтитров.' },
  'scraperFix.notice.digest.title': { one: 'Сборщик — {count} обновление', few: 'Сборщик — {count} обновления', many: 'Сборщик — {count} обновлений', other: 'Сборщик — {count} обновления' },
  'scraperFix.notice.digest.complete': { one: '{count} сбор завершён', few: '{count} сбора завершено', many: '{count} сборов завершено', other: '{count} сбора завершено' },
  'scraperFix.notice.digest.new-episode': 'Сериалов с новыми эпизодами: {count}',
  'scraperFix.notice.digest.study-ready': 'Сериалов, готовых к изучению: {count}',
  'scraperFix.notice.digest.schedule-run': { one: '{count} запуск по расписанию', few: '{count} запуска по расписанию', many: '{count} запусков по расписанию', other: '{count} запуска по расписанию' },
  'scraperFix.notice.digest.error': { one: '{count} ошибка', few: '{count} ошибки', many: '{count} ошибок', other: '{count} ошибки' },
  // ---- ui (P9) ----
  'scraperFix.ui.stage.queued': 'В очереди',
  'scraperFix.ui.stage.searching': 'Поиск',
  'scraperFix.ui.stage.fetching': 'Загрузка',
  'scraperFix.ui.stage.parsing': 'Извлечение',
  'scraperFix.ui.stage.streams': 'Проверка зеркал',
  'scraperFix.ui.stage.subtitles': 'Сбор субтитров',
  'scraperFix.ui.stage.validating': 'Проверка',
  'scraperFix.ui.stage.done': 'Готово',
  'scraperFix.ui.stage.failed': 'Ошибка',
  'scraperFix.ui.stage.cancelled': 'Отменено',
  'scraperFix.ui.run.failed': 'Сбор остановлен: {detail}',
  'scraperFix.ui.run.cancelFailed': 'Не удалось отменить сбор: {detail}',
  'scraperFix.ui.err.httpStatus': '{target} ответил HTTP {status}.',
  'scraperFix.ui.err.ruleNoMatch': 'Правило сайта {host} ничего не нашло на {url}.',
  'scraperFix.ui.err.validationFailed': 'Эпизодов не прошло проверку: {count}.',
  'scraperFix.ui.err.nothingToSearch': 'Искать нечего. Введите URL или название.',
  'scraperFix.ui.err.noCatalogueMatch': 'В каталоге нет совпадений для «{query}».',
  'scraperFix.ui.err.contentType': 'Сбор типа {type} пока не подключён к поставщику каталога.',
  'scraperFix.ui.err.autoDownloaderOff': 'Автозагрузчик Seanime выключен.',
  'scraperFix.ui.err.unknown': 'Неизвестная ошибка.',
  'scraperFix.ui.field.notNumber': 'Не сохранено: введите число.',
  'scraperFix.ui.field.outOfRange': 'Не сохранено: введите значение от {min} до {max}.',
  'scraperFix.ui.dash.cancelling': 'Отмена...',
  'scraperFix.ui.plugins.notReady': 'Плагины пока не готовы. Ничего на этой странице не сохраняется и не меняет работу сборщика, поэтому переключатели и кнопки отключены.',
  'scraperFix.ui.note.ruleChecks': 'Некоторые проверки правил не пройдены.',
  'scraperFix.ui.note.missing': 'Пропущенные номера эпизодов: {list}.',
  'scraperFix.ui.note.missingMore': 'Пропущенные номера эпизодов: {list} и ещё {more}.',
};
