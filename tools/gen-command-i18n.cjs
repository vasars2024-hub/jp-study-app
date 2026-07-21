const fs = require('fs');
const src = fs.readFileSync('src/renderer/keyboardShortcuts.ts', 'utf8');
const start = src.indexOf('export const COMMAND_CATALOG');
const end = src.indexOf('export const SHORTCUT_OPEN_APPS');
const block = src.slice(start, end);
const cats = ['Navigation', 'Reader', 'Manga', 'Dictionary', 'Flashcards', 'Immersion', 'Music', 'Utility', 'Custom'];
const cmds = [];
const re = /id: '([^']+)',\s*\n?\s*label: '((?:\\'|[^'])*)'/g;
let m;
while ((m = re.exec(block))) {
  cmds.push({ id: m[1], label: m[2].replace(/\\'/g, "'") });
}
const lines = ['  // Command palette / keyboard shortcuts (keyboardShortcuts.ts)'];
for (const c of cmds) {
  lines.push(`  'commands.${c.id}': '${c.label.replace(/'/g, "\\'")}',`);
}
for (const cat of cats) {
  lines.push(`  'commands.category.${cat.toLowerCase()}': '${cat}',`);
}
console.log(lines.join('\n'));
console.error('count', cmds.length);
