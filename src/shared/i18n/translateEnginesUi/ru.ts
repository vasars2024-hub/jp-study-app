// Translate engines pass (xlate2.) — Russian.

import type { Catalog } from '../core';

export const TRANSLATE_ENGINES_UI_RU: Catalog = {
  // ---- Engine names ----
  'xlate2.provider.local': 'Офлайн (малая модель)',
  'xlate2.provider.localLarge': 'Офлайн, выше качество (больше и медленнее)',

  // ---- Engine picker ----
  'xlate2.engine.label': 'Движок',
  'xlate2.engine.hint': 'Запоминается отдельно для каждой языковой пары ({pair}).',
  'xlate2.engine.needsKey': 'добавьте API-ключ в настройках',
  'xlate2.engine.notInstalled': 'не установлена',
  'xlate2.engine.fallback': 'Если облачный движок не сработал, переводить офлайн',
  'xlate2.engine.fallbackHint': 'Когда облачный движок недоступен, ограничен по частоте запросов или упёрся в бюджет, текст переводится офлайн вместо ошибки.',
  'xlate2.engine.largeMissing': 'Большая модель не установлена. Приложение не умеет её скачивать: положите более крупную модель Qwen3, например {file}, в папку моделей приложения или в «Загрузки», и она появится здесь. Ей нужно от 8 ГБ памяти, и она в несколько раз медленнее.',
  'xlate2.engine.largeReady': 'Используется {file}. Каждое предложение займёт в несколько раз больше времени, чем с малой моделью.',
  'xlate2.engine.cloudActive': 'Текст, который вы переводите здесь в этой языковой паре, отправляется в {provider} ({host}). Всплывающие переводы в читалке, субтитры и словарь по-прежнему переводятся офлайн.',
  'xlate2.engine.cloudShort': 'Отправляется в {provider} для перевода',

  // ---- Consent ----
  'xlate2.consent.title': 'Отправлять текст в {provider}?',
  'xlate2.consent.body': 'При переводе через {provider} переводимый текст отправляется через интернет на {host} и обрабатывается по условиям {provider}. Текст покидает это устройство.',
  'xlate2.consent.scope': 'Отправляются только сам фрагмент и встречающиеся в нём термины глоссария. История, колода и остальной глоссарий остаются здесь.',
  'xlate2.consent.billingMt': 'Используются ваш ключ DeepL и его лимит символов. Платное использование учитывается в месячном лимите расходов на ИИ в настройках.',
  'xlate2.consent.billingLlm': 'Используется ваш API-ключ. Запросы учитываются в месячном лимите расходов на ИИ в настройках.',
  'xlate2.consent.allow': 'Разрешить {provider}',
  'xlate2.consent.decline': 'Продолжать переводить офлайн',
  'xlate2.consent.revoke': 'Больше не отправлять текст в {provider}',

  // ---- Progress and results ----
  'xlate2.progress.sentences': 'Переведено предложений: {done} из {total}',
  'xlate2.result.by': 'Перевод: {provider}',
  'xlate2.result.fellBack': '{provider} не смог перевести этот текст ({reason}), поэтому перевела офлайн-модель.',
  'xlate2.error.cloud': '{provider} не смог перевести этот текст: {reason}.',

  // ---- Why a cloud engine did not answer ----
  'xlate2.fallback.consent': 'вы не разрешили отправлять ему текст',
  'xlate2.fallback.noKey': 'API-ключ не сохранён',
  'xlate2.fallback.auth': 'API-ключ отклонён',
  'xlate2.fallback.rateLimit': 'слишком много запросов, повторите чуть позже',
  'xlate2.fallback.quota': 'квота аккаунта исчерпана',
  'xlate2.fallback.spend': 'будет превышен месячный лимит расходов',
  'xlate2.fallback.network': 'сервис недоступен',
  'xlate2.fallback.timeout': 'истекло время ожидания запроса',
  'xlate2.fallback.invalid': 'ответ не оказался пригодным переводом',
  'xlate2.fallback.tooLong': 'текст слишком длинный, чтобы отправить его целиком',
  'xlate2.fallback.notInstalled': 'модель не установлена',
  'xlate2.fallback.unsupported': 'эта языковая пара не поддерживается',
  'xlate2.fallback.other': 'непредвиденная ошибка',

  // ---- Glossary ----
  'xlate2.glossary.toggle': 'Глоссарий ({count})',
  'xlate2.glossary.title': 'Глоссарий',
  'xlate2.glossary.intro': 'Слова, которые всегда нужно переводить одинаково, например имена и устойчивые выражения. Применяются к каждому переводу, где они встречаются.',
  'xlate2.glossary.term': 'Термин',
  'xlate2.glossary.rendering': 'Всегда переводить как',
  'xlate2.glossary.pairOnly': 'Только для {pair}',
  'xlate2.glossary.add': 'Сохранить термин',
  'xlate2.glossary.saved': 'Сохранено: «{term}».',
  'xlate2.glossary.invalid': 'Введите термин и отличающийся от него перевод, каждый до 80 символов.',
  'xlate2.glossary.suggestTitle': 'Предложения из вашей колоды ({count})',
  'xlate2.glossary.useSuggestion': 'Добавить',
  'xlate2.glossary.empty': 'Для {pair} терминов пока нет.',
  'xlate2.glossary.listLabel': 'Термины глоссария для {pair}',
  'xlate2.glossary.allPairs': 'все языковые пары',
  'xlate2.glossary.fromDeck': 'из колоды',
  'xlate2.glossary.edit': 'Изменить',
  'xlate2.glossary.otherPairs': {
    one: 'Ещё {count} термин относится к другим языковым парам.',
    few: 'Ещё {count} термина относятся к другим языковым парам.',
    many: 'Ещё {count} терминов относятся к другим языковым парам.',
    other: 'Ещё {count} термина относятся к другим языковым парам.',
  },
  'xlate2.glossary.report': 'Термины глоссария соблюдены: {count} из {total}.',
  'xlate2.glossary.missing': 'Не соблюдены: {terms}.',

  // ---- Credentials row ----
  'xlate2.credential.deeplDesc': 'API машинного перевода DeepL — необязательный движок для рабочего места перевода.',
  'xlate2.credential.deeplFreeTier': 'Ключи DeepL API Free оканчиваются на «:fx» и включают месячный лимит символов; актуальный лимит смотрите в своём аккаунте DeepL.',
  'xlate2.credential.useTranslate': 'Рабочее место перевода (необязательный облачный движок)',
};
