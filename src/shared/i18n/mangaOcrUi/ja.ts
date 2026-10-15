// The manga reader's automatic OCR -- Japanese. See ./en.ts for scope.
import type { Catalog } from '../core';

export const MANGA_OCR_UI_JA: Catalog = {
  'mangaOcrUi.autoOcr': 'ページを自動で読み取る',
  'mangaOcrUi.autoOcr.hint':
    '開いたページと次のページの文字を先に読み取るので、すぐに単語を指して調べられます。各ページは一度だけ読み取って保存します。',
  'mangaOcrUi.phase.loading': '文字認識を準備しています…',
  'mangaOcrUi.phase.detect': 'ページの文字を探しています…',
  'mangaOcrUi.phase.read': '吹き出しを読み取り中（{current}/{total}）…',
  'mangaOcrUi.models.autoOffer':
    'マンガOCRのモデルを入れると、ページを自動で読み取ります。ダウンロードは一度だけで、オフラインで動きます。',
};
