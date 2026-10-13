// 词典弹窗（与 Yomitan/10ten 对齐，第 4 轮）：从光标处取最长匹配、嵌套查词、
// 键盘操作、复合词按组成词评级、添加按钮显示 Anki 重复。键名前缀 dict4.。

import type { Catalog } from '../core';

export const DICT4_UI_ZH: Catalog = {
  // ---- 最长匹配 ----
  'dict4.scan.group': '要查的词',
  'dict4.scan.pick': '查询 {word}',

  // ---- 嵌套查词 ----
  'dict4.nested.back': '返回 {word}',

  // ---- 复合词按组成词评级 ----
  'dict4.parts.label': '组成词',
  'dict4.parts.levelTitle': '{word}：{level}',
  'dict4.parts.combinedTitle': '按组成词评级，阅读器会分别为它们着色。显示的是掌握程度最低的组成词的等级。',
  'dict4.knowledge.partsAction': '{word} 按组成词（{parts}）评级。点击将它们全部标为“{next}”。',

  // ---- 键盘 ----
  'dict4.keys.title': '按键：1–4 评级 · P 播放读音 · ↓ ↑ 在词条间移动 · Backspace 返回',

  // ---- Anki 重复 ----
  'dict4.anki.addAgain': '+ 再次添加',
  'dict4.anki.addAgainTitle': '这个词已在 Anki 中。再次添加会生成第二条笔记。',
};
