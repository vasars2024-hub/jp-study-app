import type { Catalog } from '../core';

export const LENS_OCR_UI_JA: Catalog = {
  'lensOcr.stage.refining': '小さな文字をもう一度詳しく読み取っています…',
  'lensOcr.stage.basic': '内蔵の文字認識で読み取っています… {percent}%',
  'lensOcr.cancel': 'キャンセル',
  'lensOcr.cancelHint': 'この読み取りを止めて、範囲を選び直します。Esc でレンズを閉じます。',

  'lensOcr.cached': '即時',
  'lensOcr.cachedHint': '同じ画面を少し前に読み取ったので、その結果を再利用しました。',

  'lensOcr.basic.badge': '簡易OCR',
  'lensOcr.basic.badgeHint': 'ダウンロード不要の、アプリ内蔵の文字認識で読み取りました。',
  'lensOcr.basic.notice': '高精度モデルが未インストールのため、内蔵のオフライン文字認識で読み取りました。はっきりした文字はよく読めます。装飾的な文字や小さい文字、ぼやけた文字にはモデルをインストールしてください。',

  // ---- Watch region ----
  'lensOcr.watch.start': '監視',
  'lensOcr.watch.startHint': 'この範囲を残し、文字が変わるたびに自動で読み直します（ビジュアルノベルやゲームのテキスト枠向け）。',
  'lensOcr.watch.selectHint': '監視するテキスト枠をドラッグで囲んでください',
  'lensOcr.watch.panel': '監視中の範囲',
  'lensOcr.watch.active': 'この範囲を監視中',
  'lensOcr.watch.reading': '新しい文字を読み取り中…',
  'lensOcr.watch.empty': '今は範囲内に文字がありません。',
  'lensOcr.watch.waiting': '文字が変わるたびに、ここに表示されます。',
  'lensOcr.watch.stop': '監視を停止',
  'lensOcr.watch.stopHint': 'この範囲の読み直しを止めます。最後の読み取り結果はレンズを閉じるまで残ります。',
};
