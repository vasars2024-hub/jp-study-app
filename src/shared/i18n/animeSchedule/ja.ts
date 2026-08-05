// Airing schedule -> release matching (audit C1-3) — Japanese.

import type { Catalog } from '../core';

export const ANIME_SCHEDULE_JA: Catalog = {
  'schedule.title': '放送スケジュール',
  'schedule.sub': '放送中のエピソードと、トレント索引で一致したリリース。',
  'schedule.load': 'スケジュールを読み込む',
  'schedule.refresh': '更新',
  'schedule.loading': 'スケジュールを読み込んでいます…',
  'schedule.empty': 'この期間に予定されている放送はありません。',
  'schedule.unavailable': '放送スケジュールを読み込めませんでした：{detail}',
  'schedule.summary': '一致 {exact} · 要確認 {review} · リリースなし {none}',
  'schedule.episode': '第{episode}話',
  'schedule.window.day': '24時間以内',
  'schedule.window.week': '7日以内',
  'schedule.allowBatches': '一括パックも対象にする',

  'schedule.state.exact': 'リリースあり',
  'schedule.state.review': '一致の可能性あり — 未確認',
  'schedule.state.none': 'リリースなし',

  'schedule.reason.searchFailed': 'このタイトルについて索引に接続できませんでした。',
  'schedule.reason.noReleases': '索引はこのタイトルに何も返しませんでした。',
  'schedule.reason.noEpisodeMatch': 'このタイトルのリリースはありますが、この話数のものはありません。',
  'schedule.reason.belowConfidence': '索引の結果はどれもこのタイトルに十分一致しませんでした。',

  'schedule.matchedAs': '「{title}」として一致（確信度 {percent}%）',
  'schedule.source': 'スケジュール：AniList · リリース：{source}',
  'schedule.sourceNone': 'スケジュール：AniList · リリースなし',
  'schedule.seeders': 'シード数',
  'schedule.considered': '検討 {count} 件',
  'schedule.copyMagnet': 'マグネットをコピー',
  'schedule.copied': 'マグネットをコピーしました',
};
