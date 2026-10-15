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

  'upd3.auto.label': '自动检查更新',
  'upd3.auto.desc': '关闭后，只有按“立即检查”时才检查。',
  'upd3.pause.button': { other: '暂停更新 {count} 天' },
  'upd3.pause.until': '更新已暂停至 {date}。“立即检查”仍可使用。',
  'upd3.pause.resume': '恢复更新',
  'upd3.diag.crash.label': '在本机保存崩溃报告',
  'upd3.diag.crash.desc': 'Gum 崩溃时，会在 Gum 文件夹中保存一个小的崩溃文件。不会发送到任何地方。是否加入问题报告由你决定。',
  'upd3.diag.crash.restart': '关闭此项将在下次启动 Gum 时生效。',
  'upd3.diag.report.save': '保存问题报告…',
  'upd3.diag.report.desc': '用于附在错误报告中的 zip 文件：最近的错误日志、Gum 和 Windows 版本、已去除密钥、令牌和个人文件夹路径的设置，以及崩溃文件。在你分享之前，它只保存在你的电脑上。',
  'upd3.diag.report.dialogTitle': '保存问题报告',
  'upd3.diag.report.saved': '问题报告已保存：{file}',
  'upd3.diag.report.failed': '无法保存问题报告。',
  'upd3.diag.report.show': '在文件夹中显示',
  'upd3.state.manualOnly': '尚未检查。只有按“立即检查”时才会检查更新。',
};
