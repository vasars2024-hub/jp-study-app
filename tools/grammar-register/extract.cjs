/**
 * Step 1 of the register pass: collect the points whose register nothing has
 * ever examined.
 *
 * Deliberately *not* every point. The morphology tables in normalize.ts already
 * decide a few hundred records from the pattern itself, and a rule reading the
 * pattern is better evidence than a model reading the gloss — so those are
 * skipped rather than re-litigated. What is left is the tail the rules cannot
 * reach, which is exactly the set worth spending review effort on.
 *
 *   node tools/grammar-register/extract.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'src', 'renderer', 'data', 'grammar');
const OUT = path.join(__dirname, 'points.jsonl');

// Only the files that hold GrammarPoint[] literals — the rest is code.
const SKIP = new Set([
  'index.ts',
  'types.ts',
  'taxonomy.ts',
  'functions.ts',
  'normalize.ts',
  'practiceFilters.ts',
  'guides.ts',
  'tatoebaExamples.ts',
]);

/**
 * Load the real `deriveRegister`, rather than reimplementing the tables here.
 * Two copies of this logic would drift, and the drift would be invisible: the
 * prompt files would quietly ask about points the app had already decided.
 */
function loadNormalize() {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [path.join(DATA_DIR, 'normalize.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, { module: mod, exports: mod.exports, require });
  return mod.exports;
}

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

const { deriveRegister } = loadNormalize();

const seen = new Set();
const rows = [];
let skippedDerived = 0;
let skippedAuthored = 0;

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

    const lang = p.lang || (String(p.level).startsWith('HSK') ? 'zh' : 'ja');

    // A rule already decided this one from the morphology. Leave it alone.
    if (deriveRegister(lang, p.title || '', p.structure)) {
      skippedDerived += 1;
      continue;
    }
    // Already hand-labelled and previously reviewed.
    if (p.provenance && p.provenance.registerSource === 'classified') {
      skippedAuthored += 1;
      continue;
    }

    rows.push({
      id: p.id,
      file,
      lang,
      level: p.level || '',
      title: p.title || '',
      structure: p.structure || '',
      meaning: p.meaning || '',
      explanation: p.explanation && p.explanation !== p.meaning ? p.explanation : '',
      example: (p.examples && p.examples[0] && p.examples[0].jp) || '',
    });
  }
}

fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

console.log(`needing classification: ${rows.length}`);
console.log(`already decided by a morphology rule: ${skippedDerived}`);
console.log(`already classified in a previous pass: ${skippedAuthored}`);
console.log(`wrote ${OUT}`);
