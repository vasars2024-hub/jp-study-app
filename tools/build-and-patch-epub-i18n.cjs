/**
 * Builds zh + ru packs into tools/epub-mining-i18n-packs.json and patches catalogs.ts.
 * Usage: node tools/build-and-patch-epub-i18n.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PACKS_PATH = path.join(__dirname, 'epub-mining-i18n-packs.json');
const CATALOGS = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'catalogs.ts');

const packs = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
const en = packs.en;
const ja = packs.ja;
ja['epub.mining.failSwitch'] = 'フェイルスイッチエンジン';

/** Chinese — full coverage of en keys */
const zh = {
  'epub.mining.phase.gloss': '正在解析释义',
  'epub.mining.phase.translation': '正在翻译',
  'epub.mining.phase.export': '正在生成卡组',
  'epub.mining.phase.analyzing': '正在分析',
  'epub.mining.phase.progress': '{label}… {done}/{total}',
  'epub.mining.status.analyzed':
    '已分析「{title}」：{terms} 个唯一词条（其中 {glossCount} 个有词典释义）。调整筛选后下载 — Qwen 仅对导出集合运行。',
  'epub.mining.status.partial':
    '部分分析（已取消）「{title}」：{terms} 个唯一词条（其中 {glossCount} 个有词典释义）。调整筛选后下载 — Qwen 仅对导出集合运行。',
  'epub.mining.status.cancelled': '已取消。',
  'epub.mining.status.preparing': '正在准备 {count} 张卡片…',
  'epub.mining.status.downloadCancelled': '下载已取消 — 已由词典填入的字段会保留。',
  'epub.mining.status.downloaded': '已下载 {count} 张卡片 → {path}。已保存到 EPUB 卡组一览。',
  'epub.mining.status.saveFailed': '无法保存卡组文件。',
  'epub.mining.status.importFailed': '无法导入频率词典。',
  'epub.mining.step1.title': '选择 EPUB',
  'epub.mining.step1.lead': '选择书库中的书籍并为卡组文件命名。',
  'epub.mining.libraryEpub': '书库 EPUB',
  'epub.mining.selectBook': '选择书库中的书…',
  'epub.mining.deckLabel': '卡组标签',
  'epub.mining.deckLabel.placeholder': '文件名与卡组浏览器分组名',
  'epub.mining.step2.title': '卡片版式与格式',
  'epub.mining.step2.lead': '选择导出格式与正面/背面字段。词典语言跟随模板。',
  'epub.mining.format': '格式',
  'epub.mining.format.anki.sub': 'Anki 卡组（.csv）',
  'epub.mining.format.anki.hint': '生成含 Expression、Front、Back 列的 CSV，供 Anki 导入。',
  'epub.mining.format.txt.label': '文本',
  'epub.mining.format.txt.sub': '词汇列表（.txt）',
  'epub.mining.format.txt.hint': '挖掘出的词条纯文本列表，每行一个。',
  'epub.mining.format.txtRep.label': '文本（Rep）',
  'epub.mining.format.txtRep.sub': '重复词汇（.txt）',
  'epub.mining.format.txtRep.hint': '制表符分隔的词条、读音与例句。',
  'epub.mining.format.csv.label': 'CSV',
  'epub.mining.format.csv.sub': '电子表格',
  'epub.mining.format.csv.hint': '供电子表格或其他工具使用的 Expression、Front、Back 列。',
  'epub.mining.format.yomitan.sub': '出现词典（.json）',
  'epub.mining.format.yomitan.hint': '词条到读音与例句的 JSON 映射，供 Yomitan 风格工具使用。',
  'epub.mining.format.learn.label': 'Learn',
  'epub.mining.format.learn.sub': '批量词汇更新（需登录）',
  'epub.mining.format.loginRequired': '需要登录',
  'epub.mining.cardLayout': '卡片版式',
  'epub.mining.exportFormatting': '导出格式化',
  'epub.mining.exportFormatting.summary': '分隔符、读音样式、CSV 选项',
  'epub.mining.fieldSeparator': '字段分隔符',
  'epub.mining.sep.newline': '换行',
  'epub.mining.sep.space': '空格',
  'epub.mining.sep.dash': '破折号（ — ）',
  'epub.mining.sep.br': 'HTML <br>',
  'epub.mining.sep.custom': '自定义',
  'epub.mining.customSeparator': '自定义分隔符',
  'epub.mining.customSeparator.placeholder': "例如 ' | '",
  'epub.mining.csvDelimiter': 'CSV 分隔符',
  'epub.mining.csv.comma': '逗号（,）',
  'epub.mining.csv.semicolon': '分号（;）',
  'epub.mining.csv.tab': '制表符',
  'epub.mining.readingKana': '读音假名',
  'epub.mining.reading.hiragana': 'ひらがな (hiragana)',
  'epub.mining.reading.katakana': 'カタカナ (katakana)',
  'epub.mining.csvHeader': 'CSV 表头行',
  'epub.mining.csvHeader.hint': '包含 Expression / Front / Back 表头行。',
  'epub.mining.fsMarker': '在预览中标记失败切换填入值',
  'epub.mining.fsMarker.hint': '仅在审阅步骤对 Qwen 填入的字段显示 [FS]。',
  'epub.mining.excludeIncomplete': '排除不完整卡片',
  'epub.mining.excludeIncomplete.hint': '跳过仍有未填模板字段的卡片。',
  'epub.mining.step3.title': '筛选与翻译',
  'epub.mining.step3.lead': '收窄卡组并选择翻译行为。分析后即时更新 — 无需重新运行。',
  'epub.mining.downloadStrategy': '下载策略',
  'epub.mining.strategy.manual': '手动',
  'epub.mining.strategy.occurrences': '出现次数',
  'epub.mining.strategy.coverage': '覆盖率 %（需登录）',
  'epub.mining.occurrences.lead': '按该 EPUB 中出现次数筛选词汇。',
  'epub.mining.filterType': '筛选类型',
  'epub.mining.op.gte': '大于等于（≥）',
  'epub.mining.op.lte': '小于等于（≤）',
  'epub.mining.op.eq': '恰好（=）',
  'epub.mining.threshold': '阈值',
  'epub.mining.thenSortBy': '然后排序',
  'epub.mining.sort.deckFrequency': '卡组频率',
  'epub.mining.sort.alphabetical': '字母顺序',
  'epub.mining.sort.byFrequency': '按频率',
  'epub.mining.filterBy': '筛选依据',
  'epub.mining.filterBy.hintTitle': '筛选依据',
  'epub.mining.filterBy.hint.epubRankTitle': 'EPUB 排名窗口',
  'epub.mining.filterBy.hint.epubRankBody':
    '按本书出现频率排序词汇，再保留该列表的一段。例如排名 0–500 是该书中重复最多的 500 个词。适合抓取你正在读的小说中突出的词汇。',
  'epub.mining.filterBy.hint.dictRankTitle': '词典排名',
  'epub.mining.filterBy.hint.dictRankBody':
    '使用通用日语频率数据（内置列表 / Yomitan）。排名越低表示在语言整体中越常见。最小–最大范围只保留该区间内的词；无频率条目的词会被丢弃。适合做类似 JLPT 的常用词卡组，而不论该书中是否罕见。',
  'epub.mining.filter.epubRank': 'EPUB 排名窗口',
  'epub.mining.filter.dictRank': '词典排名',
  'epub.mining.dictRankRange': '词典排名范围',
  'epub.mining.rankWindow': '排名窗口',
  'epub.mining.dictRankRange.sub': '保留词典排名落在此范围的词。叠在最小频率之后。',
  'epub.mining.rankWindow.sub': '书中排序位置（0–{rangeCap}）。终点留空 = 全部。',
  'epub.mining.freqMax': '最大',
  'epub.mining.freqAll': '全部',
  'epub.mining.wordFilters': '词汇筛选',
  'epub.mining.excludeKanaOnly': '排除纯假名词',
  'epub.mining.excludeKanaOnly.hint': '移除不含汉字的词（如 こころ、それでも、…）。',
  'epub.mining.excludeJpNames': '排除日本人名',
  'epub.mining.excludeJpNames.hint': '日本人名（kuromoji 人名 / 固有名詞）。',
  'epub.mining.excludeZhNames': '排除中文名',
  'epub.mining.excludeZhNames.hint': '日语文本中的中国人名 — 片假名拼写如 リュウ、リン。',
  'epub.mining.excludeRuNames': '排除俄语名',
  'epub.mining.excludeRuNames.hint': '日语文本中的俄语名 — 片假名拼写如 イワン、…スキー。',
  'epub.mining.excludePlaces': '排除地名',
  'epub.mining.excludePlaces.hint': '地名（kuromoji 地域）。',
  'epub.mining.translation': '翻译',
  'epub.mining.fillTranslations': '下载时填充翻译',
  'epub.mining.fillTranslations.hint': '词典优先 — 仅缺口交给下方失败切换引擎。',
  'epub.mining.failSwitch': '失败切换引擎',
  'epub.mining.engine.qwen': '离线 Qwen3',
  'epub.mining.engine.api': '云端 API',
  'epub.mining.qwen.checking': '正在检查本地 Qwen 模型…',
  'epub.mining.qwen.ready': '已找到 Qwen3 模型 — 本地运行，无需 API 密钥。',
  'epub.mining.qwen.missing':
    '未找到 Qwen3 模型。请将 Qwen3-1.7B.gguf 放到下载文件夹，或通过翻译视图安装。',
  'epub.mining.provider': '提供商',
  'epub.mining.apiKey': 'API 密钥',
  'epub.mining.apiKey.replace': '替换已保存的密钥…',
  'epub.mining.apiKey.paste': '粘贴 {provider} 密钥',
  'epub.mining.saveKey': '保存密钥',
  'epub.mining.savingKey': '保存中…',
  'epub.mining.apiKey.saved': '已保存 {provider} 密钥 — 对大型卡组比本地 Qwen 更快。',
  'epub.mining.apiKey.need': '保存 {provider} 密钥以使用云端翻译。',
  'epub.mining.translateSentences': '翻译语境例句',
  'epub.mining.translateSentences.hint': '较慢 — 启用 {sentence-translation:*} 变量。',
  'epub.mining.step4.title': '分析 EPUB',
  'epub.mining.step4.lead': '分词并解析词典释义。很快 — Qwen 仅在下载时运行。',
  'epub.mining.analyzing': '分析中…',
  'epub.mining.reanalyze': '重新分析 EPUB',
  'epub.mining.analyze': '分析 EPUB',
  'epub.mining.note.selectBook': '请在第 1 步选择书库中的 EPUB。',
  'epub.mining.note.runAnalyze': '运行分析以查看填充报告并下载。',
  'epub.mining.analysisSettings': '分析设置',
  'epub.mining.analysisSettings.summary': '分词器、截止、黑名单、频率词典',
  'epub.mining.analysisSettings.lead': '在“分析”或“重新分析 EPUB”时生效。更改后请重新分析。',
  'epub.mining.occurrences.minFreqNote':
    '出现次数导出筛选不使用最小频率 — 请改用第 3 步的阈值。最小频率仍在分析时应用。',
  'epub.mining.analyzer': '分析器',
  'epub.mining.analyzer.kuromoji': '日语词干分词器',
  'epub.mining.analyzer.simple': '简单分词器',
  'epub.mining.minFrequency': '最小频率',
  'epub.mining.maxCommonRank': '常用排名上限截止',
  'epub.mining.maxCommonRank.ignored': '选择词典排名筛选时忽略常用排名截止。',
  'epub.mining.junkFilter': '内置垃圾词过滤',
  'epub.mining.junkFilter.hint':
    '分析时丢弃系词、助动词、指示词、填充词与单拍假名（Jiten/JL 风格 — 词性 + 词干规则）。{count} 个词条。',
  'epub.mining.customBlacklist': '自定义黑名单',
  'epub.mining.customBlacklist.placeholder': '每行一个词条 — 启用时与内置垃圾词合并',
  'epub.mining.freqLists.lead': '用于词典排名筛选与排序的内置与导入频率列表。',
  'epub.mining.freqLists.loading': '正在加载频率词典…',
  'epub.mining.freqLists.empty': '尚未加载频率词典。',
  'epub.mining.freqLists.entries': '{count} 条',
  'epub.mining.freqLists.otherLangs': '其他语言列表',
  'epub.mining.freqLists.otherLangs.summary': '{count} 个可选（中文、俄语）',
  'epub.mining.importFreqDict': '导入频率词典',
  'epub.mining.step5.title': '审阅与下载',
  'epub.mining.step5.lead': '检查填充覆盖率、预览卡片，然后导出筛选后的卡组。',
  'epub.mining.fillReport': '填充报告',
  'epub.mining.fillReport.lead':
    '来自分析的按字段计数（词典释义）。下载时这些槽位跳过 Qwen；仅翻译缺口 — 按钮进度使用相同的词典总数。',
  'epub.mining.fill.filled': '已填 {filled}/{total}',
  'epub.mining.fill.dictionary': '词典 {count}',
  'epub.mining.fill.api': 'API {count}',
  'epub.mining.fill.qwen': 'Qwen FS {count}',
  'epub.mining.fill.mined': '挖掘 {count}',
  'epub.mining.fill.missing': '缺失 {count}',
  'epub.mining.fill.incompleteExcluded':
    '{total} 张中有 {incomplete} 张字段未填满，将被排除出导出。',
  'epub.mining.fill.incompleteHint':
    '{total} 张中有 {incomplete} 张字段未填满。在第 2 步启用“排除不完整卡片”可跳过它们。',
  'epub.mining.deckPreview': '卡组预览',
  'epub.mining.deckPreview.first': '前 {count} 张',
  'epub.mining.result': '结果：约',
  'epub.mining.result.cards': '张卡片',
  'epub.mining.result.termsMined': '已挖掘 {count} 个词',
  'epub.mining.preparingDeck': '正在准备卡组…',
  'epub.mining.downloadDeck': '下载卡组',
  'epub.mining.simple.step1': '1. 选择书籍',
  'epub.mining.simple.epub': 'EPUB',
  'epub.mining.simple.selectBook': '选择书库中的书…',
  'epub.mining.simple.deckName': '卡组名称',
  'epub.mining.simple.deckName.placeholder': '显示在抽认卡中',
  'epub.mining.simple.step2': '2. 筛选词汇',
  'epub.mining.simple.lead': '每张卡片含英文释义＋日文例句与释义。仅词典查询 — 无额外语言。',
  'epub.mining.simple.sharedFreq':
    '最小频率与高级 EPUB 挖掘共享。书中出现次数与词典排名均会应用。',
  'epub.mining.simple.filter.book': '本书中的频率',
  'epub.mining.simple.filter.dict': '词典频率',
  'epub.mining.simple.minFrequency': '最小频率（EPUB 出现次数）',
  'epub.mining.simple.rankStart': '排名窗口起点',
  'epub.mining.simple.rankEnd': '排名窗口终点（0 = 全部）',
  'epub.mining.simple.dictFrom': '词典排名下限',
  'epub.mining.simple.dictTo': '词典排名上限（0 = 无上限）',
  'epub.mining.simple.excludeKana': '排除纯假名词（无汉字）',
  'epub.mining.simple.cardsSelectedSuffix': { other: '张已选' },
  'epub.mining.simple.hint.needFreqList':
    '词典排名需要已启用的日语频率列表。请在高级 EPUB 挖掘中打开一个。',
  'epub.mining.simple.hint.noRankMatches':
    '本次分析没有词典排名匹配。请尝试“本书中的频率”或其他频率列表。',
  'epub.mining.simple.hint.rankRange':
    '本书有词典排名，但都不在当前范围内。本次可用排名：{min} 到 {max}。',
  'epub.mining.simple.step3': '3. 生成卡组',
  'epub.mining.simple.cardPreview':
    '正面：词条 + 读音 · 背面：英文释义、日文例句、日文释义',
  'epub.mining.simple.analyzing': '分析中…',
  'epub.mining.simple.reanalyze': '重新分析',
  'epub.mining.simple.analyze': '分析 EPUB',
  'epub.mining.simple.saving': '保存中…',
  'epub.mining.simple.save': '保存到抽认卡',
  'epub.mining.simple.status.ready': '就绪 — {count} 张卡片匹配你的筛选。',
  'epub.mining.simple.status.building': '正在生成卡组…',
  'epub.mining.simple.status.saved': '已将 {count} 张卡片保存到抽认卡和 {path}',
  'epub.mining.simple.status.imported': '已将 {count} 张卡片导入抽认卡。',
  'epub.layout.preset': '预设',
  'epub.layout.custom': '自定义',
  'epub.layout.front': '正面',
  'epub.layout.back': '背面',
  'epub.layout.preset.ja-en': '日语正面 / 英语背面',
  'epub.layout.preset.en-ja': '英语正面 / 日语背面',
  'epub.layout.preset.expression-reading': '词条 / 读音',
  'epub.layout.preset.reading-expression': '读音 / 词条',
  'epub.layout.preset.ja-sentence': '日语词 / 语境句',
  'epub.vars.title': '变量面板',
  'epub.vars.summary': '向正面或背面插入 {placeholders}',
  'epub.vars.lead':
    '先聚焦上方正面或背面，再点击标签。语言标签标明字段语言（例如 {expression:ja} = 书中日语词，{meaning:en} = 英语释义）。词字段先走词典；缺口才由 Qwen 填补。',
  'epub.vars.base': '基础',
  'epub.vars.byLanguage': '按语言',
  'epub.vars.aria.base': '插入基础变量',
  'epub.vars.aria.lang': '插入带语言标签的变量',
  'epub.vars.expression.hint': '书中的词头（日语）',
  'epub.vars.reading.hint': '假名读音（若有）',
  'epub.vars.meaning.hint': '词典释义（默认英语）',
  'epub.vars.sentence.hint': '词出现处的 EPUB 句子',
  'epub.vars.frequency.hint': '词典排名或书中出现次数',
  'epub.filter.lead':
    '筛选按顺序叠加：书中出现次数，然后词典排名（或书内排名窗口），然后专名排除。常用排名截止仅在 EPUB 排名窗口模式下生效。',
  'epub.filter.mined': '已挖掘词条',
  'epub.filter.final': '最终卡片',
  'epub.filter.step.kanaOnly': '排除纯假名后',
  'epub.filter.step.occurrences': '出现次数筛选后（{op} {threshold}）',
  'epub.filter.step.bookFrequency': '书中出现后（≥ {minFrequency}）',
  'epub.filter.step.dictionaryRank': '词典排名筛选后（{range}）',
  'epub.filter.step.dictionaryRank.range': '排名 {min}–{max}',
  'epub.filter.step.dictionaryRank.rangeMin': '排名 ≥ {min}（无上限）',
  'epub.filter.step.bookRankWindow': '书内排名窗口后（{min}–{max}）',
  'epub.filter.step.bookRankWindow.end': '末尾',
  'epub.filter.step.maxCommonRank': '常用排名截止',
  'epub.filter.step.maxCommonRank.applied': '常用排名截止后（> {maxCommonRank}）',
  'epub.filter.step.nameExclusions': '专名排除后',
  'epub.filter.detail.bookFrequency': '在分析时与此处再次应用，使导出与可见下限一致。',
  'epub.filter.detail.maxCommonRankSkipped': '词典排名模式下不应用。',
  'epub.filter.detail.noChange': '无变化。',
  'epub.test.lead': '批量下载前用精确模板渲染预览一张卡片。',
  'epub.test.term': '测试词条',
  'epub.test.render': '渲染测试卡片',
  'epub.test.enriching': '补全中…',
  'epub.test.starting': '开始补全…',
  'epub.test.timeout':
    '补全超时。Qwen3 可能仍在加载 — 稍等片刻后再次点击“渲染测试卡片”。',
  'epub.test.front': '正面',
  'epub.test.back': '背面',
  'epub.test.source.mined': '从书中挖掘',
  'epub.test.source.dict': '词典',
  'epub.test.source.qwen': 'Qwen 失败切换',
  'epub.test.source.api': 'API 翻译',
  'epub.test.source.missing': '缺失',
  'epub.test.hint.readingLang': '不支持 — 读音仅适用于日语',
  'epub.test.hint.needDownload': '空 — 下载卡组以运行 Qwen 失败切换，或使用下方预览卡片',
  'epub.test.hint.needReanalyze': '空 — 重新分析以获取词典释义',
  'epub.test.hint.empty': '空 — 重新分析或启用翻译',
  'mining.progress.phase.tokenize': '分词',
  'mining.progress.phase.gloss': '词典',
  'mining.progress.phase.translation': '翻译',
  'mining.progress.phase.export': '导出',
  'mining.progress.legend.dictionary': '词典 {count}',
  'mining.progress.legend.translated': '已译 {count}',
  'mining.progress.legend.failed': '失败 {count}',
  'mining.progress.legend.queued': '排队 {count}',
};

/** Russian */
const ru = {
  'epub.mining.phase.gloss': 'Подбор определений',
  'epub.mining.phase.translation': 'Перевод',
  'epub.mining.phase.export': 'Сборка колоды',
  'epub.mining.phase.analyzing': 'Анализ',
  'epub.mining.phase.progress': '{label}… {done}/{total}',
  'epub.mining.status.analyzed':
    'Проанализировано «{title}»: {terms} уникальных слов ({glossCount} с определениями). Настройте фильтры и скачайте — Qwen только для набора экспорта.',
  'epub.mining.status.partial':
    'Частичный анализ (отмена) «{title}»: {terms} уникальных слов ({glossCount} с определениями). Настройте фильтры и скачайте — Qwen только для набора экспорта.',
  'epub.mining.status.cancelled': 'Отменено.',
  'epub.mining.status.preparing': 'Подготовка {count} карточек…',
  'epub.mining.status.downloadCancelled':
    'Скачивание отменено — поля, заполненные словарём, сохранены.',
  'epub.mining.status.downloaded':
    'Скачано {count} карточек → {path}. Сохранено в обзоре EPUB-колод.',
  'epub.mining.status.saveFailed': 'Не удалось сохранить файл колоды.',
  'epub.mining.status.importFailed': 'Не удалось импортировать частотный словарь.',
  'epub.mining.step1.title': 'Выберите EPUB',
  'epub.mining.step1.lead': 'Выберите книгу из библиотеки и назовите файл колоды.',
  'epub.mining.libraryEpub': 'EPUB из библиотеки',
  'epub.mining.selectBook': 'Выберите книгу…',
  'epub.mining.deckLabel': 'Метка колоды',
  'epub.mining.deckLabel.placeholder': 'Имя файла и группа в обозревателе колод',
  'epub.mining.step2.title': 'Макет и формат карточки',
  'epub.mining.step2.lead':
    'Выберите формат экспорта и поля лицевой/оборотной стороны. Языки словаря следуют шаблону.',
  'epub.mining.format': 'Формат',
  'epub.mining.format.anki.sub': 'Колода Anki (.csv)',
  'epub.mining.format.anki.hint':
    'CSV со столбцами Expression, Front и Back для импорта в Anki.',
  'epub.mining.format.txt.label': 'Текст',
  'epub.mining.format.txt.sub': 'Список слов (.txt)',
  'epub.mining.format.txt.hint': 'Простой список выражений, по одному на строку.',
  'epub.mining.format.txtRep.label': 'Текст (Rep)',
  'epub.mining.format.txtRep.sub': 'Повторная лексика (.txt)',
  'epub.mining.format.txtRep.hint': 'Выражение, чтение и пример через табуляцию.',
  'epub.mining.format.csv.label': 'CSV',
  'epub.mining.format.csv.sub': 'Таблица',
  'epub.mining.format.csv.hint':
    'Столбцы Expression, Front и Back для таблиц и других инструментов.',
  'epub.mining.format.yomitan.sub': 'Словарь вхождений (.json)',
  'epub.mining.format.yomitan.hint':
    'JSON-карта выражений к чтению и примеру для инструментов в стиле Yomitan.',
  'epub.mining.format.learn.label': 'Learn',
  'epub.mining.format.learn.sub': 'Массовое обновление лексики (нужен вход)',
  'epub.mining.format.loginRequired': 'Требуется вход',
  'epub.mining.cardLayout': 'Макет карточки',
  'epub.mining.exportFormatting': 'Форматирование экспорта',
  'epub.mining.exportFormatting.summary': 'Разделители, стиль чтения, параметры CSV',
  'epub.mining.fieldSeparator': 'Разделитель полей',
  'epub.mining.sep.newline': 'Новая строка',
  'epub.mining.sep.space': 'Пробел',
  'epub.mining.sep.dash': 'Тире ( — )',
  'epub.mining.sep.br': 'HTML <br>',
  'epub.mining.sep.custom': 'Свой',
  'epub.mining.customSeparator': 'Свой разделитель',
  'epub.mining.customSeparator.placeholder': "напр. ' | '",
  'epub.mining.csvDelimiter': 'Разделитель CSV',
  'epub.mining.csv.comma': 'Запятая (,)',
  'epub.mining.csv.semicolon': 'Точка с запятой (;)',
  'epub.mining.csv.tab': 'Табуляция',
  'epub.mining.readingKana': 'Чтение каной',
  'epub.mining.reading.hiragana': 'ひらがな (hiragana)',
  'epub.mining.reading.katakana': 'カタカナ (katakana)',
  'epub.mining.csvHeader': 'Строка заголовка CSV',
  'epub.mining.csvHeader.hint': 'Включать заголовок Expression / Front / Back.',
  'epub.mining.fsMarker': 'Помечать fail-switch в предпросмотре',
  'epub.mining.fsMarker.hint': 'Показывает [FS] на полях Qwen только на шаге проверки.',
  'epub.mining.excludeIncomplete': 'Исключать неполные карточки',
  'epub.mining.excludeIncomplete.hint': 'Пропускает карточки с незаполненными полями шаблона.',
  'epub.mining.step3.title': 'Фильтры и перевод',
  'epub.mining.step3.lead':
    'Сузьте колоду и выберите поведение перевода. Обновляется сразу после анализа — повтор не нужен.',
  'epub.mining.downloadStrategy': 'Стратегия скачивания',
  'epub.mining.strategy.manual': 'Вручную',
  'epub.mining.strategy.occurrences': 'Вхождения',
  'epub.mining.strategy.coverage': 'Покрытие % (нужен вход)',
  'epub.mining.occurrences.lead': 'Фильтр слов по числу появлений в этом EPUB.',
  'epub.mining.filterType': 'Тип фильтра',
  'epub.mining.op.gte': 'Больше или равно (≥)',
  'epub.mining.op.lte': 'Меньше или равно (≤)',
  'epub.mining.op.eq': 'Ровно (=)',
  'epub.mining.threshold': 'Порог',
  'epub.mining.thenSortBy': 'Затем сортировать',
  'epub.mining.sort.deckFrequency': 'Частота в колоде',
  'epub.mining.sort.alphabetical': 'По алфавиту',
  'epub.mining.sort.byFrequency': 'По частоте',
  'epub.mining.filterBy': 'Фильтровать по',
  'epub.mining.filterBy.hintTitle': 'Фильтровать по',
  'epub.mining.filterBy.hint.epubRankTitle': 'Окно ранга EPUB',
  'epub.mining.filterBy.hint.epubRankBody':
    'сортирует слова по частоте в этой книге и оставляет срез списка. Пример: ранги 0–500 — 500 самых частых в EPUB. Лучше, когда нужна лексика, заметная в романе.',
  'epub.mining.filterBy.hint.dictRankTitle': 'Словарный ранг',
  'epub.mining.filterBy.hint.dictRankBody':
    'использует общие японские частотные данные (встроенные списки / Yomitan). Меньший ранг — более обычное слово в языке. Диапазон min–max оставляет только слова в полосе; без частоты — отбрасываются. Для колоды в духе JLPT.',
  'epub.mining.filter.epubRank': 'Окно ранга EPUB',
  'epub.mining.filter.dictRank': 'Словарный ранг',
  'epub.mining.dictRankRange': 'Диапазон словарного ранга',
  'epub.mining.rankWindow': 'Окно ранга',
  'epub.mining.dictRankRange.sub':
    'Оставляет слова, чей словарный ранг в этом диапазоне. После минимальной частоты.',
  'epub.mining.rankWindow.sub':
    'Позиция в книге (0–{rangeCap}). Пустой конец = все слова.',
  'epub.mining.freqMax': 'Макс.',
  'epub.mining.freqAll': 'Все',
  'epub.mining.wordFilters': 'Фильтры слов',
  'epub.mining.excludeKanaOnly': 'Исключать слова только из каны',
  'epub.mining.excludeKanaOnly.hint': 'Убирает слова без кандзи (напр. こころ, それでも, …).',
  'epub.mining.excludeJpNames': 'Исключать 日本人名',
  'epub.mining.excludeJpNames.hint': 'Японские личные имена (kuromoji 人名 / 固有名詞).',
  'epub.mining.excludeZhNames': 'Исключать 中文名',
  'epub.mining.excludeZhNames.hint':
    'Китайские имена в японском тексте — катакана вроде リュウ, リン.',
  'epub.mining.excludeRuNames': 'Исключать русские имена',
  'epub.mining.excludeRuNames.hint':
    'Русские имена в японском тексте — катакана вроде イワン, …スキー.',
  'epub.mining.excludePlaces': 'Исключать 地名',
  'epub.mining.excludePlaces.hint': 'Топонимы (kuromoji 地域).',
  'epub.mining.translation': 'Перевод',
  'epub.mining.fillTranslations': 'Заполнять переводы при скачивании',
  'epub.mining.fillTranslations.hint':
    'Сначала словарь — только пробелы идут в fail-switch ниже.',
  'epub.mining.failSwitch': 'Движок fail-switch',
  'epub.mining.engine.qwen': 'Офлайн Qwen3',
  'epub.mining.engine.api': 'Облачный API',
  'epub.mining.qwen.checking': 'Проверка локальной модели Qwen…',
  'epub.mining.qwen.ready': 'Модель Qwen3 найдена — локально, без API-ключа.',
  'epub.mining.qwen.missing':
    'Модель Qwen3 не найдена. Положите Qwen3-1.7B.gguf в Загрузки или установите в разделе «Перевод».',
  'epub.mining.provider': 'Провайдер',
  'epub.mining.apiKey': 'API-ключ',
  'epub.mining.apiKey.replace': 'Заменить сохранённый ключ…',
  'epub.mining.apiKey.paste': 'Вставьте ключ {provider}',
  'epub.mining.saveKey': 'Сохранить ключ',
  'epub.mining.savingKey': 'Сохранение…',
  'epub.mining.apiKey.saved':
    'Ключ {provider} сохранён — быстрее локального Qwen на больших колодах.',
  'epub.mining.apiKey.need': 'Сохраните ключ {provider} для облачного перевода.',
  'epub.mining.translateSentences': 'Переводить контекстные предложения',
  'epub.mining.translateSentences.hint': 'Медленно — включает переменные {sentence-translation:*}.',
  'epub.mining.step4.title': 'Анализ EPUB',
  'epub.mining.step4.lead':
    'Токенизация и словарные глоссы. Быстро — Qwen только при скачивании.',
  'epub.mining.analyzing': 'Анализ…',
  'epub.mining.reanalyze': 'Повторный анализ EPUB',
  'epub.mining.analyze': 'Анализировать EPUB',
  'epub.mining.note.selectBook': 'Выберите EPUB из библиотеки на шаге 1.',
  'epub.mining.note.runAnalyze': 'Запустите анализ, чтобы увидеть отчёт и скачать.',
  'epub.mining.analysisSettings': 'Параметры анализа',
  'epub.mining.analysisSettings.summary': 'Токенизатор, отсечки, чёрный список, частотные словари',
  'epub.mining.analysisSettings.lead':
    'Применяются при анализе или повторном анализе EPUB. После изменений проанализируйте снова.',
  'epub.mining.occurrences.minFreqNote':
    'Минимальная частота не используется для фильтра «Вхождения» — порог на шаге 3. Минимальная частота всё ещё действует при анализе.',
  'epub.mining.analyzer': 'Анализатор',
  'epub.mining.analyzer.kuromoji': 'Японский лемма-токенизатор',
  'epub.mining.analyzer.simple': 'Простой токенизатор слов',
  'epub.mining.minFrequency': 'Минимальная частота',
  'epub.mining.maxCommonRank': 'Отсечка макс. обычного ранга',
  'epub.mining.maxCommonRank.ignored':
    'Отсечка обычного ранга игнорируется при фильтре по словарному рангу.',
  'epub.mining.junkFilter': 'Встроенный фильтр мусора',
  'epub.mining.junkFilter.hint':
    'При анализе отбрасывает связки, вспомогательные, указательные, заполнители и одноморную кану (стиль Jiten/JL — POS + леммы). {count} выражений.',
  'epub.mining.customBlacklist': 'Свой чёрный список',
  'epub.mining.customBlacklist.placeholder':
    'По одному выражению на строку — сливается с встроенным мусором при включении',
  'epub.mining.freqLists.lead':
    'Встроенные и импортированные частотные списки для фильтра и сортировки по рангу.',
  'epub.mining.freqLists.loading': 'Загрузка частотных словарей…',
  'epub.mining.freqLists.empty': 'Частотные словари не загружены.',
  'epub.mining.freqLists.entries': '{count} записей',
  'epub.mining.freqLists.otherLangs': 'Списки других языков',
  'epub.mining.freqLists.otherLangs.summary': '{count} опциональных (китайский, русский)',
  'epub.mining.importFreqDict': 'Импортировать частотный словарь',
  'epub.mining.step5.title': 'Проверка и скачивание',
  'epub.mining.step5.lead':
    'Проверьте заполненность, превью карточек, затем экспортируйте отфильтрованную колоду.',
  'epub.mining.fillReport': 'Отчёт заполнения',
  'epub.mining.fillReport.lead':
    'Счётчики по полям из анализа (словарные глоссы). При скачивании эти слоты пропускают Qwen; переводятся только пробелы — прогресс кнопки использует тот же словарный итог.',
  'epub.mining.fill.filled': 'заполнено {filled}/{total}',
  'epub.mining.fill.dictionary': 'словарь {count}',
  'epub.mining.fill.api': 'API {count}',
  'epub.mining.fill.qwen': 'Qwen FS {count}',
  'epub.mining.fill.mined': 'добыто {count}',
  'epub.mining.fill.missing': 'пусто {count}',
  'epub.mining.fill.incompleteExcluded':
    'У {incomplete} из {total} карточек незаполненные поля — они будут исключены из экспорта.',
  'epub.mining.fill.incompleteHint':
    'У {incomplete} из {total} карточек незаполненные поля. Включите «Исключать неполные карточки» на шаге 2.',
  'epub.mining.deckPreview': 'Превью колоды',
  'epub.mining.deckPreview.first': 'Первые {count} карточек',
  'epub.mining.result': 'Итог: примерно',
  'epub.mining.result.cards': 'карточек',
  'epub.mining.result.termsMined': 'добыто слов: {count}',
  'epub.mining.preparingDeck': 'Подготовка колоды…',
  'epub.mining.downloadDeck': 'Скачать колоду',
  'epub.mining.simple.step1': '1. Выберите книгу',
  'epub.mining.simple.epub': 'EPUB',
  'epub.mining.simple.selectBook': 'Выберите книгу…',
  'epub.mining.simple.deckName': 'Имя колоды',
  'epub.mining.simple.deckName.placeholder': 'Показывается во флеш-карточках',
  'epub.mining.simple.step2': '2. Фильтр лексики',
  'epub.mining.simple.lead':
    'Английское значение + японское предложение и определение на каждой карточке. Только словарь — без лишних языков.',
  'epub.mining.simple.sharedFreq':
    'Минимальная частота общая с расширенным EPUB-майнингом. Учитываются и вхождения в книге, и словарный ранг.',
  'epub.mining.simple.filter.book': 'Частота в этой книге',
  'epub.mining.simple.filter.dict': 'Словарная частота',
  'epub.mining.simple.minFrequency': 'Минимальная частота (вхождения в EPUB)',
  'epub.mining.simple.rankStart': 'Начало окна ранга',
  'epub.mining.simple.rankEnd': 'Конец окна ранга (0 = все)',
  'epub.mining.simple.dictFrom': 'Словарный ранг от',
  'epub.mining.simple.dictTo': 'Словарный ранг до (0 = без потолка)',
  'epub.mining.simple.excludeKana': 'Исключать слова только из каны (без кандзи)',
  'epub.mining.simple.cardsSelectedSuffix': {
    one: 'карточка выбрана',
    few: 'карточки выбраны',
    many: 'карточек выбрано',
    other: 'карточек выбрано',
  },
  'epub.mining.simple.hint.needFreqList':
    'Для словарного ранга нужен включённый японский частотный список. Включите его в расширенном EPUB-майнинге.',
  'epub.mining.simple.hint.noRankMatches':
    'В этом анализе нет совпадений словарного ранга. Попробуйте «Частота в этой книге» или другой список.',
  'epub.mining.simple.hint.rankRange':
    'У книги есть словарные ранги, но ни один не попал в текущий диапазон. Доступные ранги: {min}–{max}.',
  'epub.mining.simple.step3': '3. Собрать колоду',
  'epub.mining.simple.cardPreview':
    'Лицо: выражение + чтение · Оборот: англ. значение, яп. предложение, яп. определение',
  'epub.mining.simple.analyzing': 'Анализ…',
  'epub.mining.simple.reanalyze': 'Повторить анализ',
  'epub.mining.simple.analyze': 'Анализировать EPUB',
  'epub.mining.simple.saving': 'Сохранение…',
  'epub.mining.simple.save': 'Сохранить во флеш-карточки',
  'epub.mining.simple.status.ready': 'Готово — {count} карточек соответствуют фильтру.',
  'epub.mining.simple.status.building': 'Сборка колоды…',
  'epub.mining.simple.status.saved': 'Сохранено {count} карточек во флеш-карточки и {path}',
  'epub.mining.simple.status.imported': 'Импортировано {count} карточек во флеш-карточки.',
  'epub.layout.preset': 'Пресет',
  'epub.layout.custom': 'Свой',
  'epub.layout.front': 'Лицо',
  'epub.layout.back': 'Оборот',
  'epub.layout.preset.ja-en': 'Японское лицо / английский оборот',
  'epub.layout.preset.en-ja': 'Английское лицо / японский оборот',
  'epub.layout.preset.expression-reading': 'Выражение / Чтение',
  'epub.layout.preset.reading-expression': 'Чтение / Выражение',
  'epub.layout.preset.ja-sentence': 'Японское слово / Контекстное предложение',
  'epub.vars.title': 'Палитра переменных',
  'epub.vars.summary': 'Вставка {placeholders} на лицо или оборот',
  'epub.vars.lead':
    'Сфокусируйте лицо или оборот выше и нажмите тег. Языковые теги показывают язык поля (напр. {expression:ja} = японское слово из книги, {meaning:en} = английское определение). Сначала словари; Qwen заполняет только пробелы.',
  'epub.vars.base': 'Базовые',
  'epub.vars.byLanguage': 'По языку',
  'epub.vars.aria.base': 'Вставить базовую переменную',
  'epub.vars.aria.lang': 'Вставить переменную с языковым тегом',
  'epub.vars.expression.hint': 'Заголовок из книги (японский)',
  'epub.vars.reading.hint': 'Чтение каной, если есть',
  'epub.vars.meaning.hint': 'Словарный глосс (по умолчанию английский)',
  'epub.vars.sentence.hint': 'Предложение из EPUB, где встретилось слово',
  'epub.vars.frequency.hint': 'Словарный ранг или число вхождений в книге',
  'epub.filter.lead':
    'Фильтры накладываются по порядку: вхождения в книге, затем словарный ранг (или окно ранга книги), затем исключения имён. Отсечка обычного ранга только в режиме окна EPUB.',
  'epub.filter.mined': 'Добытые слова',
  'epub.filter.final': 'Итоговые карточки',
  'epub.filter.step.kanaOnly': 'После исключения каны-only',
  'epub.filter.step.occurrences': 'После фильтра вхождений ({op} {threshold})',
  'epub.filter.step.bookFrequency': 'После вхождений в книге (≥ {minFrequency})',
  'epub.filter.step.dictionaryRank': 'После фильтра словарного ранга ({range})',
  'epub.filter.step.dictionaryRank.range': 'ранг {min}–{max}',
  'epub.filter.step.dictionaryRank.rangeMin': 'ранг ≥ {min} (без верхнего предела)',
  'epub.filter.step.bookRankWindow': 'После окна ранга книги ({min}–{max})',
  'epub.filter.step.bookRankWindow.end': 'конец',
  'epub.filter.step.maxCommonRank': 'Отсечка обычного ранга',
  'epub.filter.step.maxCommonRank.applied': 'После отсечки обычного ранга (> {maxCommonRank})',
  'epub.filter.step.nameExclusions': 'После исключений имён',
  'epub.filter.detail.bookFrequency':
    'Применяется при анализе и здесь снова, чтобы экспорт совпадал с видимым полом.',
  'epub.filter.detail.maxCommonRankSkipped': 'Не применяется в режиме словарного ранга.',
  'epub.filter.detail.noChange': 'Без изменений.',
  'epub.test.lead': 'Превью одной карточки с точным шаблоном перед пакетным скачиванием.',
  'epub.test.term': 'Тестовое слово',
  'epub.test.render': 'Отрисовать тестовую карточку',
  'epub.test.enriching': 'Обогащение…',
  'epub.test.starting': 'Запуск обогащения…',
  'epub.test.timeout':
    'Обогащение превысило время. Qwen3 может ещё загружаться — подождите и нажмите снова.',
  'epub.test.front': 'Лицо',
  'epub.test.back': 'Оборот',
  'epub.test.source.mined': 'из книги',
  'epub.test.source.dict': 'словарь',
  'epub.test.source.qwen': 'Qwen fail-switch',
  'epub.test.source.api': 'перевод API',
  'epub.test.source.missing': 'пусто',
  'epub.test.hint.readingLang': 'не поддерживается — чтения только для японского',
  'epub.test.hint.needDownload':
    'пусто — скачайте колоду для Qwen fail-switch или используйте превью ниже',
  'epub.test.hint.needReanalyze': 'пусто — повторите анализ для словарных глоссов',
  'epub.test.hint.empty': 'пусто — повторите анализ или включите переводы',
  'mining.progress.phase.tokenize': 'Токенизация',
  'mining.progress.phase.gloss': 'Словарь',
  'mining.progress.phase.translation': 'Перевод',
  'mining.progress.phase.export': 'Экспорт',
  'mining.progress.legend.dictionary': 'Словарь {count}',
  'mining.progress.legend.translated': 'Переведено {count}',
  'mining.progress.legend.failed': 'Ошибки {count}',
  'mining.progress.legend.queued': 'В очереди {count}',
};

function assertCoverage(lang, map) {
  const missing = Object.keys(en).filter((k) => map[k] === undefined);
  const orphan = Object.keys(map).filter((k) => en[k] === undefined);
  if (missing.length || orphan.length) {
    throw new Error(`${lang} missing=${missing.length} orphan=${orphan.length} sample=${missing.slice(0, 5)}`);
  }
}

assertCoverage('zh', zh);
assertCoverage('ru', ru);
assertCoverage('ja', ja);

fs.writeFileSync(PACKS_PATH, JSON.stringify({ en, ja, zh, ru }));
console.log('packs updated', Object.keys(en).length, 'keys');

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatEntry(k, v) {
  if (typeof v === 'string') return `  '${k}': '${esc(v)}',`;
  const lines = [`  '${k}': {`];
  for (const [form, text] of Object.entries(v)) {
    lines.push(`    ${form}: '${esc(text)}',`);
  }
  lines.push('  },');
  return lines.join('\n');
}

function formatBlock(lang, map) {
  return [`  // EPUB mining panels (${lang})`]
    .concat(Object.entries(map).map(([k, v]) => formatEntry(k, v)))
    .join('\n');
}

let src = fs.readFileSync(CATALOGS, 'utf8');
if (src.includes("'epub.mining.step1.title'")) {
  console.log('catalogs already patched');
  process.exit(0);
}

const byLang = { en, ja, zh, ru };
// Insert before each language's Settings > Wallpaper page comment that follows flash section.
// There are exactly 4 occurrences of this comment in catalogs.ts.
const NEEDLE = '  // Settings > Wallpaper page';
let searchFrom = 0;
for (const lang of ['en', 'ja', 'zh', 'ru']) {
  const idx = src.indexOf(NEEDLE, searchFrom);
  if (idx < 0) throw new Error('missing wallpaper marker for ' + lang);
  const block = formatBlock(lang, byLang[lang]) + '\n\n';
  src = src.slice(0, idx) + block + src.slice(idx);
  searchFrom = idx + block.length + NEEDLE.length;
}

fs.writeFileSync(CATALOGS, src);
console.log('catalogs patched ok');
