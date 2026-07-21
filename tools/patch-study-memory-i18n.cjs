const fs = require('fs');
const p = 'src/shared/i18n/catalogs.ts';
let t = fs.readFileSync(p, 'utf8');
if (t.includes("'settings.study.level.title'")) {
  console.log('already');
  process.exit(0);
}

const packs = {
  en: {
    'settings.study.level.title': 'Level',
    'settings.study.level.desc':
      "Fill each JLPT/HSK slot by pasting a deck's words or uploading its Anki .apkg. Your level is computed from how many of those words you already know.",
    'settings.transcription.gpuTitle': 'Use the GPU when available — much faster',
    'settings.transcription.cpuTitle': 'Force CPU — slower but works without a GPU',
    // Memory
    'settings.memory.refresh': 'Refresh',
    'settings.memory.ram': 'RAM',
    'settings.memory.usedOf': '{used} used of {total} · {pct}%',
    'settings.memory.cpuLoad': 'CPU load {pct}%',
    'settings.memory.uptime': 'Uptime {uptime}',
    'settings.memory.sysUnavailable': 'System metrics unavailable.',
    'settings.memory.quota': 'Quota',
    'settings.memory.storageUnavailable': 'Storage estimate unavailable.',
    'settings.memory.catalogSummary':
      'Settings catalog ≈ {bytes} across {count} active domains (particles, companions, wallpaper, display, study, host…).',
    'settings.memory.catalogSummaryOne':
      'Settings catalog ≈ {bytes} across {count} active domain (particles, companions, wallpaper, display, study, host…).',
    'settings.memory.livingLayer': 'Living layer',
    'settings.memory.inventoryFail': 'Could not read settings inventory.',
    'settings.memory.filterPlaceholder': 'Filter domains…',
    'settings.memory.filterAria': 'Filter settings domains',
    'settings.memory.col.settings': 'Settings',
    'settings.memory.col.category': 'Category',
    'settings.memory.col.where': 'Where',
    'settings.memory.col.size': 'Size',
    'settings.memory.col.detail': 'Detail',
    'settings.memory.tier.host': 'Host',
    'settings.memory.tier.durable': 'Durable',
    'settings.memory.tier.mixed': 'Mixed',
    'settings.memory.tier.local': 'Local',
    'settings.memory.noMatches': 'No matching domains.',
    'settings.memory.inventoryFailed': 'Inventory failed to load.',
    'settings.memory.clear': 'Clear',
    'settings.memory.inventoryHint':
      'Living layer includes particles (density / intensity / size), companions, buddy routines, wallpaper playlists, and lighting — export captures them all.',
    'settings.memory.backupHint':
      'Full backup (format 2): localStorage, IndexedDB, mining presets, AI config, desktop layout, and study profiles. Wallpaper image files on disk are not embedded — only layout references and living-layer playlists.',
    'settings.memory.exportAll': 'Export all settings',
    'settings.memory.importBackup': 'Import backup…',
    'settings.memory.quick.environment': 'Reset living layer',
    'settings.memory.quick.flashcards': 'Clear flashcards',
    'settings.memory.quick.clipboard': 'Clear clipboard',
    'settings.memory.quick.lyrics': 'Clear lyrics cache',
    'settings.memory.quick.lookups': 'Clear lookups',
    'settings.memory.quick.mining': 'Reset mining presets',
    'settings.memory.cleared': 'Cleared {label}',
    'settings.memory.factoryButton': 'Factory reset',
  },
  ja: {
    'settings.study.level.title': 'レベル',
    'settings.study.level.desc':
      '各 JLPT/HSK スロットにデッキの単語を貼り付けるか Anki の .apkg を読み込みます。既に知っている単語の数からレベルが計算されます。',
    'settings.transcription.gpuTitle': '利用可能な場合は GPU を使用（かなり高速）',
    'settings.transcription.cpuTitle': 'CPU を強制 — 遅いですが GPU なしでも動作',
    'settings.memory.refresh': '更新',
    'settings.memory.ram': 'RAM',
    'settings.memory.usedOf': '{used} / {total} 使用 · {pct}%',
    'settings.memory.cpuLoad': 'CPU 負荷 {pct}%',
    'settings.memory.uptime': '稼働時間 {uptime}',
    'settings.memory.sysUnavailable': 'システム情報を取得できません。',
    'settings.memory.quota': '割当',
    'settings.memory.storageUnavailable': 'ストレージ見積もりを取得できません。',
    'settings.memory.catalogSummary':
      '設定カタログ ≈ {bytes}（{count} 個のアクティブな領域：パーティクル、コンパニオン、壁紙、表示、学習、ホスト…）',
    'settings.memory.catalogSummaryOne':
      '設定カタログ ≈ {bytes}（{count} 個のアクティブな領域：パーティクル、コンパニオン、壁紙、表示、学習、ホスト…）',
    'settings.memory.livingLayer': 'リビングレイヤー',
    'settings.memory.inventoryFail': '設定一覧を読めませんでした。',
    'settings.memory.filterPlaceholder': '領域を絞り込み…',
    'settings.memory.filterAria': '設定領域を絞り込み',
    'settings.memory.col.settings': '設定',
    'settings.memory.col.category': 'カテゴリ',
    'settings.memory.col.where': '保存先',
    'settings.memory.col.size': 'サイズ',
    'settings.memory.col.detail': '詳細',
    'settings.memory.tier.host': 'ホスト',
    'settings.memory.tier.durable': '永続',
    'settings.memory.tier.mixed': '混合',
    'settings.memory.tier.local': 'ローカル',
    'settings.memory.noMatches': '一致する領域がありません。',
    'settings.memory.inventoryFailed': '一覧の読み込みに失敗しました。',
    'settings.memory.clear': 'クリア',
    'settings.memory.inventoryHint':
      'リビングレイヤーにはパーティクル（密度／強さ／サイズ）、コンパニオン、バディルーチン、壁紙プレイリスト、照明が含まれ、エクスポートですべて保存されます。',
    'settings.memory.backupHint':
      '完全バックアップ（形式 2）：localStorage、IndexedDB、マイニングプリセット、AI 設定、デスクトップレイアウト、学習プロフィール。ディスク上の壁紙画像は埋め込まれません。',
    'settings.memory.exportAll': 'すべての設定をエクスポート',
    'settings.memory.importBackup': 'バックアップをインポート…',
    'settings.memory.quick.environment': 'リビングレイヤーをリセット',
    'settings.memory.quick.flashcards': 'フラッシュカードをクリア',
    'settings.memory.quick.clipboard': 'クリップボードをクリア',
    'settings.memory.quick.lyrics': '歌詞キャッシュをクリア',
    'settings.memory.quick.lookups': '検索履歴をクリア',
    'settings.memory.quick.mining': 'マイニングプリセットをリセット',
    'settings.memory.cleared': '{label} をクリアしました',
    'settings.memory.factoryButton': '初期化',
  },
  zh: {
    'settings.study.level.title': '等级',
    'settings.study.level.desc':
      '通过粘贴牌组单词或上传 Anki .apkg 填满各 JLPT/HSK 格子。等级由你已认识的词数计算。',
    'settings.transcription.gpuTitle': '有 GPU 时使用 GPU — 快得多',
    'settings.transcription.cpuTitle': '强制 CPU — 较慢但无需 GPU',
    'settings.memory.refresh': '刷新',
    'settings.memory.ram': '内存',
    'settings.memory.usedOf': '已用 {used} / {total} · {pct}%',
    'settings.memory.cpuLoad': 'CPU 负载 {pct}%',
    'settings.memory.uptime': '运行时间 {uptime}',
    'settings.memory.sysUnavailable': '无法获取系统指标。',
    'settings.memory.quota': '配额',
    'settings.memory.storageUnavailable': '无法估算存储。',
    'settings.memory.catalogSummary':
      '设置目录 ≈ {bytes}，覆盖 {count} 个活动域（粒子、伙伴、壁纸、显示、学习、主机…）',
    'settings.memory.catalogSummaryOne':
      '设置目录 ≈ {bytes}，覆盖 {count} 个活动域（粒子、伙伴、壁纸、显示、学习、主机…）',
    'settings.memory.livingLayer': '动态图层',
    'settings.memory.inventoryFail': '无法读取设置清单。',
    'settings.memory.filterPlaceholder': '筛选域…',
    'settings.memory.filterAria': '筛选设置域',
    'settings.memory.col.settings': '设置',
    'settings.memory.col.category': '分类',
    'settings.memory.col.where': '位置',
    'settings.memory.col.size': '大小',
    'settings.memory.col.detail': '详情',
    'settings.memory.tier.host': '主机',
    'settings.memory.tier.durable': '持久',
    'settings.memory.tier.mixed': '混合',
    'settings.memory.tier.local': '本地',
    'settings.memory.noMatches': '没有匹配的域。',
    'settings.memory.inventoryFailed': '清单加载失败。',
    'settings.memory.clear': '清除',
    'settings.memory.inventoryHint':
      '动态图层包括粒子（密度/强度/大小）、伙伴、例程、壁纸播放列表与光照 — 导出时全部包含。',
    'settings.memory.backupHint':
      '完整备份（格式 2）：localStorage、IndexedDB、挖词预设、AI 配置、桌面布局与学习配置文件。磁盘上的壁纸图片不会嵌入。',
    'settings.memory.exportAll': '导出所有设置',
    'settings.memory.importBackup': '导入备份…',
    'settings.memory.quick.environment': '重置动态图层',
    'settings.memory.quick.flashcards': '清除闪卡',
    'settings.memory.quick.clipboard': '清除剪贴板',
    'settings.memory.quick.lyrics': '清除歌词缓存',
    'settings.memory.quick.lookups': '清除查词记录',
    'settings.memory.quick.mining': '重置挖词预设',
    'settings.memory.cleared': '已清除 {label}',
    'settings.memory.factoryButton': '恢复出厂设置',
  },
  ru: {
    'settings.study.level.title': 'Уровень',
    'settings.study.level.desc':
      'Заполните каждый слот JLPT/HSK, вставив слова колоды или загрузив Anki .apkg. Уровень считается по тому, сколько из этих слов вы уже знаете.',
    'settings.transcription.gpuTitle': 'Использовать GPU, если доступен — намного быстрее',
    'settings.transcription.cpuTitle': 'Принудительно CPU — медленнее, но без GPU',
    'settings.memory.refresh': 'Обновить',
    'settings.memory.ram': 'ОЗУ',
    'settings.memory.usedOf': '{used} из {total} · {pct}%',
    'settings.memory.cpuLoad': 'Нагрузка CPU {pct}%',
    'settings.memory.uptime': 'Аптайм {uptime}',
    'settings.memory.sysUnavailable': 'Системные метрики недоступны.',
    'settings.memory.quota': 'Квота',
    'settings.memory.storageUnavailable': 'Оценка хранилища недоступна.',
    'settings.memory.catalogSummary':
      'Каталог настроек ≈ {bytes} в {count} активных доменах (частицы, компаньоны, обои, экран, учёба, host…).',
    'settings.memory.catalogSummaryOne':
      'Каталог настроек ≈ {bytes} в {count} активном домене (частицы, компаньоны, обои, экран, учёба, host…).',
    'settings.memory.livingLayer': 'Живой слой',
    'settings.memory.inventoryFail': 'Не удалось прочитать список настроек.',
    'settings.memory.filterPlaceholder': 'Фильтр доменов…',
    'settings.memory.filterAria': 'Фильтр доменов настроек',
    'settings.memory.col.settings': 'Настройки',
    'settings.memory.col.category': 'Категория',
    'settings.memory.col.where': 'Где',
    'settings.memory.col.size': 'Размер',
    'settings.memory.col.detail': 'Подробности',
    'settings.memory.tier.host': 'Host',
    'settings.memory.tier.durable': 'Долговечные',
    'settings.memory.tier.mixed': 'Смешанные',
    'settings.memory.tier.local': 'Локальные',
    'settings.memory.noMatches': 'Нет подходящих доменов.',
    'settings.memory.inventoryFailed': 'Не удалось загрузить список.',
    'settings.memory.clear': 'Очистить',
    'settings.memory.inventoryHint':
      'Живой слой включает частицы (плотность / интенсивность / размер), компаньонов, рутины buddy, плейлисты обоев и освещение — экспорт захватывает всё.',
    'settings.memory.backupHint':
      'Полный бэкап (формат 2): localStorage, IndexedDB, пресеты майнинга, AI, макет рабочего стола и учебные профили. Файлы обоев на диске не встраиваются.',
    'settings.memory.exportAll': 'Экспортировать все настройки',
    'settings.memory.importBackup': 'Импортировать бэкап…',
    'settings.memory.quick.environment': 'Сбросить живой слой',
    'settings.memory.quick.flashcards': 'Очистить карточки',
    'settings.memory.quick.clipboard': 'Очистить буфер обмена',
    'settings.memory.quick.lyrics': 'Очистить кэш текстов',
    'settings.memory.quick.lookups': 'Очистить поиски',
    'settings.memory.quick.mining': 'Сбросить пресеты майнинга',
    'settings.memory.cleared': 'Очищено: {label}',
    'settings.memory.factoryButton': 'Сброс к заводским',
  },
};

function fmt(lang, map) {
  const lines = [`  // Settings > Study wrappers + Memory (${lang})`];
  for (const [k, v] of Object.entries(map)) {
    lines.push(`  '${k}': '${String(v).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'")}',`);
  }
  return lines.join('\n');
}

// Fix escaping - use proper escape
function formatBlock(lang, map) {
  const lines = [`  // Settings > Study wrappers + Memory (${lang})`];
  for (const [k, v] of Object.entries(map)) {
    const esc = String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    lines.push(`  '${k}': '${esc}',`);
  }
  return lines.join('\n');
}

const markers = {
  en: "  'settings.lock.tint.moss': 'Moss',",
  ja: "  'settings.lock.tint.moss': 'モス',",
  zh: "  'settings.lock.tint.moss': '苔藓',",
  ru: "  'settings.lock.tint.moss': 'Мшистый',",
};

for (const lang of Object.keys(markers)) {
  const tag = `// Settings > Study wrappers + Memory (${lang})`;
  if (t.includes(tag)) {
    console.log('skip', lang);
    continue;
  }
  const m = markers[lang];
  const i = t.indexOf(m);
  if (i < 0) throw new Error('marker ' + lang);
  t = t.slice(0, i + m.length) + '\n' + formatBlock(lang, packs[lang]) + '\n' + t.slice(i + m.length);
}
fs.writeFileSync(p, t);
console.log('ok');
