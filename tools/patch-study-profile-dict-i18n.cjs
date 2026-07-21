/**
 * Inserts settings.study.profile.*, settings.study.dict.*, and
 * settings.study.level.* (slot/meter chrome) into catalogs.ts (en/ja/zh/ru).
 */
const fs = require('fs');
const path = require('path');

const catalogsPath = path.join(__dirname, '../src/shared/i18n/catalogs.ts');
let text = fs.readFileSync(catalogsPath, 'utf8');

if (text.includes("'settings.study.profile.active'")) {
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
  const lines = [`  // Settings > Study profile / dictionary / level chrome (${lang})`];
  for (const [k, v] of Object.entries(map)) {
    lines.push(formatEntry(k, v));
  }
  return lines.join('\n');
}

const en = {
  // Profile
  'settings.study.profile.active': 'Active profile',
  'settings.study.profile.defaultDesc':
    'Controls card direction, Anki deck binding, and dictionary pipeline for mining.',
  'settings.study.profile.switch': 'Switch profile',
  'settings.study.profile.create': 'Create New Profile',
  'settings.study.profile.delete': 'Delete Profile',
  'settings.study.profile.resetDefaults': 'Reset to defaults',
  'settings.study.profile.deleting': 'Deleting…',
  'settings.study.profile.resetting': 'Resetting…',
  'settings.study.profile.cannotDeleteDefault': 'The default profile cannot be deleted',
  'settings.study.profile.resetTooltip': 'Reset this built-in profile to its defaults',
  'settings.study.profile.deleteTooltip': 'Delete this profile',
  'settings.study.profile.created': 'Profile created.',
  'settings.study.profile.createFailed': 'Could not create the profile.',
  'settings.study.profile.switchFailed': 'Could not switch profile.',
  'settings.study.profile.resetConfirmTitle': 'Reset profile',
  'settings.study.profile.deleteConfirmTitle': 'Delete profile',
  'settings.study.profile.resetConfirmMsg': 'Reset "{label}" to its default configuration?',
  'settings.study.profile.deleteConfirmMsg': 'Delete the profile "{label}"? This can\'t be undone.',
  'settings.study.profile.deleteConfirm': 'Delete',
  'settings.study.profile.resetOk': 'Profile reset to defaults.',
  'settings.study.profile.deletedOk': 'Profile deleted.',
  'settings.study.profile.removeFailed': 'Could not remove the profile.',
  'settings.study.profile.createTitle': 'Create New Profile',
  'settings.study.profile.createDesc': 'Enter a name for the new study profile.',
  'settings.study.profile.nameLabel': 'Profile name',
  'settings.study.profile.namePlaceholder': 'e.g. JLPT N3 Focus',
  'settings.study.profile.creating': 'Creating…',
  'settings.study.profile.createSubmit': 'Create',
  'settings.study.profile.group.jaEn': 'Japanese ↔ English',
  'settings.study.profile.group.enJa': 'English → Japanese',
  'settings.study.profile.group.russian': 'Russian',
  'settings.study.profile.group.chinese': 'Chinese',
  'settings.study.profile.group.specialty': 'Specialty mining',
  'settings.study.profile.group.custom': 'Custom',

  // Dictionary
  'settings.study.dict.intro':
    'Offline Yomitan dictionaries power the reader pop-up and fill {pitch} / {frequency} when mining. Kanjium pitch accents are bundled automatically on first launch (requires internet once). Import a term dictionary for richer offline glossaries; import a frequency list for rank badges. The top dictionary wins when several define the same word — use ↑/↓ to reorder, or the checkbox to switch one off.',
  'settings.study.dict.import': 'Import Yomitan dictionary (.zip)',
  'settings.study.dict.importing': 'Importing…',
  'settings.study.dict.loading': 'Loading dictionaries…',
  'settings.study.dict.empty': 'No dictionaries loaded yet. Bundled pitch seeds on first boot.',
  'settings.study.dict.imported': 'Imported “{title}”.',
  'settings.study.dict.importFailed': 'Import failed.',
  'settings.study.dict.fallbackTitle': 'dictionary',
  'settings.study.dict.removeTitle': 'Remove dictionary',
  'settings.study.dict.removeMsg': 'Remove “{title}” from offline dictionaries?',
  'settings.study.dict.removed': 'Dictionary removed.',
  'settings.study.dict.removeFailed': 'Could not remove the dictionary.',
  'settings.study.dict.updateFailed': 'Could not update the dictionary.',
  'settings.study.dict.reorderFailed': 'Could not reorder the dictionary.',
  'settings.study.dict.langFailed': 'Could not set the dictionary language.',
  'settings.study.dict.useTitle': 'Use this dictionary',
  'settings.study.dict.bundled': 'bundled',
  'settings.study.dict.kind.terms': 'terms',
  'settings.study.dict.kind.pitch': 'pitch',
  'settings.study.dict.kind.frequency': 'frequency',
  'settings.study.dict.kind.metadata': 'metadata',
  'settings.study.dict.kindJoin': ' + ',
  'settings.study.dict.rev': ' · rev {rev}',
  'settings.study.dict.langDetected': ' · language: {langs} (detected)',
  'settings.study.dict.langTitle':
    'Definition language of this dictionary — auto-detected, override if wrong',
  'settings.study.dict.langAuto': 'Auto',
  'settings.study.dict.langAutoWith': 'Auto ({langs})',
  'settings.study.dict.higherPriority': 'Higher priority',
  'settings.study.dict.lowerPriority': 'Lower priority',
  'settings.study.dict.removing': 'Removing…',
  'settings.study.dict.examples.title': 'Offline example sentences',
  'settings.study.dict.examples.intro':
    'Tatoeba examples work online by default. Import the Japanese sentences CSV from tatoeba.org/downloads for offline lookup; the app also caches examples from successful online searches. Optional: re-use the same sentences file plus a links CSV to attach English glosses during import.',
  'settings.study.dict.examples.import': 'Import Tatoeba sentences (CSV)',
  'settings.study.dict.examples.indexed': {
    one: 'Indexed {count} Tatoeba sentence.',
    other: 'Indexed {count} Tatoeba sentences.',
  },
  'settings.study.dict.examples.count': {
    one: '{count} sentence in offline index.',
    other: '{count} sentences in offline index.',
  },
  'settings.study.dict.examples.empty':
    'No offline examples yet — online Tatoeba still works when connected.',

  // Level chrome
  'settings.study.level.langAria': 'Study language',
  'settings.study.level.threshold': 'Counts as reached at {pct}% coverage',
  'settings.study.level.readingDeck': 'Reading deck…',
  'settings.study.level.processing': 'Processing {done}/{total}…',
  'settings.study.level.importFailed': 'Import failed.',
  'settings.study.level.cardsToWords': '{cards} cards → {words} words',
  'settings.study.level.wordsCount': {
    one: '{count} word',
    other: '{count} words',
  },
  'settings.study.level.empty': 'empty',
  'settings.study.level.pasteWords': 'Paste words',
  'settings.study.level.working': 'Working…',
  'settings.study.level.uploadApkg': 'Upload .apkg',
  'settings.study.level.pastePlaceholder':
    "Paste the deck's words — one per line (tab/comma columns are fine)…",
  'settings.study.level.coverage': '{learned}/{total} · {pct}%',
  'settings.study.level.meterLabel': 'Level {level}',
  'settings.study.level.meterAria': 'Level {level} of 7',
};

const ja = {
  'settings.study.profile.active': 'アクティブなプロフィール',
  'settings.study.profile.defaultDesc':
    'カードの方向、Ankiデッキの紐付け、マイニング用の辞書パイプラインを制御します。',
  'settings.study.profile.switch': 'プロフィールを切り替え',
  'settings.study.profile.create': '新しいプロフィールを作成',
  'settings.study.profile.delete': 'プロフィールを削除',
  'settings.study.profile.resetDefaults': '既定にリセット',
  'settings.study.profile.deleting': '削除中…',
  'settings.study.profile.resetting': 'リセット中…',
  'settings.study.profile.cannotDeleteDefault': '既定のプロフィールは削除できません',
  'settings.study.profile.resetTooltip': 'この内蔵プロフィールを既定に戻す',
  'settings.study.profile.deleteTooltip': 'このプロフィールを削除',
  'settings.study.profile.created': 'プロフィールを作成しました。',
  'settings.study.profile.createFailed': 'プロフィールを作成できませんでした。',
  'settings.study.profile.switchFailed': 'プロフィールを切り替えられませんでした。',
  'settings.study.profile.resetConfirmTitle': 'プロフィールをリセット',
  'settings.study.profile.deleteConfirmTitle': 'プロフィールを削除',
  'settings.study.profile.resetConfirmMsg': '「{label}」を既定の設定にリセットしますか？',
  'settings.study.profile.deleteConfirmMsg': 'プロフィール「{label}」を削除しますか？この操作は取り消せません。',
  'settings.study.profile.deleteConfirm': '削除',
  'settings.study.profile.resetOk': 'プロフィールを既定にリセットしました。',
  'settings.study.profile.deletedOk': 'プロフィールを削除しました。',
  'settings.study.profile.removeFailed': 'プロフィールを削除できませんでした。',
  'settings.study.profile.createTitle': '新しいプロフィールを作成',
  'settings.study.profile.createDesc': '新しい学習プロフィールの名前を入力してください。',
  'settings.study.profile.nameLabel': 'プロフィール名',
  'settings.study.profile.namePlaceholder': '例: JLPT N3 集中',
  'settings.study.profile.creating': '作成中…',
  'settings.study.profile.createSubmit': '作成',
  'settings.study.profile.group.jaEn': '日本語 ↔ 英語',
  'settings.study.profile.group.enJa': '英語 → 日本語',
  'settings.study.profile.group.russian': 'ロシア語',
  'settings.study.profile.group.chinese': '中国語',
  'settings.study.profile.group.specialty': '特殊マイニング',
  'settings.study.profile.group.custom': 'カスタム',

  'settings.study.dict.intro':
    'オフラインの Yomitan 辞書はリーダーのポップアップとマイニング時の {pitch} / {frequency} に使われます。Kanjium のピッチアクセントは初回起動時に自動で同梱されます（一度だけネットが必要）。より豊富なオフライン語彙のために用語辞書を、順位バッジのために頻度リストをインポートできます。同じ語に複数の定義がある場合は上の辞書が優先されます — ↑/↓ で並べ替え、チェックボックスでオフにできます。',
  'settings.study.dict.import': 'Yomitan 辞書をインポート（.zip）',
  'settings.study.dict.importing': 'インポート中…',
  'settings.study.dict.loading': '辞書を読み込み中…',
  'settings.study.dict.empty': '辞書がまだありません。初回起動時にピッチが同梱されます。',
  'settings.study.dict.imported': '「{title}」をインポートしました。',
  'settings.study.dict.importFailed': 'インポートに失敗しました。',
  'settings.study.dict.fallbackTitle': '辞書',
  'settings.study.dict.removeTitle': '辞書を削除',
  'settings.study.dict.removeMsg': 'オフライン辞書から「{title}」を削除しますか？',
  'settings.study.dict.removed': '辞書を削除しました。',
  'settings.study.dict.removeFailed': '辞書を削除できませんでした。',
  'settings.study.dict.updateFailed': '辞書を更新できませんでした。',
  'settings.study.dict.reorderFailed': '辞書の並べ替えができませんでした。',
  'settings.study.dict.langFailed': '辞書の言語を設定できませんでした。',
  'settings.study.dict.useTitle': 'この辞書を使う',
  'settings.study.dict.bundled': '同梱',
  'settings.study.dict.kind.terms': '用語',
  'settings.study.dict.kind.pitch': 'ピッチ',
  'settings.study.dict.kind.frequency': '頻度',
  'settings.study.dict.kind.metadata': 'メタデータ',
  'settings.study.dict.kindJoin': ' + ',
  'settings.study.dict.rev': ' · rev {rev}',
  'settings.study.dict.langDetected': ' · 言語: {langs}（検出）',
  'settings.study.dict.langTitle': 'この辞書の定義言語 — 自動検出。違っていれば上書き',
  'settings.study.dict.langAuto': '自動',
  'settings.study.dict.langAutoWith': '自動（{langs}）',
  'settings.study.dict.higherPriority': '優先度を上げる',
  'settings.study.dict.lowerPriority': '優先度を下げる',
  'settings.study.dict.removing': '削除中…',
  'settings.study.dict.examples.title': 'オフライン例文',
  'settings.study.dict.examples.intro':
    'Tatoeba の例文は既定でオンラインです。オフライン照会用に tatoeba.org/downloads から日本語文 CSV をインポートできます。オンライン検索が成功した例文もキャッシュされます。任意: 同じ文ファイルとリンク CSV でインポート時に英語訳を付けられます。',
  'settings.study.dict.examples.import': 'Tatoeba 文をインポート（CSV）',
  'settings.study.dict.examples.indexed': { other: 'Tatoeba の文を {count} 件インデックスしました。' },
  'settings.study.dict.examples.count': { other: 'オフライン索引に {count} 文。' },
  'settings.study.dict.examples.empty':
    'オフライン例文はまだありません — 接続時はオンライン Tatoeba が使えます。',

  'settings.study.level.langAria': '学習言語',
  'settings.study.level.threshold': '{pct}% のカバーで到達とみなす',
  'settings.study.level.readingDeck': 'デッキを読み込み中…',
  'settings.study.level.processing': '処理中 {done}/{total}…',
  'settings.study.level.importFailed': 'インポートに失敗しました。',
  'settings.study.level.cardsToWords': '{cards} 枚 → {words} 語',
  'settings.study.level.wordsCount': { other: '{count} 語' },
  'settings.study.level.empty': '空',
  'settings.study.level.pasteWords': '単語を貼り付け',
  'settings.study.level.working': '処理中…',
  'settings.study.level.uploadApkg': '.apkg をアップロード',
  'settings.study.level.pastePlaceholder':
    'デッキの単語を貼り付け — 1行に1語（タブ／カンマ列も可）…',
  'settings.study.level.coverage': '{learned}/{total} · {pct}%',
  'settings.study.level.meterLabel': 'レベル {level}',
  'settings.study.level.meterAria': 'レベル {level} / 7',
};

const zh = {
  'settings.study.profile.active': '当前档案',
  'settings.study.profile.defaultDesc': '控制卡片方向、Anki 牌组绑定，以及挖词用的词典流水线。',
  'settings.study.profile.switch': '切换档案',
  'settings.study.profile.create': '创建新档案',
  'settings.study.profile.delete': '删除档案',
  'settings.study.profile.resetDefaults': '恢复默认',
  'settings.study.profile.deleting': '删除中…',
  'settings.study.profile.resetting': '重置中…',
  'settings.study.profile.cannotDeleteDefault': '无法删除默认档案',
  'settings.study.profile.resetTooltip': '将此内置档案恢复为默认配置',
  'settings.study.profile.deleteTooltip': '删除此档案',
  'settings.study.profile.created': '已创建档案。',
  'settings.study.profile.createFailed': '无法创建档案。',
  'settings.study.profile.switchFailed': '无法切换档案。',
  'settings.study.profile.resetConfirmTitle': '重置档案',
  'settings.study.profile.deleteConfirmTitle': '删除档案',
  'settings.study.profile.resetConfirmMsg': '将“{label}”重置为默认配置？',
  'settings.study.profile.deleteConfirmMsg': '删除档案“{label}”？此操作无法撤销。',
  'settings.study.profile.deleteConfirm': '删除',
  'settings.study.profile.resetOk': '已将档案重置为默认。',
  'settings.study.profile.deletedOk': '已删除档案。',
  'settings.study.profile.removeFailed': '无法移除档案。',
  'settings.study.profile.createTitle': '创建新档案',
  'settings.study.profile.createDesc': '为新的学习档案输入名称。',
  'settings.study.profile.nameLabel': '档案名称',
  'settings.study.profile.namePlaceholder': '例如 JLPT N3 重点',
  'settings.study.profile.creating': '创建中…',
  'settings.study.profile.createSubmit': '创建',
  'settings.study.profile.group.jaEn': '日语 ↔ 英语',
  'settings.study.profile.group.enJa': '英语 → 日语',
  'settings.study.profile.group.russian': '俄语',
  'settings.study.profile.group.chinese': '中文',
  'settings.study.profile.group.specialty': '专项挖词',
  'settings.study.profile.group.custom': '自定义',

  'settings.study.dict.intro':
    '离线 Yomitan 词典为阅读器弹窗和挖词时的 {pitch} / {frequency} 提供支持。Kanjium 音调在首次启动时自动捆绑（需联网一次）。导入术语词典可丰富离线释义；导入词频表可显示排名徽章。多本词典定义同一词时，排在最上面的优先 — 用 ↑/↓ 排序，或用复选框关闭。',
  'settings.study.dict.import': '导入 Yomitan 词典（.zip）',
  'settings.study.dict.importing': '导入中…',
  'settings.study.dict.loading': '正在加载词典…',
  'settings.study.dict.empty': '尚未加载词典。首次启动会捆绑音调种子。',
  'settings.study.dict.imported': '已导入“{title}”。',
  'settings.study.dict.importFailed': '导入失败。',
  'settings.study.dict.fallbackTitle': '词典',
  'settings.study.dict.removeTitle': '移除词典',
  'settings.study.dict.removeMsg': '从离线词典中移除“{title}”？',
  'settings.study.dict.removed': '已移除词典。',
  'settings.study.dict.removeFailed': '无法移除词典。',
  'settings.study.dict.updateFailed': '无法更新词典。',
  'settings.study.dict.reorderFailed': '无法调整词典顺序。',
  'settings.study.dict.langFailed': '无法设置词典语言。',
  'settings.study.dict.useTitle': '使用此词典',
  'settings.study.dict.bundled': '内置',
  'settings.study.dict.kind.terms': '词条',
  'settings.study.dict.kind.pitch': '音调',
  'settings.study.dict.kind.frequency': '词频',
  'settings.study.dict.kind.metadata': '元数据',
  'settings.study.dict.kindJoin': ' + ',
  'settings.study.dict.rev': ' · rev {rev}',
  'settings.study.dict.langDetected': ' · 语言：{langs}（已检测）',
  'settings.study.dict.langTitle': '此词典的释义语言 — 自动检测，不对可覆盖',
  'settings.study.dict.langAuto': '自动',
  'settings.study.dict.langAutoWith': '自动（{langs}）',
  'settings.study.dict.higherPriority': '提高优先级',
  'settings.study.dict.lowerPriority': '降低优先级',
  'settings.study.dict.removing': '移除中…',
  'settings.study.dict.examples.title': '离线例句',
  'settings.study.dict.examples.intro':
    'Tatoeba 例句默认在线可用。可从 tatoeba.org/downloads 导入日语句子 CSV 以供离线查阅；成功在线搜索的例句也会被缓存。可选：同一句子文件外加链接 CSV，在导入时附上英语释义。',
  'settings.study.dict.examples.import': '导入 Tatoeba 句子（CSV）',
  'settings.study.dict.examples.indexed': { other: '已索引 {count} 条 Tatoeba 句子。' },
  'settings.study.dict.examples.count': { other: '离线索引中有 {count} 条句子。' },
  'settings.study.dict.examples.empty': '尚无离线例句 — 联网时仍可使用在线 Tatoeba。',

  'settings.study.level.langAria': '学习语言',
  'settings.study.level.threshold': '覆盖率达到 {pct}% 即视为已达成',
  'settings.study.level.readingDeck': '正在读取牌组…',
  'settings.study.level.processing': '处理中 {done}/{total}…',
  'settings.study.level.importFailed': '导入失败。',
  'settings.study.level.cardsToWords': '{cards} 张卡片 → {words} 个词',
  'settings.study.level.wordsCount': { other: '{count} 个词' },
  'settings.study.level.empty': '空',
  'settings.study.level.pasteWords': '粘贴单词',
  'settings.study.level.working': '处理中…',
  'settings.study.level.uploadApkg': '上传 .apkg',
  'settings.study.level.pastePlaceholder': '粘贴牌组单词 — 每行一个（也可用制表符/逗号列）…',
  'settings.study.level.coverage': '{learned}/{total} · {pct}%',
  'settings.study.level.meterLabel': '等级 {level}',
  'settings.study.level.meterAria': '等级 {level} / 7',
};

const ru = {
  'settings.study.profile.active': 'Активный профиль',
  'settings.study.profile.defaultDesc':
    'Задаёт направление карточек, привязку колоды Anki и словарь для майнинга.',
  'settings.study.profile.switch': 'Сменить профиль',
  'settings.study.profile.create': 'Создать новый профиль',
  'settings.study.profile.delete': 'Удалить профиль',
  'settings.study.profile.resetDefaults': 'Сбросить до настроек по умолчанию',
  'settings.study.profile.deleting': 'Удаление…',
  'settings.study.profile.resetting': 'Сброс…',
  'settings.study.profile.cannotDeleteDefault': 'Профиль по умолчанию нельзя удалить',
  'settings.study.profile.resetTooltip': 'Сбросить этот встроенный профиль к настройкам по умолчанию',
  'settings.study.profile.deleteTooltip': 'Удалить этот профиль',
  'settings.study.profile.created': 'Профиль создан.',
  'settings.study.profile.createFailed': 'Не удалось создать профиль.',
  'settings.study.profile.switchFailed': 'Не удалось переключить профиль.',
  'settings.study.profile.resetConfirmTitle': 'Сбросить профиль',
  'settings.study.profile.deleteConfirmTitle': 'Удалить профиль',
  'settings.study.profile.resetConfirmMsg': 'Сбросить «{label}» к конфигурации по умолчанию?',
  'settings.study.profile.deleteConfirmMsg': 'Удалить профиль «{label}»? Это нельзя отменить.',
  'settings.study.profile.deleteConfirm': 'Удалить',
  'settings.study.profile.resetOk': 'Профиль сброшен к настройкам по умолчанию.',
  'settings.study.profile.deletedOk': 'Профиль удалён.',
  'settings.study.profile.removeFailed': 'Не удалось удалить профиль.',
  'settings.study.profile.createTitle': 'Создать новый профиль',
  'settings.study.profile.createDesc': 'Введите имя нового учебного профиля.',
  'settings.study.profile.nameLabel': 'Имя профиля',
  'settings.study.profile.namePlaceholder': 'напр. JLPT N3 Focus',
  'settings.study.profile.creating': 'Создание…',
  'settings.study.profile.createSubmit': 'Создать',
  'settings.study.profile.group.jaEn': 'Японский ↔ английский',
  'settings.study.profile.group.enJa': 'Английский → японский',
  'settings.study.profile.group.russian': 'Русский',
  'settings.study.profile.group.chinese': 'Китайский',
  'settings.study.profile.group.specialty': 'Специальный майнинг',
  'settings.study.profile.group.custom': 'Свои',

  'settings.study.dict.intro':
    'Офлайн-словари Yomitan питают всплывашку в читалке и заполняют {pitch} / {frequency} при майнинге. Акценты Kanjium подключаются автоматически при первом запуске (нужен интернет один раз). Импортируйте словарный пакет для офлайн-глосс; список частот — для значков ранга. При нескольких определениях побеждает верхний словарь — переупорядочивайте ↑/↓ или отключайте галочкой.',
  'settings.study.dict.import': 'Импортировать словарь Yomitan (.zip)',
  'settings.study.dict.importing': 'Импорт…',
  'settings.study.dict.loading': 'Загрузка словарей…',
  'settings.study.dict.empty': 'Словари ещё не загружены. Питч-сиды подключаются при первом запуске.',
  'settings.study.dict.imported': 'Импортирован «{title}».',
  'settings.study.dict.importFailed': 'Импорт не удался.',
  'settings.study.dict.fallbackTitle': 'словарь',
  'settings.study.dict.removeTitle': 'Удалить словарь',
  'settings.study.dict.removeMsg': 'Удалить «{title}» из офлайн-словарей?',
  'settings.study.dict.removed': 'Словарь удалён.',
  'settings.study.dict.removeFailed': 'Не удалось удалить словарь.',
  'settings.study.dict.updateFailed': 'Не удалось обновить словарь.',
  'settings.study.dict.reorderFailed': 'Не удалось изменить порядок словарей.',
  'settings.study.dict.langFailed': 'Не удалось задать язык словаря.',
  'settings.study.dict.useTitle': 'Использовать этот словарь',
  'settings.study.dict.bundled': 'встроенный',
  'settings.study.dict.kind.terms': 'термины',
  'settings.study.dict.kind.pitch': 'акцент',
  'settings.study.dict.kind.frequency': 'частота',
  'settings.study.dict.kind.metadata': 'метаданные',
  'settings.study.dict.kindJoin': ' + ',
  'settings.study.dict.rev': ' · rev {rev}',
  'settings.study.dict.langDetected': ' · язык: {langs} (определён)',
  'settings.study.dict.langTitle':
    'Язык определений этого словаря — автоопределение, при ошибке переопределите',
  'settings.study.dict.langAuto': 'Авто',
  'settings.study.dict.langAutoWith': 'Авто ({langs})',
  'settings.study.dict.higherPriority': 'Выше приоритет',
  'settings.study.dict.lowerPriority': 'Ниже приоритет',
  'settings.study.dict.removing': 'Удаление…',
  'settings.study.dict.examples.title': 'Офлайн-примеры предложений',
  'settings.study.dict.examples.intro':
    'Примеры Tatoeba по умолчанию онлайн. Импортируйте CSV японских предложений с tatoeba.org/downloads для офлайн-поиска; удачные онлайн-поиски также кэшируются. По желанию: тот же файл предложений плюс CSV ссылок — чтобы при импорте добавить английские глоссы.',
  'settings.study.dict.examples.import': 'Импортировать предложения Tatoeba (CSV)',
  'settings.study.dict.examples.indexed': {
    one: 'Проиндексировано {count} предложение Tatoeba.',
    few: 'Проиндексировано {count} предложения Tatoeba.',
    many: 'Проиндексировано {count} предложений Tatoeba.',
    other: 'Проиндексировано {count} предложений Tatoeba.',
  },
  'settings.study.dict.examples.count': {
    one: '{count} предложение в офлайн-индексе.',
    few: '{count} предложения в офлайн-индексе.',
    many: '{count} предложений в офлайн-индексе.',
    other: '{count} предложений в офлайн-индексе.',
  },
  'settings.study.dict.examples.empty':
    'Офлайн-примеров пока нет — онлайн Tatoeba работает при подключении.',

  'settings.study.level.langAria': 'Язык обучения',
  'settings.study.level.threshold': 'Считается достигнутым при покрытии {pct}%',
  'settings.study.level.readingDeck': 'Чтение колоды…',
  'settings.study.level.processing': 'Обработка {done}/{total}…',
  'settings.study.level.importFailed': 'Импорт не удался.',
  'settings.study.level.cardsToWords': '{cards} карт → {words} слов',
  'settings.study.level.wordsCount': {
    one: '{count} слово',
    few: '{count} слова',
    many: '{count} слов',
    other: '{count} слова',
  },
  'settings.study.level.empty': 'пусто',
  'settings.study.level.pasteWords': 'Вставить слова',
  'settings.study.level.working': 'Работа…',
  'settings.study.level.uploadApkg': 'Загрузить .apkg',
  'settings.study.level.pastePlaceholder':
    'Вставьте слова колоды — по одному на строку (столбцы с табом/запятой тоже можно)…',
  'settings.study.level.coverage': '{learned}/{total} · {pct}%',
  'settings.study.level.meterLabel': 'Уровень {level}',
  'settings.study.level.meterAria': 'Уровень {level} из 7',
};

const packs = { en, ja, zh, ru };

const markers = {
  en: "  'settings.study.level.desc': 'Fill each JLPT/HSK slot by pasting a deck\\'s words or uploading its Anki .apkg. Your level is computed from how many of those words you already know.',",
  ja: "  'settings.study.level.desc': '各 JLPT/HSK スロットにデッキの単語を貼り付けるか Anki の .apkg を読み込みます。既に知っている単語の数からレベルが計算されます。',",
  zh: "  'settings.study.level.desc': '通过粘贴牌组单词或上传 Anki .apkg 填满各 JLPT/HSK 格子。等级由你已认识的词数计算。',",
  ru: "  'settings.study.level.desc': 'Заполните каждый слот JLPT/HSK, вставив слова колоды или загрузив Anki .apkg. Уровень считается по тому, сколько из этих слов вы уже знаете.',",
};

for (const [lang, marker] of Object.entries(markers)) {
  const tag = `// Settings > Study profile / dictionary / level chrome (${lang})`;
  if (text.includes(tag)) {
    console.log('skip', lang);
    continue;
  }
  const idx = text.indexOf(marker);
  if (idx < 0) throw new Error(`marker missing: ${lang}`);
  const insertAt = idx + marker.length;
  text = text.slice(0, insertAt) + '\n' + formatBlock(lang, packs[lang]) + '\n' + text.slice(insertAt);
}

fs.writeFileSync(catalogsPath, text);
console.log('done', Object.keys(en).length, 'keys × 4 langs');
