const fs = require('fs');
const p = 'src/shared/i18n/catalogs.ts';
let t = fs.readFileSync(p, 'utf8');
if (t.includes("'settings.memory.backupDownloaded'")) {
  console.log('already');
  process.exit(0);
}
const packs = {
  en: {
    'settings.memory.backupDownloaded':
      'Backup downloaded (format {format}) — {count} settings domain(s), including particles, companions, wallpaper, display, and host configs.',
    'settings.memory.backupRestored': 'Backup restored (all settings + host configs) — reloading…',
    'settings.memory.clearDomainTitle': 'Clear settings domain',
    'settings.memory.clearDomainMsg': 'Clear "{label}"? This only removes that settings domain.',
    'settings.memory.clearedLabel': 'Cleared: {label}',
    'settings.memory.factoryTitle': 'Factory reset',
    'settings.memory.factoryMessage':
      'Factory reset: deletes local settings, decks, drafts, caches, and resets mining config, then restarts. Export a backup first. Continue?',
    'settings.memory.inventoryTitle': 'Settings inventory',
    'settings.memory.inventoryDesc':
      'Every settings domain: living layer, appearance, desktop, study, media, and host configs.',
    'settings.memory.quickTitle': 'Quick clear',
    'settings.memory.quickDesc': 'Common wipe actions. Full domain list is above.',
  },
  ja: {
    'settings.memory.backupDownloaded':
      'バックアップをダウンロードしました（形式 {format}）— 設定領域 {count} 件（パーティクル、コンパニオン、壁紙、表示、ホスト設定を含む）。',
    'settings.memory.backupRestored': 'バックアップを復元しました（すべての設定とホスト構成）— 再読み込み中…',
    'settings.memory.clearDomainTitle': '設定領域をクリア',
    'settings.memory.clearDomainMsg': '「{label}」をクリアしますか？その設定領域だけが削除されます。',
    'settings.memory.clearedLabel': 'クリアしました: {label}',
    'settings.memory.factoryTitle': '初期化',
    'settings.memory.factoryMessage':
      '初期化：ローカル設定・デッキ・下書き・キャッシュを削除し、マイニング設定をリセットして再起動します。先にバックアップをエクスポートしてください。続行しますか？',
    'settings.memory.inventoryTitle': '設定一覧',
    'settings.memory.inventoryDesc':
      'すべての設定領域：リビングレイヤー、外観、デスクトップ、学習、メディア、ホスト構成。',
    'settings.memory.quickTitle': 'クイッククリア',
    'settings.memory.quickDesc': 'よく使う削除操作。完全な一覧は上にあります。',
  },
  zh: {
    'settings.memory.backupDownloaded':
      '已下载备份（格式 {format}）— {count} 个设置域，包括粒子、伙伴、壁纸、显示与主机配置。',
    'settings.memory.backupRestored': '已恢复备份（全部设置与主机配置）— 正在重新加载…',
    'settings.memory.clearDomainTitle': '清除设置域',
    'settings.memory.clearDomainMsg': '清除“{label}”？只会删除该设置域。',
    'settings.memory.clearedLabel': '已清除：{label}',
    'settings.memory.factoryTitle': '恢复出厂设置',
    'settings.memory.factoryMessage':
      '恢复出厂设置：删除本地设置、牌组、草稿、缓存并重置挖词配置，然后重启。请先导出备份。继续？',
    'settings.memory.inventoryTitle': '设置清单',
    'settings.memory.inventoryDesc': '每个设置域：动态图层、外观、桌面、学习、媒体与主机配置。',
    'settings.memory.quickTitle': '快速清除',
    'settings.memory.quickDesc': '常用清除操作。完整域列表见上方。',
  },
  ru: {
    'settings.memory.backupDownloaded':
      'Бэкап скачан (формат {format}) — доменов настроек: {count}, включая частицы, компаньонов, обои, экран и host-конфиги.',
    'settings.memory.backupRestored': 'Бэкап восстановлен (все настройки + host) — перезагрузка…',
    'settings.memory.clearDomainTitle': 'Очистить домен настроек',
    'settings.memory.clearDomainMsg': 'Очистить «{label}»? Удалится только этот домен настроек.',
    'settings.memory.clearedLabel': 'Очищено: {label}',
    'settings.memory.factoryTitle': 'Сброс к заводским',
    'settings.memory.factoryMessage':
      'Сброс: удалит локальные настройки, колоды, черновики, кэши и сбросит майнинг, затем перезапустит. Сначала экспортируйте бэкап. Продолжить?',
    'settings.memory.inventoryTitle': 'Список настроек',
    'settings.memory.inventoryDesc':
      'Каждый домен настроек: живой слой, внешний вид, рабочий стол, учёба, медиа и host-конфиги.',
    'settings.memory.quickTitle': 'Быстрая очистка',
    'settings.memory.quickDesc': 'Частые действия очистки. Полный список доменов выше.',
  },
};

function formatBlock(lang, map) {
  const lines = [`  // Settings > Memory dialogs (${lang})`];
  for (const [k, v] of Object.entries(map)) {
    lines.push(`  '${k}': '${String(v).replace(/\\\\/g, '\\\\').replace(/'/g, "\\\\'")}',`);
  }
  // fix - use proper
  return ['  // Settings > Memory dialogs (' + lang + ')']
    .concat(
      Object.entries(map).map(([k, v]) => {
        const esc = String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `  '${k}': '${esc}',`;
      }),
    )
    .join('\n');
}

const markers = {
  en: "  'settings.memory.factoryButton': 'Factory reset',",
  ja: "  'settings.memory.factoryButton': '初期化',",
  zh: "  'settings.memory.factoryButton': '恢复出厂设置',",
  ru: "  'settings.memory.factoryButton': 'Сброс к заводским',",
};

for (const lang of Object.keys(markers)) {
  const tag = `// Settings > Memory dialogs (${lang})`;
  if (t.includes(tag)) continue;
  const m = markers[lang];
  const i = t.indexOf(m);
  if (i < 0) throw new Error(lang);
  t = t.slice(0, i + m.length) + '\n' + formatBlock(lang, packs[lang]) + '\n' + t.slice(i + m.length);
}
fs.writeFileSync(p, t);
console.log('ok');
