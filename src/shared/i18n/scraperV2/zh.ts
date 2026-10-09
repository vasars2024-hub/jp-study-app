// Scraper, second round (2026-10) -- Simplified Chinese. Keys: see ./en.ts.
import type { Catalog } from '../core';

export const SCRAPER_V2_ZH: Catalog = {
  'scr2.note.pagesFailed': '无法读取{list}；剧集列表可能不完整。',
  'scr2.note.pageStatus': '第 {page} 页（HTTP {status}）',
  'scr2.note.pageEmpty': '第 {page} 页（没有条目）',
  'scr2.note.pageUnreachable': '第 {page} 页（无法访问）',
  'scr2.torrentFile.title': '添加 .torrent 文件',
  'scr2.torrentFile.desc': '把保存在这台电脑上的种子文件发送到 qBittorrent，使用与磁力链接相同的分类、保存路径和选项。',
  'scr2.torrentFile.choose': '选择 .torrent 文件...',
  'scr2.torrentFile.adding': '正在添加...',
  'scr2.torrentFile.disabled': '请先在 qBittorrent 设置中开启发送。',
  'scr2.torrentFile.result': '已添加：{sent}，已跳过：{skipped}，失败：{failed}。',
  'scr2.torrentFile.empty': '文件为空或过大。',
  'scr2.torrentFile.too-large': '文件太大，不像是 .torrent 文件。',
  'scr2.torrentFile.not-bencode': '这不是 .torrent 文件。',
  'scr2.torrentFile.no-info': '文件中没有种子元数据。',
  'scr2.torrentFile.no-name': '种子没有文件名或文件夹名。',
  'scr2.torrentFile.no-pieces': '种子中没有分块哈希。',
  'scr2.torrentFile.duplicate': '同一个种子被选择了两次。',
};
