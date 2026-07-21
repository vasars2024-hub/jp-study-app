const fs = require('fs');
const p = 'src/shared/i18n/catalogs.ts';
let t = fs.readFileSync(p, 'utf8');
if (t.includes("'settings.visualizer.enableAria'")) {
  console.log('already');
  process.exit(0);
}
const packs = {
  en: {
    'settings.visualizer.enableAria': 'Enable music visualizer',
    'settings.visualizer.on': 'On',
    'settings.visualizer.off': 'Off',
    'settings.visualizer.label.where': 'Where',
    'settings.visualizer.label.style': 'Style',
    'settings.visualizer.label.reactTo': 'React to',
    'settings.visualizer.label.sensitivity': 'Sensitivity',
    'settings.visualizer.label.detail': 'Detail',
    'settings.visualizer.label.colors': 'Colors',
    'settings.visualizer.mode.wallpaper': 'Wallpaper',
    'settings.visualizer.mode.widget': 'Widget',
    'settings.visualizer.mode.both': 'Both',
    'settings.visualizer.style.spectrum': 'Spectrum',
    'settings.visualizer.style.wave': 'Waveform',
    'settings.visualizer.style.particles': 'Particles',
    'settings.visualizer.freq.full': 'Whole track',
    'settings.visualizer.freq.bass': 'Bass only',
    'settings.visualizer.color.accent': 'Accent',
    'settings.visualizer.color.album': 'Album art',
    'settings.visualizer.color.custom': 'Custom',
    'settings.visualizer.fftTitle': 'FFT size',
    'settings.visualizer.gradStart': 'Gradient start',
    'settings.visualizer.gradEnd': 'Gradient end',
    'settings.visualizer.openViz': 'Open visualizer widget',
    'settings.visualizer.openMusic': 'Open music widget',
    'settings.visualizer.options': 'options',
    'settings.visualizer.lyricsUseAlbum': 'Use album / folder names in lyrics search',
  },
  ja: {
    'settings.visualizer.enableAria': 'ミュージックビジュアライザーを有効にする',
    'settings.visualizer.on': 'オン',
    'settings.visualizer.off': 'オフ',
    'settings.visualizer.label.where': '表示先',
    'settings.visualizer.label.style': 'スタイル',
    'settings.visualizer.label.reactTo': '反応',
    'settings.visualizer.label.sensitivity': '感度',
    'settings.visualizer.label.detail': '詳細',
    'settings.visualizer.label.colors': '色',
    'settings.visualizer.mode.wallpaper': '壁紙',
    'settings.visualizer.mode.widget': 'ウィジェット',
    'settings.visualizer.mode.both': '両方',
    'settings.visualizer.style.spectrum': 'スペクトラム',
    'settings.visualizer.style.wave': '波形',
    'settings.visualizer.style.particles': 'パーティクル',
    'settings.visualizer.freq.full': '曲全体',
    'settings.visualizer.freq.bass': '低音のみ',
    'settings.visualizer.color.accent': 'アクセント',
    'settings.visualizer.color.album': 'アルバムアート',
    'settings.visualizer.color.custom': 'カスタム',
    'settings.visualizer.fftTitle': 'FFT サイズ',
    'settings.visualizer.gradStart': 'グラデーション始点',
    'settings.visualizer.gradEnd': 'グラデーション終点',
    'settings.visualizer.openViz': 'ビジュアライザーウィジェットを開く',
    'settings.visualizer.openMusic': 'ミュージックウィジェットを開く',
    'settings.visualizer.options': 'オプション',
    'settings.visualizer.lyricsUseAlbum': '歌詞検索にアルバム／フォルダ名を使う',
  },
  zh: {
    'settings.visualizer.enableAria': '启用音乐可视化器',
    'settings.visualizer.on': '开',
    'settings.visualizer.off': '关',
    'settings.visualizer.label.where': '位置',
    'settings.visualizer.label.style': '样式',
    'settings.visualizer.label.reactTo': '响应',
    'settings.visualizer.label.sensitivity': '灵敏度',
    'settings.visualizer.label.detail': '细节',
    'settings.visualizer.label.colors': '颜色',
    'settings.visualizer.mode.wallpaper': '壁纸',
    'settings.visualizer.mode.widget': '小组件',
    'settings.visualizer.mode.both': '两者',
    'settings.visualizer.style.spectrum': '频谱',
    'settings.visualizer.style.wave': '波形',
    'settings.visualizer.style.particles': '粒子',
    'settings.visualizer.freq.full': '整首曲目',
    'settings.visualizer.freq.bass': '仅低音',
    'settings.visualizer.color.accent': '强调色',
    'settings.visualizer.color.album': '专辑封面',
    'settings.visualizer.color.custom': '自定义',
    'settings.visualizer.fftTitle': 'FFT 大小',
    'settings.visualizer.gradStart': '渐变起点',
    'settings.visualizer.gradEnd': '渐变终点',
    'settings.visualizer.openViz': '打开可视化器小组件',
    'settings.visualizer.openMusic': '打开音乐小组件',
    'settings.visualizer.options': '选项',
    'settings.visualizer.lyricsUseAlbum': '歌词搜索使用专辑/文件夹名',
  },
  ru: {
    'settings.visualizer.enableAria': 'Включить музыкальный визуализатор',
    'settings.visualizer.on': 'Вкл.',
    'settings.visualizer.off': 'Выкл.',
    'settings.visualizer.label.where': 'Где',
    'settings.visualizer.label.style': 'Стиль',
    'settings.visualizer.label.reactTo': 'Реагировать на',
    'settings.visualizer.label.sensitivity': 'Чувствительность',
    'settings.visualizer.label.detail': 'Детализация',
    'settings.visualizer.label.colors': 'Цвета',
    'settings.visualizer.mode.wallpaper': 'Обои',
    'settings.visualizer.mode.widget': 'Виджет',
    'settings.visualizer.mode.both': 'Оба',
    'settings.visualizer.style.spectrum': 'Спектр',
    'settings.visualizer.style.wave': 'Волна',
    'settings.visualizer.style.particles': 'Частицы',
    'settings.visualizer.freq.full': 'Весь трек',
    'settings.visualizer.freq.bass': 'Только бас',
    'settings.visualizer.color.accent': 'Акцент',
    'settings.visualizer.color.album': 'Обложка',
    'settings.visualizer.color.custom': 'Свой',
    'settings.visualizer.fftTitle': 'Размер FFT',
    'settings.visualizer.gradStart': 'Начало градиента',
    'settings.visualizer.gradEnd': 'Конец градиента',
    'settings.visualizer.openViz': 'Открыть виджет визуализатора',
    'settings.visualizer.openMusic': 'Открыть музыкальный виджет',
    'settings.visualizer.options': 'параметры',
    'settings.visualizer.lyricsUseAlbum': 'Использовать альбом / папку в поиске текстов',
  },
};

function formatBlock(lang, map) {
  return ['  // Settings > Visualizer (' + lang + ')']
    .concat(
      Object.entries(map).map(([k, v]) => {
        const esc = String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `  '${k}': '${esc}',`;
      }),
    )
    .join('\n');
}

const markers = {
  en: "  'settings.memory.quickDesc': 'Common wipe actions. Full domain list is above.',",
  ja: "  'settings.memory.quickDesc': 'よく使う削除操作。完全な一覧は上にあります。',",
  zh: "  'settings.memory.quickDesc': '常用清除操作。完整域列表见上方。',",
  ru: "  'settings.memory.quickDesc': 'Частые действия очистки. Полный список доменов выше.',",
};

for (const lang of Object.keys(markers)) {
  const tag = `// Settings > Visualizer (${lang})`;
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
