// onb3: first-run setup follow-ups and translated error text for the manga
// reader and the visual-novel panels. — Japanese.

import type { Catalog } from '../core';

export const ONB3_UI_JA: Catalog = {
  'onb3.dl.builtInSettingUpDesc':
    '和英辞書はアプリに同梱されていて、いま準備中です。ダウンロードは必要ありません。',
  'onb3.dl.builtInSettingUp': '準備中 {percent}%',
  'onb3.dl.builtInSettingUpIndeterminate': '準備中…',
  'onb3.finish.blancTour':
    'ガイドツアーは Study OS のデスクトップを案内します。Blanc は別のウィンドウで開くため、ツアーはヘルプからいつでも始められます。',

  'onb3.manga.pageMissing': 'このページはライブラリにありません。マンガを開き直してから、もう一度スキャンしてください。',
  'onb3.manga.regionTooSmall': '範囲が小さすぎて読み取れません。文字の周りをもう少し大きく囲んでください。',
  'onb3.manga.phase.ocr': '文字を読み取り中',
  'onb3.manga.phase.translate': '翻訳中',

  'onb3.vn.scanFailed': 'フォルダーをスキャンできませんでした。',
  'onb3.vn.analyzeFailed': 'この行を分析できませんでした。',
  'onb3.vn.agent.addFailed': 'ビジュアルノベルを追加できませんでした。',
  'onb3.vn.agent.routesFailed': 'ルートを保存できませんでした。',
  'onb3.vn.agent.captureFailed': 'キャプチャした行を保存できませんでした。',
};
