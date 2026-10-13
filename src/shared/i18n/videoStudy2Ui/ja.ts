// Video study, round 2 (vstudy.) — Japanese.

import type { Catalog } from '../core';

export const VIDEO_STUDY2_UI_JA: Catalog = {
  'vstudy.pad.group': 'カードの音声',
  'vstudy.pad.before': '前の余白',
  'vstudy.pad.after': '後の余白',
  'vstudy.pad.ms': '{ms} ミリ秒',
  'vstudy.pad.stopAtNeighbours': '前後のセリフにはみ出さない',
  'vstudy.pad.note': '採取した音声・クリップと圧縮音声に使われます。',

  'vstudy.condensed.button': '圧縮音声（MP3）',
  'vstudy.condensed.hint': 'このエピソードのセリフだけを続けて1つのMP3にします。どこでも聞き流せます。',
  'vstudy.condensed.progress': 'セリフを切り出し中… {done} / {total}',
  'vstudy.condensed.cancel': '中止',
  'vstudy.condensed.done': '圧縮音声を保存しました：セリフ {minutes} 分。',
  'vstudy.condensed.skipped': {
    other: '{count} 行は切り出せなかったため含まれていません。',
  },
  'vstudy.condensed.failed': '圧縮音声を作れませんでした：このファイルからセリフを切り出せません。',
  'vstudy.condensed.empty': 'このトラックには圧縮できるセリフがありません。',
  'vstudy.condensed.cancelled': '圧縮音声の作成を中止しました。',

  'vstudy.align.previous': '前のセリフを今に合わせる',
  'vstudy.align.next': '次のセリフを今に合わせる',
  'vstudy.align.hint': 'そのセリフが聞こえている間に押すと、そのセリフがこの瞬間に始まるよう字幕の遅延が設定されます。',
  'vstudy.align.none': 'ここには合わせるセリフがありません。',
  'vstudy.align.done': '字幕の遅延を {delay} 秒に設定しました。',

  'vstudy.keys.title': 'キーボードショートカット',
  'vstudy.keys.study': '学習用キー',
  'vstudy.keys.unbound': '未設定',
  'vstudy.keys.note': '? キーでこの一覧の表示を切り替えます。学習用キーは「設定 › キーボードショートカット」で変更できます。',

  'vstudy.frame.notOnScreen': 'このセリフを再生すると画像を撮れます：ストリームにはフレームを切り出すファイルがありません。',
};
