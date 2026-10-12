// Eager AI strings — ru. See ./en.ts.

import type { Catalog } from '../core';

export const AI_EAGER_UI_RU: Catalog = {
  // The Study command box parses a command without AI too; its intent labels
  // are shown by the non-AI path (`shared/studyFilterRecipe.ts`).
  'study.command.intent.undo-filter': 'Отменить последнее изменение фильтра',
  'study.command.intent.preview-anki': 'Предпросмотр экспорта в Anki',
  'study.command.intent.preview-cards': 'Предпросмотр карточек',
  'study.command.intent.levels': 'Убрать слова уровней {levels}',
  'study.command.intent.minimum': 'Оставить только слова, встречающиеся не менее {count} раз',
  'study.command.intent.maximum': 'Оставить не более {count} карточек',
  'study.command.intent.excludeKnown': 'Исключить уже известные слова',
  'study.command.intent.includeKnown': 'Включить уже известные слова',
  'study.command.intent.excludeDuplicates': 'Исключить повторяющиеся слова',
  'study.command.intent.includeDuplicates': 'Включить повторяющиеся слова',
  'study.command.intent.excludeAnki': 'Исключить слова, которые уже есть в Anki',
  'study.command.intent.includeAnki': 'Включить слова, которые уже есть в Anki',
  'study.command.intent.excludeNames': 'Исключить имена',
  'study.command.intent.includeNames': 'Включить имена',

  // Agent plan refusals, resolved by code in the Agent workspace.
  'agent.plan.error.cloud-disabled':
    'Агенту не разрешено использовать облако. Разрешите это в «Настройки → ИИ» или стройте план с офлайн-моделью.',

  // "Suggest targets" on the daily goal: a rule first, AI optional.
  'aiTutor.goal.button': 'Предложить цели',

  // Navigation entries for the conversation partner, shown in the command
  // palette and the Blanc tool list before any AI surface has opened.
  'blanc.tool.conversation': 'Собеседник',
  'blanc.tool.conversation.desc': 'Ролевые сцены на изучаемом языке: офлайн-реплики по сценарию или ИИ-собеседник под ваш уровень.',
  'aiSpeak.paletteTerms': 'собеседник разговор чат говорение практика ролевая игра',

  // Rendered with AI off or before any AI surface opens: the Settings > AI
  // per-feature permission rows (`shared/aiSetup.ts`), credential and mirror
  // settings rows, the settings search entry, the assistant card, and the
  // deck row's saved-extras button.
  'aiStudy.feature.whyWrong': '«Почему я ошибся?» в карточках',
  'aiStudy.feature.whyWrong.desc': 'Когда вы открываете «Почему я ошибся?», отправляются карточка, ваш ответ и несколько похожих карточек из колоды.',
  'aiStudy.feature.exampleSentences': 'Примеры предложений i+1',
  'aiStudy.feature.exampleSentences.desc': 'Когда вы просите примеры, отправляются карточка и выборка до 200 известных вам слов.',
  'aiStudy.feature.leechRescue': 'Советы по «пиявкам»',
  'aiStudy.feature.leechRescue.desc': 'Когда вы просите совет, отправляются карточка-«пиявка» и несколько похожих карточек из колоды.',
  'aiStudy.feature.contextExplain': '«Объяснить в контексте» во всплывающем словаре',
  'aiStudy.feature.contextExplain.desc': 'Когда вы нажимаете «Объяснить в контексте», отправляются слово, предложение, где оно встретилось, и его словарные значения.',
  'aiStudy.close': 'Закрыть',
  'aiStudy.extras.open': 'Примеры и заметки для {word}',
  'aiStudy.extras.panel': 'Примеры и заметки: {word}',
  // Blanc Deck tool: the row button that opens the same saved-extras panel.
  'blanc.shell.deck.extras': 'Заметки',
  'aiProv.features.title': 'Что может использовать облако',
  'aiProv.features.desc':
    'С облачным движком текст провайдеру отправляют только включённые здесь функции. Остальные используют офлайн-модель или не работают.',
  'aiProv.feature.cardGen': 'AI-студия карточек',
  'aiProv.feature.cardGen.desc': 'Выбранные слова и пресеты отправляются, когда вы нажимаете «Создать».',
  'aiProv.feature.mirror': 'Отзыв в «Зеркальном письме»',
  'aiProv.feature.mirror.desc': 'Черновик, карта идей и образцовый ответ отправляются, когда вы нажимаете «Оценить».',
  'aiProv.feature.subtitleTranslate': 'Фоновый перевод субтитров',
  'aiProv.feature.subtitleTranslate.desc':
    'Целые дорожки субтитров отправляются без нажатия кнопки — для серий, которые вы смотрите или отметили «Смотрю». Выключено: переводит офлайн-модель.',
  'aiProv.credential.anthropic.desc': 'Claude Haiku, Sonnet и Opus для всех облачных функций ИИ.',
  'aiProv.credential.openai.desc': 'Модели OpenAI для всех облачных функций ИИ.',
  'aiProv.credential.compat.desc':
    'Нужен, только если ваш OpenAI-совместимый сервер требует ключ. Ollama и LM Studio его не требуют.',
  'aiProv.credential.mirror.desc': 'Ключ для собственного адреса, на который «Зеркальное письмо» может отправлять черновики.',
  'aiProv.credential.use.mirror': '«Зеркальное письмо» (свой адрес)',
  'aiProv.mirror.backend.appAi': 'ИИ приложения («Настройки → ИИ»)',
  'aiProv.mirror.appAiNote': 'Черновики оценивает движок и провайдер, выбранные в «Настройки → ИИ».',
  'aiProv.mirror.appAiNotReady': 'ИИ ещё не настроен, поэтому пока черновики оценивает быстрая проверка.',
  'aiProv.mirror.model': 'Модель',
  'aiProv.mirror.modelHint': 'OpenAI, Ollama и LM Studio требуют название модели, например gpt-5-mini или qwen3:8b.',
  'aiProv.mirror.urlHint':
    'Полный адрес chat-completions или базовый, например http://localhost:11434/v1 (Ollama) или http://localhost:1234/v1 (LM Studio).',
  'aiProv.mirror.keyPlaceholder': 'Вставьте ключ (необязательно)',
  'aiProv.mirror.keySave': 'Сохранить ключ',
  'aiProv.mirror.keyRemove': 'Удалить ключ',
  'aiProv.mirror.keySaved': 'Ключ сохранён в зашифрованном хранилище.',
  'aiProv.mirror.keyNone': 'Ключ не сохранён. Локальному серверу он не нужен.',
  'aiProv.mirror.keyFailed': 'Не удалось сохранить ключ.',
  'aiAgent.feature.agentChat': 'Чат и планы агента',
  'aiAgent.feature.agentChat.desc':
    'Когда вы отправляете запрос облачной модели или строите с ней план, отправляются ваше сообщение, предыдущий разговор и прикреплённый контекст. Сохранённые слова и результаты повторений остаются на этом устройстве, пока вы не разрешите их в настройках агента.',
  'aiAgent.feature.mediaAssistant': 'Помощник для видео и визуальных новелл',
  'aiAgent.feature.mediaAssistant.desc': 'Когда вы выбираете режим помощника, отправляются текущая реплика и название.',
  'aiAgent.feature.subtitleFusion': 'Второе мнение при слиянии субтитров',
  'aiAgent.feature.subtitleFusion.desc':
    'Когда задача слияния запускается с настроенной облачной моделью, отправляются спорные строки расшифровки и их эталонные переводы.',
  'aiAgent.feature.ankiAdditions': 'ИИ-дополнения в мастерской колод',
  'aiAgent.feature.ankiAdditions.desc': 'Выбранные поля заметок отправляются, когда вы нажимаете «Создать» или «Перевести».',
  'aiImmerse.feature.mediaBrief': 'Краткое содержание видео и вопросы на понимание',
  'aiImmerse.feature.mediaBrief.desc': 'По нажатию «Содержание и вопросы» отправляет субтитры изучаемого видео частями.',
  'aiImmerse.feature.linePick': 'Выбор лучших фраз i+1 для карточек',
  'aiImmerse.feature.linePick.desc': 'По нажатию «Выбрать фразы с ИИ» отправляет до 24 фраз, в каждой из которых одно незнакомое слово.',
  'aiImmerse.feature.readerExplain': 'Объяснение предложения i+1 (читалка)',
  'aiImmerse.feature.readerExplain.desc': 'По нажатию «Объяснить» отправляет предложение и его абзац из читалки погружения.',
  'aiImmerse.feature.readerSimplify': 'Упрощение абзаца (читалка)',
  'aiImmerse.feature.readerSimplify.desc': 'По нажатию «Упростить» отправляет один абзац (не более 1500 символов) и его незнакомые слова.',
  'aiImmerse.feature.vnExplain': 'Объяснение реплики визуальной новеллы',
  'aiImmerse.feature.vnExplain.desc': 'По нажатию «Объяснить» или E отправляет реплику, говорящего и предыдущие реплики.',
  'aiImmerse.feature.vnTranslate': 'Перевод реплик визуальной новеллы с учётом контекста',
  'aiImmerse.feature.vnTranslate.desc': 'Отправляет реплику без перевода, говорящего и две предыдущие реплики.',
  'aiImmerse.feature.studyCommand': 'Понимание учебных команд в свободной форме',
  'aiImmerse.feature.studyCommand.desc': 'Отправляет текст из поля учебных команд, если встроенные фразы к нему не подходят.',
  'aiTutor.feature.grammarExplain': 'Грамматика: «Объяснить конструкцию»',
  'aiTutor.feature.grammarExplain.desc': 'При нажатии «Объяснить конструкцию» отправляется грамматический пункт (конструкция, уровень, значение).',
  'aiTutor.feature.grammarExamples': 'Грамматика: примеры предложений',
  'aiTutor.feature.grammarExamples.desc': 'При запросе новых примеров отправляются грамматический пункт и его текущие примеры.',
  'aiTutor.feature.grammarProduction': 'Грамматика: проверка моего предложения',
  'aiTutor.feature.grammarProduction.desc': 'При нажатии «Проверить» отправляются грамматический пункт и ваше предложение.',
  'aiTutor.feature.grammarSighting': 'Грамматика: проверка найденных примеров',
  'aiTutor.feature.grammarSighting.desc': 'При нажатии «Проверить с ИИ» отправляется до шести предложений из ваших материалов, где найдена конструкция.',
  'aiTutor.feature.statsCoach': 'Статистика: «Объяснить мою статистику»',
  'aiTutor.feature.statsCoach.desc': 'Отправляется числовая сводка повторений (только количества и проценты, без слов и названий). Также нужно разрешить передачу учебных данных в настройках агента.',
  'aiTutor.feature.goalSuggest': 'Предложения для дневной цели',
  'aiTutor.feature.goalSuggest.desc': 'Отправляются средние значения за две недели и текущие цели. Также нужно разрешить передачу учебных данных в настройках агента.',
  'aiTutor.feature.eventParse': 'Календарь: описать событие словами',
  'aiTutor.feature.eventParse.desc': 'При нажатии «Спросить ИИ» отправляются ваш текст и сегодняшняя дата.',
  'aiTutor.feature.placementQuiz': 'Тест уровня при первом запуске',
  'aiTutor.feature.placementQuiz.desc': 'Для получения вопросов отправляются только изучаемый язык и язык интерфейса; ответы проверяются на этом устройстве.',
  'aiTutor.feature.settingsHelp': 'Помощь по настройкам',
  'aiTutor.feature.settingsHelp.desc': 'Если поиск ничего не нашёл и вы нажали «Спросить ИИ», отправляются ваш вопрос и список названий настроек.',
  'aiTutor.feature.blancMistake': 'Blanc: «Объяснить ошибку»',
  'aiTutor.feature.blancMistake.desc': 'Отправляются задание, правильный ответ и ваш ответ.',
  'aiTutor.feature.blancSummary': 'Blanc: запоминание кандзи и краткое содержание текста',
  'aiTutor.feature.blancSummary.desc': 'Отправляется кандзи со словарной статьёй или фрагмент текста (до 800 символов) с незнакомыми словами.',
  'aiTutor.settings.foundModel': 'Предложение ИИ для «{query}» (поиск ничего не нашёл):',
  'aiTutor.settings.reason': '({reason})',
  'aiSpeak.feature.shadowingFeedback': 'Объяснение результата шэдоуинга',
  'aiSpeak.feature.shadowingFeedback.desc': 'По кнопке «Объяснить с ИИ» отправляет строку субтитров, то, что услышала речевая модель, и оценку. Запись никогда не покидает этот компьютер.',
  'aiSpeak.feature.conversationPartner': 'Собеседник',
  'aiSpeak.feature.conversationPartner.desc': 'Отправляет ваши сообщения, последние 12 реплик и уровень. Образец знакомых слов отправляется, только если учебные данные разрешено передавать (настройки агента).',
  'aiSpeak.feature.writingCorrection': 'Исправление текста',
  'aiSpeak.feature.writingCorrection.desc': 'По кнопке «Исправить мой …» отправляет заметку или выделенный текст (не больше 2 000 символов).',
  'aiSpeak.feature.journalGrade': 'Оценка дневниковой записи',
  'aiSpeak.feature.journalGrade.desc': 'По кнопке «Оценить с ИИ» отправляет текст записи и слова задания.',

  // Section labels of the "Notes" field an export writes for a card's saved
  // extras (`shared/cardAiExtras.ts`): deck CSV, local package, AnkiConnect.
  'deckExport.notes.mnemonic': 'Подсказка для запоминания',
  'deckExport.notes.distinction': 'Не путать с',
  'deckExport.notes.examples': 'Примеры',
  'deckExport.notes.accepted': 'Тоже правильно',
};
