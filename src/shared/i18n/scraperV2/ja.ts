// Scraper, second round (2026-10) -- Japanese. Keys: see ./en.ts.
import type { Catalog } from '../core';

export const SCRAPER_V2_JA: Catalog = {
  'scr2.note.pagesFailed': '{list} を読み込めませんでした。エピソード一覧が不完全な可能性があります。',
  'scr2.note.pageStatus': '{page} ページ目（HTTP {status}）',
  'scr2.note.pageEmpty': '{page} ページ目（行なし）',
  'scr2.note.pageUnreachable': '{page} ページ目（接続できません）',
  'scr2.torrentFile.title': '.torrent ファイルを追加',
  'scr2.torrentFile.desc': 'このコンピューターに保存した torrent ファイルを、マグネットリンクと同じカテゴリ・保存先・オプションで qBittorrent に送ります。',
  'scr2.torrentFile.choose': '.torrent ファイルを選ぶ...',
  'scr2.torrentFile.adding': '追加中...',
  'scr2.torrentFile.disabled': '先に qBittorrent の設定で送信を有効にしてください。',
  'scr2.torrentFile.result': '追加：{sent}、スキップ：{skipped}、失敗：{failed}。',
  'scr2.torrentFile.empty': 'ファイルが空か、大きすぎます。',
  'scr2.torrentFile.too-large': '.torrent にしては大きすぎるファイルです。',
  'scr2.torrentFile.not-bencode': '.torrent ファイルではありません。',
  'scr2.torrentFile.no-info': 'torrent のメタデータがありません。',
  'scr2.torrentFile.no-name': 'torrent にファイル名もフォルダー名もありません。',
  'scr2.torrentFile.no-pieces': 'torrent にピースのハッシュがありません。',
  'scr2.torrentFile.duplicate': '同じ torrent が 2 回選ばれました。',
};
