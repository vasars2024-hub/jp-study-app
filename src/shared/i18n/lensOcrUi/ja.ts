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
};
