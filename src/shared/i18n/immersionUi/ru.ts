// Immersion browser strings (coded Reader Mode errors, read-aloud) — Russian. See ./en.ts.
import type { Catalog } from '../core';

export const IMMERSION_UI_RU: Catalog = {
  'immersionUi.error.noArticle': 'На этой странице не нашлось статьи для чтения. Переключитесь в живой режим, чтобы читать её как есть.',
  'immersionUi.error.timeout': 'Страница загружалась слишком долго. Проверьте подключение и повторите попытку.',
  'immersionUi.error.http': 'Сайт ответил ошибкой {status}, поэтому показать статью нельзя.',
  'immersionUi.error.notHtml': 'По этому адресу находится файл, а не веб-страница, поэтому режим чтения не может его показать.',
  'immersionUi.error.badUrl': 'Введите полный адрес, начинающийся с http:// или https://.',
  'immersionUi.error.network': 'Не удалось открыть страницу. Проверьте подключение и адрес, затем повторите попытку.',
  'immersionUi.error.failed': 'Не удалось прочитать эту страницу. Повторите попытку или переключитесь в живой режим.',

  'immersionUi.readAloud.aria': 'Чтение вслух',
  'immersionUi.readAloud.article': 'Читать вслух',
  'immersionUi.readAloud.articleTitle': 'Прочитать всю статью вслух, предложение за предложением',
  'immersionUi.readAloud.paragraph': 'Этот абзац',
  'immersionUi.readAloud.paragraphTitle': 'Прочитать вслух только текущий абзац: тот, где выделен текст, или первый на экране',
  'immersionUi.readAloud.pause': 'Пауза',
  'immersionUi.readAloud.resume': 'Продолжить',
  'immersionUi.readAloud.stop': 'Стоп',
  'immersionUi.readAloud.speed': 'Скорость чтения',
  'immersionUi.readAloud.loading': 'Готовим звук…',
  'immersionUi.readAloud.progress': 'Предложение {current} из {total}',
  'immersionUi.readAloud.nothing': 'На этой странице нет текста для чтения вслух.',
  'immersionUi.readAloud.noVoice.ja': 'Не установлен офлайн-голос для японского. В Windows откройте «Параметры» > «Время и язык» > «Речь», нажмите «Добавить голоса», добавьте японский и повторите попытку.',
  'immersionUi.readAloud.noVoice.zh': 'Не установлен офлайн-голос для китайского. В Windows откройте «Параметры» > «Время и язык» > «Речь», нажмите «Добавить голоса», добавьте китайский (упрощённый) и повторите попытку.',
  'immersionUi.readAloud.noVoice.ru': 'Не установлен офлайн-голос для русского. В Windows откройте «Параметры» > «Время и язык» > «Речь», нажмите «Добавить голоса», добавьте русский и повторите попытку.',
  'immersionUi.readAloud.noVoice.en': 'Не установлен офлайн-голос для английского. В Windows откройте «Параметры» > «Время и язык» > «Речь», нажмите «Добавить голоса», добавьте английский и повторите попытку.',
  'immersionUi.readAloud.noSynthesizer': 'На этом компьютере нет офлайн-синтезатора речи, поэтому статью нельзя прочитать вслух.',
  'immersionUi.readAloud.failed': 'Не удалось прочитать это предложение. Нажмите «Читать вслух», чтобы повторить.',
};
