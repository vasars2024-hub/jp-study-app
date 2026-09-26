// The built-in Resources catalogue — Japanese. See ./en.ts for scope and key shape.

import type { Catalog } from '../core';

export const RESOURCES_CATALOG_JA: Catalog = {
  // Dictionaries & lookup
  'resourcesCatalog.cat.dictionaries.title': '辞書・検索',
  'resourcesCatalog.cat.dictionaries.blurb': '単語・漢字・例文を調べる。',
  'resourcesCatalog.item.dictionaries.jisho':
    '定番の英和辞典。英語・漢字・読みから検索でき、手書き入力にも対応。このアプリの辞書検索もこれを使っています。',
  'resourcesCatalog.item.dictionaries.weblio':
    '収録語数が膨大な国語辞典。日本語の定義が読めるようになったら最適で、英語の辞書よりはるかに細かなニュアンスがわかります。',
  'resourcesCatalog.item.dictionaries.yomitan':
    'ウェブページ上の日本語にカーソルを合わせるだけで、すぐに定義がポップアップ表示されるブラウザ拡張機能。Yomichan の現行の後継版です。',
  'resourcesCatalog.item.dictionaries.10ten-reader':
    '軽量なマウスオーバー辞書のブラウザ拡張（旧 Rikaichamp）。Yomitan より手軽な優れた代替です。',
  'resourcesCatalog.item.dictionaries.ichi-moe':
    '日本語の文を丸ごと貼り付けると、読みと意味つきで単語に分割してくれます。難しい一文をほどくのにぴったり。',
  'resourcesCatalog.item.dictionaries.takoboto':
    '見やすい辞書で、オフライン対応の優れた Android アプリと例文つき。スマホで重宝します。',
  // Kanji & vocab (SRS)
  'resourcesCatalog.cat.kanji-srs.title': '漢字・語彙（SRS）',
  'resourcesCatalog.cat.kanji-srs.blurb': '間隔反復で言葉を定着させるシステム。',
  'resourcesCatalog.item.kanji-srs.anki':
    '間隔反復を備えた、最も強力な無料フラッシュカードアプリ。このアプリから AnkiConnect 経由で単語を直接送れます。',
  'resourcesCatalog.item.kanji-srs.wanikani':
    '部首と語呂合わせを使い、決まった SRS スケジュールで約 2,000 字の漢字と 6,000 語を教えます。最初の 3 レベルは無料。',
  'resourcesCatalog.item.kanji-srs.jpdb-io':
    '本・アニメ・ゲームを分析し、読んだり観たりする前にその語彙を予習できます。イマージョンに最適。',
  'resourcesCatalog.item.kanji-srs.kanji-koohii':
    '「Remembering the Kanji」方式に沿った、全漢字のコミュニティ製の覚え方。無料の復習と共有ストーリー。',
  'resourcesCatalog.item.kanji-srs.renshuu':
    '漢字・語彙・文法のドリルがそろった親しみやすいオールインワンサイト。無料枠が充実し、コミュニティも内蔵。',
  // Grammar references
  'resourcesCatalog.cat.grammar.title': '文法リファレンス',
  'resourcesCatalog.cat.grammar.blurb': '腑に落ちない文法を深く解説。',
  'resourcesCatalog.item.grammar.tae-kim-s-guide':
    '無料で愛用者の多い文法ガイド。日本語の実際の構造に沿って、基礎から順に教えてくれます。',
  'resourcesCatalog.item.grammar.bunpro':
    'JLPT の全文法項目を穴埋め形式の復習で進める文法 SRS。外部の解説へのリンクつき。',
  'resourcesCatalog.item.grammar.imabi':
    '初級から上級まで、教科書並みに徹底した文法レッスン。細部まで知りたいときのリファレンス。',
  'resourcesCatalog.item.grammar.maggie-sensei':
    '教科書には載っていない、リアルで今どきのくだけた日本語を、例文たっぷりで気軽に学べるレッスン。',
  'resourcesCatalog.item.grammar.jlpt-sensei':
    'JLPT レベルごとに厳密に整理された文法・語彙・漢字のリスト。各項目に例文つき。',
  'resourcesCatalog.item.grammar.tofugu':
    '文法・漢字・文化・学習法についての読みやすい記事。「なぜ」を補うのにうってつけ。',
  // Reading practice
  'resourcesCatalog.cat.reading.title': '読解練習',
  'resourcesCatalog.cat.reading.blurb': '段階別読み物とネイティブの文章でレベルアップ。',
  'resourcesCatalog.item.reading.nhk-news-web-easy':
    '実際のニュースを、ふりがなと音声つきのやさしい日本語に書き直したもの。生の素材への定番の第一歩。',
  'resourcesCatalog.item.reading.satori-reader':
    '辞書・文法メモ・音声を内蔵した段階別の読み物。すでに知っている単語に合わせて調整されます。',
  'resourcesCatalog.item.reading.tadoku-free-books':
    'レベル別に並んだ無料の段階別読み物。「多読」向けに作られており、やさしい文章をたくさん読んで流暢さを育てます。',
  'resourcesCatalog.item.reading.watanoc':
    'N5〜N3 の日本語で書かれた、ふりがなつきの無料ウェブマガジン。身近な話題の短い記事。',
  'resourcesCatalog.item.reading.aozora-bunko':
    '著作権の切れた作品を集めた日本の無料電子図書館。名作小説や物語が数千点。マウスオーバー辞書と組み合わせて。',
  // Listening & video
  'resourcesCatalog.cat.listening.title': 'リスニング・動画',
  'resourcesCatalog.cat.listening.blurb': '理解できるインプットで耳を鍛える。',
  'resourcesCatalog.item.listening.comprehensible-japanese':
    '完全な初心者から上級まで段階分けされた動画レッスン。映像を使い、すべてやさしい日本語で教えます。初期のリスニングに最適。',
  'resourcesCatalog.item.listening.nihongo-con-teppei':
    'やさしい日本語で話す、短くて親しみやすいポッドキャスト。初級・中級者向けの無料エピソードが数百本。',
  'resourcesCatalog.item.listening.japanesepod101':
    '全レベルの書き起こしつき音声・動画レッスンの巨大ライブラリ。無料コンテンツが多く、有料プランもあります。',
  'resourcesCatalog.item.listening.game-gengo':
    '実際のゲーム画面を使って日本語の文法を学べる、無料の YouTube チャンネル。勉強が本当に楽しくなります。',
  'resourcesCatalog.item.listening.animelon':
    '日本語・英語・ローマ字の字幕を同時に表示し、学習用の辞書も内蔵したアニメ視聴サイト。',
  // Immersion tools
  'resourcesCatalog.cat.tools.title': 'イマージョンツール',
  'resourcesCatalog.cat.tools.blurb': '見たもの・読んだものをすべて学習素材に。',
  'resourcesCatalog.item.tools.asbplayer':
    '字幕を動画に同期させ、音声とスクリーンショットつきの例文を Anki に直接マイニング。イマージョン派の定番です。',
  'resourcesCatalog.item.tools.language-reactor':
    'Netflix と YouTube に二言語字幕とクリック検索を追加するブラウザ拡張機能。',
  'resourcesCatalog.item.tools.migaku':
    '手持ちのメディア、ポップアップ辞書、Anki カード作成をつなぐオールインワンのイマージョンツールキット。',
  'resourcesCatalog.item.tools.ojad':
    'オンライン日本語アクセント辞書。単語どころか文全体のピッチアクセントの型まで表示します。',
  'resourcesCatalog.item.tools.forvo':
    'ネイティブが発音した単語や名前を聞けます。実際にどう聞こえるかを確かめるのに最適。',
  // Practice & community
  'resourcesCatalog.cat.community.title': '会話練習・コミュニティ',
  'resourcesCatalog.cat.community.blurb': '話し相手や一緒に学ぶ仲間が見つかる。',
  'resourcesCatalog.item.community.italki':
    'ネイティブの講師やチューターと、手頃な料金で 1 対 1 のレッスンや気軽な会話を予約できます。話し始めるのに最良の方法。',
  'resourcesCatalog.item.community.hellotalk':
    '言語交換アプリ：あなたの言語を学ぶ日本語話者とチャットでき、添削ツールも内蔵。',
  'resourcesCatalog.item.community.tandem':
    'テキスト・音声・ビデオで練習できる言語交換パートナーを、洗練されたコミュニティで見つけられます。',
  'resourcesCatalog.item.community.r-learnjapanese':
    '質問やおすすめ教材を共有する大規模で活発なコミュニティ。長年続く Daily Thread ですぐに助けが得られます。',
  // Chinese: dictionaries & characters
  'resourcesCatalog.cat.zh-dictionaries.title': '中国語：辞書・漢字',
  'resourcesCatalog.cat.zh-dictionaries.blurb': '単語や漢字を調べ、筆順を覚え、漢字を反復練習する。',
  'resourcesCatalog.item.zh-dictionaries.pleco':
    '定番の中国語辞書アプリ：手書き入力、カメラ OCR、文書リーダー、フラッシュカード。基本機能は無料で、追加辞書は有料。',
  'resourcesCatalog.item.zh-dictionaries.mdbg':
    'CC-CEDICT をもとにした高速な無料ウェブ辞書。字の分解、筆順、用例語つき。',
  'resourcesCatalog.item.zh-dictionaries.cc-cedict':
    '多くの無料中国語ツールを支える、コミュニティ編集のオープンな中英辞書（CC BY-SA）。ダウンロードして自分のデッキに使えます。',
  'resourcesCatalog.item.zh-dictionaries.zhongwen':
    '任意のウェブページ上でピンイン・声調・意味を表示する、中国語用のマウスオーバー辞書拡張機能。',
  'resourcesCatalog.item.zh-dictionaries.hanzi-writer':
    '簡体字・繁体字数千字の筆順アニメーション。書いた一画ずつを判定するクイズモードつき。',
  'resourcesCatalog.item.zh-dictionaries.dong-chinese':
    '体系的なコースつきで、字源と構成要素を分解。なぜその字がその形なのかを説明します。',
  'resourcesCatalog.item.zh-dictionaries.outlier-linguistics':
    '意味・音・形の構成要素を区別して解説する、学術的な漢字辞典。Pleco との相性抜群。',
  'resourcesCatalog.item.zh-dictionaries.skritter':
    '漢字の手書き SRS：画面上で一字ずつ書き、一画ごとに採点されます。',
  'resourcesCatalog.item.zh-dictionaries.hack-chinese':
    'HSK や教科書の語彙リストと頻度データを備えた語彙 SRS。リスニングとタイピングで復習します。',
  'resourcesCatalog.item.zh-dictionaries.hsk-academy':
    'レベル別の無料 HSK 単語リスト。例文、筆順、印刷用シートつき。',
  'resourcesCatalog.item.zh-dictionaries.purple-culture':
    'ピンイン変換・辞書・HSK ツール。文章を貼り付けると、各字の上に声調記号つきのピンインが付きます。',
  'resourcesCatalog.item.zh-dictionaries.chinese-text-project':
    '対訳とリンクされた辞書つきの古典・近代以前の中国語文献。上級者向け。',
  // Chinese: reading, listening & grammar
  'resourcesCatalog.cat.zh-practice.title': '中国語：読解・リスニング・文法',
  'resourcesCatalog.cat.zh-practice.blurb': '段階別の物語、文法の解説、聞き取り用のネイティブ動画。',
  'resourcesCatalog.item.zh-practice.chinese-grammar-wiki':
    '最も充実した無料の中国語文法リファレンス。CEFR レベル順に整理され、各文型に例文が豊富。',
  'resourcesCatalog.item.zh-practice.du-chinese':
    '音声、ピンイン表示の切り替え、タップ検索つきの段階別読解アプリ。HSK 1 から上級まで。',
  'resourcesCatalog.item.zh-practice.mandarin-bean':
    'HSK レベル別の無料の段階別ストーリーと記事。それぞれにピンイン、単語リスト、訳の切り替えつき。',
  'resourcesCatalog.item.zh-practice.maayot':
    '自分のレベルに合った短い物語が毎日届き、簡単な読解チェックと作文課題つき。',
  'resourcesCatalog.item.zh-practice.the-chairman-s-bao':
    'ニュースをもとにした段階別リーダー。HSK レベル、音声、フラッシュカード内蔵。',
  'resourcesCatalog.item.zh-practice.mandarin-companion':
    '段階別読み物：有名な小説を、使用する漢字数を絞った中国語で書き直したもの。',
  'resourcesCatalog.item.zh-practice.readibu':
    'ポップアップ辞書、単語の保存、読書統計つきで中国語のウェブ小説が読めます。',
  'resourcesCatalog.item.zh-practice.chinesepod':
    '入門から上級まで、会話形式の音声レッスンの大規模アーカイブ。書き起こしと語彙つき。',
  'resourcesCatalog.item.zh-practice.bilibili':
    'アニメ・Vlog・講義が集まる中国の主要動画サイト。ほとんどの動画に中国語字幕や画面上の文字があります。',
  'resourcesCatalog.item.zh-practice.iqiyi':
    '中国語・英語字幕つきの中国ドラマやバラエティ番組。カタログの多くは広告つきで無料。',
  'resourcesCatalog.item.zh-practice.r-chineselanguage':
    '標準中国語や広東語の質問、教材リスト、学習記録が集まる大規模コミュニティ。',
  // Russian: dictionaries & stress
  'resourcesCatalog.cat.ru-dictionaries.title': 'ロシア語：辞書・アクセント',
  'resourcesCatalog.cat.ru-dictionaries.blurb': 'アクセント・語形・実際の用法つきで単語を調べる。',
  'resourcesCatalog.item.ru-dictionaries.openrussian':
    'アクセント記号、完全な格変化・活用表、音声、例文つきのオープンなロシア語辞書。',
  'resourcesCatalog.item.ru-dictionaries.russiangram':
    'ロシア語の文章を貼り付けると、全単語にアクセント記号を付けて返してくれます。音読の前に便利。',
  'resourcesCatalog.item.ru-dictionaries.wiktionary-russian':
    'ロシア語版ウィクショナリー：膨大な語彙について、アクセント、全変化形、語源、用法の注記を掲載。',
  'resourcesCatalog.item.ru-dictionaries.gramota-ru':
    'ロシア語の正書法・アクセント・用法の総合ポータル。複数の学術辞書を一度に検索できます。',
  'resourcesCatalog.item.ru-dictionaries.multitran':
    '専門用語や、翻訳者が寄せたフレーズの訳を収録した巨大な対訳辞書。',
  'resourcesCatalog.item.ru-dictionaries.russian-national-corpus':
    '数億語の実際のロシア語を検索し、単語や構文が実際にどう使われているかを確認できます。',
  'resourcesCatalog.item.ru-dictionaries.reverso-context':
    '単語やフレーズを多数の実際の対訳文ペアで示すので、訳語ではなく文脈の中で理解できます。',
  // Russian: reading, listening & grammar
  'resourcesCatalog.cat.ru-practice.title': 'ロシア語：読解・リスニング・文法',
  'resourcesCatalog.cat.ru-practice.blurb': '文法の解説、読むための文章、聞くためのロシア語。',
  'resourcesCatalog.item.ru-practice.master-russian':
    'アルファベットから分詞まで、無料の文法レッスン、頻度リスト、語彙の記事。',
  'resourcesCatalog.item.ru-practice.russian-for-everyone':
    '練習問題と読み物つきの、初級から中級までの体系的な文法コース。',
  'resourcesCatalog.item.ru-practice.real-russian-club':
    '日常ロシア語と文法についてのレッスン、ポッドキャスト、動画。多くに書き起こしつき。',
  'resourcesCatalog.item.ru-practice.russian-with-max':
    '文化や日常生活についてロシア語でゆっくりはっきり話すポッドキャストと動画。書き起こしつき。',
  'resourcesCatalog.item.ru-practice.easy-russian':
    'ネイティブへの街頭インタビュー。ロシア語と英語の字幕つき。自然な速さの生の会話です。',
  'resourcesCatalog.item.ru-practice.russianpod101':
    '会話文、書き起こし、語彙リストつきの、レベル別音声・動画レッスン。',
  'resourcesCatalog.item.ru-practice.arzamas':
    '文学・歴史・芸術についての、ロシア語による無料の講座とポッドキャスト。中上級のリスニングに最適。',
  'resourcesCatalog.item.ru-practice.lib-ru':
    '最も古いロシアのオンライン図書館の一つ。古典文学やパブリックドメインの文章が豊富。',
  'resourcesCatalog.item.ru-practice.mosfilm-cinema':
    'モスフィルム撮影所の公式サイトで、ソ連時代の名作映画を無料でオンライン視聴できます。',
  'resourcesCatalog.item.ru-practice.r-russian':
    'ロシア語学習者のための大規模で親しみやすいコミュニティ：文法の質問、教材、練習。',
  // Any language
  'resourcesCatalog.cat.any-language.title': '全言語共通',
  'resourcesCatalog.cat.any-language.blurb': '日本語・中国語・ロシア語のどれにも使えるツール。',
  'resourcesCatalog.item.any-language.tatoeba':
    '数百の言語で翻訳された例文を集めたオープンな（CC BY）コレクション。音声つきのものも多数。',
  'resourcesCatalog.item.any-language.youglish':
    '単語を入力すると、実際の YouTube 動画でその単語が話される瞬間に直接ジャンプして聞けます。',
  'resourcesCatalog.item.any-language.forvo':
    'ほぼすべての言語の単語や名前を、ネイティブが発音した録音で聞けます。',
  'resourcesCatalog.item.any-language.language-reactor':
    'Netflix と YouTube で 2 つの字幕を同時表示するブラウザ拡張機能。ポップアップ辞書と単語保存つき。',
  'resourcesCatalog.item.any-language.lingq':
    '好きな文章や動画を取り込み、タップ検索しながら読めます。すでに知っている単語も記録されます。',
  'resourcesCatalog.item.any-language.readlang':
    'クリックした単語をその場で翻訳し、フラッシュカードにしてくれるウェブリーダー。',
  'resourcesCatalog.item.any-language.clozemaster':
    '単語の頻度順に並んだ穴埋め式の例文ドリル。50 以上の言語に対応。',
  'resourcesCatalog.item.any-language.wiktionary':
    '無料の多言語辞書：数百万語について、発音、語形、語源、訳語を掲載。',
};
