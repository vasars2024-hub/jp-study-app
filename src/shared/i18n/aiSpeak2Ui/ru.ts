// Speaking and writing, round 2 — Russian. See ./en.ts.

import type { Catalog } from '../core';

export const AI_SPEAK2_UI_RU: Catalog = {
  // ---- shadowing: pitch and rhythm ----
  'aiSpeak.prosody.title': 'Высота и ритм (измерено по вашей записи)',
  'aiSpeak.prosody.skipped.not-comparable': 'Высота и ритм измеряются, когда запись близка к реплике: совпадение звуков от 60% и примерно столько же звуков.',
  'aiSpeak.prosody.skipped.no-audio': 'Не удалось прочитать запись, чтобы измерить высоту и ритм.',
  'aiSpeak.prosody.skipped.no-voice': 'В записи не найден голос, который можно измерить.',
  'aiSpeak.prosody.accentScore': 'Тоновое ударение как в словаре: {matched} из {total}.',
  'aiSpeak.prosody.noPitchDictionary': 'Словарь тонового ударения не установлен, поэтому измерен только ритм. Его можно добавить в разделе «Настройки», «Словари».',
  'aiSpeak.prosody.noPitchWords': 'В словаре тонового ударения нет слов этой реплики, поэтому измерен только ритм.',
  'aiSpeak.prosody.unvoiced': 'Слишком мало озвученных звуков, чтобы оценить высоту. Скажите реплику чуть громче.',
  'aiSpeak.prosody.pattern.heiban': 'ровный (хэйбан)',
  'aiSpeak.prosody.pattern.atamadaka': 'понижение после первой моры (атамадака)',
  'aiSpeak.prosody.pattern.nakadaka': 'подъём, затем понижение внутри слова (накадака)',
  'aiSpeak.prosody.pattern.odaka': 'понижение на следующей частице (одака)',
  'aiSpeak.prosody.pattern.unknown': 'неизвестно',
  'aiSpeak.prosody.verdict.match': 'Как в словаре: {expected}.',
  'aiSpeak.prosody.verdict.mismatch': 'Словарь: {expected}. Вы: {heard}.',
  'aiSpeak.prosody.verdict.unclear': 'Словарь: {expected}. Слишком мало голоса, чтобы судить.',
  'aiSpeak.prosody.legend': 'Кружки: высокие и низкие моры по словарю (пунктир — частица после слова). Линия: высота вашего голоса.',
  'aiSpeak.prosody.rate.ja': 'Скорость речи: мор в секунду — {rate}. В реплике — {cue}.',
  'aiSpeak.prosody.rate.zh': 'Скорость речи: слогов в секунду — {rate}. В реплике — {cue}.',
  'aiSpeak.prosody.rateOnly.ja': 'Скорость речи: мор в секунду — {rate}.',
  'aiSpeak.prosody.rateOnly.zh': 'Скорость речи: слогов в секунду — {rate}.',
  'aiSpeak.prosody.pauseInside': 'Пауза внутри «{word}»: {sec} с.',
  'aiSpeak.prosody.pauseAfter': 'Пауза после «{word}», где в реплике нет запятой: {sec} с.',
  'aiSpeak.prosody.noPauses': 'Пауз внутри реплики нет.',
  'aiSpeak.prosody.estimate': 'Измерено на этом компьютере. Это оценка: высота каждой моры берётся из равной доли вашей речи.',

  // ---- conversation partner ----
  'aiSpeak.chat.unanswered': 'На ваше последнее сообщение ещё нет ответа.',
  'aiSpeak.chat.retry': 'Повторить ответ',
  'aiSpeak.chat.voiceSend': 'Отправлять сказанное сразу',
  'aiSpeak.chat.recall': 'Собеседник постарается вернуть слова из прошлых разговоров:',
  'aiSpeak.chat.recallScripted': 'Попробуйте использовать слова из прошлых разговоров:',
  'aiSpeak.chat.recallUsed': 'Из прошлых разговоров: {words}',
  'aiSpeak.chat.correctionCardBack': '{reason} (Вы написали: {original})',

  // ---- writing help: cards, history, journal streak ----
  'aiSpeak.write.tab.history': 'История',
  'aiSpeak.write.saveCard': 'Сохранить как карточку',
  'aiSpeak.history.empty': 'Здесь сохраняются полученные исправления, чтобы было видно, какие ошибки повторяются.',
  'aiSpeak.history.kinds': 'Самые частые исправления: {kinds}.',
  'aiSpeak.history.kindCount': {
    one: '{kind}: {count} раз',
    few: '{kind}: {count} раза',
    many: '{kind}: {count} раз',
    other: '{kind}: {count} раза',
  },
  'aiSpeak.history.changes': {
    one: '{count} исправление',
    few: '{count} исправления',
    many: '{count} исправлений',
    other: '{count} исправления',
  },
  'aiSpeak.history.clear': 'Очистить историю',
  'aiSpeak.journal.streakToday': {
    one: 'Серия дневника: {count} день (рекорд: {best}). Сегодняшняя запись готова.',
    few: 'Серия дневника: {count} дня (рекорд: {best}). Сегодняшняя запись готова.',
    many: 'Серия дневника: {count} дней (рекорд: {best}). Сегодняшняя запись готова.',
    other: 'Серия дневника: {count} дня (рекорд: {best}). Сегодняшняя запись готова.',
  },
  'aiSpeak.journal.streakOpen': {
    one: 'Серия дневника: {count} день (рекорд: {best}). Закончите сегодняшнюю запись, чтобы её сохранить.',
    few: 'Серия дневника: {count} дня (рекорд: {best}). Закончите сегодняшнюю запись, чтобы её сохранить.',
    many: 'Серия дневника: {count} дней (рекорд: {best}). Закончите сегодняшнюю запись, чтобы её сохранить.',
    other: 'Серия дневника: {count} дня (рекорд: {best}). Закончите сегодняшнюю запись, чтобы её сохранить.',
  },
  'aiSpeak.journal.streakNone': 'Закончите запись (все слова, достаточно предложений), чтобы начать серию дневника.',
};
