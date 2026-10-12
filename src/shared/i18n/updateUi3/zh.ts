// Updates, third pass (upd3) — Simplified Chinese. See ./en.ts.

import type { Catalog } from '../core';

export const UPDATE3_UI_ZH: Catalog = {
  'upd3.state.preparing': '正在准备下载 Gum {version}…',
  'upd3.state.downloading': '正在下载 Gum {version}。下载期间 Gum 可以照常使用。',
  'upd3.state.downloadingDelta': '正在下载 Gum {version} 的增量更新。下载期间 Gum 可以照常使用。',
  'upd3.state.verifying': '正在校验 Gum {version} 的下载…',
  'upd3.state.installing': '正在后台解压 Gum {version}…',
  'upd3.state.paused': 'Gum {version} 的下载已暂停。',
  'upd3.progress.bytes': '{received} / {total}',
  'upd3.progress.bytesNoTotal': '已接收 {received}',
  'upd3.progress.value': '{percent}%（{received} / {total}）',
  'upd3.cancel': '取消下载',
  'upd3.resume': '继续下载',
  'upd3.retry': '重试',
  'upd3.pausedNote': '已保留 {total} 中的 {received}。继续下载会从这里接着下载。',
  'upd3.partialNote': '已下载的 {received} 会保留；重试会从这里接着下载。',

  'upd3.restart.title': '现在重启会中断：',

  'upd3.notes.linkLabel': '{label}（在 GitHub 上打开）',

  'upd3.history.title': '更新历史',
  'upd3.history.empty': '还没有记录任何版本。',
  'upd3.history.first': 'Gum {version}，{date} 首次启动',
  'upd3.history.updated': 'Gum {version}，{date} 从 {from} 更新',
  'upd3.history.downgraded': 'Gum {version}，{date} 从 {from} 更改',
  'upd3.history.current': '正在运行',
  'upd3.history.showAll': { other: '显示全部 {count} 个版本' },
  'upd3.history.showFewer': '收起',

  'upd3.whatsNew.title': 'Gum {version} 的新内容',
  'upd3.whatsNew.body': 'Gum 已从 {from} 更新到 {version}。',
  'upd3.whatsNew.show': '查看新内容',
  'upd3.whatsNew.hide': '隐藏新内容',
  'upd3.whatsNew.dismiss': '关闭',
  'upd3.whatsNew.noticeTitle': 'Gum 已更新到 {version}',
  'upd3.whatsNew.noticeBody': '在“设置 > 帮助 > 更新”中查看新内容。',
  'upd3.whatsNew.open': '新内容',
};
