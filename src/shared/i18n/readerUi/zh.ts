// Novel/manga reader, dictionary popup and reader mining chrome (round-2 reader pass). — Chinese (Simplified). See ./en.ts for scope.

import type { Catalog } from '../core';

export const READER_UI_ZH: Catalog = {
  'readerUi.dictPopup.aria': '词典：{query}',
  'readerUi.dictPopup.levels': '你对这个词的掌握程度',
  'readerUi.dictPopup.mine': '收集',
  'reader.pdf.page': '第 {page} 页',
  'reader.pdf.blankPage': '（第 {page} 页没有文字）',
  'readerUi.dictPopup.mineTitle': '将这个词及其例句保存到阅读器收藏',
  'readerUi.lookup.noSelection': '先选中一个词，或将指针指向正文中的词，再按一次快捷键即可查询。',
  'readerUi.gloss.langs': '释义语言',
  'readerUi.gloss.otherHidden': '其他语言的释义已隐藏。在上方开启对应语言即可显示。',
  'readerUi.translate.popupAria': '翻译：{text}',
  'readerUi.translate.preparing': '正在准备翻译…',
  'readerUi.translate.loadingModel': '正在加载模型… {pct}%',
  'readerUi.translate.translating': '正在翻译…',
  'readerUi.translate.to': '翻译为',
  'readerUi.translate.openAiSettings': '打开 AI 设置',
  'readerUi.study.askAgent': '询问助手',
  'readerUi.study.askPassage': '询问本段',
  'readerUi.study.collection': '收藏',
  'readerUi.manga.ocrAuto': '自动',
  'readerUi.manga.ocrAutoTitle': '根据页面或选框的形状判断竖排或横排文字',
  'readerUi.manga.drawBox': '框选',
  'readerUi.manga.drawBoxTitle': '在页面上拖出一个框来识别其中的文字',
  'readerUi.manga.drawBoxHint': '拖动鼠标框住想要识别的文字。',
  'readerUi.manga.handwriting': '手写',
  'readerUi.manga.handwritingTitle': '手写一个字来查询',
};
