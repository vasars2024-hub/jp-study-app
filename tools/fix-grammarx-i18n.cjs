#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'catalogs.ts');
let s = fs.readFileSync(p, 'utf8');

// Broken remnant from a bad inject in the Russian catalog.
s = s.replace(
  /  'gramma  'grammar\.mode\.guides':/,
  "  'grammar.mode.guides':",
);

// Ensure Chinese practice key exists after points.
if (!/'grammar\.mode\.practice': '练习'/.test(s)) {
  s = s.replace(
    /  'grammar\.mode\.points': '语法点',\r?\n/,
    "  'grammar.mode.points': '语法点',\n  'grammar.mode.practice': '练习',\n",
  );
}

fs.writeFileSync(p, s);
console.log('fixed catalogs');
