// Speaking and writing, round 2 — Japanese. See ./en.ts.

import type { Catalog } from '../core';

export const AI_SPEAK2_UI_JA: Catalog = {
  // ---- shadowing: pitch and rhythm ----
  'aiSpeak.prosody.title': '高さとリズム（録音から測定）',
  'aiSpeak.prosody.skipped.not-comparable': '高さとリズムは、発話がセリフに十分近いときに測定します（音の一致率 60% 以上、音の数もほぼ同じ）。',
  'aiSpeak.prosody.skipped.no-audio': '録音から高さとリズムを読み取れませんでした。',
  'aiSpeak.prosody.skipped.no-voice': '録音に測定できる声が見つかりませんでした。',
  'aiSpeak.prosody.accentScore': '辞書どおりのアクセント: {total} 語中 {matched} 語。',
  'aiSpeak.prosody.noPitchDictionary': 'アクセント辞書が入っていないため、リズムだけを測定しました。設定の「辞書」から追加できます。',
  'aiSpeak.prosody.noPitchWords': 'このセリフの単語はアクセント辞書にないため、リズムだけを測定しました。',
  'aiSpeak.prosody.unvoiced': '声になっている部分が少なく、アクセントを判定できません。もう少し大きな声で言ってみてください。',
  'aiSpeak.prosody.pattern.heiban': '平板型',
  'aiSpeak.prosody.pattern.atamadaka': '頭高型（1拍目のあとで下がる）',
  'aiSpeak.prosody.pattern.nakadaka': '中高型（上がってから語の中で下がる）',
  'aiSpeak.prosody.pattern.odaka': '尾高型（後ろの助詞で下がる）',
  'aiSpeak.prosody.pattern.unknown': '不明',
  'aiSpeak.prosody.verdict.match': '辞書どおり: {expected}。',
  'aiSpeak.prosody.verdict.mismatch': '辞書: {expected}。あなた: {heard}。',
  'aiSpeak.prosody.verdict.unclear': '辞書: {expected}。声が少なく判定できません。',
  'aiSpeak.prosody.legend': '丸: 辞書の高い拍と低い拍（点線は後ろの助詞）。線: あなたの声の高さ。',
  'aiSpeak.prosody.rate.ja': '話している間の速さ: 1 秒に {rate} 拍。元のセリフ: {cue} 拍。',
  'aiSpeak.prosody.rate.zh': '話している間の速さ: 1 秒に {rate} 音節。元のセリフ: {cue} 音節。',
  'aiSpeak.prosody.rateOnly.ja': '話している間の速さ: 1 秒に {rate} 拍。',
  'aiSpeak.prosody.rateOnly.zh': '話している間の速さ: 1 秒に {rate} 音節。',
  'aiSpeak.prosody.pauseInside': '「{word}」の途中で {sec} 秒止まりました。',
  'aiSpeak.prosody.pauseAfter': '読点のない「{word}」のあとで {sec} 秒止まりました。',
  'aiSpeak.prosody.noPauses': 'セリフの途中で止まっていません。',
  'aiSpeak.prosody.estimate': 'このパソコン上で測定した推定値です。各拍の高さは、発話を均等に区切った部分から読み取っています。',

  // ---- conversation partner ----
  'aiSpeak.chat.unanswered': '最後のメッセージにまだ返事がありません。',
  'aiSpeak.chat.retry': '返事をもう一度試す',
  'aiSpeak.chat.voiceSend': '話した内容をすぐに送信',
  'aiSpeak.chat.recall': '前の会話から、相手が使ってみる言葉:',
  'aiSpeak.chat.recallScripted': '前の会話で出会った言葉を使ってみましょう:',
  'aiSpeak.chat.recallUsed': '前の会話から: {words}',
  'aiSpeak.chat.correctionCardBack': '{reason}（あなたの文: {original}）',

  // ---- writing help: cards, history, journal streak ----
  'aiSpeak.write.tab.history': '履歴',
  'aiSpeak.write.saveCard': 'カードに保存',
  'aiSpeak.history.empty': '受けた添削はここに残り、繰り返す間違いが分かります。',
  'aiSpeak.history.kinds': 'よくある添削: {kinds}。',
  'aiSpeak.history.kindCount': { other: '{kind}（{count} 回）' },
  'aiSpeak.history.changes': { other: '{count} 件の修正' },
  'aiSpeak.history.clear': '履歴を消去',
  'aiSpeak.journal.streakToday': { other: '日記の連続記録: {count} 日（最高: {best} 日）。今日の分は完了です。' },
  'aiSpeak.journal.streakOpen': { other: '日記の連続記録: {count} 日（最高: {best} 日）。今日の分を書いて記録を続けましょう。' },
  'aiSpeak.journal.streakNone': '日記を完成させる（すべての単語、十分な文の数）と連続記録が始まります。',
};
