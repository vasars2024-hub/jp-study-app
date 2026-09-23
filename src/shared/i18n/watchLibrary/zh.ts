// Watch-tracking library — Simplified Chinese. See ./en.ts.
import type { Catalog } from '../core';

export const WATCH_LIBRARY_ZH: Catalog = {
  'watchLibrary.status.watching': '在看',
  'watchLibrary.status.completed': '看过',
  'watchLibrary.status.plan': '想看',
  'watchLibrary.status.on_hold': '搁置',
  'watchLibrary.status.dropped': '弃看',
  'watchLibrary.status.rewatching': '重温中',

  'watchLibrary.kind.anime': '动画',
  'watchLibrary.kind.tv': '电视剧',
  'watchLibrary.kind.film': '电影',
  'watchLibrary.kind.other': '其他',

  'watchLibrary.source.mal-export': 'MyAnimeList 导出',
  'watchLibrary.source.mal-sync': 'MyAnimeList 同步',
  'watchLibrary.source.letterboxd': 'Letterboxd 导出',
  'watchLibrary.source.local': '在应用中观看',
  'watchLibrary.source.manual': '手动添加',

  'watchLibrary.sort.title': '标题',
  'watchLibrary.sort.year': '年份',
  'watchLibrary.sort.score': '我的评分',
  'watchLibrary.sort.added': '添加日期',
  'watchLibrary.sort.lastWatched': '最近观看',
  'watchLibrary.sort.finished': '看完日期',
  'watchLibrary.sort.progress': '进度',
  'watchLibrary.sort.runtime': '时长',
  'watchLibrary.sort.updated': '最近更新',

  'watchLibrary.import.dialogTitle': '导入 MyAnimeList 或 Letterboxd 导出文件',
  'watchLibrary.import.filterExports': 'MyAnimeList 和 Letterboxd 导出文件',
  'watchLibrary.import.filterAll': '所有文件',
  'watchLibrary.import.error.notFound': '找不到该文件。',
  'watchLibrary.import.error.unreadable': '无法读取该文件：{detail}',
  'watchLibrary.import.error.unrecognized':
    '这不是 MyAnimeList 或 Letterboxd 的导出文件。请选择 MyAnimeList 的 animelist .xml.gz 文件或 Letterboxd 的导出 .zip。',
  'watchLibrary.import.error.empty': '导出文件中没有任何作品。',
  'watchLibrary.import.error.mangaOnly': '这是 MyAnimeList 的漫画列表。只有动画列表可以导入观看库。',
  'watchLibrary.import.error.tooLarge': '文件过大，不像是列表导出文件（{size}）。',

  'watchLibrary.error.notFound': '该作品已不在库中。',
  'watchLibrary.error.unknownMedia': '该文件不在媒体库中。',
  'watchLibrary.error.notTrackable': '只能记录动画、电视剧和电影文件。',
  'watchLibrary.error.invalidTitle': '作品需要名称和类型。',
  'watchLibrary.error.addFailed': '无法添加该作品。',
};
