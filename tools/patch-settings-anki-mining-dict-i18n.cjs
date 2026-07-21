/**
 * Insert Settings (clipboard/a11y/reader tip), AnkiSetup, mining.vars, and
 * dict.results chrome keys into catalogs.ts (en/ja/zh/ru).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const catalogsPath = path.join(__dirname, '../src/shared/i18n/catalogs.ts');
let text = fs.readFileSync(catalogsPath, 'utf8');

if (text.includes("'settings.clipboard.title':")) {
  console.log('already');
  process.exit(0);
}

const packs = {
  en: {
    'settings.legacy.intro': 'Make the app comfortable to read and use.',
    'settings.clipboard.title': 'Clipboard History',
    'settings.clipboard.intro':
      'Open it any time with Ctrl Shift V, the command palette, or the clipboard icon in the taskbar.',
    'settings.clipboard.maxSize': 'Maximum history size',
    'settings.clipboard.maxSize.desc':
      'Oldest unpinned entries are dropped once this limit is reached.',
    'settings.clipboard.dedupe': 'Remove consecutive duplicates',
    'settings.clipboard.dedupe.desc':
      "Copying the same text twice in a row won't add a second entry.",
    'settings.clipboard.clearOnExit': 'Clear on application exit',
    'settings.clipboard.clearOnExit.desc':
      'Unpinned history is wiped when the app closes; pinned entries are kept.',
    'settings.clipboard.monitoring': 'Clipboard monitoring',
    'settings.clipboard.monitoring.desc':
      'Automatically record text copied anywhere on your system, not just in the app.',
    'settings.a11y.title': 'Accessibility',
    'settings.a11y.zoom.title': 'App zoom',
    'settings.a11y.zoom.desc':
      'Scales the whole app — text, buttons, and every screen. Use this if the interface feels too small or too large.',
    'settings.a11y.zoom.decrease': 'Decrease app zoom',
    'settings.a11y.zoom.increase': 'Increase app zoom',
    'settings.a11y.zoom.aria': 'App zoom',
    'settings.readerTip.title': 'Reader',
    'settings.readerTip.body':
      "While reading a book, change the text size (now up to 400%) by holding Ctrl and scrolling, or pressing Ctrl + / Ctrl −. Theme, font, and furigana live in the reader's own settings panel. The app zoom above applies on top of this, everywhere in the app.",

    'ankiSetup.cantReach': "Can't reach Anki.",
    'ankiSetup.collectionWait':
      'AnkiConnect responded, but your decks are not available yet. The app retries automatically — wait until Anki finishes opening, or close duplicate Anki windows and reopen.',
    'ankiSetup.installLead': 'To add cards, install the free AnkiConnect add-on (one time):',
    'ankiSetup.step1': 'Open the Anki desktop app and keep it running.',
    'ankiSetup.step2': 'Menu: Tools → Add-ons → Get Add-ons…',
    'ankiSetup.step3': 'Paste this code: {code}',
    'ankiSetup.step4': 'Click OK and restart Anki, then Retry.',
    'ankiSetup.back': 'Back',
    'ankiSetup.checkNow': 'Check now',
    'ankiSetup.retry': 'Retry',

    'mining.vars.summary': 'Insert {placeholders} into templates',
    'mining.vars.lead':
      'Focus front or back above, then click a tag. EPUB mining fills expression, reading, sentence, and frequency from book text only.',
    'mining.vars.translated': 'Translated',
    'mining.vars.pairs': 'Pairs',
    'mining.vars.aria.base': 'Insert a variable',
    'mining.vars.aria.translated': 'Insert a translated variable',
    'mining.vars.aria.pairs': 'Insert a pair variable',
    'mining.vars.translatedEmpty': '{base} — empty unless you add dictionary data later',
    'mining.vars.expression.hint': 'The word / headword — e.g. 勉強',
    'mining.vars.reading.hint': 'Kana reading — e.g. べんきょう',
    'mining.vars.meaning.hint': 'Definition / English gloss',
    'mining.vars.translation.hint': 'Front-language translation (e.g. Russian)',
    'mining.vars.sentence.hint': 'The context sentence the word came from',
    'mining.vars.example-sentence.hint': 'A Tatoeba example you selected in the dictionary',
    'mining.vars.example-pairs.hint':
      'Interleaved examples — e.g. RU sentence 1 then JA sentence 1, then pair 2…',
    'mining.vars.sentence-translation.hint':
      'The context sentence translated to your other language',
    'mining.vars.cloze-before.hint': 'Sentence text before the word',
    'mining.vars.cloze-inside.hint': 'The word itself, as it appears in the sentence',
    'mining.vars.cloze-after.hint': 'Sentence text after the word',
    'mining.vars.pitch.hint': 'Pitch-accent pattern (from an imported/bundled dictionary)',
    'mining.vars.frequency.hint': 'Frequency rank (from an imported/bundled dictionary)',
    'mining.vars.audio.hint': 'Native-speaker audio [sound:…]',
    'mining.vars.image.hint': 'Image grabbed from your clipboard',

    'dict.results.lookingUp': 'Looking up…',
    'dict.results.noMatch': 'No dictionary match for “{query}”.',
    'dict.results.common': 'common',
    'dict.results.freqTitle': 'Corpus frequency rank',
    'dict.results.copyClipboard': 'Copy to clipboard history',
    'dict.results.saveFlashcards': 'Save to Flashcards',
    'dict.results.savedFlashcards': 'Saved to Flashcards',
    'dict.results.pitch': 'Pitch',
    'dict.results.add': '+ Add to Anki',
    'dict.results.added': 'Added',
    'dict.results.alreadyInAnki': 'Already in Anki',
    'dict.results.translating': 'Translating sentence…',
    'dict.results.adding': 'Adding…',
    'dict.results.retryAdd': 'Retry adding to Anki',
    'dict.results.examples': 'Example sentences',
    'dict.results.searchingTatoeba': 'Searching Tatoeba…',
    'dict.results.noExamples': 'No example sentences found.',
    'dict.results.show': 'Show',
    'dict.results.translatingExamples': 'Translating examples…',
    'dict.results.exHint':
      'Manual: click examples to choose exactly which ones go on the card (all selected are used). Auto: mine without selecting — the first N Tatoeba hits per language from field mapping are used. Reader context stays in {sentence}.',
    'dict.results.selectedManual': '{count} selected (manual) — all will be mined',
    'dict.results.autoExamples':
      'Auto examples: up to {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.selectedManualShort': '{count} selected (manual)',
    'dict.results.autoExamplesShort': 'up to {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.label.language': 'Language',
    'dict.results.label.profile': 'Profile',
    'dict.results.label.deck': 'Deck',
    'dict.results.label.noteType': 'Note type',
    'dict.results.label.examples': 'Examples',
    'dict.results.err.loadExamples': 'Could not load examples: {error}',
    'dict.results.err.noTatoeba':
      'No Tatoeba examples for this word. Enable “Expression fallback” in field mapping, or add {expression} to your templates.',
    'dict.results.err.examplesRequired':
      'Example sentences are required for your field mapping. Click "Example sentences" and select at least one.',
    'dict.results.err.waitTranslate':
      'Wait for “Translating examples…” to finish, or enable expression fallback in field mapping.',
    'dict.results.err.addFailed': 'Could not add the card.',
  },
  ja: {
    'settings.legacy.intro': '読みやすく、使いやすくアプリを整えられます。',
    'settings.clipboard.title': 'クリップボード履歴',
    'settings.clipboard.intro':
      'いつでも Ctrl Shift V、コマンドパレット、またはタスクバーのクリップボードアイコンで開けます。',
    'settings.clipboard.maxSize': '履歴の最大件数',
    'settings.clipboard.maxSize.desc': 'この上限に達すると、ピン止めされていない古い項目から削除されます。',
    'settings.clipboard.dedupe': '連続する重複を削除',
    'settings.clipboard.dedupe.desc': '同じテキストを連続でコピーしても、2件目は追加されません。',
    'settings.clipboard.clearOnExit': 'アプリ終了時にクリア',
    'settings.clipboard.clearOnExit.desc':
      '終了時にピン止めされていない履歴を消去します。ピン留め項目は残ります。',
    'settings.clipboard.monitoring': 'クリップボード監視',
    'settings.clipboard.monitoring.desc':
      'アプリ外を含め、システム全体でコピーされたテキストを自動記録します。',
    'settings.a11y.title': 'アクセシビリティ',
    'settings.a11y.zoom.title': 'アプリのズーム',
    'settings.a11y.zoom.desc':
      '文字・ボタン・すべての画面をまとめて拡大縮小します。UIが小さすぎ・大きすぎると感じるときに使います。',
    'settings.a11y.zoom.decrease': 'ズームを下げる',
    'settings.a11y.zoom.increase': 'ズームを上げる',
    'settings.a11y.zoom.aria': 'アプリのズーム',
    'settings.readerTip.title': 'リーダー',
    'settings.readerTip.body':
      '本を読んでいるときは、Ctrl を押しながらスクロール、または Ctrl + / Ctrl − で文字サイズ（最大 400%）を変えられます。テーマ・フォント・ふりがなはリーダー自身の設定パネルにあります。上のアプリズームは全画面にさらに適用されます。',

    'ankiSetup.cantReach': 'Anki に接続できません。',
    'ankiSetup.collectionWait':
      'AnkiConnect は応答しましたが、デッキはまだ使えません。アプリは自動で再試行します — Anki の起動完了を待つか、重複ウィンドウを閉じて開き直してください。',
    'ankiSetup.installLead': 'カードを追加するには、無料の AnkiConnect アドオンを一度だけ入れてください：',
    'ankiSetup.step1': 'Anki デスクトップアプリを開いたままにしてください。',
    'ankiSetup.step2': 'メニュー：ツール → アドオン → アドオンを入手…',
    'ankiSetup.step3': 'このコードを貼り付け：{code}',
    'ankiSetup.step4': 'OK を押して Anki を再起動し、再試行してください。',
    'ankiSetup.back': '戻る',
    'ankiSetup.checkNow': '今すぐ確認',
    'ankiSetup.retry': '再試行',

    'mining.vars.summary': 'テンプレートに {placeholders} を挿入',
    'mining.vars.lead':
      '上の表または裏にフォーカスしてタグをクリック。EPUB マイニングは本のテキストだけから expression・reading・sentence・frequency を埋めます。',
    'mining.vars.translated': '翻訳付き',
    'mining.vars.pairs': 'ペア',
    'mining.vars.aria.base': '変数を挿入',
    'mining.vars.aria.translated': '翻訳付き変数を挿入',
    'mining.vars.aria.pairs': 'ペア変数を挿入',
    'mining.vars.translatedEmpty': '{base} — 後で辞書データを追加するまで空',
    'mining.vars.expression.hint': '単語／見出し語 — 例：勉強',
    'mining.vars.reading.hint': 'かな読み — 例：べんきょう',
    'mining.vars.meaning.hint': '定義／英語の語義',
    'mining.vars.translation.hint': '表側言語の訳（例：ロシア語）',
    'mining.vars.sentence.hint': 'その語が出てきた文脈の文',
    'mining.vars.example-sentence.hint': '辞書で選んだ Tatoeba の例文',
    'mining.vars.example-pairs.hint':
      '交互の例文 — 例：RU文1 → JA文1、次のペア…',
    'mining.vars.sentence-translation.hint': '文脈文を他言語へ訳したもの',
    'mining.vars.cloze-before.hint': '単語の前の文テキスト',
    'mining.vars.cloze-inside.hint': '文中に現れる形のその単語',
    'mining.vars.cloze-after.hint': '単語の後の文テキスト',
    'mining.vars.pitch.hint': 'ピッチアクセント（インポート／同梱辞書）',
    'mining.vars.frequency.hint': '頻度ランク（インポート／同梱辞書）',
    'mining.vars.audio.hint': 'ネイティブ音声 [sound:…]',
    'mining.vars.image.hint': 'クリップボードから取得した画像',

    'dict.results.lookingUp': '検索中…',
    'dict.results.noMatch': '「{query}」に一致する辞書項目がありません。',
    'dict.results.common': '常用',
    'dict.results.freqTitle': 'コーパス頻度ランク',
    'dict.results.copyClipboard': 'クリップボード履歴にコピー',
    'dict.results.saveFlashcards': 'フラッシュカードに保存',
    'dict.results.savedFlashcards': 'フラッシュカードに保存済み',
    'dict.results.pitch': 'ピッチ',
    'dict.results.add': '+ Anki に追加',
    'dict.results.added': '追加済み',
    'dict.results.alreadyInAnki': 'すでに Anki にあります',
    'dict.results.translating': '文を翻訳中…',
    'dict.results.adding': '追加中…',
    'dict.results.retryAdd': 'Anki への追加を再試行',
    'dict.results.examples': '例文',
    'dict.results.searchingTatoeba': 'Tatoeba を検索中…',
    'dict.results.noExamples': '例文が見つかりませんでした。',
    'dict.results.show': '表示',
    'dict.results.translatingExamples': '例文を翻訳中…',
    'dict.results.exHint':
      '手動：例文をクリックしてカードに入れるものを選びます（選んだものがすべて使われます）。自動：選ばずにマイニング — フィールドマッピングの言語ごとの先頭 N 件の Tatoeba が使われます。リーダー文脈は {sentence} に残ります。',
    'dict.results.selectedManual': '{count} 件選択（手動）— すべてマイニングされます',
    'dict.results.autoExamples':
      '自動例文：最大 {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.selectedManualShort': '{count} 件選択（手動）',
    'dict.results.autoExamplesShort': '最大 {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.label.language': '言語',
    'dict.results.label.profile': 'プロファイル',
    'dict.results.label.deck': 'デッキ',
    'dict.results.label.noteType': 'ノートタイプ',
    'dict.results.label.examples': '例文',
    'dict.results.err.loadExamples': '例文を読み込めませんでした: {error}',
    'dict.results.err.noTatoeba':
      'この語の Tatoeba 例文がありません。フィールドマッピングで「表現のフォールバック」を有効にするか、テンプレートに {expression} を追加してください。',
    'dict.results.err.examplesRequired':
      'フィールドマッピングには例文が必要です。「例文」をクリックして少なくとも1つ選んでください。',
    'dict.results.err.waitTranslate':
      '「例文を翻訳中…」が終わるまで待つか、フィールドマッピングで表現のフォールバックを有効にしてください。',
    'dict.results.err.addFailed': 'カードを追加できませんでした。',
  },
  zh: {
    'settings.legacy.intro': '让应用读起来、用起来更舒适。',
    'settings.clipboard.title': '剪贴板历史',
    'settings.clipboard.intro':
      '随时可用 Ctrl Shift V、命令面板或任务栏剪贴板图标打开。',
    'settings.clipboard.maxSize': '最大历史条数',
    'settings.clipboard.maxSize.desc': '达到此上限后，会丢弃最早未固定的条目。',
    'settings.clipboard.dedupe': '去除连续重复',
    'settings.clipboard.dedupe.desc': '连续两次复制相同文本不会新增第二条。',
    'settings.clipboard.clearOnExit': '退出应用时清除',
    'settings.clipboard.clearOnExit.desc': '关闭应用时清除未固定历史；固定条目保留。',
    'settings.clipboard.monitoring': '剪贴板监视',
    'settings.clipboard.monitoring.desc': '自动记录系统任意处复制的文本，不限于应用内。',
    'settings.a11y.title': '辅助功能',
    'settings.a11y.zoom.title': '应用缩放',
    'settings.a11y.zoom.desc':
      '缩放整个应用——文字、按钮和所有界面。界面太小或太大时使用。',
    'settings.a11y.zoom.decrease': '减小应用缩放',
    'settings.a11y.zoom.increase': '增大应用缩放',
    'settings.a11y.zoom.aria': '应用缩放',
    'settings.readerTip.title': '阅读器',
    'settings.readerTip.body':
      '阅读时，按住 Ctrl 滚动，或按 Ctrl + / Ctrl − 可调整字号（最高 400%）。主题、字体和假名振假名在阅读器自带设置面板。上方的应用缩放会叠加到全局。',

    'ankiSetup.cantReach': '无法连接 Anki。',
    'ankiSetup.collectionWait':
      'AnkiConnect 已响应，但牌组尚未可用。应用会自动重试——请等待 Anki 打开完成，或关闭重复 Anki 窗口后重新打开。',
    'ankiSetup.installLead': '要添加卡片，请先安装免费的 AnkiConnect 插件（一次即可）：',
    'ankiSetup.step1': '打开 Anki 桌面版并保持运行。',
    'ankiSetup.step2': '菜单：工具 → 插件 → 获取插件…',
    'ankiSetup.step3': '粘贴此代码：{code}',
    'ankiSetup.step4': '点击确定并重启 Anki，然后重试。',
    'ankiSetup.back': '返回',
    'ankiSetup.checkNow': '立即检查',
    'ankiSetup.retry': '重试',

    'mining.vars.summary': '向模板插入 {placeholders}',
    'mining.vars.lead':
      '先聚焦上方正面或背面，再点击标签。EPUB 挖词仅从书中文本填充 expression、reading、sentence 与 frequency。',
    'mining.vars.translated': '已翻译',
    'mining.vars.pairs': '配对',
    'mining.vars.aria.base': '插入变量',
    'mining.vars.aria.translated': '插入带翻译的变量',
    'mining.vars.aria.pairs': '插入配对变量',
    'mining.vars.translatedEmpty': '{base} — 除非稍后添加词典数据，否则为空',
    'mining.vars.expression.hint': '词头／单词 — 例如 勉強',
    'mining.vars.reading.hint': '假名读音 — 例如 べんきょう',
    'mining.vars.meaning.hint': '定义／英语释义',
    'mining.vars.translation.hint': '正面语言译文（例如俄语）',
    'mining.vars.sentence.hint': '该词出现的上下文句子',
    'mining.vars.example-sentence.hint': '你在词典中选中的 Tatoeba 例句',
    'mining.vars.example-pairs.hint': '交错例句 — 例如 俄语句1 再日语句1，然后下一对…',
    'mining.vars.sentence-translation.hint': '上下文句子译成另一种语言',
    'mining.vars.cloze-before.hint': '单词前的句子文本',
    'mining.vars.cloze-inside.hint': '句中出现的该词本身',
    'mining.vars.cloze-after.hint': '单词后的句子文本',
    'mining.vars.pitch.hint': '音调模式（来自导入／内置词典）',
    'mining.vars.frequency.hint': '词频排名（来自导入／内置词典）',
    'mining.vars.audio.hint': '母语者音频 [sound:…]',
    'mining.vars.image.hint': '从剪贴板抓取的图片',

    'dict.results.lookingUp': '查询中…',
    'dict.results.noMatch': '没有与“{query}”匹配的词典条目。',
    'dict.results.common': '常用',
    'dict.results.freqTitle': '语料库频率排名',
    'dict.results.copyClipboard': '复制到剪贴板历史',
    'dict.results.saveFlashcards': '保存到闪卡',
    'dict.results.savedFlashcards': '已保存到闪卡',
    'dict.results.pitch': '音调',
    'dict.results.add': '+ 添加到 Anki',
    'dict.results.added': '已添加',
    'dict.results.alreadyInAnki': '已在 Anki 中',
    'dict.results.translating': '正在翻译句子…',
    'dict.results.adding': '正在添加…',
    'dict.results.retryAdd': '重试添加到 Anki',
    'dict.results.examples': '例句',
    'dict.results.searchingTatoeba': '正在搜索 Tatoeba…',
    'dict.results.noExamples': '未找到例句。',
    'dict.results.show': '显示',
    'dict.results.translatingExamples': '正在翻译例句…',
    'dict.results.exHint':
      '手动：点击例句精确选择写入卡片的内容（所选全部使用）。自动：不选即可挖词 — 使用字段映射中各语言前 N 条 Tatoeba。阅读上下文保留在 {sentence}。',
    'dict.results.selectedManual': '已选 {count} 条（手动）— 全部将挖取',
    'dict.results.autoExamples':
      '自动例句：最多 {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.selectedManualShort': '已选 {count} 条（手动）',
    'dict.results.autoExamplesShort': '最多 {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.label.language': '语言',
    'dict.results.label.profile': '档案',
    'dict.results.label.deck': '牌组',
    'dict.results.label.noteType': '笔记类型',
    'dict.results.label.examples': '例句',
    'dict.results.err.loadExamples': '无法加载例句：{error}',
    'dict.results.err.noTatoeba':
      '该词没有 Tatoeba 例句。请在字段映射中启用“表达式回退”，或在模板中加入 {expression}。',
    'dict.results.err.examplesRequired':
      '你的字段映射需要例句。点击“例句”并至少选择一条。',
    'dict.results.err.waitTranslate':
      '请等待“正在翻译例句…”完成，或在字段映射中启用表达式回退。',
    'dict.results.err.addFailed': '无法添加卡片。',
  },
  ru: {
    'settings.legacy.intro': 'Сделайте приложение удобным для чтения и работы.',
    'settings.clipboard.title': 'История буфера обмена',
    'settings.clipboard.intro':
      'Открывается в любой момент через Ctrl Shift V, палитру команд или значок буфера на панели задач.',
    'settings.clipboard.maxSize': 'Максимум записей в истории',
    'settings.clipboard.maxSize.desc':
      'После достижения лимита удаляются самые старые незакреплённые записи.',
    'settings.clipboard.dedupe': 'Убирать подряд идущие дубликаты',
    'settings.clipboard.dedupe.desc':
      'Повторное копирование того же текста подряд не добавит вторую запись.',
    'settings.clipboard.clearOnExit': 'Очищать при выходе из приложения',
    'settings.clipboard.clearOnExit.desc':
      'При закрытии незакреплённая история стирается; закреплённые записи сохраняются.',
    'settings.clipboard.monitoring': 'Мониторинг буфера обмена',
    'settings.clipboard.monitoring.desc':
      'Автоматически записывать текст, скопированный в любом месте системы, не только в приложении.',
    'settings.a11y.title': 'Специальные возможности',
    'settings.a11y.zoom.title': 'Масштаб приложения',
    'settings.a11y.zoom.desc':
      'Масштабирует всё приложение — текст, кнопки и каждый экран. Используйте, если интерфейс слишком мелкий или крупный.',
    'settings.a11y.zoom.decrease': 'Уменьшить масштаб',
    'settings.a11y.zoom.increase': 'Увеличить масштаб',
    'settings.a11y.zoom.aria': 'Масштаб приложения',
    'settings.readerTip.title': 'Читалка',
    'settings.readerTip.body':
      'Во время чтения меняйте размер текста (до 400%), удерживая Ctrl и прокручивая, или нажимая Ctrl + / Ctrl −. Тема, шрифт и фуригана — в собственной панели настроек читалки. Масштаб приложения выше действует поверх этого везде.',

    'ankiSetup.cantReach': 'Не удаётся связаться с Anki.',
    'ankiSetup.collectionWait':
      'AnkiConnect ответил, но колоды ещё недоступны. Приложение повторяет попытки автоматически — дождитесь открытия Anki или закройте лишние окна Anki и откройте снова.',
    'ankiSetup.installLead': 'Чтобы добавлять карточки, один раз установите бесплатное дополнение AnkiConnect:',
    'ankiSetup.step1': 'Откройте настольный Anki и оставьте его запущенным.',
    'ankiSetup.step2': 'Меню: Инструменты → Дополнения → Получить дополнения…',
    'ankiSetup.step3': 'Вставьте этот код: {code}',
    'ankiSetup.step4': 'Нажмите OK, перезапустите Anki, затем «Повторить».',
    'ankiSetup.back': 'Назад',
    'ankiSetup.checkNow': 'Проверить сейчас',
    'ankiSetup.retry': 'Повторить',

    'mining.vars.summary': 'Вставка {placeholders} в шаблоны',
    'mining.vars.lead':
      'Сфокусируйте лицо или оборот выше и нажмите тег. EPUB-майнинг заполняет expression, reading, sentence и frequency только из текста книги.',
    'mining.vars.translated': 'С переводом',
    'mining.vars.pairs': 'Пары',
    'mining.vars.aria.base': 'Вставить переменную',
    'mining.vars.aria.translated': 'Вставить переменную с переводом',
    'mining.vars.aria.pairs': 'Вставить парную переменную',
    'mining.vars.translatedEmpty': '{base} — пусто, пока не добавите данные словаря',
    'mining.vars.expression.hint': 'Слово / заголовок — напр. 勉強',
    'mining.vars.reading.hint': 'Чтение каной — напр. べんきょう',
    'mining.vars.meaning.hint': 'Определение / английский глосс',
    'mining.vars.translation.hint': 'Перевод языка лицевой стороны (напр. русский)',
    'mining.vars.sentence.hint': 'Контекстное предложение, откуда взято слово',
    'mining.vars.example-sentence.hint': 'Пример Tatoeba, выбранный в словаре',
    'mining.vars.example-pairs.hint':
      'Чередующиеся примеры — напр. RU предложение 1, затем JA предложение 1, затем пара 2…',
    'mining.vars.sentence-translation.hint':
      'Контекстное предложение, переведённое на другой язык',
    'mining.vars.cloze-before.hint': 'Текст предложения до слова',
    'mining.vars.cloze-inside.hint': 'Само слово в том виде, как в предложении',
    'mining.vars.cloze-after.hint': 'Текст предложения после слова',
    'mining.vars.pitch.hint': 'Акцентная схема (из импортированного/встроенного словаря)',
    'mining.vars.frequency.hint': 'Ранг частоты (из импортированного/встроенного словаря)',
    'mining.vars.audio.hint': 'Аудио носителя [sound:…]',
    'mining.vars.image.hint': 'Изображение из буфера обмена',

    'dict.results.lookingUp': 'Поиск…',
    'dict.results.noMatch': 'Нет словарного совпадения для «{query}».',
    'dict.results.common': 'частое',
    'dict.results.freqTitle': 'Ранг частоты в корпусе',
    'dict.results.copyClipboard': 'Копировать в историю буфера',
    'dict.results.saveFlashcards': 'Сохранить в карточки',
    'dict.results.savedFlashcards': 'Сохранено в карточки',
    'dict.results.pitch': 'Акцент',
    'dict.results.add': '+ Добавить в Anki',
    'dict.results.added': 'Добавлено',
    'dict.results.alreadyInAnki': 'Уже в Anki',
    'dict.results.translating': 'Перевод предложения…',
    'dict.results.adding': 'Добавление…',
    'dict.results.retryAdd': 'Повторить добавление в Anki',
    'dict.results.examples': 'Примеры предложений',
    'dict.results.searchingTatoeba': 'Поиск в Tatoeba…',
    'dict.results.noExamples': 'Примеры предложений не найдены.',
    'dict.results.show': 'Показать',
    'dict.results.translatingExamples': 'Перевод примеров…',
    'dict.results.exHint':
      'Вручную: нажмите примеры, чтобы точно выбрать, что попадёт на карточку (используются все выбранные). Авто: майните без выбора — берутся первые N попаданий Tatoeba по языкам из сопоставления полей. Контекст читалки остаётся в {sentence}.',
    'dict.results.selectedManual': 'Выбрано: {count} (вручную) — всё будет смайнено',
    'dict.results.autoExamples':
      'Авто-примеры: до {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.selectedManualShort': '{count} выбрано (вручную)',
    'dict.results.autoExamplesShort': 'до {ja} ja / {en} en / {ru} ru / {zh} zh',
    'dict.results.label.language': 'Язык',
    'dict.results.label.profile': 'Профиль',
    'dict.results.label.deck': 'Колода',
    'dict.results.label.noteType': 'Тип заметки',
    'dict.results.label.examples': 'Примеры',
    'dict.results.err.loadExamples': 'Не удалось загрузить примеры: {error}',
    'dict.results.err.noTatoeba':
      'Нет примеров Tatoeba для этого слова. Включите «запасной expression» в сопоставлении полей или добавьте {expression} в шаблоны.',
    'dict.results.err.examplesRequired':
      'Для вашего сопоставления полей нужны примеры. Нажмите «Примеры предложений» и выберите хотя бы один.',
    'dict.results.err.waitTranslate':
      'Дождитесь окончания «Перевод примеров…» или включите запасной expression в сопоставлении полей.',
    'dict.results.err.addFailed': 'Не удалось добавить карточку.',
  },
};

function formatBlock(lang, map, comment) {
  return [`  // ${comment} (${lang})`]
    .concat(
      Object.entries(map).map(([k, v]) => {
        const esc = String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `  '${k}': '${esc}',`;
      }),
    )
    .join('\n');
}

const markers = {
  en: "  'settings.reader.hint': 'Hold Ctrl and scroll to resize. Settings save automatically.',",
  ja: "  'settings.reader.hint': 'Ctrl を押しながらスクロールでサイズ変更。設定は自動保存されます。',",
  zh: "  'settings.reader.hint': '按住 Ctrl 滚动可改字号。设置会自动保存。',",
  ru: "  'settings.reader.hint': 'Удерживайте Ctrl и крутите колесо, чтобы менять размер. Настройки сохраняются сами.',",
};

for (const lang of Object.keys(markers)) {
  const tag = `// Settings clipboard/a11y + AnkiSetup + mining/dict results (${lang})`;
  if (text.includes(tag)) continue;
  const m = markers[lang];
  const i = text.indexOf(m);
  if (i < 0) throw new Error(`marker missing: ${lang}`);
  const block = formatBlock(
    lang,
    packs[lang],
    'Settings clipboard/a11y + AnkiSetup + mining/dict results',
  );
  text = text.slice(0, i + m.length) + '\n' + block + '\n' + text.slice(i + m.length);
}

fs.writeFileSync(catalogsPath, text);
console.log('ok', Object.keys(packs.en).length, 'keys × 4 langs');
