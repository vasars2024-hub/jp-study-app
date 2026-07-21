/**
 * Inserts grammar.aero.* / grammar.filter.all into catalogs.ts (en/ja/zh/ru)
 * for Aero Grammar Explorer chrome and classic filter "All" label.
 */
const fs = require('fs');
const path = require('path');

const catalogsPath = path.join(__dirname, '../src/shared/i18n/catalogs.ts');
let text = fs.readFileSync(catalogsPath, 'utf8');

if (text.includes("'grammar.aero.menu.file'")) {
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
  const lines = [`  // Aero grammar explorer chrome (${lang})`];
  for (const [k, v] of Object.entries(map)) {
    lines.push(formatEntry(k, v));
  }
  return lines.join('\n');
}

const en = {
  'grammar.filter.all': 'All',
  'grammar.aero.menu.file': 'File',
  'grammar.aero.menu.copyRef': 'Copy selected reference',
  'grammar.aero.menu.findGrammar': 'Find grammar…',
  'grammar.aero.menu.edit': 'Edit',
  'grammar.aero.menu.clearSearch': 'Clear search',
  'grammar.aero.menu.copyStructure': 'Copy structure',
  'grammar.aero.menu.view': 'View',
  'grammar.aero.menu.grammar': 'Grammar',
  'grammar.aero.menu.allGrammar': 'All grammar',
  'grammar.aero.menu.favoritesCount': 'Favorites ({count})',
  'grammar.aero.menu.studyCount': 'Study queue ({count})',
  'grammar.aero.menu.help': 'Help',
  'grammar.aero.menu.openGuides': 'Open learning guides',
  'grammar.aero.menu.recent': 'Recently viewed grammar',
  'grammar.aero.favorite.add': 'Add favorite',
  'grammar.aero.favorite.remove': 'Remove favorite',
  'grammar.aero.favorite.on': 'Favorited',
  'grammar.aero.favorite.off': 'Favorite',
  'grammar.aero.study.add': 'Add to study queue',
  'grammar.aero.study.remove': 'Remove from study queue',
  'grammar.aero.study.queued': 'Queued',
  'grammar.aero.study.addShort': 'Add to Study',
  'grammar.aero.status.scope': 'Scope: {scope}',
  'grammar.aero.status.category': 'Category: {category}',
  'grammar.aero.status.favorites': {
    one: '{count} favorite',
    other: '{count} favorites',
  },
  'grammar.aero.status.queued': {
    one: '{count} queued',
    other: '{count} queued',
  },
  'grammar.aero.toolbar.aria': 'Grammar Explorer commands',
  'grammar.aero.back': 'Back',
  'grammar.aero.forward': 'Forward',
  'grammar.aero.toolbar.grammar': 'Grammar',
  'grammar.aero.toolbar.guides': 'Guides',
  'grammar.aero.scope.aria': 'Grammar scope',
  'grammar.aero.scope.all': 'All Grammar',
  'grammar.aero.scope.favorites': 'Favorites',
  'grammar.aero.scope.studyQueue': 'Study Queue',
  'grammar.aero.scope.recent': 'Recently Viewed',
  'grammar.aero.cat.aria': 'Guide category',
  'grammar.aero.scope.allGuides': 'All Guides',
  'grammar.aero.search.placeholder': 'Search grammar, meaning, structure…',
  'grammar.aero.nav.aria': 'Grammar Explorer navigation',
  'grammar.aero.nav.library': 'Grammar Library',
  'grammar.aero.nav.guides': 'Guides',
  'grammar.aero.list.aria.points': 'Grammar points',
  'grammar.aero.list.aria.pointList': 'Grammar point list',
  'grammar.aero.list.aria.guides': 'Guides',
  'grammar.aero.list.aria.guideList': 'Guide list',
  'grammar.aero.list.pattern': 'Pattern',
  'grammar.aero.list.meaning': 'Meaning',
  'grammar.aero.list.level': 'Level',
  'grammar.aero.list.state': 'State',
  'grammar.aero.list.guide': 'Guide',
  'grammar.aero.list.category': 'Category',
  'grammar.aero.empty.pointsMatch': 'No grammar points match this view.',
  'grammar.aero.empty.guidesMatch': 'No guides match this view.',
  'grammar.aero.detail.kicker': 'Grammar Point',
  'grammar.aero.moreExamples': 'More Examples',
  'grammar.aero.cat.hacks': 'Hacks',
  'grammar.aero.cat.reading': 'Reading',
  'grammar.aero.cat.writing': 'Writing',
  'grammar.aero.cat.literature': 'Literature',
  'grammar.aero.cat.speaking': 'Speaking',
  'grammar.aero.cat.culture': 'Culture',
};

const ja = {
  'grammar.filter.all': 'すべて',
  'grammar.aero.menu.file': 'ファイル',
  'grammar.aero.menu.copyRef': '選択中の参照をコピー',
  'grammar.aero.menu.findGrammar': '文法を検索…',
  'grammar.aero.menu.edit': '編集',
  'grammar.aero.menu.clearSearch': '検索をクリア',
  'grammar.aero.menu.copyStructure': '構文をコピー',
  'grammar.aero.menu.view': '表示',
  'grammar.aero.menu.grammar': '文法',
  'grammar.aero.menu.allGrammar': 'すべての文法',
  'grammar.aero.menu.favoritesCount': 'お気に入り ({count})',
  'grammar.aero.menu.studyCount': '学習キュー ({count})',
  'grammar.aero.menu.help': 'ヘルプ',
  'grammar.aero.menu.openGuides': '学習ガイドを開く',
  'grammar.aero.menu.recent': '最近見た文法',
  'grammar.aero.favorite.add': 'お気に入りに追加',
  'grammar.aero.favorite.remove': 'お気に入りから削除',
  'grammar.aero.favorite.on': 'お気に入り済み',
  'grammar.aero.favorite.off': 'お気に入り',
  'grammar.aero.study.add': '学習キューに追加',
  'grammar.aero.study.remove': '学習キューから削除',
  'grammar.aero.study.queued': 'キュー済み',
  'grammar.aero.study.addShort': '学習に追加',
  'grammar.aero.status.scope': '範囲: {scope}',
  'grammar.aero.status.category': 'カテゴリ: {category}',
  'grammar.aero.status.favorites': {
    other: 'お気に入り {count}',
  },
  'grammar.aero.status.queued': {
    other: 'キュー {count}',
  },
  'grammar.aero.toolbar.aria': '文法エクスプローラーのコマンド',
  'grammar.aero.back': '戻る',
  'grammar.aero.forward': '進む',
  'grammar.aero.toolbar.grammar': '文法',
  'grammar.aero.toolbar.guides': 'ガイド',
  'grammar.aero.scope.aria': '文法の範囲',
  'grammar.aero.scope.all': 'すべての文法',
  'grammar.aero.scope.favorites': 'お気に入り',
  'grammar.aero.scope.studyQueue': '学習キュー',
  'grammar.aero.scope.recent': '最近表示',
  'grammar.aero.cat.aria': 'ガイドのカテゴリ',
  'grammar.aero.scope.allGuides': 'すべてのガイド',
  'grammar.aero.search.placeholder': '文法・意味・構文を検索…',
  'grammar.aero.nav.aria': '文法エクスプローラーのナビ',
  'grammar.aero.nav.library': '文法ライブラリ',
  'grammar.aero.nav.guides': 'ガイド',
  'grammar.aero.list.aria.points': '文法項目',
  'grammar.aero.list.aria.pointList': '文法項目リスト',
  'grammar.aero.list.aria.guides': 'ガイド',
  'grammar.aero.list.aria.guideList': 'ガイドリスト',
  'grammar.aero.list.pattern': 'パターン',
  'grammar.aero.list.meaning': '意味',
  'grammar.aero.list.level': 'レベル',
  'grammar.aero.list.state': '状態',
  'grammar.aero.list.guide': 'ガイド',
  'grammar.aero.list.category': 'カテゴリ',
  'grammar.aero.empty.pointsMatch': 'この表示に一致する文法項目はありません。',
  'grammar.aero.empty.guidesMatch': 'この表示に一致するガイドはありません。',
  'grammar.aero.detail.kicker': '文法項目',
  'grammar.aero.moreExamples': 'もっと例文',
  'grammar.aero.cat.hacks': 'コツ',
  'grammar.aero.cat.reading': '読解',
  'grammar.aero.cat.writing': '作文',
  'grammar.aero.cat.literature': '文学',
  'grammar.aero.cat.speaking': '会話',
  'grammar.aero.cat.culture': '文化',
};

const zh = {
  'grammar.filter.all': '全部',
  'grammar.aero.menu.file': '文件',
  'grammar.aero.menu.copyRef': '复制所选参考',
  'grammar.aero.menu.findGrammar': '查找语法…',
  'grammar.aero.menu.edit': '编辑',
  'grammar.aero.menu.clearSearch': '清除搜索',
  'grammar.aero.menu.copyStructure': '复制结构',
  'grammar.aero.menu.view': '查看',
  'grammar.aero.menu.grammar': '语法',
  'grammar.aero.menu.allGrammar': '全部语法',
  'grammar.aero.menu.favoritesCount': '收藏 ({count})',
  'grammar.aero.menu.studyCount': '学习队列 ({count})',
  'grammar.aero.menu.help': '帮助',
  'grammar.aero.menu.openGuides': '打开学习指南',
  'grammar.aero.menu.recent': '最近查看的语法',
  'grammar.aero.favorite.add': '添加收藏',
  'grammar.aero.favorite.remove': '取消收藏',
  'grammar.aero.favorite.on': '已收藏',
  'grammar.aero.favorite.off': '收藏',
  'grammar.aero.study.add': '加入学习队列',
  'grammar.aero.study.remove': '移出学习队列',
  'grammar.aero.study.queued': '已入队',
  'grammar.aero.study.addShort': '加入学习',
  'grammar.aero.status.scope': '范围：{scope}',
  'grammar.aero.status.category': '分类：{category}',
  'grammar.aero.status.favorites': {
    other: '{count} 个收藏',
  },
  'grammar.aero.status.queued': {
    other: '{count} 个排队',
  },
  'grammar.aero.toolbar.aria': '语法浏览器命令',
  'grammar.aero.back': '后退',
  'grammar.aero.forward': '前进',
  'grammar.aero.toolbar.grammar': '语法',
  'grammar.aero.toolbar.guides': '指南',
  'grammar.aero.scope.aria': '语法范围',
  'grammar.aero.scope.all': '全部语法',
  'grammar.aero.scope.favorites': '收藏',
  'grammar.aero.scope.studyQueue': '学习队列',
  'grammar.aero.scope.recent': '最近查看',
  'grammar.aero.cat.aria': '指南分类',
  'grammar.aero.scope.allGuides': '全部指南',
  'grammar.aero.search.placeholder': '搜索语法、释义、结构…',
  'grammar.aero.nav.aria': '语法浏览器导航',
  'grammar.aero.nav.library': '语法库',
  'grammar.aero.nav.guides': '指南',
  'grammar.aero.list.aria.points': '语法点',
  'grammar.aero.list.aria.pointList': '语法点列表',
  'grammar.aero.list.aria.guides': '指南',
  'grammar.aero.list.aria.guideList': '指南列表',
  'grammar.aero.list.pattern': '句式',
  'grammar.aero.list.meaning': '释义',
  'grammar.aero.list.level': '级别',
  'grammar.aero.list.state': '状态',
  'grammar.aero.list.guide': '指南',
  'grammar.aero.list.category': '分类',
  'grammar.aero.empty.pointsMatch': '没有匹配此视图的语法点。',
  'grammar.aero.empty.guidesMatch': '没有匹配此视图的指南。',
  'grammar.aero.detail.kicker': '语法点',
  'grammar.aero.moreExamples': '更多例句',
  'grammar.aero.cat.hacks': '技巧',
  'grammar.aero.cat.reading': '阅读',
  'grammar.aero.cat.writing': '写作',
  'grammar.aero.cat.literature': '文学',
  'grammar.aero.cat.speaking': '口语',
  'grammar.aero.cat.culture': '文化',
};

const ru = {
  'grammar.filter.all': 'Все',
  'grammar.aero.menu.file': 'Файл',
  'grammar.aero.menu.copyRef': 'Копировать выбранную ссылку',
  'grammar.aero.menu.findGrammar': 'Найти грамматику…',
  'grammar.aero.menu.edit': 'Правка',
  'grammar.aero.menu.clearSearch': 'Очистить поиск',
  'grammar.aero.menu.copyStructure': 'Копировать структуру',
  'grammar.aero.menu.view': 'Вид',
  'grammar.aero.menu.grammar': 'Грамматика',
  'grammar.aero.menu.allGrammar': 'Вся грамматика',
  'grammar.aero.menu.favoritesCount': 'Избранное ({count})',
  'grammar.aero.menu.studyCount': 'Очередь изучения ({count})',
  'grammar.aero.menu.help': 'Справка',
  'grammar.aero.menu.openGuides': 'Открыть учебные руководства',
  'grammar.aero.menu.recent': 'Недавно просмотренная грамматика',
  'grammar.aero.favorite.add': 'В избранное',
  'grammar.aero.favorite.remove': 'Убрать из избранного',
  'grammar.aero.favorite.on': 'В избранном',
  'grammar.aero.favorite.off': 'Избранное',
  'grammar.aero.study.add': 'Добавить в очередь изучения',
  'grammar.aero.study.remove': 'Убрать из очереди изучения',
  'grammar.aero.study.queued': 'В очереди',
  'grammar.aero.study.addShort': 'В изучение',
  'grammar.aero.status.scope': 'Область: {scope}',
  'grammar.aero.status.category': 'Категория: {category}',
  'grammar.aero.status.favorites': {
    one: '{count} в избранном',
    few: '{count} в избранном',
    many: '{count} в избранном',
    other: '{count} в избранном',
  },
  'grammar.aero.status.queued': {
    one: '{count} в очереди',
    few: '{count} в очереди',
    many: '{count} в очереди',
    other: '{count} в очереди',
  },
  'grammar.aero.toolbar.aria': 'Команды обозревателя грамматики',
  'grammar.aero.back': 'Назад',
  'grammar.aero.forward': 'Вперёд',
  'grammar.aero.toolbar.grammar': 'Грамматика',
  'grammar.aero.toolbar.guides': 'Руководства',
  'grammar.aero.scope.aria': 'Область грамматики',
  'grammar.aero.scope.all': 'Вся грамматика',
  'grammar.aero.scope.favorites': 'Избранное',
  'grammar.aero.scope.studyQueue': 'Очередь изучения',
  'grammar.aero.scope.recent': 'Недавние',
  'grammar.aero.cat.aria': 'Категория руководства',
  'grammar.aero.scope.allGuides': 'Все руководства',
  'grammar.aero.search.placeholder': 'Поиск по конструкции, значению, структуре…',
  'grammar.aero.nav.aria': 'Навигация обозревателя грамматики',
  'grammar.aero.nav.library': 'Библиотека грамматики',
  'grammar.aero.nav.guides': 'Руководства',
  'grammar.aero.list.aria.points': 'Грамматические конструкции',
  'grammar.aero.list.aria.pointList': 'Список конструкций',
  'grammar.aero.list.aria.guides': 'Руководства',
  'grammar.aero.list.aria.guideList': 'Список руководств',
  'grammar.aero.list.pattern': 'Конструкция',
  'grammar.aero.list.meaning': 'Значение',
  'grammar.aero.list.level': 'Уровень',
  'grammar.aero.list.state': 'Состояние',
  'grammar.aero.list.guide': 'Руководство',
  'grammar.aero.list.category': 'Категория',
  'grammar.aero.empty.pointsMatch': 'Нет конструкций, подходящих под этот вид.',
  'grammar.aero.empty.guidesMatch': 'Нет руководств, подходящих под этот вид.',
  'grammar.aero.detail.kicker': 'Грамматическая конструкция',
  'grammar.aero.moreExamples': 'Ещё примеры',
  'grammar.aero.cat.hacks': 'Приёмы',
  'grammar.aero.cat.reading': 'Чтение',
  'grammar.aero.cat.writing': 'Письмо',
  'grammar.aero.cat.literature': 'Литература',
  'grammar.aero.cat.speaking': 'Речь',
  'grammar.aero.cat.culture': 'Культура',
};

const packs = { en, ja, zh, ru };

const nl = text.includes('\r\n') ? '\r\n' : '\n';

const anchors = {
  en: `  'grammar.selectGuidePrompt': 'Select a guide to start reading.',${nl}`,
  ja: `  'grammar.selectGuidePrompt': 'ガイドを選択すると読み始められます。',${nl}`,
  zh: `  'grammar.selectGuidePrompt': '选择一篇指南开始阅读。',${nl}`,
  ru: `  'grammar.selectGuidePrompt': 'Выберите руководство, чтобы начать чтение.',${nl}`,
};

for (const [lang, anchor] of Object.entries(anchors)) {
  const idx = text.indexOf(anchor);
  if (idx < 0) throw new Error(`anchor missing: ${lang}`);
  const insertAt = idx + anchor.length;
  const block = `${nl}${formatBlock(lang, packs[lang]).split('\n').join(nl)}${nl}`;
  text = text.slice(0, insertAt) + block + text.slice(insertAt);
}

fs.writeFileSync(catalogsPath, text);
console.log('done', Object.keys(en).length, 'keys');
