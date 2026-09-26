// The built-in Resources catalogue — Chinese. See ./en.ts for scope and key shape.

import type { Catalog } from '../core';

export const RESOURCES_CATALOG_ZH: Catalog = {
  // Dictionaries & lookup
  'resourcesCatalog.cat.dictionaries.title': '词典与查询',
  'resourcesCatalog.cat.dictionaries.blurb': '查单词、汉字和例句。',
  'resourcesCatalog.item.dictionaries.jisho':
    '最常用的英日词典。可用英文、汉字、读音搜索，甚至手写查字。本应用的查词功能也基于它。',
  'resourcesCatalog.item.dictionaries.weblio':
    '收录量巨大的日语原生词典。能读懂日语释义后最合适，细微差别远比英日词典丰富。',
  'resourcesCatalog.item.dictionaries.yomitan':
    '浏览器扩展：鼠标悬停在网页上的任何日语单词上，立即弹出释义。Yomichan 的现代继任者。',
  'resourcesCatalog.item.dictionaries.10ten-reader':
    '轻量的悬停词典浏览器扩展（原名 Rikaichamp），是比 Yomitan 更简单的好选择。',
  'resourcesCatalog.item.dictionaries.ichi-moe':
    '粘贴一整句日语，它会拆分成单词并标出读音和释义，最适合拆解难懂的句子。',
  'resourcesCatalog.item.dictionaries.takoboto':
    '界面清爽的词典，有好用的离线 Android 应用和例句，手机上很方便。',
  // Kanji & vocab (SRS)
  'resourcesCatalog.cat.kanji-srs.title': '汉字与词汇（SRS）',
  'resourcesCatalog.cat.kanji-srs.blurb': '用间隔重复让单词真正记住。',
  'resourcesCatalog.item.kanji-srs.anki':
    '功能最强的免费间隔重复抽认卡应用。本应用可通过 AnkiConnect 把单词直接发送过去。',
  'resourcesCatalog.item.kanji-srs.wanikani':
    '通过部首和助记法，按固定的 SRS 进度教授约 2,000 个汉字和 6,000 个单词。前 3 级免费。',
  'resourcesCatalog.item.kanji-srs.jpdb-io':
    '分析书籍、动画和游戏，让你在阅读或观看之前先学好其中的词汇。非常适合沉浸式学习。',
  'resourcesCatalog.item.kanji-srs.kanji-koohii':
    '围绕《Remembering the Kanji》方法、覆盖每个汉字的社区助记。免费复习，故事共享。',
  'resourcesCatalog.item.kanji-srs.renshuu':
    '集汉字、词汇、语法练习于一体的友好网站，免费额度慷慨，还自带社区。',
  // Grammar references
  'resourcesCatalog.cat.grammar.title': '语法参考',
  'resourcesCatalog.cat.grammar.blurb': '某个语法点想不通时的深入讲解。',
  'resourcesCatalog.item.grammar.tae-kim-s-guide':
    '广受喜爱的免费语法指南，按照日语真实的结构从零讲起。',
  'resourcesCatalog.item.grammar.bunpro':
    '语法 SRS：用填空复习带你走完每个 JLPT 语法点，并附外部讲解链接。',
  'resourcesCatalog.item.grammar.imabi':
    '从入门到高级，教科书般详尽的语法课。想弄清每个细节时的参考。',
  'resourcesCatalog.item.grammar.maggie-sensei':
    '轻松、例句丰富的课程，讲的是教科书里没有的真实、现代甚至俚语化的日语。',
  'resourcesCatalog.item.grammar.jlpt-sensei':
    '严格按 JLPT 级别整理的语法、词汇和汉字列表，每个点都有例句。',
  'resourcesCatalog.item.grammar.tofugu':
    '关于语法、汉字、文化和学习策略的通俗文章，特别适合补上“为什么”。',
  // Reading practice
  'resourcesCatalog.cat.reading.title': '阅读练习',
  'resourcesCatalog.cat.reading.blurb': '分级读物和原生文本，助你进阶。',
  'resourcesCatalog.item.reading.nhk-news-web-easy':
    '用简单日语改写的真实新闻，附假名注音和音频。迈向原生材料的经典第一步。',
  'resourcesCatalog.item.reading.satori-reader':
    '内置词典、语法注释和音频的分级故事，会根据你已掌握的单词自动调整。',
  'resourcesCatalog.item.reading.tadoku-free-books':
    '按级别分类的免费分级读物，专为“泛读”设计——大量阅读简单内容来培养流利度。',
  'resourcesCatalog.item.reading.watanoc':
    '用 N5–N3 日语写成、带假名注音的免费网络杂志，都是日常话题的短文。',
  'resourcesCatalog.item.reading.aozora-bunko':
    '日本免费的公版图书馆，收录数千部经典小说和故事。搭配悬停词典使用。',
  // Listening & video
  'resourcesCatalog.cat.listening.title': '听力与视频',
  'resourcesCatalog.cat.listening.blurb': '用可理解输入训练耳朵。',
  'resourcesCatalog.item.listening.comprehensible-japanese':
    '从零基础到高级分级的视频课，全程用简单日语配合画面讲解，是早期听力的理想材料。',
  'resourcesCatalog.item.listening.nihongo-con-teppei':
    '用简单日语讲的轻松短播客，为初中级学习者准备了数百集免费节目。',
  'resourcesCatalog.item.listening.japanesepod101':
    '海量音频、视频课程库，各级别都附文字稿。免费内容很多，另有付费档位。',
  'resourcesCatalog.item.listening.game-gengo':
    '用真实的游戏截图学习日语语法的免费 YouTube 频道，让学习真正变得有趣。',
  'resourcesCatalog.item.listening.animelon':
    '可同时显示日语、英语和罗马字字幕观看动画，并内置学习用词典。',
  // Immersion tools
  'resourcesCatalog.cat.tools.title': '沉浸式工具',
  'resourcesCatalog.cat.tools.blurb': '把你看的、读的一切变成学习材料。',
  'resourcesCatalog.item.tools.asbplayer':
    '让字幕与视频同步，并把句子（附音频和截图）直接挖到 Anki。沉浸派的必备工具。',
  'resourcesCatalog.item.tools.language-reactor':
    '为 Netflix 和 YouTube 添加双语字幕和点击查词的浏览器扩展。',
  'resourcesCatalog.item.tools.migaku':
    '把你的媒体、弹出词典和 Anki 制卡连在一起的一体化沉浸工具包。',
  'resourcesCatalog.item.tools.ojad':
    '在线日语重音词典，能显示单词乃至整句的音高重音模式。',
  'resourcesCatalog.item.tools.forvo':
    '听母语者朗读的单词和名字，确认实际读音的好帮手。',
  // Practice & community
  'resourcesCatalog.cat.community.title': '练习与社区',
  'resourcesCatalog.cat.community.blurb': '找到可以交流、一起学习的真人。',
  'resourcesCatalog.item.community.italki':
    '以实惠价格预约母语老师或辅导的一对一课程或轻松对话，是开口说的最佳途径。',
  'resourcesCatalog.item.community.hellotalk':
    '语言交换应用：和正在学你母语的日语使用者聊天，内置纠错工具。',
  'resourcesCatalog.item.community.tandem':
    '在氛围良好的社区里寻找语言交换伙伴，通过文字、语音或视频练习。',
  'resourcesCatalog.item.community.r-learnjapanese':
    '规模大、活跃的社区，可提问、推荐资源，长期开设的 Daily Thread 能快速得到帮助。',
  // Chinese: dictionaries & characters
  'resourcesCatalog.cat.zh-dictionaries.title': '中文：词典与汉字',
  'resourcesCatalog.cat.zh-dictionaries.blurb': '查词查字、学笔顺、练汉字。',
  'resourcesCatalog.item.zh-dictionaries.pleco':
    '标准的中文词典应用：手写输入、相机 OCR、文档阅读器和抽认卡。核心功能免费，附加词典需付费。',
  'resourcesCatalog.item.zh-dictionaries.mdbg':
    '基于 CC-CEDICT 的快速免费网络词典，提供汉字拆分、笔顺和例词。',
  'resourcesCatalog.item.zh-dictionaries.cc-cedict':
    '由社区编辑的开放中英词典（CC BY-SA），是大多数免费中文工具的基础。可下载用于自己的卡组。',
  'resourcesCatalog.item.zh-dictionaries.zhongwen':
    '中文悬停词典浏览器扩展，在任意网页上显示拼音、声调和释义。',
  'resourcesCatalog.item.zh-dictionaries.hanzi-writer':
    '数千个简体和繁体字的笔顺动画，测验模式会逐笔检查你写的每一画。',
  'resourcesCatalog.item.zh-dictionaries.dong-chinese':
    '提供汉字字源和部件拆解，并有系统课程，解释汉字为什么长这个样子。',
  'resourcesCatalog.item.zh-dictionaries.outlier-linguistics':
    '区分表意、表音和形体部件的学术型汉字词典，与 Pleco 搭配很好。',
  'resourcesCatalog.item.zh-dictionaries.skritter':
    '汉字手写 SRS：在屏幕上书写每个字，逐笔评分。',
  'resourcesCatalog.item.zh-dictionaries.hack-chinese':
    '词汇 SRS，含 HSK 和教材词表及词频数据，以听力和打字复习为核心。',
  'resourcesCatalog.item.zh-dictionaries.hsk-academy':
    '按级别分的免费 HSK 词表，附例句、笔顺和可打印的练习纸。',
  'resourcesCatalog.item.zh-dictionaries.purple-culture':
    '拼音转换、词典和 HSK 工具。粘贴文本即可在每个字上方标注带声调的拼音。',
  'resourcesCatalog.item.zh-dictionaries.chinese-text-project':
    '古典及前现代中文文献，附对照译文和联动词典，适合高级学习者。',
  // Chinese: reading, listening & grammar
  'resourcesCatalog.cat.zh-practice.title': '中文：阅读、听力与语法',
  'resourcesCatalog.cat.zh-practice.blurb': '分级故事、语法讲解，以及可供收听的原生视频。',
  'resourcesCatalog.item.zh-practice.chinese-grammar-wiki':
    '最完整的免费普通话语法参考，按 CEFR 级别排列，每个句型都有大量例句。',
  'resourcesCatalog.item.zh-practice.du-chinese':
    '分级阅读应用，带音频、拼音开关和点按查词，从 HSK 1 到高级。',
  'resourcesCatalog.item.zh-practice.mandarin-bean':
    '按 HSK 级别的免费分级故事和文章，每篇都有拼音、生词表和译文开关。',
  'resourcesCatalog.item.zh-practice.maayot':
    '每天一篇适合你水平的短故事，附简短理解测验，再写一句自己的话。',
  'resourcesCatalog.item.zh-practice.the-chairman-s-bao':
    '以新闻为素材的分级读物，按 HSK 分级，带音频和内置抽认卡。',
  'resourcesCatalog.item.zh-practice.mandarin-companion':
    '分级读物：用少量受控汉字把名著改写成中文。',
  'resourcesCatalog.item.zh-practice.readibu':
    '用弹出词典阅读中文网络小说，可收藏生词并查看阅读统计。',
  'resourcesCatalog.item.zh-practice.chinesepod':
    '从入门到高级的大量对话式音频课程存档，附文字稿和词汇。',
  'resourcesCatalog.item.zh-practice.bilibili':
    '中国主要的视频网站，有动画、Vlog 和讲座，大多数视频带中文字幕或屏幕文字。',
  'resourcesCatalog.item.zh-practice.iqiyi':
    '带中英文字幕的中国电视剧和综艺节目，大部分内容可免费观看（含广告）。',
  'resourcesCatalog.item.zh-practice.r-chineselanguage':
    '关于普通话和粤语问题、资源列表和学习日志的大型社区。',
  // Russian: dictionaries & stress
  'resourcesCatalog.cat.ru-dictionaries.title': '俄语：词典与重音',
  'resourcesCatalog.cat.ru-dictionaries.blurb': '查词时同时看到重音、词形和真实用法。',
  'resourcesCatalog.item.ru-dictionaries.openrussian':
    '开放的俄语词典，带重音标记、完整的变格与变位表、音频和例句。',
  'resourcesCatalog.item.ru-dictionaries.russiangram':
    '粘贴俄语文本，返回每个词都标好重音的版本，朗读前很有用。',
  'resourcesCatalog.item.ru-dictionaries.wiktionary-russian':
    '俄语版维基词典：为海量词汇提供重音、所有屈折形式、词源和用法说明。',
  'resourcesCatalog.item.ru-dictionaries.gramota-ru':
    '俄语拼写、重音和用法的权威门户，一次搜索即可查阅多部学术词典。',
  'resourcesCatalog.item.ru-dictionaries.multitran':
    '收录专业词汇和译者贡献的短语译法的大型双语词典。',
  'resourcesCatalog.item.ru-dictionaries.russian-national-corpus':
    '检索数亿词的真实俄语语料，看一个词或结构实际上如何使用。',
  'resourcesCatalog.item.ru-dictionaries.reverso-context':
    '在大量真实的双语句对中展示单词或短语，让你在语境中理解，而不只看释义。',
  // Russian: reading, listening & grammar
  'resourcesCatalog.cat.ru-practice.title': '俄语：阅读、听力与语法',
  'resourcesCatalog.cat.ru-practice.blurb': '语法讲解、阅读文本和可供收听的俄语。',
  'resourcesCatalog.item.ru-practice.master-russian':
    '从字母到形动词，提供免费语法课、词频表和词汇文章。',
  'resourcesCatalog.item.ru-practice.russian-for-everyone':
    '从初级到中级的系统语法课程，附练习和阅读文本。',
  'resourcesCatalog.item.ru-practice.real-russian-club':
    '关于日常俄语和语法的课程、播客和视频，很多附有文字稿。',
  'resourcesCatalog.item.ru-practice.russian-with-max':
    '用缓慢清晰的俄语讲文化和日常生活的播客与视频，附文字稿。',
  'resourcesCatalog.item.ru-practice.easy-russian':
    '对母语者的街头采访，带俄英双语字幕，是自然语速的真实口语。',
  'resourcesCatalog.item.ru-practice.russianpod101':
    '按级别的音频和视频课程，附对话、文字稿和词汇表。',
  'resourcesCatalog.item.ru-practice.arzamas':
    '关于文学、历史和艺术的免费俄语课程与播客，非常适合中高级听力。',
  'resourcesCatalog.item.ru-practice.lib-ru':
    '历史最悠久的俄语在线图书馆之一，收录经典文学和大量公版文本。',
  'resourcesCatalog.item.ru-practice.mosfilm-cinema':
    '莫斯科电影制片厂的官方网站，可免费在线观看其经典苏联电影。',
  'resourcesCatalog.item.ru-practice.r-russian':
    '面向俄语学习者的大型友好社区：语法问题、资源和练习。',
  // Any language
  'resourcesCatalog.cat.any-language.title': '适用于任何语言',
  'resourcesCatalog.cat.any-language.blurb': '日语、中文、俄语都适用的工具。',
  'resourcesCatalog.item.any-language.tatoeba':
    '开放（CC BY）的多语种翻译例句集，涵盖数百种语言，许多带音频。',
  'resourcesCatalog.item.any-language.youglish':
    '输入一个词，就能在真实的 YouTube 视频中听到它，并直接跳到说出它的那一刻。',
  'resourcesCatalog.item.any-language.forvo':
    '几乎所有语言的单词和名字的母语者录音。',
  'resourcesCatalog.item.any-language.language-reactor':
    '在 Netflix 和 YouTube 上同时显示两条字幕的浏览器扩展，带弹出词典和生词收藏。',
  'resourcesCatalog.item.any-language.lingq':
    '导入任意文本或视频，边读边点按查词；它会记录你已经认识的单词。',
  'resourcesCatalog.item.any-language.readlang':
    '网页阅读器：点哪个词就翻译哪个词，并把它们变成抽认卡。',
  'resourcesCatalog.item.any-language.clozemaster':
    '按词频排序的填空句子练习，支持五十多种语言。',
  'resourcesCatalog.item.any-language.wiktionary':
    '免费的多语种词典：为数百万个词提供发音、词形、词源和翻译。',
};
