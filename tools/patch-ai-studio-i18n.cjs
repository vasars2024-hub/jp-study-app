/**
 * Inserts aiStudio.* keys into catalogs.ts (en/ja/zh/ru) for AI Card Studio UI.
 * Run: node tools/patch-ai-studio-i18n.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const catalogsPath = path.join(__dirname, '../src/shared/i18n/catalogs.ts');
let text = fs.readFileSync(catalogsPath, 'utf8');

if (text.includes("'aiStudio.section.provider'")) {
  console.log('already patched');
  process.exit(0);
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatEntry(k, v) {
  if (typeof v === 'object' && v !== null) {
    const parts = Object.entries(v).map(([pk, pv]) => `    ${pk}: '${esc(pv)}'`);
    return `  '${k}': {\n${parts.join(',\n')},\n  },`;
  }
  return `  '${k}': '${esc(v)}',`;
}

function formatBlock(lang, map) {
  const lines = [`  // AI Card Studio (${lang})`];
  for (const [k, v] of Object.entries(map)) {
    lines.push(formatEntry(k, v));
  }
  return lines.join('\n');
}

const en = {
  'aiStudio.section.provider': 'Provider & API key',
  'aiStudio.summary.keySaved': '{provider} key saved',
  'aiStudio.summary.connect': 'Connect Gemini or DeepSeek',
  'aiStudio.label.provider': 'AI provider',
  'aiStudio.label.apiKey': 'API key',
  'aiStudio.placeholder.replaceKey': 'Replace saved key…',
  'aiStudio.placeholder.pasteKey': 'Paste {provider} key',
  'aiStudio.btn.saveKey': 'Save key',
  'aiStudio.status.saving': 'Saving…',
  'aiStudio.status.pasteKey': 'Paste a {provider} API key above.',
  'aiStudio.status.keySaved': '{provider} API key saved.',
  'aiStudio.status.couldNotSaveKey': 'Could not save key.',

  'aiStudio.section.flowGuide': 'How these settings connect',
  'aiStudio.summary.flow': 'Preset → language → profile → Anki fields',
  'aiStudio.flow.presetTitle': 'Preset',
  'aiStudio.flow.presetBody':
    'tells the AI what to analyze (idiom nuance, grammar stack, proper name, etc.) and ships a default card layout.',
  'aiStudio.flow.languageTitle': 'Language direction',
  'aiStudio.flow.languageBody':
    'shapes the AI card faces (what language appears on front vs back). It syncs from the preset profile when you change preset — you can still adjust it for extra glosses or production cues.',
  'aiStudio.flow.profileTitle': 'Anki profile',
  'aiStudio.flow.profileBody':
    'comes from the preset and controls field mapping. Each preset assigns one profile (e.g. Grammar Deconstruction → Sentence Mining).',
  'aiStudio.flow.mappingTitle': 'Field mapping',
  'aiStudio.flow.mappingBody':
    'routes AI output into Anki note fields. Variable palette tags like {expression:ru} pick which translation fills a field — separate from card face language.',
  'aiStudio.flow.footer': 'Panels on the right show the AI card example and the exact prompt sent to the model.',

  'aiStudio.section.preset': '1 · Preset & output',
  'aiStudio.summary.analyzes': 'What the AI analyzes',
  'aiStudio.summary.perWord': '{n}/word',
  'aiStudio.label.preset': 'Preset',
  'aiStudio.optgroup.specialized': 'Specialized',
  'aiStudio.label.cardFormat': 'Card format',
  'aiStudio.label.cardsPerWord': 'Cards per word',
  'aiStudio.label.output': 'Output',
  'aiStudio.output.anki': 'Anki',
  'aiStudio.output.csv': 'CSV',
  'aiStudio.meta.ankiProfile': 'Anki profile:',
  'aiStudio.meta.templateNote': {
    one: 'this preset has {count} template — higher counts repeat the cycle',
    other: 'this preset has {count} templates — higher counts repeat the cycle',
  },

  'aiStudio.section.language': '2 · Language direction',
  'aiStudio.language.lead':
    'Shapes AI card front/back text. Changing preset resets direction to match that preset profile. Extra glosses add more languages on the back face only.',
  'aiStudio.label.frontLang': 'Front language',
  'aiStudio.label.backLang': 'Back language',
  'aiStudio.lang.ja': 'Japanese',
  'aiStudio.lang.en': 'English',
  'aiStudio.lang.ru': 'Russian',
  'aiStudio.lang.zh': 'Chinese',
  'aiStudio.dirPreset.ja-en': 'JA → EN recognition',
  'aiStudio.dirPreset.ja-ru': 'JA → RU recognition',
  'aiStudio.dirPreset.ja-zh': 'JA → ZH recognition',
  'aiStudio.dirPreset.ja-tri': 'JA → EN+RU+ZH',
  'aiStudio.dirPreset.en-ja': 'EN → JA production',
  'aiStudio.dirPreset.ru-ja': 'RU → JA production',
  'aiStudio.dirPreset.zh-ja': 'ZH → JA production',
  'aiStudio.dirPreset.en-ru': 'EN → RU gloss',
  'aiStudio.dirPreset.ru-en': 'RU → EN gloss',
  'aiStudio.dirPreset.zh-en': 'ZH → EN gloss',
  'aiStudio.label.extraGlosses': 'Extra glosses on back',
  'aiStudio.direction.pair': '{front} → {back}',
  'aiStudio.direction.withExtras': '{front} → {back} + {extras}',

  'aiStudio.log.title': 'Configuration log',
  'aiStudio.log.summary.entries': {
    one: '{count} entry',
    other: '{count} entries',
  },
  'aiStudio.log.summary.empty': 'No changes yet',
  'aiStudio.log.lead': 'Terminal-style trace of preset, language, output, mapping, and generation inputs.',
  'aiStudio.log.clear': 'Clear log',
  'aiStudio.log.empty': 'Changes to studio settings will appear here.',
  'aiStudio.log.field.languageDirection': 'Language direction',
  'aiStudio.log.syncedTo': 'Synced to {front} → {back} (from preset profile)',
  'aiStudio.log.field.preset': 'Preset',
  'aiStudio.log.field.format': 'Card format',
  'aiStudio.log.field.front': 'Front language',
  'aiStudio.log.field.back': 'Back language',
  'aiStudio.log.field.reverse': 'Reverse',
  'aiStudio.log.field.gloss': 'Extra glosses',
  'aiStudio.log.field.cardCount': 'Cards per word',
  'aiStudio.log.field.output': 'Output',
  'aiStudio.log.field.source': 'Source',
  'aiStudio.log.field.items': 'Items to generate',
  'aiStudio.log.field.dictWords': 'Dictionary words',
  'aiStudio.log.field.mapping': 'Field: {field}',
  'aiStudio.log.mapping.set': 'set to "{value}"',
  'aiStudio.log.mapping.change': '"{from}" → "{to}"',
  'aiStudio.log.field.generate': 'Generate',
  'aiStudio.log.generateStart': {
    one: 'Start · {count} item × {cards} cards/item ≈ {total} cards',
    other: 'Start · {count} items × {cards} cards/item ≈ {total} cards',
  },
  'aiStudio.log.generateDone': 'Done · {cards} cards from {count} items',
  'aiStudio.log.generateError': 'Error · {message}',
  'aiStudio.log.changeArrow': '{from} → {to}',

  'aiStudio.section.mapping': '3 · Anki field mapping',
  'aiStudio.mapping.lead':
    'Profile {profile} (from preset) · note type {model}. These templates route AI output into Anki when you send cards.',
  'aiStudio.mapping.readingFields': 'Reading note type fields…',
  'aiStudio.mapping.fieldsErr': 'Could not read this note type’s fields.',
  'aiStudio.mapping.noFields': 'No fields found for this profile’s note type.',

  'aiStudio.section.generate': '4 · Generate cards',
  'aiStudio.generate.chooseAbove': 'Choose a preset and card format above.',
  'aiStudio.generate.infoDetail': {
    one: 'Profile {profile} · {count} card per word · {output} output · {direction}',
    other: 'Profile {profile} · {count} cards per word · {output} output · {direction}',
  },
  'aiStudio.label.source': 'Source',
  'aiStudio.source.preset': 'From preset (AI invents vocabulary)',
  'aiStudio.source.dictionary': 'From dictionary stars',
  'aiStudio.label.itemsToGenerate': 'Items to generate',
  'aiStudio.label.dictionaryWords': 'Dictionary words',
  'aiStudio.starredCount': {
    one: '{count} starred',
    other: '{count} starred',
  },
  'aiStudio.estimate.preset':
    'AI invents {items} vocabulary items. Each item becomes {cards} cards → approx {total} total ({items} × {cards}).',
  'aiStudio.estimate.presetOneCard':
    'AI invents {items} vocabulary items. Each item becomes {cards} card → approx {total} total ({items} × {cards}).',
  'aiStudio.estimate.dictionary': {
    one: '{count} dictionary word × {cards} cards each → approx {total} cards.',
    other: '{count} dictionary words × {cards} cards each → approx {total} cards.',
  },
  'aiStudio.result.approx': {
    one: 'Result: approx {count} card',
    other: 'Result: approx {count} cards',
  },
  'aiStudio.hint.starFirst': 'star words in Dictionary first',
  'aiStudio.btn.generating': 'Generating…',
  'aiStudio.btn.generate': 'Generate cards',
  'aiStudio.btn.sendAnki': 'Send to Anki',
  'aiStudio.btn.saveFlash': 'Save to flashcards',
  'aiStudio.btn.exportCsv': 'Export CSV',

  'aiStudio.generated.title': 'Generated cards',
  'aiStudio.generated.summary': {
    one: '{cards} cards from {count} word',
    other: '{cards} cards from {count} words',
  },
  'aiStudio.hint.saveKey': 'Save an API key above to enable generation.',
  'aiStudio.hint.starOrPreset':
    'Open Dictionary, look up words, and tap the star icon — or switch source to preset generation.',

  'aiStudio.status.generatedPreset':
    'Generated {cards} cards from {count} invented items · {saved} saved to Flashcards.',
  'aiStudio.status.generatedDict':
    'Generated {cards} cards from {count} words · {saved} saved to Flashcards.',
  'aiStudio.status.csvSaved': 'CSV saved to {path}',
  'aiStudio.status.csvFail': 'Could not save CSV.',
  'aiStudio.status.sentAnki': 'Sent {ok} of {total} cards to Anki.',
  'aiStudio.status.sentAnkiLocal': 'Sent {ok} of {total} cards to Anki · {local} saved locally.',
  'aiStudio.status.savedFlash': {
    one: 'Saved {count} card to Flashcards.',
    other: 'Saved {count} cards to Flashcards.',
  },

  'aiStudio.preview.cardExample': 'AI card example',
  'aiStudio.preview.sampleForPreset': '{label} — sample content for this preset',
  'aiStudio.preview.front': 'Front',
  'aiStudio.preview.back': 'Back',
  'aiStudio.preview.emptyFace': '(empty)',
  'aiStudio.preview.noTemplate': 'No card template for this format.',
  'aiStudio.preview.facesHint':
    'Faces above use the preset format after language direction is applied. Sending to Anki runs the field mapping on the left.',
  'aiStudio.preview.prompt': 'AI prompt',
  'aiStudio.preview.mode.invent': 'Invent vocabulary mode',
  'aiStudio.preview.mode.enrich': 'Dictionary enrichment mode',
  'aiStudio.preview.promptHint':
    'Composed from preset instruction, language direction, profile id, and active card templates.',

  'aiStudio.progress.invent': 'Invent vocabulary',
  'aiStudio.progress.enrich': 'Build cards',
  'aiStudio.progress.done': 'Complete',
};

const ja = {
  'aiStudio.section.provider': 'プロバイダーと API キー',
  'aiStudio.summary.keySaved': '{provider} のキーを保存済み',
  'aiStudio.summary.connect': 'Gemini または DeepSeek に接続',
  'aiStudio.label.provider': 'AI プロバイダー',
  'aiStudio.label.apiKey': 'API キー',
  'aiStudio.placeholder.replaceKey': '保存済みキーを差し替え…',
  'aiStudio.placeholder.pasteKey': '{provider} のキーを貼り付け',
  'aiStudio.btn.saveKey': 'キーを保存',
  'aiStudio.status.saving': '保存中…',
  'aiStudio.status.pasteKey': '上に {provider} の API キーを貼り付けてください。',
  'aiStudio.status.keySaved': '{provider} の API キーを保存しました。',
  'aiStudio.status.couldNotSaveKey': 'キーを保存できませんでした。',

  'aiStudio.section.flowGuide': '設定のつながり',
  'aiStudio.summary.flow': 'プリセット → 言語 → プロファイル → Anki フィールド',
  'aiStudio.flow.presetTitle': 'プリセット',
  'aiStudio.flow.presetBody':
    'は AI に分析内容（イディオムのニュアンス、文法スタック、固有名など）を指示し、既定のカードレイアウトを付けます。',
  'aiStudio.flow.languageTitle': '言語方向',
  'aiStudio.flow.languageBody':
    'は AI カードの表裏（表／裏の言語）を決めます。プリセットを変えるとプロファイルから同期されますが、追加グロスや産出用に調整できます。',
  'aiStudio.flow.profileTitle': 'Anki プロファイル',
  'aiStudio.flow.profileBody':
    'はプリセットから決まり、フィールド対応を制御します。各プリセットは1つのプロファイルを持ちます（例：文法分解 → 例文マイニング）。',
  'aiStudio.flow.mappingTitle': 'フィールド対応',
  'aiStudio.flow.mappingBody':
    'は AI 出力を Anki のノートフィールドへ振り分けます。{expression:ru} のような変数タグでどの訳を入れるかを選びます — カード面の言語とは別です。',
  'aiStudio.flow.footer': '右側のパネルに AI カード例とモデルへ送るプロンプトが表示されます。',

  'aiStudio.section.preset': '1 · プリセットと出力',
  'aiStudio.summary.analyzes': 'AI が分析する内容',
  'aiStudio.summary.perWord': '{n}/語',
  'aiStudio.label.preset': 'プリセット',
  'aiStudio.optgroup.specialized': '専門',
  'aiStudio.label.cardFormat': 'カード形式',
  'aiStudio.label.cardsPerWord': '語あたりのカード数',
  'aiStudio.label.output': '出力',
  'aiStudio.output.anki': 'Anki',
  'aiStudio.output.csv': 'CSV',
  'aiStudio.meta.ankiProfile': 'Anki プロファイル:',
  'aiStudio.meta.templateNote': {
    other: 'このプリセットにはテンプレートが {count} 件あります — それ以上の枚数はサイクルを繰り返します',
  },

  'aiStudio.section.language': '2 · 言語方向',
  'aiStudio.language.lead':
    'AI カードの表／裏テキストを決めます。プリセットを変えると、そのプロファイルの方向にリセットされます。追加グロスは裏面にだけ言語を足します。',
  'aiStudio.label.frontLang': '表面の言語',
  'aiStudio.label.backLang': '裏面の言語',
  'aiStudio.lang.ja': '日本語',
  'aiStudio.lang.en': '英語',
  'aiStudio.lang.ru': 'ロシア語',
  'aiStudio.lang.zh': '中国語',
  'aiStudio.dirPreset.ja-en': 'JA → EN 認識',
  'aiStudio.dirPreset.ja-ru': 'JA → RU 認識',
  'aiStudio.dirPreset.ja-zh': 'JA → ZH 認識',
  'aiStudio.dirPreset.ja-tri': 'JA → EN+RU+ZH',
  'aiStudio.dirPreset.en-ja': 'EN → JA 産出',
  'aiStudio.dirPreset.ru-ja': 'RU → JA 産出',
  'aiStudio.dirPreset.zh-ja': 'ZH → JA 産出',
  'aiStudio.dirPreset.en-ru': 'EN → RU グロス',
  'aiStudio.dirPreset.ru-en': 'RU → EN グロス',
  'aiStudio.dirPreset.zh-en': 'ZH → EN グロス',
  'aiStudio.label.extraGlosses': '裏面の追加グロス',
  'aiStudio.direction.pair': '{front} → {back}',
  'aiStudio.direction.withExtras': '{front} → {back} + {extras}',

  'aiStudio.log.title': '設定ログ',
  'aiStudio.log.summary.entries': {
    other: '{count} 件',
  },
  'aiStudio.log.summary.empty': 'まだ変更なし',
  'aiStudio.log.lead': 'プリセット、言語、出力、マッピング、生成入力の端末風トレース。',
  'aiStudio.log.clear': 'ログを消去',
  'aiStudio.log.empty': 'スタジオ設定の変更がここに表示されます。',
  'aiStudio.log.field.languageDirection': '言語方向',
  'aiStudio.log.syncedTo': '{front} → {back} に同期（プリセットのプロファイルから）',
  'aiStudio.log.field.preset': 'プリセット',
  'aiStudio.log.field.format': 'カード形式',
  'aiStudio.log.field.front': '表面の言語',
  'aiStudio.log.field.back': '裏面の言語',
  'aiStudio.log.field.reverse': '反転',
  'aiStudio.log.field.gloss': '追加グロス',
  'aiStudio.log.field.cardCount': '語あたりのカード数',
  'aiStudio.log.field.output': '出力',
  'aiStudio.log.field.source': 'ソース',
  'aiStudio.log.field.items': '生成する項目数',
  'aiStudio.log.field.dictWords': '辞書の語',
  'aiStudio.log.field.mapping': 'フィールド: {field}',
  'aiStudio.log.mapping.set': '「{value}」に設定',
  'aiStudio.log.mapping.change': '「{from}」 → 「{to}」',
  'aiStudio.log.field.generate': '生成',
  'aiStudio.log.generateStart': {
    other: '開始 · {count} 項目 × {cards} カード/項目 ≈ {total} カード',
  },
  'aiStudio.log.generateDone': '完了 · {count} 項目から {cards} カード',
  'aiStudio.log.generateError': 'エラー · {message}',
  'aiStudio.log.changeArrow': '{from} → {to}',

  'aiStudio.section.mapping': '3 · Anki フィールド対応',
  'aiStudio.mapping.lead':
    'プロファイル {profile}（プリセットから）· ノートタイプ {model}。カード送信時にこれらのテンプレートで AI 出力を Anki へ振り分けます。',
  'aiStudio.mapping.readingFields': 'ノートタイプのフィールドを読み取り中…',
  'aiStudio.mapping.fieldsErr': 'このノートタイプのフィールドを読めませんでした。',
  'aiStudio.mapping.noFields': 'このプロファイルのノートタイプにフィールドがありません。',

  'aiStudio.section.generate': '4 · カードを生成',
  'aiStudio.generate.chooseAbove': '上でプリセットとカード形式を選んでください。',
  'aiStudio.generate.infoDetail': {
    other: 'プロファイル {profile} · 語あたり {count} カード · {output} 出力 · {direction}',
  },
  'aiStudio.label.source': 'ソース',
  'aiStudio.source.preset': 'プリセットから（AI が語彙を考案）',
  'aiStudio.source.dictionary': '辞書のスターから',
  'aiStudio.label.itemsToGenerate': '生成する項目数',
  'aiStudio.label.dictionaryWords': '辞書の語',
  'aiStudio.starredCount': {
    other: 'スター済み {count}',
  },
  'aiStudio.estimate.preset':
    'AI が語彙項目を {items} 件考案します。各項目が {cards} カードになり → およそ {total} 枚（{items} × {cards}）。',
  'aiStudio.estimate.presetOneCard':
    'AI が語彙項目を {items} 件考案します。各項目が {cards} カードになり → およそ {total} 枚（{items} × {cards}）。',
  'aiStudio.estimate.dictionary': {
    other: '辞書の語 {count} × 各 {cards} カード → およそ {total} カード。',
  },
  'aiStudio.result.approx': {
    other: '結果: およそ {count} カード',
  },
  'aiStudio.hint.starFirst': '先に辞書で語にスターを付けてください',
  'aiStudio.btn.generating': '生成中…',
  'aiStudio.btn.generate': 'カードを生成',
  'aiStudio.btn.sendAnki': 'Anki に送る',
  'aiStudio.btn.saveFlash': 'フラッシュカードに保存',
  'aiStudio.btn.exportCsv': 'CSV を書き出し',

  'aiStudio.generated.title': '生成されたカード',
  'aiStudio.generated.summary': {
    other: '{count} 語から {cards} カード',
  },
  'aiStudio.hint.saveKey': '生成を有効にするには、上で API キーを保存してください。',
  'aiStudio.hint.starOrPreset':
    '辞書で語を調べてスターを付けるか、ソースをプリセット生成に切り替えてください。',

  'aiStudio.status.generatedPreset':
    '{count} 件の考案項目から {cards} カードを生成 · フラッシュカードに {saved} 枚保存。',
  'aiStudio.status.generatedDict':
    '{count} 語から {cards} カードを生成 · フラッシュカードに {saved} 枚保存。',
  'aiStudio.status.csvSaved': 'CSV を {path} に保存しました',
  'aiStudio.status.csvFail': 'CSV を保存できませんでした。',
  'aiStudio.status.sentAnki': '{total} 枚中 {ok} 枚を Anki に送信しました。',
  'aiStudio.status.sentAnkiLocal': '{total} 枚中 {ok} 枚を Anki に送信 · ローカルに {local} 枚保存。',
  'aiStudio.status.savedFlash': {
    other: 'フラッシュカードに {count} 枚保存しました。',
  },

  'aiStudio.preview.cardExample': 'AI カード例',
  'aiStudio.preview.sampleForPreset': '{label} — このプリセットのサンプル',
  'aiStudio.preview.front': '表',
  'aiStudio.preview.back': '裏',
  'aiStudio.preview.emptyFace': '（空）',
  'aiStudio.preview.noTemplate': 'この形式にカードテンプレートがありません。',
  'aiStudio.preview.facesHint':
    '上の面は言語方向適用後のプリセット形式です。Anki 送信時は左のフィールド対応が使われます。',
  'aiStudio.preview.prompt': 'AI プロンプト',
  'aiStudio.preview.mode.invent': '語彙考案モード',
  'aiStudio.preview.mode.enrich': '辞書強化モード',
  'aiStudio.preview.promptHint':
    'プリセット指示、言語方向、プロファイル ID、有効なカードテンプレートから構成されます。',

  'aiStudio.progress.invent': '語彙を考案',
  'aiStudio.progress.enrich': 'カードを作成',
  'aiStudio.progress.done': '完了',
};

const zh = {
  'aiStudio.section.provider': '提供商与 API 密钥',
  'aiStudio.summary.keySaved': '已保存 {provider} 密钥',
  'aiStudio.summary.connect': '连接 Gemini 或 DeepSeek',
  'aiStudio.label.provider': 'AI 提供商',
  'aiStudio.label.apiKey': 'API 密钥',
  'aiStudio.placeholder.replaceKey': '替换已保存的密钥…',
  'aiStudio.placeholder.pasteKey': '粘贴 {provider} 密钥',
  'aiStudio.btn.saveKey': '保存密钥',
  'aiStudio.status.saving': '保存中…',
  'aiStudio.status.pasteKey': '请在上方粘贴 {provider} API 密钥。',
  'aiStudio.status.keySaved': '已保存 {provider} API 密钥。',
  'aiStudio.status.couldNotSaveKey': '无法保存密钥。',

  'aiStudio.section.flowGuide': '这些设置如何关联',
  'aiStudio.summary.flow': '预设 → 语言 → 配置 → Anki 字段',
  'aiStudio.flow.presetTitle': '预设',
  'aiStudio.flow.presetBody':
    '告诉 AI 分析什么（习语细微差别、语法结构、专有名等），并附带默认卡片版式。',
  'aiStudio.flow.languageTitle': '语言方向',
  'aiStudio.flow.languageBody':
    '决定 AI 卡片正反面语言。更换预设时会从预设配置同步——仍可调整额外释义或产出方向。',
  'aiStudio.flow.profileTitle': 'Anki 配置',
  'aiStudio.flow.profileBody':
    '来自预设并控制字段映射。每个预设对应一个配置（例如：语法拆解 → 例句挖掘）。',
  'aiStudio.flow.mappingTitle': '字段映射',
  'aiStudio.flow.mappingBody':
    '把 AI 输出路由到 Anki 笔记字段。像 {expression:ru} 这样的变量标签决定填入哪种译文——与卡片面语言分开。',
  'aiStudio.flow.footer': '右侧面板显示 AI 卡片示例以及发送给模型的完整提示。',

  'aiStudio.section.preset': '1 · 预设与输出',
  'aiStudio.summary.analyzes': 'AI 分析内容',
  'aiStudio.summary.perWord': '{n}/词',
  'aiStudio.label.preset': '预设',
  'aiStudio.optgroup.specialized': '专项',
  'aiStudio.label.cardFormat': '卡片格式',
  'aiStudio.label.cardsPerWord': '每词卡片数',
  'aiStudio.label.output': '输出',
  'aiStudio.output.anki': 'Anki',
  'aiStudio.output.csv': 'CSV',
  'aiStudio.meta.ankiProfile': 'Anki 配置：',
  'aiStudio.meta.templateNote': {
    other: '此预设有 {count} 个模板 — 更高数量会循环重复',
  },

  'aiStudio.section.language': '2 · 语言方向',
  'aiStudio.language.lead':
    '决定 AI 卡片正反面文本。更换预设会重置为该预设配置的方向。额外释义仅增加背面语言。',
  'aiStudio.label.frontLang': '正面语言',
  'aiStudio.label.backLang': '背面语言',
  'aiStudio.lang.ja': '日语',
  'aiStudio.lang.en': '英语',
  'aiStudio.lang.ru': '俄语',
  'aiStudio.lang.zh': '中文',
  'aiStudio.dirPreset.ja-en': 'JA → EN 认读',
  'aiStudio.dirPreset.ja-ru': 'JA → RU 认读',
  'aiStudio.dirPreset.ja-zh': 'JA → ZH 认读',
  'aiStudio.dirPreset.ja-tri': 'JA → EN+RU+ZH',
  'aiStudio.dirPreset.en-ja': 'EN → JA 产出',
  'aiStudio.dirPreset.ru-ja': 'RU → JA 产出',
  'aiStudio.dirPreset.zh-ja': 'ZH → JA 产出',
  'aiStudio.dirPreset.en-ru': 'EN → RU 释义',
  'aiStudio.dirPreset.ru-en': 'RU → EN 释义',
  'aiStudio.dirPreset.zh-en': 'ZH → EN 释义',
  'aiStudio.label.extraGlosses': '背面额外释义',
  'aiStudio.direction.pair': '{front} → {back}',
  'aiStudio.direction.withExtras': '{front} → {back} + {extras}',

  'aiStudio.log.title': '配置日志',
  'aiStudio.log.summary.entries': {
    other: '{count} 条',
  },
  'aiStudio.log.summary.empty': '尚无更改',
  'aiStudio.log.lead': '预设、语言、输出、映射与生成输入的终端式追踪。',
  'aiStudio.log.clear': '清除日志',
  'aiStudio.log.empty': '工作室设置的更改会显示在这里。',
  'aiStudio.log.field.languageDirection': '语言方向',
  'aiStudio.log.syncedTo': '已同步为 {front} → {back}（来自预设配置）',
  'aiStudio.log.field.preset': '预设',
  'aiStudio.log.field.format': '卡片格式',
  'aiStudio.log.field.front': '正面语言',
  'aiStudio.log.field.back': '背面语言',
  'aiStudio.log.field.reverse': '反转',
  'aiStudio.log.field.gloss': '额外释义',
  'aiStudio.log.field.cardCount': '每词卡片数',
  'aiStudio.log.field.output': '输出',
  'aiStudio.log.field.source': '来源',
  'aiStudio.log.field.items': '生成项数',
  'aiStudio.log.field.dictWords': '词典词条',
  'aiStudio.log.field.mapping': '字段：{field}',
  'aiStudio.log.mapping.set': '设为“{value}”',
  'aiStudio.log.mapping.change': '“{from}” → “{to}”',
  'aiStudio.log.field.generate': '生成',
  'aiStudio.log.generateStart': {
    other: '开始 · {count} 项 × {cards} 卡/项 ≈ {total} 卡',
  },
  'aiStudio.log.generateDone': '完成 · 从 {count} 项得到 {cards} 卡',
  'aiStudio.log.generateError': '错误 · {message}',
  'aiStudio.log.changeArrow': '{from} → {to}',

  'aiStudio.section.mapping': '3 · Anki 字段映射',
  'aiStudio.mapping.lead':
    '配置 {profile}（来自预设）· 笔记类型 {model}。发送卡片时，这些模板把 AI 输出路由到 Anki。',
  'aiStudio.mapping.readingFields': '正在读取笔记类型字段…',
  'aiStudio.mapping.fieldsErr': '无法读取此笔记类型的字段。',
  'aiStudio.mapping.noFields': '此配置的笔记类型没有字段。',

  'aiStudio.section.generate': '4 · 生成卡片',
  'aiStudio.generate.chooseAbove': '请先在上方选择预设和卡片格式。',
  'aiStudio.generate.infoDetail': {
    other: '配置 {profile} · 每词 {count} 卡 · {output} 输出 · {direction}',
  },
  'aiStudio.label.source': '来源',
  'aiStudio.source.preset': '来自预设（AI 创造词汇）',
  'aiStudio.source.dictionary': '来自词典星标',
  'aiStudio.label.itemsToGenerate': '生成项数',
  'aiStudio.label.dictionaryWords': '词典词条',
  'aiStudio.starredCount': {
    other: '已加星 {count}',
  },
  'aiStudio.estimate.preset':
    'AI 创造 {items} 个词汇项。每项生成 {cards} 卡 → 约 {total} 张（{items} × {cards}）。',
  'aiStudio.estimate.presetOneCard':
    'AI 创造 {items} 个词汇项。每项生成 {cards} 卡 → 约 {total} 张（{items} × {cards}）。',
  'aiStudio.estimate.dictionary': {
    other: '{count} 个词典词 × 各 {cards} 卡 → 约 {total} 卡。',
  },
  'aiStudio.result.approx': {
    other: '结果：约 {count} 卡',
  },
  'aiStudio.hint.starFirst': '请先在词典中给词加星',
  'aiStudio.btn.generating': '生成中…',
  'aiStudio.btn.generate': '生成卡片',
  'aiStudio.btn.sendAnki': '发送到 Anki',
  'aiStudio.btn.saveFlash': '保存到抽认卡',
  'aiStudio.btn.exportCsv': '导出 CSV',

  'aiStudio.generated.title': '已生成的卡片',
  'aiStudio.generated.summary': {
    other: '来自 {count} 个词的 {cards} 张卡',
  },
  'aiStudio.hint.saveKey': '请先在上方保存 API 密钥以启用生成。',
  'aiStudio.hint.starOrPreset': '打开词典查词并点星标 — 或将来源切换为预设生成。',

  'aiStudio.status.generatedPreset':
    '从 {count} 个创造项生成了 {cards} 张卡 · 已保存 {saved} 张到抽认卡。',
  'aiStudio.status.generatedDict':
    '从 {count} 个词生成了 {cards} 张卡 · 已保存 {saved} 张到抽认卡。',
  'aiStudio.status.csvSaved': 'CSV 已保存到 {path}',
  'aiStudio.status.csvFail': '无法保存 CSV。',
  'aiStudio.status.sentAnki': '已向 Anki 发送 {total} 张中的 {ok} 张。',
  'aiStudio.status.sentAnkiLocal': '已向 Anki 发送 {total} 张中的 {ok} 张 · 本地保存 {local} 张。',
  'aiStudio.status.savedFlash': {
    other: '已保存 {count} 张卡到抽认卡。',
  },

  'aiStudio.preview.cardExample': 'AI 卡片示例',
  'aiStudio.preview.sampleForPreset': '{label} — 此预设的示例内容',
  'aiStudio.preview.front': '正面',
  'aiStudio.preview.back': '背面',
  'aiStudio.preview.emptyFace': '（空）',
  'aiStudio.preview.noTemplate': '此格式没有卡片模板。',
  'aiStudio.preview.facesHint':
    '上方牌面使用应用语言方向后的预设格式。发送到 Anki 时走左侧字段映射。',
  'aiStudio.preview.prompt': 'AI 提示',
  'aiStudio.preview.mode.invent': '创造词汇模式',
  'aiStudio.preview.mode.enrich': '词典增强模式',
  'aiStudio.preview.promptHint': '由预设说明、语言方向、配置 id 和当前卡片模板组成。',

  'aiStudio.progress.invent': '创造词汇',
  'aiStudio.progress.enrich': '构建卡片',
  'aiStudio.progress.done': '完成',
};

const ru = {
  'aiStudio.section.provider': 'Провайдер и API-ключ',
  'aiStudio.summary.keySaved': 'Ключ {provider} сохранён',
  'aiStudio.summary.connect': 'Подключите Gemini или DeepSeek',
  'aiStudio.label.provider': 'AI-провайдер',
  'aiStudio.label.apiKey': 'API-ключ',
  'aiStudio.placeholder.replaceKey': 'Заменить сохранённый ключ…',
  'aiStudio.placeholder.pasteKey': 'Вставьте ключ {provider}',
  'aiStudio.btn.saveKey': 'Сохранить ключ',
  'aiStudio.status.saving': 'Сохранение…',
  'aiStudio.status.pasteKey': 'Вставьте API-ключ {provider} выше.',
  'aiStudio.status.keySaved': 'API-ключ {provider} сохранён.',
  'aiStudio.status.couldNotSaveKey': 'Не удалось сохранить ключ.',

  'aiStudio.section.flowGuide': 'Как связаны эти настройки',
  'aiStudio.summary.flow': 'Пресет → язык → профиль → поля Anki',
  'aiStudio.flow.presetTitle': 'Пресет',
  'aiStudio.flow.presetBody':
    'указывает ИИ, что анализировать (нюансы идиом, грамматику, имена и т.д.), и задаёт макет карточки.',
  'aiStudio.flow.languageTitle': 'Направление языка',
  'aiStudio.flow.languageBody':
    'задаёт языки лица и оборота AI-карточки. При смене пресета синхронизируется с профилем — можно менять для доп. глосс или продакшена.',
  'aiStudio.flow.profileTitle': 'Профиль Anki',
  'aiStudio.flow.profileBody':
    'берётся из пресета и управляет сопоставлением полей. У каждого пресета один профиль (напр. разбор грамматики → майнинг предложений).',
  'aiStudio.flow.mappingTitle': 'Сопоставление полей',
  'aiStudio.flow.mappingBody':
    'направляет вывод ИИ в поля заметки Anki. Теги вроде {expression:ru} выбирают перевод — отдельно от языка лица карточки.',
  'aiStudio.flow.footer': 'Панели справа показывают пример AI-карточки и точный промпт модели.',

  'aiStudio.section.preset': '1 · Пресет и вывод',
  'aiStudio.summary.analyzes': 'Что анализирует ИИ',
  'aiStudio.summary.perWord': '{n}/слово',
  'aiStudio.label.preset': 'Пресет',
  'aiStudio.optgroup.specialized': 'Специализированные',
  'aiStudio.label.cardFormat': 'Формат карточки',
  'aiStudio.label.cardsPerWord': 'Карточек на слово',
  'aiStudio.label.output': 'Вывод',
  'aiStudio.output.anki': 'Anki',
  'aiStudio.output.csv': 'CSV',
  'aiStudio.meta.ankiProfile': 'Профиль Anki:',
  'aiStudio.meta.templateNote': {
    one: 'у этого пресета {count} шаблон — большие числа повторяют цикл',
    few: 'у этого пресета {count} шаблона — большие числа повторяют цикл',
    many: 'у этого пресета {count} шаблонов — большие числа повторяют цикл',
    other: 'у этого пресета {count} шаблонов — большие числа повторяют цикл',
  },

  'aiStudio.section.language': '2 · Направление языка',
  'aiStudio.language.lead':
    'Задаёт текст лица/оборота AI-карточки. Смена пресета сбрасывает направление под его профиль. Доп. глоссы добавляют языки только на оборот.',
  'aiStudio.label.frontLang': 'Язык лица',
  'aiStudio.label.backLang': 'Язык оборота',
  'aiStudio.lang.ja': 'Японский',
  'aiStudio.lang.en': 'Английский',
  'aiStudio.lang.ru': 'Русский',
  'aiStudio.lang.zh': 'Китайский',
  'aiStudio.dirPreset.ja-en': 'JA → EN узнавание',
  'aiStudio.dirPreset.ja-ru': 'JA → RU узнавание',
  'aiStudio.dirPreset.ja-zh': 'JA → ZH узнавание',
  'aiStudio.dirPreset.ja-tri': 'JA → EN+RU+ZH',
  'aiStudio.dirPreset.en-ja': 'EN → JA продакшен',
  'aiStudio.dirPreset.ru-ja': 'RU → JA продакшен',
  'aiStudio.dirPreset.zh-ja': 'ZH → JA продакшен',
  'aiStudio.dirPreset.en-ru': 'EN → RU глосса',
  'aiStudio.dirPreset.ru-en': 'RU → EN глосса',
  'aiStudio.dirPreset.zh-en': 'ZH → EN глосса',
  'aiStudio.label.extraGlosses': 'Доп. глоссы на обороте',
  'aiStudio.direction.pair': '{front} → {back}',
  'aiStudio.direction.withExtras': '{front} → {back} + {extras}',

  'aiStudio.log.title': 'Журнал настроек',
  'aiStudio.log.summary.entries': {
    one: '{count} запись',
    few: '{count} записи',
    many: '{count} записей',
    other: '{count} записей',
  },
  'aiStudio.log.summary.empty': 'Пока нет изменений',
  'aiStudio.log.lead': 'Терминальный след пресета, языка, вывода, сопоставления и параметров генерации.',
  'aiStudio.log.clear': 'Очистить журнал',
  'aiStudio.log.empty': 'Изменения настроек студии появятся здесь.',
  'aiStudio.log.field.languageDirection': 'Направление языка',
  'aiStudio.log.syncedTo': 'Синхронизировано: {front} → {back} (из профиля пресета)',
  'aiStudio.log.field.preset': 'Пресет',
  'aiStudio.log.field.format': 'Формат карточки',
  'aiStudio.log.field.front': 'Язык лица',
  'aiStudio.log.field.back': 'Язык оборота',
  'aiStudio.log.field.reverse': 'Реверс',
  'aiStudio.log.field.gloss': 'Доп. глоссы',
  'aiStudio.log.field.cardCount': 'Карточек на слово',
  'aiStudio.log.field.output': 'Вывод',
  'aiStudio.log.field.source': 'Источник',
  'aiStudio.log.field.items': 'Элементов для генерации',
  'aiStudio.log.field.dictWords': 'Слова словаря',
  'aiStudio.log.field.mapping': 'Поле: {field}',
  'aiStudio.log.mapping.set': 'установлено «{value}»',
  'aiStudio.log.mapping.change': '«{from}» → «{to}»',
  'aiStudio.log.field.generate': 'Генерация',
  'aiStudio.log.generateStart': {
    one: 'Старт · {count} элемент × {cards} карт/эл. ≈ {total} карт',
    few: 'Старт · {count} элемента × {cards} карт/эл. ≈ {total} карт',
    many: 'Старт · {count} элементов × {cards} карт/эл. ≈ {total} карт',
    other: 'Старт · {count} элементов × {cards} карт/эл. ≈ {total} карт',
  },
  'aiStudio.log.generateDone': 'Готово · {cards} карт из {count} элементов',
  'aiStudio.log.generateError': 'Ошибка · {message}',
  'aiStudio.log.changeArrow': '{from} → {to}',

  'aiStudio.section.mapping': '3 · Сопоставление полей Anki',
  'aiStudio.mapping.lead':
    'Профиль {profile} (из пресета) · тип заметки {model}. Эти шаблоны направляют вывод ИИ в Anki при отправке.',
  'aiStudio.mapping.readingFields': 'Чтение полей типа заметки…',
  'aiStudio.mapping.fieldsErr': 'Не удалось прочитать поля этого типа заметки.',
  'aiStudio.mapping.noFields': 'У типа заметки этого профиля нет полей.',

  'aiStudio.section.generate': '4 · Создать карточки',
  'aiStudio.generate.chooseAbove': 'Выберите пресет и формат карточки выше.',
  'aiStudio.generate.infoDetail': {
    one: 'Профиль {profile} · {count} карта на слово · вывод {output} · {direction}',
    few: 'Профиль {profile} · {count} карты на слово · вывод {output} · {direction}',
    many: 'Профиль {profile} · {count} карт на слово · вывод {output} · {direction}',
    other: 'Профиль {profile} · {count} карт на слово · вывод {output} · {direction}',
  },
  'aiStudio.label.source': 'Источник',
  'aiStudio.source.preset': 'Из пресета (ИИ придумывает лексику)',
  'aiStudio.source.dictionary': 'Из избранного словаря',
  'aiStudio.label.itemsToGenerate': 'Элементов для генерации',
  'aiStudio.label.dictionaryWords': 'Слова словаря',
  'aiStudio.starredCount': {
    one: '{count} в избранном',
    few: '{count} в избранном',
    many: '{count} в избранном',
    other: '{count} в избранном',
  },
  'aiStudio.estimate.preset':
    'ИИ придумывает {items} лексических элементов. Каждый даёт {cards} карт → около {total} всего ({items} × {cards}).',
  'aiStudio.estimate.presetOneCard':
    'ИИ придумывает {items} лексических элементов. Каждый даёт {cards} карту → около {total} всего ({items} × {cards}).',
  'aiStudio.estimate.dictionary': {
    one: '{count} слово словаря × по {cards} карт → около {total} карт.',
    few: '{count} слова словаря × по {cards} карт → около {total} карт.',
    many: '{count} слов словаря × по {cards} карт → около {total} карт.',
    other: '{count} слов словаря × по {cards} карт → около {total} карт.',
  },
  'aiStudio.result.approx': {
    one: 'Итог: около {count} карты',
    few: 'Итог: около {count} карт',
    many: 'Итог: около {count} карт',
    other: 'Итог: около {count} карт',
  },
  'aiStudio.hint.starFirst': 'сначала отметьте слова в Словаре',
  'aiStudio.btn.generating': 'Генерация…',
  'aiStudio.btn.generate': 'Создать карточки',
  'aiStudio.btn.sendAnki': 'Отправить в Anki',
  'aiStudio.btn.saveFlash': 'Сохранить во флэш-карточки',
  'aiStudio.btn.exportCsv': 'Экспорт CSV',

  'aiStudio.generated.title': 'Созданные карточки',
  'aiStudio.generated.summary': {
    one: '{cards} карт из {count} слова',
    few: '{cards} карт из {count} слов',
    many: '{cards} карт из {count} слов',
    other: '{cards} карт из {count} слов',
  },
  'aiStudio.hint.saveKey': 'Сохраните API-ключ выше, чтобы включить генерацию.',
  'aiStudio.hint.starOrPreset':
    'Откройте Словарь, найдите слова и нажмите звезду — или переключите источник на пресет.',

  'aiStudio.status.generatedPreset':
    'Создано {cards} карт из {count} придуманных элементов · {saved} сохранено во флэш-карточки.',
  'aiStudio.status.generatedDict':
    'Создано {cards} карт из {count} слов · {saved} сохранено во флэш-карточки.',
  'aiStudio.status.csvSaved': 'CSV сохранён в {path}',
  'aiStudio.status.csvFail': 'Не удалось сохранить CSV.',
  'aiStudio.status.sentAnki': 'Отправлено в Anki {ok} из {total} карт.',
  'aiStudio.status.sentAnkiLocal': 'Отправлено в Anki {ok} из {total} карт · локально сохранено {local}.',
  'aiStudio.status.savedFlash': {
    one: 'Сохранена {count} карта во флэш-карточки.',
    few: 'Сохранены {count} карты во флэш-карточки.',
    many: 'Сохранено {count} карт во флэш-карточки.',
    other: 'Сохранено {count} карт во флэш-карточки.',
  },

  'aiStudio.preview.cardExample': 'Пример AI-карточки',
  'aiStudio.preview.sampleForPreset': '{label} — образец для этого пресета',
  'aiStudio.preview.front': 'Лицо',
  'aiStudio.preview.back': 'Оборот',
  'aiStudio.preview.emptyFace': '(пусто)',
  'aiStudio.preview.noTemplate': 'Для этого формата нет шаблона карточки.',
  'aiStudio.preview.facesHint':
    'Лица выше используют формат пресета после направления языка. Отправка в Anki идёт через сопоставление слева.',
  'aiStudio.preview.prompt': 'AI-промпт',
  'aiStudio.preview.mode.invent': 'Режим изобретения лексики',
  'aiStudio.preview.mode.enrich': 'Режим обогащения словаря',
  'aiStudio.preview.promptHint':
    'Собран из инструкции пресета, направления языка, id профиля и активных шаблонов.',

  'aiStudio.progress.invent': 'Изобретение лексики',
  'aiStudio.progress.enrich': 'Сборка карточек',
  'aiStudio.progress.done': 'Готово',
};

const packs = { en, ja, zh, ru };

const markers = {
  en: "  'flash.csvTool': 'CSV tool',",
  ja: "  'flash.csvTool': 'CSVツール',",
  zh: "  'flash.csvTool': 'CSV 工具',",
  ru: "  'flash.csvTool': 'Инструмент CSV',",
};

const enKeys = Object.keys(en);
for (const lang of ['ja', 'zh', 'ru']) {
  const missing = enKeys.filter((k) => !(k in packs[lang]));
  const extra = Object.keys(packs[lang]).filter((k) => !(k in en));
  if (missing.length || extra.length) {
    console.error(lang, 'missing', missing.length, missing.slice(0, 5), 'extra', extra.length);
    process.exit(1);
  }
}

for (const lang of Object.keys(markers)) {
  const m = markers[lang];
  const i = text.indexOf(m);
  if (i < 0) throw new Error('marker not found for ' + lang);
  text =
    text.slice(0, i + m.length) +
    '\n' +
    formatBlock(lang, packs[lang]) +
    '\n' +
    text.slice(i + m.length);
}

fs.writeFileSync(catalogsPath, text);
console.log('ok', enKeys.length, 'keys × 4 langs');
