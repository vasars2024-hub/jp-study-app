// Grammar strings (example audio, test enrolment offer, content language) — Japanese. See ./en.ts.
import type { Catalog } from '../core';

export const GRAMMAR_UI_JA: Catalog = {
  'grammarUi.contentLang': '解説は英語です',
  'grammarUi.contentLangHint': '文法の解説と訳は英語で書かれています。例文は学習中の言語です。',

  'grammarUi.audio.play': 'この例文を聞く',
  'grammarUi.audio.stop': '例文の再生を止める',
  'grammarUi.audio.loading': '音声を準備しています…',
  'grammarUi.audio.noVoice.ja': 'オフラインの日本語音声がインストールされていません。Windows の［設定］>［時刻と言語］>［音声認識］で［音声の追加］から日本語を追加してから、もう一度お試しください。',
  'grammarUi.audio.noVoice.zh': 'オフラインの中国語音声がインストールされていません。Windows の［設定］>［時刻と言語］>［音声認識］で［音声の追加］から中国語（簡体字）を追加してから、もう一度お試しください。',
  'grammarUi.audio.noVoice.ru': 'オフラインのロシア語音声がインストールされていません。Windows の［設定］>［時刻と言語］>［音声認識］で［音声の追加］からロシア語を追加してから、もう一度お試しください。',
  'grammarUi.audio.noSynthesizer': 'このコンピューターにはオフラインの音声合成がないため、例文を読み上げられません。',
  'grammarUi.audio.failed': 'この例文を読み上げられませんでした。少し待ってからもう一度お試しください。',

  'grammarUi.test.offerHint': {
    other: '復習に入っていない文法を {count} 件解答しました。練習テストだけでは新しい文法は復習に追加されません。',
  },
  'grammarUi.test.offerAdd': {
    other: '新しい文法 {count} 件を復習に追加',
  },
  'grammarUi.test.offerDone': {
    other: '{count} 件を復習に追加しました。期日になると出題されます。',
  },
};
