const fs = require('fs');
const s = fs.readFileSync('src/shared/i18n/catalogs.ts', 'utf8');
const keys = [
  "'grammar.mode.practice': 'Practice'",
  "'grammar.mode.practice': '練習'",
  "'grammar.mode.practice': '练习'",
  "'grammar.mode.practice': 'Практика'",
];
for (const k of keys) console.log(s.includes(k) ? 'ok' : 'MISSING', k);
console.log(
  'mazii',
  fs.readdirSync('src/renderer/data/grammar').filter((f) => /mazii|hsk/.test(f)),
);
