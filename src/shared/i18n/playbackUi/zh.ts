// Seamless playback (playback.) — Simplified Chinese.

import type { Catalog } from '../core';

export const PLAYBACK_UI_ZH: Catalog = {
  'playback.frame.opening': '正在打开 {title}…',
  'playback.frame.openingVideo': '正在打开视频…',
  'playback.frame.slow': '仍在准备播放器…',

  'playback.failed.title': '此视频暂时无法播放',
  'playback.failed.retry': '重试',
  'playback.failed.retrying': '正在重试…',
  'playback.failed.back': '返回',
  'playback.failed.details': '技术详情',
  'playback.failed.crashed': '媒体服务器连续多次停止。请重试；如果问题持续，请重启 Gum。',
  'playback.failed.unhealthy': '媒体服务器启动时间过长。请重试。',
  'playback.failed.spawn-failed': 'Windows 无法启动 Gum 的媒体服务器——安全软件可能阻止了它。请在杀毒软件中允许 Gum，然后重试。',
  'playback.failed.missing-exe': '此安装缺少 Gum 的媒体服务器。请重新安装 Gum 以恢复。',
  'playback.failed.port': 'Gum 无法为视频获取本地端口。请重试。',
  'playback.failed.disabled': '本次会话已关闭视频播放。',
  'playback.failed.connect': 'Gum 无法连接到其媒体服务器。请重试。',
  'playback.failed.player': '播放器无法打开此视频。文件可能已损坏，或是 Gum 无法播放的格式。',
};
