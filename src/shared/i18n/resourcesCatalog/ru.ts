// The built-in Resources catalogue — Russian. See ./en.ts for scope and key shape.

import type { Catalog } from '../core';

export const RESOURCES_CATALOG_RU: Catalog = {
  // Dictionaries & lookup
  'resourcesCatalog.cat.dictionaries.title': 'Словари и поиск',
  'resourcesCatalog.cat.dictionaries.blurb': 'Ищите слова, кандзи и примеры предложений.',
  'resourcesCatalog.item.dictionaries.jisho':
    'Главный англо-японский словарь. Поиск по английскому, кандзи, чтению и даже рукописному вводу. На нём работает поиск в этом приложении.',
  'resourcesCatalog.item.dictionaries.weblio':
    'Огромный толковый словарь японского. Лучше всего, когда вы уже читаете определения по-японски: оттенков намного больше, чем в англоязычных словарях.',
  'resourcesCatalog.item.dictionaries.yomitan':
    'Расширение браузера: наведите курсор на любое японское слово на странице — и сразу появится определение. Современный преемник Yomichan.',
  'resourcesCatalog.item.dictionaries.10ten-reader':
    'Лёгкое расширение-словарь по наведению (бывший Rikaichamp). Отличная и более простая альтернатива Yomitan.',
  'resourcesCatalog.item.dictionaries.ichi-moe':
    'Вставьте целое японское предложение — оно разобьётся на слова с чтениями и значениями. Идеально для запутанных фраз.',
  'resourcesCatalog.item.dictionaries.takoboto':
    'Удобный словарь с отличным офлайн-приложением для Android и примерами предложений. Выручает на телефоне.',
  // Kanji & vocab (SRS)
  'resourcesCatalog.cat.kanji-srs.title': 'Кандзи и лексика (SRS)',
  'resourcesCatalog.cat.kanji-srs.blurb': 'Системы интервальных повторений, чтобы слова закрепились.',
  'resourcesCatalog.item.kanji-srs.anki':
    'Самое мощное бесплатное приложение для карточек с интервальными повторениями. Это приложение отправляет в него слова напрямую через AnkiConnect.',
  'resourcesCatalog.item.kanji-srs.wanikani':
    'Учит около 2 000 кандзи и 6 000 слов через ключи и мнемоники по фиксированному графику SRS. Первые 3 уровня бесплатны.',
  'resourcesCatalog.item.kanji-srs.jpdb-io':
    'Анализирует книги, аниме и игры, чтобы вы заранее выучили их лексику до чтения или просмотра. Отлично для погружения.',
  'resourcesCatalog.item.kanji-srs.kanji-koohii':
    'Мнемоники сообщества для каждого кандзи по методу «Remembering the Kanji». Бесплатные повторения и общие истории.',
  'resourcesCatalog.item.kanji-srs.renshuu':
    'Дружелюбный сайт «всё в одном» для тренировки кандзи, лексики и грамматики: щедрый бесплатный тариф и встроенное сообщество.',
  // Grammar references
  'resourcesCatalog.cat.grammar.title': 'Справочники по грамматике',
  'resourcesCatalog.cat.grammar.blurb': 'Подробные объяснения, когда тема никак не даётся.',
  'resourcesCatalog.item.grammar.tae-kim-s-guide':
    'Бесплатное и всеми любимое руководство по грамматике: объясняет японский так, как он на самом деле устроен, с самых основ.',
  'resourcesCatalog.item.grammar.bunpro':
    'SRS для грамматики: проводит по всем темам JLPT с упражнениями на заполнение пропусков и ссылками на внешние объяснения.',
  'resourcesCatalog.item.grammar.imabi':
    'Исключительно подробные уроки грамматики уровня учебника — от начального до продвинутого. Справочник, когда нужны все детали.',
  'resourcesCatalog.item.grammar.maggie-sensei':
    'Непринуждённые уроки с массой примеров: живой, современный и разговорный японский, которого нет в учебниках.',
  'resourcesCatalog.item.grammar.jlpt-sensei':
    'Списки грамматики, лексики и кандзи строго по уровням JLPT, с примерами к каждой теме.',
  'resourcesCatalog.item.grammar.tofugu':
    'Доступные статьи о грамматике, кандзи, культуре и стратегиях изучения — отлично объясняют «почему».',
  // Reading practice
  'resourcesCatalog.cat.reading.title': 'Практика чтения',
  'resourcesCatalog.cat.reading.blurb': 'Адаптированные книги и тексты носителей, чтобы расти в уровне.',
  'resourcesCatalog.item.reading.nhk-news-web-easy':
    'Настоящие новости, пересказанные простым японским с фуриганой и аудио. Классический первый шаг к материалам для носителей.',
  'resourcesCatalog.item.reading.satori-reader':
    'Адаптированные истории со встроенным словарём, заметками по грамматике и аудио, которые подстраиваются под уже известные вам слова.',
  'resourcesCatalog.item.reading.tadoku-free-books':
    'Бесплатные адаптированные книги по уровням для «экстенсивного чтения»: читайте много лёгкого, чтобы набрать беглость.',
  'resourcesCatalog.item.reading.watanoc':
    'Бесплатный веб-журнал на японском уровня N5–N3 с фуриганой: короткие статьи на повседневные темы.',
  'resourcesCatalog.item.reading.aozora-bunko':
    'Бесплатная японская библиотека общественного достояния: тысячи классических романов и рассказов. Используйте вместе со словарём по наведению.',
  // Listening & video
  'resourcesCatalog.cat.listening.title': 'Аудирование и видео',
  'resourcesCatalog.cat.listening.blurb': 'Тренируйте слух на понятном материале.',
  'resourcesCatalog.item.listening.comprehensible-japanese':
    'Видеоуроки от абсолютного новичка до продвинутого уровня, полностью на простом японском с наглядными картинками. Идеально для первых шагов в аудировании.',
  'resourcesCatalog.item.listening.nihongo-con-teppei':
    'Короткие дружелюбные подкасты на простом японском — сотни бесплатных выпусков для начинающих и среднего уровня.',
  'resourcesCatalog.item.listening.japanesepod101':
    'Огромная библиотека аудио- и видеоуроков с расшифровками для всех уровней. Много бесплатного плюс платные тарифы.',
  'resourcesCatalog.item.listening.game-gengo':
    'Японская грамматика на реальных скриншотах из видеоигр. Бесплатный канал на YouTube, с которым учиться по-настоящему весело.',
  'resourcesCatalog.item.listening.animelon':
    'Смотрите аниме с одновременными японскими, английскими и ромадзи-субтитрами и встроенным словарём для учёбы.',
  // Immersion tools
  'resourcesCatalog.cat.tools.title': 'Инструменты погружения',
  'resourcesCatalog.cat.tools.blurb': 'Превращают всё, что вы смотрите и читаете, в учебный материал.',
  'resourcesCatalog.item.tools.asbplayer':
    'Синхронизирует субтитры с видео и отправляет предложения (с аудио и скриншотами) прямо в Anki. Основной инструмент любителей погружения.',
  'resourcesCatalog.item.tools.language-reactor':
    'Расширение браузера, добавляющее двойные субтитры и поиск по клику в Netflix и YouTube.',
  'resourcesCatalog.item.tools.migaku':
    'Набор для погружения «всё в одном»: связывает ваши медиа, всплывающий словарь и создание карточек Anki.',
  'resourcesCatalog.item.tools.ojad':
    'Онлайн-словарь японского ударения: показывает тональный рисунок слов и даже целых предложений.',
  'resourcesCatalog.item.tools.forvo':
    'Слушайте слова и имена в произношении носителей. Отлично, чтобы проверить, как что-то звучит на самом деле.',
  // Practice & community
  'resourcesCatalog.cat.community.title': 'Практика и сообщество',
  'resourcesCatalog.cat.community.blurb': 'Живые люди, с которыми можно говорить и учиться вместе.',
  'resourcesCatalog.item.community.italki':
    'Недорогие индивидуальные уроки или непринуждённые беседы с преподавателями-носителями. Лучший способ начать говорить.',
  'resourcesCatalog.item.community.hellotalk':
    'Приложение для языкового обмена: переписывайтесь с японцами, изучающими ваш язык, со встроенными инструментами исправлений.',
  'resourcesCatalog.item.community.tandem':
    'Найдите партнёров по языковому обмену для практики в тексте, голосом или по видео в продуманном сообществе.',
  'resourcesCatalog.item.community.r-learnjapanese':
    'Большое активное сообщество для вопросов и советов по материалам; в давнем Daily Thread можно быстро получить помощь.',
  // Chinese: dictionaries & characters
  'resourcesCatalog.cat.zh-dictionaries.title': 'Китайский: словари и иероглифы',
  'resourcesCatalog.cat.zh-dictionaries.blurb': 'Ищите слова и иероглифы, учите порядок черт и тренируйте ханьцзы.',
  'resourcesCatalog.item.zh-dictionaries.pleco':
    'Стандартное приложение-словарь китайского: рукописный ввод, OCR с камеры, читалка документов и карточки. Основа бесплатна, дополнительные словари платные.',
  'resourcesCatalog.item.zh-dictionaries.mdbg':
    'Быстрый бесплатный онлайн-словарь на базе CC-CEDICT: разбор иероглифа, порядок черт и примеры слов.',
  'resourcesCatalog.item.zh-dictionaries.cc-cedict':
    'Открытый китайско-английский словарь, редактируемый сообществом (CC BY-SA), на котором построено большинство бесплатных инструментов. Скачайте его для своих колод.',
  'resourcesCatalog.item.zh-dictionaries.zhongwen':
    'Расширение-словарь по наведению для китайского: показывает пиньинь, тоны и значения на любой странице.',
  'resourcesCatalog.item.zh-dictionaries.hanzi-writer':
    'Анимированный порядок черт для тысяч упрощённых и традиционных иероглифов, с режимом теста, который проверяет каждую черту.',
  'resourcesCatalog.item.zh-dictionaries.dong-chinese':
    'Этимология иероглифов и разбор по компонентам со структурированным курсом: объясняет, почему знаки выглядят именно так.',
  'resourcesCatalog.item.zh-dictionaries.outlier-linguistics':
    'Научный словарь иероглифов, разделяющий смысловые, звуковые и формальные компоненты. Хорошо сочетается с Pleco.',
  'resourcesCatalog.item.zh-dictionaries.skritter':
    'SRS для письма ханьцзы и кандзи: пишите каждый знак на экране и получайте оценку за каждую черту.',
  'resourcesCatalog.item.zh-dictionaries.hack-chinese':
    'SRS для лексики со списками HSK и учебников и данными о частотности; повторение через аудирование и набор текста.',
  'resourcesCatalog.item.zh-dictionaries.hsk-academy':
    'Бесплатные списки слов HSK по уровням с примерами, порядком черт и листами для печати.',
  'resourcesCatalog.item.zh-dictionaries.purple-culture':
    'Конвертер пиньиня, словарь и инструменты HSK. Вставьте текст — и над каждым иероглифом появится пиньинь с тонами.',
  'resourcesCatalog.item.zh-dictionaries.chinese-text-project':
    'Классические и досовременные китайские тексты с параллельными переводами и связанным словарём. Для продвинутых.',
  // Chinese: reading, listening & grammar
  'resourcesCatalog.cat.zh-practice.title': 'Китайский: чтение, аудирование и грамматика',
  'resourcesCatalog.cat.zh-practice.blurb': 'Адаптированные рассказы, объяснения грамматики и видео носителей для аудирования.',
  'resourcesCatalog.item.zh-practice.chinese-grammar-wiki':
    'Самый полный бесплатный справочник по грамматике путунхуа: по уровням CEFR, с множеством примеров к каждой конструкции.',
  'resourcesCatalog.item.zh-practice.du-chinese':
    'Приложение для адаптированного чтения с аудио, переключателем пиньиня и поиском по нажатию — от HSK 1 до продвинутого.',
  'resourcesCatalog.item.zh-practice.mandarin-bean':
    'Бесплатные адаптированные рассказы и статьи по уровням HSK, у каждого — пиньинь, список слов и переключатель перевода.',
  'resourcesCatalog.item.zh-practice.maayot':
    'Каждый день короткий рассказ вашего уровня с быстрой проверкой понимания и собственным предложением для написания.',
  'resourcesCatalog.item.zh-practice.the-chairman-s-bao':
    'Адаптированное чтение на основе новостей с уровнями HSK, аудио и встроенными карточками.',
  'resourcesCatalog.item.zh-practice.mandarin-companion':
    'Адаптированные книги: известные романы, пересказанные по-китайски с небольшим контролируемым набором иероглифов.',
  'resourcesCatalog.item.zh-practice.readibu':
    'Читайте китайские веб-романы со всплывающим словарём, сохранёнными словами и статистикой чтения.',
  'resourcesCatalog.item.zh-practice.chinesepod':
    'Большой архив аудиоуроков на основе диалогов — от новичка до продвинутого, с расшифровками и лексикой.',
  'resourcesCatalog.item.zh-practice.bilibili':
    'Главный видеосайт Китая: аниме, влоги и лекции. У большинства видео есть китайские субтитры или текст на экране.',
  'resourcesCatalog.item.zh-practice.iqiyi':
    'Китайские дорамы и развлекательные шоу с китайскими и английскими субтитрами. Большая часть каталога бесплатна с рекламой.',
  'resourcesCatalog.item.zh-practice.r-chineselanguage':
    'Большое сообщество для вопросов о путунхуа и кантонском, списков ресурсов и дневников учёбы.',
  // Russian: dictionaries & stress
  'resourcesCatalog.cat.ru-dictionaries.title': 'Русский: словари и ударение',
  'resourcesCatalog.cat.ru-dictionaries.blurb': 'Ищите слова вместе с ударением, формами и живым употреблением.',
  'resourcesCatalog.item.ru-dictionaries.openrussian':
    'Открытый словарь русского языка с ударениями, полными таблицами склонения и спряжения, аудио и примерами.',
  'resourcesCatalog.item.ru-dictionaries.russiangram':
    'Вставьте русский текст и получите его с ударениями в каждом слове. Полезно перед чтением вслух.',
  'resourcesCatalog.item.ru-dictionaries.wiktionary-russian':
    'Русскоязычный Викисловарь: ударение, все словоформы, этимология и пометы об употреблении для огромного количества слов.',
  'resourcesCatalog.item.ru-dictionaries.gramota-ru':
    'Справочный портал по русской орфографии, ударению и употреблению: несколько академических словарей в одном поиске.',
  'resourcesCatalog.item.ru-dictionaries.multitran':
    'Огромный двуязычный словарь со специальной лексикой и переводами фраз от переводчиков.',
  'resourcesCatalog.item.ru-dictionaries.russian-national-corpus':
    'Поиск по сотням миллионов слов живого русского языка: как слово или конструкция используются на самом деле.',
  'resourcesCatalog.item.ru-dictionaries.reverso-context':
    'Показывает слово или фразу во множестве реальных пар предложений, чтобы вы видели их в контексте, а не как голый перевод.',
  // Russian: reading, listening & grammar
  'resourcesCatalog.cat.ru-practice.title': 'Русский: чтение, аудирование и грамматика',
  'resourcesCatalog.cat.ru-practice.blurb': 'Объяснения грамматики, тексты для чтения и русская речь для аудирования.',
  'resourcesCatalog.item.ru-practice.master-russian':
    'Бесплатные уроки грамматики, частотные списки и статьи о лексике — от алфавита до причастий.',
  'resourcesCatalog.item.ru-practice.russian-for-everyone':
    'Структурированный курс грамматики от начального до среднего уровня с упражнениями и текстами для чтения.',
  'resourcesCatalog.item.ru-practice.real-russian-club':
    'Уроки, подкасты и видео о повседневном русском и грамматике, многие с расшифровками.',
  'resourcesCatalog.item.ru-practice.russian-with-max':
    'Медленные и чёткие подкасты и видео на русском о культуре и повседневной жизни, с расшифровками.',
  'resourcesCatalog.item.ru-practice.easy-russian':
    'Уличные интервью с носителями с русскими и английскими субтитрами. Живая речь в естественном темпе.',
  'resourcesCatalog.item.ru-practice.russianpod101':
    'Аудио- и видеоуроки по уровням с диалогами, расшифровками и списками слов.',
  'resourcesCatalog.item.ru-practice.arzamas':
    'Бесплатные курсы и подкасты на русском о литературе, истории и искусстве. Отличное аудирование для уровня выше среднего.',
  'resourcesCatalog.item.ru-practice.lib-ru':
    'Одна из старейших русских онлайн-библиотек: классическая литература и множество текстов общественного достояния.',
  'resourcesCatalog.item.ru-practice.mosfilm-cinema':
    'Собственный сайт киностудии «Мосфильм», где её классические советские фильмы можно бесплатно смотреть онлайн.',
  'resourcesCatalog.item.ru-practice.r-russian':
    'Большое дружелюбное сообщество изучающих русский: вопросы по грамматике, ресурсы и практика.',
  // Any language
  'resourcesCatalog.cat.any-language.title': 'Для любого языка',
  'resourcesCatalog.cat.any-language.blurb': 'Инструменты, которые одинаково подходят для японского, китайского и русского.',
  'resourcesCatalog.item.any-language.tatoeba':
    'Открытая (CC BY) коллекция переведённых примеров предложений на сотнях языков, многие с аудио.',
  'resourcesCatalog.item.any-language.youglish':
    'Введите слово и услышьте его в настоящих видео на YouTube — с переходом прямо к моменту, где оно звучит.',
  'resourcesCatalog.item.any-language.forvo':
    'Записи слов и имён в произношении носителей почти на всех языках.',
  'resourcesCatalog.item.any-language.language-reactor':
    'Расширение браузера, показывающее две дорожки субтитров в Netflix и YouTube, со всплывающим словарём и сохранением слов.',
  'resourcesCatalog.item.any-language.lingq':
    'Импортируйте любой текст или видео и читайте с поиском по нажатию; сервис отслеживает, какие слова вы уже знаете.',
  'resourcesCatalog.item.any-language.readlang':
    'Веб-читалка, которая переводит слова по клику и превращает их в карточки.',
  'resourcesCatalog.item.any-language.clozemaster':
    'Упражнения на заполнение пропусков в предложениях по частотности слов — более чем для пятидесяти языков.',
  'resourcesCatalog.item.any-language.wiktionary':
    'Бесплатный многоязычный словарь: произношение, формы, этимология и переводы для миллионов слов.',
};
