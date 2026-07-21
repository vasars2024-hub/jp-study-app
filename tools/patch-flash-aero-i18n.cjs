/**
 * Inserts flash.aero.* / flash.import.* keys into catalogs.ts (en/ja/zh/ru)
 * for Aero Flashcards chrome, DeckImportPanel, and DeckActionMenu.
 */
const fs = require('fs');
const path = require('path');

const catalogsPath = path.join(__dirname, '../src/shared/i18n/catalogs.ts');
let text = fs.readFileSync(catalogsPath, 'utf8');

if (text.includes("'flash.aero.menu.exportEpub'")) {
  console.log('already patched');
  process.exit(0);
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatEntry(k, v) {
  if (typeof v === 'object' && v !== null) {
    const parts = Object.entries(v).map(([pk, pv]) => `    ${pk}: '${esc(pv)}'`);
    return `  '${k}': {\n${parts.join(',\n')},\n  },`;
  }
  return `  '${k}': '${esc(v)}',`;
}

function formatBlock(lang, map) {
  const lines = [`  // Aero flashcards chrome / import / action menu (${lang})`];
  for (const [k, v] of Object.entries(map)) {
    lines.push(formatEntry(k, v));
  }
  return lines.join('\n');
}

const en = {
  'flash.aero.menu.exportEpub': 'Export EPUB deck (CSV)…',
  'flash.aero.menu.deck': 'Deck',
  'flash.aero.menu.newFolder': 'New folder…',
  'flash.aero.menu.study': 'Study',
  'flash.aero.menu.startEpubReview': 'Start EPUB review ({count})',
  'flash.aero.menu.tools': 'Tools',
  'flash.aero.menu.advancedMining': 'Advanced EPUB mining',
  'flash.aero.status.epubCards': {
    one: '{count} EPUB card',
    other: '{count} EPUB cards',
  },
  'flash.aero.status.dictionary': {
    one: '{count} dictionary',
    other: '{count} dictionary',
  },
  'flash.aero.status.folder': 'Folder: {name}',
  'flash.aero.status.readyToReview': {
    one: '{count} ready to review',
    other: '{count} ready to review',
  },
  'flash.aero.toolbar.review': 'Review',
  'flash.aero.toolbar.mine': 'Mine',
  'flash.aero.toolbar.csv': 'CSV',
  'flash.aero.toolbar.studio': 'Studio',
  'flash.aero.nav.sources': 'Sources',
  'flash.aero.nav.folders': 'Folders',
  'flash.aero.nav.epubDecks': 'EPUB decks',
  'flash.aero.nav.dictionary': 'Dictionary',
  'flash.aero.allCards': 'All cards',
  'flash.aero.addFolder': 'Folder',
  'flash.aero.savedWords': 'Saved words',
  'flash.aero.deckCatalog': 'Deck catalog',
  'flash.aero.dictionaryDeck': 'Dictionary deck',
  'flash.aero.meter.visible': 'visible',
  'flash.aero.meter.known': 'known',
  'flash.aero.meter.due': 'due',
  'flash.aero.table.aria': 'EPUB deck catalog',
  'flash.aero.table.source': 'Source',
  'flash.aero.table.cards': 'Cards',
  'flash.aero.table.known': 'Known',
  'flash.aero.table.folder': 'Folder',
  'flash.aero.table.actions': 'Actions',
  'flash.aero.remove': 'Remove',
  'flash.aero.empty.dictionary':
    'No saved words yet. Open Dictionary or highlight a word while reading to save it here.',
  'flash.aero.readyCount': '{count} ready',
  'flash.aero.import': 'Import',
  'flash.aero.importFormats': 'CSV, TSV, TXT',
  'flash.aero.recentCards': 'Recent cards',
  'flash.aero.newest': 'Newest',
  'flash.aero.noRecentCards': 'No recent cards.',
  'flash.aero.actionsAria': 'Deck actions',
  'flash.aero.saveCsv': 'Save as CSV',
  'flash.aero.moveToFolder': 'Move to folder',
  'flash.import.title': 'Import deck',
  'flash.import.hint': 'CSV, TSV, TXT — paste or open a file',
  'flash.import.deckName': 'Deck name',
  'flash.import.deckNamePlaceholder': 'my-deck',
  'flash.import.openFile': 'Open file',
  'flash.import.pastePlaceholder': 'Paste vocabulary list, CSV, or TSV here…',
  'flash.import.autoHint': 'Paste auto-imports. Re-importing the same deck name replaces that deck.',
  'flash.import.nothing': 'Nothing to import.',
  'flash.import.success': {
    one: 'Imported {count} card as “{title}” ({id}).',
    other: 'Imported {count} cards as “{title}” ({id}).',
  },
  'flash.import.noRows': 'No valid rows found. Use CSV/TSV or one word per line.',
};

const ja = {
  'flash.aero.menu.exportEpub': 'EPUBデッキをエクスポート（CSV）…',
  'flash.aero.menu.deck': 'デッキ',
  'flash.aero.menu.newFolder': '新しいフォルダ…',
  'flash.aero.menu.study': '学習',
  'flash.aero.menu.startEpubReview': 'EPUB復習を開始（{count}）',
  'flash.aero.menu.tools': 'ツール',
  'flash.aero.menu.advancedMining': '詳細EPUBマイニング',
  'flash.aero.status.epubCards': {
    other: 'EPUBカード {count}枚',
  },
  'flash.aero.status.dictionary': {
    other: '辞書 {count}',
  },
  'flash.aero.status.folder': 'フォルダ：{name}',
  'flash.aero.status.readyToReview': {
    other: '復習可能 {count}',
  },
  'flash.aero.toolbar.review': '復習',
  'flash.aero.toolbar.mine': 'マイニング',
  'flash.aero.toolbar.csv': 'CSV',
  'flash.aero.toolbar.studio': 'スタジオ',
  'flash.aero.nav.sources': 'ソース',
  'flash.aero.nav.folders': 'フォルダ',
  'flash.aero.nav.epubDecks': 'EPUBデッキ',
  'flash.aero.nav.dictionary': '辞書',
  'flash.aero.allCards': 'すべてのカード',
  'flash.aero.addFolder': 'フォルダ',
  'flash.aero.savedWords': '保存した単語',
  'flash.aero.deckCatalog': 'デッキ一覧',
  'flash.aero.dictionaryDeck': '辞書デッキ',
  'flash.aero.meter.visible': '表示中',
  'flash.aero.meter.known': '既知',
  'flash.aero.meter.due': '復習待ち',
  'flash.aero.table.aria': 'EPUBデッキ一覧',
  'flash.aero.table.source': 'ソース',
  'flash.aero.table.cards': 'カード',
  'flash.aero.table.known': '既知',
  'flash.aero.table.folder': 'フォルダ',
  'flash.aero.table.actions': '操作',
  'flash.aero.remove': '削除',
  'flash.aero.empty.dictionary':
    'まだ保存された単語がありません。辞書を開くか、読書中に単語を選択してここに保存してください。',
  'flash.aero.readyCount': '準備完了 {count}',
  'flash.aero.import': 'インポート',
  'flash.aero.importFormats': 'CSV、TSV、TXT',
  'flash.aero.recentCards': '最近のカード',
  'flash.aero.newest': '新しい順',
  'flash.aero.noRecentCards': '最近のカードはありません。',
  'flash.aero.actionsAria': 'デッキ操作',
  'flash.aero.saveCsv': 'CSVとして保存',
  'flash.aero.moveToFolder': 'フォルダへ移動',
  'flash.import.title': 'デッキをインポート',
  'flash.import.hint': 'CSV、TSV、TXT — 貼り付けまたはファイルを開く',
  'flash.import.deckName': 'デッキ名',
  'flash.import.deckNamePlaceholder': 'my-deck',
  'flash.import.openFile': 'ファイルを開く',
  'flash.import.pastePlaceholder': '単語リスト、CSV、またはTSVをここに貼り付け…',
  'flash.import.autoHint': '貼り付けると自動で取り込まれます。同じデッキ名で再インポートするとそのデッキが置き換わります。',
  'flash.import.nothing': 'インポートするものがありません。',
  'flash.import.success': {
    other: '「{title}」（{id}）として{count}枚のカードをインポートしました。',
  },
  'flash.import.noRows': '有効な行が見つかりません。CSV/TSVまたは1行1単語を使ってください。',
};

const zh = {
  'flash.aero.menu.exportEpub': '导出 EPUB 卡组（CSV）…',
  'flash.aero.menu.deck': '卡组',
  'flash.aero.menu.newFolder': '新建文件夹…',
  'flash.aero.menu.study': '学习',
  'flash.aero.menu.startEpubReview': '开始 EPUB 复习（{count}）',
  'flash.aero.menu.tools': '工具',
  'flash.aero.menu.advancedMining': '高级 EPUB 挖掘',
  'flash.aero.status.epubCards': {
    other: '{count} 张 EPUB 卡片',
  },
  'flash.aero.status.dictionary': {
    other: '{count} 词典',
  },
  'flash.aero.status.folder': '文件夹：{name}',
  'flash.aero.status.readyToReview': {
    other: '{count} 张待复习',
  },
  'flash.aero.toolbar.review': '复习',
  'flash.aero.toolbar.mine': '挖掘',
  'flash.aero.toolbar.csv': 'CSV',
  'flash.aero.toolbar.studio': '工作室',
  'flash.aero.nav.sources': '来源',
  'flash.aero.nav.folders': '文件夹',
  'flash.aero.nav.epubDecks': 'EPUB 卡组',
  'flash.aero.nav.dictionary': '词典',
  'flash.aero.allCards': '全部卡片',
  'flash.aero.addFolder': '文件夹',
  'flash.aero.savedWords': '已保存单词',
  'flash.aero.deckCatalog': '卡组目录',
  'flash.aero.dictionaryDeck': '词典卡组',
  'flash.aero.meter.visible': '可见',
  'flash.aero.meter.known': '已掌握',
  'flash.aero.meter.due': '待复习',
  'flash.aero.table.aria': 'EPUB 卡组目录',
  'flash.aero.table.source': '来源',
  'flash.aero.table.cards': '卡片',
  'flash.aero.table.known': '已掌握',
  'flash.aero.table.folder': '文件夹',
  'flash.aero.table.actions': '操作',
  'flash.aero.remove': '移除',
  'flash.aero.empty.dictionary':
    '还没有保存的单词。打开词典，或在阅读时选中单词即可保存到这里。',
  'flash.aero.readyCount': '{count} 张就绪',
  'flash.aero.import': '导入',
  'flash.aero.importFormats': 'CSV、TSV、TXT',
  'flash.aero.recentCards': '最近卡片',
  'flash.aero.newest': '最新',
  'flash.aero.noRecentCards': '暂无最近卡片。',
  'flash.aero.actionsAria': '卡组操作',
  'flash.aero.saveCsv': '另存为 CSV',
  'flash.aero.moveToFolder': '移动到文件夹',
  'flash.import.title': '导入卡组',
  'flash.import.hint': 'CSV、TSV、TXT — 粘贴或打开文件',
  'flash.import.deckName': '卡组名称',
  'flash.import.deckNamePlaceholder': 'my-deck',
  'flash.import.openFile': '打开文件',
  'flash.import.pastePlaceholder': '在此粘贴词汇列表、CSV 或 TSV…',
  'flash.import.autoHint': '粘贴即自动导入。用同一卡组名重新导入会替换该卡组。',
  'flash.import.nothing': '没有可导入的内容。',
  'flash.import.success': {
    other: '已将 {count} 张卡片导入为“{title}”（{id}）。',
  },
  'flash.import.noRows': '未找到有效行。请使用 CSV/TSV，或每行一个单词。',
};

const ru = {
  'flash.aero.menu.exportEpub': 'Экспорт колоды EPUB (CSV)…',
  'flash.aero.menu.deck': 'Колода',
  'flash.aero.menu.newFolder': 'Новая папка…',
  'flash.aero.menu.study': 'Учёба',
  'flash.aero.menu.startEpubReview': 'Начать повторение EPUB ({count})',
  'flash.aero.menu.tools': 'Инструменты',
  'flash.aero.menu.advancedMining': 'Расширенный EPUB-майнинг',
  'flash.aero.status.epubCards': {
    one: '{count} карточка EPUB',
    few: '{count} карточки EPUB',
    many: '{count} карточек EPUB',
    other: '{count} карточки EPUB',
  },
  'flash.aero.status.dictionary': {
    one: '{count} словарь',
    few: '{count} словарь',
    many: '{count} словарь',
    other: '{count} словарь',
  },
  'flash.aero.status.folder': 'Папка: {name}',
  'flash.aero.status.readyToReview': {
    one: '{count} готова к повторению',
    few: '{count} готовы к повторению',
    many: '{count} готовы к повторению',
    other: '{count} готовы к повторению',
  },
  'flash.aero.toolbar.review': 'Повторение',
  'flash.aero.toolbar.mine': 'Майнинг',
  'flash.aero.toolbar.csv': 'CSV',
  'flash.aero.toolbar.studio': 'Студия',
  'flash.aero.nav.sources': 'Источники',
  'flash.aero.nav.folders': 'Папки',
  'flash.aero.nav.epubDecks': 'Колоды EPUB',
  'flash.aero.nav.dictionary': 'Словарь',
  'flash.aero.allCards': 'Все карточки',
  'flash.aero.addFolder': 'Папка',
  'flash.aero.savedWords': 'Сохранённые слова',
  'flash.aero.deckCatalog': 'Каталог колод',
  'flash.aero.dictionaryDeck': 'Колода словаря',
  'flash.aero.meter.visible': 'видно',
  'flash.aero.meter.known': 'известны',
  'flash.aero.meter.due': 'к повторению',
  'flash.aero.table.aria': 'Каталог колод EPUB',
  'flash.aero.table.source': 'Источник',
  'flash.aero.table.cards': 'Карточки',
  'flash.aero.table.known': 'Известны',
  'flash.aero.table.folder': 'Папка',
  'flash.aero.table.actions': 'Действия',
  'flash.aero.remove': 'Удалить',
  'flash.aero.empty.dictionary':
    'Сохранённых слов пока нет. Откройте словарь или выделите слово при чтении, чтобы сохранить его здесь.',
  'flash.aero.readyCount': '{count} готово',
  'flash.aero.import': 'Импорт',
  'flash.aero.importFormats': 'CSV, TSV, TXT',
  'flash.aero.recentCards': 'Недавние карточки',
  'flash.aero.newest': 'Новые',
  'flash.aero.noRecentCards': 'Нет недавних карточек.',
  'flash.aero.actionsAria': 'Действия с колодой',
  'flash.aero.saveCsv': 'Сохранить как CSV',
  'flash.aero.moveToFolder': 'Переместить в папку',
  'flash.import.title': 'Импорт колоды',
  'flash.import.hint': 'CSV, TSV, TXT — вставьте или откройте файл',
  'flash.import.deckName': 'Название колоды',
  'flash.import.deckNamePlaceholder': 'my-deck',
  'flash.import.openFile': 'Открыть файл',
  'flash.import.pastePlaceholder': 'Вставьте список слов, CSV или TSV…',
  'flash.import.autoHint':
    'Вставка импортирует автоматически. Повторный импорт с тем же именем колоды заменяет её.',
  'flash.import.nothing': 'Нечего импортировать.',
  'flash.import.success': {
    one: 'Импортирована {count} карточка как «{title}» ({id}).',
    few: 'Импортированы {count} карточки как «{title}» ({id}).',
    many: 'Импортировано {count} карточек как «{title}» ({id}).',
    other: 'Импортировано {count} карточки как «{title}» ({id}).',
  },
  'flash.import.noRows': 'Допустимых строк не найдено. Используйте CSV/TSV или одно слово на строку.',
};

const packs = { en, ja, zh, ru };

const markers = {
  en: '  // EPUB mining panels (en)',
  ja: '  // EPUB mining panels (ja)',
  zh: '  // EPUB mining panels (zh)',
  ru: '  // EPUB mining panels (ru)',
};

for (const [lang, marker] of Object.entries(markers)) {
  const tag = `// Aero flashcards chrome / import / action menu (${lang})`;
  if (text.includes(tag)) {
    console.log('skip', lang);
    continue;
  }
  const idx = text.indexOf(marker);
  if (idx < 0) throw new Error(`marker missing: ${lang}`);
  text = text.slice(0, idx) + formatBlock(lang, packs[lang]) + '\n\n' + text.slice(idx);
}

fs.writeFileSync(catalogsPath, text);
console.log('done', Object.keys(en).length, 'keys');
