// The guided tour (shared/onboarding/tourScript.ts) — Simplified Chinese.

import type { Catalog } from '../core';

export const TOUR_UI_ZH: Catalog = {
  // The bubble's controls.
  'tour.progressChapter': '{chapter} · 第 {current}/{total} 步',
  'tour.next': '下一步',
  'tour.back': '上一步',
  'tour.skip': '跳过引导',
  'tour.chapterDone': '完成',
  'tour.done': '结束',
  'tour.hotkey.unset': '未设置',
  'tour.menu.title': '选择一个章节',
  'tour.menu.body':
    '每个章节只有几步，结束后会回到这里。可以按任意顺序选择任意章节，也可以现在结束。引导随时可以从帮助和开始菜单再次打开。',
  'tour.menu.done': '已完成',
  // The Start menu's way back into the tour.
  'desktop.startMenu.tour': '引导教程',

  // The chapters.
  'tour.chapter.basics': '桌面',
  'tour.chapter.basics.desc': '开始菜单、搜索、任务栏和快捷键',
  'tour.chapter.watch': '观看与收集',
  'tour.chapter.watch.desc': '学习播放器、双语字幕和句子卡组',
  'tour.chapter.flashcards': '闪卡',
  'tour.chapter.flashcards.desc': '复习、混合卡组、打乱和练习模式',
  'tour.chapter.reading': '书籍与查词',
  'tour.chapter.reading.desc': '图书馆、阅读器和词典',
  'tour.chapter.grammar': '语法',
  'tour.chapter.grammar.desc': '浏览语法点，并按计划复习',
  'tour.chapter.games': '游戏竞技场',
  'tour.chapter.games.desc': '计入统计的快速小练习',
  'tour.chapter.files': '文件',
  'tour.chapter.files.desc': '导入和制作的一切，集中在一处',
  'tour.chapter.captions': '实时字幕',
  'tour.chapter.captions.desc': '为电脑正在播放的声音加字幕并收集',
  'tour.chapter.companion': '在任意应用上使用 Gum',
  'tour.chapter.companion.desc': '全局快捷键、轮盘、卡片预览和阅读取词镜',
  'tour.chapter.pets': '桌面伙伴',
  'tour.chapter.pets.desc': '桌面上的伙伴，以及你自己的精灵包',
  'tour.chapter.extension': '浏览器扩展',
  'tour.chapter.extension.desc': '在 Chrome 网页上查词和收集',
  'tour.chapter.settings': '个性化',
  'tour.chapter.settings.desc': '学习语言、界面语言和外观',

  // The desktop.
  'tour.welcome.title': '欢迎使用 Gum',
  'tour.welcome.body':
    '这是分章节的简短引导。本章介绍桌面，之后可以任选其他章节，也可以都不看。按 Esc 随时关闭，之后可在 设置 → {help} 和开始菜单中再次打开。',
  'tour.start.title': '一切都在“开始”里',
  'tour.start.body':
    '桌面特意以空白状态打开。观看、阅读、词典、语法、闪卡、游戏和设置等所有应用都在“开始”里。点一下试试。',
  'tour.startSearch.title': '搜索一切',
  'tour.startSearch.body':
    '在这里输入，即可查找任何应用、设置、书籍或已保存的单词。也可以在任何地方用下面的按键打开同一个搜索：',
  'tour.taskbar.title': '任务栏',
  'tour.taskbar.body':
    '打开的窗口会排在这里，旁边是时钟、通知和快捷设置。窗口可以像普通桌面一样拖动、调整大小和叠放，每个窗口也都可以弹出为独立窗口。',
  'tour.desktops.title': '两个桌面',
  'tour.desktops.body':
    '一个桌面用来学习，另一个用来做其他事。每个桌面都有自己的窗口、小组件和布局。',
  'tour.shortcuts.title': '按键随你定',
  'tour.shortcuts.body':
    '应用内和全局的所有快捷键都列在这里，并且都可以修改。标有“全局”的项目在 Gum 处于后台时也能使用。',
  'tour.lens.title': '读取屏幕上的任何文字',
  'tour.lens.body':
    '阅读取词镜不仅在 Gum 里可用，在 Windows 的任何地方都能用。按下快捷键，框选游戏、PDF 或视频中的文字，它就会被识别、查词，并可直接收集。',

  // Watch and the study player.
  'tour.watch.import.title': '导入你的视频',
  'tour.watch.import.body':
    '导入一个文件或整个文件夹，或直接拖到这个窗口上。视频旁边的字幕会被自动找到并与视频匹配。',
  'tour.watch.library.title': '你的媒体库',
  'tour.watch.library.body':
    '剧集和电影按作品归类，显示你的进度、可以继续观看的内容，以及你自己开始的下载。',
  'tour.watch.player.title': '学习播放器',
  'tour.watch.player.body':
    '播放视频会打开学习播放器：学习语言的字幕下方还有第二条字幕，点任何单词即可查词，任何一句都能连同音频保存为卡片。',
  'tour.watch.deck.title': '把视频变成卡组',
  'tour.watch.deck.body':
    '“制作句子卡组”（在作品页面、播放器和文件中）会把视频切成带音频的句子。可以和其他卡片混合复习，也可以用听力模式免手播放。',

  // Flashcards.
  'tour.flash.review.title': '复习',
  'tour.flash.review.body':
    '选择一个卡组或混合多个，选好顺序（默认把卡组混在一起打乱）后开始。每张卡片评为“重来”“困难”“良好”或“简单”；“打乱”会重新排列剩下的卡片。',
  'tour.flash.practice.title': '练习',
  'tour.flash.practice.body':
    '学习、书写、配对、测试和听力可用于任何卡组，不会影响它的复习计划。',
  'tour.flash.import.title': '导入卡片',
  'tour.flash.import.body':
    '导入 CSV、TSV 或文本列表，或直接粘贴到这里。在 Gum 任何地方收集的卡片都会自动出现。',

  // Books, the reader and the dictionary.
  'tour.read.import.title': '你的书',
  'tour.read.import.body':
    '导入 EPUB 和 PDF 书籍、漫画压缩包和文本文件，或把它们拖到这个窗口上。',
  'tour.read.popup.title': '先查词，再收集',
  'tour.read.popup.body':
    '在阅读器里点击任何单词，就会弹出带读音和例句的词典。“收集”会把单词连同句子存入闪卡，下方的四个按钮可以把单词标为新词、学习中、熟悉或已掌握。',
  'tour.read.workspace.title': '更多阅读方式',
  'tour.read.workspace.body':
    '阅读发现会推荐适合你水平的书。阅读清单、阅读取词镜的截取内容和阅读计划都在图书馆旁边。',
  'tour.read.dictionary.title': '词典',
  'tour.read.dictionary.body':
    '可以用学习语言或英语离线搜索。变形和屈折形式会追溯到词典原形。',

  // Grammar.
  'tour.grammar.explorer.title': '语法浏览器',
  'tour.grammar.explorer.body':
    '所有语法点都附有结构、用法和例句，可按级别筛选。把想学的加入学习队列。',
  'tour.grammar.review.title': '练习与复习',
  'tour.grammar.review.body':
    '“练习”针对你选的语法点做练习；“复习”会像闪卡一样按计划让它们再次出现。',

  // Game Arena.
  'tour.games.list.title': '选择游戏',
  'tour.games.list.body':
    '组句、助词、读音、听力等简短练习，按你的水平、用你的学习语言进行。',
  'tour.games.progress.title': '进度',
  'tour.games.progress.body':
    '每一轮都会获得经验值、连续天数和徽章，每个答案都会计入统计。',

  // Files.
  'tour.files.tree.title': '一切集中在一处',
  'tour.files.tree.body':
    '书籍、视频、音频、卡组和收集的卡片按类型整理。备份和恢复也在这里。',
  'tour.files.scan.title': '扫描文件夹',
  'tour.files.scan.body':
    '指定一个文件夹，在任何内容加入你的库之前，先查看扫描结果：每个文件是什么、会放到哪里。',

  // Live captions and system audio.
  'tour.captions.intro.title': '实时字幕',
  'tour.captions.intro.body':
    '在任何应用上方显示字幕栏——直播、游戏、通话都可以——每个单词点一下就能查词。系统音频采集默认关闭，且完全私密：音频只保存在内存中，开启时会显示一个红点，只有你加入卡片的片段才会被保存。',
  'tour.captions.mine.title': '收集你听到的内容',
  'tour.captions.mine.body':
    '开启采集后，按一个键就能把当前字幕行或最近几秒的音频做成卡片，添加前可以先检查。',

  // The companion.
  'tour.companion.wheel.title': '伙伴轮盘',
  'tour.companion.wheel.body':
    '在任何应用上按下快捷键，查词、翻译、收集、用取词镜读取等学习操作会环绕在指针周围。按数字键即可选择。',
  'tour.companion.lookup.title': '随处查词',
  'tour.companion.lookup.body':
    '在任何应用里——游戏、视频、图片——指向一个单词，无需复制就能查词；也可以选中文字再查。',
  'tour.companion.card.title': '卡片预览',
  'tour.companion.card.body':
    '用选中的文字起草一张卡片，并以来源窗口作为出处；编辑后点“添加”。也可以不打开任何窗口，直接收集上一次查过的单词。这两项在你于此处设置按键之前都未绑定。',
  'tour.companion.lens.title': '阅读取词镜',
  'tour.companion.lens.body':
    '在屏幕任何位置框选文字，即可作为一段文章读取。连按两次读取整个屏幕；玩视觉小说时可重复读取同一区域。',

  // Companions on the desktop.
  'tour.pets.pick.title': '桌面伙伴',
  'tour.pets.pick.body':
    '小伙伴们可以在你的桌面上走动，并对你的学习做出反应。选择谁出现、有多活跃。',
  'tour.pets.import.title': '使用你自己的角色',
  'tour.pets.import.body':
    '导入 Shimeji 风格的精灵包（.zip 或文件夹）或一个帧图片文件夹，然后决定每个伙伴是谁。',

  // The browser extension.
  'tour.extension.what.title': '浏览器扩展',
  'tour.extension.what.body':
    'Chrome 扩展为网页加上查词和收集功能。在那里收集的内容会进入 Gum 的闪卡，如果你使用 Anki，也会进入 Anki。',
  'tour.extension.pair.title': '只需配对一次',
  'tour.extension.pair.body':
    '在 Chrome 的开发者模式中加载这里显示的扩展文件夹，然后配对：按“立即配对”，再从扩展的选项中获取令牌。它只连接这台电脑上的 Gum。',

  // Make it yours.
  'tour.settings.study.title': '你学习的语言',
  'tour.settings.study.body':
    '日语、中文或俄语——词典、阅读器、语法和游戏都会随之切换。中文和俄语词典只需在这里下载一次。',
  'tour.settings.ui.title': '应用的语言',
  'tour.settings.ui.body':
    '英语、日语、中文或俄语，与学习语言分开设置。引导也会随之切换。',
  'tour.settings.looks.title': '外观',
  'tour.settings.looks.body':
    '主题会改变整个桌面的样子，从浅色到 OLED 纯黑；强调色、字体和材质也在这一页。有一种外观是特意藏起来的——Aero，一种晶莹的经典桌面。在桌面上输入它的名字就能找到。',
  'tour.settings.liquid.title': '液态窗口',
  'tour.settings.liquid.body':
    '这个按钮可以把任何窗口变成液态：无边框、半透明，能透出壁纸。再按一次即可恢复。',
  'tour.settings.help.title': '随时回来',
  'tour.settings.help.body':
    '可以在这里，或在开始菜单的“引导教程”中，重新播放整个引导或单独的某个章节。',
};
