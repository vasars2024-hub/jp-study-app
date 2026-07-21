const fs = require('fs');
const p = 'src/shared/i18n/catalogs.ts';
let t = fs.readFileSync(p, 'utf8');
if (t.includes("'settings.desktop.size.small'")) {
  console.log('already present');
  process.exit(0);
}
const inserts = {
  en: [
    "  'settings.desktop.size.small': 'Small',",
    "  'settings.desktop.size.medium': 'Medium',",
    "  'settings.desktop.size.large': 'Large',",
    "  'settings.desktop.taskbar.compact': 'Compact',",
    "  'settings.desktop.taskbar.normal': 'Normal',",
    "  'settings.desktop.taskbar.large': 'Large',",
  ].join('\n'),
  ja: [
    "  'settings.desktop.size.small': '小',",
    "  'settings.desktop.size.medium': '中',",
    "  'settings.desktop.size.large': '大',",
    "  'settings.desktop.taskbar.compact': 'コンパクト',",
    "  'settings.desktop.taskbar.normal': '標準',",
    "  'settings.desktop.taskbar.large': '大',",
  ].join('\n'),
  zh: [
    "  'settings.desktop.size.small': '小',",
    "  'settings.desktop.size.medium': '中',",
    "  'settings.desktop.size.large': '大',",
    "  'settings.desktop.taskbar.compact': '紧凑',",
    "  'settings.desktop.taskbar.normal': '标准',",
    "  'settings.desktop.taskbar.large': '大',",
  ].join('\n'),
  ru: [
    "  'settings.desktop.size.small': 'Маленький',",
    "  'settings.desktop.size.medium': 'Средний',",
    "  'settings.desktop.size.large': 'Крупный',",
    "  'settings.desktop.taskbar.compact': 'Компактный',",
    "  'settings.desktop.taskbar.normal': 'Обычный',",
    "  'settings.desktop.taskbar.large': 'Крупный',",
  ].join('\n'),
};
const markers = {
  en: "  'settings.desktop.label.size': 'Size',",
  ja: "  'settings.desktop.label.size': 'サイズ',",
  zh: "  'settings.desktop.label.size': '大小',",
  ru: "  'settings.desktop.label.size': 'Размер',",
};
for (const lang of Object.keys(markers)) {
  const m = markers[lang];
  const i = t.indexOf(m);
  if (i < 0) throw new Error('missing ' + lang);
  t = t.slice(0, i + m.length) + '\n' + inserts[lang] + t.slice(i + m.length);
}
fs.writeFileSync(p, t);
console.log('ok');
