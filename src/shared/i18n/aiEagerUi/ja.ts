// Eager AI strings — ja. See ./en.ts.

import type { Catalog } from '../core';

export const AI_EAGER_UI_JA: Catalog = {
  // The Study command box parses a command without AI too; its intent labels
  // are shown by the non-AI path (`shared/studyFilterRecipe.ts`).
  'study.command.intent.undo-filter': '直前のフィルター変更を元に戻す',
  'study.command.intent.preview-anki': 'Anki への書き出しをプレビュー',
  'study.command.intent.preview-cards': 'カードをプレビュー',
  'study.command.intent.levels': '{levels} の単語を除外',
  'study.command.intent.minimum': '{count} 回以上出てくる単語だけを残す',
  'study.command.intent.maximum': 'カードを最大 {count} 枚にする',
  'study.command.intent.excludeKnown': '既知の単語を除外',
  'study.command.intent.includeKnown': '既知の単語も含める',
  'study.command.intent.excludeDuplicates': '重複する単語を除外',
  'study.command.intent.includeDuplicates': '重複する単語も含める',
  'study.command.intent.excludeAnki': 'Anki にある単語を除外',
  'study.command.intent.includeAnki': 'Anki にある単語も含める',
  'study.command.intent.excludeNames': '固有名詞を除外',
  'study.command.intent.includeNames': '固有名詞も含める',

  // Agent plan refusals, resolved by code in the Agent workspace.
  'agent.plan.error.cloud-disabled':
    'エージェントはクラウドの使用を許可されていません。設定 → AI で許可するか、オフラインモデルで計画してください。',

  // "Suggest targets" on the daily goal: a rule first, AI optional.
  'aiTutor.goal.button': '目標を提案',

  // Navigation entries for the conversation partner, shown in the command
  // palette and the Blanc tool list before any AI surface has opened.
  'blanc.tool.conversation': '会話パートナー',
  'blanc.tool.conversation.desc': '学習中の言語で場面のロールプレイ。オフラインの台本練習か、あなたのレベルに合わせた AI パートナーと。',
  'aiSpeak.paletteTerms': '会話 パートナー チャット スピーキング 練習 ロールプレイ',

  // Rendered with AI off or before any AI surface opens: the Settings > AI
  // per-feature permission rows (`shared/aiSetup.ts`), credential and mirror
  // settings rows, the settings search entry, the assistant card, and the
  // deck row's saved-extras button.
  'aiStudy.feature.whyWrong': 'フラッシュカードの「なぜ間違えた？」',
  'aiStudy.feature.whyWrong.desc': '「なぜ間違えた？」を開くと、カード・入力した答え・デッキ内の似たカード数枚が送られます。',
  'aiStudy.feature.exampleSentences': 'i+1 の例文',
  'aiStudy.feature.exampleSentences.desc': '例文を頼むと、カードと既知語の一部（最大200語）が送られます。',
  'aiStudy.feature.leechRescue': 'リーチ救済の提案',
  'aiStudy.feature.leechRescue.desc': '救済を頼むと、リーチのカードとデッキ内の似たカード数枚が送られます。',
  'aiStudy.feature.contextExplain': 'ポップアップ辞書の「文脈で説明」',
  'aiStudy.feature.contextExplain.desc': '「文脈で説明」を押すと、単語・出てきた文・辞書の語義が送られます。',
  'aiStudy.close': '閉じる',
  'aiStudy.extras.open': '{word} の例文とメモ',
  'aiStudy.extras.panel': '例文とメモ：{word}',
  // Blanc Deck tool: the row button that opens the same saved-extras panel.
  'blanc.shell.deck.extras': 'メモ',
  'aiProv.features.title': 'クラウドを使ってよい機能',
  'aiProv.features.desc':
    'エンジンがクラウドのとき、ここでオンにした機能だけがプロバイダーに文章を送ります。それ以外はオフラインモデルを使うか、動作しません。',
  'aiProv.feature.cardGen': 'AI カードスタジオ',
  'aiProv.feature.cardGen.desc': '「生成」を押したときに、選んだ単語やプリセットが送られます。',
  'aiProv.feature.mirror': 'ミラーライティングの講評',
  'aiProv.feature.mirror.desc': '「評価」を押したときに、下書き・アイデアマップ・模範解答が送られます。',
  'aiProv.feature.subtitleTranslate': 'バックグラウンドでの字幕翻訳',
  'aiProv.feature.subtitleTranslate.desc':
    '再生したエピソードや「視聴中」の作品について、ボタンを押さなくても字幕全体が送られます。オフにすると、オフラインモデルが翻訳します。',
  'aiProv.credential.anthropic.desc': 'Claude Haiku・Sonnet・Opus を、すべてのクラウド AI 機能で使えます。',
  'aiProv.credential.openai.desc': 'OpenAI のモデルを、すべてのクラウド AI 機能で使えます。',
  'aiProv.credential.compat.desc':
    'OpenAI 互換サーバーがキーを求める場合だけ必要です。Ollama と LM Studio には不要です。',
  'aiProv.credential.mirror.desc': 'ミラーライティングが下書きを送れるカスタムエンドポイント用のキーです。',
  'aiProv.credential.use.mirror': 'ミラーライティング（カスタムエンドポイント）',
  'aiProv.mirror.backend.appAi': 'アプリの AI（設定 → AI）',
  'aiProv.mirror.appAiNote': '下書きは「設定 → AI」で選んだエンジンとプロバイダーで採点されます。',
  'aiProv.mirror.appAiNotReady': 'AI がまだ設定されていないため、当面はクイックチェックで採点します。',
  'aiProv.mirror.model': 'モデル',
  'aiProv.mirror.modelHint': 'OpenAI・Ollama・LM Studio ではモデル名が必要です（例：gpt-5-mini、qwen3:8b）。',
  'aiProv.mirror.urlHint':
    'chat-completions の完全な URL、または http://localhost:11434/v1（Ollama）や http://localhost:1234/v1（LM Studio）のようなベース URL。',
  'aiProv.mirror.keyPlaceholder': 'キーを貼り付け（任意）',
  'aiProv.mirror.keySave': 'キーを保存',
  'aiProv.mirror.keyRemove': 'キーを削除',
  'aiProv.mirror.keySaved': 'キーは暗号化された保管庫に保存されています。',
  'aiProv.mirror.keyNone': 'キーは保存されていません。ローカルサーバーには不要です。',
  'aiProv.mirror.keyFailed': 'キーを保存できませんでした。',
  'aiAgent.feature.agentChat': 'エージェントのチャットと計画',
  'aiAgent.feature.agentChat.desc':
    'クラウドモデルに送信したり、クラウドで計画を立てたりすると、メッセージ、これまでの会話、添付したコンテキストが送られます。保存した単語と復習結果は、エージェント設定で許可しない限りこの端末に残ります。',
  'aiAgent.feature.mediaAssistant': '動画・ビジュアルノベルの学習アシスタント',
  'aiAgent.feature.mediaAssistant.desc': 'アシスタントのモードを選ぶと、現在の行とタイトルが送られます。',
  'aiAgent.feature.subtitleFusion': '字幕フュージョンのセカンドオピニオン',
  'aiAgent.feature.subtitleFusion.desc':
    'クラウドモデルが設定された状態でフュージョンジョブを実行すると、判定が分かれた書き起こし行と参照訳が送られます。',
  'aiAgent.feature.ankiAdditions': 'デッキワークベンチの AI 追加',
  'aiAgent.feature.ankiAdditions.desc': '「生成」または「翻訳」を押すと、選んだノートのフィールドが送られます。',
  'aiImmerse.feature.mediaBrief': '動画の要約と内容理解クイズ',
  'aiImmerse.feature.mediaBrief.desc': '「要約と質問」を押したときに、学習中の動画の字幕を分割して送信します。',
  'aiImmerse.feature.linePick': 'マイニング向きの i+1 文を選ぶ',
  'aiImmerse.feature.linePick.desc': '「AI で文を選ぶ」を押したときに、未知語が1つだけの文を最大24件送信します。',
  'aiImmerse.feature.readerExplain': 'i+1 文の解説（リーダー）',
  'aiImmerse.feature.readerExplain.desc': '「解説」を押したときに、イマージョンリーダーの文とその段落を送信します。',
  'aiImmerse.feature.readerSimplify': '段落をやさしく書き換え（リーダー）',
  'aiImmerse.feature.readerSimplify.desc': '「やさしくする」を押したときに、1段落（最大1,500文字）とその未知語を送信します。',
  'aiImmerse.feature.vnExplain': 'ビジュアルノベルの行を解説',
  'aiImmerse.feature.vnExplain.desc': '「解説」または E を押したときに、その行・話者・直前の行を送信します。',
  'aiImmerse.feature.vnTranslate': 'ビジュアルノベルの行を文脈つきで翻訳',
  'aiImmerse.feature.vnTranslate.desc': '翻訳のない行と、その話者・直前の2行を送信します。',
  'aiImmerse.feature.studyCommand': '学習コマンドを自由文で理解',
  'aiImmerse.feature.studyCommand.desc': '組み込みの言い回しに当てはまらないとき、学習コマンド欄に入力した文を送信します。',
  'aiTutor.feature.grammarExplain': '文法：「この文型を説明」',
  'aiTutor.feature.grammarExplain.desc': '「この文型を説明」を押すと、文法項目（文型・レベル・意味）が送られます。',
  'aiTutor.feature.grammarExamples': '文法：例文の作成',
  'aiTutor.feature.grammarExamples.desc': '新しい例文を頼むと、文法項目と既存の例文が送られます。',
  'aiTutor.feature.grammarProduction': '文法：自分の文をチェック',
  'aiTutor.feature.grammarProduction.desc': '「チェック」を押すと、文法項目とあなたが書いた文が送られます。',
  'aiTutor.feature.grammarSighting': '文法：出現箇所のチェック',
  'aiTutor.feature.grammarSighting.desc': '「AIで確認」を押すと、文型が見つかったあなたの教材の文（最大6文）が送られます。',
  'aiTutor.feature.statsCoach': '統計：「統計を説明」',
  'aiTutor.feature.statsCoach.desc': '復習の数値の要約（件数と割合のみ。単語やタイトルは含みません）が送られます。エージェント設定で学習データの共有を許可する必要もあります。',
  'aiTutor.feature.goalSuggest': '1日の目標の提案',
  'aiTutor.feature.goalSuggest.desc': '2週間の学習の平均と現在の目標が送られます。エージェント設定で学習データの共有を許可する必要もあります。',
  'aiTutor.feature.eventParse': 'カレンダー：言葉で予定を入力',
  'aiTutor.feature.eventParse.desc': '「AIに聞く」を押すと、入力した文と今日の日付が送られます。',
  'aiTutor.feature.placementQuiz': '初回設定のレベル診断',
  'aiTutor.feature.placementQuiz.desc': '問題の作成のために学習言語と表示言語だけが送られます。回答の採点はこのPCで行います。',
  'aiTutor.feature.settingsHelp': '設定のヘルプ',
  'aiTutor.feature.settingsHelp.desc': '検索で何も見つからず「AIに聞く」を押すと、質問と設定名の一覧が送られます。',
  'aiTutor.feature.blancMistake': 'Blanc：「間違いを説明」',
  'aiTutor.feature.blancMistake.desc': 'ドリルの問題、正解、あなたの答えが送られます。',
  'aiTutor.feature.blancSummary': 'Blanc：漢字の覚え方と文章の要約',
  'aiTutor.feature.blancSummary.desc': '漢字と辞書の説明、または文章（最大800字）と未知語が送られます。',
  'aiTutor.settings.foundModel': '「{query}」へのAIの提案（検索では見つかりませんでした）：',
  'aiTutor.settings.reason': '（{reason}）',
  'aiSpeak.feature.shadowingFeedback': 'シャドーイング結果の解説',
  'aiSpeak.feature.shadowingFeedback.desc': '「AI で解説」を押したときに、字幕の文、音声モデルが聞き取った文、スコアを送信します。録音はこのパソコンから出ません。',
  'aiSpeak.feature.conversationPartner': '会話パートナー',
  'aiSpeak.feature.conversationPartner.desc': 'メッセージ、直近12ターン、レベルを送信します。既知語のサンプルは、学習データの送信を許可している場合（エージェント設定）のみ送ります。',
  'aiSpeak.feature.writingCorrection': '作文の添削',
  'aiSpeak.feature.writingCorrection.desc': '「…を添削」を押したときに、ノートまたは選択した文（最大2,000文字）を送信します。',
  'aiSpeak.feature.journalGrade': '日記の採点',
  'aiSpeak.feature.journalGrade.desc': '「AI で採点」を押したときに、日記の文とお題の単語を送信します。',

  // Section labels of the "Notes" field an export writes for a card's saved
  // extras (`shared/cardAiExtras.ts`): deck CSV, local package, AnkiConnect.
  'deckExport.notes.mnemonic': '覚え方',
  'deckExport.notes.distinction': '混同しやすい語',
  'deckExport.notes.examples': '例文',
  'deckExport.notes.accepted': '正解として受け入れる答え',
};
