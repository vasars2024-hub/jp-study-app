// Seamless playback (playback.) — Russian.

import type { Catalog } from '../core';

export const PLAYBACK_UI_RU: Catalog = {
  'playback.frame.opening': 'Открываем {title}…',
  'playback.frame.openingVideo': 'Открываем видео…',
  'playback.frame.slow': 'Плеер ещё готовится…',

  'playback.failed.title': 'Это видео сейчас не воспроизводится',
  'playback.failed.retry': 'Повторить',
  'playback.failed.retrying': 'Пробуем снова…',
  'playback.failed.back': 'Назад',
  'playback.failed.details': 'Технические подробности',
  'playback.failed.crashed': 'Медиасервер несколько раз подряд остановился. Попробуйте снова — если это повторяется, перезапустите Gum.',
  'playback.failed.unhealthy': 'Медиасервер запускался слишком долго. Попробуйте снова.',
  'playback.failed.spawn-failed': 'Windows не удалось запустить медиасервер Gum — возможно, его блокирует защитное ПО. Разрешите Gum в антивирусе и попробуйте снова.',
  'playback.failed.missing-exe': 'В этой установке нет медиасервера Gum. Переустановите Gum, чтобы восстановить его.',
  'playback.failed.port': 'Gum не удалось получить локальный порт для видео. Попробуйте снова.',
  'playback.failed.disabled': 'Воспроизведение видео отключено в этом сеансе.',
  'playback.failed.connect': 'Gum не удалось подключиться к своему медиасерверу. Попробуйте снова.',
  'playback.failed.player': 'Плеер не смог открыть это видео. Возможно, файл повреждён или в формате, который Gum не воспроизводит.',
};
