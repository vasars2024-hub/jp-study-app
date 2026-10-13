// Music lyrics pass 2: karaoke timing nudge, bilingual sheets, offline lyrics folder. — Russian. See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_LYRICS2_RU: Catalog = {
  'musicLyrics2.offset.label': 'Синхронизация',
  'musicLyrics2.offset.group': 'Синхронизация текста для этой песни',
  'musicLyrics2.offset.earlier': 'Показывать текст на 0,1 с раньше',
  'musicLyrics2.offset.later': 'Показывать текст на 0,1 с позже',
  'musicLyrics2.offset.reset': 'Сдвиг текста для этой песни: {value}. Нажмите, чтобы сбросить.',
  'musicLyrics2.translation': 'Перевод',
  'musicLyrics2.source.folder': 'Текст из вашей папки с текстами',
  'musicLyrics2.folder.pick': 'Папка с текстами…',
  'musicLyrics2.folder.pickTitle': 'Выберите папку с файлами .lrc. Песни сопоставляются по имени файла или по тегам [ti:]/[ar:], на глубину до трёх папок.',
  'musicLyrics2.folder.current': 'Папка с текстами: {folder}',
  'musicLyrics2.folder.clear': 'Забыть папку с текстами',
  'musicLyrics2.folder.dialogTitle': 'Выберите папку с файлами текстов .lrc',
};
