// Scraper, second round (2026-10) -- Russian. Keys: see ./en.ts.
import type { Catalog } from '../core';

export const SCRAPER_V2_RU: Catalog = {
  'scr2.note.pagesFailed': 'Не удалось прочитать: {list}; список эпизодов может быть неполным.',
  'scr2.note.pageStatus': 'страница {page} (HTTP {status})',
  'scr2.note.pageEmpty': 'страница {page} (нет строк)',
  'scr2.note.pageUnreachable': 'страница {page} (недоступна)',
  'scr2.torrentFile.title': 'Добавить файлы .torrent',
  'scr2.torrentFile.desc': 'Отправить сохранённые на этом компьютере торрент-файлы в qBittorrent с той же категорией, папкой и параметрами, что и магнет-ссылку.',
  'scr2.torrentFile.choose': 'Выбрать файлы .torrent...',
  'scr2.torrentFile.adding': 'Добавление...',
  'scr2.torrentFile.disabled': 'Сначала включите отправку в настройках qBittorrent.',
  'scr2.torrentFile.result': 'Добавлено: {sent}. Пропущено: {skipped}. Не удалось: {failed}.',
  'scr2.torrentFile.empty': 'Файл пуст или слишком велик.',
  'scr2.torrentFile.too-large': 'Файл слишком велик для .torrent.',
  'scr2.torrentFile.not-bencode': 'Это не файл .torrent.',
  'scr2.torrentFile.no-info': 'В файле нет метаданных торрента.',
  'scr2.torrentFile.no-name': 'В торренте не указано имя файла или папки.',
  'scr2.torrentFile.no-pieces': 'В торренте нет хешей частей.',
  'scr2.torrentFile.duplicate': 'Один и тот же торрент выбран дважды.',
};
