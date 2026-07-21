#!/usr/bin/env node
/** Inject GrammarX chrome keys into catalogs.ts (en/ja/zh/ru). */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'catalogs.ts');
let s = fs.readFileSync(file, 'utf8');

const blocks = {
  en: `
  'palette.section.notebook': 'Notebook',
  'grammar.mode.practice': 'Practice',
  'grammar.intro':
    'JLPT N5–N1 and HSK 1–10 grammar, plus Practice builder, tests, and guides.',
  'grammar.practice.filters': 'Filters',
  'grammar.practice.lang': 'Language',
  'grammar.practice.lang.ja': 'Japanese',
  'grammar.practice.lang.zh': 'Chinese',
  'grammar.practice.levels': 'Levels',
  'grammar.practice.register': 'Register',
  'grammar.practice.register.business': 'Business',
  'grammar.practice.register.casual': 'Casual',
  'grammar.practice.search': 'Search',
  'grammar.practice.searchPlaceholder': 'Filter by pattern or meaning…',
  'grammar.practice.functions': 'Function list',
  'grammar.practice.functionsSearch': 'Filter functions…',
  'grammar.practice.results': 'Grammar points',
  'grammar.practice.visibleCount': {
    one: '{count} visible',
    other: '{count} visible',
  },
  'grammar.practice.selectedCount': {
    one: '{count} selected',
    other: '{count} selected',
  },
  'grammar.practice.selectAll': 'Select all visible',
  'grammar.practice.clear': 'Clear',
  'grammar.practice.empty': 'No grammar points match these filters.',
  'grammar.practice.addToDeck': 'Add to deck',
  'grammar.practice.exportAnki': 'Export to Anki',
  'grammar.practice.startTest': 'Grammar Test',
  'grammar.practice.status.noneSelected': 'Select at least one grammar point.',
  'grammar.practice.status.addedToDeck': {
    one: 'Added {count} card to Grammar deck.',
    other: 'Added {count} cards to Grammar deck.',
  },
  'grammar.practice.status.ankiExport': 'Anki export: {ok} ok, {fail} failed.',
  'grammar.test.title': 'Grammar Test',
  'grammar.test.setupHint': {
    one: '{count} point matches your filters. Choose how many cards to practice.',
    other: '{count} points match your filters. Choose how many cards to practice.',
  },
  'grammar.test.noPool': 'No grammar points in the current filter set.',
  'grammar.test.custom': 'Custom',
  'grammar.test.start': 'Start',
  'grammar.test.progress': 'Card {current} of {total}',
  'grammar.test.reveal': 'Reveal meaning',
  'grammar.test.again': 'Again',
  'grammar.test.hard': 'Hard',
  'grammar.test.good': 'Good',
  'grammar.test.score': 'Score: {good}/{total} good · {missed} missed',
  'grammar.test.addMissed': 'Add missed to deck',
  'grammar.test.retry': 'Retry',
  'translate.tab.translate': 'Translate',
  'translate.tab.history': 'History',
  'translate.intro': 'Offline translation via Qwen3 on your machine — Japanese, Chinese, English, Russian.',
  'translate.outputPlaceholder': 'Translation appears here.',
  'translate.working': 'Working…',
  'translate.menu.file': 'File',
  'translate.menu.clear': 'Clear text',
  'translate.menu.tools': 'Tools',
  'translate.menu.swap': 'Swap languages',
  'translate.menu.translate': 'Translate',
  'translate.msg.loadingModel': 'Loading the translation model…',
  'translate.msg.loadingFile': 'Loading model: {file} — {pct}%',
  'translate.msg.translating': 'Translating… {pct}%',
  'translate.history.emptyTitle': 'No translation history yet',
  'translate.history.emptyBody': 'Completed translations appear here for copy, re-run, mining, and Notebook.',
  'translate.history.clear': 'Clear history',
  'translate.history.copy': 'Copy',
  'translate.history.rerun': 'Re-run',
  'translate.history.mine': 'Mine sentence',
  'translate.history.toNotebook': 'Send to Notebook',
  'notebook.status': 'Notebook',
  'notebook.count': {
    one: '{count} entry',
    other: '{count} entries',
  },
  'notebook.review': 'Review Notebook',
  'notebook.refresh': 'Refresh',
  'notebook.empty.title': 'Notebook is empty',
  'notebook.empty.body': 'Saved words, lookups, mines, translations, highlights, and extension captures gather here.',
  'notebook.stream.saved-words': 'Saved words',
  'notebook.stream.lookups': 'Lookups',
  'notebook.stream.flashcards': 'Flashcards',
  'notebook.stream.anki': 'Anki',
  'notebook.stream.mining': 'Mining',
  'notebook.stream.known': 'Known levels',
  'notebook.stream.translations': 'Translations',
  'notebook.stream.plan': 'Plan to read',
  'notebook.stream.highlights': 'Highlights',
  'notebook.stream.ocr': 'OCR',
  'notebook.stream.audio': 'Audio',
  'notebook.stream.clipboard': 'Clipboard',
  'notebook.stream.extension': 'Extension',
`,
  ja: `
  'palette.section.notebook': 'ノートブック',
  'grammar.mode.practice': '練習',
  'grammar.intro': 'JLPT N5〜N1 と HSK 1〜10 の文法、練習ビルダー、テスト、ガイド。',
  'grammar.practice.filters': 'フィルター',
  'grammar.practice.lang': '言語',
  'grammar.practice.lang.ja': '日本語',
  'grammar.practice.lang.zh': '中国語',
  'grammar.practice.levels': 'レベル',
  'grammar.practice.register': 'レジスター',
  'grammar.practice.register.business': 'ビジネス',
  'grammar.practice.register.casual': 'カジュアル',
  'grammar.practice.search': '検索',
  'grammar.practice.searchPlaceholder': 'パターンや意味で絞り込み…',
  'grammar.practice.functions': '機能一覧',
  'grammar.practice.functionsSearch': '機能を検索…',
  'grammar.practice.results': '文法項目',
  'grammar.practice.visibleCount': { other: '{count}件表示' },
  'grammar.practice.selectedCount': { other: '{count}件選択' },
  'grammar.practice.selectAll': '表示中をすべて選択',
  'grammar.practice.clear': 'クリア',
  'grammar.practice.empty': '条件に合う文法項目がありません。',
  'grammar.practice.addToDeck': 'デッキに追加',
  'grammar.practice.exportAnki': 'Ankiへ書き出し',
  'grammar.practice.startTest': '文法テスト',
  'grammar.practice.status.noneSelected': '文法項目を1つ以上選択してください。',
  'grammar.practice.status.addedToDeck': { other: 'Grammarデッキに{count}枚追加しました。' },
  'grammar.practice.status.ankiExport': 'Anki書き出し: 成功 {ok} / 失敗 {fail}',
  'grammar.test.title': '文法テスト',
  'grammar.test.setupHint': { other: 'フィルター結果は{count}件です。カード数を選んでください。' },
  'grammar.test.noPool': '現在のフィルターに文法項目がありません。',
  'grammar.test.custom': 'カスタム',
  'grammar.test.start': '開始',
  'grammar.test.progress': '{current} / {total}',
  'grammar.test.reveal': '意味を表示',
  'grammar.test.again': 'もう一度',
  'grammar.test.hard': '難しい',
  'grammar.test.good': 'できた',
  'grammar.test.score': 'スコア: {good}/{total} · ミス {missed}',
  'grammar.test.addMissed': 'ミスをデッキへ',
  'grammar.test.retry': '再挑戦',
  'translate.tab.translate': '翻訳',
  'translate.tab.history': '履歴',
  'translate.intro': 'Qwen3によるオフライン翻訳（日・中・英・露）。',
  'translate.outputPlaceholder': '翻訳結果がここに表示されます。',
  'translate.working': '処理中…',
  'translate.menu.file': 'ファイル',
  'translate.menu.clear': 'テキストをクリア',
  'translate.menu.tools': 'ツール',
  'translate.menu.swap': '言語を入れ替え',
  'translate.menu.translate': '翻訳',
  'translate.msg.loadingModel': '翻訳モデルを読み込み中…',
  'translate.msg.loadingFile': 'モデル読み込み: {file} — {pct}%',
  'translate.msg.translating': '翻訳中… {pct}%',
  'translate.history.emptyTitle': '翻訳履歴はまだありません',
  'translate.history.emptyBody': '完了した翻訳がここに集まり、コピー・再実行・マイニング・ノートブックへ送れます。',
  'translate.history.clear': '履歴をクリア',
  'translate.history.copy': 'コピー',
  'translate.history.rerun': '再実行',
  'translate.history.mine': '文をマイニング',
  'translate.history.toNotebook': 'ノートブックへ',
  'notebook.status': 'ノートブック',
  'notebook.count': { other: '{count}件' },
  'notebook.review': 'ノートブックを復習',
  'notebook.refresh': '更新',
  'notebook.empty.title': 'ノートブックは空です',
  'notebook.empty.body': '保存語・検索・マイニング・翻訳・ハイライト・拡張の記録がここに集まります。',
  'notebook.stream.saved-words': '保存した語',
  'notebook.stream.lookups': '検索履歴',
  'notebook.stream.flashcards': 'フラッシュカード',
  'notebook.stream.anki': 'Anki',
  'notebook.stream.mining': 'マイニング',
  'notebook.stream.known': '既知レベル',
  'notebook.stream.translations': '翻訳',
  'notebook.stream.plan': '読む予定',
  'notebook.stream.highlights': 'ハイライト',
  'notebook.stream.ocr': 'OCR',
  'notebook.stream.audio': '音声',
  'notebook.stream.clipboard': 'クリップボード',
  'notebook.stream.extension': '拡張機能',
`,
  zh: `
  'palette.section.notebook': '笔记本',
  'grammar.mode.practice': '练习',
  'grammar.intro': 'JLPT N5–N1 与 HSK 1–10 语法，含练习构建器、测试与指南。',
  'grammar.practice.filters': '筛选',
  'grammar.practice.lang': '语言',
  'grammar.practice.lang.ja': '日语',
  'grammar.practice.lang.zh': '中文',
  'grammar.practice.levels': '等级',
  'grammar.practice.register': '语体',
  'grammar.practice.register.business': '商务',
  'grammar.practice.register.casual': '口语',
  'grammar.practice.search': '搜索',
  'grammar.practice.searchPlaceholder': '按句型或释义筛选…',
  'grammar.practice.functions': '功能列表',
  'grammar.practice.functionsSearch': '筛选功能…',
  'grammar.practice.results': '语法点',
  'grammar.practice.visibleCount': { other: '显示 {count} 项' },
  'grammar.practice.selectedCount': { other: '已选 {count} 项' },
  'grammar.practice.selectAll': '全选可见',
  'grammar.practice.clear': '清除',
  'grammar.practice.empty': '没有符合筛选的语法点。',
  'grammar.practice.addToDeck': '加入卡组',
  'grammar.practice.exportAnki': '导出到 Anki',
  'grammar.practice.startTest': '语法测试',
  'grammar.practice.status.noneSelected': '请至少选择一个语法点。',
  'grammar.practice.status.addedToDeck': { other: '已向 Grammar 卡组添加 {count} 张卡片。' },
  'grammar.practice.status.ankiExport': 'Anki 导出：成功 {ok}，失败 {fail}',
  'grammar.test.title': '语法测试',
  'grammar.test.setupHint': { other: '当前筛选有 {count} 项。选择练习卡片数量。' },
  'grammar.test.noPool': '当前筛选没有语法点。',
  'grammar.test.custom': '自定义',
  'grammar.test.start': '开始',
  'grammar.test.progress': '第 {current} / {total} 张',
  'grammar.test.reveal': '显示释义',
  'grammar.test.again': '重来',
  'grammar.test.hard': '困难',
  'grammar.test.good': '掌握',
  'grammar.test.score': '得分：{good}/{total} · 错过 {missed}',
  'grammar.test.addMissed': '错过项加入卡组',
  'grammar.test.retry': '再试一次',
  'translate.tab.translate': '翻译',
  'translate.tab.history': '历史',
  'translate.intro': '本机 Qwen3 离线翻译（日/中/英/俄）。',
  'translate.outputPlaceholder': '译文显示在这里。',
  'translate.working': '处理中…',
  'translate.menu.file': '文件',
  'translate.menu.clear': '清空文本',
  'translate.menu.tools': '工具',
  'translate.menu.swap': '交换语言',
  'translate.menu.translate': '翻译',
  'translate.msg.loadingModel': '正在加载翻译模型…',
  'translate.msg.loadingFile': '加载模型：{file} — {pct}%',
  'translate.msg.translating': '翻译中… {pct}%',
  'translate.history.emptyTitle': '暂无翻译历史',
  'translate.history.emptyBody': '完成的翻译会出现在这里，可复制、重跑、挖句或送入笔记本。',
  'translate.history.clear': '清空历史',
  'translate.history.copy': '复制',
  'translate.history.rerun': '重跑',
  'translate.history.mine': '挖句',
  'translate.history.toNotebook': '送到笔记本',
  'notebook.status': '笔记本',
  'notebook.count': { other: '{count} 条' },
  'notebook.review': '复习笔记本',
  'notebook.refresh': '刷新',
  'notebook.empty.title': '笔记本为空',
  'notebook.empty.body': '生词、查询、挖矿、翻译、高亮与扩展捕获会汇总到这里。',
  'notebook.stream.saved-words': '生词',
  'notebook.stream.lookups': '查询',
  'notebook.stream.flashcards': '闪卡',
  'notebook.stream.anki': 'Anki',
  'notebook.stream.mining': '挖矿',
  'notebook.stream.known': '已知等级',
  'notebook.stream.translations': '翻译',
  'notebook.stream.plan': '待读',
  'notebook.stream.highlights': '高亮',
  'notebook.stream.ocr': 'OCR',
  'notebook.stream.audio': '音频',
  'notebook.stream.clipboard': '剪贴板',
  'notebook.stream.extension': '扩展',
`,
  ru: `
  'palette.section.notebook': 'Блокнот',
  'grammar.mode.practice': 'Практика',
  'grammar.intro': 'Грамматика JLPT N5–N1 и HSK 1–10, конструктор практики, тесты и гайды.',
  'grammar.practice.filters': 'Фильтры',
  'grammar.practice.lang': 'Язык',
  'grammar.practice.lang.ja': 'Японский',
  'grammar.practice.lang.zh': 'Китайский',
  'grammar.practice.levels': 'Уровни',
  'grammar.practice.register': 'Регистр',
  'grammar.practice.register.business': 'Деловой',
  'grammar.practice.register.casual': 'Разговорный',
  'grammar.practice.search': 'Поиск',
  'grammar.practice.searchPlaceholder': 'Фильтр по конструкции или значению…',
  'grammar.practice.functions': 'Список функций',
  'grammar.practice.functionsSearch': 'Фильтр функций…',
  'grammar.practice.results': 'Пункты грамматики',
  'grammar.practice.visibleCount': {
    one: '{count} видно',
    few: '{count} видно',
    many: '{count} видно',
    other: '{count} видно',
  },
  'grammar.practice.selectedCount': {
    one: '{count} выбрано',
    few: '{count} выбрано',
    many: '{count} выбрано',
    other: '{count} выбрано',
  },
  'grammar.practice.selectAll': 'Выбрать все видимые',
  'grammar.practice.clear': 'Очистить',
  'grammar.practice.empty': 'Нет пунктов под эти фильтры.',
  'grammar.practice.addToDeck': 'В колоду',
  'grammar.practice.exportAnki': 'Экспорт в Anki',
  'grammar.practice.startTest': 'Тест по грамматике',
  'grammar.practice.status.noneSelected': 'Выберите хотя бы один пункт.',
  'grammar.practice.status.addedToDeck': {
    one: 'В колоду Grammar добавлена {count} карта.',
    few: 'В колоду Grammar добавлено {count} карты.',
    many: 'В колоду Grammar добавлено {count} карт.',
    other: 'В колоду Grammar добавлено {count} карт.',
  },
  'grammar.practice.status.ankiExport': 'Экспорт Anki: {ok} ок, {fail} ошибок.',
  'grammar.test.title': 'Тест по грамматике',
  'grammar.test.setupHint': {
    one: 'Фильтрам соответствует {count} пункт. Выберите число карточек.',
    few: 'Фильтрам соответствуют {count} пункта. Выберите число карточек.',
    many: 'Фильтрам соответствуют {count} пунктов. Выберите число карточек.',
    other: 'Фильтрам соответствуют {count} пунктов. Выберите число карточек.',
  },
  'grammar.test.noPool': 'В текущем наборе фильтров нет пунктов.',
  'grammar.test.custom': 'Своё',
  'grammar.test.start': 'Старт',
  'grammar.test.progress': 'Карточка {current} из {total}',
  'grammar.test.reveal': 'Показать значение',
  'grammar.test.again': 'Снова',
  'grammar.test.hard': 'Сложно',
  'grammar.test.good': 'Хорошо',
  'grammar.test.score': 'Счёт: {good}/{total} · пропущено {missed}',
  'grammar.test.addMissed': 'Пропущенные в колоду',
  'grammar.test.retry': 'Ещё раз',
  'translate.tab.translate': 'Перевод',
  'translate.tab.history': 'История',
  'translate.intro': 'Офлайн-перевод Qwen3 (яп./кит./англ./рус.).',
  'translate.outputPlaceholder': 'Перевод появится здесь.',
  'translate.working': 'Работаю…',
  'translate.menu.file': 'Файл',
  'translate.menu.clear': 'Очистить текст',
  'translate.menu.tools': 'Инструменты',
  'translate.menu.swap': 'Поменять языки',
  'translate.menu.translate': 'Перевести',
  'translate.msg.loadingModel': 'Загрузка модели перевода…',
  'translate.msg.loadingFile': 'Загрузка модели: {file} — {pct}%',
  'translate.msg.translating': 'Перевод… {pct}%',
  'translate.history.emptyTitle': 'История переводов пуста',
  'translate.history.emptyBody': 'Готовые переводы появятся здесь: копирование, повтор, майнинг и блокнот.',
  'translate.history.clear': 'Очистить историю',
  'translate.history.copy': 'Копировать',
  'translate.history.rerun': 'Повторить',
  'translate.history.mine': 'В майнинг',
  'translate.history.toNotebook': 'В блокнот',
  'notebook.status': 'Блокнот',
  'notebook.count': {
    one: '{count} запись',
    few: '{count} записи',
    many: '{count} записей',
    other: '{count} записей',
  },
  'notebook.review': 'Повторить блокнот',
  'notebook.refresh': 'Обновить',
  'notebook.empty.title': 'Блокнот пуст',
  'notebook.empty.body': 'Слова, поиски, майнинг, переводы, выделения и события расширения собираются здесь.',
  'notebook.stream.saved-words': 'Слова',
  'notebook.stream.lookups': 'Поиски',
  'notebook.stream.flashcards': 'Карточки',
  'notebook.stream.anki': 'Anki',
  'notebook.stream.mining': 'Майнинг',
  'notebook.stream.known': 'Уровни знания',
  'notebook.stream.translations': 'Переводы',
  'notebook.stream.plan': 'К прочтению',
  'notebook.stream.highlights': 'Выделения',
  'notebook.stream.ocr': 'OCR',
  'notebook.stream.audio': 'Аудио',
  'notebook.stream.clipboard': 'Буфер',
  'notebook.stream.extension': 'Расширение',
`,
};

function injectAfter(marker, block, lang) {
  if (s.includes(`'palette.section.notebook'`)) {
    // already injected partially — skip if grammar.mode.practice exists
    if (s.includes(`'grammar.mode.practice'`)) return false;
  }
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error(`marker not found for ${lang}: ${marker}`);
  // insert after the marker line's trailing comma line
  const endLine = s.indexOf('\n', idx);
  s = s.slice(0, endLine + 1) + block + s.slice(endLine + 1);
  return true;
}

// Avoid duplicating grammar.intro — replace existing intros and inject new keys after mode.guides
function upsertLang(lang, afterKey, block) {
  // Remove duplicate palette.section.notebook if we re-run
  // Insert block after grammar.mode.guides line for that language section
  const needle = afterKey;
  // Find within language by searching unique nearby string
  const startHints = {
    en: "export const en: Catalog",
    ja: "export const ja: Catalog",
    zh: "export const zh: Catalog",
    ru: "export const ru: Catalog",
  };
  const nextHints = {
    en: "export const ja: Catalog",
    ja: "export const zh: Catalog",
    zh: "export const ru: Catalog",
    ru: "export const CATALOGS",
  };
  const start = s.indexOf(startHints[lang]);
  const end = s.indexOf(nextHints[lang], start + 1);
  if (start < 0 || end < 0) throw new Error(`lang bounds ${lang}`);
  let section = s.slice(start, end);
  if (section.includes("'grammar.mode.practice'")) {
    console.log(lang, 'already has practice keys');
    return;
  }
  // Update grammar.intro in section
  section = section.replace(
    /'grammar\.intro':\s*(?:'[^']*'|[\s\S]*?),(?=\n\s*'grammar\.mode)/,
    lang === 'en'
      ? `'grammar.intro':\n    'JLPT N5–N1 and HSK 1–10 grammar, plus Practice builder, tests, and guides.',`
      : lang === 'ja'
        ? `'grammar.intro': 'JLPT N5〜N1 と HSK 1〜10 の文法、練習ビルダー、テスト、ガイド。',`
        : lang === 'zh'
          ? `'grammar.intro': 'JLPT N5–N1 与 HSK 1–10 语法，含练习构建器、测试与指南。',`
          : `'grammar.intro': 'Грамматика JLPT N5–N1 и HSK 1–10, конструктор практики, тесты и гайды.',`,
  );
  const guidesLine = section.indexOf("'grammar.mode.guides'");
  if (guidesLine < 0) throw new Error(`no guides in ${lang}`);
  const lineEnd = section.indexOf('\n', guidesLine);
  // strip palette.section.notebook from block if we'll add near palette separately
  let insert = block;
  // Add notebook palette near translate/grammar palette
  if (!section.includes("'palette.section.notebook'")) {
    section = section.replace(
      "'palette.section.grammar':",
      `'palette.section.notebook': ${
        lang === 'en'
          ? "'Notebook'"
          : lang === 'ja'
            ? "'ノートブック'"
            : lang === 'zh'
              ? "'笔记本'"
              : "'Блокнот'"
      },\n  'palette.section.grammar':`,
    );
  }
  // Remove palette line from insert block
  insert = insert.replace(/^\s*'palette\.section\.notebook':.*,\n/m, '');
  insert = insert.replace(/^\s*'grammar\.intro':[\s\S]*?,\n/m, '');
  section = section.slice(0, lineEnd + 1) + insert + section.slice(lineEnd + 1);
  s = s.slice(0, start) + section + s.slice(end);
  console.log('updated', lang);
}

upsertLang('en', "'grammar.mode.guides'", blocks.en);
upsertLang('ja', "'grammar.mode.guides'", blocks.ja);
upsertLang('zh', "'grammar.mode.guides'", blocks.zh);
upsertLang('ru', "'grammar.mode.guides'", blocks.ru);

fs.writeFileSync(file, s);
console.log('i18n inject done');
