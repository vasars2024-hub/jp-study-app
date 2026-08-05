// Airing schedule -> release matching (audit C1-3) — Simplified Chinese.

import type { Catalog } from '../core';

export const ANIME_SCHEDULE_ZH: Catalog = {
  'schedule.title': '放送时间表',
  'schedule.sub': '正在放送的剧集，并匹配种子索引中的资源。',
  'schedule.load': '加载时间表',
  'schedule.refresh': '刷新',
  'schedule.loading': '正在读取时间表…',
  'schedule.empty': '该时间段内没有安排放送。',
  'schedule.unavailable': '无法读取放送时间表：{detail}',
  'schedule.summary': '已匹配 {exact} · 待确认 {review} · 无资源 {none}',
  'schedule.episode': '第 {episode} 集',
  'schedule.window.day': '未来 24 小时',
  'schedule.window.week': '未来 7 天',
  'schedule.allowBatches': '接受合集打包',

  'schedule.state.exact': '已找到资源',
  'schedule.state.review': '可能匹配 — 未确认',
  'schedule.state.none': '未找到资源',

  'schedule.reason.searchFailed': '无法连接到该标题的索引。',
  'schedule.reason.noReleases': '索引未返回该标题的任何结果。',
  'schedule.reason.noEpisodeMatch': '该标题有资源，但没有这一集的。',
  'schedule.reason.belowConfidence': '索引返回的结果都与该标题匹配度不足。',

  'schedule.matchedAs': '匹配为“{title}”，置信度 {percent}%',
  'schedule.source': '时间表：AniList · 资源：{source}',
  'schedule.sourceNone': '时间表：AniList · 无资源',
  'schedule.seeders': '做种数',
  'schedule.considered': '已考察 {count} 条',
  'schedule.copyMagnet': '复制磁力链接',
  'schedule.copied': '已复制磁力链接',
};
