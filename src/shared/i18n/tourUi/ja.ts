// The guided tour (shared/onboarding/tourScript.ts) — Japanese.

import type { Catalog } from '../core';

export const TOUR_UI_JA: Catalog = {
  // The bubble's controls.
  'tour.progressChapter': '{chapter} · {current}/{total}',
  'tour.next': '次へ',
  'tour.back': '戻る',
  'tour.skip': 'ツアーをスキップ',
  'tour.chapterDone': '完了',
  'tour.done': '終了',
  'tour.hotkey.unset': '未設定',
  'tour.menu.title': 'チャプターを選ぶ',
  'tour.menu.body':
    '各チャプターは数ステップで、終わるとここに戻ります。好きなものを好きな順番で、または今すぐ終了しても構いません。ツアーはヘルプとスタートメニューからいつでも開けます。',
  'tour.menu.done': '完了済み',
  // The Start menu's way back into the tour.
  'desktop.startMenu.tour': 'ガイドツアー',

  // The chapters.
  'tour.chapter.basics': 'デスクトップ',
  'tour.chapter.basics.desc': 'スタート、検索、タスクバー、ショートカット',
  'tour.chapter.watch': '視聴とマイニング',
  'tour.chapter.watch.desc': '学習プレーヤー、二重字幕、文カードデッキ',
  'tour.chapter.flashcards': 'フラッシュカード',
  'tour.chapter.flashcards.desc': '復習、デッキのミックス、シャッフル、練習モード',
  'tour.chapter.reading': '本と辞書引き',
  'tour.chapter.reading.desc': 'ライブラリ、リーダー、辞書',
  'tour.chapter.grammar': '文法',
  'tour.chapter.grammar.desc': '文型を調べて、スケジュールどおりに復習',
  'tour.chapter.games': 'ゲームアリーナ',
  'tour.chapter.games.desc': '統計に記録される短いドリル',
  'tour.chapter.files': 'ファイル',
  'tour.chapter.files.desc': '取り込んだもの・作ったものをひとまとめに',
  'tour.chapter.captions': 'ライブ字幕',
  'tour.chapter.captions.desc': 'PC で再生中の音声に字幕を付けてマイニング',
  'tour.chapter.companion': 'どのアプリの上でも Gum',
  'tour.chapter.companion.desc': 'ホットキー、ホイール、カードプレビュー、リーディングレンズ',
  'tour.chapter.pets': 'デスクトップのコンパニオン',
  'tour.chapter.pets.desc': 'デスクトップのコンパニオンと自作スプライトパック',
  'tour.chapter.extension': 'ブラウザー拡張機能',
  'tour.chapter.extension.desc': 'Chrome のウェブページで辞書引きとマイニング',
  'tour.chapter.settings': '自分好みに',
  'tour.chapter.settings.desc': '学習言語、アプリの言語、見た目',

  // The desktop.
  'tour.welcome.title': 'Gum へようこそ',
  'tour.welcome.body':
    'チャプターに分かれた短いツアーです。まずはデスクトップを案内し、その後は好きなチャプターを選べます（選ばなくても構いません）。Esc でいつでも閉じられ、設定 → {help} とスタートメニューから再び開けます。',
  'tour.start.title': 'すべてはスタートの中に',
  'tour.start.body':
    'デスクトップはあえて空の状態で始まります。視聴、読書、辞書、文法、フラッシュカード、ゲーム、設定など、すべてのアプリはスタートにあります。クリックしてみてください。',
  'tour.startSearch.title': 'なんでも検索',
  'tour.startSearch.body':
    'ここに入力すると、アプリ、設定、本、保存した単語を探せます。次のキーでどこからでも同じ検索を開けます：',
  'tour.taskbar.title': 'タスクバー',
  'tour.taskbar.body':
    '開いたウィンドウは時計、通知、クイック設定の横に並びます。ウィンドウは普通のデスクトップと同じように移動・リサイズ・重ね合わせができ、それぞれ独立したウィンドウとして切り離すこともできます。',
  'tour.desktops.title': '2 つのデスクトップ',
  'tour.desktops.body':
    '学習用とそれ以外で、デスクトップを使い分けられます。ウィンドウ、ウィジェット、レイアウトはデスクトップごとに保たれます。',
  'tour.shortcuts.title': 'キーはすべて自由に',
  'tour.shortcuts.body':
    'アプリ内とシステム全体のショートカットはすべてここに並び、変更できます。「システム全体」と付いた行は、Gum が裏にあるときも使えます。',
  'tour.lens.title': '画面上の文字をなんでも読む',
  'tour.lens.body':
    'リーディングレンズは Gum の中だけでなく、Windows のどこでも使えます。ホットキーを押し、ゲームや PDF、動画の文字を四角で囲むと、読み取り・辞書引きをして、そのままマイニングできます。',

  // Watch and the study player.
  'tour.watch.import.title': '動画を取り込む',
  'tour.watch.import.body':
    'ファイルやフォルダーを取り込むか、このウィンドウにドロップしてください。動画の隣にある字幕は自動で見つかり、動画に対応付けられます。',
  'tour.watch.library.title': 'ライブラリ',
  'tour.watch.library.body':
    'エピソードや映画は作品ごとにまとまり、進み具合、続きから見るもの、自分で始めたダウンロードが表示されます。',
  'tour.watch.player.title': '学習プレーヤー',
  'tour.watch.player.body':
    '動画を再生すると学習プレーヤーが開きます。学習言語の字幕の下に 2 本目の字幕、どの単語もクリックで辞書、どの行も音声付きでカードに保存できます。',
  'tour.watch.deck.title': '動画をデッキに',
  'tour.watch.deck.body':
    '「文カードデッキを作る」（作品ページ、プレーヤー、ファイルにあります）で、動画を音声付きの文に切り分けます。ほかのカードと混ぜて復習したり、リスニングモードで流し聞きしたりできます。',

  // Flashcards.
  'tour.flash.review.title': '復習',
  'tour.flash.review.body':
    'デッキを 1 つ選ぶか複数を混ぜ、順番を選んで始めます（既定はデッキを混ぜてシャッフル）。カードごとに「もう一度」「難しい」「できた」「簡単」で評価し、「シャッフル」で残りを並べ替えられます。',
  'tour.flash.practice.title': '練習',
  'tour.flash.practice.body':
    '学習、書き取り、マッチ、テスト、リスニングは、復習スケジュールに影響せずどのデッキでも使えます。',
  'tour.flash.import.title': 'カードを取り込む',
  'tour.flash.import.body':
    'CSV、TSV、テキストのリストを読み込むか、ここに貼り付けてください。Gum のどこでマイニングしたカードも自動で届きます。',

  // Books, the reader and the dictionary.
  'tour.read.import.title': '本',
  'tour.read.import.body':
    'EPUB や PDF の本、漫画のアーカイブ、テキストファイルを取り込むか、このウィンドウにドロップしてください。',
  'tour.read.popup.title': '調べて、マイニング',
  'tour.read.popup.body':
    'リーダーでどの単語をクリックしても、読みと例文付きの辞書がポップアップします。「収集」で単語を文ごとフラッシュカードに保存し、その下の 4 つのボタンで「新規」「学習中」「なじみ」「習得済み」を付けられます。',
  'tour.read.workspace.title': 'ほかの読み方',
  'tour.read.workspace.body':
    'リーディングファインダーはレベルに合った本を提案します。リーディングリスト、リーディングレンズのキャプチャ、読書計画もライブラリの隣にあります。',
  'tour.read.dictionary.title': '辞書',
  'tour.read.dictionary.body':
    '学習言語でも英語でもオフラインで検索できます。活用形や変化形は辞書形までたどります。',

  // Grammar.
  'tour.grammar.explorer.title': '文法エクスプローラー',
  'tour.grammar.explorer.body':
    'すべての文型を、構造・使い方・例文付きでレベル別に絞り込めます。学びたいものを学習キューに追加しましょう。',
  'tour.grammar.review.title': '練習と復習',
  'tour.grammar.review.body':
    '「練習」で選んだ文型をドリルし、「復習」がフラッシュカードと同じようにスケジュールに沿って出題し直します。',

  // Game Arena.
  'tour.games.list.title': 'ゲームを選ぶ',
  'tour.games.list.body':
    '文の組み立て、助詞、読み、リスニングなどの短いドリルを、あなたのレベルと学習言語で。',
  'tour.games.progress.title': '進み具合',
  'tour.games.progress.body':
    'ラウンドごとに XP、連続日数、バッジがたまり、答えはすべて統計に記録されます。',

  // Files.
  'tour.files.tree.title': 'すべてをひとまとめに',
  'tour.files.tree.body':
    '本、動画、音声、デッキ、マイニングしたカードを種類別に。バックアップと復元もここにあります。',
  'tour.files.scan.title': 'フォルダーをスキャン',
  'tour.files.scan.body':
    'フォルダーを指定すると、見つかったもの（各ファイルが何で、どこに入るか）をライブラリに加える前に確認できます。',

  // Live captions and system audio.
  'tour.captions.intro.title': 'ライブ字幕',
  'tour.captions.intro.body':
    '配信、ゲーム、通話など、どのアプリの上にも字幕バーを表示し、どの単語もワンクリックで辞書を引けます。システム音声のキャプチャは既定でオフで、プライベートです。音声はメモリ上にだけ保持され、オンの間は赤い点が表示され、保存されるのはカードに追加したクリップだけです。',
  'tour.captions.mine.title': '聞いたものをマイニング',
  'tour.captions.mine.body':
    'キャプチャがオンなら、キー 1 つで今の字幕行や直前の数秒の音声をカードにでき、追加する前に確認できます。',

  // The companion.
  'tour.companion.wheel.title': 'コンパニオンホイール',
  'tour.companion.wheel.body':
    'どのアプリの上でもホットキーを押すと、辞書引き、翻訳、マイニング、レンズでの読み取りなどの学習アクションがポインターの周りに並びます。数字キーで選べます。',
  'tour.companion.lookup.title': 'どこでも辞書引き',
  'tour.companion.lookup.body':
    'ゲーム、動画、画像など、どのアプリでも単語を指すだけでコピーせずに調べられます。テキストを選択して調べることもできます。',
  'tour.companion.card.title': 'カードプレビュー',
  'tour.companion.card.body':
    '選択したテキストから、元のウィンドウを出典にしたカードの下書きを作り、編集して追加できます。最後に調べた単語を、何も開かずにマイニングすることもできます。どちらも、ここでキーを決めるまでは割り当てられていません。',
  'tour.companion.lens.title': 'リーディングレンズ',
  'tour.companion.lens.body':
    '画面上のどこでも文字を四角で囲むと、ひとまとまりの文章として読み取ります。2 回押すと画面全体を、ビジュアルノベルなら同じ範囲を繰り返し読めます。',

  // Companions on the desktop.
  'tour.pets.pick.title': 'デスクトップのコンパニオン',
  'tour.pets.pick.body':
    '小さなコンパニオンがデスクトップを歩き回り、学習に反応します。誰を出すか、どのくらい活発かを選べます。',
  'tour.pets.import.title': '自作のキャラクターも',
  'tour.pets.import.body':
    'Shimeji 形式のスプライトパック（.zip またはフォルダー）やコマ画像のフォルダーを取り込んで、各コンパニオンを誰にするか選べます。',

  // The browser extension.
  'tour.extension.what.title': 'ブラウザー拡張機能',
  'tour.extension.what.body':
    'Chrome 拡張機能で、ウェブページ上でも辞書引きとマイニングができます。そこでマイニングしたものは Gum のフラッシュカードに、使っていれば Anki にも届きます。',
  'tour.extension.pair.title': '一度ペアリングするだけ',
  'tour.extension.pair.body':
    'ここに表示される拡張機能のフォルダーを Chrome のデベロッパーモードで読み込み、「今すぐペアリング」を押して拡張機能のオプションからトークンを取得します。接続先はこの PC の Gum だけです。',

  // Make it yours.
  'tour.settings.study.title': '学習する言語',
  'tour.settings.study.body':
    '日本語、中国語、ロシア語のどれにするかで、辞書、リーダー、文法、ゲームが切り替わります。中国語とロシア語の辞書はここから一度ダウンロードするだけです。',
  'tour.settings.ui.title': 'アプリの言語',
  'tour.settings.ui.body':
    '英語、日本語、中国語、ロシア語から、学習言語とは別に選べます。ツアーも一緒に切り替わります。',
  'tour.settings.looks.title': '見た目',
  'tour.settings.looks.body':
    'テーマはライトから OLED ブラックまでデスクトップ全体の見た目を変えます。アクセント色、フォント、素材もこのページにあります。1 つだけ、わざと隠してある見た目があります。つややかでクラシックなデスクトップ「Aero」です。デスクトップでその名前を入力すると見つかります。',
  'tour.settings.liquid.title': 'リキッドウィンドウ',
  'tour.settings.liquid.body':
    'このボタンでどのウィンドウもリキッド表示になります。枠がなく半透明で、壁紙が透けて見えます。もう一度押すと元に戻ります。',
  'tour.settings.help.title': 'いつでもまたどうぞ',
  'tour.settings.help.body':
    'ツアー全体や 1 つのチャプターは、ここかスタートメニューの「ガイドツアー」から再生できます。',
};
