/**
 * Step 1 of the function-tag rebuild: flatten every grammar point in
 * src/renderer/data/grammar/*.ts into one JSONL dataset for classification.
 *
 * The data files are plain object literals behind a `import type` + a type
 * annotation, so they eval cleanly as CJS once those two are stripped. That is
 * cheaper and less brittle than pulling in a TS compiler just to read data.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATA_DIR = path.join(__dirname, '..', '..', 'src', 'renderer', 'data', 'grammar');
const OUT = path.join(__dirname, 'points.jsonl');

// Only the files that hold GrammarPoint[] literals — index/types/taxonomy are code.
const SKIP = new Set(['index.ts', 'types.ts', 'taxonomy.ts', 'functions.ts', 'normalize.ts',
  'practiceFilters.ts', 'guides.ts', 'tatoebaExamples.ts', 'hsk.ts']);

function loadPoints(file) {
  const src = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
  const js = src
    .replace(/^import[^;]*;$/gm, '')
    .replace(/export const (\w+)\s*:\s*GrammarPoint\[\]\s*=/g, 'exports.$1 =')
    .replace(/export const (\w+)\s*=/g, 'exports.$1 =');
  const sandbox = { exports: {} };
  vm.runInNewContext(js, sandbox, { filename: file });
  return Object.values(sandbox.exports).filter(Array.isArray).flat();
}

const seen = new Set();
const rows = [];
for (const file of fs.readdirSync(DATA_DIR)) {
  if (!file.endsWith('.ts') || SKIP.has(file)) continue;
  let points;
  try {
    points = loadPoints(file);
  } catch (err) {
    console.error(`  !! ${file}: ${err.message}`);
    continue;
  }
  for (const p of points) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    rows.push({
      id: p.id,
      file,
      level: p.level || '',
      title: p.title || '',
      structure: p.structure || '',
      meaning: p.meaning || '',
      // Explanation often just repeats meaning; keep it only when it adds signal.
      explanation: p.explanation && p.explanation !== p.meaning ? p.explanation : '',
      example: (p.examples && p.examples[0] && p.examples[0].jp) || '',
      current: Array.isArray(p.functions) ? p.functions : [],
    });
  }
  console.log(`  ${file}: ${points.length}`);
}

fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const otherCount = rows.filter((r) => r.current.length === 0 || r.current.every((f) => f === 'other')).length;
console.log(`\ntotal unique points: ${rows.length}`);
console.log(`untagged ('other' or empty): ${otherCount}`);
console.log(`wrote ${OUT}`);
