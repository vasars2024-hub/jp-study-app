// The lock gate (lock2) and the update panel (upd2) — Chinese. See ./en.ts.

import type { Catalog } from '../core';

export const LOCK_UPDATE_UI_ZH: Catalog = {
  'lock2.blocked.command': 'Gum 已锁定。请先解锁再使用该快捷键。',
  'lock2.blocked.extension': 'Gum 已锁定。解锁之前，浏览器扩展的请求会被拒绝。',
  'lock2.blocked.window': 'Gum 已锁定。请先解锁再打开该窗口。',
  'lock2.note.title': '这是学习锁，不是安全边界',
  'lock2.note.covers':
    'Gum 锁定时只显示 PIN 键盘：其他窗口会被隐藏，新窗口要等到解锁后才打开，会打开内容的快捷键和托盘操作会被拒绝，浏览器扩展也会收到“Gum 已锁定”的回复。',
  'lock2.note.background': '后台任务会继续运行，并且仍可能弹出 Windows 通知：下载、定时抓取、实时字幕采集，以及已经开始的录制。',
  'lock2.note.devtools': '安装版和便携版中已禁用开发者工具。',
  'lock2.note.limits':
    '它能挡住路过的人查看你的学习内容，但不能保护你的文件。卡组、书籍和设置都是用户文件夹里的普通文件，应用本身可以在磁盘上被修改，使用调试开关启动的副本也可以被检查。如需保护隐私，请锁定你的 Windows 帐户。',

  'upd2.versionLabel': '版本',
  'upd2.versionUnknown': '未知',
  'upd2.installLabel': '副本',
  'upd2.install.installed': '安装版（自动更新）',
  'upd2.install.portable': '便携版（不会自动更新）',
  'upd2.install.dev': '开发版本',
  'upd2.channelLabel': '渠道',
  'upd2.channel.stable': '稳定版（GitHub 发布）',
  'upd2.lastCheckLabel': '上次检查',
  'upd2.lastCheck.never': '尚未检查',
  'upd2.state.portable': '此副本无法自行更新。请检查是否有新版本，然后从 GitHub 下载。',
  'upd2.state.dev': '开发版本不会自行更新。',
  'upd2.state.checking': '正在检查更新…',
  'upd2.state.downloading': '正在后台下载更新，期间可以照常使用 Gum。',
  'upd2.state.ready': 'Gum {version} 已下载完成。重启即可完成更新。',
  'upd2.state.readyNoVersion': '更新已下载完成。重启即可完成更新。',
  'upd2.state.upToDate': 'Gum {version} 已是最新版本。',
  'upd2.state.notChecked': 'Gum 会在启动一分钟后检查更新，之后每六小时检查一次。',
  'upd2.state.meteredSkipped': '由于 Windows 报告当前为按流量计费的连接，已跳过自动检查。如仍要下载，请点击“立即检查”。',
  'upd2.downloadingFor': {
    other: '已下载 {count} 分钟',
  },
  'upd2.progressLabel': '更新下载',
  'upd2.sizeNote': '完整更新有数百 MB。如果该版本带有增量包，则只下载差异部分。',
  'upd2.error.network': '无法连接到 GitHub。请检查网络连接后重试。',
  'upd2.error.no-feed': '最新版本还没有安装程序的更新文件。Gum 稍后会再试。',
  'upd2.error.updater-missing': '无法启动更新程序（Update.exe）。重新安装 Gum 即可解决。',
  'upd2.error.unknown': '检查更新失败。详细信息见“帮助 > 诊断”。',
  'upd2.checkNow': '立即检查',
  'upd2.restart': '重启以更新',
  'upd2.notes.show': '显示更新说明',
  'upd2.notes.hide': '隐藏更新说明',
  'upd2.notes.loading': '正在加载更新说明…',
  'upd2.notes.failed': '无法加载更新说明。请稍后重试。',
  'upd2.notes.none': '该项目尚未发布任何版本。',
  'upd2.notes.empty': '该版本没有更新说明。',
  'upd2.notes.title': '更新说明：{title}',
  'upd2.notes.published': '发布于 {date}',
  'upd2.notes.truncated': '说明较长，其余内容请在 GitHub 上查看。',
  'upd2.notes.open': '在 GitHub 上打开',
  'upd2.privacy':
    '隐私：安装版会在后台访问 github.com，GitHub 能看到你的 IP 地址。更新说明和上面的版本检查只在你点击按钮时才从 GitHub 获取。Gum 不会发送任何帐户、卡组或学习数据。',
};
