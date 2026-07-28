// Static import-closure measurer for the pinned seanime-web tree.
//
// Rewritten this session: the Phase-2 copy lived in a session scratchpad and is gone.
// Resolves `@/` -> seanime-web/src, follows relative + alias imports, counts local
// files and distinct bare npm specifiers. `CUT=a,b` treats matching files as leaves
// (imported, but their own imports are not followed) — that is how the Phase-2
// media-preview-modal stub was modelled.
//
// usage: node import-graph.mjs <entry-rel-path> [CUT=substr,substr]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/Arseniy/Projects/seanime-upstream/seanime-web/src';
const entries = [];
let cuts = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith('CUT=')) cuts = a.slice(4).split(',').filter(Boolean);
  else entries.push(a);
}
if (!entries.length) throw new Error('need at least one entry path relative to src/');

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css'];

function resolveFile(p) {
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  for (const e of EXTS) if (fs.existsSync(p + e)) return p + e;
  for (const e of EXTS) {
    const idx = path.join(p, 'index' + e);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

// Strip comments and strings so specifiers inside them are not counted.
const IMPORT_RE =
  /(?:^|[\s;}])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const localFiles = new Set();
const packages = new Set();
const unresolved = new Set();
const cutHits = new Set();
const queue = [];

for (const e of entries) {
  const f = resolveFile(path.join(ROOT, e));
  if (!f) throw new Error(`entry not found: ${e}`);
  queue.push(f);
  localFiles.add(f);
}

const isCut = (f) => cuts.some((c) => f.replace(/\\/g, '/').includes(c));

while (queue.length) {
  const file = queue.pop();
  if (isCut(file)) {
    cutHits.add(file);
    continue; // counted as a file, but its subtree is not followed
  }
  if (/\.(css|json)$/.test(file)) continue;

  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  // remove block/line comments (crude but adequate for import scanning)
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;

    let target = null;
    if (spec.startsWith('@/')) target = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith('.')) target = path.join(path.dirname(file), spec);
    else {
      // bare specifier -> npm package (scoped names keep two segments)
      const parts = spec.split('/');
      packages.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
      continue;
    }

    const resolved = resolveFile(target);
    if (!resolved) {
      unresolved.add(spec);
      continue;
    }
    if (!localFiles.has(resolved)) {
      localFiles.add(resolved);
      queue.push(resolved);
    }
  }
}

const pkgs = [...packages].sort();
console.log(`entry        : ${entries.join(', ')}`);
console.log(`cuts         : ${cuts.length ? cuts.join(', ') : '(none)'}${cutHits.size ? ` -> ${cutHits.size} file(s) cut` : ''}`);
console.log(`local files  : ${localFiles.size}`);
console.log(`npm packages : ${pkgs.length}`);
console.log(pkgs.join('\n'));
if (unresolved.size) console.log(`\nunresolved (${unresolved.size}): ${[...unresolved].join(', ')}`);

if (process.env.LIST_FILES) {
  console.log('\n--- files ---');
  console.log([...localFiles].map((f) => path.relative(ROOT, f).replace(/\\/g, '/')).sort().join('\n'));
}
