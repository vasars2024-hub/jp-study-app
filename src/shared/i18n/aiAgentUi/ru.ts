import type { Catalog } from '../core';

export const AI_AGENT_UI_RU: Catalog = {
  'aiAgent.target.claudeHaiku': 'Claude Haiku 5.5 (облако)',
  'aiAgent.target.claudeSonnet': 'Claude Sonnet 5.5 (облако)',
  'aiAgent.target.claudeOpus': 'Claude Opus 5.5 (облако)',
  'aiAgent.target.openai': 'OpenAI (облако)',
  'aiAgent.target.compatible': 'Локальный сервер (Ollama, LM Studio)',

  'aiAgent.theme.unknown': 'Назовите тему, которая есть в приложении: {themes}.',
  'aiAgent.theme.cssBlancOnly':
    'Пользовательский CSS меняет только панель Blanc. Попросите об этом из Blanc или выберите здесь тему.',

  'aiAgent.assistant.mode.simplify': 'Упростить реплику',
  'aiAgent.assistant.simplified': 'Упрощённый вариант',

  'aiAgent.planError.invalidRequest': 'Сначала опишите, что должен сделать агент.',
  'aiAgent.planError.aiOff': 'Функции ИИ выключены в разделе «Настройки → ИИ».',
  'aiAgent.planError.agentDisabled': 'Агент выключен. Включите его в разделе «Настройки → ИИ».',
  'aiAgent.planError.modelMissing':
    'Не установлена офлайн-модель и не сохранён облачный ключ, поэтому план составить нельзя. Настройте одно из двух в разделе «Настройки → ИИ».',
  'aiAgent.planError.cloudKeyMissing': 'У облачного планировщика нет API-ключа. Добавьте его в разделе «Настройки → ИИ».',
  'aiAgent.planError.spendBudget': 'Составление этого плана в облаке превысит месячный лимит расходов.',
  'aiAgent.planError.cloudDisabled':
    'Агенту не разрешено пользоваться облаком. Разрешите это в разделе «Настройки → ИИ → Что может использовать облако» или установите офлайн-модель.',
  'aiAgent.planError.objectiveTooLong': 'Запрос для плана — не длиннее 500 символов. Сократите его и попробуйте снова.',
  'aiAgent.planError.contextOverflow':
    'Запрос не помещается в контекст офлайн-модели. Увеличьте размер контекста в разделе «Настройки → ИИ» или сократите запрос и вложения.',
  'aiAgent.planError.timeout': 'Модель слишком долго составляла план. Попробуйте снова или просите меньше за раз.',
  'aiAgent.planError.planInvalid':
    'Ответ модели — не тот план, который агент может выполнить. Попробуйте снова или переформулируйте запрос.',
  'aiAgent.planError.plannerFailed': 'Не удалось составить план. Попробуйте снова или проверьте раздел «Настройки → ИИ».',

  'aiAgent.loop.planned': 'Следующие шаги спланированы по результатам (раунд {round} из {max}).',
  'aiAgent.loop.done': 'Готово: по этому запросу больше ничего не нужно.',
  'aiAgent.loop.doneSummary': 'Готово: {summary}',

  'aiAgent.reviews.changedSince':
    'Некоторые из этих карточек с тех пор повторены или перенесены, поэтому ничего не изменено.',
  'aiAgent.reviews.folderNotFound': 'Папки колоды «{folder}» нет.',
};
