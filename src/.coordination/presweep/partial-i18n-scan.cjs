/** Read-only lead list for untranslated text in components that already call t(). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const dirs = ['renderer', 'media'].map((dir) => path.join(root, 'src', dir));
const attrs = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
const props = new Set(['label', 'hint', 'description']);
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!['__tests__', '__devharness__', 'blanc'].includes(entry.name)) walk(path.join(dir, entry.name));
    } else if (entry.name.endsWith('.tsx')) files.push(path.join(dir, entry.name));
  }
}
for (const dir of dirs) walk(dir);

function looksLikeUi(value) {
  const text = value.trim();
  return text.length > 2 && /[A-Za-z\p{L}]{2}/u.test(text) &&
    !/^(?:https?:\/\/|[a-z][a-z0-9_-]*$)/.test(text) &&
    !/^(?:[A-Z]{2,4}\s?\d*|Ctrl\s?[A-Z])$/.test(text);
}

const results = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/\buseT\s*\(|\bt\s*\(\s*['"`]/.test(source)) continue;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits = [];
  function add(node, value, kind) {
    if (!looksLikeUi(value)) return;
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    hits.push({ line, kind, text: value.trim() });
  }
  function visit(node) {
    if (ts.isJsxText(node)) add(node, node.text, 'text');
    if (ts.isJsxAttribute(node) && attrs.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
      add(node, node.initializer.text, node.name.text);
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && props.has(node.name.text) && ts.isStringLiteral(node.initializer)) {
      add(node, node.initializer.text, node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (hits.length) results.push({ file: path.relative(root, file).replace(/\\/g, '/'), hits });
}
results.sort((a, b) => b.hits.length - a.hits.length);
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else {
  console.log(`${results.length} files, ${results.reduce((n, item) => n + item.hits.length, 0)} leads`);
  for (const item of results) {
    console.log(`${item.file}: ${item.hits.length}`);
    for (const hit of item.hits) console.log(`  ${hit.line} ${hit.kind}: ${hit.text}`);
  }
}
